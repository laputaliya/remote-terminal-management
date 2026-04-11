import React, { useState, useEffect, useRef, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import Terminal from './components/Terminal';
import './App.css';

// 使用相对路径，WebSocket 会通过 Vite 代理或同源连接
const WS_URL = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;

function App() {
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [wsStatus, setWsStatus] = useState('disconnected');
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(WS_URL);
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
          if (message.sessions.length > 0 && !activeSessionId) {
            setActiveSessionId(message.sessions[0].id);
          }
          break;
        case 'session-created':
          setSessions((prev) => [...prev, message.session]);
          setActiveSessionId(message.session.id);
          break;
        case 'session-deleted':
          setSessions((prev) => prev.filter((s) => s.id !== message.sessionId));
          if (activeSessionId === message.sessionId) {
            setActiveSessionId(null);
          }
          break;
        case 'session-updated':
          setSessions((prev) =>
            prev.map((s) => (s.id === message.session.id ? message.session : s))
          );
          break;
      }
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      setWsStatus('disconnected');
      reconnectTimeoutRef.current = setTimeout(connect, 2000);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }, [activeSessionId]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      wsRef.current?.close();
    };
  }, []);

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
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'rename', sessionId, name }));
    }
  };

  const handleRefresh = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'list' }));
    }
  };

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  return (
    <div className="app">
      <Sidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={setActiveSessionId}
        onCreateSession={handleCreateSession}
        onDeleteSession={handleDeleteSession}
        onRefresh={handleRefresh}
      />
      <main className="main-content">
        <div className="content-header">
          <div className="connection-status">
            <span className={`status-dot ${wsStatus}`}></span>
            <span>{wsStatus === 'connected' ? '已连接' : '连接中...'}</span>
          </div>
          {activeSession && (
            <div className="active-session-info">
              当前终端: <strong>{activeSession.name}</strong>
            </div>
          )}
        </div>
        <div className="terminal-area">
          {activeSession && wsRef.current ? (
            <Terminal
              key={activeSessionId}
              sessionId={activeSessionId}
              ws={wsRef.current}
              onClose={handleDeleteSession}
              onRename={handleRenameSession}
              shell={activeSession.shell}
            />
          ) : (
            <div className="no-session">
              <div className="no-session-content">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
                <h2>选择或创建一个终端</h2>
                <p>从左侧边栏选择一个已有的终端会话，或创建新的终端会话开始工作。</p>
                <div className="features">
                  <div className="feature">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="4 17 10 11 4 5" />
                      <line x1="12" y1="19" x2="20" y2="19" />
                    </svg>
                    <span>真正的Shell终端</span>
                  </div>
                  <div className="feature">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                    </svg>
                    <span>后台持续运行</span>
                  </div>
                  <div className="feature">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    <span>自动保存会话</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
