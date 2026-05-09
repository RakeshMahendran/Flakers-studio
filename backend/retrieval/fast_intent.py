"""
Fast-path intent detection for trivial conversational turns.

This module provides a regex-only classifier that catches greetings,
thanks, goodbyes, and (context-gated) yes/no acknowledgements BEFORE
any retrieval or LLM call is made. A hit returns a canned, assistant-
name-aware response in roughly one millisecond and incurs zero LLM
cost.

Design constraints (see ``tasks/intent-fastpath.md``):
  - Patterns must match the WHOLE stripped, lower-cased query. We do
    NOT want "hi how do I cancel my plan" to short-circuit the real
    answer.
  - Affirmation/negation are only meaningful when the previous bot
    turn ended with a question mark. Without that context we fall
    through to the normal RAG path.
  - This module never imports DB / Azure / governance code so it can
    be invoked from anywhere in the request pipeline cheaply.

The caller (``rag_pipeline.handle_query``) is responsible for shaping
the returned ``FastIntentResult`` into a ``GovernanceDecision``-style
payload (``decision=ANSWER``, ``sources=[]``,
``applied_rules=["fast_intent"]``).
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal, Optional

from backend.observability.metrics import observe_fast_intent_hit


FastIntent = Literal["greeting", "thanks", "goodbye", "affirmation", "negation"]


@dataclass(frozen=True)
class FastIntentResult:
    """Result of a fast-intent match.

    Attributes:
        intent: The matched intent label.
        canned_response: Pre-rendered assistant reply (assistant-name aware).
        skip_retrieval: Always True. Present so callers can branch on a
            single, explicit flag rather than truthiness of the object.
    """

    intent: FastIntent
    canned_response: str
    skip_retrieval: bool = True


# --- Patterns ---------------------------------------------------------------
# Each pattern is anchored with ^...$ and matched against the *stripped*
# lower-cased query so partial matches (e.g. "hi how do I cancel") never
# fire. The trailing ``[\s!.?]*`` allows polite punctuation/whitespace
# without admitting any extra words.
_GREETING_RE = re.compile(
    r"^(hi+|hello+|hey+|yo+|good (morning|afternoon|evening))[\s!.?]*$",
    re.IGNORECASE,
)
_THANKS_RE = re.compile(
    r"^(thanks?|thank you|ty|thx)[\s!.?]*$",
    re.IGNORECASE,
)
_GOODBYE_RE = re.compile(
    r"^(bye|goodbye|see you|cya|good night)[\s!.?]*$",
    re.IGNORECASE,
)
_AFFIRMATION_RE = re.compile(
    r"^(yes|yeah|yep|sure|ok|okay)[\s!.?]*$",
    re.IGNORECASE,
)
_NEGATION_RE = re.compile(
    r"^(no|nope|nah)[\s!.?]*$",
    re.IGNORECASE,
)


def _safe_name(assistant_name: Optional[str]) -> str:
    """Fall back to a neutral persona when the caller has no name."""
    name = (assistant_name or "").strip()
    return name or "this assistant"


def _greeting_response(name: str) -> str:
    return (
        f"Hi! I'm the assistant for {name}. "
        f"What can I help you with today?"
    )


def _thanks_response(name: str) -> str:
    return (
        f"You're welcome! Anything else I can help you with about {name}?"
    )


def _goodbye_response(name: str) -> str:
    return f"Goodbye! Reach out any time you have questions about {name}."


def _affirmation_response(name: str) -> str:
    return f"Great — what would you like to know about {name}?"


def _negation_response(name: str) -> str:
    return (
        f"No problem. Let me know if there's anything else about {name} "
        f"I can help with."
    )


def _last_bot_message_invites_yes_no(last_bot_message: Optional[str]) -> bool:
    """A yes/no follow-up is only meaningful after a question.

    We use the simplest reliable signal: the previous assistant turn
    ends with ``?`` (after stripping trailing whitespace). This avoids
    false positives where the user types "no" as a standalone refusal
    of an unrelated topic.
    """
    if not last_bot_message:
        return False
    return last_bot_message.rstrip().endswith("?")


def detect_fast_intent(
    query: str,
    *,
    assistant_name: Optional[str] = None,
    last_bot_message: Optional[str] = None,
) -> Optional[FastIntentResult]:
    """Return a ``FastIntentResult`` if the query is trivial, else ``None``.

    Args:
        query: Raw user message. We strip and lower-case before matching.
        assistant_name: Display name used to render the canned reply. If
            empty / None, a neutral fallback is used.
        last_bot_message: The most recent assistant message in the
            current conversation (if any). Required to gate
            affirmation/negation matches; ignored for the others.

    Returns:
        A ``FastIntentResult`` on a match, or ``None`` to indicate the
        caller should run the normal RAG pipeline.
    """
    if not query:
        return None
    text = query.strip()
    if not text:
        return None

    name = _safe_name(assistant_name)

    if _GREETING_RE.match(text):
        observe_fast_intent_hit("greeting")
        return FastIntentResult("greeting", _greeting_response(name))

    if _THANKS_RE.match(text):
        observe_fast_intent_hit("thanks")
        return FastIntentResult("thanks", _thanks_response(name))

    if _GOODBYE_RE.match(text):
        observe_fast_intent_hit("goodbye")
        return FastIntentResult("goodbye", _goodbye_response(name))

    # Yes/no answers are ambiguous without context. Only fire when the
    # previous bot turn was a question.
    if _last_bot_message_invites_yes_no(last_bot_message):
        if _AFFIRMATION_RE.match(text):
            observe_fast_intent_hit("affirmation")
            return FastIntentResult("affirmation", _affirmation_response(name))
        if _NEGATION_RE.match(text):
            observe_fast_intent_hit("negation")
            return FastIntentResult("negation", _negation_response(name))

    return None
