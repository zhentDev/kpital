"""Autonomous Local Dev Supervisor (Watchdog & Auto-Healer).

Runs frontend ('bun dev') and backend ('uvicorn main:app --port 8000 --reload')
in parallel, monitors console output for errors, and automatically prompts
local LLMs (Qwen Coder / DeepSeek via model_router) to fix the code in real-time.
"""

import ast
import json
import os
import re
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

# Configure UTF-8 for Windows console
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# Add project root to path to import model_router
ROOT_DIR = Path(__file__).resolve().parent
sys.path.append(str(ROOT_DIR))

try:
    from model_router import query_local_model
except ImportError:
    print("[ERROR] Could not import query_local_model from model_router.py")
    sys.exit(1)

FRONTEND_DIR = ROOT_DIR / "frontend"
BACKEND_DIR = ROOT_DIR / "backend"

# ANSI Colors for terminal output
CYAN = "\033[96m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
BOLD = "\033[1m"
RESET = "\033[0m"

# Track cooldowns to prevent fixing the same file in rapid succession
last_fix_time: dict[str, float] = {}
fix_lock = threading.Lock()


def find_frontend_file_from_error(error_text: str) -> Path | None:
    """Scan error text for referenced frontend source files (.jsx, .tsx, .js, .ts, .css)."""
    matches = re.findall(
        r"(?:src[/\\][a-zA-Z0-9_\-/\\]+\.(?:jsx?|tsx?|css))", error_text
    )
    if matches:
        rel_path = matches[-1].replace("\\", "/")
        target = FRONTEND_DIR / rel_path
        if target.exists():
            return target

    all_source_files = list(FRONTEND_DIR.glob("src/**/*.*"))
    for file_path in all_source_files:
        if file_path.name in error_text and file_path.suffix in [
            ".jsx",
            ".tsx",
            ".js",
            ".ts",
            ".css",
        ]:
            return file_path

    # Fallback to main App file if error relates to React render
    if any(
        k in error_text.lower()
        for k in ["uncaught", "react", "undefined", "null", "typeerror", "cannot read"]
    ):
        for candidate in ["src/App.jsx", "src/App.tsx", "src/main.jsx", "src/main.tsx"]:
            p = FRONTEND_DIR / candidate
            if p.exists():
                return p
    return None


class LiveErrorBridgeHandler(BaseHTTPRequestHandler):
    """HTTP endpoint on port 8001 receiving real-time errors from user's live browser."""

    def do_POST(self):
        content_len = int(self.headers.get("Content-Length", 0))
        post_body = self.rfile.read(content_len)
        try:
            data = json.loads(post_body.decode("utf-8"))
            msg = data.get("message", "")
            stack = data.get("stack", "")
            full_error = f"{msg}\n{stack}"

            print(f"\n{RED}{BOLD}[LIVE USER BROWSER ERROR CAPTURED]{RESET} {msg}")
            target_file = find_frontend_file_from_error(full_error)
            if target_file:
                threading.Thread(
                    target=ask_local_model_to_fix,
                    args=(target_file, full_error, "frontend (live browser)"),
                    daemon=True,
                ).start()
        except Exception:
            pass

        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def log_message(self, format, *args):
        pass  # Quiet logging


def start_live_error_bridge(port: int = 8001):
    """Start local HTTP server to receive error events from user's real browser."""
    try:
        server = HTTPServer(("0.0.0.0", port), LiveErrorBridgeHandler)
        server.serve_forever()
    except Exception as e:
        print(f"{YELLOW}[ERROR BRIDGE NOTICE] Port {port} busy: {e}{RESET}")


def _schedule_backup_cleanup(
    backup_path: Path, file_path: Path, delay_seconds: float = 8.0
):
    """Automatically delete the temporary .bak file after the service stabilizes."""

    def _cleanup():
        time.sleep(delay_seconds)
        try:
            if backup_path.exists():
                backup_path.unlink()
                print(
                    f"{GREEN}[AUTO-HEALER CLEANUP]{RESET} Fix verified stable. Deleted temporary backup: {backup_path.name}"
                )
        except Exception as e:
            print(
                f"{YELLOW}[CLEANUP WARNING] Could not remove {backup_path.name}: {e}{RESET}"
            )

    threading.Thread(target=_cleanup, daemon=True).start()


def is_ai_or_developer_modifying(target_file: Path) -> bool:
    """
    Detect if an AI assistant (Antigravity) or developer is actively modifying code.
    1. Check for AI lockfile (.ai_active.lock or .ai_lock).
    2. Check target file stability: if target file mtime was touched within 45s, pause auto-healer.
    3. Check workspace activity: if any file in frontend/src or backend was modified within 30s, wait.
    """
    now = time.time()

    # 1. Explicit Lockfile Check
    lock_files = [
        ROOT_DIR / ".ai_active.lock",
        ROOT_DIR / ".ai_lock",
        ROOT_DIR / ".agent_busy",
    ]
    for lock in lock_files:
        if lock.exists():
            # If lock is fresh (< 10 mins), AI is actively coding
            if (now - lock.stat().st_mtime) < 600:
                return True
            else:
                try:
                    lock.unlink()  # Cleanup stale lock
                except Exception:
                    pass

    # 2. Check if the target file was edited in the last 45 seconds
    if target_file.exists():
        if (now - target_file.stat().st_mtime) < 45.0:
            return True

    # 3. Check if ANY source code in frontend/src or backend was modified in the last 30 seconds
    for p in list(FRONTEND_DIR.glob("src/**/*.*")) + list(BACKEND_DIR.glob("**/*.py")):
        if p.is_file() and (now - p.stat().st_mtime) < 30.0:
            return True

    return False


def is_error_still_valid(file_path: Path, error_context: str) -> bool:
    """
    Verify if the error is actually still present in the latest file contents.
    Avoids touching files that have already been fixed by the developer/AI.
    """
    if not file_path.exists():
        return False

    try:
        content = file_path.read_text(encoding="utf-8")
    except Exception:
        return False

    # Python syntax verification via AST
    if file_path.suffix == ".py":
        try:
            ast.parse(content)
            print(
                f"{GREEN}[AUTO-HEALER BYPASSED]{RESET} {file_path.name} is already valid Python syntax. Skipping."
            )
            return False
        except SyntaxError:
            return True
        except Exception:
            return True

    # React / JS check: if referenced identifier is already defined or gone
    if file_path.suffix in [".jsx", ".tsx", ".js", ".ts"]:
        m = re.search(r"([a-zA-Z0-9_]+) is not defined", error_context)
        if m:
            ident = m.group(1)
            if ident not in content:
                print(
                    f"{GREEN}[AUTO-HEALER BYPASSED]{RESET} Obsolete error: '{ident}' is no longer in {file_path.name}. Skipping."
                )
                return False

    return True


def ask_local_model_to_fix(file_path: Path, error_context: str, service_name: str):
    """Ask local Qwen Coder / DeepSeek to analyze and patch the broken file with smart AI detection."""
    with fix_lock:
        now = time.time()
        file_str = str(file_path)
        if file_str in last_fix_time and (now - last_fix_time[file_str]) < 60.0:
            return  # Avoid spamming fixes while hot-reloading

        last_fix_time[file_str] = now

    # 1. Wait until AI / developer has finished active modifications (wait up to 30s)
    for _ in range(15):
        if is_ai_or_developer_modifying(file_path):
            time.sleep(2.0)
        else:
            break
    else:
        print(
            f"{YELLOW}[AUTO-HEALER PAUSED]{RESET} Active editing / AI modification detected in workspace. Standing by."
        )
        return

    if not file_path.exists():
        return

    # 2. Re-validate if error is STILL present in the latest file version
    if not is_error_still_valid(file_path, error_context):
        return

    try:
        current_code = file_path.read_text(encoding="utf-8")
    except Exception as e:
        print(f"{RED}Error reading file {file_path}: {e}{RESET}")
        return

    print(
        f"\n{RED}{BOLD}[AUTO-HEALER DETECTED PERSISTENT ERROR IN {service_name.upper()}]{RESET}"
    )
    print(f"{YELLOW}Target file: {file_path}{RESET}")
    print(f"{YELLOW}Consulting local model (Qwen 2.5 Coder 14B)...{RESET}")

    system_prompt = """You are the Senior Quantitative Full-Stack Engineer and Auto-Healer for Titanes Tech Portfolio.

PROJECT TECH STACK CONTEXT (STRICT STANDARDS):
• Modern Toolchain: Bun (Frontend package manager & runtime), UV (Python package manager), Ruff (Linter), Polars (High-performance Rust DataFrames).
• Frontend: React 19, Vite, Lightweight Charts by TradingView ('lightweight-charts'), Zustand store (usePortfolioStore), Vanilla CSS.
• Backend: Python 3.12, FastAPI, Uvicorn, Polars DataFrames, DuckDB, yfinance, FRED API.
• Charting Standard: All chart canvas rendering is EXCLUSIVELY built with 'lightweight-charts'. NEVER import or use D3, Chart.js, Recharts, or Plotly.

REPAIR GUIDELINES:
1. SURGICAL, MINIMAL FIX: Fix ONLY the exact bug, undefined identifier, typo, or syntax error described in the log.
2. PRESERVE ARCHITECTURE: Preserve 100% of the existing library imports, JSX structure, Zustand state hooks, and component logic.
3. NO HALLUCINATED PACKAGES: NEVER introduce new uninstalled libraries (e.g. no d3, no lodash, no axios, no jquery).
4. OUTPUT FORMAT: Return ONLY the complete, corrected source code for the file without conversational filler."""

    prompt = f"""Target File: {file_path.name} ({service_name})
Path: {file_path}

--- RUNTIME ERROR LOG ---
{error_context}

--- CURRENT FILE SOURCE CODE ---
{current_code}

INSTRUCTIONS:
1. Carefully diagnose the runtime error in the context of the Titanes Tech Portfolio architecture.
2. Apply a surgical fix to resolve the error while strictly preserving all existing component logic, Zustand store, and 'lightweight-charts'.
3. Return ONLY the complete, corrected code for this file.
"""

    response = query_local_model(
        prompt=prompt,
        model="coder",
        system_prompt=system_prompt,
        temperature=0.1,
        max_tokens=4096,
    )

    if not response.get("success"):
        print(f"{RED}Local model query failed: {response.get('error')}{RESET}")
        return

    reply = response.get("reply", "").strip()

    # Extract code from markdown codeblocks if wrapped
    code_match = re.search(r"```(?:\w+)?\n([\s\S]*?)\n```", reply)
    if code_match:
        fixed_code = code_match.group(1)
    else:
        fixed_code = reply

    if fixed_code and len(fixed_code) > 10:
        try:
            # Temporary backup original
            backup_path = file_path.with_suffix(file_path.suffix + ".bak")
            backup_path.write_text(current_code, encoding="utf-8")

            # Write fixed code
            file_path.write_text(fixed_code, encoding="utf-8")
            print(
                f"{GREEN}{BOLD}[AUTO-HEALER SUCCESS]{RESET} Fixed {file_path.name} using local model! (Temporary backup created)"
            )

            # Schedule cleanup of the temporary backup once service stays healthy
            _schedule_backup_cleanup(backup_path, file_path, delay_seconds=8.0)
        except Exception as e:
            print(f"{RED}Failed to write fix to {file_path}: {e}{RESET}")
    else:
        print(
            f"{YELLOW}[AUTO-HEALER] Local model returned an empty or invalid fix.{RESET}"
        )


def stream_process(cmd: str, cwd: Path, name: str, color: str):
    """Run a process and stream output while listening for errors and auto-restarting on crashes."""
    while True:
        print(f"{color}[STARTING {name.upper()}]{RESET} Running '{cmd}' in {cwd}")

        process = subprocess.Popen(
            cmd,
            cwd=cwd,
            shell=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,
        )

        error_buffer = []
        collecting_error = False

        def _process_error_buffer(buffer: list[str], s_name: str):
            if not buffer:
                return
            full_error = "".join(buffer)
            buffer.clear()

            # 1. Find all python files in traceback stack and pick the closest project file
            file_matches = re.findall(r'File "([^"]+\.py)", line (\d+)', full_error)
            target_file = None
            for file_str, line_num in reversed(file_matches):
                p = Path(file_str)
                if (
                    p.exists()
                    and "site-packages" not in str(p)
                    and "WindowsApps" not in str(p)
                ):
                    target_file = p
                    break

            if target_file:
                print(
                    f"\n{YELLOW}[AUTO-HEALER] Found project file in error stack: {target_file.name}{RESET}"
                )
                threading.Thread(
                    target=ask_local_model_to_fix,
                    args=(target_file, full_error, s_name),
                    daemon=True,
                ).start()
                return

            # 2. Detect TypeScript / Vite / Bun errors
            vite_file_matches = re.findall(
                r"([a-zA-Z0-9_\-\/\\]+\.(?:jsx?|tsx?|vue|svelte)):(\d+):(\d+)",
                full_error,
            )
            if vite_file_matches:
                rel_path, _, _ = vite_file_matches[-1]
                target_file = (FRONTEND_DIR / rel_path).resolve()
                if target_file.exists():
                    threading.Thread(
                        target=ask_local_model_to_fix,
                        args=(target_file, full_error, s_name),
                        daemon=True,
                    ).start()

        for line in iter(process.stdout.readline, ""):
            sys.stdout.write(f"{color}[{name}]{RESET} {line}")
            sys.stdout.flush()

            lower_line = line.lower()

            # Detect Python / Uvicorn errors
            if (
                "traceback (most recent call last):" in lower_line
                or "error:" in lower_line
                or "exception" in lower_line
                or "syntaxerror:" in lower_line
            ):
                collecting_error = True
                error_buffer.append(line)
            elif collecting_error:
                error_buffer.append(line)

                # Fatal error line reached (e.g. SyntaxError, TypeError, etc.)
                is_fatal_error_line = any(
                    err in lower_line
                    for err in [
                        "syntaxerror:",
                        "indentationerror:",
                        "nameerror:",
                        "typeerror:",
                        "attributeerror:",
                        "valueerror:",
                        "importerror:",
                        "modulenotfounderror:",
                        "keyerror:",
                        "indexerror:",
                        "zerodivisionerror:",
                        "unicodedecodeerror:",
                    ]
                )

                if (
                    is_fatal_error_line
                    or line.strip() == ""
                    or "info:" in lower_line
                    or "warning:" in lower_line
                    or len(error_buffer) > 25
                ):
                    collecting_error = False
                    _process_error_buffer(error_buffer, name)

        # Process any leftover error buffer if process crashed
        if error_buffer:
            _process_error_buffer(error_buffer, name)

        process.stdout.close()
        process.wait()
        print(f"{RED}[{name.upper()} STOPPED]{RESET} Exit code: {process.returncode}")

        # If clean shutdown or keyboard interrupt, break
        if process.returncode == 0 or process.returncode == -15:
            break
        print(f"{YELLOW}[SUPERVISOR]{RESET} Restarting {name.upper()} in 2 seconds...")
        time.sleep(2)


def run_browser_supervisor():
    """Wait for backend (8000) and frontend (5173) to be fully online before opening the browser."""
    import httpx

    print(
        f"{CYAN}[SUPERVISOR]{RESET} Waiting for backend (8000) and frontend (5173) to initialize..."
    )

    # Wait up to 15 seconds for both ports to accept connections
    for _ in range(15):
        try:
            with httpx.Client(timeout=1.0) as client:
                r_back = client.get("http://127.0.0.1:8000/docs")
                r_front = client.get("http://localhost:5173")
                if r_back.status_code == 200 and r_front.status_code == 200:
                    print(
                        f"{GREEN}[SUPERVISOR READY]{RESET} Both servers online! Launching browser window..."
                    )
                    break
        except Exception:
            pass
        time.sleep(1)

    try:
        from browser_supervisor import main as browser_main

        browser_main()
    except Exception as e:
        print(f"{YELLOW}[BROWSER SUPERVISOR ERROR] {e}{RESET}")


def clean_zombie_ports(ports=(8000, 5173, 8001)):
    """Automatically kill any hanging zombie processes occupying project ports."""
    for port in ports:
        try:
            res = subprocess.run(
                f'powershell -Command "Get-NetTCPConnection -LocalPort {port} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique"',
                shell=True,
                capture_output=True,
                text=True,
            )
            pids = [int(p.strip()) for p in res.stdout.split() if p.strip().isdigit()]
            my_pid = os.getpid()
            for pid in pids:
                if pid > 4 and pid != my_pid:
                    subprocess.run(
                        f"taskkill /F /T /PID {pid}", shell=True, capture_output=True
                    )
                    print(
                        f"{YELLOW}[PORT CLEANER]{RESET} Freed port {port} (Terminated zombie PID {pid})"
                    )
        except Exception:
            pass


def wait_for_backend_ready(port: int = 8000, max_timeout: float = 20.0) -> bool:
    """Probe backend port until FastAPI responds HTTP 200 on /docs or OpenAPI."""
    import urllib.request

    print(f"{CYAN}[SUPERVISOR]{RESET} Initializing backend and probing port {port}...")
    start = time.time()
    while (time.time() - start) < max_timeout:
        try:
            req = urllib.request.Request(
                f"http://127.0.0.1:{port}/docs",
                headers={"User-Agent": "SupervisorProbe/1.0"},
            )
            with urllib.request.urlopen(req, timeout=1.0) as resp:
                if resp.status == 200:
                    elapsed = round(time.time() - start, 1)
                    print(
                        f"{GREEN}{BOLD}[BACKEND READY]{RESET} FastAPI online and accepting connections in {elapsed}s! Starting frontend..."
                    )
                    return True
        except Exception:
            pass
        time.sleep(0.3)
    print(
        f"{YELLOW}[SUPERVISOR WARNING]{RESET} Backend probe reached timeout ({max_timeout}s). Starting frontend anyway..."
    )
    return False


def main():
    enable_browser = "--browser" in sys.argv or "-b" in sys.argv

    # Ensure ports 8000, 5173, and 8001 are 100% clean and free
    clean_zombie_ports([8000, 5173, 8001])

    print(f"{BOLD}{CYAN}======================================================{RESET}")
    print(f"{BOLD}{CYAN}   🚀 AUTONOMOUS LOCAL DEV SUPERVISOR (WATCHDOG)      {RESET}")
    print(f"{BOLD}{CYAN}======================================================{RESET}")
    print(f"• Frontend: {FRONTEND_DIR} (bun dev)")
    print(
        f"• Backend:  {BACKEND_DIR}  (uvicorn main:app --host 0.0.0.0 --port 8000 --reload)"
    )
    print(
        f"• Browser Console Watcher: {'ENABLED (Opening Edge/Chrome)' if enable_browser else 'DISABLED (Use --browser to enable)'}"
    )
    print("• Auto-Healer Engine: Qwen 2.5 Coder 14B (Local Model - 0 Tokens)")
    print("------------------------------------------------------\n")

    # 1. Start Backend Thread first
    # --reload-dir services: solo vigila la carpeta de lógica de negocio (donde
    #   más se itera con Aider/el auto-healer), evitando que tocar main.py u otros
    #   archivos de configuración dispare un reinicio innecesario.
    # --reload-delay 2: agrupa escrituras rápidas consecutivas (comunes cuando un
    #   editor/backup escribe el archivo más de una vez) en un solo reinicio, en
    #   vez de reiniciar el proceso repetidamente en cascada.
    backend_cmd = (
        f'"{sys.executable}" -m uvicorn main:app --host 0.0.0.0 --port 8000 '
        f"--reload --reload-dir services --reload-dir routers --reload-delay 2"
    )
    backend_thread = threading.Thread(
        target=stream_process,
        args=(backend_cmd, BACKEND_DIR, "backend", CYAN),
        daemon=True,
    )
    backend_thread.start()

    # 2. Wait until Backend is 100% online and responding before starting Frontend
    wait_for_backend_ready(8000, max_timeout=20.0)

    # 3. Start Frontend Thread and Live Error Bridge
    frontend_thread = threading.Thread(
        target=stream_process,
        args=("bun dev", FRONTEND_DIR, "frontend", GREEN),
        daemon=True,
    )

    bridge_thread = threading.Thread(
        target=start_live_error_bridge,
        args=(8001,),
        daemon=True,
    )

    frontend_thread.start()
    bridge_thread.start()

    if enable_browser:
        browser_thread = threading.Thread(
            target=run_browser_supervisor,
            daemon=True,
        )
        browser_thread.start()

    try:
        while backend_thread.is_alive() or frontend_thread.is_alive():
            time.sleep(1)
    except KeyboardInterrupt:
        print(f"\n{YELLOW}[SHUTTING DOWN SUPERVISOR] Stopping servers...{RESET}")


if __name__ == "__main__":
    main()
