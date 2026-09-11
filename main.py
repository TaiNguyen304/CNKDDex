from flask import Flask, render_template
from flask_socketio import SocketIO, emit
import random

app = Flask(__name__)
socketio = SocketIO(app)

# Trạng thái của vòng quay
state = {
    'wheel_name': 'Wheel.png',
    'total_angle': 0
}


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/admin')
def admin():
    return render_template('admin.html')


@app.route('/viewer')
def viewer():
    return render_template('viewer.html')


# 1. Khi có người kết nối, gửi ngay trạng thái hiện tại
@socketio.on('connect')
def handle_connect():
    emit('sync_state', state)


# 2. Xử lý yêu cầu quay
@socketio.on('request_spin')
def handle_spin():
    # Tạo góc quay ngẫu nhiên: quay thêm từ 5 đến 10 vòng (1800 - 3600 độ)
    rotation = random.uniform(12, 20) * 360

    # Cộng dồn vào góc hiện tại
    state['total_angle'] += rotation

    # Phát lệnh cho tất cả các thiết bị (index, admin, viewer)
    emit('start_spin', {'total_angle': state['total_angle']}, broadcast=True)


# 3. Xử lý thay đổi nón
@socketio.on('request_change_wheel')
def handle_change_wheel(data):
    state['wheel_name'] = data['wheel_name']
    state['total_angle'] = 0  # Reset góc quay khi đổi nón
    emit('update_wheel', {'wheel_name': state['wheel_name']}, broadcast=True)


if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5000)