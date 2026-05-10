# Branch: feat/two-tier-intent-classifier
**Worktree:** `E:\FS-intent-fastpath`
**Phase:** 1 — Backend metadata + prompts
**Depends on:** Phase 0 (eval-suite merged)

---

You are in worktree FS-intent-fastpath on branch feat/two-tier-intent-classifier.

## GOAL
Add a regex fast path for greetings/thanks/goodbyes BEFORE any LLM intent call. ~1ms response, zero LLM cost.

## READ FIRST
1. `backend/retrieval/rag_pipeline.py` — search for small-talk handling (it exists)
2. `backend/api/routes/chat.py` — chat entrypoint
3. `backend/api/routes/public_chat.py` — public widget entrypoint

## DELIVERABLES

### 1. New file: `backend/retrieval/fast_intent.py`
Function: `detect_fast_intent(query: str) -> Optional[FastIntentResult]`

`FastIntentResult: { intent, canned_response, skip_retrieval: True }`

Patterns (case-insensitive, must match the WHOLE stripped query — don't false-positive on "hi how do I cancel my plan"):
- **greeting:** `^(hi|hello|hey|yo|good (morning|afternoon|evening))[\s!.?]*$`
- **thanks:** `^(thanks?|thank you|ty|thx)[\s!.?]*$`
- **goodbye:** `^(bye|goodbye|see you|cya|good night)[\s!.?]*$`
- **affirmation:** `^(yes|yeah|yep|sure|ok|okay)[\s!.?]*$` (ONLY meaningful with conv history; needs context flag)
- **negation:** `^(no|nope|nah)[\s!.?]*$`

Canned responses must be assistant-name-aware (load `assistant.name` from caller).

### 2. Wire into `rag_pipeline.py`
Before any retrieval/LLM call, check `detect_fast_intent`. If matched and intent is in `{greeting, thanks, goodbye}`, skip retrieval, return the canned response shaped as a normal `GovernanceDecision` (decision=ANSWER, sources=[], applied_rules=["fast_intent"]).

### 3. Affirmation/negation handling
For affirmation/negation, only fire when previous bot message in conversation_history asked a yes/no question (look for "?" in last assistant message). Otherwise fall through to normal flow.

### 4. Metric
Increment a counter `fast_intent_hits_total{intent=...}` (existing observability stack).

### 5. Tests
`tests/backend/unit/test_fast_intent.py`:
- "hi" → greeting hit
- "Hi how do I cancel" → MISS (must hit retrieval)
- "thanks!" → thanks hit
- "yes" with no history → MISS
- "yes" after bot asks "Want a demo?" → affirmation hit

## CONSTRAINTS
- Patterns must be ULTRA-strict. False positives hide real questions.
- Do NOT modify `governance.py`.
- Do NOT touch the per-LLM intent classification used for content categorization (that's a separate code path on ingestion).

## ACCEPTANCE
- Unit tests pass.
- Eval suite shows greeting category at 100% high confidence with 0 LLM calls (use mock to assert no Azure call).

## DO NOT
- Do NOT commit or push.
- Do NOT modify `governance.py`.

Stop before committing.
