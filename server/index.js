import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { handleWebSocket } from './websocket-handler.js';
import { loadSessions, saveSessions } from './sessions.js';
import { initDefaultUser, login, logout, verifyToken, changePassword, cleanupSessions } from './auth.js';
import { getExternalTerminals } from './external-processes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

app.use(cors());
app.use(express.json());

// 初始化默认用户
initDefaultUser();

// 认证中间件
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const user = verifyToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.user = user;
  next();
}

// WebSocket 认证
function wsAuthMiddleware(ws, req, next) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const token = url.searchParams.get('token');
  
  if (!token) {
    ws.close(1008, 'Unauthorized');
    return;
  }

  const user = verifyToken(token);
  if (!user) {
    ws.close(1008, 'Invalid or expired token');
    return;
  }

  ws.user = user;
  next();
}

// 静态文件服务 (生产环境)
const distPath = path.join(__dirname, '../dist');
app.use(express.static(distPath));

// WebSocket 处理
wss.on('connection', (ws, req) => {
  // WebSocket 认证
  const url = new URL(req.url, `http://${req.headers.host}`);
  const token = url.searchParams.get('token');

  if (!token) {
    ws.close(1008, 'Unauthorized');
    return;
  }

  const user = verifyToken(token);
  if (!user) {
    ws.close(1008, 'Invalid or expired token');
    return;
  }

  ws.user = user;
  console.log(`Client connected: ${user.username}`);
  handleWebSocket(ws, wss, user);
});

// 心跳检测和会话清理
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) {
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
  // 清理过期认证会话
  cleanupSessions();
}, 30000);

wss.on('close', () => {
  clearInterval(interval);
});

// 公开路由
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const result = login(username, password);
  
  if (!result) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  
  res.json(result);
});

app.post('/api/auth/logout', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    logout(token);
  }
  res.json({ success: true });
});

// 需要认证的路由
app.get('/api/sessions', authMiddleware, (req, res) => {
  const sessions = loadSessions();
  res.json(sessions.map(s => ({
    id: s.id,
    name: s.name,
    shell: s.shell,
    createdAt: s.createdAt,
    status: s.status
  })));
});

app.post('/api/sessions', authMiddleware, (req, res) => {
  const { name, shell } = req.body;
  res.json({ message: 'Use WebSocket to create sessions' });
});

app.delete('/api/sessions/:id', authMiddleware, (req, res) => {
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

app.post('/api/auth/change-password', authMiddleware, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const success = changePassword(req.user.userId, oldPassword, newPassword);

  if (!success) {
    return res.status(400).json({ error: 'Invalid old password' });
  }

  res.json({ success: true });
});

// 外部终端列表
app.get('/api/external-terminals', authMiddleware, (req, res) => {
  try {
    // Get current PTY PIDs to exclude from process list
    const sessions = loadSessions();
    const externalTerminals = getExternalTerminals([]);
    res.json(externalTerminals);
  } catch (error) {
    console.error('Error getting external terminals:', error);
    res.status(500).json({ error: 'Failed to get external terminals' });
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
