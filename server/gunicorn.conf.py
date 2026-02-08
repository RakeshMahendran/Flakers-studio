# Gunicorn configuration for memory-constrained environments
import multiprocessing
import os

# Server socket
bind = "0.0.0.0:10000"
backlog = 64

# Worker processes - keep at 1 for 512MB RAM
workers = 1
worker_class = "uvicorn.workers.UvicornWorker"
worker_connections = 10
max_requests = 100  # Restart workers after 100 requests to prevent memory leaks
max_requests_jitter = 10
timeout = 120
keepalive = 5

# Memory management
preload_app = False  # Don't preload to save memory
daemon = False

# Logging
accesslog = "-"
errorlog = "-"
loglevel = "info"
access_log_format = '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s"'

# Process naming
proc_name = "flakers-studio"

# Server mechanics
pidfile = None
umask = 0
user = None
group = None
tmp_upload_dir = None

# SSL
keyfile = None
certfile = None
