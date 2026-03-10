import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from backend.services.auth import AuthService


class AuthServiceTests(unittest.TestCase):
    def test_hash_and_verify_password(self):
        password_hash = AuthService.hash_password("demo123")
        self.assertTrue(AuthService.verify_password("demo123", password_hash))
        self.assertFalse(AuthService.verify_password("wrong", password_hash))

    def test_access_token_round_trip(self):
        token = AuthService.create_access_token(
            user_id="11111111-1111-1111-1111-111111111111",
            tenant_id="22222222-2222-2222-2222-222222222222",
            email="demo@flakers.studio",
        )
        payload = AuthService.decode_token(token)
        self.assertEqual(payload["sub"], "11111111-1111-1111-1111-111111111111")
        self.assertEqual(payload["tenant_id"], "22222222-2222-2222-2222-222222222222")
        self.assertEqual(payload["type"], AuthService.access_token_type)

    def test_api_key_hash_and_verify(self):
        api_key = AuthService.generate_api_key("fsw_test")
        key_hash = AuthService.hash_api_key(api_key)
        self.assertTrue(AuthService.verify_api_key(api_key, key_hash))
        self.assertFalse(AuthService.verify_api_key("fsw_test.invalid", key_hash))


if __name__ == "__main__":
    unittest.main()
