"""Unit tests for backend.retrieval.prompt_builder."""
from __future__ import annotations

import re
import sys
import unittest
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from backend.retrieval.prompt_builder import (  # noqa: E402
    detect_response_mode,
    get_filter_extraction_system_prompt,
    get_synthesis_system_prompt,
)


class DetectResponseModeTests(unittest.TestCase):
    def test_default_is_concise(self):
        self.assertEqual(detect_response_mode("What is your refund policy?"), "concise")
        self.assertEqual(detect_response_mode("How do I reset my password"), "concise")

    def test_empty_query_is_concise(self):
        self.assertEqual(detect_response_mode(""), "concise")

    def test_elaborate_triggers(self):
        self.assertEqual(detect_response_mode("Explain how billing works"), "elaborate")
        self.assertEqual(detect_response_mode("Tell me more about onboarding"), "elaborate")
        self.assertEqual(detect_response_mode("Walk me through this in detail"), "elaborate")
        self.assertEqual(detect_response_mode("Can you elaborate on that?"), "elaborate")
        self.assertEqual(detect_response_mode("I want a deep dive on the API"), "elaborate")

    def test_enumeration_triggers(self):
        self.assertEqual(detect_response_mode("List all integrations"), "enumeration")
        self.assertEqual(detect_response_mode("What are your pricing tiers?"), "enumeration")
        self.assertEqual(detect_response_mode("Show me all the features"), "enumeration")
        self.assertEqual(detect_response_mode("What services do you offer?"), "enumeration")
        self.assertEqual(detect_response_mode("What products are available?"), "enumeration")

    def test_elaborate_wins_over_enumeration(self):
        # If both triggers fire, the more specific request for depth wins.
        self.assertEqual(
            detect_response_mode("Explain all the pricing tiers in detail"),
            "elaborate",
        )

    def test_case_insensitive(self):
        self.assertEqual(detect_response_mode("EXPLAIN the architecture"), "elaborate")
        self.assertEqual(detect_response_mode("LIST all the things"), "enumeration")


class SynthesisPromptTests(unittest.TestCase):
    def test_current_date_is_present(self):
        prompt = get_synthesis_system_prompt("Acme")
        self.assertIn("CURRENT DATE:", prompt)
        # Today's UTC date (YYYY-MM-DD) must appear verbatim.
        today = datetime.utcnow().strftime("%Y-%m-%d")
        self.assertIn(today, prompt)

    def test_temporal_anchors_present(self):
        prompt = get_synthesis_system_prompt("Acme")
        year = datetime.utcnow().year
        self.assertIn(f"last year = {year - 1}", prompt)
        self.assertIn(f"two years ago = {year - 2}", prompt)
        self.assertIn("upcoming = date >", prompt)

    def test_assistant_name_is_used(self):
        prompt = get_synthesis_system_prompt("Acme Corp")
        self.assertIn("Acme Corp", prompt)

    def test_concise_mode_has_length_rule_and_anti_patterns(self):
        prompt = get_synthesis_system_prompt("Acme", mode="concise")
        self.assertIn("RESPONSE MODE: concise", prompt)
        self.assertIn("1-2 sentences", prompt)
        # Banned phrases must be explicitly listed.
        self.assertIn("Based on the context", prompt)
        self.assertIn("According to the information provided", prompt)
        self.assertIn("Don't apologize before answering", prompt)
        self.assertIn("I don't have specific information", prompt)

    def test_enumeration_mode_length_rule(self):
        prompt = get_synthesis_system_prompt("Acme", mode="enumeration")
        self.assertIn("RESPONSE MODE: enumeration", prompt)
        self.assertIn("Up to 8 bullets", prompt)
        self.assertIn("<=8 words", prompt)

    def test_elaborate_mode_length_rule(self):
        prompt = get_synthesis_system_prompt("Acme", mode="elaborate")
        self.assertIn("RESPONSE MODE: elaborate", prompt)
        self.assertIn("Multi-paragraph", prompt)
        self.assertIn("explicitly asked for detail", prompt)

    def test_invalid_mode_falls_back_to_concise(self):
        prompt = get_synthesis_system_prompt("Acme", mode="garbage")
        self.assertIn("RESPONSE MODE: concise", prompt)
        self.assertIn("1-2 sentences", prompt)

    def test_empty_assistant_name_uses_fallback(self):
        prompt = get_synthesis_system_prompt("")
        self.assertIn("this assistant", prompt)

    def test_grounding_rules_present(self):
        prompt = get_synthesis_system_prompt("Acme")
        self.assertIn("Answer ONLY from the retrieved context", prompt)
        self.assertIn("Never invent", prompt)


class FilterExtractionPromptTests(unittest.TestCase):
    def test_includes_current_date(self):
        prompt = get_filter_extraction_system_prompt()
        self.assertIn("CURRENT DATE:", prompt)
        today = datetime.utcnow().strftime("%Y-%m-%d")
        self.assertIn(today, prompt)

    def test_specifies_json_only_output(self):
        prompt = get_filter_extraction_system_prompt()
        self.assertIn("JSON", prompt)
        # Schema fields should be referenced.
        self.assertTrue(re.search(r"\bintents\b", prompt))
        self.assertTrue(re.search(r"\btime_range\b", prompt))
        self.assertTrue(re.search(r"\bkeywords\b", prompt))


if __name__ == "__main__":
    unittest.main()
