# NodeJS Shell & Multi‑Proxy Panel

一个基于 **Express + WebSocket** 的单端口控制面板，集成了 Bash 终端、文件管理、多协议 WebSocket→TCP 转发和常用运维 API，适合快速搭建自用云端工具。

---

## 快速开始

```bash
# 克隆并安装依赖
git clone https://github.com/yourname/yourrepo.git
cd yourrepo
npm install

# 配置环境变量（推荐写入 .env）
export ADMIN_PASSWORD='<管理密码>'
export UPLOAD_PASSWORD='<上传密码>'

# 启动服务（默认端口 3000）
npm start        # 或 node index.js
```

### Docker 运行

```bash
docker build -t nodejs-shell .
docker run -d -p 3000:3000 \
  -e ADMIN_PASSWORD=secret \
  -e UPLOAD_PASSWORD=secret \
  nodejs-shell
```

---

## 环境变量

| 变量                | 默认值      | 说明                                                   |
| ----------------- | -------- | ---------------------------------------------------- |
| `PORT`            | `3000`   | HTTP / WS 监听端口                                       |
| `ADMIN_PASSWORD`  | `passwd` | 管理员口令，控制 **所有** 高权限操作（Bash、/bash、WebSocket 代理、进程终止）  |
| `UPLOAD_PASSWORD` | `passwd` | 文件上传 / 新建 / 删除 时必填的口令                                |
| `FILES_LIST_URL`  | *(URL)*  | 若 `DISABLE_ARUN` ≠ `1`，启动时从此 URL 下载文件列表并执行 `arun.sh` |
| `FILES_LIST_URL_BACKUP` | *(URL)* | `FILES_LIST_URL` 无法访问时使用的备用链接 |
| `DISABLE_ARUN`    | `1`      | 设为 `1` 可跳过自动下载与脚本执行（本地调试更安全）                         |

---

## Web 界面

### 1. 综合面板 `/@`

打开 `http://<host>:<port>/@` 可见双列 Dashboard：

如需自定义界面样式，可在 `modern_panel.html` 中编写，当该文件不存在时会使用内置默认样式。

![image](https://github.com/user-attachments/assets/dad0d6e4-2956-4aa0-a956-35797706cada)

* **左侧**：输入管理员口令后可执行 Bash 命令（输出保存至 `./logs`）
* **右侧**：文件浏览 / 上传 / 新建 / 删除（需上传口令）

### 2. 文件管理 API

| 方法   | 路径                  | 备注                        |
| ---- | ------------------- | ------------------------- |
| GET  | `/file?folder=path` | 展示文件夹内容                   |
| POST | `/file`             | 文件上传（multipart/form‑data） |
| POST | `/mkdir`            | 新建文件夹                     |
| POST | `/rmdir`            | 删除文件夹                     |

### 3. 进程工具

* `GET /pid/list` ‒ 输出 `ps -aux`
* `GET /pid/kill/:pid?admin=ADMIN_PASSWORD` ‒ 强制杀进程

### 4. 简易命令

* `GET /run/ls` → `ls -a`
* `GET /run/name` → `uname -a`
* `GET /run/ip` → 返回服务器 IP 信息

### 5. 任意 Bash 执行器

```
GET /bash/<url-encoded-command>?admin=ADMIN_PASSWORD[&re=1]
```

* 首次执行结果写入 `./logs/<command>.log`
* 之后调用默认复用日志，`re=1` 可重新执行

### 6. WebSocket 多协议转发

连接时在 **查询参数** 中追加 `admin=ADMIN_PASSWORD` 认证。

| WS 路径     | 转发目标                            |
| --------- | ------------------------------- |
| `/vm2098` | `127.0.0.1:2098` (VMess)        |
| `/to2022` | `127.0.0.1:2022` (Trojan)       |
| `/vl2024` | `127.0.0.1:2024` (Shadowsocks)  |

示例（v2rayN）：

```
ws://example.com:3000/vm2098?admin=passwd
```

如需扩展协议，请在 `index.js` 中修改 `ROUTES` 常量。

### 7. 子应用反向代理 `/app`

将所有请求代理到 `http://0.0.0.0:2095`，可用于挂载前端面板或其他服务。

---

## 日志与历史

* Shell 输出保存至 `./logs/<command>.log`
* 已执行命令记录在根目录 `command.json`，用于去重

---

## 安全建议

1. **务必** 修改默认密码，避免公网暴露。
2. 若需外网访问，建议置于 Nginx/Caddy 反向代理后并启用 HTTPS/WSS。
3. 使用 Docker 或 systemd 运行，限制权限。

---

## 开源协议

MIT License
