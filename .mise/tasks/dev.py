#!/usr/bin/env -S uv run --script
#MISE description="Start frontend and backend development servers"
from __future__ import annotations

import argparse
import shlex
import signal
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Dict, List, Sequence

from rich.console import Console
from rich.live import Live
from rich.panel import Panel
from rich.table import Table

console = Console()

LOG_LIMIT = 20
DEFAULT_FRONTEND_CMD = "npm run dev"
DEFAULT_BACKEND_CMD = "node server"
DEFAULT_FRONTEND_DIR = "."
DEFAULT_BACKEND_DIR = "."


class ProcessManager:
    def __init__(self):
        self.processes: Dict[str, subprocess.Popen[str]] = {}
        self.logs: Dict[str, List[str]] = {"frontend": [], "backend": []}

    def start_process(self, name: str, cmd: Sequence[str], cwd: Path) -> bool:
        try:
            console.print(
                f"[dim]Starting {name} in {cwd}: {' '.join(cmd)}[/dim]"
            )
            process = subprocess.Popen(
                cmd,
                cwd=str(cwd),
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
            )

            self.processes[name] = process
            thread = threading.Thread(
                target=self._pipe_output,
                args=(name, process),
                daemon=True,
            )
            thread.start()
            return True
        except Exception as exc:  # pragma: no cover - best effort logging
            console.print(f"[red]Failed to start {name}: {exc}[/red]")
            return False

    def _pipe_output(self, name: str, process: subprocess.Popen[str]) -> None:
        assert process.stdout is not None
        for line in process.stdout:
            text = line.rstrip()
            log_list = self.logs.setdefault(name, [])
            log_list.append(text)
            if len(log_list) > LOG_LIMIT:
                log_list.pop(0)

    def is_running(self) -> bool:
        return any(proc.poll() is None for proc in self.processes.values())

    def status(self, name: str) -> str:
        proc = self.processes.get(name)
        if proc is None:
            return "Not started"
        code = proc.poll()
        return "Running" if code is None else f"Exited ({code})"

    def stop_all(self) -> None:
        for name, proc in self.processes.items():
            if proc.poll() is not None:
                continue
            console.print(f"[dim]Stopping {name}[/dim]")
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Start frontend and backend development servers."
    )
    parser.add_argument(
        "--frontend-cmd",
        default=DEFAULT_FRONTEND_CMD,
        help=f"Command for the frontend server (default: {DEFAULT_FRONTEND_CMD!r})",
    )
    parser.add_argument(
        "--backend-cmd",
        default=DEFAULT_BACKEND_CMD,
        help=f"Command for the backend server (default: {DEFAULT_BACKEND_CMD!r})",
    )
    parser.add_argument(
        "--frontend-dir",
        default=DEFAULT_FRONTEND_DIR,
        help=f"Working directory for the frontend server (default: {DEFAULT_FRONTEND_DIR!r})",
    )
    parser.add_argument(
        "--backend-dir",
        default=DEFAULT_BACKEND_DIR,
        help=f"Working directory for the backend server (default: {DEFAULT_BACKEND_DIR!r})",
    )
    parser.add_argument(
        "--skip-frontend",
        action="store_true",
        help="Do not start the frontend server.",
    )
    parser.add_argument(
        "--skip-backend",
        action="store_true",
        help="Do not start the backend server.",
    )
    return parser.parse_args()


def resolve_command(cmd: str) -> List[str]:
    parts = shlex.split(cmd)
    if not parts:
        raise ValueError("Command cannot be empty")
    return parts


def start_services(args: argparse.Namespace) -> bool:
    manager = ProcessManager()

    def handle_signal(signum, _frame):
        console.print(f"\n[yellow]Received signal {signum}, stopping servers...[/yellow]")
        manager.stop_all()
        sys.exit(0)

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    if not args.skip_frontend:
        frontend_cmd = resolve_command(args.frontend_cmd)
        frontend_dir = Path(args.frontend_dir).resolve()
        if not manager.start_process("frontend", frontend_cmd, frontend_dir):
            return False

    if not args.skip_backend:
        backend_cmd = resolve_command(args.backend_cmd)
        backend_dir = Path(args.backend_dir).resolve()
        if not manager.start_process("backend", backend_cmd, backend_dir):
            return False

    if not manager.processes:
        console.print("[red]Nothing to run. Enable frontend or backend.[/red]")
        return False

    console.print("[green]Servers started. Press Ctrl+C to stop.[/green]")

    def render_dashboard() -> Panel:
        table = Table.grid(expand=True)
        table.add_column("Backend", ratio=1, style="blue")
        table.add_column("Frontend", ratio=1, style="magenta")

        def service_block(
            title: str,
            enabled: bool,
            cmd: str,
            directory: Path,
            status: str,
            logs: List[str],
        ) -> Panel:
            status_text = "Disabled" if not enabled else status
            log_lines = (
                ["(disabled)"]
                if not enabled
                else (logs if logs else ["(waiting for output)"])
            )
            content = [
                f"[bold]Command:[/bold] {cmd}",
                f"[bold]Directory:[/bold] {directory}",
                f"[bold]Status:[/bold] {status_text}",
                "",
                "[bold]Logs:[/bold]",
                *log_lines,
            ]
            body = "\n".join(content)

            border = "green" if enabled and status == "Running" else "red"
            return Panel(body, title=title, border_style=border)

        table.add_row(
            service_block(
                "Backend",
                not args.skip_backend,
                args.backend_cmd,
                Path(args.backend_dir).resolve(),
                manager.status("backend"),
                manager.logs.get("backend", []),
            ),
            service_block(
                "Frontend",
                not args.skip_frontend,
                args.frontend_cmd,
                Path(args.frontend_dir).resolve(),
                manager.status("frontend"),
                manager.logs.get("frontend", []),
            ),
        )

        return Panel(table, title="🚀 Development servers", border_style="green")

    try:
        with Live(render_dashboard(), refresh_per_second=4) as live:
            while manager.is_running():
                live.update(render_dashboard())
                time.sleep(0.5)
    except KeyboardInterrupt:
        pass
    finally:
        console.print("\n[yellow]Stopping servers...[/yellow]")
        manager.stop_all()
        console.print("[green]All servers stopped.[/green]")

    return True


def main() -> None:
    args = parse_args()
    success = start_services(args)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
