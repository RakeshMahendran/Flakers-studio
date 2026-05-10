"""RAG evaluation harness.

This package hosts the FlakersStudio RAG quality evaluation suite. Other
branches use the artefacts under this folder as a regression safety net:

- ``question_bank.yaml``  — the seed bank of evaluation prompts
- ``test_rag_eval.py``    — the pytest harness that drives ``RAGPipeline``
- ``runner.py``           — CLI used in CI to diff against ``baseline.json``
- ``baseline.json``       — committed scores from the current ``main`` branch

The harness is deliberately self-contained: it never reaches Azure OpenAI
or Qdrant. Both are stubbed via :mod:`tests.eval.conftest` fixtures so the
suite can run hermetically in CI.
"""
