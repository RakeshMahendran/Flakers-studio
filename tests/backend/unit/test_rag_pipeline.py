import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from backend.retrieval.rag_pipeline import RAGPipeline


class RAGPipelineTests(unittest.TestCase):
    def test_small_talk_detection(self):
        self.assertTrue(RAGPipeline.is_small_talk("hello"))
        self.assertTrue(RAGPipeline.is_small_talk("thanks"))
        self.assertFalse(RAGPipeline.is_small_talk("Explain the pricing policy for enterprise plans"))

    def test_response_cleanup(self):
        cleaned = RAGPipeline.validate_and_clean_response("Hello,    I'd be happy to help with that.", "Flakers")
        self.assertNotIn("I'd be happy to", cleaned)
        self.assertTrue(cleaned.startswith("help") or cleaned.startswith("with"))


if __name__ == "__main__":
    unittest.main()
