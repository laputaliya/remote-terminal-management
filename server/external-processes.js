// 外部终端进程管理：检测、连接 tmux/screen 会话和系统 shell 进程
import { spawn, spawnSync } from 'child_process';
import * as pty from 'node-pty';

// 环境变量白名单，防止连接外部终端时泄露敏感信息
const ALLOWED_ENV_KEYS = ['PATH', 'HOME', 'USER', 'LOGNAME', 'LANG', 'SHELL', 'TERM', 'COLORTERM'];

function buildSafeEnv(extra = {}) {
  const env = {};
  for (const key of ALLOWED_ENV_KEYS) {
    if (process.env[key] !== undefined) {
      env[key] = process.env[key];
    }
  }
  return { ...env, ...extra };
}

// 获取当前用户的所有 tmux 会话列表
export function getTmuxSessions() {
  try {
    // 检查 tmux 是否可用
    const whichResult = spawnSync('which', ['tmux'], { encoding: 'utf-8', timeout: 5000 });
    if (whichResult.status !== 0) return [];

    // 列出会话：格式 session_name:window_count:attached_count
    const result = spawnSync('tmux', ['list-sessions', '-F', '#{session_name}:#{session_windows}:#{session_attached}'], {
      encoding: 'utf-8',
      timeout: 5000
    });

    if (result.error || !result.stdout || !result.stdout.trim()) return [];

    const sessions = result.stdout.trim().split('\n').map(line => {
      const [name, windows, attached] = line.split(':');
      return {
        type: 'tmux',
        name,
        windows: parseInt(windows || '0', 10),
        attached: parseInt(attached || '0', 10),
        status: parseInt(attached || '0', 10) > 0 ? 'attached' : 'detached'
      };
    });

    return sessions;
  } catch (error) {
    return [];
  }
}

// 获取当前用户的所有 screen 会话列表
export function getScreenSessions() {
  try {
    // 检查 screen 是否可用
    const whichResult = spawnSync('which', ['screen'], { encoding: 'utf-8', timeout: 5000 });
    if (whichResult.status !== 0) return [];

    // 列出 screen 会话
    const result = spawnSync('screen', ['-ls'], {
      encoding: 'utf-8',
      timeout: 5000
    });

    if (result.error) return [];
    const output = result.stderr || result.stdout || '';
    
    if (!output.trim()) return [];
    
    const sessions = [];
    const lines = output.trim().split('\n');
    
    for (const line of lines) {
      // Parse screen output like: "12345.sessionname  (Detached)"
      const match = line.match(/^\s*(\d+)\.(\S+)\s+\((Attached|Detached)\)/);
      if (match) {
        sessions.push({
          type: 'screen',
          name: match[2],
          pid: match[1],
          status: match[3].toLowerCase()
        });
      }
    }
    
    return sessions;
  } catch (error) {
    // screen not installed or no sessions
    return [];
  }
}

// 获取当前用户的 shell 进程列表（排除本应用的 PTY 进程）
export function getShellProcesses(currentPtyPids = []) {
  try {
    const username = process.env.USER || process.env.LOGNAME;
    if (!username) return [];

    // Use spawnSync with array args to avoid shell injection
    const result = spawnSync('ps', ['-u', username, '-o', 'pid,ppid,comm,cmd', '--no-headers'], {
      encoding: 'utf-8',
      timeout: 5000
    });

    if (result.error || !result.stdout || !result.stdout.trim()) return [];

    // Filter shell processes in JavaScript, not via shell grep
    const userShell = process.env.SHELL ? process.env.SHELL.split('/').pop() : '';
    const shellNames = ['bash', 'zsh', 'dash', 'fish', 'sh'];
    if (userShell && !shellNames.includes(userShell)) {
      shellNames.push(userShell);
    }
    const shellPattern = new RegExp(`^(${shellNames.join('|')})$`);

    const processes = [];
    const lines = result.stdout.trim().split('\n');

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 3) {
        const pid = parseInt(parts[0], 10);
        const ppid = parseInt(parts[1], 10);
        const comm = parts[2];

        // Only include shell processes
        if (!shellPattern.test(comm)) continue;

        const cmd = parts.slice(3).join(' ') || comm;

        // Skip processes that are PTY processes of this app
        if (currentPtyPids.includes(pid)) continue;

        // Skip very short-lived or child processes
        if (ppid === 1) continue;

        processes.push({
          type: 'process',
          pid,
          ppid,
          name: comm,
          cmd: cmd.substring(0, 100),
          status: 'running'
        });
      }
    }

    return processes;
  } catch (error) {
    return [];
  }
}

// 汇总所有外部终端信息（tmux + screen + shell 进程）
export function getExternalTerminals(currentPtyPids = []) {
  const tmuxSessions = getTmuxSessions();
  const screenSessions = getScreenSessions();
  const shellProcesses = getShellProcesses(currentPtyPids);
  
  return {
    tmux: tmuxSessions,
    screen: screenSessions,
    processes: shellProcesses,
    total: tmuxSessions.length + screenSessions.length + shellProcesses.length
  };
}

// 连接到已存在的 tmux 会话，返回 PTY 进程用于 WebSocket 桥接
export function attachTmuxSession(sessionName, cols = 80, rows = 24) {
  const ptyProcess = pty.spawn('tmux', ['attach', '-d', '-t', sessionName], {
    name: 'xterm-256color',
    cols: cols || 80,
    rows: rows || 24,
    cwd: process.env.HOME || process.env.USERPROFILE || '/',
    env: buildSafeEnv({
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      TMUX: '' // 清除 TMUX 环境变量，允许从 tmux 内部连接到另一个 tmux
    })
  });

  return ptyProcess;
}

// 连接到已存在的 screen 会话，返回 PTY 进程用于 WebSocket 桥接
export function attachScreenSession(sessionName, cols = 80, rows = 24) {
  const ptyProcess = pty.spawn('screen', ['-r', sessionName], {
    name: 'xterm-256color',
    cols: cols || 80,
    rows: rows || 24,
    cwd: process.env.HOME || process.env.USERPROFILE || '/',
    env: buildSafeEnv({
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      STY: '' // 清除 STY 环境变量，避免嵌套 screen 会话问题
    })
  });
  return ptyProcess;
}