"""Pytest harness that drives the RAG evaluation suite.

Loads ``question_bank.yaml``, runs every entry through the real
``RAGPipeline`` (with mocked vector store + LLM), and emits a JSON
report under ``tests/eval/reports/eval_<git-sha>.json``.

Each question is its own parametrised test so individual regressions
surface clearly in pytest output. The full report is emitted by a
session-scoped finaliser regardless of pass/fail so CI can post-process
it via ``runner.py``.
"""
from __future__ import annotations

import asyncio
import json
import subprocess
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

import pytest
import yaml


HERE = Path(__file__).resolve().parent
QUESTION_BANK = HERE / "question_bank.yaml"
REPORTS_DIR = HERE / "reports"


def _load_question_bank() -> List[Dict[str, Any]]:
    with QUESTION_BANK.open("r", encoding="utf-8") as fh:
        data = yaml.safe_load(fh) or {}
    questions = data.get("questions", [])
    if not isinstance(questions, list):
        raise RuntimeError("question_bank.yaml: 'questions' must be a list")
    return questions


_QUESTIONS = _load_question_bank()


def _git_sha() -> str:
    """Best-effort short git SHA. Falls back to ``unknown`` off-tree."""
    try:
        out = subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=str(HERE.parents[1]),
            stderr=subprocess.DEVNULL,
        )
        return out.decode().strip()
    except Exception:
        return "unknown"


# ---------------------------------------------------------------------------
# Result accumulator (session-scoped fixture)
# ---------------------------------------------------------------------------
class _ResultsAccumulator:
    def __init__(self) -> None:
        self.entries: List[Dict[str, Any]] = []

    def add(self, entry: Dict[str, Any]) -> None:
        self.entries.append(entry)

    def by_category(self) -> Dict[str, List[Dict[str, Any]]]:
        grouped: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
        for entry in self.entries:
            grouped[entry["category"]].append(entry)
        return grouped


@pytest.fixture(scope="session")
def results_accumulator() -> _ResultsAccumulator:
    return _ResultsAccumulator()


@pytest.fixture(scope="session", autouse=True)
def _emit_report(results_accumulator: _ResultsAccumulator):
    """After the session finishes, write a JSON report to ``reports/``.

    The report is always written, even on failures, so CI can diff it
    against the committed baseline.
    """
    yield
    if not results_accumulator.entries:
        return

    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    sha = _git_sha()
    report_path = REPORTS_DIR / f"eval_{sha}.json"
    summary = build_summary(results_accumulator.entries)
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "git_sha": sha,
        "total_questions": len(results_accumulator.entries),
        "summary": summary,
        "questions": results_accumulator.entries,
    }
    report_path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
    # Convenience copy with stable name for CI diffing.
    (REPORTS_DIR / "latest.json").write_text(
        json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8"
    )


def build_summary(entries: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Aggregate per-category pass rates."""
    by_cat: Dict[str, Dict[str, int]] = defaultdict(lambda: {"total": 0, "passed": 0})
    for entry in entries:
        bucket = by_cat[entry["category"]]
        bucket["total"] += 1
        if entry["passed"]:
            bucket["passed"] += 1
    summary: Dict[str, Any] = {}
    for cat, counts in by_cat.items():
        total = counts["total"]
        passed = counts["passed"]
        score = (passed / total) if total else 0.0
        summary[cat] = {
            "total": total,
            "passed": passed,
            "score": round(score, 4),
        }
    overall_total = sum(c["total"] for c in by_cat.values())
    overall_passed = sum(c["passed"] for c in by_cat.values())
    summary["__overall__"] = {
        "total": overall_total,
        "passed": overall_passed,
        "score": round((overall_passed / overall_total) if overall_total else 0.0, 4),
    }
    return summary


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _ids(entries: List[Dict[str, Any]]) -> List[str]:
    return [str(e.get("id", f"q-{i}")) for i, e in enumerate(entries)]


def _matches(haystack: str, needle: str) -> bool:
    return needle.lower() in (haystack or "").lower()


def _evaluate(question: Dict[str, Any], result: Dict[str, Any]) -> Dict[str, Any]:
    """Score a single question. Returns the report row."""
    failures: List[str] = []

    expected_decision = question.get("expected_decision", "ANSWER")
    actual_decision = result.get("decision")
    if str(actual_decision).upper() != str(expected_decision).upper():
        failures.append(
            f"decision mismatch: expected {expected_decision}, got {actual_decision}"
        )

    answer_text = result.get("answer") or ""

    for needle in question.get("must_contain") or []:
        if not _matches(answer_text, needle):
            failures.append(f"missing required substring: {needle!r}")

    for needle in question.get("must_not_contain") or []:
        if _matches(answer_text, needle):
            failures.append(f"forbidden substring present: {needle!r}")

    # min_confidence is currently advisory: the pipeline does not emit a
    # confidence score on its public response, so we only check it when
    # one is available. Branches that surface confidence can rely on
    # this enforcement automatically.
    min_conf = question.get("min_confidence")
    confidence = result.get("confidence")
    if min_conf is not None and confidence is not None:
        if float(confidence) < float(min_conf):
            failures.append(
                f"confidence {confidence:.3f} < required {float(min_conf):.3f}"
            )

    return {
        "id": question["id"],
        "category": question["category"],
        "query": question["query"],
        "expected_decision": expected_decision,
        "actual_decision": actual_decision,
        "answer": answer_text,
        "sources": result.get("sources", []),
        "passed": not failures,
        "failures": failures,
    }


# ---------------------------------------------------------------------------
# Parametrised test
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("question", _QUESTIONS, ids=_ids(_QUESTIONS))
def test_question(
    question: Dict[str, Any],
    rag_pipeline,
    fake_db,
    fake_assistant,
    results_accumulator: _ResultsAccumulator,
):
    """Run a single question end-to-end and record the outcome."""
    coro = rag_pipeline.handle_query(
        db=fake_db,
        assistant=fake_assistant,
        user_message=question["query"],
        session_id=None,
    )
    result = asyncio.run(coro)

    row = _evaluate(question, result)
    results_accumulator.add(row)

    if not row["passed"]:
        details = "\n  - ".join(row["failures"])
        pytest.fail(
            f"[{row['id']} | {row['category']}] {row['query']!r}\n  - {details}\n"
            f"  answer={row['answer']!r}"
        )


# ---------------------------------------------------------------------------
# Sanity test: question bank shape
# ---------------------------------------------------------------------------
EXPECTED_COUNTS = {
    "greeting": 5,
    "small_talk": 3,
    "in_scope_factual": 15,
    "in_scope_temporal": 8,
    "out_of_scope": 5,
    "policy_quote": 4,
    "pricing_contact": 5,
    "ambiguous": 5,
}


def test_question_bank_counts() -> None:
    """The bank must hold exactly the categories the spec mandates."""
    counts: Dict[str, int] = defaultdict(int)
    seen_ids: set[str] = set()
    for q in _QUESTIONS:
        cat = q.get("category")
        qid = q.get("id")
        assert cat in EXPECTED_COUNTS, f"unknown category: {cat!r} on {qid!r}"
        assert qid, "every question must have an id"
        assert qid not in seen_ids, f"duplicate question id: {qid}"
        seen_ids.add(qid)
        counts[cat] += 1
    assert dict(counts) == EXPECTED_COUNTS, (
        f"category counts mismatch: got {dict(counts)} expected {EXPECTED_COUNTS}"
    )
    assert sum(EXPECTED_COUNTS.values()) == 50
