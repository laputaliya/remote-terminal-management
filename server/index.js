// 服务入口：Express HTTP 服务器 + WebSocket + 认证中间件 + REST API 路由
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { handleWebSocket, sessions as wsSessions } from './websocket-handler.js';
import { loadSessions, saveSessions } from './sessions.js';
import { killPty } from './pty-manager.js';
import { initDefaultUser, login, logout, verifyToken, changePassword, cleanupSessions, loadUsers } from './auth.js';
import { getExternalTerminals } from './external-processes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// 安全中间件：Helmet 设置安全头，CORS 限制来源，JSON body 大小限制
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:3000' }));
app.use(express.json({ limit: '100kb' }));

// 初始化默认管理员用户（首次运行自动创建）
initDefaultUser();

// 认证中间件：从 Authorization 头提取 Bearer token 并验证
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const user = verifyToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // 如果用户尚未修改默认密码，只允许访问修改密码接口
  const users = loadUsers();
  const userRecord = users.find(u => u.id === user.userId);
  if (userRecord?.passwordChangeRequired && req.path !== '/api/auth/change-password') {
    return res.status(403).json({ error: 'Password change required' });
  }

  req.user = user;
  next();
}

// 静态文件服务 (生产环境)
const distPath = path.join(__dirname, '../dist');
app.use(express.static(distPath));

// WebSocket 连接处理：通过 URL 查询参数 ?token= 认证
wss.on('connection', (ws, req) => {
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

// 心跳检测（30 秒间隔）和过期会话清理
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) {
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
  cleanupSessions();
  // 清理过期的速率限制条目，防止内存无限增长
  const now = Date.now();
  for (const [ip, entry] of loginAttempts.entries()) {
    if (now - entry.start > LOGIN_RATE_LIMIT.windowMs) {
      loginAttempts.delete(ip);
    }
  }
}, 30000);

wss.on('close', () => {
  clearInterval(interval);
});

// 登录速率限制：每 IP 每分钟最多 10 次尝试
const loginAttempts = new Map();
const LOGIN_RATE_LIMIT = { windowMs: 60000, maxAttempts: 10 };

function checkLoginRateLimit(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now - entry.start > LOGIN_RATE_LIMIT.windowMs) {
    loginAttempts.set(ip, { start: now, count: 1 });
    return true;
  }
  entry.count++;
  if (entry.count > LOGIN_RATE_LIMIT.maxAttempts) {
    return false;
  }
  return true;
}

// ---- 公开路由（无需认证） ----

// POST /api/auth/login - 用户登录
app.post('/api/auth/login', (req, res) => {
  const ip = req.ip || req.socket.remoteAddress;
  if (!checkLoginRateLimit(ip)) {
    return res.status(429).json({ error: 'Too many login attempts. Please try again later.' });
  }
  const { username, password } = req.body;
  const result = login(username, password);

  if (!result) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  res.json(result);
});

// POST /api/auth/logout - 用户登出
app.post('/api/auth/logout', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    logout(token);
  }
  res.json({ success: true });
});

// ---- 需要认证的路由 ----

// GET /api/sessions - 获取所有会话列表
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

// POST /api/sessions - 创建会话（实际通过 WebSocket 创建，此处留提示）
app.post('/api/sessions', authMiddleware, (req, res) => {
  res.json({ message: 'Use WebSocket to create sessions' });
});

// DELETE /api/sessions/:id - 删除指定会话
app.delete('/api/sessions/:id', authMiddleware, (req, res) => {
  const { id } = req.params;

  // 以内存中的会话列表为准，避免磁盘数据滞后导致不一致
  const index = wsSessions.findIndex(s => s.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Session not found' });
  }

  killPty(id);
  wsSessions.splice(index, 1);
  // 将内存中的会话同步到磁盘
  const nonExternal = wsSessions.filter(s =>
    s.type !== 'tmux-external' && s.type !== 'screen-external'
  );
  saveSessions(nonExternal);
  res.json({ success: true });
});

// POST /api/auth/change-password - 修改密码
app.post('/api/auth/change-password', authMiddleware, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const success = changePassword(req.user.userId, oldPassword, newPassword);

  if (!success) {
    return res.status(400).json({ error: 'Invalid old password' });
  }

  res.json({ success: true });
});

// GET /api/external-terminals - 获取外部终端列表
app.get('/api/external-terminals', authMiddleware, (req, res) => {
  try {
    const externalTerminals = getExternalTerminals([]);
    res.json(externalTerminals);
  } catch (error) {
    console.error('Error getting external terminals:', error);
    res.status(500).json({ error: 'Failed to get external terminals' });
  }
});

// GET /api/health - 健康检查（无需认证，用于监控）
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// SPA 路由：所有非 API 请求返回 index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0'; // 监听所有网络接口

// 获取本机 IP 地址（用于启动日志显示）
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

// 优雅关闭：收到 SIGINT/SIGTERM 时关闭 WebSocket 和 HTTP 服务器
function gracefulShutdown(signal) {
  console.log(`\nReceived ${signal}, shutting down server...`);
  wss.close();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
