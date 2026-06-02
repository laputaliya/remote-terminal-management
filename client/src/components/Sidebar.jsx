import React, { useState } from 'react';
import { ConfirmModal, PromptModal } from './Modal';
import './Sidebar.css';

function Sidebar({ sessions, activeSessionIds, onSelectSession, onCreateSession, onDeleteSession, onRenameSession, onRefresh, isCollapsed, onToggleCollapse, isSingleMode }) {
  const [renameTarget, setRenameTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const handleCreate = () => {
    onCreateSession(null, null);
  };

  const handleRenameConfirm = (newName) => {
    if (renameTarget) {
      onRenameSession?.(renameTarget.id, newName);
    }
    setRenameTarget(null);
  };

  const handleDeleteConfirm = () => {
    if (deleteTarget) {
      onDeleteSession(deleteTarget.id);
    }
    setDeleteTarget(null);
  };

  return (
    <div className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        {!isCollapsed && (
          <h2 className="sidebar-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="4 17 10 11 4 5" />
              <line x1="12" y1="19" x2="20" y2="19" />
            </svg>
            终端管理
          </h2>
        )}
        <div className="sidebar-actions">
          {!isCollapsed && (
            <button className="refresh-btn" onClick={onRefresh} title="刷新">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="23 4 23 10 17 10" />
                <polyline points="1 20 1 14 7 14" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
            </button>
          )}
          <button className="collapse-btn" onClick={onToggleCollapse} title={isCollapsed ? '展开' : '收起'}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: isCollapsed ? 'rotate(180deg)' : 'none' }}>
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <div className="session-list">
          {sessions.length === 0 ? (
            <div className="empty-state">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
              <p>暂无终端会话</p>
              <span>点击下方按钮创建</span>
            </div>
          ) : (
            sessions.map((session) => (
              <div
                key={session.id}
                className={`session-item ${activeSessionIds.has(session.id) ? 'active' : ''}`}
                onClick={() => onSelectSession(session.id, isSingleMode)}
                title={isSingleMode ? '点击切换到此终端' : '点击添加/移除显示'}
              >
                <div className="session-item-info">
                  <span className={`session-status ${session.status === 'running' ? 'running' : 'stopped'}`}></span>
                  <span className="session-item-name">{session.name}</span>
                </div>
                <div className="session-item-actions">
                  <button
                    className="session-action-btn rename"
                    onClick={(e) => {
                      e.stopPropagation();
                      setRenameTarget(session);
                    }}
                    title="重命名"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                  <button
                    className="session-action-btn delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget(session);
                    }}
                    title="删除"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {isCollapsed && (
        <div className="session-list collapsed">
          {sessions.map((session) => (
            <div
              key={session.id}
              className={`session-item-icon ${activeSessionIds.has(session.id) ? 'active' : ''}`}
              onClick={() => onSelectSession(session.id, isSingleMode)}
              title={session.name}
            >
              <span className={`session-status-icon ${session.status === 'running' ? 'running' : 'stopped'}`}></span>
            </div>
          ))}
        </div>
      )}

      {!isCollapsed && (
        <div className="sidebar-footer">
          <button className="create-btn" onClick={handleCreate}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            新建终端
          </button>
        </div>
      )}

      {isCollapsed && (
        <div className="sidebar-footer collapsed">
          <button className="create-btn-icon" onClick={handleCreate} title="新建终端">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>
      )}

      {renameTarget && (
        <PromptModal
          title="输入新名称"
          defaultValue={renameTarget.name}
          onConfirm={handleRenameConfirm}
          onCancel={() => setRenameTarget(null)}
        />
      )}
      {deleteTarget && (
        <ConfirmModal
          message={`确定删除终端 "${deleteTarget.name}"？`}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

export default Sidebar;
