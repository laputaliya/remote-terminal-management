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
