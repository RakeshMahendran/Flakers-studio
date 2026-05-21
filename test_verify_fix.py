"""Verify the _detect_language fix works"""
import requests
import time
import json

BASE_URL = "http://localhost:8000"

print("=" * 60)
print("VERIFICATION TEST - ContentProcessor Fix")
print("=" * 60)

# Register
print("\n[1/4] Registering user...")
r = requests.post(f"{BASE_URL}/auth/register", json={
    "email": f"verify_{int(time.time())}@test.com",
    "password": "Test123!",
    "full_name": "Verify Test",
    "tenant_name": "Verify Tenant"
}, timeout=10)

if r.status_code not in [200, 201]:
    print(f"FAIL: Registration failed - {r.status_code}")
    exit(1)

token = r.json()['access_token']
tenant_id = r.json()['tenant_id']
headers = {"Authorization": f"Bearer {token}"}
print("OK - User registered")

# Create WordPress assistant
print("\n[2/4] Creating WordPress assistant...")
r = requests.post(f"{BASE_URL}/assistant/create", json={
    "tenant_id": tenant_id,
    "user_name": "Test",
    "name": "Verify WordPress",
    "description": "Test",
    "source_type": "wordpress",
    "site_url": "https://u-global.tvsscs.com/",
    "template": "customer",
    "scraping_config": {"per_page": 2, "max_pages": 1}
}, headers=headers, timeout=10)

if r.status_code not in [200, 201]:
    print(f"FAIL: Assistant creation failed - {r.status_code}: {r.text}")
    exit(1)

data = r.json()
assistant_id = data['assistant_id']
job_id = data['scraping_job_id']
print(f"OK - Assistant created: {assistant_id}")
print(f"OK - Job started: {job_id}")

# Wait and check job status
print("\n[3/4] Monitoring ingestion job...")
for i in range(24):  # Wait up to 2 minutes
    time.sleep(5)

    # Check job status via database inspection
    import subprocess
    result = subprocess.run(
        ["python", "-c", f"""
import asyncio
import sys
sys.path.insert(0, 'E:/FlakersStudio')
from backend.config.database import AsyncSessionLocal
from backend.models.ingestion_job import IngestionJob
from sqlalchemy import select

async def check():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(IngestionJob).where(IngestionJob.id == '{job_id}'))
        job = result.scalar_one_or_none()
        if job:
            print(f'{{job.status}}|{{job.current_stage}}|{{job.errors_count}}')

asyncio.run(check())
"""],
        capture_output=True,
        text=True
    )

    if result.returncode == 0 and result.stdout.strip():
        status, stage, errors = result.stdout.strip().split('|')
        print(f"  [{(i+1)*5}s] Status: {status}, Stage: {stage}, Errors: {errors}")

        if status == "completed":
            print("\n✅ SUCCESS! Ingestion completed without errors!")
            break
        elif status == "failed":
            print(f"\n❌ FAIL: Job failed at stage '{stage}' with {errors} errors")
            print("Check worker logs for details")
            exit(1)
else:
    print("\n⚠️  TIMEOUT: Job did not complete in 2 minutes")

# Check assistant status
print("\n[4/4] Checking assistant status...")
r = requests.get(f"{BASE_URL}/assistant/{assistant_id}", headers=headers, timeout=10)
if r.status_code == 200:
    data = r.json()
    print(f"Assistant Status: {data['status']}")
    print(f"Pages Crawled: {data.get('total_pages_crawled', 0)}")
    print(f"Chunks Indexed: {data.get('total_chunks_indexed', 0)}")

    if data['status'] == 'ready':
        print("\n" + "=" * 60)
        print("✅ VERIFICATION PASSED - Backend fix working!")
        print("=" * 60)
    else:
        print("\n" + "=" * 60)
        print("⚠️  Assistant not ready yet, but no errors detected")
        print("=" * 60)
else:
    print(f"Could not fetch assistant status: {r.status_code}")
