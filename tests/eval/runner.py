"""CLI for running the RAG eval suite and diffing against a baseline.

Usage::

    # Run the suite and diff against the committed baseline.
    python -m tests.eval.runner --baseline tests/eval/baseline.json

    # Re-run the suite and overwrite the baseline (use sparingly).
    python -m tests.eval.runner --update-baseline

    # Only emit the report; do not enforce a regression budget.
    python -m tests.eval.runner --no-baseline-check

Exit codes:
    0   Success (no regression, or --update-baseline finished)
    1   At least one category regressed by more than ``--threshold`` points
        (default 0.05 = 5%) versus the baseline.
    2   Operational error (e.g. baseline missing when expected, pytest
        infrastructure failed before scores could be collected).
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parents[1]
DEFAULT_BASELINE = HERE / "baseline.json"
DEFAULT_LATEST = HERE / "reports" / "latest.json"


def _run_pytest(extra_args: Optional[List[str]] = None) -> int:
    """Invoke pytest as a subprocess so the harness emits its JSON report."""
    cmd = [
        sys.executable,
        "-m",
        "pytest",
        str(HERE / "test_rag_eval.py"),
        "-q",
        # Don't truncate inside CI logs: regression context is gold.
        "--maxfail=0",
        "--tb=short",
    ]
    if extra_args:
        cmd.extend(extra_args)
    print("[runner] $", " ".join(cmd))
    proc = subprocess.run(cmd, cwd=str(REPO_ROOT))
    return proc.returncode


def _load_json(path: Path) -> Dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _diff_scores(
    baseline: Dict[str, Any],
    current: Dict[str, Any],
    threshold: float,
) -> Tuple[bool, List[Dict[str, Any]]]:
    """Compute per-category deltas. Returns (has_regression, rows)."""
    base_summary = baseline.get("summary", {})
    cur_summary = current.get("summary", {})
    rows: List[Dict[str, Any]] = []
    has_regression = False
    categories = sorted(set(base_summary) | set(cur_summary))
    for cat in categories:
        b = (base_summary.get(cat) or {}).get("score", 0.0)
        c = (cur_summary.get(cat) or {}).get("score", 0.0)
        delta = round(c - b, 4)
        regressed = delta < -threshold
        if regressed:
            has_regression = True
        rows.append(
            {
                "category": cat,
                "baseline": b,
                "current": c,
                "delta": delta,
                "regressed": regressed,
            }
        )
    return has_regression, rows


def _print_diff_table(rows: List[Dict[str, Any]]) -> None:
    print()
    print(f"{'category':<22}{'baseline':>10}{'current':>10}{'delta':>10}  status")
    print("-" * 64)
    for row in rows:
        status = "REGRESSED" if row["regressed"] else "ok"
        print(
            f"{row['category']:<22}"
            f"{row['baseline']:>10.4f}"
            f"{row['current']:>10.4f}"
            f"{row['delta']:>+10.4f}  {status}"
        )


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--baseline",
        type=Path,
        default=DEFAULT_BASELINE,
        help="Path to baseline JSON. Defaults to tests/eval/baseline.json.",
    )
    parser.add_argument(
        "--report",
        type=Path,
        default=DEFAULT_LATEST,
        help="Path to the report JSON the pytest harness writes. Defaults to tests/eval/reports/latest.json.",
    )
    parser.add_argument(
        "--threshold",
        type=float,
        default=0.05,
        help="Per-category regression budget as a fraction of 1.0. Default 0.05 (5%%).",
    )
    parser.add_argument(
        "--update-baseline",
        action="store_true",
        help="Run the suite and overwrite the baseline with the resulting report.",
    )
    parser.add_argument(
        "--no-baseline-check",
        action="store_true",
        help="Run the suite, write a report, but do not diff against the baseline.",
    )
    parser.add_argument(
        "--skip-pytest",
        action="store_true",
        help="Don't re-run pytest; reuse an existing report at --report.",
    )
    args = parser.parse_args(argv)

    if not args.skip_pytest:
        rc = _run_pytest()
        # rc != 0 only blocks if pytest itself failed AND we have no
        # report — a per-question failure already populated reports/.
        if rc != 0 and not args.report.exists():
            print(f"[runner] pytest exited with {rc} and no report at {args.report}", file=sys.stderr)
            return 2

    if not args.report.exists():
        print(f"[runner] report not found at {args.report}", file=sys.stderr)
        return 2

    current = _load_json(args.report)
    summary = current.get("summary", {})
    print()
    print("[runner] current scores:")
    for cat in sorted(summary):
        block = summary[cat]
        if not isinstance(block, dict):
            continue
        print(f"  {cat:<22} {block.get('score', 0):.4f}  ({block.get('passed', 0)}/{block.get('total', 0)})")

    if args.update_baseline:
        args.baseline.parent.mkdir(parents=True, exist_ok=True)
        args.baseline.write_text(
            json.dumps(current, indent=2, sort_keys=True),
            encoding="utf-8",
        )
        print(f"\n[runner] baseline updated at {args.baseline}")
        return 0

    if args.no_baseline_check:
        return 0

    if not args.baseline.exists():
        print(f"[runner] baseline missing at {args.baseline} — run with --update-baseline first", file=sys.stderr)
        return 2

    baseline = _load_json(args.baseline)
    has_regression, rows = _diff_scores(baseline, current, args.threshold)
    _print_diff_table(rows)

    if has_regression:
        print(
            f"\n[runner] FAIL: one or more categories regressed by more than "
            f"{args.threshold*100:.1f}% versus baseline.",
            file=sys.stderr,
        )
        return 1

    print(f"\n[runner] OK: all categories within {args.threshold*100:.1f}% of baseline.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
