# Branch: feat/prompt-temporal-and-length
**Worktree:** `E:\FS-prompt-upgrade`
**Phase:** 1 — Backend metadata + prompts
**Depends on:** Phase 0 (eval-suite merged)

---

You are in worktree FS-prompt-upgrade on branch feat/prompt-temporal-and-length.

## GOAL
Fix three prompt issues: (1) LLM doesn't know today's date so "last year"/"upcoming" break; (2) responses are too long because no length constraint; (3) anti-patterns like "Based on the context..." preamble.

## READ FIRST
1. `backend/retrieval/rag_pipeline.py` — especially the prompt-construction code (search for "system" or "messages")
2. `backend/services/azure_ai.py` — how messages are passed to Azure
3. `backend/services/governance.py` — DO NOT MODIFY, just understand the `GovernanceDecision` shape so prompts respect it
4. `planning/system_prompt.md` — existing prompt guidelines

## DELIVERABLES

### 1. New module: `backend/retrieval/prompt_builder.py`
Functions:
- `get_synthesis_system_prompt(assistant_name: str, mode: str = "concise") -> str`
- `get_filter_extraction_system_prompt() -> str` (used by feat/llm-filter-extraction)
- `detect_response_mode(query: str) -> str` (returns: `concise | enumeration | elaborate`)

### 2. Synthesis prompt MUST include
- Today's date computed at call time: `f"CURRENT DATE: {datetime.utcnow().strftime('%Y-%m-%d')}"`
- Temporal anchors: explicit `"last year = {year-1}"`, `"two years ago = {year-2}"`, `"upcoming = date > today"`
- Length rules per mode:
  - **concise:** "1–2 sentences. No preamble. Answer directly."
  - **enumeration:** "Up to 8 bullets, each ≤8 words."
  - **elaborate:** "Multi-paragraph allowed only when user explicitly asked for detail."
- Anti-patterns to forbid:
  - "Don't start with 'Based on the context...' or 'According to the information provided...'"
  - "Don't apologize before answering."
  - "Don't say 'I don't have specific information' UNLESS the context truly lacks the answer."

### 3. Mode detection (regex-based, no LLM)
- elaborate triggers: `\b(explain|in detail|elaborate|tell me more|deep dive)\b`
- enumeration triggers: `\b(list|all the|what (are|services|products|features))\b`
- default: concise

### 4. Wire into `rag_pipeline.py`
Replace the existing system prompt construction with `prompt_builder.get_synthesis_system_prompt(...)`. Keep the user-message construction the same.

### 5. Tests
`tests/backend/unit/test_prompt_builder.py`:
- Asserts `CURRENT DATE` present
- Asserts mode detection routes correctly for sample queries
- Asserts banned phrases listed when mode=concise

## CONSTRAINTS
- Do NOT modify governance rules.
- Do NOT change which model is called or message structure beyond the system content.
- Keep temperature unchanged (rag_pipeline already sets 0.1-0.3).

## ACCEPTANCE
- Unit tests pass.
- Run a manual query "What events are upcoming?" against a stub assistant; verify the prompt sent to Azure contains `CURRENT DATE`.
- Eval suite shows non-regression vs baseline.

## DO NOT
- Do NOT commit or push.
- Do NOT modify `governance.py`.

Stop before committing. Report eval-suite delta.
