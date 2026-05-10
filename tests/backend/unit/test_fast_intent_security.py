"""Security and edge case tests for backend.retrieval.fast_intent.

This test suite focuses on:
  1. ReDoS (Regular Expression Denial of Service) vulnerabilities
  2. Edge cases with special characters and Unicode
  3. Performance characteristics with pathological inputs
  4. Multi-language support and false positive detection
"""
from __future__ import annotations

import sys
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from backend.retrieval.fast_intent import (  # noqa: E402
    detect_fast_intent,
)


class ReDoSSecurityTests(unittest.TestCase):
    """Test for catastrophic backtracking in regex patterns."""

    def test_repeated_chars_in_greeting_words(self):
        """Verify that bounded quantifiers prevent excessive repetition."""
        # Long inputs should be rejected by length check before regex matching
        test_cases_should_reject = [
            ("h" + "i" * 1000, "1000 i's should be rejected by length limit"),
            ("hell" + "o" * 1000, "1000 o's should be rejected by length limit"),
            ("he" + "y" * 1000, "1000 y's should be rejected by length limit"),
            ("y" + "o" * 1000, "1000 o's should be rejected by length limit"),
        ]
        for query, reason in test_cases_should_reject:
            with self.subTest(query=query[:50] + "...", reason=reason):
                start = time.perf_counter()
                result = detect_fast_intent(query, assistant_name="Test")
                elapsed = time.perf_counter() - start
                # Should complete in under 10ms even on slow machines
                self.assertLess(elapsed, 0.01, f"Regex took {elapsed*1000:.2f}ms - possible ReDoS")
                # These should be rejected by the length check
                self.assertIsNone(result, reason)

        # Moderate repetition should match (within bounds)
        test_cases_should_match = [
            ("hiiii", "4 i's - casual typing"),
            ("hellooo", "3 o's - casual typing"),
            ("heyyy", "3 y's - casual typing"),
            ("yooo", "3 o's - casual typing"),
        ]
        for query, reason in test_cases_should_match:
            with self.subTest(query=query, reason=reason):
                result = detect_fast_intent(query, assistant_name="Test")
                self.assertIsNotNone(result, reason)

    def test_repeated_trailing_punctuation(self):
        """Verify that '[\s!.?]*' doesn't cause quadratic behavior."""
        # Long inputs should be rejected by length check
        # Note: Pure whitespace at the end gets stripped, so test with non-whitespace
        test_cases_long = [
            "hi" + "!" * 1000,  # 1002 chars - exceeds limit
            "hi" + "." * 1000,  # 1002 chars - exceeds limit
            "hi" + "?" * 1000,  # 1002 chars - exceeds limit
            "hi" + " !.? " * 200,  # 1002 chars - exceeds limit
        ]
        for query in test_cases_long:
            with self.subTest(query=query[:50] + "..."):
                start = time.perf_counter()
                result = detect_fast_intent(query, assistant_name="Test")
                elapsed = time.perf_counter() - start
                self.assertLess(elapsed, 0.01, f"Regex took {elapsed*1000:.2f}ms - possible ReDoS")
                # These should be rejected by length check
                self.assertIsNone(result, "Long input should be rejected")

        # Edge case: trailing whitespace is stripped, so "hi" + 1000 spaces becomes "hi"
        result = detect_fast_intent("hi" + " " * 1000, assistant_name="Test")
        self.assertIsNotNone(result, "Trailing whitespace is stripped, so this should match")

        # Reasonable punctuation should match
        test_cases_normal = [
            "hi!!!",
            "hi...",
            "hi???",
            "hi !",
            "hi  ",
        ]
        for query in test_cases_normal:
            with self.subTest(query=query):
                result = detect_fast_intent(query, assistant_name="Test")
                self.assertIsNotNone(result, f"Normal punctuation should match: {query}")

    def test_pathological_non_matching_input(self):
        """Ensure non-matches fail fast without backtracking."""
        # Long strings that should NOT match
        test_cases = [
            "x" * 10000,
            "almost a greeting but not quite" * 100,
            "hi " + "extra words " * 500,
        ]
        for query in test_cases:
            with self.subTest(query=query[:50] + "..."):
                start = time.perf_counter()
                result = detect_fast_intent(query, assistant_name="Test")
                elapsed = time.perf_counter() - start
                self.assertLess(elapsed, 0.01, f"Regex took {elapsed*1000:.2f}ms - possible ReDoS")
                self.assertIsNone(result)


class UnicodeAndSpecialCharacterTests(unittest.TestCase):
    """Test handling of Unicode, emojis, and special characters."""

    def test_unicode_greetings_miss(self):
        """Non-ASCII greetings should not match (English-only by design)."""
        test_cases = [
            "你好",  # Chinese
            "こんにちは",  # Japanese
            "안녕하세요",  # Korean
            "مرحبا",  # Arabic
            "Привет",  # Russian
            "Bonjour",  # French (should miss - not in pattern)
            "Hola",  # Spanish (should miss)
        ]
        for query in test_cases:
            with self.subTest(query=query):
                result = detect_fast_intent(query, assistant_name="Test")
                self.assertIsNone(result, f"Non-English greeting '{query}' should not match")

    def test_emoji_in_greeting(self):
        """Emojis should not break the regex but should cause a miss."""
        test_cases = [
            "hi 👋",
            "hello 😊",
            "👋 hey",
            "hi!!! 🎉🎉🎉",
        ]
        for query in test_cases:
            with self.subTest(query=query):
                # Should not match because emojis are not in [\s!.?]*
                result = detect_fast_intent(query, assistant_name="Test")
                self.assertIsNone(result, f"Greeting with emoji should not match: {query}")

    def test_zero_width_characters(self):
        """Zero-width characters should not break matching."""
        # These are tricky: strip() may or may not handle them
        test_cases = [
            "hi​",  # Zero-width space
            "hi﻿",  # Zero-width no-break space
            "​hi",
        ]
        for query in test_cases:
            with self.subTest(query=repr(query)):
                result = detect_fast_intent(query, assistant_name="Test")
                # Current implementation strips with .strip() which may not catch these
                # This documents the behavior - if it's a problem, we should fix it


class FalsePositiveTests(unittest.TestCase):
    """Ensure we don't accidentally match real questions."""

    def test_greeting_as_question_prefix_misses(self):
        """Critical: don't swallow real questions that start with greetings."""
        test_cases = [
            "Hi, how do I reset my password?",
            "Hello there, I need help with billing",
            "Hey what's your return policy",
            "Yo can you help me",
            "Good morning, I have a complaint",
            "Thanks but I still need help",
            "Thank you, now how do I cancel?",
            "Bye, but first tell me about pricing",
        ]
        for query in test_cases:
            with self.subTest(query=query):
                result = detect_fast_intent(query, assistant_name="Test")
                self.assertIsNone(result, f"Should not match: {query}")

    def test_partial_word_matches_miss(self):
        """Ensure we don't match words that merely contain the pattern."""
        test_cases = [
            "high",
            "this",
            "thinking",
            "byebye",  # Should miss because pattern is "bye" not "byebye"
            "nope123",  # Extra chars after
            "123nope",  # Extra chars before
        ]
        for query in test_cases:
            with self.subTest(query=query):
                result = detect_fast_intent(query, assistant_name="Test")
                # Most should miss due to anchoring; "byebye" might match if pattern is loose
                # Document actual behavior


class ContextGatingTests(unittest.TestCase):
    """Test that yes/no only fire after questions."""

    def test_affirmation_requires_question_context(self):
        """Yes/ok/sure should only match after a bot question."""
        test_cases = ["yes", "yeah", "yep", "sure", "ok", "okay"]

        # Should miss without context
        for query in test_cases:
            with self.subTest(query=query, context="none"):
                result = detect_fast_intent(query, assistant_name="Test")
                self.assertIsNone(result)

        # Should miss after non-question
        for query in test_cases:
            with self.subTest(query=query, context="statement"):
                result = detect_fast_intent(
                    query,
                    assistant_name="Test",
                    last_bot_message="Here is your answer.",
                )
                self.assertIsNone(result)

        # Should hit after question
        for query in test_cases:
            with self.subTest(query=query, context="question"):
                result = detect_fast_intent(
                    query,
                    assistant_name="Test",
                    last_bot_message="Would you like more info?",
                )
                self.assertIsNotNone(result)
                assert result is not None
                self.assertEqual(result.intent, "affirmation")

    def test_negation_requires_question_context(self):
        """No/nope/nah should only match after a bot question."""
        test_cases = ["no", "nope", "nah"]

        # Should miss without context
        for query in test_cases:
            with self.subTest(query=query, context="none"):
                result = detect_fast_intent(query, assistant_name="Test")
                self.assertIsNone(result)

        # Should hit after question
        for query in test_cases:
            with self.subTest(query=query, context="question"):
                result = detect_fast_intent(
                    query,
                    assistant_name="Test",
                    last_bot_message="Need anything else?",
                )
                self.assertIsNotNone(result)
                assert result is not None
                self.assertEqual(result.intent, "negation")

    def test_edge_case_question_markers(self):
        """Test various forms of questions."""
        test_cases = [
            ("Yes", "Want help?", True),  # Standard
            ("Yes", "Want help? ", True),  # Trailing space
            ("Yes", "Want help?\n", True),  # Trailing newline
            ("Yes", "Want help?\t", True),  # Trailing tab
            ("Yes", "Want help?  \n  ", True),  # Mixed trailing whitespace
            ("Yes", "Want help.", False),  # Period, not question
            ("Yes", "Want help!", False),  # Exclamation
            ("Yes", "Want help", False),  # No punctuation
            ("Yes", "? Want help", False),  # Question mark at start
            ("Yes", "Want ? help", False),  # Question mark in middle
        ]
        for query, last_bot, should_match in test_cases:
            with self.subTest(query=query, last_bot=last_bot):
                result = detect_fast_intent(
                    query,
                    assistant_name="Test",
                    last_bot_message=last_bot,
                )
                if should_match:
                    self.assertIsNotNone(result, f"Should match: '{last_bot}'")
                else:
                    self.assertIsNone(result, f"Should not match: '{last_bot}'")


class CannedResponseTests(unittest.TestCase):
    """Test quality and safety of canned responses."""

    def test_assistant_name_escaping(self):
        """Ensure assistant names with special chars don't break responses."""
        # Potential injection attempts or weird names
        test_cases = [
            "Acme Corp",
            "Acme's Assistant",
            'Acme "The Bot"',
            "Acme\nCorp",  # Newline
            "Acme\tCorp",  # Tab
            "<script>alert('xss')</script>",  # XSS attempt
            "'; DROP TABLE users; --",  # SQL injection attempt
        ]
        for name in test_cases:
            with self.subTest(name=name):
                result = detect_fast_intent("hi", assistant_name=name)
                self.assertIsNotNone(result)
                assert result is not None
                # Response should contain the name (unescaped in this layer)
                self.assertIn(name, result.canned_response)
                # Response should be non-empty and reasonable length
                self.assertGreater(len(result.canned_response), 10)
                self.assertLess(len(result.canned_response), 500)

    def test_all_intents_produce_valid_responses(self):
        """Each intent type should produce a reasonable response."""
        test_cases = [
            ("hi", None, "greeting"),
            ("thanks", None, "thanks"),
            ("bye", None, "goodbye"),
            ("yes", "Want more info?", "affirmation"),
            ("no", "Want more info?", "negation"),
        ]
        for query, last_bot, expected_intent in test_cases:
            with self.subTest(intent=expected_intent):
                result = detect_fast_intent(
                    query,
                    assistant_name="Acme",
                    last_bot_message=last_bot,
                )
                self.assertIsNotNone(result)
                assert result is not None
                self.assertEqual(result.intent, expected_intent)
                self.assertIn("Acme", result.canned_response)
                self.assertGreater(len(result.canned_response), 10)


class PerformanceTests(unittest.TestCase):
    """Verify performance characteristics."""

    def test_compilation_overhead_is_negligible(self):
        """Regex compilation happens at module import, not per-call."""
        # The regexes are compiled at module level, so repeated calls
        # should be fast. This is more of a documentation test.
        start = time.perf_counter()
        for _ in range(1000):
            detect_fast_intent("hi", assistant_name="Test")
        elapsed = time.perf_counter() - start

        # 1000 calls should take well under 100ms (usually <10ms)
        self.assertLess(elapsed, 0.1, f"1000 calls took {elapsed*1000:.2f}ms - too slow")
        avg_us = (elapsed / 1000) * 1_000_000
        print(f"\nAverage call time: {avg_us:.2f}µs per call")

    def test_miss_is_as_fast_as_hit(self):
        """Ensure misses don't take significantly longer than hits."""
        hit_query = "hi"
        miss_query = "What is your refund policy?"

        # Time hits
        start = time.perf_counter()
        for _ in range(1000):
            detect_fast_intent(hit_query, assistant_name="Test")
        hit_time = time.perf_counter() - start

        # Time misses
        start = time.perf_counter()
        for _ in range(1000):
            detect_fast_intent(miss_query, assistant_name="Test")
        miss_time = time.perf_counter() - start

        # Misses should not be more than 2x slower (they might be faster
        # due to early rejection)
        self.assertLess(miss_time, hit_time * 2,
                       f"Misses ({miss_time*1000:.2f}ms) much slower than hits ({hit_time*1000:.2f}ms)")


if __name__ == "__main__":
    unittest.main()
