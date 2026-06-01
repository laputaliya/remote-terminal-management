# QWEN.md

本文件为 Qwen Code 在此代码库中工作时提供开发规则和约束。

项目概述、功能特性、架构细节、API 文档等请参阅 [README.md](./README.md)。

## 代码风格

- **ESM 模块**: 所有文件使用 `import`/`export` 语法
- **无类组件**: React 组件一律使用函数组件 + Hooks
- **CSS 分离**: 每个组件独立 CSS 文件，不使用 CSS-in-JS
- **不写注释**: 除非解释非显而易见的 WHY（隐藏约束、微妙的不变量、特定 bug 的变通方案）

## 开发模式

### 前端
- 状态管理：`useState`，跨组件状态通过 props 传递
- WebSocket 引用存储在 `useRef` 中
- 持久化状态通过 `localStorage`，初始化时用 lazy initializer：`useState(() => localStorage.getItem('key'))`
- `isSingleMode` 等状态应从 App 层传入，不要直接在子组件 render 时读 localStorage

### 后端
- Express 中间件处理认证
- PTY 进程存储在 `Map`（内存）中
- 会话元数据持久化到 `.data/` JSON 文件（原子写入：`.tmp` + `rename`）
- WebSocket 通过 URL 查询参数 `?token=` 认证
- REST API 仅通过 `Authorization: Bearer <token>` 头认证

### 错误处理
- 客户端错误消息脱敏：返回通用消息，详细错误仅 `console.error` 到服务端
- `try/catch` 中的清理操作放在 `finally` 块

## 安全规则

以下模块修改时必须遵守对应规则：

| 模块 | 规则 |
|------|------|
| `pty-manager.js` | Shell 路径必须加入 `ALLOWED_SHELLS` 白名单；`resolveAndValidateShell()` 使用 `fs.realpathSync` 解析真实路径后比对 |
| `external-processes.js` | 外部命令禁止 `execSync` 字符串拼接，必须使用 `spawnSync`/`spawn` 数组参数 |
| `websocket-handler.js` | 用户输入 `name`（≤100 字符）、`shell`（≤500 字符）必须校验；tmux/screen 会话名不得拼接到 shell 字符串 |
| `auth.js` | 密码 ≥8 位；PBKDF2 参数（100K 迭代、SHA-256、16B salt）不可降低；Token 64 字节随机 hex |
| `index.js` | 不可移除登录速率限制、Helmet、`express.json` limit、CORS 限制 |

## 关键陷阱

- 心跳 `ws.on('pong')` 中更新的是 `ws.isAlive`（属性），不是局部变量
- `ws.on('message', handler)` 会**替换**已有监听器——不要在消息处理器内部再次调用
- 外部 session (`tmux-external`/`screen-external`) 保存/列出时必须过滤，不持久化
- PTY `onExit` 需同时清理 `processes` 和 `outputBuffers` 两个 Map
- 前端 `connect` 的 `useCallback` 依赖不能包含 `activeSessionIds.size`（会导致频繁重连）
- cleanup 中先设 `wsRef.current = null` 再 `ws.close()`，防止 `onclose` 误触发重连

## 文件职责速查

| 文件 | 职责 | 关键导出 |
|------|------|---------|
| `server/index.js` | Express + WebSocket 启动、中间件、路由 | — |
| `server/auth.js` | 用户管理、密码哈希、Token 签发/验证 | `initDefaultUser`, `login`, `verifyToken`, `changePassword` |
| `server/pty-manager.js` | PTY 生命周期、输出缓冲、Shell 白名单验证 | `createPty`, `writeToPty`, `resizePty`, `killPty`, `getOutputHistory` |
| `server/websocket-handler.js` | WebSocket 消息路由、会话 CRUD、外部终端 | `handleWebSocket`, `sessions` |
| `server/sessions.js` | 会话 JSON 文件读写（原子写入） | `loadSessions`, `saveSessions` |
| `server/external-processes.js` | tmux/screen/shell 进程检测与连接 | `getExternalTerminals`, `attachTmuxSession`, `attachScreenSession` |
| `client/src/App.jsx` | WebSocket 连接、认证状态、布局状态管理 | — |
| `client/src/components/Terminal.jsx` | xterm.js 终端渲染、自适应大小、可见性刷新 | — |
| `client/src/components/MultiTerminal.jsx` | 多终端布局、快捷键、改密弹窗 | — |
