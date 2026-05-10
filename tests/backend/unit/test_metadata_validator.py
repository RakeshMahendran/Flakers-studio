"""Unit tests for backend.ingestion.metadata_validator."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from backend.ingestion.metadata_validator import (
    validate_metadata,
    validate_metadata_size,
    MetadataValidationError,
)


class ValidateMetadataTests(unittest.TestCase):
    """Test metadata validation against schema."""

    def test_valid_metadata_passes(self):
        metadata = {
            "year": 2024,
            "month": 3,
            "category_ids": ["12", "34"],
            "is_event": True,
            "event_location": "London",
        }
        result = validate_metadata(metadata, strict=True)
        self.assertEqual(result, metadata)

    def test_unknown_keys_filtered_in_non_strict_mode(self):
        metadata = {
            "year": 2024,
            "unknown_field": "should be removed",
            "another_bad_key": 123,
        }
        result = validate_metadata(metadata, strict=False)
        self.assertEqual(result, {"year": 2024})
        self.assertNotIn("unknown_field", result)

    def test_unknown_keys_raise_in_strict_mode(self):
        metadata = {"year": 2024, "unknown_field": "bad"}
        with self.assertRaises(MetadataValidationError) as cm:
            validate_metadata(metadata, strict=True)
        self.assertIn("Unknown key: unknown_field", str(cm.exception))

    def test_type_coercion_for_strings(self):
        metadata = {"post_id": 12345}  # int instead of str
        result = validate_metadata(metadata, strict=False)
        self.assertEqual(result["post_id"], "12345")
        self.assertIsInstance(result["post_id"], str)

    def test_type_coercion_for_integers(self):
        metadata = {"year": "2024", "month": "3"}
        result = validate_metadata(metadata, strict=False)
        self.assertEqual(result["year"], 2024)
        self.assertEqual(result["month"], 3)

    def test_type_coercion_for_booleans(self):
        test_cases = [
            ({"is_event": 1}, True),
            ({"is_event": "true"}, True),
            ({"is_event": "yes"}, True),
            ({"is_event": 0}, False),
            ({"is_event": "false"}, False),
        ]
        for input_meta, expected in test_cases:
            with self.subTest(input=input_meta):
                result = validate_metadata(input_meta, strict=False)
                self.assertEqual(result["is_event"], expected)

    def test_invalid_list_type_rejected(self):
        metadata = {"category_ids": "not-a-list"}
        result = validate_metadata(metadata, strict=False)
        self.assertNotIn("category_ids", result)

    def test_list_with_non_string_items_rejected(self):
        metadata = {"category_ids": [12, 34, "56"]}
        result = validate_metadata(metadata, strict=False)
        # Should be rejected because not all items are strings
        self.assertNotIn("category_ids", result)

    def test_empty_metadata_returns_empty(self):
        self.assertEqual(validate_metadata({}, strict=True), {})

    def test_non_dict_input_returns_empty_in_non_strict_mode(self):
        self.assertEqual(validate_metadata(None, strict=False), {})
        self.assertEqual(validate_metadata("bad", strict=False), {})
        self.assertEqual(validate_metadata([1, 2, 3], strict=False), {})

    def test_non_dict_input_raises_in_strict_mode(self):
        with self.assertRaises(MetadataValidationError):
            validate_metadata(None, strict=True)


class ValidateMetadataSizeTests(unittest.TestCase):
    """Test metadata size validation."""

    def test_small_metadata_passes(self):
        metadata = {
            "year": 2024,
            "category_ids": ["1", "2", "3"],
            "event_location": "London",
        }
        self.assertTrue(validate_metadata_size(metadata, max_size_bytes=1000))

    def test_large_metadata_fails(self):
        # Create metadata with very long string
        large_location = "A" * 100_000
        metadata = {"event_location": large_location}
        self.assertFalse(validate_metadata_size(metadata, max_size_bytes=50_000))

    def test_empty_metadata_passes(self):
        self.assertTrue(validate_metadata_size({}))
        self.assertTrue(validate_metadata_size(None))


class EdgeCaseTests(unittest.TestCase):
    """Test edge cases and defensive behavior."""

    def test_nested_dict_rejected(self):
        # Nested dicts are not allowed in schema
        metadata = {"year": 2024, "nested": {"key": "value"}}
        result = validate_metadata(metadata, strict=False)
        # "nested" should be filtered out as unknown key
        self.assertEqual(result, {"year": 2024})

    def test_multiple_validation_errors_accumulated(self):
        metadata = {
            "year": "not-a-number",
            "category_ids": "not-a-list",
            "unknown_key": "value",
        }
        with self.assertRaises(MetadataValidationError) as cm:
            validate_metadata(metadata, strict=True)
        error_msg = str(cm.exception)
        self.assertIn("year:", error_msg)
        self.assertIn("category_ids:", error_msg)


if __name__ == "__main__":
    unittest.main()
