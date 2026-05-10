# RAG Evaluation Harness

This suite is the regression safety net for FlakersStudio's RAG quality. Every PR
that touches retrieval, governance, prompting, or assistant behavior should run it.

## What's in here

| File                | Purpose                                                    |
|---------------------|------------------------------------------------------------|
| `question_bank.yaml`| Seed bank of 50 evaluation prompts across 8 categories.    |
| `conftest.py`       | Mock Qdrant, mock Azure OpenAI, fake DB, pipeline fixture. |
| `test_rag_eval.py`  | Pytest harness — one parametrised test per question.       |
| `runner.py`         | CLI: runs the harness and diffs against `baseline.json`.   |
| `baseline.json`     | Snapshot of `main`'s scores; CI fails if a category drops. |
| `reports/`          | Per-run JSON output (`eval_<sha>.json`, `latest.json`).    |

## How to run

```bash
# 1. Run pytest (fastest signal during local dev).
pytest tests/eval/test_rag_eval.py -q

# 2. Or run the CLI (also writes a report and diffs the baseline).
python -m tests.eval.runner

# 3. Re-use an existing report (skip the pytest re-run).
python -m tests.eval.runner --skip-pytest
```

The harness never calls real Azure OpenAI or real Qdrant. All retrieval and LLM
calls are intercepted by deterministic fakes in `conftest.py`.

## How to add a question

1. Open `question_bank.yaml` and append an entry under the right category.
2. Bump the matching count in `EXPECTED_COUNTS` inside `test_rag_eval.py` — the
   `test_question_bank_counts` sanity test enforces the schema.
3. If the question expects KB-grounded facts, extend the `_KNOWLEDGE_BASE` list
   in `conftest.py` with a new `_KBRecord` whose `triggers` match the prompt.
4. Run `pytest tests/eval/test_rag_eval.py -q` and confirm it passes.
5. If you intentionally relaxed an assertion, refresh the baseline (next section).

## How to update the baseline

Only do this when you have intentionally changed behavior and the current scores
are the new floor.

```bash
python -m tests.eval.runner --update-baseline
```

Commit the resulting `tests/eval/baseline.json` together with the behavior change
so reviewers see exactly which categories moved.

## Regression policy

`runner.py` exits non-zero when **any** category's score drops by more than 5%
(absolute) versus the baseline. Override with `--threshold 0.10` for a looser
budget when refactoring. CI invokes the runner with the default threshold.
