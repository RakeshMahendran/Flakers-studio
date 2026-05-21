"""Quick test - just create an assistant and see if endpoint responds"""
import requests
import time

BASE_URL = "http://localhost:8000"

# Register
register_payload = {
    "email": f"quicktest_{int(time.time())}@test.com",
    "password": "Test123!",
    "full_name": "Quick Test",
    "tenant_name": "Quick Tenant"
}

print("Registering user...")
r = requests.post(f"{BASE_URL}/auth/register", json=register_payload, timeout=10)
print(f"Register status: {r.status_code}")
if r.status_code not in [200, 201]:
    print(f"Failed: {r.text}")
    exit(1)

token = r.json()['access_token']
tenant_id = r.json()['tenant_id']
headers = {"Authorization": f"Bearer {token}"}

# Create simple web assistant (not WordPress)
print("\nCreating assistant (5s timeout)...")
assistant_payload = {
    "tenant_id": tenant_id,
    "user_name": "Test",
    "name": "Quick Test",
    "description": "Test",
    "source_type": "website",
    "site_url": "https://example.com",
    "template": "customer",
    "scraping_config": {"max_pages": 1}
}

try:
    r = requests.post(f"{BASE_URL}/assistant/create", json=assistant_payload, headers=headers, timeout=5)
    print(f"Assistant create status: {r.status_code}")
    print(f"Response: {r.json()}")
except requests.exceptions.Timeout:
    print("TIMEOUT - endpoint hung for 5+ seconds")
except Exception as e:
    print(f"Error: {e}")
