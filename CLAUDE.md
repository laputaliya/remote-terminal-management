# CLAUDE.md

此文件为 Claude Code (claude.ai/code) 在此代码库中工作时提供开发规则和约束。

项目概述、功能特性、架构细节、API 文档等请参阅 [README.md](./README.md)。

## 代码风格

- **ESM 模块**: 所有文件使用 `import`/`export` 语法
- **无类组件**: React 组件一律使用函数组件 + Hooks
- **CSS 分离**: 每个组件独立 CSS 文件，不使用 CSS-in-JS
- **不写注释**: 除非解释非显而易见的 WHY（隐藏约束、微妙的不变量、特定 bug 的变通方案）。不要解释 WHAT——命名已经说明了

## 开发模式

### 前端
- 状态管理：`useState`，跨组件状态通过 props 传递
- WebSocket 引用存储在 `useRef` 中
- 持久化状态（布局、侧边栏、激活终端）通过 `localStorage`，初始化时用 lazy initializer 读取
- `isSingleMode` 等跨组件状态应从 App 层传入，不要在子组件中直接读 localStorage render 时值

### 后端
- Express 中间件处理认证
- PTY 进程存储在 `Map`（内存）中，不在进程间共享
- 会话元数据持久化到 `.data/` JSON 文件
- WebSocket 通过 URL 查询参数 `?token=` 认证
- REST API 仅通过 `Authorization: Bearer <token>` 头认证

### 错误处理
- 客户端 WebSocket 消息只返回通用错误消息，不暴露 `error.message`（内部堆栈/路径）
- 详细错误通过 `console.error` 输出到服务端日志
- `try/catch` 中的清理逻辑放在 `finally` 块

## 安全规则（必须遵守）

修改以下模块时，必须遵守对应的安全约束：

| 模块 | 规则 |
|------|------|
| `pty-manager.js` | 新 Shell 路径必须添加到 `ALLOWED_SHELLS` 白名单；创建 PTY 前必须经 `resolveAndValidateShell()` 验证真实路径 |
| `external-processes.js` | 外部命令调用必须使用 `spawnSync`/`spawn` 数组参数形式，禁止 `execSync` 字符串拼接 |
| `websocket-handler.js` | 用户输入的 `name`（≤100 字符）、`shell`（≤500 字符）必须校验类型和长度；tmux/screen 会话名传入 `spawnSync` 时作为数组元素，不拼接字符串 |
| `auth.js` | 密码最小长度 8 位；PBKDF2 参数（100,000 迭代、SHA-256、16 字节 salt）不可降低；Token 64 字节随机 hex 不可缩短 |
| `index.js` | 登录接口速率限制不可移除；`express.json()` 的 `limit` 不可移除；Helmet 中间件不可移除（CSP 可单独配置）；CORS 不可回退到 `*` |

## 常见陷阱

- WebSocket 心跳依赖 `ws.isAlive` 属性（不是局部变量），修改心跳逻辑时确保 `pong` 回调更新的是 `ws.isAlive`
- `ws.on('message', ...)` 会**替换**已有的 message 监听器，不要在消息处理器内部再次调用 `ws.on('message', ...)`
- `handleWebSocket()` 内部赋值全局 `wss` 变量（来自 `websocket-handler.js`），不要移除或修改这个赋值
- 外部 session (`tmux-external`/`screen-external`) 不应持久化，保存前必须过滤
- `sessions.json` 使用原子写入（`.tmp` + `rename`），修改 `saveSessions()` 时不要破坏这个机制
- PTY `onExit` 回调中需要同时清理 `processes` 和 `outputBuffers` 两个 Map
- 前端 `connect` 的 `useCallback` 依赖数组不应包含 `activeSessionIds.size`（会导致每次选会话都重连 WebSocket）
- `wsRef.current = null` 必须在 cleanup 中 `ws.close()` 之前设置，防止 `onclose` 回调误触发重连

## 文件职责速查

| 文件 | 职责 | 关键导出 |
|------|------|---------|
| `server/index.js` | Express 启动、中间件、路由、WebSocket 认证入口 | — |
| `server/auth.js` | 用户 CRUD、密码哈希、Token 签发/验证/清理 | `initDefaultUser`, `login`, `logout`, `verifyToken`, `changePassword` |
| `server/pty-manager.js` | PTY 进程生命周期、输出缓冲、Shell 白名单 | `createPty`, `writeToPty`, `resizePty`, `killPty`, `getOutputHistory` |
| `server/websocket-handler.js` | WebSocket 消息路由、会话 CRUD、外部终端连接 | `handleWebSocket`, `sessions` |
| `server/sessions.js` | 会话 JSON 文件读写（原子写入） | `loadSessions`, `saveSessions` |
| `server/external-processes.js` | tmux/screen/shell 进程检测、连接 | `getExternalTerminals`, `attachTmuxSession`, `attachScreenSession` |
| `client/src/App.jsx` | WebSocket 连接管理、认证状态、布局状态 | — |
| `client/src/components/Terminal.jsx` | xterm.js 终端渲染、自适应、输入/输出处理 | — |
| `client/src/components/MultiTerminal.jsx` | 多终端布局管理、快捷键、改密弹窗 | — |
