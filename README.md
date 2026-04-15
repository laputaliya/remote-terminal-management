# Remote Terminal Manager

一个支持多终端管理、后台持久运行的网页终端工具。

## 功能特性

- 🌐 **网页访问**: 通过浏览器访问终端，无需安装任何客户端
- 🔄 **多终端管理**: 支持同时管理多个终端会话
- 💾 **会话持久化**: 关闭网页后终端继续运行
- 🔌 **自动重连**: 刷新/重新打开网页自动加载已有会话
- 📱 **响应式设计**: 适配桌面和移动设备
- 🔐 **登录认证**: 基于 Token 的用户认证，支持修改密码
- 🖥️ **多屏同显**: 支持 8 种布局，最多同时显示 4 个终端
- 📝 **输出历史**: 刷新页面后保留终端历史输出
- 🎛️ **状态持久化**: 布局、侧边栏状态、激活终端列表自动保存
- ⌨️ **快捷键支持**: 支持快捷键切换终端
- 🔗 **外部终端管理**: 连接并管理现有的 tmux/screen 会话
- 🎯 **唯一命名**: 自动为新终端生成唯一名称（Terminal 1、2、3...）
- ✅ **关闭确认**: 关闭终端前显示确认对话框，防止误操作
- 📌 **侧边栏图标模式**: 收起时显示图标和状态指示点

## 技术栈

- **后端**: Node.js, Express, WebSocket, node-pty
- **前端**: React, xterm.js, WebSocket

## 系统依赖

本项目使用 [node-pty](https://github.com/microsoft/node-pty) 创建伪终端，需要以下系统依赖：

### Windows

- **Node.js**: >= 18.0
- **Python**: 3.x（用于编译原生模块）
- **Visual Studio Build Tools** 或 **Visual Studio Community**:
  - 安装 "Desktop development with C++" 工作负载
  - 或单独安装 "Windows SDK" 和 "C++ x64/x86 生成工具"
- **Git for Windows**（可选，但推荐）

安装 Visual Studio Build Tools（命令行）：
```bash
npm install --global windows-build-tools
```

### Linux

- **Node.js**: >= 18.0
- **Python**: 3.x（用于编译原生模块）
- **make**
- **GCC/G++** 编译器
- **libc6-dev**（某些发行版需要）

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install -y build-essential python3
```

**CentOS/RHEL/Fedora:**
```bash
# CentOS/RHEL 7+
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
# 安装后端依赖
npm install

# 安装前端依赖
cd client
npm install
cd ..
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

## 开发模式

如需开发调试，可以分别启动前端和后端：

```bash
# 终端 1：启动后端
cd remote-terminal-management
npm start

# 终端 2：启动前端开发服务器
cd remote-terminal-management/client
npm run dev
```

然后访问前端开发服务器地址（通常是 `http://localhost:5173`）

## 项目结构

```
.
├── server/
│   ├── index.js              # 服务器入口
│   ├── sessions.js           # 会话管理
│   ├── pty-manager.js        # PTY 进程管理
│   ├── websocket-handler.js  # WebSocket 消息处理
│   ├── external-processes.js # 外部终端（tmux/screen）管理
│   └── auth.js               # 认证管理
├── client/
│   ├── src/
│   │   ├── App.jsx           # 主应用
│   │   ├── components/
│   │   │   ├── Terminal.jsx        # 终端组件
│   │   │   ├── MultiTerminal.jsx   # 多终端布局管理
│   │   │   ├── Sidebar.jsx         # 侧边栏
│   │   │   ├── ExternalTerminal.jsx # 外部终端管理页面
│   │   │   └── Login.jsx           # 登录页面
│   │   └── styles/
│   │       └── terminal.css
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
└── package.json
```

## API

### WebSocket 端点

- `/ws` - WebSocket 连接端点（需要 Token 认证）

#### WebSocket 消息类型

**基础消息类型：**
- `list` - 获取会话列表
- `create` - 创建新会话
- `delete` - 删除会话
- `rename` - 重命名会话
- `attach` - 附加到会话（接收/发送数据）
- `input` - 发送输入到终端
- `resize` - 调整终端大小

**外部终端消息类型：**
- `list-external` - 获取外部终端列表（tmux/screen 会话）
- `attach-tmux` - 连接到 tmux 会话
- `attach-screen` - 连接到 screen 会话
- `detach-external` - 断开外部终端连接（保留 tmux/screen 会话）

### REST API

#### 认证接口

- `POST /api/auth/login` - 用户登录
- `POST /api/auth/logout` - 用户登出
- `POST /api/auth/change-password` - 修改密码

#### 会话接口

- `GET /api/sessions` - 获取所有会话列表
- `POST /api/sessions` - 创建新会话
- `DELETE /api/sessions/:id` - 删除会话

#### 外部终端接口

- `GET /api/external-terminals` - 获取外部终端列表（tmux/screen/shell 进程）

## 使用说明

### 多屏布局

支持 8 种布局模式：

| 布局 | 名称 | 最大终端数 |
|------|------|-----------|
| 单屏 | Single | 1 |
| 水平双屏 | Horizontal Split | 2 |
| 垂直双屏 | Vertical Split | 2 |
| 四屏网格 | Quad | 4 |
| 上二下一 | Top 2 Bottom 1 | 3 |
| 上一上二 | Top 1 Bottom 2 | 3 |
| 左一右二 | Left 1 Right 2 | 3 |
| 左二右一 | Left 2 Right 1 | 3 |

布局选择和激活的终端列表会自动保存，刷新页面后恢复。

### 侧边栏

- 点击终端名称切换显示/隐藏
- 支持收起/展开（状态自动保存）
- 收起时显示图标模式和状态指示点（蓝色=激活，灰色=未激活）
- 支持重命名和删除终端

### 终端操作

- 点击「+」按钮快速创建新终端（自动生成唯一名称）
- 每个终端可独立调整大小
- 支持历史输出保留（最多 100,000 字符）
- 关闭终端前显示确认对话框

### 外部终端管理

点击右上角「外部终端」按钮进入外部终端管理页面：

**功能说明：**
- 显示系统中现有的 tmux 会话、screen 会话和 shell 进程
- 点击「连接」按钮可连接到现有的 tmux/screen 会话
- 点击「返回列表」断开连接但保留 tmux/screen 会话继续运行
- 点击终端窗口关闭按钮（X）会真正关闭 tmux/screen 会话

**操作区分：**

| 操作 | 效果 |
|------|------|
| 返回列表 | 断开连接，tmux/screen 会话继续运行 |
| 关闭终端（X） | 真正关闭 tmux/screen 会话 |

### 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Alt + 1/2/3/4` | 切换到对应位置的终端 |
| `Alt + ←/↑` | 切换到上一个终端 |
| `Alt + →/↓` | 切换到下一个终端 |

### 当前终端高亮

- 当前聚焦的终端会显示**蓝色边框**
- 终端标题栏显示**蓝色圆点**标记
- 便于识别当前正在操作的终端

### 单屏模式切换

- 单屏布局时，点击 Sidebar 中的终端标签会直接**切换**到该终端
- 多屏布局时，点击 Sidebar 中的终端标签会**添加/移除**该终端的显示

### 修改密码

点击右上角「修改密码」按钮，输入当前密码和新密码即可修改。

## License

MIT
