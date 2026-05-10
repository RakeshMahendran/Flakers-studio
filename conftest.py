"""Project-root conftest.

Ensures pytest can resolve top-level packages (``backend``, ``server``,
``tests``) when invoked via ``python -m pytest``. Combined with
``--import-mode=importlib`` (set in ``pytest.ini``), this lets tests
under ``tests/backend/...`` import the real ``backend`` package without
the path collision that arises when both share the name ``backend``.

The eager-import of ``backend`` at conftest load time is intentional:
it primes ``sys.modules`` so test modules collected by importlib can
resolve ``backend.*`` regardless of the test-discovery import order.
"""
from __future__ import annotations

import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

# Prime sys.modules so tests can ``from backend... import ...`` even
# when pytest's importlib mode does not propagate sys.path into the
# collected module's import search.
import backend  # noqa: F401,E402
