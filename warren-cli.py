#!/usr/bin/env python3
"""
CLI Tool: warren-cli.py
Generates high-context, specialized prompts using local Ollama and platform portfolio data,
ready to copy into WarrenAI (Investing.com ProPicks) or inspect in terminal.

Usage:
    python warren-cli.py
    python warren-cli.py --focus "analizar saltos bruscos y volatilidad"
    python warren-cli.py --question "¿Debo vender ACN o rebalancear hacia semiconductores?"
    python warren-cli.py --copy
    python warren-cli.py --summary
"""

import argparse
import sys
import os

# Set standard streams to utf-8 if supported
if sys.stdout.encoding != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Adjust path to import backend services
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "backend")))

from services.warren_service import generate_warren_prompt, get_all_investments_summary, build_raw_context_text

try:
    import pyperclip
    HAS_PYPERCLIP = True
except ImportError:
    HAS_PYPERCLIP = False

try:
    from rich.console import Console
    from rich.panel import Panel
    from rich.markdown import Markdown
    console = Console()
    HAS_RICH = True
except ImportError:
    console = None
    HAS_RICH = False


def main():
    parser = argparse.ArgumentParser(
        description="WarrenAI CLI — Generador de Prompts Especializados con Ollama y Datos de Portafolio"
    )
    parser.add_argument(
        "--focus",
        "-f",
        type=str,
        default="análisis de fundamentales (Fair Value, Health Score), movimientos bruscos y rebalanceo",
        help="Enfoque principal del análisis para WarrenAI",
    )
    parser.add_argument(
        "--question",
        "-q",
        type=str,
        default=None,
        help="Pregunta específica para WarrenAI (ej: ¿Cómo afecta el salto de ACN a mi ponderación?)",
    )
    parser.add_argument(
        "--model",
        "-m",
        type=str,
        default="qwen2.5-coder:14b",
        help="Modelo de Ollama a utilizar (default: qwen2.5-coder:14b o deepseek-r1:14b)",
    )
    parser.add_argument(
        "--no-ollama",
        action="store_true",
        help="Generar el prompt estructurado directamente sin invocar Ollama",
    )
    parser.add_argument(
        "--copy",
        "-c",
        action="store_true",
        help="Copiar automáticamente el prompt resultante al portapapeles",
    )
    parser.add_argument(
        "--summary",
        "-s",
        action="store_true",
        help="Mostrar solo el resumen consolidado de inversiones en texto",
    )

    args = parser.parse_args()

    if args.summary:
        data = get_all_investments_summary()
        raw = build_raw_context_text(data)
        if HAS_RICH:
            console.print(Panel(Markdown(raw), title="[bold cyan]Resumen Consolidado de Inversiones[/bold cyan]"))
        else:
            print("=== RESUMEN CONSOLIDADO DE INVERSIONES ===")
            print(raw)
        return

    print("\n⏳ Recopilando datos de todas tus inversiones y generando prompt con Ollama...")

    res = generate_warren_prompt(
        focus=args.focus,
        user_question=args.question,
        use_ollama=not args.no_ollama,
        ollama_model=args.model,
    )

    prompt_text = res.get("prompt_for_warren", "")

    if HAS_RICH:
        console.print(
            Panel(
                prompt_text,
                title=f"[bold green]Prompt Generado para WarrenAI (Modelo: {res.get('model_used')})[/bold green]",
                subtitle="Copia y pega este texto en el chat de WarrenAI de Investing.com",
            )
        )
    else:
        print("\n" + "=" * 60)
        print("PROMPT GENERADO PARA WARRENAI:")
        print("=" * 60)
        print(prompt_text)
        print("=" * 60)

    if args.copy or HAS_PYPERCLIP:
        try:
            pyperclip.copy(prompt_text)
            print("\n✨ [OK] ¡Prompt copiado exitosamente al portapapeles! Ya puedes hacer Ctrl+V en WarrenAI.")
        except Exception:
            pass
    elif not HAS_PYPERCLIP:
        print("\n💡 Tip: Instala pyperclip ('pip install pyperclip') para copiar automáticamente al portapapeles.")


if __name__ == "__main__":
    main()
