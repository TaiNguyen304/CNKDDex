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

// Trạng thái của vòng quay
const state = {
  wheel_name: 'Wheel.png',
  total_angle: 0,
  active_player: 'none', // 'player1' | 'player2' | 'player3' | 'none'
  spin_start_time: 0,
  spin_start_angle: 0,
  spin_target_angle: 0,
  spin_duration: 15000,
};

// Serve static assets
app.use('/static', express.static(path.join(__dirname, 'static')));

// Web routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'templates', 'Controller.html'));
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

// Route truy cập theo dạng /templates/<tên_file.html> (hỗ trợ cả chữ hoa, chữ thường)
app.get('/templates/:name', (req, res) => {
  let filename = req.params.name.replace('.html', '');
  const nameMap = {
    'player1': 'Player1.html',
    'player2': 'Player2.html',
    'player3': 'Player3.html',
    'controller': 'Controller.html',
    'viewer': 'Viewer.html',
    'admin': 'Controller.html',
    'index': 'Player1.html'
  };
  const target = nameMap[filename.toLowerCase()] || (req.params.name.endsWith('.html') ? req.params.name : `${req.params.name}.html`);
  res.sendFile(path.join(__dirname, 'templates', target));
});

// Socket.IO real-time handlers
io.on('connection', (socket) => {
  // 1. Khi có người kết nối, gửi ngay trạng thái hiện tại
  socket.emit('sync_state', state);

  // 2. Xử lý gán lượt cho Player (từ Controller)
  socket.on('set_active_player', (data) => {
    state.active_player = data?.active_player || 'none';
    io.emit('update_active_player', { active_player: state.active_player });
  });

  // 3. Xử lý yêu cầu quay
  socket.on('request_spin', () => {
    // Tạo góc quay ngẫu nhiên: quay thêm từ 12 đến 20 vòng (12*360 - 20*360)
    const rotation = (Math.random() * (20 - 12) + 12) * 360;
    const startAngle = state.total_angle;

    // Cộng dồn vào góc hiện tại
    state.total_angle += rotation;
    state.spin_start_time = Date.now();
    state.spin_start_angle = startAngle;
    state.spin_target_angle = state.total_angle;
    state.spin_duration = 15000;

    // Phát lệnh cho tất cả các thiết bị (Player1, Player2, Player3, Controller, Viewer)
    io.emit('start_spin', {
      start_time: state.spin_start_time,
      start_angle: state.spin_start_angle,
      target_angle: state.spin_target_angle,
      duration: state.spin_duration,
      total_angle: state.total_angle,
    });
  });

  // 4. Xử lý thay đổi nón
  socket.on('request_change_wheel', (data) => {
    if (data && data.wheel_name) {
      state.wheel_name = data.wheel_name;
      state.total_angle = 0; // Reset góc quay khi đổi nón
      state.spin_start_time = 0;
      state.spin_start_angle = 0;
      state.spin_target_angle = 0;
      io.emit('update_wheel', { wheel_name: state.wheel_name });
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on http://0.0.0.0:${PORT}`);
});
