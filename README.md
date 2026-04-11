# Remote Terminal Manager

一个支持多终端管理、后台持久运行的网页终端工具。

## 功能特性

- 🌐 **网页访问**: 通过浏览器访问终端，无需安装任何客户端
- 🔄 **多终端管理**: 支持同时管理多个终端会话
- 💾 **会话持久化**: 关闭网页后终端继续运行
- 🔌 **自动重连**: 刷新/重新打开网页自动加载已有会话
- 📱 **响应式设计**: 适配桌面和移动设备

## 技术栈

- **后端**: Node.js, Express, WebSocket, node-pty
- **前端**: React, xterm.js, WebSocket

## 快速开始

### 安装依赖

```bash
npm install
```

### 启动服务器

```bash
npm start
```

### 访问

打开浏览器访问 `http://localhost:3000`

## 项目结构

```
.
├── server/
│   ├── index.js          # 服务器入口
│   ├── sessions.js       # 会话管理
│   └── pty-manager.js    # PTY 进程管理
├── client/
│   ├── src/
│   │   ├── App.jsx       # 主应用
│   │   ├── components/
│   │   │   ├── Terminal.jsx    # 终端组件
│   │   │   └── Sidebar.jsx     # 侧边栏
│   │   └── styles/
│   │       └── terminal.css
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
└── package.json
```

## API

### WebSocket 端点

- `/ws` - WebSocket 连接端点

### REST API

- `GET /api/sessions` - 获取所有会话列表
- `POST /api/sessions` - 创建新会话
- `DELETE /api/sessions/:id` - 删除会话

## License

MIT
