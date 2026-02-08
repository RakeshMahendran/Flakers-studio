#!/bin/bash

# Memory-optimized startup script for Render.com (512MB RAM)

# Set Python to use less memory
export PYTHONUNBUFFERED=1
export PYTHONDONTWRITEBYTECODE=1
export MALLOC_TRIM_THRESHOLD_=100000

# Limit Python memory
export PYTHONMALLOC=malloc

# Start uvicorn with memory-optimized settings
exec uvicorn main:app \
  --host 0.0.0.0 \
  --port ${PORT:-10000} \
  --workers 1 \
  --limit-concurrency 10 \
  --timeout-keep-alive 5 \
  --no-access-log \
  --log-level warning
