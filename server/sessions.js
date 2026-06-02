// 会话持久化模块：JSON 文件读写，使用原子写入防止数据损坏
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '../.data');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');

// 确保数据目录存在
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// 从磁盘加载会话列表
export function loadSessions() {
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      const data = fs.readFileSync(SESSIONS_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading sessions:', error);
  }
  return [];
}

// 原子写入会话列表：先写临时文件再 rename，防止崩溃时损坏原文件
export function saveSessions(sessions) {
  try {
    const tmpFile = SESSIONS_FILE + '.tmp';
    fs.writeFileSync(tmpFile, JSON.stringify(sessions, null, 2), 'utf-8');
    fs.renameSync(tmpFile, SESSIONS_FILE);
  } catch (error) {
    console.error('Error saving sessions:', error);
  }
}

// 更新单个会话的指定字段
export function updateSession(sessionId, updates) {
  const sessions = loadSessions();
  const index = sessions.findIndex(s => s.id === sessionId);
  if (index !== -1) {
    sessions[index] = { ...sessions[index], ...updates };
    saveSessions(sessions);
    return sessions[index];
  }
  return null;
}
