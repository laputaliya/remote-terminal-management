// PTY 进程管理器：创建、写入、调整大小、终止伪终端进程
import * as pty from 'node-pty';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';

const processes = new Map();
const outputBuffers = new Map();
const MAX_BUFFER_SIZE = 100000;
let broadcastCallback = null;
let exitCallback = null;

// 设置会话退出回调，通知 websocket-handler 清理会话
export function setExitCallback(callback) {
  exitCallback = callback;
}

// 允许传递给子进程的环境变量白名单，防止泄露敏感信息
const ALLOWED_ENV_KEYS = ['PATH', 'HOME', 'USER', 'LOGNAME', 'LANG', 'SHELL', 'TERM', 'COLORTERM'];

function buildSafeEnv(extra = {}) {
  const env = {};
  for (const key of ALLOWED_ENV_KEYS) {
    if (process.env[key] !== undefined) {
      env[key] = process.env[key];
    }
  }
  return { ...env, ...extra };
}

// 设置广播回调，用于向所有 WebSocket 客户端发送终端输出
export function setBroadcastCallback(callback) {
  broadcastCallback = callback;
}

// 允许的 shell 白名单，防止执行任意命令
const ALLOWED_SHELLS = new Set([
  '/bin/bash', '/bin/sh', '/bin/zsh', '/bin/dash', '/bin/fish',
  '/bin/tcsh', '/bin/csh', '/bin/ksh',
  '/usr/bin/bash', '/usr/bin/sh', '/usr/bin/zsh', '/usr/bin/dash', '/usr/bin/fish',
  '/usr/local/bin/bash', '/usr/local/bin/zsh', '/usr/local/bin/fish',
  '/opt/homebrew/bin/bash', '/opt/homebrew/bin/zsh', '/opt/homebrew/bin/fish'
]);

// 解析并验证 shell 真实路径，确保其在白名单中
function resolveAndValidateShell(shellPath) {
  try {
    const realPath = fs.realpathSync(shellPath);
    if (!ALLOWED_SHELLS.has(realPath)) {
      throw new Error(`Shell not in allowlist: ${shellPath} -> ${realPath}`);
    }
    fs.accessSync(realPath, fs.constants.X_OK);
    return realPath;
  } catch (e) {
    throw new Error(`Invalid or disallowed shell: ${shellPath} (${e.message})`);
  }
}

// 获取系统默认 shell
function getDefaultShell() {
  if (process.platform === 'win32') {
    return process.env.COMSPEC || 'powershell.exe';
  }
  return process.env.SHELL || '/bin/bash';
}

// 创建 PTY 进程并注册输出/退出回调
export function createPty(id, shell = null) {
  const sessionId = id || uuidv4();
  const rawShell = shell || getDefaultShell();

  // 验证 shell 路径是否在白名单中
  let shellPath;
  try {
    shellPath = resolveAndValidateShell(rawShell);
  } catch (e) {
    throw new Error(`Shell validation failed: ${e.message}`);
  }

  console.log(`Creating PTY for session ${sessionId} with shell: ${shellPath}`);

  try {
    const ptyProcess = pty.spawn(shellPath, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: process.env.HOME || process.env.USERPROFILE || '/',
      env: buildSafeEnv({
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor'
      })
    });

    processes.set(sessionId, ptyProcess);

    // 监听 PTY 数据输出，广播给所有客户端并保存历史缓冲区
    ptyProcess.onData((data) => {
      // 保存到环形缓冲区（保留最近的数据）
      let buffer = outputBuffers.get(sessionId);
      if (!buffer) {
        buffer = '';
      }
      buffer += data;
      if (buffer.length > MAX_BUFFER_SIZE) {
        buffer = buffer.slice(-MAX_BUFFER_SIZE);
      }
      outputBuffers.set(sessionId, buffer);

      if (broadcastCallback) {
        broadcastCallback(sessionId, data);
      }
    });

    // 监听 PTY 进程退出，清理进程和缓冲区
    ptyProcess.onExit(({ exitCode, signal }) => {
      console.log(`Session ${sessionId} exited with code ${exitCode}, signal ${signal}`);
      processes.delete(sessionId);
      outputBuffers.delete(sessionId);
      if (exitCallback) exitCallback(sessionId);
    });

    return sessionId;
  } catch (error) {
    console.error(`Failed to create PTY for session ${sessionId}:`, error);
    throw error;
  }
}

// 向指定会话的 PTY 写入数据（用户键盘输入）
export function writeToPty(sessionId, data) {
  const ptyProcess = processes.get(sessionId);
  if (ptyProcess) {
    ptyProcess.write(data);
  }
}

// 调整 PTY 窗口大小（终端行列数变化时调用）
export function resizePty(sessionId, cols, rows) {
  const ptyProcess = processes.get(sessionId);
  if (ptyProcess) {
    try {
      ptyProcess.resize(cols, rows);
    } catch (error) {
      console.error(`Failed to resize PTY ${sessionId}:`, error);
    }
  }
}

// 终止 PTY 进程并清理相关资源
export function killPty(sessionId) {
  const ptyProcess = processes.get(sessionId);
  if (ptyProcess) {
    try {
      ptyProcess.kill();
      console.log(`Killed PTY for session ${sessionId}`);
    } catch (error) {
      console.error(`Failed to kill PTY ${sessionId}:`, error);
    } finally {
      // finally 确保即使 kill 失败也清理内存引用
      processes.delete(sessionId);
      outputBuffers.delete(sessionId);
    }
  }
}

// 获取 PTY 进程实例（用于外部终端场景）
export function getPtyProcess(sessionId) {
  return processes.get(sessionId);
}

// 列出所有活跃的 PTY 会话 ID
export function listProcesses() {
  return Array.from(processes.keys());
}

// 获取会话的输出历史缓冲区（新建连接时回放）
export function getOutputHistory(sessionId) {
  return outputBuffers.get(sessionId) || '';
}
