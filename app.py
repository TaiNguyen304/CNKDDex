import os
from main import app, socketio

# WSGI application object for Gunicorn / Render
# When Render runs `gunicorn app:app`, it uses this `app`
application = app

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    socketio.run(app, host='0.0.0.0', port=port, debug=False)
