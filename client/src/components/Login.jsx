// 登录页面：支持登录和首次登录强制修改密码
import { useState, useEffect, useRef } from 'react';
import './Login.css';

function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // 首次登录（默认密码）必须修改密码
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [loginToken, setLoginToken] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const newPasswordRef = useRef(null);

  useEffect(() => {
    if (mustChangePassword && newPasswordRef.current) {
      setTimeout(() => newPasswordRef.current.focus(), 50);
    }
  }, [mustChangePassword]);

  // 登录请求
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        throw new Error('用户名或密码错误');
      }

      const data = await response.json();

      if (data.passwordChangeRequired) {
        setLoginToken(data.token);
        setMustChangePassword(true);
        setLoading(false);
        return;
      }

      localStorage.setItem('token', data.token);
      localStorage.setItem('username', data.username);
      onLogin(data.token, data.username);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 8) {
      setError('新密码至少需要8位');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('两次输入密码不一致');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${loginToken}`,
        },
        body: JSON.stringify({ oldPassword: password, newPassword }),
      });

      if (!response.ok) {
        throw new Error('修改密码失败');
      }

      localStorage.setItem('token', loginToken);
      localStorage.setItem('username', username);
      onLogin(loginToken, username);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (mustChangePassword) {
    return (
      <div className="login-container">
        <div className="login-box">
          <h1>修改密码</h1>
          <p className="login-subtitle">首次登录需修改密码后方可继续使用</p>

          {error && <div className="login-error">{error}</div>}

          <form className="login-form" onSubmit={handleChangePassword}>
            <div className="form-group">
              <label htmlFor="newPassword">新密码</label>
              <input
                ref={newPasswordRef}
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="请输入新密码（至少8位）"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="confirmPassword">确认密码</label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="请再次输入新密码"
                required
              />
            </div>

            <button type="submit" className="login-button" disabled={loading}>
              {loading ? '修改中...' : '确认修改'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="login-container">
      <div className="login-box">
        <h1>远程终端管理</h1>
        <p className="login-subtitle">请登录以继续</p>

        {error && <div className="login-error">{error}</div>}

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="username">用户名</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="请输入用户名"
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">密码</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
              required
            />
          </div>

          <button type="submit" className="login-button" disabled={loading}>
            {loading ? '登录中...' : '登录'}
          </button>
        </form>

      </div>
    </div>
  );
}

export default Login;
