import React, { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import './Terminal.css';

function Terminal({ sessionId, ws, onClose, onRename, shell }) {
  const terminalRef = useRef(null);
  const xtermRef = useRef(null);
  const fitAddonRef = useRef(null);
  const [isConnected, setIsConnected] = useState(true);
  const [sessionName, setSessionName] = useState(`Terminal ${sessionId.slice(0, 8)}`);

  useEffect(() => {
    if (!terminalRef.current) return;

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

    xtermRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // 发送 attach 消息来接收历史输出
    ws.send(JSON.stringify({
      type: 'attach',
      sessionId
    }));

    ws.send(JSON.stringify({
      type: 'resize',
      sessionId,
      cols: terminal.cols,
      rows: terminal.rows
    }));

    terminal.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'input',
          sessionId,
          data
        }));
      }
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

    const handleMessage = (event) => {
      const message = JSON.parse(event.data);

      if (message.type === 'output' && message.sessionId === sessionId) {
        terminal.write(message.data);
      } else if (message.type === 'session-attached' && message.sessionId === sessionId) {
        // 写入历史输出
        if (message.history) {
          terminal.write(message.history);
        }
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
      resizeObserver.disconnect();
      terminal.dispose();
    };
  }, [sessionId, ws]);

  const handleRename = () => {
    const newName = prompt('输入新的终端名称:', sessionName);
    if (newName && newName.trim()) {
      onRename(sessionId, newName.trim());
      setSessionName(newName.trim());
    }
  };

  return (
    <div className="terminal-container">
      <div className="terminal-header">
        <div className="terminal-info">
          <span className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}></span>
          <span className="session-name">{sessionName}</span>
          <span className="session-shell">{shell}</span>
        </div>
        <div className="terminal-actions">
          <button className="action-btn" onClick={handleRename} title="重命名">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
          <button className="action-btn close-btn" onClick={() => onClose(sessionId)} title="关闭终端">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>
      <div className="terminal-body" ref={terminalRef}></div>
    </div>
  );
}

export default Terminal;
