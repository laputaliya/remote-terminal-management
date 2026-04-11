import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { handleWebSocket } from './websocket-handler.js';
import { loadSessions, saveSessions } from './sessions.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

app.use(cors());
app.use(express.json());

// 静态文件服务 (生产环境)
const distPath = path.join(__dirname, '../dist');
app.use(express.static(distPath));

// WebSocket 处理
wss.on('connection', (ws) => {
  console.log('Client connected');
  handleWebSocket(ws, wss);
});

// 心跳检测
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) {
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => {
  clearInterval(interval);
});

// API 路由
app.get('/api/sessions', (req, res) => {
  const sessions = loadSessions();
  res.json(sessions.map(s => ({
    id: s.id,
    name: s.name,
    shell: s.shell,
    createdAt: s.createdAt,
    status: s.status
  })));
});

app.post('/api/sessions', (req, res) => {
  const { name, shell } = req.body;
  // 会话创建通过 WebSocket 处理
  res.json({ message: 'Use WebSocket to create sessions' });
});

app.delete('/api/sessions/:id', (req, res) => {
  const { id } = req.params;
  const sessions = loadSessions();
  const index = sessions.findIndex(s => s.id === id);
  
  if (index !== -1) {
    sessions.splice(index, 1);
    saveSessions(sessions);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Session not found' });
  }
});

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// SPA 路由
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0'; // 监听所有网络接口

// 获取本机 IP 地址
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const localIP = getLocalIP();

server.listen(PORT, HOST, () => {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║     🖥️  Remote Terminal Manager                          ║
║                                                          ║
║     Local:    http://localhost:${PORT.toString().padEnd(20)}║
║     Network:  http://${localIP}:${PORT}                      ║
║                                                          ║
║     Close this window to stop the server                 ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
  `);
});

// 优雅关闭
process.on('SIGINT', () => {
  console.log('\nShutting down server...');
  wss.close();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
