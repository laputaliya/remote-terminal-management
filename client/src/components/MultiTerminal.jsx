import { useState, useEffect, useRef } from 'react';
import Terminal from './Terminal';
import './MultiTerminal.css';

const LAYOUTS = [
  { id: '1', name: 'Single', icon: '□', maxTerminals: 1 },
  { id: '2h', name: 'Horizontal Split', icon: '▦', maxTerminals: 2 },
  { id: '2v', name: 'Vertical Split', icon: '▥', maxTerminals: 2 },
  { id: '4', name: 'Quad', icon: '▪', maxTerminals: 4 },
  { id: '3t', name: 'Top 2 Bottom 1', icon: '▤', maxTerminals: 3 },
  { id: '3b', name: 'Top 1 Bottom 2', icon: '▧', maxTerminals: 3 },
  { id: '3l', name: 'Left 1 Right 2', icon: '▣', maxTerminals: 3 },
  { id: '3r', name: 'Left 2 Right 1', icon: '▢', maxTerminals: 3 },
];

function MultiTerminal({ sessions, activeSessionIds, onSelectSession, onCreateSession, onDeleteSession, onRenameSession, ws, username, onLogout, onChangePassword }) {
  // 从 localStorage 读取保存的布局
  const [layout, setLayout] = useState(() => {
    return localStorage.getItem('terminal-layout') || '1';
  });
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const maxTerminals = LAYOUTS.find(l => l.id === layout)?.maxTerminals || 1;
  const isSingleMode = layout === '1';
  const terminalRefs = useRef([]);

  // 保存布局到 localStorage
  const handleLayoutChange = (newLayout) => {
    setLayout(newLayout);
    localStorage.setItem('terminal-layout', newLayout);
  };

  // 当布局改变时，如果当前终端数超过新布局的最大值，裁剪多余的
  useEffect(() => {
    const currentIds = Array.from(activeSessionIds);
    if (currentIds.length > maxTerminals) {
      // 只保留前 maxTerminals 个
      const toKeep = new Set(currentIds.slice(0, maxTerminals));
      // 通知父组件更新 - 只保留能容纳的数量
      const idsToRemove = currentIds.slice(maxTerminals);
      idsToRemove.forEach(id => onSelectSession(id));
    }
    // 重置聚焦索引
    setFocusedIndex(0);
  }, [layout, maxTerminals, activeSessionIds, onSelectSession]);

  // 聚焦到指定索引的终端
  const focusTerminal = (index) => {
    if (terminalRefs.current[index]) {
      terminalRefs.current[index].focus();
    }
  };

  // 快捷键支持
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Alt + 数字键 切换终端 (1-4)
      if (e.altKey && e.key >= '1' && e.key <= '4') {
        e.preventDefault();
        const index = parseInt(e.key) - 1;
        if (index < maxTerminals) {
          setFocusedIndex(index);
          focusTerminal(index);
        }
      }
      // Alt + 方向键 切换终端
      else if (e.altKey) {
        const activeList = Array.from(activeSessionIds).slice(0, maxTerminals);
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          const newIndex = Math.max(0, focusedIndex - 1);
          setFocusedIndex(newIndex);
          focusTerminal(newIndex);
        } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          const newIndex = Math.min(activeList.length - 1, focusedIndex + 1);
          setFocusedIndex(newIndex);
          focusTerminal(newIndex);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [maxTerminals, activeSessionIds, focusedIndex]);

  // 获取当前激活的终端列表
  const getActiveSessionsList = () => {
    return Array.from(activeSessionIds).slice(0, maxTerminals);
  };



  const handleCloseCell = (sessionId) => {
    onDeleteSession(sessionId);
  };

  const activeList = getActiveSessionsList();

  return (
    <div className="multi-terminal">
      <div className="terminal-toolbar">
        <div className="toolbar-left">
          <div className="layout-selector">
            {LAYOUTS.map(l => (
              <button
                key={l.id}
                className={`layout-btn ${layout === l.id ? 'active' : ''}`}
                onClick={() => handleLayoutChange(l.id)}
                title={l.name}
              >
                <LayoutIcon layout={l.id} />
              </button>
            ))}
          </div>

        </div>
        <div className="toolbar-right">
          <div className="user-info">
            <span className="username">👤 {username}</span>
          </div>
          <button
            className="change-password-btn"
            onClick={() => setShowChangePassword(true)}
            title="修改密码"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
            修改密码
          </button>
          <button className="logout-btn" onClick={onLogout}>
            Logout
          </button>
        </div>
      </div>

      {showChangePassword && (
        <ChangePasswordModal
          onClose={() => setShowChangePassword(false)}
          onChangePassword={onChangePassword}
        />
      )}
      <div className={`terminal-grid layout-${layout}`}>
        {Array.from({ length: maxTerminals }).map((_, index) => {
          const sessionId = activeList[index];
          const session = sessions.find(s => s.id === sessionId);

          if (!session) {
            return (
              <div key={index} className="terminal-cell empty">
                <div className="cell-placeholder">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                    <rect x="2" y="3" width="20" height="14" rx="2" />
                    <line x1="8" y1="21" x2="16" y2="21" />
                    <line x1="12" y1="17" x2="12" y2="21" />
                  </svg>
                  <span>Click a terminal from sidebar</span>
                </div>
              </div>
            );
          }

          return (
            <div
              key={sessionId}
              className={`terminal-cell ${index === focusedIndex ? 'focused' : ''}`}
              onClick={() => {
                setFocusedIndex(index);
                focusTerminal(index);
              }}
            >
              <div className="cell-header">
                <div className="cell-title">
                  <span className="cell-status"></span>
                  <span>{session.name}</span>
                  {index === focusedIndex && <span className="focus-indicator">●</span>}
                </div>
                <div className="cell-actions">
                  <button
                    className="cell-btn"
                    onClick={() => onRenameSession(sessionId, prompt('新名称:', session.name))}
                    title="重命名"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                  <button
                    className="cell-btn"
                    onClick={() => handleCloseCell(sessionId)}
                    title="Close"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="cell-content">
                <Terminal
                  ref={(el) => { terminalRefs.current[index] = el; }}
                  sessionId={sessionId}
                  ws={ws}
                  onClose={onDeleteSession}
                  onRename={onRenameSession}
                  shell={session.shell}
                  compact
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChangePasswordModal({ onClose, onChangePassword }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError('两次输入的新密码不一致');
      return;
    }

    if (newPassword.length < 4) {
      setError('新密码长度至少为 4 位');
      return;
    }

    const ok = await onChangePassword(currentPassword, newPassword);
    if (ok) {
      setSuccess(true);
      setTimeout(() => onClose(), 1500);
    } else {
      setError('当前密码错误');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>修改密码</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        {success ? (
          <div className="modal-success">密码修改成功！</div>
        ) : (
          <form onSubmit={handleSubmit}>
            {error && <div className="modal-error">{error}</div>}
            <div className="form-group">
              <label>当前密码</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label>新密码</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label>确认新密码</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={onClose}>取消</button>
              <button type="submit" className="btn-primary">确认修改</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function LayoutIcon({ layout }) {
  const icons = {
    '1': (
      <svg viewBox="0 0 24 24" fill="currentColor">
        <rect x="4" y="4" width="16" height="16" rx="2" />
      </svg>
    ),
    '2h': (
      <svg viewBox="0 0 24 24" fill="currentColor">
        <rect x="4" y="4" width="7" height="16" rx="1" />
        <rect x="13" y="4" width="7" height="16" rx="1" />
      </svg>
    ),
    '2v': (
      <svg viewBox="0 0 24 24" fill="currentColor">
        <rect x="4" y="4" width="16" height="7" rx="1" />
        <rect x="4" y="13" width="16" height="7" rx="1" />
      </svg>
    ),
    '4': (
      <svg viewBox="0 0 24 24" fill="currentColor">
        <rect x="4" y="4" width="7" height="7" rx="1" />
        <rect x="13" y="4" width="7" height="7" rx="1" />
        <rect x="4" y="13" width="7" height="7" rx="1" />
        <rect x="13" y="13" width="7" height="7" rx="1" />
      </svg>
    ),
    '3t': (
      <svg viewBox="0 0 24 24" fill="currentColor">
        <rect x="4" y="4" width="7" height="7" rx="1" />
        <rect x="13" y="4" width="7" height="7" rx="1" />
        <rect x="4" y="13" width="16" height="7" rx="1" />
      </svg>
    ),
    '3b': (
      <svg viewBox="0 0 24 24" fill="currentColor">
        <rect x="4" y="4" width="16" height="7" rx="1" />
        <rect x="4" y="13" width="7" height="7" rx="1" />
        <rect x="13" y="13" width="7" height="7" rx="1" />
      </svg>
    ),
    '3l': (
      <svg viewBox="0 0 24 24" fill="currentColor">
        <rect x="4" y="4" width="7" height="16" rx="1" />
        <rect x="13" y="4" width="7" height="7" rx="1" />
        <rect x="13" y="13" width="7" height="7" rx="1" />
      </svg>
    ),
    '3r': (
      <svg viewBox="0 0 24 24" fill="currentColor">
        <rect x="4" y="4" width="7" height="7" rx="1" />
        <rect x="4" y="13" width="7" height="7" rx="1" />
        <rect x="13" y="4" width="7" height="16" rx="1" />
      </svg>
    ),
  };

  return icons[layout] || icons['1'];
}

export default MultiTerminal;
