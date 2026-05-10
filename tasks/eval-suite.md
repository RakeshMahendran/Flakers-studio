# Branch: feat/rag-eval-test-bank
**Worktree:** `E:\FS-eval-suite`
**Phase:** 0 — Foundations (RUN FIRST)
**Depends on:** nothing — this is the safety net every other branch needs

---

You are in worktree FS-eval-suite on branch feat/rag-eval-test-bank.

## GOAL
Build a RAG quality evaluation harness so future PRs can prove they don't regress retrieval/answer quality.

## READ FIRST (in this order)
1. `backend/retrieval/rag_pipeline.py` — current end-to-end RAG flow
2. `backend/services/governance.py` — understand ANSWER vs REFUSE decision shape
3. `backend/api/routes/chat.py` — how chat is invoked in the app
4. `tests/` directory — existing test layout and pytest config (or lack thereof)

## DELIVERABLES

### 1. New directory: `tests/eval/`
- `tests/eval/__init__.py`
- `tests/eval/conftest.py` — fixtures for a mock Qdrant + mock Azure OpenAI
- `tests/eval/question_bank.yaml` — 50 seed questions across these categories:
    - greeting (5)
    - small_talk (3)
    - in_scope_factual (15)
    - in_scope_temporal (8)
    - out_of_scope (5)
    - policy_quote (4)
    - pricing/contact (5)
    - ambiguous (5)

  Each entry: `{ id, query, category, expected_decision (ANSWER|REFUSE), must_contain (list), must_not_contain (list), min_confidence (float, optional), notes }`

- `tests/eval/test_rag_eval.py` — pytest harness that:
    - Loads `question_bank.yaml`
    - Runs each query through rag_pipeline (with mocked vector + LLM where needed)
    - Asserts decision matches, confidence ≥ min_confidence, must_contain/must_not_contain checks
    - Produces a JSON report at `tests/eval/reports/eval_<git-sha>.json` with per-question scores

- `tests/eval/baseline.json` — committed snapshot of current main's eval scores
- `tests/eval/runner.py` — CLI to run eval and diff vs baseline; exit non-zero if regression > 5% on any category

### 2. CI integration
Update `.github/workflows/ci.yml` — add a `rag-eval` job that runs `python -m tests.eval.runner --baseline tests/eval/baseline.json`

### 3. Documentation
Add a README at `tests/eval/README.md` (≤80 lines): how to run, how to add questions, how to update baseline.

## CONSTRAINTS
- Do NOT call the real Azure OpenAI or Qdrant in CI. Use respx/httpx mocks for Azure and a fake QdrantVectorStore that returns deterministic hits.
- Do NOT modify `rag_pipeline.py` or `governance.py`. The eval harness must work against the existing API.
- Keep YAML question bank human-editable. No code in YAML.
- All changes additive; nothing else in the repo should change.

## ACCEPTANCE
- `pytest tests/eval/test_rag_eval.py -q` passes locally.
- `python -m tests.eval.runner` produces a JSON report.
- `baseline.json` committed with current scores so other branches can diff.

## DO NOT
- Do NOT commit or push. Leave changes uncommitted so the user can review.
- Do NOT modify `backend/services/governance.py`.

Stop and ask the user before committing. Report what categories scored low so they know what to focus on.
