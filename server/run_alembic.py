"""
Convenience wrapper for Alembic commands.
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path


def main() -> int:
    root = Path(__file__).resolve().parent.parent
    alembic_ini = root / "server" / "alembic.ini"
    cmd = [sys.executable, "-m", "alembic", "-c", str(alembic_ini), *sys.argv[1:]]
    return subprocess.call(cmd, cwd=root)


if __name__ == "__main__":
    raise SystemExit(main())
