import { loadSessions, saveSessions } from './sessions.js';
import { createPty, writeToPty, resizePty, killPty, setBroadcastCallback, getOutputHistory } from './pty-manager.js';
import { getExternalTerminals, attachTmuxSession, attachScreenSession } from './external-processes.js';
import { execSync } from 'child_process';
import { v4 as uuidv4 } from 'uuid';

// 加载已保存的会话，过滤掉外部session（无法恢复）
const sessions = loadSessions().filter(s =>
  s.type !== 'tmux-external' && s.type !== 'screen-external'
);

// 保存会话时过滤掉外部session（不持久化）
function saveSessionsFiltered() {
  const filteredSessions = sessions.filter(s =>
    s.type !== 'tmux-external' && s.type !== 'screen-external'
  );
  saveSessions(filteredSessions);
}

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
        // External terminal handlers
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
  saveSessionsFiltered();

  ws.send(JSON.stringify({
    type: 'session-created',
    session
  }));
}

function handleInput(ws, message) {
  const { sessionId, data } = message;

  // Check if it's an external session (node-pty uses write())
  const externalProcess = externalSessions.get(sessionId);
  if (externalProcess) {
    externalProcess.write(data);
    return;
  }

  writeToPty(sessionId, data);
}

function handleResize(ws, message) {
  const { sessionId, cols, rows } = message;

  // External sessions can be resized using node-pty's resize()
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

function handleListSessions(ws) {
  // Filter out external sessions (tmux/screen) for main terminal view
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

// Detach from external session without killing the tmux/screen session
function handleDetachExternal(ws, message, currentSessionIds) {
  const { sessionId } = message;
  const index = sessions.findIndex(s => s.id === sessionId);

  if (index !== -1) {
    const session = sessions[index];
    const externalProcess = externalSessions.get(sessionId);

    if (externalProcess) {
      console.log(`Detaching from external session ${sessionId} (${session.type})`);
      // Just kill the PTY process, not the tmux/screen session itself
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

    // Remove session from memory (but not from persistent storage since external sessions aren't saved)
    sessions.splice(index, 1);
    currentSessionIds.delete(sessionId);

    // Broadcast to clients
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

function handleDeleteSession(ws, message) {
  const { sessionId } = message;
  const index = sessions.findIndex(s => s.id === sessionId);

  if (index !== -1) {
    const session = sessions[index];

    // Check if it's an external session
    const externalProcess = externalSessions.get(sessionId);
    if (externalProcess) {
      console.log(`Killing external session ${sessionId} (${session.type})`);

      // For tmux/screen, we need to kill the actual session, not just detach
      if (session.type === 'tmux-external' && session.tmuxSession) {
        try {
          console.log(`Killing tmux session: ${session.tmuxSession}`);
          execSync(`tmux kill-session -t ${session.tmuxSession}`, { timeout: 5000 });
        } catch (e) {
          console.error(`Failed to kill tmux session ${session.tmuxSession}:`, e.message);
        }
      } else if (session.type === 'screen-external' && session.screenSession) {
        try {
          console.log(`Killing screen session: ${session.screenSession}`);
          execSync(`screen -S ${session.screenSession} -X quit`, { timeout: 5000 });
        } catch (e) {
          console.error(`Failed to kill screen session ${session.screenSession}:`, e.message);
        }
      }

      // Then kill the PTY process
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

    // Broadcast deletion to all clients
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

function handleRenameSession(ws, message) {
  const { sessionId, name } = message;
  const session = sessions.find(s => s.id === sessionId);

  if (session) {
    session.name = name;
    saveSessionsFiltered();

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

// External terminal handlers
const externalSessions = new Map(); // Store external session processes

function handleListExternalTerminals(ws) {
  try {
    const externalTerminals = getExternalTerminals([]);
    ws.send(JSON.stringify({
      type: 'external-terminal-list',
      data: externalTerminals
    }));
  } catch (error) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Failed to get external terminals: ' + error.message
    }));
  }
}

function handleAttachTmux(ws, message, currentSessionIds) {
  const { sessionName, cols, rows } = message;
  const sessionId = `tmux-${sessionName}-${uuidv4().slice(0, 8)}`;

  try {
    const ptyProcess = attachTmuxSession(sessionName, cols || 80, rows || 24);

    // Create session record
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

    // Handle PTY output (node-pty uses onData)
    ptyProcess.onData((data) => {
      broadcastToSession(sessionId, data);
    });

    // Handle PTY exit (node-pty uses onExit)
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
      message: `Failed to attach to tmux session: ${error.message}`
    }));
  }
}

function handleAttachScreen(ws, message, currentSessionIds) {
  const { sessionName, cols, rows } = message;
  const sessionId = `screen-${sessionName}-${uuidv4().slice(0, 8)}`;

  try {
    const ptyProcess = attachScreenSession(sessionName, cols || 80, rows || 24);

    // Create session record
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

    // Handle PTY output (node-pty uses onData)
    ptyProcess.onData((data) => {
      broadcastToSession(sessionId, data);
    });

    // Handle PTY exit (node-pty uses onExit)
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
      message: `Failed to attach to screen session: ${error.message}`
    }));
  }
}
