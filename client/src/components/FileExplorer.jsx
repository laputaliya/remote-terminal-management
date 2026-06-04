import { useState, useEffect } from 'react';
import UploadModal from './UploadModal';
import './FileExplorer.css';

function formatSize(bytes) {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function FileExplorer({ token, visible, onToggle }) {
  const [currentDir, setCurrentDir] = useState('');
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadKey, setUploadKey] = useState(0);
  const [showHidden, setShowHidden] = useState(false);

  const fetchDir = async (dir) => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ dir });
    if (showHidden) params.set('showHidden', 'true');
    try {
      const res = await fetch('/api/fs/list?' + params.toString(), {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to list directory');
        setEntries([]);
      } else {
        const data = await res.json();
        setCurrentDir(data.dir);
        setEntries(data.items);
      }
    } catch {
      setError('网络错误');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible) {
      fetchDir(currentDir || '');
    }
  }, [visible]);

  useEffect(() => {
    if (visible && currentDir) {
      fetchDir(currentDir);
    }
  }, [showHidden]);

  const handleNavigate = (dir) => {
    fetchDir(dir);
  };

  const handleGoUp = () => {
    if (currentDir === '/') return;
    const parent = currentDir.split('/').slice(0, -1).join('/') || '/';
    fetchDir(parent);
  };

  const handleRefresh = () => {
    fetchDir(currentDir);
  };

  const handleUploadComplete = () => {
    setShowUploadModal(false);
    setUploadKey(k => k + 1);
    fetchDir(currentDir);
  };

  const getDirIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );

  const getFileIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );

  if (!visible) return null;

  const pathParts = currentDir ? currentDir.split('/').filter(Boolean) : [];
  const breadcrumbs = [
    { name: '/', path: '/' },
    ...pathParts.map((part, i) => ({
      name: part,
      path: '/' + pathParts.slice(0, i + 1).join('/')
    }))
  ];

  return (
    <div className="file-explorer">
      <div className="file-explorer-header">
        <h3 className="file-explorer-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          文件管理
        </h3>
        <div className="fe-header-actions">
          <button
            className={`fe-hidden-toggle ${showHidden ? 'active' : ''}`}
            onClick={() => setShowHidden(!showHidden)}
            title={showHidden ? '隐藏隐藏文件' : '显示隐藏文件'}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              {showHidden ? (
                <>
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </>
              ) : (
                <>
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                  <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </>
              )}
            </svg>
          </button>
          <button className="fe-close-btn" onClick={onToggle} title="关闭">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      <div className="file-explorer-path">
        <button className="fe-up-btn" onClick={handleGoUp} title="上级目录" disabled={currentDir === '/'}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
            <line x1="12" y1="19" x2="12" y2="5" />
            <polyline points="5 12 12 5 19 12" />
          </svg>
        </button>
        <div className="fe-breadcrumbs">
          {breadcrumbs.map((crumb, i) => (
            <span key={crumb.path}>
              {i > 0 && <span className="fe-sep">/</span>}
              <button
                className="fe-crumb"
                onClick={() => handleNavigate(crumb.path)}
              >
                {crumb.name}
              </button>
            </span>
          ))}
        </div>
        <button className="fe-refresh-btn" onClick={handleRefresh} title="刷新">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
        </button>
      </div>

      <div className="file-explorer-list">
        {loading && <div className="fe-loading">加载中...</div>}
        {error && <div className="fe-error">{error}</div>}
        {!loading && !error && entries.length === 0 && (
          <div className="fe-empty">空目录</div>
        )}
        {!loading && entries.map((entry) => (
          <div
            key={entry.name}
            className={`fe-entry ${entry.type === 'directory' ? 'fe-dir' : ''}`}
            onClick={() => {
              if (entry.type === 'directory') {
                handleNavigate(currentDir + '/' + entry.name);
              }
            }}
          >
            <span className="fe-entry-icon">
              {entry.type === 'directory' ? getDirIcon() : getFileIcon()}
            </span>
            <span className="fe-entry-name" title={entry.name}>{entry.name}</span>
            <span className="fe-entry-size">{entry.type === 'file' ? formatSize(entry.size) : ''}</span>
            <span className="fe-entry-time">{formatTime(entry.mtime)}</span>
          </div>
        ))}
      </div>

      <div className="file-explorer-footer">
        <button
          className="fe-upload-btn"
          onClick={() => setShowUploadModal(true)}
          title="上传到当前目录"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          上传文件到此目录
        </button>
      </div>

      {showUploadModal && (
        <UploadModal
          key={uploadKey}
          onClose={handleUploadComplete}
          token={token}
          defaultDirectory={currentDir}
        />
      )}
    </div>
  );
}

export default FileExplorer;
