// 服务入口：Express HTTP 服务器 + WebSocket + 认证中间件 + REST API 路由
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import os from 'os';
import fs from 'fs';
import multer from 'multer';
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

const uploadDir = path.join(os.tmpdir(), 'rtm-uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true, mode: 0o700 });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => {
      const safeName = path.basename(file.originalname).replace(/\0/g, '');
      cb(null, `${Date.now()}-${safeName}`);
    }
  }),
  limits: { fileSize: 100 * 1024 * 1024 }
});

// 允许访问的目录根路径白名单
const ALLOWED_FS_ROOTS = ['/', os.homedir(), '/tmp'];

function isPathWithinAllowed(targetPath) {
  try {
    const resolved = path.resolve(targetPath);
    const real = fs.realpathSync(resolved);
    return ALLOWED_FS_ROOTS.some(root => {
      const rel = path.relative(root, real);
      return !rel.startsWith('..') && !path.isAbsolute(rel);
    });
  } catch {
    return false;
  }
}

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
  for (const [userId, entry] of uploadAttempts.entries()) {
    if (now - entry.start > UPLOAD_RATE_LIMIT.windowMs) {
      uploadAttempts.delete(userId);
    }
  }
  for (const [userId, entry] of listAttempts.entries()) {
    if (now - entry.start > LIST_RATE_LIMIT.windowMs) {
      listAttempts.delete(userId);
    }
  }
}, 30000);

wss.on('close', () => {
  clearInterval(interval);
});

// 上传速率限制：每用户每分钟最多 20 次
const uploadAttempts = new Map();
const UPLOAD_RATE_LIMIT = { windowMs: 60000, maxAttempts: 20 };

function checkUploadRateLimit(userId) {
  const now = Date.now();
  const entry = uploadAttempts.get(userId);
  if (!entry || now - entry.start > UPLOAD_RATE_LIMIT.windowMs) {
    uploadAttempts.set(userId, { start: now, count: 1 });
    return true;
  }
  entry.count++;
  return entry.count <= UPLOAD_RATE_LIMIT.maxAttempts;
}

// 目录列表速率限制：每用户每分钟最多 120 次
const listAttempts = new Map();
const LIST_RATE_LIMIT = { windowMs: 60000, maxAttempts: 120 };

function checkListRateLimit(userId) {
  const now = Date.now();
  const entry = listAttempts.get(userId);
  if (!entry || now - entry.start > LIST_RATE_LIMIT.windowMs) {
    listAttempts.set(userId, { start: now, count: 1 });
    return true;
  }
  entry.count++;
  return entry.count <= LIST_RATE_LIMIT.maxAttempts;
}

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

// POST /api/upload - 文件上传
app.post('/api/upload', authMiddleware, upload.single('file'), (req, res) => {
  if (!checkUploadRateLimit(req.user.userId)) {
    return res.status(429).json({ error: 'Too many upload requests. Please try again later.' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'No file provided' });
  }

  try {
    let targetDir = req.body.targetDir;
    if (!targetDir || typeof targetDir !== 'string' || targetDir.trim() === '') {
      targetDir = os.homedir();
    }

    if (!isPathWithinAllowed(targetDir)) {
      return res.status(403).json({ error: 'Invalid or inaccessible directory' });
    }

    const resolved = path.resolve(targetDir);

    if (!fs.existsSync(resolved)) {
      return res.status(400).json({ error: 'Invalid or inaccessible directory' });
    }

    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) {
      return res.status(400).json({ error: 'Invalid or inaccessible directory' });
    }

    try {
      fs.accessSync(resolved, fs.constants.W_OK);
    } catch {
      return res.status(403).json({ error: 'Invalid or inaccessible directory' });
    }

    let filename = path.basename(req.file.originalname).replace(/\0/g, '');
    if (!filename || filename === '.' || filename === '..' || filename.length > 255) {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    const uploadedPath = req.file.path;
    let fullPath = path.join(resolved, filename);

    if (fs.existsSync(fullPath)) {
      const ext = path.extname(filename);
      const base = filename.slice(0, -ext.length || undefined);
      let counter = 1;
      let found = false;
      while (counter <= 1000) {
        const newName = `${base} (${counter})${ext}`;
        fullPath = path.join(resolved, newName);
        if (!fs.existsSync(fullPath)) {
          filename = newName;
          found = true;
          break;
        }
        counter++;
      }
      if (!found) {
        return res.status(500).json({ error: 'Could not generate unique filename' });
      }
    }

    fs.copyFileSync(uploadedPath, fullPath);
    try { fs.unlinkSync(uploadedPath); } catch { }
    res.json({ success: true, filePath: fullPath, filename });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// GET /api/fs/list - 列出目录内容
app.get('/api/fs/list', authMiddleware, (req, res) => {
  if (!checkListRateLimit(req.user.userId)) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }

  try {
    let targetDir = req.query.dir;
    if (!targetDir || typeof targetDir !== 'string' || targetDir.trim() === '') {
      targetDir = os.homedir();
    }

    if (!isPathWithinAllowed(targetDir)) {
      return res.status(403).json({ error: 'Invalid or inaccessible directory' });
    }

    const resolved = path.resolve(targetDir);

    if (!fs.existsSync(resolved)) {
      return res.status(400).json({ error: 'Invalid or inaccessible directory' });
    }

    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) {
      return res.status(400).json({ error: 'Invalid or inaccessible directory' });
    }

    const showHidden = req.query.showHidden === 'true';
    const entries = fs.readdirSync(resolved, { withFileTypes: true });
    const items = [];

    for (const entry of entries) {
      if (!showHidden && entry.name.startsWith('.')) continue;

      const result = { name: entry.name, type: 'unknown', size: null, mtime: null };

      try {
        const fullPath = path.join(resolved, entry.name);
        const entryStat = fs.statSync(fullPath);
        result.mtime = entryStat.mtime.toISOString();

        if (entry.isDirectory()) {
          result.type = 'directory';
        } else if (entry.isFile()) {
          result.type = 'file';
          result.size = entryStat.size;
        } else if (entry.isSymbolicLink()) {
          try {
            const targetStat = fs.statSync(fullPath);
            result.type = targetStat.isDirectory() ? 'directory' : 'file';
            if (targetStat.isFile()) result.size = targetStat.size;
          } catch {
            result.type = 'symlink';
          }
        }
      } catch { }

      items.push(result);
    }

    items.sort((a, b) => {
      if (a.type === 'directory' && b.type !== 'directory') return -1;
      if (a.type !== 'directory' && b.type === 'directory') return 1;
      return a.name.localeCompare(b.name);
    });

    res.json({ dir: resolved, items });
  } catch (error) {
    console.error('Error listing directory:', error);
    res.status(500).json({ error: 'Failed to list directory' });
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
