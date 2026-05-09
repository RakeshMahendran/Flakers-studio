"""Pytest root-conftest.

The repo's ``tests/`` tree contains ``__init__.py`` files at
``tests/backend`` and below, which causes pytest to insert the ``tests``
directory onto ``sys.path`` (its rootpath walk stops at the first parent
without an ``__init__.py``). Once that happens, ``import backend`` would
resolve to ``tests/backend`` instead of the project's top-level
``backend`` package.

This conftest sits at the project root so it is loaded before any test
module is imported. It removes the offending ``tests`` entry from
``sys.path`` and pre-imports the real ``backend`` package so subsequent
``import backend.something`` calls hit the cached module.
"""
from __future__ import annotations

import importlib
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
TESTS_DIR = ROOT / "tests"

# Make sure project root is first.
root_str = str(ROOT)
if root_str in sys.path:
    sys.path.remove(root_str)
sys.path.insert(0, root_str)

# Drop the tests-dir entry pytest may have prepended.
tests_str = str(TESTS_DIR)
while tests_str in sys.path:
    sys.path.remove(tests_str)

# Pre-import the real backend package so any later ``import backend`` hits
# the cached module entry rather than re-resolving via sys.path (where
# pytest may again insert ``tests`` before we can clean it up).
if "backend" in sys.modules:
    cached = sys.modules["backend"]
    cached_path = getattr(cached, "__file__", "") or ""
    if cached_path and TESTS_DIR.as_posix() in Path(cached_path).as_posix():
        # Wrong ``backend`` was cached (the tests/backend package). Purge it.
        for name in list(sys.modules):
            if name == "backend" or name.startswith("backend."):
                del sys.modules[name]

importlib.import_module("backend")
