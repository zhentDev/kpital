"""Autonomous Browser Frontend Supervisor (Console Watchdog & Auto-Healer).

Launches Microsoft Edge/Chrome, navigates to the frontend (http://localhost:5173),
monitors the JavaScript console and runtime page errors in real-time,
and automatically prompts local LLMs (Qwen 2.5 Coder 14B) to fix broken React/TS/JS components.
"""

import re
import sys
import time
import threading
from pathlib import Path
from playwright.sync_api import sync_playwright, Page, ConsoleMessage, Error as PlaywrightError

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

ROOT_DIR = Path(__file__).resolve().parent
sys.path.append(str(ROOT_DIR))

try:
    from model_router import query_local_model
except ImportError:
    print("[ERROR] Could not import query_local_model from model_router.py")
    sys.exit(1)

FRONTEND_DIR = ROOT_DIR / "frontend"
FRONTEND_URL = "http://localhost:5173"

# ANSI Colors
MAGENTA = "\033[95m"
CYAN = "\033[96m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
BOLD = "\033[1m"
RESET = "\033[0m"

# Track fixes to prevent loops
last_fix_time: dict[str, float] = {}
fix_lock = threading.Lock()


def _schedule_backup_cleanup(backup_path: Path, delay_seconds: float = 8.0):
    """Delete backup file once fix stabilizes."""
    def _cleanup():
        time.sleep(delay_seconds)
        try:
            if backup_path.exists():
                backup_path.unlink()
                print(f"{GREEN}[BROWSER AUTO-HEALER CLEANUP]{RESET} Deleted temporary backup: {backup_path.name}")
        except Exception:
            pass

    threading.Thread(target=_cleanup, daemon=True).start()


def find_frontend_file_from_error(error_text: str) -> Path | None:
    """Scan error text for referenced frontend source files (.jsx, .tsx, .js, .ts, .css)."""
    # Match patterns like src/components/Chart.jsx:24:10 or /src/App.tsx
    matches = re.findall(r'(?:src[/\\][a-zA-Z0-9_\-/\\]+\.(?:jsx?|tsx?|css))', error_text)
    if matches:
        rel_path = matches[-1].replace("\\", "/")
        target = FRONTEND_DIR / rel_path
        if target.exists():
            return target

    # Search by component/file basename
    all_source_files = list(FRONTEND_DIR.glob("src/**/*.*"))
    for file_path in all_source_files:
        if file_path.name in error_text and file_path.suffix in [".jsx", ".tsx", ".js", ".ts", ".css"]:
            return file_path

    # Fallback to main App file if error relates to React render
    if "uncaught" in error_text.lower() or "react" in error_text.lower() or "element type is invalid" in error_text.lower():
        for candidate in ["src/App.jsx", "src/App.tsx", "src/main.jsx", "src/main.tsx"]:
            p = FRONTEND_DIR / candidate
            if p.exists():
                return p

    return None


def ask_local_model_to_fix_frontend(target_file: Path, error_message: str):
    """Invoke local Qwen 2.5 Coder to fix the frontend component."""
    with fix_lock:
        now = time.time()
        file_str = str(target_file)

        # 1. Pause if file was modified by developer / AI agent in the last 15 seconds
        try:
            mtime = target_file.stat().st_mtime
            if (now - mtime) < 15.0:
                print(f"{YELLOW}[AUTO-HEALER PAUSED]{RESET} Active editing detected in {target_file.name} (modified {(now - mtime):.1f}s ago). Standing by.")
                return
        except Exception:
            pass

        # 2. Cooldown check (45 seconds)
        if file_str in last_fix_time and (now - last_fix_time[file_str]) < 45.0:
            return  # Cooldown

        last_fix_time[file_str] = now

    print(f"\n{RED}{BOLD}[BROWSER CONSOLE ERROR DETECTED]{RESET}")
    print(f"{YELLOW}Target component: {target_file}{RESET}")
    print(f"{YELLOW}Error context: {error_message[:200]}...{RESET}")
    print(f"{YELLOW}Consulting local model (Qwen 2.5 Coder 14B)...{RESET}")

    try:
        current_code = target_file.read_text(encoding="utf-8")
    except Exception as e:
        print(f"{RED}Could not read {target_file}: {e}{RESET}")
        return

    prompt = f"""You are an expert React / Frontend developer fixing a client-side browser error.
Below is the browser console error message/stack trace and the source file.

--- BROWSER ERROR ---
{error_message}

--- FILE ({target_file.name}) ---
{current_code}

INSTRUCTIONS:
1. Fix the error in the component/code.
2. Return ONLY the complete, corrected code for this file.
3. Do not add markdown commentary or explanation (wrap within a single codeblock).
"""

    response = query_local_model(
        prompt=prompt,
        model="coder",
        system_prompt="You are a frontend code repair assistant. Return only valid corrected React/TypeScript/JavaScript code.",
        temperature=0.2,
        max_tokens=4096,
    )

    if not response.get("success"):
        print(f"{RED}Local model query failed: {response.get('error')}{RESET}")
        return

    reply = response.get("reply", "").strip()
    code_match = re.search(r"```(?:\w+)?\n([\s\S]*?)\n```", reply)
    fixed_code = code_match.group(1) if code_match else reply

    if fixed_code and len(fixed_code) > 10:
        try:
            backup_path = target_file.with_suffix(target_file.suffix + ".bak")
            backup_path.write_text(current_code, encoding="utf-8")
            target_file.write_text(fixed_code, encoding="utf-8")
            print(f"{GREEN}{BOLD}[BROWSER AUTO-HEALER SUCCESS]{RESET} Fixed {target_file.name}! Vite HMR will reload the page.")
            _schedule_backup_cleanup(backup_path, delay_seconds=8.0)
        except Exception as e:
            print(f"{RED}Failed to write fix to {target_file}: {e}{RESET}")


def on_console_message(msg: ConsoleMessage):
    """Handle browser console messages safely without throwing EPIPE on reload."""
    try:
        text = msg.text
        msg_type = msg.type

        if msg_type == "error":
            print(f"{RED}[BROWSER CONSOLE ERROR]{RESET} {text}")
            target_file = find_frontend_file_from_error(text)
            if target_file:
                threading.Thread(
                    target=ask_local_model_to_fix_frontend,
                    args=(target_file, text),
                    daemon=True,
                ).start()
        elif msg_type == "warning":
            if "react" in text.lower() or "deprecated" in text.lower():
                print(f"{YELLOW}[BROWSER WARNING]{RESET} {text[:120]}...")
    except Exception:
        pass


def on_page_error(error: PlaywrightError):
    """Handle uncaught JavaScript exceptions safely without throwing EPIPE on reload."""
    try:
        err_str = str(error)
        print(f"{RED}{BOLD}[BROWSER UNCAUGHT EXCEPTION]{RESET} {err_str}")
        target_file = find_frontend_file_from_error(err_str)
        if target_file:
            threading.Thread(
                target=ask_local_model_to_fix_frontend,
                args=(target_file, err_str),
                daemon=True,
            ).start()
    except Exception:
        pass


def main():
    user_data_dir = ROOT_DIR / ".browser_profile"

    print(f"{BOLD}{MAGENTA}======================================================{RESET}")
    print(f"{BOLD}{MAGENTA}   🌐 AUTONOMOUS BROWSER SUPERVISOR (CONSOLE WATCHDOG){RESET}")
    print(f"{BOLD}{MAGENTA}======================================================{RESET}")
    print(f"• Monitoring URL: {FRONTEND_URL}")
    print(f"• Profile Storage: {user_data_dir.name} (Retains localStorage & session state)")
    print(f"• Auto-Healer Engine: Qwen 2.5 Coder 14B (Local Model - 0 Tokens)")
    print(f"------------------------------------------------------\n")

    with sync_playwright() as p:
        # Launch with persistent context so localStorage, cookies, and tabs are preserved!
        try:
            context = p.chromium.launch_persistent_context(
                user_data_dir=str(user_data_dir),
                channel="msedge",
                headless=False,
                args=["--start-maximized"],
                viewport=None,
            )
        except Exception:
            context = p.chromium.launch_persistent_context(
                user_data_dir=str(user_data_dir),
                channel="chrome",
                headless=False,
                args=["--start-maximized"],
                viewport=None,
            )

        page = context.pages[0] if context.pages else context.new_page()

        # Listen for console logs and uncaught runtime errors
        page.on("console", on_console_message)
        page.on("pageerror", on_page_error)

        print(f"{CYAN}[BROWSER]{RESET} Navigating to {FRONTEND_URL}...")
        try:
            page.goto(FRONTEND_URL, timeout=30000)
            print(f"{GREEN}[BROWSER CONNECTED]{RESET} Listening for console and UI errors with persistent storage...")
        except Exception as e:
            print(f"{YELLOW}[BROWSER NOTICE]{RESET} Could not connect to {FRONTEND_URL} immediately. Ensure 'bun dev' is running.")

        try:
            while True:
                time.sleep(1)
        except Exception:
            print(f"\n{YELLOW}[BROWSER WATCHDOG STOPPING] Closing browser...{RESET}")
            try:
                context.close()
            except Exception:
                pass


if __name__ == "__main__":
    main()
