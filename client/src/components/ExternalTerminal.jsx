// 外部终端管理页面：列出并连接 tmux/screen/shell 进程
import { useState, useEffect, useRef, useCallback } from 'react';
import Terminal from './Terminal';
import './ExternalTerminal.css';

function ExternalTerminal({ token, ws, onBack }) {
  const [externalData, setExternalData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedSession, setSelectedSession] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(null);
  const wsRef = useRef(ws);

  // 同步 ws prop 到 ref（避免闭包过期问题）
  useEffect(() => {
    wsRef.current = ws;
  }, [ws]);

  // 监听 WebSocket 消息，收到 session-created 后自动选中新会话
  useEffect(() => {
    if (!ws) return;

    const handleMessage = (event) => {
      const message = JSON.parse(event.data);

      if (message.type === 'session-created') {
        console.log('Received session-created:', message.session);
        // Auto select the newly created session
        setSelectedSession(message.session);
      }
    };

    ws.addEventListener('message', handleMessage);

    return () => {
      ws.removeEventListener('message', handleMessage);
    };
  }, [ws]); // Re-bind when ws changes

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(null);

    fetch('/api/external-terminals', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        setExternalData(data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 连接到 tmux 会话：从视口估算终端尺寸，使 PTY 初始尺寸接近实际
  const handleAttachTmux = (sessionName) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const estCols = Math.floor(window.innerWidth / 8);
      const estRows = Math.floor((window.innerHeight - 60) / 17);
      wsRef.current.send(JSON.stringify({
        type: 'attach-tmux',
        sessionName,
        cols: Math.max(estCols, 80),
        rows: Math.max(estRows, 24)
      }));
    }
  };

  // 连接到 screen 会话
  const handleAttachScreen = (sessionName) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const estCols = Math.floor(window.innerWidth / 8);
      const estRows = Math.floor((window.innerHeight - 60) / 17);
      wsRef.current.send(JSON.stringify({
        type: 'attach-screen',
        sessionName,
        cols: Math.max(estCols, 80),
        rows: Math.max(estRows, 24)
      }));
    }
  };

  // 断开外部会话连接（不终止 tmux/screen 本身，只关闭 PTY 桥接）
  const handleDetachSession = (sessionId) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'detach-external',
        sessionId
      }));
    }
    setSelectedSession(null);
  };

  // 返回列表：断开当前连接并回到列表视图
  const handleReturnToList = () => {
    if (selectedSession) {
      handleDetachSession(selectedSession.id);
    }
    setSelectedSession(null); // Return to external terminal list, not main terminal
    // Refresh the external terminal list
    fetchData();
  };

  // Handle kill - truly close the tmux/screen session
  const handleKillSession = (sessionId) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'delete',
        sessionId
      }));
    }
    setSelectedSession(null);
    // Refresh the external terminal list after killing a session
    fetchData();
  };

  // Render attached terminal
  if (selectedSession) {
    return (
      <div className="external-terminal-page">
        <div className="external-header">
          <h1>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
            {selectedSession.name}
          </h1>
          <div className="header-actions">
            <button className="back-btn" onClick={handleReturnToList}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              返回列表
            </button>
          </div>
        </div>
        <div className="external-content" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <Terminal
            sessionId={selectedSession.id}
            ws={wsRef.current}
            onClose={handleKillSession}
            onRename={() => {}}
            shell={selectedSession.shell}
            name={selectedSession.name}
            isExternal={true}
          />
        </div>
      </div>
    );
  }

  // Render list view
  return (
    <div className="external-terminal-page">
      <div className="external-header">
        <h1>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          外部终端管理
        </h1>
        <div className="header-actions">
          <button className="refresh-btn" onClick={fetchData}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            刷新
          </button>
          <button className="back-btn" onClick={onBack}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            返回终端
          </button>
        </div>
      </div>

      <div className="external-content">
        {loading && (
          <div className="loading-state">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            <span>加载中...</span>
          </div>
        )}

        {error && (
          <div className="error-state">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p>加载失败: {error}</p>
            <button className="refresh-btn" onClick={fetchData}>重试</button>
          </div>
        )}

        {!loading && !error && externalData && (
          <>
            {/* Tmux Sessions */}
            <CategorySection
              title="Tmux 会话"
              icon="tmux"
              items={externalData.tmux}
              onAttach={handleAttachTmux}
              onDetail={(item) => setShowDetailModal({ type: 'tmux', data: item })}
              canAttach={true}
            />

            {/* Screen Sessions */}
            <CategorySection
              title="Screen 会话"
              icon="screen"
              items={externalData.screen}
              onAttach={handleAttachScreen}
              onDetail={(item) => setShowDetailModal({ type: 'screen', data: item })}
              canAttach={true}
            />

            {/* Shell Processes */}
            <CategorySection
              title="Shell 进程"
              icon="process"
              items={externalData.processes}
              onDetail={(item) => setShowDetailModal({ type: 'process', data: item })}
              canAttach={false}
            />

            {/* Summary */}
            {externalData.total === 0 && (
              <div className="empty-section">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                  <rect x="2" y="3" width="20" height="14" rx="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
                <p>未检测到外部终端会话</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Detail Modal */}
      {showDetailModal && (
        <DetailModal
          item={showDetailModal}
          onClose={() => setShowDetailModal(null)}
        />
      )}
    </div>
  );
}

function CategorySection({ title, icon, items, onAttach, onDetail, canAttach }) {
  return (
    <div className="category-section">
      <div className="category-header">
        <div className="category-title">
          <span className={`category-icon ${icon}`}>
            {icon === 'tmux' && 'T'}
            {icon === 'screen' && 'S'}
            {icon === 'process' && 'P'}
          </span>
          {title}
        </div>
        <span className="category-count">{items.length} 个</span>
      </div>

      {items.length === 0 ? (
        <div className="empty-section">
          <p>无 {title}</p>
        </div>
      ) : (
        <div className="terminal-grid">
          {items.map((item, index) => (
            <TerminalCard
              key={index}
              item={item}
              type={icon}
              onAttach={canAttach ? onAttach : null}
              onDetail={onDetail}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TerminalCard({ item, type, onAttach, onDetail }) {
  const getName = () => {
    if (type === 'tmux') return item.name;
    if (type === 'screen') return item.name;
    if (type === 'process') return item.name;
    return 'Unknown';
  };

  const getInfo = () => {
    if (type === 'tmux') {
      return [
        { label: '窗口数', value: item.windows },
        { label: '连接数', value: item.attached }
      ];
    }
    if (type === 'screen') {
      return [
        { label: 'PID', value: item.pid },
        { label: '状态', value: item.status }
      ];
    }
    if (type === 'process') {
      return [
        { label: 'PID', value: item.pid },
        { label: '父PID', value: item.ppid }
      ];
    }
    return [];
  };

  return (
    <div className="terminal-card">
      <div className="terminal-card-header">
        <span className="terminal-name">{getName()}</span>
        <span className={`terminal-status ${item.status}`}>{item.status}</span>
      </div>

      <div className="terminal-card-body">
        {getInfo().map((info, idx) => (
          <div key={idx} className="terminal-info">
            <span className="terminal-info-label">{info.label}</span>
            <span className="terminal-info-value">{info.value}</span>
          </div>
        ))}

        {type === 'process' && (
          <div className="process-detail">
            {item.cmd}
          </div>
        )}
      </div>

      <div className="terminal-card-footer">
        {onAttach && (
          <button className="attach-btn" onClick={() => onAttach(item.name)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
              <polyline points="10 17 15 12 10 7" />
              <line x1="15" y1="12" x2="3" y2="12" />
            </svg>
            连接
          </button>
        )}
        <button className="info-btn" onClick={() => onDetail(item)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          详情
        </button>
      </div>
    </div>
  );
}

function DetailModal({ item, onClose }) {
  const { type, data } = item;

  const getDetails = () => {
    if (type === 'tmux') {
      return [
        { label: '类型', value: 'Tmux Session' },
        { label: '名称', value: data.name },
        { label: '窗口数', value: data.windows },
        { label: '连接数', value: data.attached },
        { label: '状态', value: data.status }
      ];
    }
    if (type === 'screen') {
      return [
        { label: '类型', value: 'Screen Session' },
        { label: '名称', value: data.name },
        { label: 'PID', value: data.pid },
        { label: '状态', value: data.status }
      ];
    }
    if (type === 'process') {
      return [
        { label: '类型', value: 'Shell Process' },
        { label: '名称', value: data.name },
        { label: 'PID', value: data.pid },
        { label: '父PID', value: data.ppid },
        { label: '命令', value: data.cmd },
        { label: '状态', value: data.status }
      ];
    }
    return [];
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>终端详情</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {getDetails().map((detail, idx) => (
            <div key={idx} className="modal-row">
              <span className="modal-row-label">{detail.label}</span>
              <span className="modal-row-value">{detail.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default ExternalTerminal;