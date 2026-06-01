import * as pty from 'node-pty';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';

const processes = new Map();
const outputBuffers = new Map();
const MAX_BUFFER_SIZE = 100000;
let broadcastCallback = null;

// 设置广播回调
export function setBroadcastCallback(callback) {
  broadcastCallback = callback;
}

// 允许的 shell 白名单
const ALLOWED_SHELLS = new Set([
  '/bin/bash', '/bin/sh', '/bin/zsh', '/bin/dash', '/bin/fish',
  '/bin/tcsh', '/bin/csh', '/bin/ksh',
  '/usr/bin/bash', '/usr/bin/sh', '/usr/bin/zsh', '/usr/bin/dash', '/usr/bin/fish',
  '/usr/local/bin/bash', '/usr/local/bin/zsh', '/usr/local/bin/fish',
  '/opt/homebrew/bin/bash', '/opt/homebrew/bin/zsh', '/opt/homebrew/bin/fish'
]);

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

// 获取默认 shell
function getDefaultShell() {
  if (process.platform === 'win32') {
    return process.env.COMSPEC || 'powershell.exe';
  }
  return process.env.SHELL || '/bin/bash';
}

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
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor'
      }
    });

    processes.set(sessionId, ptyProcess);

    // 监听数据输出
    ptyProcess.onData((data) => {
      // 保存到缓冲区
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

    // 监听退出
    ptyProcess.onExit(({ exitCode, signal }) => {
      console.log(`Session ${sessionId} exited with code ${exitCode}, signal ${signal}`);
      processes.delete(sessionId);
      outputBuffers.delete(sessionId);
    });

    return sessionId;
  } catch (error) {
    console.error(`Failed to create PTY for session ${sessionId}:`, error);
    throw error;
  }
}

export function writeToPty(sessionId, data) {
  const ptyProcess = processes.get(sessionId);
  if (ptyProcess) {
    ptyProcess.write(data);
  }
}

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

export function killPty(sessionId) {
  const ptyProcess = processes.get(sessionId);
  if (ptyProcess) {
    try {
      ptyProcess.kill();
      console.log(`Killed PTY for session ${sessionId}`);
    } catch (error) {
      console.error(`Failed to kill PTY ${sessionId}:`, error);
    } finally {
      processes.delete(sessionId);
      outputBuffers.delete(sessionId);
    }
  }
}

export function getPtyProcess(sessionId) {
  return processes.get(sessionId);
}

export function listProcesses() {
  return Array.from(processes.keys());
}

export function getOutputHistory(sessionId) {
  return outputBuffers.get(sessionId) || '';
}
