// 应用根组件：管理认证状态、WebSocket 连接、页面路由、会话状态
import React, { useState, useEffect, useRef, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import MultiTerminal from './components/MultiTerminal';
import ExternalTerminal from './components/ExternalTerminal';
import FileExplorer from './components/FileExplorer';
import Login from './components/Login';
import './App.css';

// 根据当前协议自动选择 WS/WSS
const WS_URL = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [username, setUsername] = useState(localStorage.getItem('username'));
  const [currentPage, setCurrentPage] = useState('main');
  const [sessions, setSessions] = useState([]);
  // 从 localStorage 恢复上次打开的终端标签页
  const [activeSessionIds, setActiveSessionIds] = useState(() => {
    const saved = localStorage.getItem('active-session-ids');
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });
  // 移动端默认收起侧边栏
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebar-collapsed');
    if (saved !== null) return saved === 'true';
    return window.innerWidth < 768;
  });
  const [fileExplorerVisible, setFileExplorerVisible] = useState(() => {
    return localStorage.getItem('file-explorer-visible') === 'true';
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

  // 将激活的终端 ID 集合持久化到 localStorage
  const saveActiveSessionIds = (ids) => {
    localStorage.setItem('active-session-ids', JSON.stringify(Array.from(ids)));
  };

  // 页面加载时通过 REST API 验证 token 有效性
  useEffect(() => {
    if (token) {
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

  // 建立 WebSocket 连接并处理服务端推送事件
  const connect = useCallback(() => {
    if (!token || wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(`${WS_URL}?token=${token}`);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected');
      setWsStatus('connected');
      // 连接成功后请求会话列表
      ws.send(JSON.stringify({ type: 'list' }));
    };

    // 处理服务端推送的各类消息
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
          // 外部会话（tmux/screen）不添加到主终端列表
          if (message.session.type !== 'tmux-external' && message.session.type !== 'screen-external') {
            setSessions((prev) => [...prev, message.session]);
            // 新建会话自动加入活跃列表
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
      if (!wsRef.current) return; // cleanup 已执行，不重连
      console.log('WebSocket disconnected');
      setWsStatus('disconnected');
      // 断线后 2 秒自动重连
      reconnectTimeoutRef.current = setTimeout(connect, 2000);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }, [token]);

  // 认证后建立 WebSocket 连接，组件卸载时清理
  useEffect(() => {
    if (isAuthenticated) {
      connect();
    }
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      const ws = wsRef.current;
      // 先置 null 再 close，防止 onclose 回调重连
      wsRef.current = null;
      ws?.close();
    };
  }, [isAuthenticated, connect]);

  const handleLogin = (newToken, newUsername) => {
    setToken(newToken);
    setUsername(newUsername);
    setIsAuthenticated(true);
  };

  // 登出：通知服务端 + 清除本地状态和存储
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
    // 移动端新建终端后自动关闭侧边栏
    if (window.innerWidth < 768 && !sidebarCollapsed) {
      setSidebarCollapsed(true);
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

  // 选择/切换终端会话：单屏模式替换，多屏模式切换
  const handleSelectSession = (sessionId, isSingleMode = false) => {
    setActiveSessionIds((prev) => {
      const newSet = new Set(prev);
      if (isSingleMode) {
        // 单屏模式：直接替换当前显示的终端
        newSet.clear();
        newSet.add(sessionId);
      } else {
        // 多屏模式：切换终端在布局中的显示/隐藏
        if (newSet.has(sessionId)) {
          newSet.delete(sessionId);
        } else {
          newSet.add(sessionId);
        }
      }
      saveActiveSessionIds(newSet);
      return newSet;
    });
    // 移动端选择会话后自动关闭侧边栏，释放屏幕空间
    if (window.innerWidth < 768 && !sidebarCollapsed) {
      setSidebarCollapsed(true);
    }
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

  // 未认证时渲染登录页
  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  // 外部终端管理页面（tmux/screen）
  if (currentPage === 'external') {
    return (
      <ExternalTerminal
        token={token}
        ws={wsRef.current}
        onBack={() => setCurrentPage('main')}
      />
    );
  }

  // 过滤掉外部会话，主终端页面只显示内部会话
  const filteredSessions = sessions.filter(s =>
    s.type !== 'tmux-external' && s.type !== 'screen-external'
  );

  return (
    <div className="app">
      {!sidebarCollapsed && (
        <div className="sidebar-backdrop" onClick={handleToggleSidebar} />
      )}
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
          onToggleSidebar={handleToggleSidebar}
          fileExplorerVisible={fileExplorerVisible}
          onToggleFileExplorer={() => {
            const next = !fileExplorerVisible;
            setFileExplorerVisible(next);
            localStorage.setItem('file-explorer-visible', String(next));
          }}
          token={token}
        />
      </main>
      {fileExplorerVisible && (
        <>
          <div className="sidebar-backdrop file-explorer-backdrop" onClick={() => {
            setFileExplorerVisible(false);
            localStorage.setItem('file-explorer-visible', 'false');
          }} />
          <FileExplorer
            token={token}
            visible={fileExplorerVisible}
            onToggle={() => {
              setFileExplorerVisible(false);
              localStorage.setItem('file-explorer-visible', 'false');
            }}
          />
        </>
      )}
    </div>
  );
}

export default App;
