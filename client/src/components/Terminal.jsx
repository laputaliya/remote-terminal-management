import React, { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { ConfirmModal, PromptModal } from './Modal';
import './Terminal.css';

const Terminal = forwardRef(({ sessionId, ws, onClose, onRename, shell, compact = false, name, isExternal = false }, ref) => {
  const terminalRef = useRef(null);
  const xtermRef = useRef(null);
  const fitAddonRef = useRef(null);
  const [isConnected, setIsConnected] = useState(true);
  const [sessionName, setSessionName] = useState(name || `Terminal ${sessionId.slice(0, 8)}`);
  const isAttachedRef = useRef(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);

  // 暴露 focus 方法给父组件
  useImperativeHandle(ref, () => ({
    focus: () => {
      if (xtermRef.current) {
        xtermRef.current.focus();
      }
    }
  }));

  useEffect(() => {
    if (!terminalRef.current) return;

    // Reset attachment flag when ws changes (reconnect scenario)
    isAttachedRef.current = false;

    const terminal = new XTerm({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: '"Cascadia Code", "Fira Code", Consolas, monospace',
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#ffffff',
        selection: 'rgba(255, 255, 255, 0.3)',
        black: '#1e1e1e',
        red: '#f44747',
        green: '#608b4e',
        yellow: '#dcdcaa',
        blue: '#569cd6',
        magenta: '#c586c0',
        cyan: '#4ec9b0',
        white: '#d4d4d4',
        brightBlack: '#808080',
        brightRed: '#f44747',
        brightGreen: '#608b4e',
        brightYellow: '#dcdcaa',
        brightBlue: '#569cd6',
        brightMagenta: '#c586c0',
        brightCyan: '#4ec9b0',
        brightWhite: '#ffffff'
      },
      scrollback: 10000,
      allowProposedApi: true
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    terminal.open(terminalRef.current);
    fitAddon.fit();

    // 右键粘贴：无选中文本时粘贴剪贴板内容
    terminal.element.addEventListener('contextmenu', (e) => {
      const selection = terminal.getSelection();
      if (!selection) {
        e.preventDefault();
        navigator.clipboard.readText().then(text => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'input', sessionId, data: text }));
          }
        }).catch(() => {});
      }
    });

    xtermRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // 等待 WebSocket 连接就绪后再发送消息
    const sendAttach = () => {
      if (ws.readyState === WebSocket.OPEN) {
        setTimeout(() => {
          // 先发送 attach 获取历史输出，resize 由 ResizeObserver 触发
          // 避免 resize 先于 attach 导致 shell 输出重复提示符
          ws.send(JSON.stringify({
            type: 'attach',
            sessionId
          }));
        }, 100);
      } else {
        ws.addEventListener('open', sendAttach, { once: true });
      }
    };

    sendAttach();

    terminal.onData((data) => {
      // Only forward input after receiving session-attached
      // This prevents xterm init sequences (like DA query) from being sent to PTY
      if (!isAttachedRef.current) return;
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'input',
          sessionId,
          data
        }));
      }
    });

    // 处理特殊按键和剪贴板快捷键
    terminal.attachCustomKeyEventHandler((e) => {
      // Ctrl+Shift+C: 复制选中文本（xterm 不支持，需手动处理）
      if (e.type === 'keydown' && !e.repeat && e.ctrlKey && e.shiftKey && e.key === 'C') {
        const selection = terminal.getSelection();
        if (selection) {
          navigator.clipboard.writeText(selection).catch(() => {});
        }
        return false;
      }
      // Ctrl+Shift+V: xterm 原生支持粘贴，不拦截让其正常处理
      // Alt + 数字键 或 Alt + 方向键 不阻止默认行为，让父组件处理
      if (e.altKey && (
        (e.key >= '0' && e.key <= '9') ||
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowRight' ||
        e.key === 'ArrowUp' ||
        e.key === 'ArrowDown'
      )) {
        return false;
      }
      return true;
    });

    const handleResize = () => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit();
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'resize',
            sessionId,
            cols: terminal.cols,
            rows: terminal.rows
          }));
        }
      }
    };

    window.addEventListener('resize', handleResize);
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(terminalRef.current);

    // 页面可见性变化时刷新终端渲染（解决切屏后出现残影/闪烁问题）
    const refreshTerminal = () => {
      if (!fitAddonRef.current) return;
      requestAnimationFrame(() => {
        try {
          fitAddonRef.current.fit();
          terminal.refresh(0, terminal.rows - 1);
        } catch (e) {
          // ignore refresh errors during dispose
        }
      });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshTerminal();
      }
    };
    window.addEventListener('focus', refreshTerminal);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // 输出后延迟刷新终端，修复 tmux 多客户端连接时的渲染残留
    let refreshDebounce = null;
    const scheduleRefresh = () => {
      if (refreshDebounce) clearTimeout(refreshDebounce);
      refreshDebounce = setTimeout(() => {
        if (fitAddonRef.current && document.visibilityState === 'visible') {
          requestAnimationFrame(() => {
            try { terminal.refresh(0, terminal.rows - 1); } catch (e) {}
          });
        }
      }, 150);
    };

    // Buffer output received before session-attached to avoid duplicate prompt on refresh
    let preAttachBuffer = '';
    let attached = false;

    const handleMessage = (event) => {
      const message = JSON.parse(event.data);

      if (message.type === 'output' && message.sessionId === sessionId) {
        if (!attached) {
          preAttachBuffer += message.data;
        } else {
          terminal.write(message.data);
        }
        scheduleRefresh();
      } else if (message.type === 'session-attached' && message.sessionId === sessionId) {
        // Write history first, then flush buffered output
        if (message.history) {
          terminal.write(message.history);
        }
        attached = true;
        isAttachedRef.current = true;
        // Flush any output that arrived after the history was captured
        if (preAttachBuffer) {
          terminal.write(preAttachBuffer);
          preAttachBuffer = '';
        }
        scheduleRefresh();
      } else if (message.type === 'session-updated') {
        if (message.session.id === sessionId) {
          setSessionName(message.session.name);
        }
      }
    };

    ws.addEventListener('message', handleMessage);

    const handleClose = () => setIsConnected(false);
    const handleOpen = () => setIsConnected(true);
    ws.addEventListener('close', handleClose);
    ws.addEventListener('open', handleOpen);

    return () => {
      ws.removeEventListener('message', handleMessage);
      ws.removeEventListener('close', handleClose);
      ws.removeEventListener('open', handleOpen);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('focus', refreshTerminal);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (refreshDebounce) clearTimeout(refreshDebounce);
      resizeObserver.disconnect();
      terminal.dispose();
    };
  }, [sessionId, ws]);

  const handleRename = (newName) => {
    onRename(sessionId, newName);
    setSessionName(newName);
    setShowRenameModal(false);
  };

  if (compact) {
    return (
      <div className="terminal-body compact" ref={terminalRef}></div>
    );
  }

  return (
    <div className="terminal-container">
      <div className="terminal-header">
        <div className="terminal-info">
          <span className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}></span>
          <span className="session-name">{sessionName}</span>
          <span className="session-shell">{shell}</span>
        </div>
        <div className="terminal-actions">
          <button className="action-btn" onClick={() => setShowRenameModal(true)} title="重命名">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
          <button className="action-btn close-btn" onClick={() => setShowCloseModal(true)} title="关闭终端">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>
      <div className="terminal-body" ref={terminalRef}></div>

      {showRenameModal && (
        <PromptModal
          title="输入新名称"
          defaultValue={sessionName}
          onConfirm={handleRename}
          onCancel={() => setShowRenameModal(false)}
        />
      )}
      {showCloseModal && (
        <ConfirmModal
          message={isExternal
            ? `确定关闭终端 "${sessionName || sessionId.slice(0, 8)}"？\n\n注意：这将真正关闭tmux/screen会话，会话内的所有内容将丢失。`
            : `确定关闭终端 "${sessionName || sessionId.slice(0, 8)}"？`
          }
          onConfirm={() => { setShowCloseModal(false); onClose(sessionId); }}
          onCancel={() => setShowCloseModal(false)}
        />
      )}
    </div>
  );
});

export default Terminal;
