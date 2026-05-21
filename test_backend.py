"""
Comprehensive Backend Testing Script for FlakersStudio
Tests all endpoints, creates mock data, and validates functionality
"""
import requests
import json
import time
from datetime import datetime

BASE_URL = "http://localhost:8000"
TEST_REPORT = []

def log_test(test_name, status, details="", response_time=0):
    """Log test results"""
    result = {
        "test": test_name,
        "status": status,
        "details": details,
        "response_time_ms": round(response_time * 1000, 2),
        "timestamp": datetime.now().isoformat()
    }
    TEST_REPORT.append(result)

    icon = "[OK]" if status == "PASS" else "[FAIL]" if status == "FAIL" else "[WARN]"
    print(f"{icon} {test_name}: ({round(response_time * 1000)}ms)")
    if details:
        print(f"   > {details}")

def test_health_check():
    """Test 1: Health Check"""
    try:
        start = time.time()
        response = requests.get(f"{BASE_URL}/health", timeout=5)
        elapsed = time.time() - start

        if response.status_code == 200:
            data = response.json()
            log_test("Health Check", "PASS", f"Service: {data.get('service')}", elapsed)
            return True
        else:
            log_test("Health Check", "FAIL", f"Status: {response.status_code}", elapsed)
            return False
    except Exception as e:
        log_test("Health Check", "FAIL", str(e), 0)
        return False

def test_register_user():
    """Test 2: User Registration"""
    try:
        start = time.time()
        payload = {
            "email": f"test_{int(time.time())}@flakers.test",
            "password": "TestPass123!",
            "full_name": "Test User",
            "tenant_name": "Test Tenant"
        }

        response = requests.post(f"{BASE_URL}/auth/register", json=payload, timeout=10)
        elapsed = time.time() - start

        if response.status_code in [200, 201]:
            data = response.json()
            log_test("User Registration", "PASS", f"User ID: {data.get('user_id')}", elapsed)
            return data.get('access_token'), data.get('user_id'), data.get('tenant_id')
        else:
            log_test("User Registration", "FAIL", f"Status: {response.status_code}, Response: {response.text[:200]}", elapsed)
            return None, None, None
    except Exception as e:
        log_test("User Registration", "FAIL", str(e), 0)
        return None, None, None

def test_login(email, password):
    """Test 3: User Login"""
    try:
        start = time.time()
        payload = {
            "email": email,
            "password": password
        }

        response = requests.post(f"{BASE_URL}/auth/login", json=payload, timeout=10)
        elapsed = time.time() - start

        if response.status_code == 200:
            data = response.json()
            log_test("User Login", "PASS", f"Token type: {data.get('token_type')}", elapsed)
            return data.get('access_token')
        else:
            log_test("User Login", "FAIL", f"Status: {response.status_code}", elapsed)
            return None
    except Exception as e:
        log_test("User Login", "FAIL", str(e), 0)
        return None

def test_create_assistant(token, tenant_id):
    """Test 4: Create Assistant"""
    try:
        start = time.time()
        payload = {
            "tenant_id": tenant_id,
            "user_name": "Test User",
            "name": "Test Assistant",
            "description": "Automated test assistant for FlakersStudio",
            "source_type": "wordpress",
            "site_url": "https://u-global.tvsscs.com/",
            "template": "customer",
            "scraping_config": {
                "per_page": 5,
                "max_pages": 2,
                "enable_html_fallback": True
            }
        }

        headers = {"Authorization": f"Bearer {token}"}
        response = requests.post(f"{BASE_URL}/assistant/create", json=payload, headers=headers, timeout=30)
        elapsed = time.time() - start

        if response.status_code in [200, 201]:
            data = response.json()
            log_test("Create Assistant (WordPress)", "PASS", f"Assistant ID: {data.get('assistant_id')}, Job ID: {data.get('scraping_job_id')}", elapsed)
            return data.get('assistant_id'), data.get('scraping_job_id')
        else:
            log_test("Create Assistant (WordPress)", "FAIL", f"Status: {response.status_code}, Response: {response.text[:200]}", elapsed)
            return None, None
    except Exception as e:
        log_test("Create Assistant (WordPress)", "FAIL", str(e), 0)
        return None, None

def test_list_assistants(token):
    """Test 5: List Assistants"""
    try:
        start = time.time()
        headers = {"Authorization": f"Bearer {token}"}
        response = requests.get(f"{BASE_URL}/assistant", headers=headers, timeout=10)
        elapsed = time.time() - start

        if response.status_code == 200:
            data = response.json()
            count = data.get('total', 0)
            log_test("List Assistants", "PASS", f"Found {count} assistants", elapsed)
            return True
        else:
            log_test("List Assistants", "FAIL", f"Status: {response.status_code}", elapsed)
            return False
    except Exception as e:
        log_test("List Assistants", "FAIL", str(e), 0)
        return False

def test_get_assistant(token, assistant_id):
    """Test 6: Get Assistant Details"""
    try:
        start = time.time()
        headers = {"Authorization": f"Bearer {token}"}
        response = requests.get(f"{BASE_URL}/assistant/{assistant_id}", headers=headers, timeout=10)
        elapsed = time.time() - start

        if response.status_code == 200:
            data = response.json()
            log_test("Get Assistant", "PASS", f"Status: {data.get('status')}, Pages: {data.get('total_pages_crawled')}", elapsed)
            return data
        else:
            log_test("Get Assistant", "FAIL", f"Status: {response.status_code}", elapsed)
            return None
    except Exception as e:
        log_test("Get Assistant", "FAIL", str(e), 0)
        return None

def test_chat_query(token, assistant_id):
    """Test 7: Chat Query (RAG Pipeline)"""
    try:
        start = time.time()
        payload = {
            "assistant_id": assistant_id,
            "user_message": "What is TVSSCS and what services do they provide?"
        }

        headers = {"Authorization": f"Bearer {token}"}
        response = requests.post(f"{BASE_URL}/chat/query",
                                json=payload, headers=headers, timeout=30)
        elapsed = time.time() - start

        if response.status_code == 200:
            data = response.json()
            answer_preview = data.get('answer', '')[:100] if data.get('answer') else 'No answer'
            decision = data.get('decision', 'unknown')
            sources_count = len(data.get('sources', []))
            log_test("Chat Query (RAG)", "PASS", f"Decision: {decision}, Sources: {sources_count}, Answer: {answer_preview}...", elapsed)
            return data
        else:
            log_test("Chat Query (RAG)", "FAIL", f"Status: {response.status_code}, Response: {response.text[:200]}", elapsed)
            return None
    except Exception as e:
        log_test("Chat Query (RAG)", "FAIL", str(e), 0)
        return None

def test_small_talk(token, assistant_id):
    """Test 8: Fast Intent Classification (Small Talk)"""
    try:
        start = time.time()
        payload = {
            "assistant_id": assistant_id,
            "user_message": "Hi there!"
        }

        headers = {"Authorization": f"Bearer {token}"}
        response = requests.post(f"{BASE_URL}/chat/query", json=payload, headers=headers, timeout=10)
        elapsed = time.time() - start

        if response.status_code == 200:
            data = response.json()
            decision = data.get('decision', 'unknown')
            # Fast intent should respond very quickly (< 500ms ideally)
            if elapsed < 1.0 and decision == "SMALL_TALK":
                log_test("Fast Intent (Small Talk)", "PASS", f"Decision: {decision} in {round(elapsed*1000)}ms", elapsed)
                return True
            else:
                log_test("Fast Intent (Small Talk)", "WARN", f"Decision: {decision}, Time: {round(elapsed*1000)}ms (expected < 1000ms)", elapsed)
                return False
        else:
            log_test("Fast Intent (Small Talk)", "FAIL", f"Status: {response.status_code}", elapsed)
            return False
    except Exception as e:
        log_test("Fast Intent (Small Talk)", "FAIL", str(e), 0)
        return False

def test_create_generic_website_assistant(token, tenant_id):
    """Test 9: Create Assistant for Generic Website"""
    try:
        start = time.time()
        payload = {
            "tenant_id": tenant_id,
            "user_name": "Test User",
            "name": "Example.com Assistant",
            "description": "Test assistant for generic website scraping",
            "source_type": "website",
            "site_url": "https://example.com",
            "template": "support",
            "scraping_config": {
                "max_pages": 3,
                "crawl_depth": 1
            }
        }

        headers = {"Authorization": f"Bearer {token}"}
        response = requests.post(f"{BASE_URL}/assistant/create", json=payload, headers=headers, timeout=30)
        elapsed = time.time() - start

        if response.status_code in [200, 201]:
            data = response.json()
            log_test("Create Assistant (Generic Web)", "PASS", f"Assistant ID: {data.get('assistant_id')}, Job ID: {data.get('scraping_job_id')}", elapsed)
            return data.get('assistant_id')
        else:
            log_test("Create Assistant (Generic Web)", "FAIL", f"Status: {response.status_code}, Response: {response.text[:200]}", elapsed)
            return None
    except Exception as e:
        log_test("Create Assistant (Generic Web)", "FAIL", str(e), 0)
        return None

def test_chat_history(token):
    """Test 10: Chat History"""
    try:
        start = time.time()
        headers = {"Authorization": f"Bearer {token}"}
        response = requests.get(f"{BASE_URL}/chat/history", headers=headers, timeout=10)
        elapsed = time.time() - start

        if response.status_code == 200:
            data = response.json()
            count = len(data) if isinstance(data, list) else 0
            log_test("Chat History", "PASS", f"Found {count} chat sessions", elapsed)
            return True
        else:
            log_test("Chat History", "FAIL", f"Status: {response.status_code}", elapsed)
            return False
    except Exception as e:
        log_test("Chat History", "FAIL", str(e), 0)
        return False

def test_auth_me(token):
    """Test 11: Get Current User (/auth/me)"""
    try:
        start = time.time()
        headers = {"Authorization": f"Bearer {token}"}
        response = requests.get(f"{BASE_URL}/auth/me", headers=headers, timeout=10)
        elapsed = time.time() - start

        if response.status_code == 200:
            data = response.json()
            log_test("Auth: Get Current User", "PASS", f"User: {data.get('email')}, Tenant: {data.get('tenant_name')}", elapsed)
            return True
        else:
            log_test("Auth: Get Current User", "FAIL", f"Status: {response.status_code}", elapsed)
            return False
    except Exception as e:
        log_test("Auth: Get Current User", "FAIL", str(e), 0)
        return False

def generate_report():
    """Generate final test report"""
    print("\n" + "="*80)
    print("BACKEND TEST REPORT - FlakersStudio")
    print("="*80)

    total = len(TEST_REPORT)
    passed = sum(1 for t in TEST_REPORT if t['status'] == 'PASS')
    failed = sum(1 for t in TEST_REPORT if t['status'] == 'FAIL')
    warned = sum(1 for t in TEST_REPORT if t['status'] == 'WARN')

    print(f"\nTotal Tests: {total}")
    print(f"[OK] Passed: {passed}")
    print(f"[FAIL] Failed: {failed}")
    print(f"[WARN] Warnings: {warned}")
    print(f"Success Rate: {round((passed/total)*100, 1)}%")

    avg_response = sum(t['response_time_ms'] for t in TEST_REPORT if t['response_time_ms'] > 0) / max(1, len([t for t in TEST_REPORT if t['response_time_ms'] > 0]))
    print(f"Avg Response Time: {round(avg_response, 2)}ms")

    print("\n" + "-"*80)
    print("DETAILED RESULTS:")
    print("-"*80)

    for result in TEST_REPORT:
        icon = "[OK]" if result['status'] == 'PASS' else "[FAIL]" if result['status'] == 'FAIL' else "[WARN]"
        print(f"{icon} {result['test']}")
        print(f"   Status: {result['status']}")
        print(f"   Time: {result['response_time_ms']}ms")
        if result['details']:
            print(f"   Details: {result['details']}")
        print()

    # Save to file
    with open('backend_test_report.json', 'w') as f:
        json.dump(TEST_REPORT, f, indent=2)
    print(f"\n[FILE] Full report saved to: backend_test_report.json")

def main():
    """Run all tests"""
    print("\n>>> Starting FlakersStudio Backend Tests...\n")

    # Test 1: Health Check
    if not test_health_check():
        print("\n[FAIL] Backend is not healthy. Stopping tests.")
        generate_report()
        return

    # Test 2: Register User
    token, user_id, tenant_id = test_register_user()
    if not token:
        print("\n[WARN] Could not register user. Some tests will be skipped.")
        generate_report()
        return

    # Store credentials for potential login test
    test_email = f"test_{int(time.time()-5)}@flakers.test"
    test_password = "TestPass123!"

    # Test 11: Auth Me
    test_auth_me(token)

    # Test 4: Create Assistant (WordPress - TVSSCS)
    assistant_id, job_id = test_create_assistant(token, tenant_id)
    if assistant_id:
        print(f"   [INFO] WordPress scraping job started. Job ID: {job_id}")
        print(f"   [WAIT] Waiting 15 seconds for indexing...")
        time.sleep(15)

        # Test 6: Get Assistant Details
        assistant_data = test_get_assistant(token, assistant_id)

    # Test 5: List Assistants
    test_list_assistants(token)

    # Test 7: Chat Query (RAG) - only if assistant exists
    if assistant_id:
        chat_response = test_chat_query(token, assistant_id)

        # Test 8: Small Talk
        test_small_talk(token, assistant_id)

        # Test 10: Chat History
        test_chat_history(token)

    # Test 9: Create Generic Website Assistant
    generic_assistant_id = test_create_generic_website_assistant(token, tenant_id)
    if generic_assistant_id:
        print(f"   [INFO] Generic website scraping started for example.com")

    # Generate Report
    generate_report()

if __name__ == "__main__":
    main()
