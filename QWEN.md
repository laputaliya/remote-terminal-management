# QWEN.md

本文件为 Qwen Code 在此代码库中工作时提供指导和上下文。

## 项目概述

远程终端管理器是一个基于网页的终端应用程序，允许用户通过浏览器界面管理多个持久化终端会话。终端在后台持续运行，即使关闭浏览器后仍可保持会话，刷新页面后自动重连。

### 核心功能
- 多终端管理，支持 8 种布局（最多同时显示 4 个终端）
- 跨浏览器会话持久化
- 自动重连已有会话
- 基于 Token 的身份认证，支持修改密码
- 终端输出历史保留（最多 100,000 字符）
- 终端切换快捷键（Alt+1/2/3/4，Alt+方向键）
- 响应式设计，适配桌面和移动设备

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Node.js, Express.js, WebSocket (ws), node-pty |
| 前端 | React 19, xterm.js, WebSocket |
| 构建工具 | Vite |
| 包管理器 | npm |

## 架构

```
┌─────────────────────────────────────────────────────────────┐
│                      前端 (React)                           │
│  ┌──────────┐  ┌────────────────┐  ┌──────────────────────┐ │
│  │ Sidebar  │  │ MultiTerminal  │  │ Terminal (xterm.js)  │ │
│  └────┬─────┘  └───────┬────────┘  └──────────┬───────────┘ │
└───────┼────────────────┼─────────────────────┼──────────────┘
        │                │                     │
        └────────────────┼─────────────────────┘
                         │ WebSocket + REST API
┌────────────────────────┼────────────────────────────────────┐
│                       后端 (Express)                         │
│  ┌──────────────┐  ┌─────────────────┐  ┌────────────────┐  │
│  │ auth.js      │  │ websocket-      │  │ pty-manager.js │  │
│  │ (Token认证)  │  │ handler.js      │  │ (node-pty)     │  │
│  └──────────────┘  └─────────────────┘  └────────────────┘  │
│                         │                   │                │
│  ┌──────────────────────┴───────────────────┴──────────────┐ │
│  │                    sessions.js                          │ │
│  │            (会话持久化到磁盘)                            │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

### 目录结构

```
remote-terminal-management/
├── server/
│   ├── index.js              # Express 服务入口、路由、WebSocket 配置
│   ├── websocket-handler.js  # WebSocket 消息路由和处理
│   ├── sessions.js           # 会话持久化（JSON 文件存储）
│   ├── pty-manager.js        # PTY 进程生命周期管理
│   └── auth.js               # 认证、Token 管理、密码哈希
├── client/
│   ├── src/
│   │   ├── App.jsx           # 主应用，包含认证状态和 WebSocket 连接
│   │   ├── App.css           # 全局样式
│   │   ├── main.jsx          # React 入口
│   │   └── components/
│   │       ├── Terminal.jsx      # xterm.js 封装，处理 fit/resize
│   │       ├── MultiTerminal.jsx # 布局管理器（8 种布局，快捷键）
│   │       ├── Sidebar.jsx       # 会话列表，创建/删除/重命名控制
│   │       └── Login.jsx         # 认证表单
│   ├── index.html
│   ├── vite.config.js        # Vite 配置，开发环境 API 代理
│   └── package.json
├── .data/                    # 运行时数据（git 忽略）
│   ├── sessions.json         # 终端会话元数据
│   ├── users.json            # 用户凭据（哈希存储）
│   └── auth-sessions.json    # 活跃认证 Token
├── dist/                     # 生产构建输出
├── package.json              # 根包（后端依赖）
└── README.md
```

## 构建和运行命令

```bash
# 安装所有依赖（根目录 + client）
npm run install:all

# 开发模式（同时运行后端和前端开发服务器）
npm run dev

# 开发模式（分开运行）
npm run server           # 仅后端，端口 3000
cd client && npm run dev  # 前端开发服务器，端口 5173

# 生产构建
cd client && npm run build  # 构建到 ../dist/

# 生产启动
npm start  # 从 dist/ 提供静态文件，端口 3000
```

### 环境配置
- 默认端口：`3000`（可通过 `PORT` 环境变量配置）
- 默认凭据：`admin` / `admin`（首次运行时创建）

## 数据流

### 认证流程
1. 客户端 POST 到 `/api/auth/login` 发送凭据
2. 服务器验证，生成 Token（7 天有效期），存储到 `.data/auth-sessions.json`
3. 客户端将 Token 存储在 `localStorage`，通过 `Authorization: Bearer <token>` 头发送
4. WebSocket 通过 `?token=<token>` 查询参数连接

### 终端会话生命周期
1. **创建**：WebSocket `create` 消息 → PTY 创建 → 会话保存到 `.data/sessions.json`
2. **I/O**：xterm.js 输入 → WebSocket `input` → PTY 写入 → PTY 输出 → WebSocket 广播 → xterm.js 显示
3. **重连**：客户端重连 → `list` → `attach` → 接收输出历史缓冲
4. **删除**：WebSocket `delete` → PTY 终止 → 从 JSON 移除会话

### WebSocket 消息类型

| 类型 | 方向 | 用途 |
|------|------|------|
| `list` | 客户端 → 服务器 | 请求会话列表 |
| `create` | 客户端 → 服务器 | 创建新终端 |
| `attach` | 客户端 → 服务器 | 订阅终端输出 |
| `input` | 客户端 → 服务器 | 发送按键到终端 |
| `resize` | 客户端 → 服务器 | 调整终端尺寸 |
| `delete` | 客户端 → 服务器 | 终止终端会话 |
| `rename` | 客户端 → 服务器 | 重命名会话 |
| `session-list` | 服务器 → 客户端 | 响应 `list` |
| `session-created` | 服务器 → 客户端 | 新会话通知 |
| `session-attached` | 服务器 → 客户端 | 附着确认，包含历史 |
| `output` | 服务器 → 客户端 | 终端输出数据 |
| `session-deleted` | 服务器 → 客户端 | 删除确认 |
| `session-updated` | 服务器 → 客户端 | 会话元数据更新 |

### REST API 接口

| 方法 | 端点 | 需认证 | 描述 |
|------|------|--------|------|
| POST | `/api/auth/login` | 否 | 认证，返回 `{token, username}` |
| POST | `/api/auth/logout` | 可选 | 注销 Token |
| POST | `/api/auth/change-password` | 是 | 修改密码 |
| GET | `/api/sessions` | 是 | 列出所有会话 |
| DELETE | `/api/sessions/:id` | 是 | 通过 REST 删除会话 |
| GET | `/api/health` | 否 | 健康检查 |

## 开发规范

### 代码风格
- **ESM 模块**：所有文件使用 `import`/`export` 语法
- **Async/await**：优先使用 async/await 而非原生 Promise
- **React hooks**：函数组件 + hooks（无类组件）
- **CSS**：每个组件独立的 CSS 文件（不使用 CSS-in-JS）

### 前端模式
- 使用 React `useState`/`useReducer` 进行状态管理
- WebSocket 引用存储在 `useRef` 中以便命令式访问
- localStorage 用于状态持久化（布局、侧边栏状态、激活终端）
- WebSocket 断开时自动重连

### 后端模式
- Express 中间件进行认证检查
- WebSocket 通过 URL 查询参数认证
- PTY 进程存储在 Map（内存）中，会话元数据持久化到 JSON
- SIGINT 时优雅关闭

### 安全
- 密码使用 PBKDF2 哈希（100,000 次迭代，SHA-256）
- Token 为 64 字节随机十六进制字符串
- Token 有效期：7 天
- 首次启动时创建默认用户

## 系统依赖

项目使用 `node-pty`，需要原生编译：

- **Node.js**：>= 18.0
- **Python**：3.x
- **构建工具**：
  - Linux：`build-essential`（Debian/Ubuntu），`Development Tools`（RHEL/CentOS）
  - macOS：Xcode Command Line Tools
  - Windows：Visual Studio Build Tools

## 测试

目前未配置自动化测试。手动测试流程：
1. 启动服务器：`npm start`
2. 浏览器访问 `http://localhost:3000`
3. 使用默认凭据登录（admin/admin）
4. 创建终端，测试布局，验证刷新后持久化

## 常见任务文件索引

| 任务 | 需修改文件 |
|------|-----------|
| 添加 WebSocket 消息类型 | `server/websocket-handler.js`、`client/src/App.jsx` |
| 添加 REST 接口 | `server/index.js` |
| 修改认证逻辑 | `server/auth.js`、`client/src/components/Login.jsx` |
| 修改终端主题 | `client/src/components/Terminal.jsx`（xterm 主题配置） |
| 添加布局选项 | `client/src/components/MultiTerminal.jsx` |
| 修改会话持久化 | `server/sessions.js` |
| 修改 PTY 行为 | `server/pty-manager.js` |