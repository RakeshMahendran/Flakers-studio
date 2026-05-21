"""
Quick end-to-end test for WordPress scraping with complete RAG pipeline
"""
import requests
import json
import time

BASE_URL = "http://localhost:8000"

def main():
    print("\n>>> Testing Complete WordPress Scraping Pipeline...\n")

    # Step 1: Register user
    print("[1/6] Registering test user...")
    register_payload = {
        "email": f"quicktest_{int(time.time())}@flakers.test",
        "password": "TestPass123!",
        "full_name": "Quick Test",
        "tenant_name": "Quick Test Tenant"
    }

    response = requests.post(f"{BASE_URL}/auth/register", json=register_payload, timeout=10)
    if response.status_code not in [200, 201]:
        print(f"   [FAIL] Registration failed: {response.text}")
        return

    data = response.json()
    token = data.get('access_token')
    tenant_id = data.get('tenant_id')
    print(f"   [OK] User registered: {data.get('user_id')}")

    # Step 2: Create WordPress assistant
    print("\n[2/6] Creating WordPress assistant for TVSSCS...")
    assistant_payload = {
        "tenant_id": tenant_id,
        "user_name": "Quick Test",
        "name": "TVSSCS Quick Test",
        "description": "Quick test of WordPress scraping for TVSSCS UAT",
        "source_type": "wordpress",
        "site_url": "https://u-global.tvsscs.com/",
        "template": "customer",
        "scraping_config": {
            "per_page": 3,
            "max_pages": 1,
            "enable_html_fallback": True
        }
    }

    headers = {"Authorization": f"Bearer {token}"}
    response = requests.post(f"{BASE_URL}/assistant/create", json=assistant_payload, headers=headers, timeout=30)
    if response.status_code not in [200, 201]:
        print(f"   [FAIL] Assistant creation failed: {response.text}")
        return

    data = response.json()
    assistant_id = data.get('assistant_id')
    job_id = data.get('scraping_job_id')
    print(f"   [OK] Assistant created: {assistant_id}")
    print(f"   [OK] Scraping job started: {job_id}")

    # Step 3: Wait and poll for assistant readiness
    print("\n[3/6] Waiting for content ingestion to complete...")
    max_wait = 120  # 2 minutes max
    poll_interval = 5
    elapsed = 0

    while elapsed < max_wait:
        time.sleep(poll_interval)
        elapsed += poll_interval

        response = requests.get(f"{BASE_URL}/assistant/{assistant_id}", headers=headers, timeout=10)
        if response.status_code != 200:
            print(f"   [WARN] Failed to get assistant status: {response.status_code}")
            continue

        data = response.json()
        status = data.get('status')
        pages = data.get('total_pages_crawled', '0')
        chunks = data.get('total_chunks_indexed', '0')

        print(f"   [{elapsed}s] Status: {status}, Pages: {pages}, Chunks: {chunks}")

        if status == "ready":
            print(f"   [OK] Assistant is ready! ({elapsed}s)")
            break
        elif status == "error":
            print(f"   [FAIL] Assistant ingestion failed")
            print(f"   Error: {data.get('status_message')}")
            return
    else:
        print(f"   [WARN] Timeout waiting for assistant (waited {max_wait}s)")
        print(f"   [INFO] Continuing with test anyway...")

    # Step 4: Test RAG query
    print("\n[4/6] Testing RAG query...")
    chat_payload = {
        "assistant_id": assistant_id,
        "user_message": "What is TVSSCS and what services do they provide?"
    }

    response = requests.post(f"{BASE_URL}/chat/query", json=chat_payload, headers=headers, timeout=30)
    if response.status_code == 200:
        data = response.json()
        decision = data.get('decision')
        answer = data.get('answer', '')
        sources = data.get('sources', [])

        print(f"   [OK] Chat query successful")
        print(f"   Decision: {decision}")
        print(f"   Sources: {len(sources)} documents")
        print(f"   Answer preview: {answer[:150]}...")
    else:
        print(f"   [FAIL] Chat query failed: {response.status_code}")
        print(f"   Response: {response.text[:200]}")

    # Step 5: Test small talk (fast intent)
    print("\n[5/6] Testing fast intent classification...")
    chat_payload = {
        "assistant_id": assistant_id,
        "user_message": "Hello!"
    }

    start = time.time()
    response = requests.post(f"{BASE_URL}/chat/query", json=chat_payload, headers=headers, timeout=10)
    elapsed_ms = (time.time() - start) * 1000

    if response.status_code == 200:
        data = response.json()
        decision = data.get('decision')
        print(f"   [OK] Fast intent: {decision} ({int(elapsed_ms)}ms)")
    else:
        print(f"   [FAIL] Fast intent failed: {response.status_code}")

    # Step 6: Check chat history
    print("\n[6/6] Checking chat history...")
    response = requests.get(f"{BASE_URL}/chat/history", headers=headers, timeout=10)
    if response.status_code == 200:
        data = response.json()
        count = len(data) if isinstance(data, list) else 0
        print(f"   [OK] Chat history: {count} sessions")
    else:
        print(f"   [FAIL] Chat history failed: {response.status_code}")

    print("\n" + "="*60)
    print("COMPLETE END-TO-END TEST FINISHED")
    print("="*60)

if __name__ == "__main__":
    main()
