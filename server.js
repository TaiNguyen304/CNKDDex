import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
  },
});

const PORT = 3000;

app.use(express.json());
app.use('/static', express.static(path.join(__dirname, 'static')));

// Quản lý đa phòng chơi trong bộ nhớ
const rooms = {};

function generateRoomData(customRoomId = null) {
  let roomId = customRoomId ? String(customRoomId) : null;
  if (!roomId) {
    while (true) {
      roomId = String(Math.floor(100000 + Math.random() * 900000));
      if (!rooms[roomId]) break;
    }
  }

  const p1Pass = String(Math.floor(1000 + Math.random() * 9000));
  const p2Pass = String(Math.floor(1000 + Math.random() * 9000));
  const p3Pass = String(Math.floor(1000 + Math.random() * 9000));

  const roomData = {
    room_id: roomId,
    passwords: {
      player1: p1Pass,
      player2: p2Pass,
      player3: p3Pass,
    },
    wheel_name: 'Wheel.png',
    total_angle: 0,
    active_player: 'none',
    spin_start_time: 0,
    spin_start_angle: 0,
    spin_target_angle: 0,
    spin_duration: 13370,
  };
  rooms[roomId] = roomData;
  return roomData;
}

function getOrCreateRoom(roomId) {
  const id = String(roomId).trim();
  if (rooms[id]) return rooms[id];
  return generateRoomData(id);
}

// Phòng mặc định 123456
const defaultRoom = generateRoomData('123456');
defaultRoom.passwords = { player1: '1111', player2: '2222', player3: '3333' };
rooms['123456'] = defaultRoom;

// Web routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'templates', 'index.html'));
});

app.get('/index.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'templates', 'index.html'));
});

app.get('/Controller', (req, res) => {
  res.sendFile(path.join(__dirname, 'templates', 'Controller.html'));
});

app.get('/Viewer', (req, res) => {
  res.sendFile(path.join(__dirname, 'templates', 'Viewer.html'));
});

app.get('/Player1', (req, res) => {
  res.sendFile(path.join(__dirname, 'templates', 'Player1.html'));
});

app.get('/Player2', (req, res) => {
  res.sendFile(path.join(__dirname, 'templates', 'Player2.html'));
});

app.get('/Player3', (req, res) => {
  res.sendFile(path.join(__dirname, 'templates', 'Player3.html'));
});

app.get('/templates/:name', (req, res) => {
  const filename = req.params.name.replace('.html', '').toLowerCase();
  const nameMap = {
    'index': 'index.html',
    'player1': 'Player1.html',
    'player2': 'Player2.html',
    'player3': 'Player3.html',
    'controller': 'Controller.html',
    'viewer': 'Viewer.html',
    'admin': 'Controller.html',
  };
  const target = nameMap[filename] || (req.params.name.endsWith('.html') ? req.params.name : `${req.params.name}.html`);
  res.sendFile(path.join(__dirname, 'templates', target));
});

// REST API tạo phòng
app.all(['/api/create_room', '/api/create_room/'], (req, res) => {
  const newRoom = generateRoomData();
  res.json({
    success: true,
    room_id: newRoom.room_id,
    passwords: newRoom.passwords,
    room: newRoom,
  });
});

// REST API xác thực vào phòng
app.post('/api/verify_auth', (req, res) => {
  const { room_id, role, auth } = req.body || {};
  const id = String(room_id || '').trim();
  const a = String(auth || '').trim();

  if (!id || !rooms[id]) {
    return res.status(400).json({ valid: false, message: 'Mã phòng không tồn tại!' });
  }

  const room = rooms[id];
  if (['player1', 'player2', 'player3'].includes(role)) {
    const correctAuth = String(room.passwords?.[role] || '');
    if (a === correctAuth) {
      return res.json({ valid: true, room_id: id, role });
    } else {
      return res.status(400).json({ valid: false, message: 'Mật khẩu không chính xác cho vị trí này!' });
    }
  } else if (role === 'viewer' || role === 'controller') {
    return res.json({ valid: true, room_id: id, role });
  }

  return res.status(400).json({ valid: false, message: 'Thông tin không hợp lệ!' });
});

// Socket.IO Handlers
io.on('connection', (socket) => {
  socket.on('join_game_room', (data) => {
    const roomId = String(data?.room_id || '').trim();
    const role = data?.role || '';
    const auth = String(data?.auth || '').trim();

    if (!roomId) {
      socket.emit('join_error', { message: 'Thiếu mã phòng!' });
      return;
    }

    if (role === 'controller') {
      const room = getOrCreateRoom(roomId);
      socket.join(roomId);
      const now = Date.now();
      const elapsed = room.spin_start_time > 0 ? Math.max(0, now - room.spin_start_time) : 0;
      socket.emit('room_info', room);
      socket.emit('sync_state', { ...room, server_time: now, elapsed });
      return;
    }

    if (!rooms[roomId]) {
      socket.emit('join_error', { message: 'Mã phòng không tồn tại!' });
      return;
    }

    const room = rooms[roomId];
    if (['player1', 'player2', 'player3'].includes(role)) {
      const correctPass = String(room.passwords?.[role] || '');
      if (auth !== correctPass) {
        socket.emit('join_error', { message: 'Mật khẩu phòng không đúng!' });
        return;
      }
    }

    socket.join(roomId);
    const now = Date.now();
    const elapsed = room.spin_start_time > 0 ? Math.max(0, now - room.spin_start_time) : 0;
    socket.emit('sync_state', { ...room, server_time: now, elapsed });
  });

  socket.on('controller_create_room', () => {
    const newRoom = generateRoomData();
    socket.join(newRoom.room_id);
    socket.emit('room_created', newRoom);
  });

  socket.on('set_active_player', (data) => {
    const roomId = String(data?.room_id || '').trim();
    const activePlayer = data?.active_player || 'none';
    if (roomId && rooms[roomId]) {
      rooms[roomId].active_player = activePlayer;
      io.to(roomId).emit('update_active_player', { active_player: activePlayer });
    }
  });

  socket.on('request_spin', (data) => {
    const roomId = String(data?.room_id || '').trim();
    if (!roomId || !rooms[roomId]) return;

    const room = rooms[roomId];
    const rotation = (Math.random() * (20 - 12) + 12) * 360;
    const startAngle = room.total_angle;
    room.total_angle += rotation;

    const now = Date.now();
    room.spin_start_time = now;
    room.spin_start_angle = startAngle;
    room.spin_target_angle = room.total_angle;
    room.spin_duration = 13370;

    io.to(roomId).emit('start_spin', {
      server_time: now,
      start_angle: room.spin_start_angle,
      target_angle: room.spin_target_angle,
      duration: room.spin_duration,
      total_angle: room.total_angle,
    });
  });

  socket.on('request_change_wheel', (data) => {
    const roomId = String(data?.room_id || '').trim();
    const wheelName = data?.wheel_name;
    if (roomId && rooms[roomId] && wheelName) {
      const room = rooms[roomId];
      room.wheel_name = wheelName;
      room.total_angle = 0;
      room.spin_start_time = 0;
      room.spin_start_angle = 0;
      room.spin_target_angle = 0;
      io.to(roomId).emit('update_wheel', { wheel_name: wheelName });
    }
  });

  socket.on('play_sfx', (data) => {
    const roomId = String(data?.room_id || '').trim();
    if (roomId) {
      io.to(roomId).emit('play_sfx', data);
    }
  });

  socket.on('stop_sfx', (data) => {
    const roomId = String(data?.room_id || '').trim();
    if (roomId) {
      io.to(roomId).emit('stop_sfx');
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on http://0.0.0.0:${PORT}`);
});
