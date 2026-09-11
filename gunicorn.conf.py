import os

# Gunicorn configuration file
# Automatically read by gunicorn on startup
bind = f"0.0.0.0:{os.environ.get('PORT', '5000')}"
workers = 1
worker_class = "gthread"
threads = 100
timeout = 120
keepalive = 5
