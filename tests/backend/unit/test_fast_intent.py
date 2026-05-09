"""Unit tests for backend.retrieval.fast_intent.

These tests cover the regex fast-path that short-circuits the RAG
pipeline for trivial conversational turns. The contract under test:

  - Whole-string match on the *stripped* lower-cased query so we never
    false-positive on real questions like "hi how do I cancel my plan".
  - Greetings/thanks/goodbyes fire unconditionally.
  - Affirmation/negation fire ONLY when the previous bot turn ended
    with a question mark.
  - On a hit, the canned response embeds the assistant's display name.
  - On a hit, ``skip_retrieval`` is True so callers can branch cheaply.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from backend.retrieval.fast_intent import (  # noqa: E402
    FastIntentResult,
    detect_fast_intent,
)


class GreetingTests(unittest.TestCase):
    def test_plain_hi_hits(self):
        result = detect_fast_intent("hi", assistant_name="Acme")
        self.assertIsNotNone(result)
        assert result is not None  # for type checkers
        self.assertEqual(result.intent, "greeting")
        self.assertTrue(result.skip_retrieval)
        self.assertIn("Acme", result.canned_response)

    def test_hi_with_punctuation_hits(self):
        for q in ("hi!", "hi.", "hi?", "  hi  ", "Hi!"):
            with self.subTest(query=q):
                self.assertIsNotNone(detect_fast_intent(q, assistant_name="Acme"))

    def test_hello_hey_yo_good_morning_hit(self):
        for q in (
            "hello",
            "Hey",
            "yo",
            "good morning",
            "Good Afternoon",
            "good evening!",
        ):
            with self.subTest(query=q):
                result = detect_fast_intent(q, assistant_name="Acme")
                self.assertIsNotNone(result)
                assert result is not None
                self.assertEqual(result.intent, "greeting")

    def test_hi_followed_by_question_misses(self):
        # The whole point of the strict anchoring: do NOT swallow real
        # questions that happen to start with a greeting.
        for q in (
            "Hi how do I cancel my plan",
            "hello, can you help me with billing?",
            "hey what are your hours",
            "good morning, I have a question",
        ):
            with self.subTest(query=q):
                self.assertIsNone(detect_fast_intent(q, assistant_name="Acme"))

    def test_uses_fallback_when_assistant_name_blank(self):
        result = detect_fast_intent("hi", assistant_name="")
        self.assertIsNotNone(result)
        assert result is not None
        self.assertIn("this assistant", result.canned_response)

    def test_uses_fallback_when_assistant_name_none(self):
        result = detect_fast_intent("hi", assistant_name=None)
        self.assertIsNotNone(result)
        assert result is not None
        self.assertIn("this assistant", result.canned_response)


class ThanksTests(unittest.TestCase):
    def test_thanks_variants_hit(self):
        for q in ("thanks", "thanks!", "thank you", "Thank You.", "ty", "thx"):
            with self.subTest(query=q):
                result = detect_fast_intent(q, assistant_name="Acme")
                self.assertIsNotNone(result)
                assert result is not None
                self.assertEqual(result.intent, "thanks")

    def test_thanks_for_help_misses(self):
        # "thanks for the help, but I still need..." would be a real turn.
        self.assertIsNone(
            detect_fast_intent("thanks for the help with billing", assistant_name="Acme")
        )


class GoodbyeTests(unittest.TestCase):
    def test_goodbye_variants_hit(self):
        for q in ("bye", "Goodbye!", "see you", "cya", "good night"):
            with self.subTest(query=q):
                result = detect_fast_intent(q, assistant_name="Acme")
                self.assertIsNotNone(result)
                assert result is not None
                self.assertEqual(result.intent, "goodbye")

    def test_bye_for_now_misses(self):
        self.assertIsNone(
            detect_fast_intent("bye for now, I'll be back tomorrow", assistant_name="Acme")
        )


class AffirmationNegationTests(unittest.TestCase):
    def test_yes_with_no_history_misses(self):
        # No conversation context: "yes" is ambiguous, fall through.
        self.assertIsNone(detect_fast_intent("yes", assistant_name="Acme"))
        self.assertIsNone(
            detect_fast_intent("yes", assistant_name="Acme", last_bot_message=None)
        )

    def test_yes_after_non_question_misses(self):
        self.assertIsNone(
            detect_fast_intent(
                "yes",
                assistant_name="Acme",
                last_bot_message="Here is the summary you asked for.",
            )
        )

    def test_yes_after_bot_question_hits(self):
        result = detect_fast_intent(
            "yes",
            assistant_name="Acme",
            last_bot_message="Want a demo?",
        )
        self.assertIsNotNone(result)
        assert result is not None
        self.assertEqual(result.intent, "affirmation")
        self.assertIn("Acme", result.canned_response)

    def test_yeah_yep_sure_ok_okay_hit_after_question(self):
        for q in ("yeah", "yep", "sure", "ok", "Okay!"):
            with self.subTest(query=q):
                result = detect_fast_intent(
                    q,
                    assistant_name="Acme",
                    last_bot_message="Would you like me to send the link?",
                )
                self.assertIsNotNone(result)
                assert result is not None
                self.assertEqual(result.intent, "affirmation")

    def test_no_after_bot_question_hits_negation(self):
        result = detect_fast_intent(
            "no",
            assistant_name="Acme",
            last_bot_message="Want a demo?",
        )
        self.assertIsNotNone(result)
        assert result is not None
        self.assertEqual(result.intent, "negation")

    def test_no_with_no_history_misses(self):
        self.assertIsNone(detect_fast_intent("no", assistant_name="Acme"))

    def test_nope_nah_hit_after_question(self):
        for q in ("nope", "Nah", "nope!"):
            with self.subTest(query=q):
                result = detect_fast_intent(
                    q,
                    assistant_name="Acme",
                    last_bot_message="Need anything else?",
                )
                self.assertIsNotNone(result)
                assert result is not None
                self.assertEqual(result.intent, "negation")

    def test_question_mark_with_trailing_whitespace_still_qualifies(self):
        # Defensive: real bot messages from the DB may have trailing
        # whitespace or newlines.
        result = detect_fast_intent(
            "yes",
            assistant_name="Acme",
            last_bot_message="Want a demo?   \n",
        )
        self.assertIsNotNone(result)


class EmptyAndNoiseTests(unittest.TestCase):
    def test_empty_query_misses(self):
        self.assertIsNone(detect_fast_intent("", assistant_name="Acme"))
        self.assertIsNone(detect_fast_intent("   ", assistant_name="Acme"))

    def test_arbitrary_question_misses(self):
        self.assertIsNone(
            detect_fast_intent(
                "What is your refund policy?",
                assistant_name="Acme",
            )
        )

    def test_long_query_misses(self):
        self.assertIsNone(
            detect_fast_intent(
                "Explain how billing works for enterprise accounts and what discounts apply",
                assistant_name="Acme",
            )
        )


class ResultShapeTests(unittest.TestCase):
    def test_result_is_dataclass_with_skip_retrieval_true(self):
        result = detect_fast_intent("hi", assistant_name="Acme")
        self.assertIsInstance(result, FastIntentResult)
        assert result is not None
        self.assertTrue(result.skip_retrieval)
        # The canned response should not be empty.
        self.assertGreater(len(result.canned_response), 0)


if __name__ == "__main__":
    unittest.main()
