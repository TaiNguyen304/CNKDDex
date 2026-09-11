import os
import random
import time
from flask import Flask, render_template, request, jsonify, abort
from flask_socketio import SocketIO, emit, join_room

app = Flask(__name__, template_folder='templates', static_folder='static')
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'secret-wheel-key-123')

# Cho phép kết nối CORS từ mọi domain
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet')

# Quản lý đa phòng chơi trong bộ nhớ
# rooms = { room_id: { 'passwords': {...}, 'wheel_name': ..., 'total_angle': ..., ... } }
rooms = {}

def generate_room_data(custom_room_id=None):
    """Tạo mã phòng 6 chữ số và 3 mật khẩu 4 chữ số cho 3 Người chơi"""
    if custom_room_id:
        room_id = str(custom_room_id)
    else:
        # Sinh 6 chữ số ngẫu nhiên
        while True:
            room_id = f"{random.randint(100000, 999999)}"
            if room_id not in rooms:
                break

    p1_pass = f"{random.randint(1000, 9999)}"
    p2_pass = f"{random.randint(1000, 9999)}"
    p3_pass = f"{random.randint(1000, 9999)}"

    room_data = {
        'room_id': room_id,
        'passwords': {
            'player1': p1_pass,
            'player2': p2_pass,
            'player3': p3_pass
        },
        'wheel_name': 'Wheel.png',
        'total_angle': 0,
        'active_player': 'none',  # 'player1' | 'player2' | 'player3' | 'none'
        'spin_start_time': 0,
        'spin_start_angle': 0,
        'spin_target_angle': 0,
        'spin_duration': 13370
    }
    rooms[room_id] = room_data
    return room_data

def get_or_create_room(room_id):
    room_id = str(room_id).strip()
    if room_id in rooms:
        return rooms[room_id]
    return generate_room_data(room_id)

# Tạo sẵn 1 phòng mặc định '123456' để test nếu cần
default_room = generate_room_data('123456')
default_room['passwords'] = {'player1': '1111', 'player2': '2222', 'player3': '3333'}
rooms['123456'] = default_room

# 1. Các route giao diện chính
@app.route('/')
def index_route():
    return render_template('index.html')

@app.route('/index.html')
def index_html_route():
    return render_template('index.html')

@app.route('/Controller')
def controller_route():
    return render_template('Controller.html')

@app.route('/Viewer')
def viewer_route():
    return render_template('Viewer.html')

@app.route('/Player1')
def player1_route():
    return render_template('Player1.html')

@app.route('/Player2')
def player2_route():
    return render_template('Player2.html')

@app.route('/Player3')
def player3_route():
    return render_template('Player3.html')

# 2. Route truy cập qua /templates/<tên_file.html>
@app.route('/templates/<path:template_name>')
def render_template_by_name(template_name):
    clean_name = template_name.replace('.html', '').lower()
    name_map = {
        'index': 'index.html',
        'player1': 'Player1.html',
        'player2': 'Player2.html',
        'player3': 'Player3.html',
        'controller': 'Controller.html',
        'viewer': 'Viewer.html',
        'admin': 'Controller.html'
    }
    target = name_map.get(clean_name, template_name if template_name.endswith('.html') else f"{template_name}.html")
    try:
        return render_template(target)
    except Exception:
        abort(404)

# 3. API kiểm tra đăng nhập / phòng
@app.route('/api/verify_auth', methods=['POST'])
def api_verify_auth():
    data = request.get_json() or {}
    room_id = str(data.get('room_id', '')).strip()
    role = data.get('role', '')  # 'player1', 'player2', 'player3', 'viewer', 'controller'
    auth = str(data.get('auth', '')).strip()

    if not room_id or room_id not in rooms:
        return jsonify({'valid': False, 'message': 'Mã phòng không tồn tại!'}), 400

    room = rooms[room_id]
    if role in ['player1', 'player2', 'player3']:
        correct_auth = str(room['passwords'].get(role, ''))
        if auth == correct_auth:
            return jsonify({'valid': True, 'room_id': room_id, 'role': role})
        else:
            return jsonify({'valid': False, 'message': 'Mật khẩu không chính xác cho vị trí này!'}), 400
    elif role == 'viewer':
        return jsonify({'valid': True, 'room_id': room_id, 'role': 'viewer'})
    elif role == 'controller':
        return jsonify({'valid': True, 'room_id': room_id, 'role': 'controller'})

    return jsonify({'valid': False, 'message': 'Thông tin không hợp lệ!'}), 400

# 4. Socket.IO Real-time Handlers với Room Scoping
@socketio.on('join_game_room')
def handle_join_game_room(data):
    room_id = str(data.get('room_id', '')).strip()
    role = data.get('role', '')  # 'controller' | 'viewer' | 'player1' | 'player2' | 'player3'
    auth = str(data.get('auth', '')).strip()

    if not room_id:
        emit('join_error', {'message': 'Thiếu mã phòng!'})
        return

    # Nếu controller muốn tạo hoặc kết nối phòng
    if role == 'controller':
        room = get_or_create_room(room_id)
        join_room(room_id)
        current_ms = int(time.time() * 1000)
        elapsed = max(0, current_ms - room['spin_start_time']) if room['spin_start_time'] > 0 else 0
        sync_data = dict(room)
        sync_data['server_time'] = current_ms
        sync_data['elapsed'] = elapsed
        emit('room_info', room)
        emit('sync_state', sync_data)
        return

    if room_id not in rooms:
        emit('join_error', {'message': 'Mã phòng không tồn tại!'})
        return

    room = rooms[room_id]

    # Kiểm tra mật khẩu nếu là Player
    if role in ['player1', 'player2', 'player3']:
        correct_pass = str(room['passwords'].get(role, ''))
        if auth != correct_pass:
            emit('join_error', {'message': 'Mật khẩu phòng không đúng!'})
            return

    join_room(room_id)
    current_ms = int(time.time() * 1000)
    elapsed = max(0, current_ms - room['spin_start_time']) if room['spin_start_time'] > 0 else 0

    sync_data = dict(room)
    sync_data['server_time'] = current_ms
    sync_data['elapsed'] = elapsed
    # Khi Player mới reload/vào trễ, client sẽ tự động khóa nút quay
    emit('sync_state', sync_data)

@socketio.on('controller_create_room')
def handle_controller_create_room(data=None):
    new_room = generate_room_data()
    room_id = new_room['room_id']
    join_room(room_id)
    emit('room_created', new_room)

@socketio.on('set_active_player')
def handle_set_active_player(data):
    room_id = str(data.get('room_id', '')).strip()
    active_player = data.get('active_player', 'none')
    if room_id and room_id in rooms:
        rooms[room_id]['active_player'] = active_player
        emit('update_active_player', {'active_player': active_player}, to=room_id)

@socketio.on('request_spin')
def handle_spin(data=None):
    if not data:
        return
    room_id = str(data.get('room_id', '')).strip()
    if not room_id or room_id not in rooms:
        return

    room = rooms[room_id]
    # Tạo góc quay ngẫu nhiên từ 12 đến 20 vòng (12*360 - 20*360)
    rotation = random.uniform(12, 20) * 360
    start_angle = room['total_angle']
    room['total_angle'] += rotation
    
    current_ms = int(time.time() * 1000)
    room['spin_start_time'] = current_ms
    room['spin_start_angle'] = start_angle
    room['spin_target_angle'] = room['total_angle']
    room['spin_duration'] = 13370  # Khớp chính xác với độ dài 13.37s của Sound.mp3

    emit('start_spin', {
        'server_time': current_ms,
        'start_angle': room['spin_start_angle'],
        'target_angle': room['spin_target_angle'],
        'duration': room['spin_duration'],
        'total_angle': room['total_angle']
    }, to=room_id)

@socketio.on('request_change_wheel')
def handle_change_wheel(data):
    room_id = str(data.get('room_id', '')).strip()
    wheel_name = data.get('wheel_name')
    if room_id and room_id in rooms and wheel_name:
        room = rooms[room_id]
        room['wheel_name'] = wheel_name
        room['total_angle'] = 0  # Reset góc quay khi đổi nón
        room['spin_start_time'] = 0
        room['spin_start_angle'] = 0
        room['spin_target_angle'] = 0
        emit('update_wheel', {'wheel_name': room['wheel_name']}, to=room_id)

@socketio.on('play_sfx')
def handle_play_sfx(data):
    if not data:
        return
    room_id = str(data.get('room_id', '')).strip()
    sound_file = data.get('sound_file', '')
    sound_name = data.get('sound_name', '')
    if room_id and room_id in rooms and sound_file:
        emit('play_sfx', {
            'sound_file': sound_file,
            'sound_name': sound_name
        }, to=room_id)

@socketio.on('stop_sfx')
def handle_stop_sfx(data):
    if not data:
        return
    room_id = str(data.get('room_id', '')).strip()
    if room_id and room_id in rooms:
        emit('stop_sfx', {}, to=room_id)


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    socketio.run(app, host='0.0.0.0', port=port, debug=False)
