import { spawn, execSync, spawnSync } from 'child_process';
import * as pty from 'node-pty';

/**
 * Get list of tmux sessions
 */
export function getTmuxSessions() {
  try {
    // Check if tmux is available
    execSync('which tmux', { encoding: 'utf-8' });
    
    // List sessions: format session_name:window_count:attached_count
    const output = execSync('tmux list-sessions -F "#{session_name}:#{session_windows}:#{session_attached}" 2>/dev/null || echo ""', {
      encoding: 'utf-8',
      timeout: 5000
    });
    
    if (!output.trim()) return [];
    
    const sessions = output.trim().split('\n').map(line => {
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
    // tmux not installed or no sessions
    return [];
  }
}

/**
 * Get list of screen sessions
 */
export function getScreenSessions() {
  try {
    // Check if screen is available
    execSync('which screen', { encoding: 'utf-8' });
    
    // List screen sessions
    const output = execSync('screen -ls 2>/dev/null || echo ""', {
      encoding: 'utf-8',
      timeout: 5000
    });
    
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

/**
 * Get list of user's shell processes (excluding this app's PTY processes)
 */
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

/**
 * Get all external terminals/sessions
 */
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

/**
 * Attach to a tmux session - returns a PTY process
 */
export function attachTmuxSession(sessionName, cols = 80, rows = 24) {
  const ptyProcess = pty.spawn('tmux', ['attach', '-d', '-t', sessionName], {
    name: 'xterm-256color',
    cols: cols || 80,
    rows: rows || 24,
    cwd: process.env.HOME || process.env.USERPROFILE || '/',
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      TMUX: '' // Clear TMUX env to allow attach from within tmux
    }
  });

  return ptyProcess;
}

/**
 * Attach to a screen session - returns a PTY process
 */
export function attachScreenSession(sessionName, cols = 80, rows = 24) {
  const ptyProcess = pty.spawn('screen', ['-r', sessionName], {
    name: 'xterm-256color',
    cols: cols || 80,
    rows: rows || 24,
    cwd: process.env.HOME || process.env.USERPROFILE || '/',
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      STY: '' // Clear STY env
    }
  });
  return ptyProcess;
}