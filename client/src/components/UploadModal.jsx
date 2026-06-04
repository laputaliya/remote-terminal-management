import { useState, useRef, useEffect } from 'react';
import './UploadModal.css';

function UploadModal({ onClose, token, defaultDirectory }) {
  const [file, setFile] = useState(null);
  const [targetDir, setTargetDir] = useState(defaultDirectory || '');

  useEffect(() => {
    setTargetDir(defaultDirectory || '');
  }, [defaultDirectory]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);
  const xhrRef = useRef(null);

  const handleFileSelect = (e) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      setError('');
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) {
      setFile(dropped);
      setError('');
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleUpload = () => {
    if (!file) {
      setError('请选择文件');
      return;
    }

    setUploading(true);
    setProgress(0);
    setError('');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('targetDir', targetDir.trim());

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        setProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener('load', () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && data.success) {
          setSuccess(`文件已上传到: ${data.filePath}`);
          setUploading(false);
        } else {
          setError(data.error || '上传失败');
          setUploading(false);
        }
      } catch {
        setError('上传失败');
        setUploading(false);
      }
    });

    xhr.addEventListener('error', () => {
      setError('网络错误');
      setUploading(false);
    });

    xhr.addEventListener('abort', () => {
      setUploading(false);
      setProgress(0);
    });

    xhr.open('POST', '/api/upload');
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.send(formData);
  };

  const handleCancel = () => {
    if (uploading) {
      xhrRef.current?.abort();
    }
    onClose();
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="modal-overlay" onClick={handleCancel}>
      <div className="modal-content upload-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>上传文件</h3>
          <button className="modal-close" onClick={handleCancel}>&times;</button>
        </div>

        {success ? (
          <div className="upload-success">
            <div className="modal-success">{success}</div>
            <div className="modal-actions">
              <button className="btn-primary" onClick={onClose}>关闭</button>
            </div>
          </div>
        ) : (
          <div className="upload-body">
            {error && <div className="modal-error">{error}</div>}

            <div
              className={`upload-drop-zone ${dragOver ? 'drag-over' : ''} ${file ? 'has-file' : ''}`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />
              {file ? (
                <div className="upload-file-info">
                  <span className="upload-file-name">{file.name}</span>
                  <span className="upload-file-size">{formatSize(file.size)}</span>
                </div>
              ) : (
                <div className="upload-drop-placeholder">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="48" height="48">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  <span>点击或拖拽文件到这里</span>
                </div>
              )}
            </div>

            <div className="upload-form-group">
              <label>目标目录</label>
              <input
                type="text"
                className="modal-input"
                value={targetDir}
                onChange={(e) => setTargetDir(e.target.value)}
                placeholder="默认: 用户主目录"
                disabled={uploading}
              />
            </div>

            {uploading && (
              <div className="upload-progress-container">
                <div className="upload-progress-bar">
                  <div className="upload-progress-fill" style={{ width: `${progress}%` }} />
                </div>
                <span className="upload-progress-text">{progress}%</span>
              </div>
            )}

            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={handleCancel} disabled={uploading}>
                取消
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleUpload}
                disabled={uploading || !file}
              >
                {uploading ? '上传中...' : '上传'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default UploadModal;
