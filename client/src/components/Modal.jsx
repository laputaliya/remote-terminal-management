import { useState } from 'react';
import './Modal.css';

export function ConfirmModal({ message, onConfirm, onCancel }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content modal-confirm" onClick={e => e.stopPropagation()}>
        <div className="modal-body">
          <p className="modal-message">{message}</p>
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onCancel}>取消</button>
          <button className="btn-danger" onClick={onConfirm}>确定</button>
        </div>
      </div>
    </div>
  );
}

export function PromptModal({ title, defaultValue, onConfirm, onCancel }) {
  const [value, setValue] = useState(defaultValue || '');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (value.trim()) {
      onConfirm(value.trim());
    }
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content modal-prompt" onClick={e => e.stopPropagation()}>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <label className="modal-label">{title}</label>
            <input
              className="modal-input"
              type="text"
              value={value}
              onChange={e => setValue(e.target.value)}
              autoFocus
              onFocus={e => e.target.select()}
            />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onCancel}>取消</button>
            <button type="submit" className="btn-primary">确定</button>
          </div>
        </form>
      </div>
    </div>
  );
}
