import unittest
from pathlib import Path
import sys
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from backend.ingestion.status_updater import build_job_status_payload


class IngestionStatusTests(unittest.TestCase):
    def test_build_job_status_payload_uses_real_job_fields(self):
        job = SimpleNamespace(
            id="job-1",
            assistant_id="assistant-1",
            status="running",
            current_stage="ingestion",
            total_urls_discovered=10,
            pages_processed_count=6,
            chunks_created_count=20,
            chunks_uploaded=5,
            urls_scraped=8,
            errors_count=0,
            error_details=[],
            cancellation_requested=False,
            cancellation_reason=None,
            cancelled_at=None,
            started_at=None,
            completed_at=None,
            can_restart=False,
            can_cancel=True,
        )

        payload = build_job_status_payload(job)

        self.assertEqual(payload["progress_percentage"], 25)
        self.assertEqual(payload["pages_processed"], 6)
        self.assertEqual(payload["chunks_created"], 20)
        self.assertEqual(payload["chunks_uploaded"], 5)
        self.assertTrue(payload["can_cancel"])

    def test_build_job_status_payload_marks_failed_job_retryable(self):
        job = SimpleNamespace(
            id="job-2",
            assistant_id="assistant-2",
            status="failed",
            current_stage="failed",
            total_urls_discovered=5,
            pages_processed_count=2,
            chunks_created_count=0,
            chunks_uploaded=0,
            urls_scraped=2,
            errors_count=1,
            error_details=[{"error": "boom"}],
            cancellation_requested=False,
            cancellation_reason=None,
            cancelled_at=None,
            started_at=None,
            completed_at=None,
            can_restart=True,
            can_cancel=False,
        )

        payload = build_job_status_payload(job)

        self.assertTrue(payload["retryable"])
        self.assertTrue(payload["can_restart"])
        self.assertEqual(payload["progress_percentage"], 40)


if __name__ == "__main__":
    unittest.main()
