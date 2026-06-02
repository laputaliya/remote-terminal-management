# Remote Terminal Manager

一个支持多终端管理、后台持久运行的网页终端工具。

## 功能特性

- 🌐 **网页访问**: 通过浏览器访问终端，无需安装任何客户端
- 🔄 **多终端管理**: 支持同时管理多个终端会话
- 💾 **会话持久化**: 关闭网页后终端继续运行
- 🔌 **自动重连**: 刷新/重新打开网页自动加载已有会话
- 📱 **响应式设计**: 适配桌面和移动设备
- 🔐 **登录认证**: 基于 Token 的用户认证，支持修改密码（首次登录强制改密，密码最低 8 位）
- 🖥️ **多屏同显**: 支持 8 种布局，最多同时显示 4 个终端
- 📝 **输出历史**: 刷新页面后保留终端历史输出（最多 100,000 字符）
- 🎛️ **状态持久化**: 布局、侧边栏状态、激活终端列表自动保存
- ⌨️ **快捷键支持**: Alt+数字键切换终端，Alt+方向键切换焦点
- 🔗 **外部终端管理**: 连接并管理现有的 tmux/screen 会话（自动根据视口估算尺寸）
- 🎯 **唯一命名**: 自动为新终端生成唯一名称（Terminal 1、2、3...）
- ✅ **关闭确认**: 关闭终端前显示确认对话框，防止误操作
- 📌 **侧边栏图标模式**: 收起时显示图标和状态指示点，移动端滑入式覆盖层
- 🛡️ **安全加固**: Helmet 安全头、登录速率限制、Shell 白名单、命令注入防护、CORS 限制
- 📋 **复制粘贴**: Ctrl+Shift+C 复制、Ctrl+Shift+V/右键粘贴（xterm 原生支持）
- 📱 **移动端适配**: 响应式布局、汉堡菜单、侧边栏自动收起、触摸友好间距
- 🔄 **优雅关闭**: 支持 SIGINT/SIGTERM 信号优雅退出

## 技术栈

- **后端**: Node.js, Express.js, WebSocket (ws), node-pty
- **前端**: React 19, xterm.js, WebSocket
- **构建工具**: Vite, npm
- **安全**: Helmet, PBKDF2 密码哈希

## 系统依赖

本项目使用 [node-pty](https://github.com/microsoft/node-pty) 创建伪终端，需要以下系统依赖：

### Windows

- **Node.js**: >= 18.0
- **Python**: 3.x（用于编译原生模块）
- **Visual Studio Build Tools** 或 **Visual Studio Community**:
  - 安装 "Desktop development with C++" 工作负载
  - 或单独安装 "Windows SDK" 和 "C++ x64/x86 生成工具"

安装 Visual Studio Build Tools（命令行）：
```bash
npm install --global windows-build-tools
```

### Linux

- **Node.js**: >= 18.0
- **Python**: 3.x
- **make**
- **GCC/G++** 编译器

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install -y build-essential python3
```

**CentOS/RHEL/Fedora:**
```bash
# CentOS/RHEL
sudo yum groupinstall -y "Development Tools"
sudo yum install -y python3

# Fedora
sudo dnf groupinstall -y "Development Tools"
sudo dnf install -y python3
```

**Arch Linux:**
```bash
sudo pacman -S base-devel python3
```

### macOS

- **Node.js**: >= 18.0
- **Xcode Command Line Tools**:
```bash
xcode-select --install
```

## 快速开始

### 1. 克隆仓库

```bash
git clone https://gitcode.com/laputaliya/remote-terminal-management.git
cd remote-terminal-management
```

### 2. 安装依赖

```bash
npm run install:all
```

### 3. 编译前端

```bash
cd client
npm run build
cd ..
```

### 4. 启动服务器

```bash
npm start
```

### 5. 访问

打开浏览器访问 `http://localhost:3000`

默认账号：`admin` / `admin`（首次登录强制修改密码）

## 开发模式

```bash
# 同时启动前后端
npm run dev

# 或分别启动：
npm run server              # 后端，端口 3000
cd client && npm run dev    # 前端开发服务器，端口 5173
```

开发模式下前端通过 Vite 代理连接后端 API，访问 `http://localhost:5173`。

### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3000` | 服务器端口 |
| `CORS_ORIGIN` | `http://localhost:3000` | CORS 允许的来源 |
| `VITE_HOST` | `127.0.0.1` | Vite 开发服务器监听地址 |

## 项目结构

```
.
├── server/
│   ├── index.js              # 服务器入口（Express + WebSocket + 路由）
│   ├── websocket-handler.js  # WebSocket 消息路由和处理
│   ├── sessions.js           # 会话持久化（原子写入 JSON）
│   ├── pty-manager.js        # PTY 进程管理（Shell 白名单验证）
│   ├── external-processes.js # 外部终端管理（tmux/screen 检测和连接）
│   └── auth.js               # 认证管理（PBKDF2 密码哈希、Token 管理）
├── client/
│   ├── src/
│   │   ├── App.jsx           # 主应用（WebSocket 连接、认证状态、布局状态管理）
│   │   ├── App.css           # 全局样式
│   │   ├── main.jsx          # React 入口
│   │   └── components/
│   │       ├── Terminal.jsx        # xterm.js 终端组件（渲染、输入/输出、自适应）
│   │       ├── MultiTerminal.jsx   # 多终端布局管理（8 种布局、快捷键、改密弹窗）
│   │       ├── Sidebar.jsx         # 侧边栏（会话列表、创建/删除/重命名、收起/展开）
│   │       ├── ExternalTerminal.jsx # 外部终端管理页面（tmux/screen 连接）
│   │       └── Login.jsx           # 登录页面（含首次登录强制改密流程）
│   ├── index.html
│   └── vite.config.js        # Vite 配置（React 插件、API 代理）
├── .data/                    # 运行时数据（git 忽略）
│   ├── sessions.json         # 终端会话元数据
│   ├── users.json            # 用户凭据（哈希存储）
│   └── auth-sessions.json    # 活跃认证 Token
├── dist/                     # 生产构建输出
└── package.json
```

## 架构与数据流

### 核心组件

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
│  │            (会话持久化到磁盘，原子写入)                  │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

### 认证流程

1. 客户端 POST `/api/auth/login` 发送凭据
2. 服务器 PBKDF2 验证，生成 Token（7 天有效期，64 字节随机 hex）
3. 客户端 Token 存储 localStorage，REST 请求通过 `Authorization: Bearer <token>` 头传递
4. WebSocket 通过 `?token=<token>` 查询参数连接
5. 默认用户首次登录强制跳转修改密码页面

### 终端会话生命周期

1. **创建**: WebSocket `create` 消息 → Shell 路径白名单验证 → PTY 进程创建 → 会话保存到 `.data/sessions.json`
2. **I/O**: xterm.js 输入 → WebSocket `input` → PTY 写入 → PTY 输出 → WebSocket 广播 → xterm.js 显示
3. **输出缓冲**: 内存保留最多 100,000 字符输出历史，客户端重连后恢复
4. **删除**: WebSocket `delete` → PTY 进程终止 → 清理输出缓冲 → 从 JSON 移除会话

## API

### WebSocket 端点

- `/ws` — WebSocket 连接（需要 `?token=` 认证）

#### 消息类型

| 类型 | 方向 | 用途 |
|------|------|------|
| `list` | 客户端 → 服务器 | 请求会话列表 |
| `create` | 客户端 → 服务器 | 创建新终端（name: ≤100 字符, shell: ≤500 字符） |
| `attach` | 客户端 → 服务器 | 订阅终端输出 |
| `input` | 客户端 → 服务器 | 发送按键到终端 |
| `resize` | 客户端 → 服务器 | 调整终端尺寸 |
| `delete` | 客户端 → 服务器 | 终止终端会话 |
| `rename` | 客户端 → 服务器 | 重命名会话（≤100 字符） |
| `list-external` | 客户端 → 服务器 | 请求外部终端列表 |
| `attach-tmux` | 客户端 → 服务器 | 连接 tmux 会话（使用 `-d` detach 其他客户端） |
| `attach-screen` | 客户端 → 服务器 | 连接 screen 会话 |
| `detach-external` | 客户端 → 服务器 | 断开外部终端（保留 tmux/screen 会话） |
| `session-list` | 服务器 → 客户端 | 响应 `list` |
| `session-created` | 服务器 → 客户端 | 新会话通知 |
| `session-attached` | 服务器 → 客户端 | 附着确认，包含输出历史 |
| `output` | 服务器 → 客户端 | 终端输出数据 |
| `session-deleted` | 服务器 → 客户端 | 删除确认 |
| `session-updated` | 服务器 → 客户端 | 会话元数据更新 |

### REST API

| 方法 | 端点 | 需认证 | 说明 |
|------|------|--------|------|
| POST | `/api/auth/login` | 否 | 登录，返回 `{token, username, passwordChangeRequired}` |
| POST | `/api/auth/logout` | 可选 | 注销 Token |
| POST | `/api/auth/change-password` | 是 | 修改密码（最低 8 位），清除强制改密标记 |
| GET | `/api/sessions` | 是 | 列出所有会话 |
| DELETE | `/api/sessions/:id` | 是 | 删除会话（同步清理 PTY 进程和内存状态） |
| GET | `/api/external-terminals` | 是 | 获取外部终端列表（tmux/screen/shell 进程） |
| GET | `/api/health` | 否 | 健康检查 |

## 使用说明

### 多屏布局

支持 8 种布局模式：

| 布局 ID | 名称 | 最大终端数 |
|---------|------|-----------|
| `1` | 单屏 | 1 |
| `2h` | 水平双屏 | 2 |
| `2v` | 垂直双屏 | 2 |
| `4` | 四屏网格 | 4 |
| `3t` | 上二下一 | 3 |
| `3b` | 上一上二 | 3 |
| `3l` | 左一右二 | 3 |
| `3r` | 左二右一 | 3 |

布局选择和激活的终端列表自动保存到 localStorage，刷新页面后恢复。

### 侧边栏

- 点击终端名称切换显示/隐藏
- 支持收起/展开（状态自动保存到 localStorage）
- 收起时显示图标模式和状态指示点（蓝色=激活，绿色=运行中）
- 支持重命名和删除终端

### 终端操作

- 点击侧边栏「+」按钮快速创建新终端（自动生成 Terminal 1、2、3...）
- 每个终端可独立调整大小，xterm.js `FitAddon` 自动计算最佳 cols/rows
- 关闭终端前显示确认对话框
- 单屏布局时点击侧边栏终端直接切换，多屏布局时添加/移除显示

### 外部终端管理

点击右上角「外部终端」按钮进入外部终端管理页面：

**功能：**
- 显示系统中现有的 tmux 会话、screen 会话和 shell 进程
- 点击「连接」连接到现有 tmux/screen 会话（`tmux attach -d` 自动 detach 其他客户端）
- 点击「返回列表」断开连接但保留 tmux/screen 会话继续运行
- 点击关闭按钮（X）真正杀死 tmux/screen 会话

**操作区分：**

| 操作 | 普通终端 | 外部终端（tmux/screen） |
|------|---------|------------------------|
| 返回列表 | 无此操作 | 断开连接，会话继续运行 |
| 关闭终端（X） | 终止 PTY 进程 | 杀死 tmux/screen 会话 |

**注意事项：**
- 连接 tmux 时使用 `-d` 标志自动 detach 其他客户端，避免多客户端渲染冲突
- 外部终端首次连接时根据视口尺寸估算 cols/rows，连接后立即同步真实尺寸
- 按住 Shift + 鼠标拖拽可在 tmux 鼠标模式下选中文本
- 外部会话不持久化保存（服务器重启后需重新连接）

### 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Alt + 1/2/3/4` | 切换到对应位置的终端 |
| `Alt + ←/↑` | 切换到上一个终端 |
| `Alt + →/↓` | 切换到下一个终端 |
| `Ctrl+Shift+C` | 复制选中文本 |
| `Ctrl+Shift+V` | 粘贴剪贴板内容 |
| 右键（无选中） | 粘贴剪贴板内容 |
| `Shift + 鼠标拖拽` | 在 tmux 中选中文本（绕过鼠标模式） |

### 移动端使用

- 侧边栏默认收起，点击工具栏左上角汉堡菜单（☰）打开
- 选择终端后侧边栏自动关闭，释放屏幕空间
- 外部终端卡片单列排列，工具栏按钮精简
- 输入框和按钮加大间距便于触摸操作

### 当前终端高亮

- 当前聚焦的终端显示蓝色边框
- 终端标题栏显示蓝色圆点标记
- 便于识别当前正在操作的终端

### 修改密码

点击右上角「修改密码」按钮，输入当前密码和新密码即可修改（新密码最低 8 位）。

## 安全特性

| 特性 | 实现 |
|------|------|
| 密码哈希 | PBKDF2，100,000 次迭代，SHA-256，随机 16 字节 salt |
| Token | 64 字节随机十六进制，7 天过期 |
| Shell 白名单 | `pty-manager.js` 维护允许路径列表，`fs.realpathSync` 解析真实路径后比对 |
| 命令注入防护 | `spawnSync` 数组参数替代 `execSync` 字符串拼接 |
| 输入校验 | 会话名 ≤100 字符，Shell 路径 ≤500 字符 |
| 登录速率限制 | 内存限流，60 秒内最多 10 次尝试 |
| 安全头 | Helmet 中间件（CSP 暂关闭） |
| CORS | 默认限制为 `http://localhost:3000`，可通过 `CORS_ORIGIN` 配置 |
| Body 限制 | Express JSON 解析限制 100kb |
| 错误消息脱敏 | 客户端返回通用错误，详细错误仅服务端日志 |
| 首次登录强制改密 | 默认 `admin/admin` 首次登录必须修改密码（最低 8 位） |
| 原子写入 | 会话持久化先写 `.tmp` 再 `rename`，防止 JSON 损坏 |
| 优雅关闭 | 监听 SIGINT 和 SIGTERM，清理 WebSocket 和服务器 |
| REST 认证 | 仅通过 `Authorization` 请求头，不接受 URL 查询参数 |

## 终端渲染机制

- **自适应大小**: `window.resize` + `ResizeObserver` 双重监听，`FitAddon.fit()` 计算最佳 cols/rows
- **初始拟合**: 等待字体加载（`document.fonts.ready`）后调用 `fit()`，确保字符尺寸测量准确
- **Flex 布局**: 终端容器使用 `flex: 1; min-height: 0`，适配任意深度的 flex 嵌套
- **刷新页面防重复**: 初始化阶段缓冲预附着输出，`session-attached` 后才允许 resize
- **外部终端即时同步**: `isExternal` 终端跳过 resize 延迟，连接后立刻发送真实尺寸
- **可见性刷新**: 浏览器 tab 切换回来（`visibilitychange`）自动 `fit()` + `refresh()`
- **焦点刷新**: 窗口获得焦点（`focus`）时触发刷新
- **输出延迟刷新**: 终端收到输出后 150ms debounce 全量 `refresh()`
- **主题**: VS Code 风格深色主题（#1e1e1e 背景），支持 16 色 ANSI

## License

MIT
