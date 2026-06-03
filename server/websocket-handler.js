// WebSocket 消息处理器：会话 CRUD、终端输入/输出、外部终端连接
import { loadSessions, saveSessions } from './sessions.js';
import { createPty, writeToPty, resizePty, killPty, setBroadcastCallback, getOutputHistory } from './pty-manager.js';
import { getExternalTerminals, attachTmuxSession, attachScreenSession } from './external-processes.js';
import { spawnSync } from 'child_process';
import { v4 as uuidv4 } from 'uuid';

// 会话尺寸边界，防止客户端传入超大的 cols/rows 导致内存耗尽
const MIN_COLS = 20, MAX_COLS = 500;
const MIN_ROWS = 5, MAX_ROWS = 200;

function clampDimensions(cols, rows) {
  return {
    cols: Math.max(MIN_COLS, Math.min(MAX_COLS, Number(cols) || 80)),
    rows: Math.max(MIN_ROWS, Math.min(MAX_ROWS, Number(rows) || 24))
  };
}

// 验证外部终端会话名称（类型、长度、安全字符模式）
function validateSessionName(name) {
  if (typeof name !== 'string') return false;
  if (name.length > 200) return false;
  return /^[a-zA-Z0-9._\-:]+$/.test(name);
}

// 加载已保存的会话，过滤掉外部 session（tmux/screen 无法在服务重启后恢复）
const sessions = loadSessions().filter(s =>
  s.type !== 'tmux-external' && s.type !== 'screen-external'
);

// 保存会话时过滤掉外部 session（外部会话不持久化）
function saveSessionsFiltered() {
  const filteredSessions = sessions.filter(s =>
    s.type !== 'tmux-external' && s.type !== 'screen-external'
  );
  saveSessions(filteredSessions);
}

// WebSocket 全局引用（由 index.js 中的 handleWebSocket 赋值）
let wss = null;

// 向所有已连接的 WebSocket 客户端广播终端输出
function broadcastToSession(sessionId, data) {
  wss?.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(JSON.stringify({
        type: 'output',
        sessionId,
        data
      }));
    }
  });
}

// 设置 PTY 的广播回调，使 PTY 输出能推送到所有客户端
setBroadcastCallback(broadcastToSession);

// 服务启动时恢复之前保存的运行中会话
for (const session of sessions) {
  if (session.status === 'running') {
    try {
      createPty(session.id, session.shell);
      console.log(`Restored session: ${session.name} (${session.id})`);
    } catch (error) {
      console.error(`Failed to restore session ${session.id}:`, error.message);
      session.status = 'disconnected';
    }
  }
}
// 持久化恢复失败的会话状态，避免下次重启重复尝试
saveSessionsFiltered();

// 处理新 WebSocket 连接，注册消息路由
export function handleWebSocket(ws, websocketServer, user) {
  wss = websocketServer;
  let currentSessionIds = new Set();

  ws.isAlive = true;

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  // 消息路由：根据 type 字段分发到不同的处理函数
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());

      switch (message.type) {
        case 'create':
          handleCreateSession(ws, message);
          break;
        case 'input':
          handleInput(ws, message);
          break;
        case 'resize':
          handleResize(ws, message);
          break;
        case 'list':
          handleListSessions(ws);
          break;
        case 'attach':
          handleAttachSession(ws, message, currentSessionIds);
          break;
        case 'delete':
          handleDeleteSession(ws, message);
          break;
        case 'rename':
          handleRenameSession(ws, message);
          break;
        case 'list-external':
          handleListExternalTerminals(ws);
          break;
        case 'attach-tmux':
          handleAttachTmux(ws, message, currentSessionIds);
          break;
        case 'attach-screen':
          handleAttachScreen(ws, message, currentSessionIds);
          break;
        case 'detach-external':
          handleDetachExternal(ws, message, currentSessionIds);
          break;
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
      // 只返回通用错误消息，不暴露内部堆栈/路径
      ws.send(JSON.stringify({ type: 'error', message: 'An internal error occurred' }));
    }
  });

  // 客户端断开时通知其他客户端（用于清理活跃终端列表）
  ws.on('close', () => {
    currentSessionIds.forEach(sessionId => {
      wss?.clients.forEach((client) => {
        if (client !== ws && client.readyState === 1) {
          client.send(JSON.stringify({
            type: 'session-detached',
            sessionId
          }));
        }
      });
    });
  });
}

// 创建新的终端会话
function handleCreateSession(ws, message) {
  const { name, shell } = message;

  if (name && (typeof name !== 'string' || name.length > 100)) {
    ws.send(JSON.stringify({ type: 'error', message: 'Session name must be 100 characters or fewer' }));
    return;
  }
  if (shell && (typeof shell !== 'string' || shell.length > 500)) {
    ws.send(JSON.stringify({ type: 'error', message: 'Shell path must be 500 characters or fewer' }));
    return;
  }

  const sessionId = createPty(null, shell);

  // 自动生成递增的终端名称（Terminal 1, Terminal 2, ...）
  const generateUniqueName = () => {
    const existingNumbers = new Set();
    for (const s of sessions) {
      const match = s.name.match(/^Terminal (\d+)$/);
      if (match) {
        existingNumbers.add(parseInt(match[1], 10));
      }
    }
    let num = 1;
    while (existingNumbers.has(num)) {
      num++;
    }
    return `Terminal ${num}`;
  };

  const autoName = generateUniqueName();

  const session = {
    id: sessionId,
    name: name || autoName,
    shell: shell || (process.platform === 'win32' ? 'powershell.exe' : '/bin/bash'),
    createdAt: new Date().toISOString(),
    status: 'running'
  };

  sessions.push(session);
  saveSessionsFiltered();

  ws.send(JSON.stringify({
    type: 'session-created',
    session
  }));
}

// 处理用户键盘输入，转发到对应的 PTY 或外部进程
function handleInput(ws, message) {
  const { sessionId, data } = message;

  if (typeof data !== 'string') {
    ws.send(JSON.stringify({ type: 'error', message: 'Invalid input data' }));
    return;
  }
  if (data.length > 10000) {
    ws.send(JSON.stringify({ type: 'error', message: 'Input too large' }));
    return;
  }

  // 先检查是否为外部会话（tmux/screen 的 PTY 桥接进程）
  const externalProcess = externalSessions.get(sessionId);
  if (externalProcess) {
    externalProcess.write(data);
    return;
  }

  writeToPty(sessionId, data);
}

// 处理终端尺寸变化，限制 cols/rows 范围防止异常输入
function handleResize(ws, message) {
  const { sessionId } = message;
  const { cols, rows } = clampDimensions(message.cols, message.rows);

  const externalProcess = externalSessions.get(sessionId);
  if (externalProcess) {
    try {
      externalProcess.resize(cols, rows);
    } catch (error) {
      console.error(`Failed to resize external session ${sessionId}:`, error);
    }
    return;
  }

  resizePty(sessionId, cols, rows);
}

// 返回当前所有的内部会话列表
function handleListSessions(ws) {
  const sessionList = sessions
    .filter(s => s.type !== 'tmux-external' && s.type !== 'screen-external')
    .map(s => ({
      id: s.id,
      name: s.name,
      shell: s.shell,
      createdAt: s.createdAt,
      status: s.status
    }));

  ws.send(JSON.stringify({
    type: 'session-list',
    sessions: sessionList
  }));
}

// 附加到已有会话，发送历史输出以实现回放
function handleAttachSession(ws, message, currentSessionIds) {
  const { sessionId } = message;
  const session = sessions.find(s => s.id === sessionId);

  if (session) {
    currentSessionIds.add(sessionId);
    const history = getOutputHistory(sessionId);
    ws.send(JSON.stringify({
      type: 'session-attached',
      sessionId,
      history
    }));
  } else {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Session not found'
    }));
  }
}

// 从外部会话断开（不终止 tmux/screen 本身，只关闭 PTY 桥接）
function handleDetachExternal(ws, message, currentSessionIds) {
  const { sessionId } = message;
  const index = sessions.findIndex(s => s.id === sessionId);

  if (index !== -1) {
    const session = sessions[index];
    const externalProcess = externalSessions.get(sessionId);

    if (externalProcess) {
      console.log(`Detaching from external session ${sessionId} (${session.type})`);
      try {
        externalProcess.kill('SIGTERM');
      } catch (e) {
        try {
          externalProcess.kill('SIGKILL');
        } catch (e2) {
          console.error(`Failed to kill PTY for ${sessionId}:`, e2);
        }
      }
      externalSessions.delete(sessionId);
    }

    sessions.splice(index, 1);
    currentSessionIds.delete(sessionId);

    wss?.clients.forEach(client => {
      if (client.readyState === 1) {
        client.send(JSON.stringify({
          type: 'session-deleted',
          sessionId
        }));
      }
    });

    console.log(`Detached from session ${sessionId}`);
  }
}

// 删除会话（内部会话终止 PTY，外部会话终止 tmux/screen 进程）
function handleDeleteSession(ws, message) {
  const { sessionId } = message;
  const index = sessions.findIndex(s => s.id === sessionId);

  if (index !== -1) {
    const session = sessions[index];

    // 外部会话需要额外终止 tmux/screen 进程本身
    const externalProcess = externalSessions.get(sessionId);
    if (externalProcess) {
      console.log(`Killing external session ${sessionId} (${session.type})`);

      if (session.type === 'tmux-external' && session.tmuxSession) {
        try {
          console.log(`Killing tmux session: ${session.tmuxSession}`);
          // 使用数组参数形式，防止命令注入
          spawnSync('tmux', ['kill-session', '-t', session.tmuxSession], { timeout: 5000 });
        } catch (e) {
          console.error(`Failed to kill tmux session ${session.tmuxSession}:`, e.message);
        }
      } else if (session.type === 'screen-external' && session.screenSession) {
        try {
          console.log(`Killing screen session: ${session.screenSession}`);
          spawnSync('screen', ['-S', session.screenSession, '-X', 'quit'], { timeout: 5000 });
        } catch (e) {
          console.error(`Failed to kill screen session ${session.screenSession}:`, e.message);
        }
      }

      try {
        externalProcess.kill('SIGTERM');
      } catch (e) {
        try {
          externalProcess.kill('SIGKILL');
        } catch (e2) {
          console.error(`Failed to kill PTY for ${sessionId}:`, e2);
        }
      }
      externalSessions.delete(sessionId);
    } else {
      killPty(sessionId);
    }

    sessions.splice(index, 1);
    saveSessionsFiltered();

    // 广播删除事件给所有客户端
    wss?.clients.forEach(client => {
      if (client.readyState === 1) {
        client.send(JSON.stringify({
          type: 'session-deleted',
          sessionId
        }));
      }
    });

    console.log(`Session ${sessionId} deleted successfully`);
  } else {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Session not found'
    }));
  }
}

// 重命名会话
function handleRenameSession(ws, message) {
  const { sessionId, name } = message;

  if (!name || typeof name !== 'string' || name.length > 100) {
    ws.send(JSON.stringify({ type: 'error', message: 'Session name must be 1-100 characters' }));
    return;
  }

  const session = sessions.find(s => s.id === sessionId);

  if (session) {
    session.name = name;
    saveSessionsFiltered();

    ws.send(JSON.stringify({
      type: 'session-renamed',
      session
    }));

    // 广播更新给所有客户端，确保其他窗口也同步名称
    wss?.clients.forEach((client) => {
      if (client.readyState === 1) {
        client.send(JSON.stringify({
          type: 'session-updated',
          session
        }));
      }
    });
  }
}

export { sessions, broadcastToSession };

// 存储外部会话的 PTY 桥接进程（不持久化，重启后丢失）
const externalSessions = new Map();

// 获取外部终端列表（tmux + screen + shell 进程）
function handleListExternalTerminals(ws) {
  try {
    const externalTerminals = getExternalTerminals([]);
    ws.send(JSON.stringify({
      type: 'external-terminal-list',
      data: externalTerminals
    }));
  } catch (error) {
    console.error('Failed to list external terminals:', error);
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Failed to get external terminals'
    }));
  }
}

// 连接到 tmux 会话（创建 PTY 桥接并注册数据转发）
function handleAttachTmux(ws, message, currentSessionIds) {
  const { sessionName, cols, rows } = message;

  // 验证会话名称：类型、长度、安全字符模式（防止命令注入）
  if (!validateSessionName(sessionName)) {
    ws.send(JSON.stringify({ type: 'error', message: 'Invalid session name' }));
    return;
  }

  const { cols: safeCols, rows: safeRows } = clampDimensions(cols, rows);
  const sessionId = `tmux-${sessionName}-${uuidv4().slice(0, 8)}`;

  try {
    const ptyProcess = attachTmuxSession(sessionName, safeCols, safeRows);

    const session = {
      id: sessionId,
      name: `[tmux] ${sessionName}`,
      type: 'tmux-external',
      tmuxSession: sessionName,
      shell: 'tmux',
      createdAt: new Date().toISOString(),
      status: 'running'
    };

    sessions.push(session);
    saveSessionsFiltered();
    externalSessions.set(sessionId, ptyProcess);
    currentSessionIds.add(sessionId);

    // 桥接 PTY 输出到 WebSocket
    ptyProcess.onData((data) => {
      broadcastToSession(sessionId, data);
    });

    // PTY 退出时清理会话记录并通知所有客户端
    ptyProcess.onExit(({ exitCode, signal }) => {
      console.log(`External tmux session ${sessionId} exited with code ${exitCode}, signal ${signal}`);
      externalSessions.delete(sessionId);
      const idx = sessions.findIndex(s => s.id === sessionId);
      if (idx !== -1) {
        sessions.splice(idx, 1);
        saveSessionsFiltered();
      }
      wss?.clients.forEach(client => {
        if (client.readyState === 1) {
          client.send(JSON.stringify({
            type: 'session-deleted',
            sessionId
          }));
        }
      });
    });

    ws.send(JSON.stringify({
      type: 'session-created',
      session
    }));

    ws.send(JSON.stringify({
      type: 'session-attached',
      sessionId,
      history: ''
    }));

  } catch (error) {
    console.error('Failed to attach tmux session:', error);
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Failed to attach to tmux session'
    }));
  }
}

// 连接到 screen 会话（创建 PTY 桥接并注册数据转发）
function handleAttachScreen(ws, message, currentSessionIds) {
  const { sessionName, cols, rows } = message;

  // 验证会话名称：类型、长度、安全字符模式（防止命令注入）
  if (!validateSessionName(sessionName)) {
    ws.send(JSON.stringify({ type: 'error', message: 'Invalid session name' }));
    return;
  }

  const { cols: safeCols, rows: safeRows } = clampDimensions(cols, rows);
  const sessionId = `screen-${sessionName}-${uuidv4().slice(0, 8)}`;

  try {
    const ptyProcess = attachScreenSession(sessionName, safeCols, safeRows);

    const session = {
      id: sessionId,
      name: `[screen] ${sessionName}`,
      type: 'screen-external',
      screenSession: sessionName,
      shell: 'screen',
      createdAt: new Date().toISOString(),
      status: 'running'
    };

    sessions.push(session);
    saveSessionsFiltered();
    externalSessions.set(sessionId, ptyProcess);
    currentSessionIds.add(sessionId);

    // 桥接 PTY 输出到 WebSocket
    ptyProcess.onData((data) => {
      broadcastToSession(sessionId, data);
    });

    // PTY 退出时清理会话记录并通知所有客户端
    ptyProcess.onExit(({ exitCode, signal }) => {
      console.log(`External screen session ${sessionId} exited with code ${exitCode}, signal ${signal}`);
      externalSessions.delete(sessionId);
      const idx = sessions.findIndex(s => s.id === sessionId);
      if (idx !== -1) {
        sessions.splice(idx, 1);
        saveSessionsFiltered();
      }
      wss?.clients.forEach(client => {
        if (client.readyState === 1) {
          client.send(JSON.stringify({
            type: 'session-deleted',
            sessionId
          }));
        }
      });
    });

    ws.send(JSON.stringify({
      type: 'session-created',
      session
    }));

    ws.send(JSON.stringify({
      type: 'session-attached',
      sessionId,
      history: ''
    }));

  } catch (error) {
    console.error('Failed to attach screen session:', error);
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Failed to attach to screen session'
    }));
  }
}
