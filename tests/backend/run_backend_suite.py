from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
TEST_ROOT = ROOT / "tests" / "backend"

SUITE_START_DIRS = {
    "all": TEST_ROOT,
    "unit": TEST_ROOT / "unit",
    "integration": TEST_ROOT / "integration",
}


def run_compile_check() -> None:
    command = [sys.executable, "-m", "compileall", "backend", "tests", "server/main.py"]
    subprocess.run(command, cwd=ROOT, check=True)


def run_unittest_suite(start_dir: Path) -> None:
    command = [
        sys.executable,
        "-m",
        "unittest",
        "discover",
        "-s",
        str(start_dir),
        "-p",
        "test_*.py",
    ]
    subprocess.run(command, cwd=ROOT, check=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run Flakers Studio backend test suites.")
    parser.add_argument(
        "--suite",
        choices=sorted(SUITE_START_DIRS),
        default="all",
        help="Backend suite to run.",
    )
    parser.add_argument(
        "--skip-compile",
        action="store_true",
        help="Skip the compileall smoke check.",
    )
    args = parser.parse_args()

    if not args.skip_compile:
        run_compile_check()

    run_unittest_suite(SUITE_START_DIRS[args.suite])


if __name__ == "__main__":
    main()
