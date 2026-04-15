import { loadSessions, saveSessions } from './sessions.js';
import { createPty, writeToPty, resizePty, killPty, setBroadcastCallback, getOutputHistory } from './pty-manager.js';

// 加载已保存的会话
const sessions = loadSessions();

// WebSocket 全局变量
let wss = null;

// 广播函数
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

// 设置 PTY 的广播回调
setBroadcastCallback(broadcastToSession);

// 重新连接已保存的 PTY 进程
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

export function handleWebSocket(ws, websocketServer, user) {
  wss = websocketServer;
  let currentSessionIds = new Set();
  let isAlive = true;

  ws.isAlive = true;
  
  ws.on('pong', () => {
    isAlive = true;
  });

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
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
      ws.send(JSON.stringify({ type: 'error', message: error.message }));
    }
  });

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

function handleCreateSession(ws, message) {
  const { name, shell } = message;
  const sessionId = createPty(null, shell);

  // Generate unique terminal name
  const generateUniqueName = () => {
    // Extract existing terminal numbers
    const existingNumbers = new Set();
    for (const s of sessions) {
      const match = s.name.match(/^Terminal (\d+)$/);
      if (match) {
        existingNumbers.add(parseInt(match[1], 10));
      }
    }
    // Find first unused number starting from 1
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
  saveSessions(sessions);

  ws.send(JSON.stringify({
    type: 'session-created',
    session
  }));
}

function handleInput(ws, message) {
  const { sessionId, data } = message;
  writeToPty(sessionId, data);
}

function handleResize(ws, message) {
  const { sessionId, cols, rows } = message;
  resizePty(sessionId, cols, rows);
}

function handleListSessions(ws) {
  const sessionList = sessions.map(s => ({
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

function handleDeleteSession(ws, message) {
  const { sessionId } = message;
  const index = sessions.findIndex(s => s.id === sessionId);

  if (index !== -1) {
    killPty(sessionId);
    sessions.splice(index, 1);
    saveSessions(sessions);

    ws.send(JSON.stringify({
      type: 'session-deleted',
      sessionId
    }));
  } else {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Session not found'
    }));
  }
}

function handleRenameSession(ws, message) {
  const { sessionId, name } = message;
  const session = sessions.find(s => s.id === sessionId);

  if (session) {
    session.name = name;
    saveSessions(sessions);

    ws.send(JSON.stringify({
      type: 'session-renamed',
      session
    }));

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
