# CLAUDE.md

此文件为 Claude Code (claude.ai/code) 在此代码库中工作时提供指导。

## 概述

远程终端管理器是一个基于网页的终端应用程序，允许用户通过浏览器界面管理多个持久化终端会话。该应用程序支持同时管理多个终端，在浏览器会话之间保持会话持久性，并提供各种布局选项以查看多个终端。

## 架构

### 技术栈
- **后端**: Node.js, Express.js, WebSocket (ws), node-pty
- **前端**: React 18+, xterm.js (终端仿真), WebSocket
- **构建工具**: Vite, npm

### 目录结构
```
.
├── server/
│   ├── index.js              # 主服务器入口点
│   ├── websocket-handler.js  # WebSocket 连接和消息处理
│   ├── sessions.js           # 会话持久化管理
│   ├── pty-manager.js        # PTY (伪终端) 进程管理
│   └── auth.js               # 身份验证和会话管理
├── client/
│   ├── src/
│   │   ├── App.jsx           # 主应用程序组件
│   │   ├── components/
│   │   │   ├── Terminal.jsx  # 独立终端组件 (xterm.js 包装器)
│   │   │   ├── MultiTerminal.jsx # 多终端网格/布局管理
│   │   │   └── Sidebar.jsx   # 会话管理侧边栏
│   │   └── styles/
│   ├── index.html
│   └── vite.config.js
└── package.json
```

### 核心组件

#### 后端架构
- **Express 服务器**: 处理 REST API 端点并提供静态文件服务
- **WebSocket 服务器**: 使用 ws 库进行终端 I/O 的实时通信
- **身份验证层**: 基于令牌的身份验证，带有加密密码 (PBKDF2)
- **PTY 管理**: 使用 node-pty 创建和管理伪终端进程
- **会话持久化**: 将终端会话保存到磁盘并在重启时恢复

#### 前端架构
- **App.jsx**: 主应用程序，具有 WebSocket 连接管理和身份验证状态
- **MultiTerminal.jsx**: 管理多个终端布局 (单屏、分割、四分格等)
- **Terminal.jsx**: 使用 xterm.js 的独立终端组件，具有自动调整大小和输入/输出处理功能
- **Sidebar.jsx**: 会话管理面板，具有创建/删除/重命名功能

## 数据流

1. **身份验证流程**: 客户端登录 → 接收令牌 → 令牌存储在 localStorage 中 → 后续请求包含 Authorization 头
2. **终端创建流程**: WebSocket `create` 消息 → PTY 进程创建 → 会话持久化到磁盘 → 向客户端发送通知
3. **终端 I/O 流程**: xterm.js 发送输入 → WebSocket `input` 消息 → PTY 进程写入 → PTY 输出 → WebSocket 广播 → xterm.js 显示
4. **会话持久化**: 会话保存到 `.data/sessions.json`，用户数据保存到 `.data/users.json`，身份验证会话保存到 `.data/auth-sessions.json`

## 主要特性

- **多终端管理**: 支持多个同时运行的终端会话
- **会话持久化**: 关闭浏览器后终端继续运行
- **自动重连**: 页面刷新后自动重新连接到现有会话
- **多种布局**: 8 种不同的终端网格布局 (单屏、分割、四分格等)
- **终端历史记录**: 跨会话保留输出历史 (最多 100,000 个字符)
- **键盘快捷键**: Alt+数字键和箭头键用于快速切换终端
- **身份验证**: 基于令牌的身份验证，支持更改密码
- **响应式设计**: 在桌面和移动设备上都能正常工作

## 常见开发任务

### 启动开发
```bash
# 安装依赖
npm run install:all

# 在开发模式下启动服务器和客户端
npm run dev

# 或者分别启动：
npm run server  # 启动后端服务器
cd client && npm run dev  # 启动前端开发服务器
```

### 构建生产版本
```bash
# 构建前端
cd client && npm run build

# 启动生产服务器
npm start
```

### WebSocket 消息类型
- `list`: 获取会话列表
- `create`: 创建新终端会话
- `delete`: 删除终端会话
- `rename`: 重命名会话
- `attach`: 附加到会话并接收输出
- `input`: 向终端发送输入
- `resize`: 调整终端尺寸

### API 端点
- `POST /api/auth/login` - 用户身份验证
- `POST /api/auth/logout` - 用户注销
- `POST /api/auth/change-password` - 更改密码
- `GET /api/sessions` - 获取所有会话
- `DELETE /api/sessions/:id` - 删除特定会话
- `GET /api/health` - 健康检查

## 开发注意事项

- 应用程序将在 `.data/` 目录中存储用户数据和会话
- 终端输出会在内存中保留，并在客户端重新连接时恢复
- 前端会使用指数退避策略自动重新连接到 WebSocket
- PTY 进程与 WebSocket 连接独立管理
- 身份验证令牌在 7 天后过期，存储在客户端 localStorage 中
- 终端主题使用类似 VS Code 的深色主题，支持标准 ANSI 颜色
- 所有终端尺寸都使用 xterm.js 的 FitAddon 自动处理