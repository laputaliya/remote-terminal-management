import React, { useState, useEffect, useRef, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import MultiTerminal from './components/MultiTerminal';
import ExternalTerminal from './components/ExternalTerminal';
import Login from './components/Login';
import './App.css';

const WS_URL = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [username, setUsername] = useState(localStorage.getItem('username'));
  const [currentPage, setCurrentPage] = useState('main'); // 'main' or 'external'
  const [sessions, setSessions] = useState([]);
  const [activeSessionIds, setActiveSessionIds] = useState(() => {
    const saved = localStorage.getItem('active-session-ids');
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem('sidebar-collapsed') === 'true';
  });
  const [wsStatus, setWsStatus] = useState('disconnected');
  const [terminalLayout, setTerminalLayout] = useState(() => {
    return localStorage.getItem('terminal-layout') || '1';
  });
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);

  const handleToggleSidebar = () => {
    const newState = !sidebarCollapsed;
    setSidebarCollapsed(newState);
    localStorage.setItem('sidebar-collapsed', String(newState));
  };

  // 保存激活的终端列表到 localStorage
  const saveActiveSessionIds = (ids) => {
    localStorage.setItem('active-session-ids', JSON.stringify(Array.from(ids)));
  };

  // 检查是否已登录
  useEffect(() => {
    if (token) {
      // 验证 token 是否有效
      fetch('/api/sessions', {
        headers: { 'Authorization': `Bearer ${token}` }
      }).then(response => {
        if (response.ok) {
          setIsAuthenticated(true);
        } else {
          handleLogout();
        }
      }).catch(() => {
        handleLogout();
      });
    }
  }, [token]);

  const connect = useCallback(() => {
    if (!token || wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(`${WS_URL}?token=${token}`);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected');
      setWsStatus('connected');
      ws.send(JSON.stringify({ type: 'list' }));
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      
      switch (message.type) {
        case 'session-list':
          setSessions(message.sessions);
          // 如果没有激活的会话，自动选择第一个
          if (message.sessions.length > 0 && activeSessionIds.size === 0) {
            setActiveSessionIds(new Set([message.sessions[0].id]));
          }
          break;
        case 'session-created':
          // Don't add external sessions (tmux/screen) to main sessions list
          if (message.session.type !== 'tmux-external' && message.session.type !== 'screen-external') {
            setSessions((prev) => [...prev, message.session]);
            // 自动添加到激活列表
            setActiveSessionIds((prev) => {
              const newSet = new Set(prev);
              newSet.add(message.session.id);
              saveActiveSessionIds(newSet);
              return newSet;
            });
          }
          break;
        case 'session-deleted':
          setSessions((prev) => prev.filter((s) => s.id !== message.sessionId));
          setActiveSessionIds((prev) => {
            const newSet = new Set(prev);
            newSet.delete(message.sessionId);
            saveActiveSessionIds(newSet);
            return newSet;
          });
          break;
        case 'session-updated':
          setSessions((prev) =>
            prev.map((s) => (s.id === message.session.id ? message.session : s))
          );
          break;
      }
    };

    ws.onclose = () => {
      if (!wsRef.current) return; // cleanup already ran, don't reconnect
      console.log('WebSocket disconnected');
      setWsStatus('disconnected');
      reconnectTimeoutRef.current = setTimeout(connect, 2000);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }, [token]);

  useEffect(() => {
    if (isAuthenticated) {
      connect();
    }
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      const ws = wsRef.current;
      wsRef.current = null;
      ws?.close();
    };
  }, [isAuthenticated, connect]);

  const handleLogin = (newToken, newUsername) => {
    setToken(newToken);
    setUsername(newUsername);
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    }).catch(() => {});

    localStorage.removeItem('token');
    localStorage.removeItem('username');
    localStorage.removeItem('active-session-ids');
    localStorage.removeItem('terminal-layout');
    localStorage.removeItem('sidebar-collapsed');
    setToken(null);
    setUsername(null);
    setIsAuthenticated(false);
    setActiveSessionIds(new Set());
    wsRef.current?.close();
  };

  const handleCreateSession = (name, shell) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'create', name, shell }));
    }
  };

  const handleDeleteSession = (sessionId) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'delete', sessionId }));
    }
  };

  const handleRenameSession = (sessionId, name) => {
    if (!name || !name.trim()) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'rename', sessionId, name: name.trim() }));
    }
  };

  const handleSelectSession = (sessionId, isSingleMode = false) => {
    setActiveSessionIds((prev) => {
      const newSet = new Set(prev);
      if (isSingleMode) {
        // 单屏模式：直接切换到选中的终端（替换当前激活的）
        newSet.clear();
        newSet.add(sessionId);
      } else {
        // 多屏模式：添加/移除终端
        if (newSet.has(sessionId)) {
          newSet.delete(sessionId);
        } else {
          newSet.add(sessionId);
        }
      }
      saveActiveSessionIds(newSet);
      return newSet;
    });
  };

  const handleRefresh = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'list' }));
    }
  };

  const handleChangePassword = async (currentPassword, newPassword) => {
    const response = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ oldPassword: currentPassword, newPassword })
    });
    return response.ok;
  };

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  // Render External Terminal page
  if (currentPage === 'external') {
    return (
      <ExternalTerminal
        token={token}
        ws={wsRef.current}
        onBack={() => setCurrentPage('main')}
      />
    );
  }

  // Filter out external sessions (tmux/screen) for main terminal view
  const filteredSessions = sessions.filter(s =>
    s.type !== 'tmux-external' && s.type !== 'screen-external'
  );

  return (
    <div className="app">
      <Sidebar
        sessions={filteredSessions}
        activeSessionIds={activeSessionIds}
        onSelectSession={handleSelectSession}
        onCreateSession={handleCreateSession}
        onDeleteSession={handleDeleteSession}
        onRenameSession={handleRenameSession}
        onRefresh={handleRefresh}
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={handleToggleSidebar}
        isSingleMode={terminalLayout === '1'}
      />
      <main className="main-content">
        <MultiTerminal
          sessions={filteredSessions}
          activeSessionIds={activeSessionIds}
          onSelectSession={handleSelectSession}
          onCreateSession={handleCreateSession}
          onDeleteSession={handleDeleteSession}
          onRenameSession={handleRenameSession}
          ws={wsRef.current}
          username={username}
          onLogout={handleLogout}
          onChangePassword={handleChangePassword}
          onNavigateToExternal={() => setCurrentPage('external')}
          layout={terminalLayout}
          onLayoutChange={setTerminalLayout}
        />
      </main>
    </div>
  );
}

export default App;
