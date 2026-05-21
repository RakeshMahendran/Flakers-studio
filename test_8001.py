"""Test on port 8001"""
import requests
import time
import sys

BASE_URL = "http://localhost:8001"

print("=" * 60)
print("END-TO-END TEST ON PORT 8001")
print("=" * 60)

# Register
print("\n[1/4] Registering user...")
r = requests.post(f"{BASE_URL}/auth/register", json={
    "email": f"test8001_{int(time.time())}@test.com",
    "password": "Test123!",
    "full_name": "Test User",
    "tenant_name": "Test Tenant"
}, timeout=10)

if r.status_code not in [200, 201]:
    print(f"FAIL: {r.status_code} - {r.text}")
    sys.exit(1)

token = r.json()['access_token']
tenant_id = r.json()['tenant_id']
headers = {"Authorization": f"Bearer {token}"}
print(f"OK - User registered")

# Create WordPress assistant
print("\n[2/4] Creating WordPress assistant for TVSSCS...")
r = requests.post(f"{BASE_URL}/assistant/create", json={
    "tenant_id": tenant_id,
    "user_name": "Test",
    "name": "TVSSCS Test",
    "description": "Test WordPress",
    "source_type": "wordpress",
    "site_url": "https://u-global.tvsscs.com/",
    "template": "customer",
    "scraping_config": {"per_page": 2, "max_pages": 1}
}, headers=headers, timeout=10)

if r.status_code not in [200, 201]:
    print(f"FAIL: {r.status_code} - {r.text}")
    sys.exit(1)

data = r.json()
assistant_id = data['assistant_id']
job_id = data['scraping_job_id']
print(f"OK - Assistant: {assistant_id}")
print(f"OK - Job: {job_id}")

# Monitor for 90 seconds
print("\n[3/4] Monitoring ingestion progress...")
last_status = None
for i in range(18):
    time.sleep(5)
    r = requests.get(f"{BASE_URL}/assistant/{assistant_id}", headers=headers, timeout=10)
    if r.status_code == 200:
        d = r.json()
        status = d.get('status')
        pages = d.get('total_pages_crawled', 0)
        chunks = d.get('total_chunks_indexed', 0)
        msg = d.get('status_message', '')
        if status != last_status or i % 3 == 0:
            print(f"  [{(i+1)*5}s] Status: {status}, Pages: {pages}, Chunks: {chunks}")
            if msg and msg != "":
                print(f"        Message: {msg[:100]}")
            last_status = status

        if status == "ready":
            print("\nSUCCESS - Assistant is ready!")
            break
        elif status == "error":
            print(f"\nFAIL - Status is error")
            print(f"Message: {msg}")
            sys.exit(1)

# Test chat
print("\n[4/4] Testing chat query...")
r = requests.post(f"{BASE_URL}/chat/query", json={
    "assistant_id": assistant_id,
    "user_message": "What is TVSSCS?"
}, headers=headers, timeout=30)

if r.status_code == 200:
    d = r.json()
    print(f"OK - Chat response received")
    print(f"  Decision: {d.get('decision')}")
    print(f"  Sources: {len(d.get('sources', []))}")
    print(f"  Answer: {d.get('answer', '')[:200]}")
else:
    print(f"INFO - Chat failed (expected if not ready): {r.status_code}")
    print(f"  Response: {r.text[:200]}")

print("\n" + "=" * 60)
print("TEST COMPLETE")
print("=" * 60)
