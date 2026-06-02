// 认证模块：用户管理、密码哈希、Token 签发与验证
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '../.data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'auth-sessions.json');

// 确保数据目录存在
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// 内存中的会话缓存（加速 token 验证，避免频繁磁盘读取）
const activeSessions = new Map();

// 生成 64 字节随机 token（不可缩短，安全要求）
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// 使用 PBKDF2 哈希密码（100,000 次迭代、SHA-256、16 字节 salt）
function hashPassword(password, salt = null) {
  if (!salt) {
    salt = crypto.randomBytes(16).toString('hex');
  }
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha256').toString('hex');
  return { salt, hash };
}

// 使用 timingSafeEqual 验证密码，防止时序攻击
function verifyPassword(password, salt, hash) {
  const { hash: computedHash } = hashPassword(password, salt);
  const bufA = Buffer.from(computedHash, 'hex');
  const bufB = Buffer.from(hash, 'hex');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// 从磁盘加载用户列表
export function loadUsers() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      const data = fs.readFileSync(USERS_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading users:', error);
  }
  return [];
}

// 原子写入用户列表（先写临时文件，再 rename，防止写入中断导致数据损坏）
function saveUsers(users) {
  try {
    const tmpFile = USERS_FILE + '.tmp';
    fs.writeFileSync(tmpFile, JSON.stringify(users, null, 2), 'utf-8');
    fs.renameSync(tmpFile, USERS_FILE);
  } catch (error) {
    console.error('Error saving users:', error);
  }
}

// 从磁盘加载认证会话，过滤已过期的
function loadAuthSessions() {
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      const data = fs.readFileSync(SESSIONS_FILE, 'utf-8');
      const sessions = JSON.parse(data);
      const now = Date.now();
      return sessions.filter(s => s.expiresAt > now);
    }
  } catch (error) {
    console.error('Error loading auth sessions:', error);
  }
  return [];
}

// 原子写入认证会话列表
function saveAuthSessions(sessions) {
  try {
    const tmpFile = SESSIONS_FILE + '.tmp';
    fs.writeFileSync(tmpFile, JSON.stringify(sessions, null, 2), 'utf-8');
    fs.renameSync(tmpFile, SESSIONS_FILE);
  } catch (error) {
    console.error('Error saving auth sessions:', error);
  }
}

// 初始化默认管理员用户（admin/admin，首次登录强制修改密码）
export function initDefaultUser() {
  const users = loadUsers();
  if (users.length === 0) {
    const { salt, hash } = hashPassword('admin');
    users.push({
      id: 'admin',
      username: 'admin',
      salt,
      hash,
      passwordChangeRequired: true,
      createdAt: new Date().toISOString()
    });
    saveUsers(users);
    console.log('Default user created: username=admin, password=admin');
  }
  // 限制数据文件和目录的权限，防止其他用户读取
  try { fs.chmodSync(DATA_DIR, 0o700); } catch (e) {}
  try { fs.chmodSync(USERS_FILE, 0o600); } catch (e) {}
}

// 用户登录，验证凭据并签发 token（7 天有效期）
export function login(username, password) {
  const users = loadUsers();
  const user = users.find(u => u.username === username);

  if (!user || !verifyPassword(password, user.salt, user.hash)) {
    return null;
  }

  const token = generateToken();
  const session = {
    token,
    userId: user.id,
    username: user.username,
    createdAt: Date.now(),
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7天过期
  };

  // 同时保存到内存（快速查询）和磁盘（持久化，服务重启后可恢复）
  activeSessions.set(token, session);
  const sessions = loadAuthSessions();
  sessions.push(session);
  saveAuthSessions(sessions);

  return { token, username: user.username, passwordChangeRequired: user.passwordChangeRequired || false };
}

// 验证 token 有效性（先查内存缓存，未命中再查磁盘）
export function verifyToken(token) {
  let session = activeSessions.get(token);

  if (!session) {
    const sessions = loadAuthSessions();
    session = sessions.find(s => s.token === token);
    if (session) {
      activeSessions.set(token, session);
    }
  }

  if (!session || session.expiresAt < Date.now()) {
    return null;
  }

  return { userId: session.userId, username: session.username };
}

// 登出：从内存和磁盘中移除会话 token
export function logout(token) {
  activeSessions.delete(token);
  const sessions = loadAuthSessions().filter(s => s.token !== token);
  saveAuthSessions(sessions);
}

// 修改密码（服务端强制校验密码长度，防止 API 直接调用绕过前端校验）
export function changePassword(userId, oldPassword, newPassword) {
  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
    return false;
  }

  const users = loadUsers();
  const user = users.find(u => u.id === userId);

  if (!user || !verifyPassword(oldPassword, user.salt, user.hash)) {
    return false;
  }

  const { salt, hash } = hashPassword(newPassword);
  user.salt = salt;
  user.hash = hash;
  delete user.passwordChangeRequired;
  saveUsers(users);
  return true;
}

// 定期清理过期的认证会话（由心跳定时器触发）
export function cleanupSessions() {
  const now = Date.now();
  const sessions = loadAuthSessions().filter(s => s.expiresAt > now);
  saveAuthSessions(sessions);

  for (const [token, session] of activeSessions.entries()) {
    if (session.expiresAt < now) {
      activeSessions.delete(token);
    }
  }
}
