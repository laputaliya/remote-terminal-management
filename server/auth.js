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

// 内存中的会话缓存
const activeSessions = new Map();

// 生成随机 token
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// 哈希密码
function hashPassword(password, salt = null) {
  if (!salt) {
    salt = crypto.randomBytes(16).toString('hex');
  }
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha256').toString('hex');
  return { salt, hash };
}

// 验证密码
function verifyPassword(password, salt, hash) {
  const { hash: computedHash } = hashPassword(password, salt);
  return computedHash === hash;
}

// 加载用户
function loadUsers() {
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

// 保存用户
function saveUsers(users) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error saving users:', error);
  }
}

// 加载认证会话
function loadAuthSessions() {
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      const data = fs.readFileSync(SESSIONS_FILE, 'utf-8');
      const sessions = JSON.parse(data);
      // 过滤掉过期的会话
      const now = Date.now();
      return sessions.filter(s => s.expiresAt > now);
    }
  } catch (error) {
    console.error('Error loading auth sessions:', error);
  }
  return [];
}

// 保存认证会话
function saveAuthSessions(sessions) {
  try {
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error saving auth sessions:', error);
  }
}

// 初始化默认用户
export function initDefaultUser() {
  const users = loadUsers();
  if (users.length === 0) {
    const { salt, hash } = hashPassword('admin');
    users.push({
      id: 'admin',
      username: 'admin',
      salt,
      hash,
      createdAt: new Date().toISOString()
    });
    saveUsers(users);
    console.log('Default user created: username=admin, password=admin');
  }
}

// 登录
export function login(username, password) {
  const users = loadUsers();
  const user = users.find(u => u.username === username);
  
  if (!user || !verifyPassword(password, user.salt, user.hash)) {
    return null;
  }

  // 创建会话
  const token = generateToken();
  const session = {
    token,
    userId: user.id,
    username: user.username,
    createdAt: Date.now(),
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7天过期
  };

  // 保存到内存和文件
  activeSessions.set(token, session);
  const sessions = loadAuthSessions();
  sessions.push(session);
  saveAuthSessions(sessions);

  return { token, username: user.username };
}

// 验证 token
export function verifyToken(token) {
  // 先查内存
  let session = activeSessions.get(token);
  
  if (!session) {
    // 再查文件
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

// 登出
export function logout(token) {
  activeSessions.delete(token);
  const sessions = loadAuthSessions().filter(s => s.token !== token);
  saveAuthSessions(sessions);
}

// 修改密码
export function changePassword(userId, oldPassword, newPassword) {
  const users = loadUsers();
  const user = users.find(u => u.id === userId);
  
  if (!user || !verifyPassword(oldPassword, user.salt, user.hash)) {
    return false;
  }

  const { salt, hash } = hashPassword(newPassword);
  user.salt = salt;
  user.hash = hash;
  saveUsers(users);
  return true;
}

// 清理过期会话
export function cleanupSessions() {
  const now = Date.now();
  const sessions = loadAuthSessions().filter(s => s.expiresAt > now);
  saveAuthSessions(sessions);
  
  // 清理内存中的过期会话
  for (const [token, session] of activeSessions.entries()) {
    if (session.expiresAt < now) {
      activeSessions.delete(token);
    }
  }
}
