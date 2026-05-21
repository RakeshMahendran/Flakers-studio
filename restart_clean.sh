#!/bin/bash
# Complete clean restart of FlakersStudio backend

echo "=== FlakersStudio Clean Restart ==="

# 1. Kill all processes
echo "[1/5] Killing all server and worker processes..."
ps aux | grep -E "server/main.py|ingestion_worker" | grep -v grep | awk '{print $2}' | xargs kill -9 2>/dev/null
sleep 2

# 2. Clear all Python bytecode cache
echo "[2/5] Clearing Python bytecode cache..."
find backend server -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null
find backend server -name "*.pyc" -delete 2>/dev/null

# 3. Touch all modified Python files to force recompilation
echo "[3/5] Touching modified source files..."
touch backend/ingestion/content_processor.py
touch backend/ingestion/content_discovery.py
touch backend/assistants/service.py

# 4. Start server
echo "[4/5] Starting backend server..."
export PYTHONPATH="/e/FlakersStudio"
server/venv/Scripts/python.exe server/main.py > server_CLEAN.log 2>&1 &
sleep 8

# 5. Start worker
echo "[5/5] Starting ingestion worker..."
export PYTHONPATH="/e/FlakersStudio"
server/venv/Scripts/python.exe backend/workers/ingestion_worker.py --legacy > worker_CLEAN.log 2>&1 &
sleep 4

echo ""
echo "=== Startup Complete ==="
echo ""
curl -s http://localhost:8000/health
echo ""
echo ""
echo "Logs:"
echo "  Server: server_CLEAN.log"
echo "  Worker: worker_CLEAN.log"
