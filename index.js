const express = require("express");
const http = require("http");
const { spawn } = require("child_process");
const { createProxyMiddleware } = require("http-proxy-middleware");
const os = require("os");
const fs = require("fs");
const net = require("net");
const path = require("path");
const axios = require("axios");
const multer = require("multer");
const { WebSocketServer } = require("ws");
const PORT = process.env.PORT || 3000;
const LOGS_FOLDER = "./logs";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "passwd";
const UPLOAD_PASSWORD = process.env.UPLOAD_PASSWORD || "passwd";
const DISABLE_ARUN = process.env.DISABLE_ARUN || "1";
const COMMAND_HISTORY = "command.json";
const DOWNLOAD_FOLDER = "./";
const SUIDB_FOLDER = "./db";
const FILES_LIST_URL =
  process.env.FILES_LIST_URL ||
  "https://raw.githubusercontent.com/valetzx/nodejs-shell/refs/heads/main/down";
const FILES_LIST_URL_BACKUP = process.env.FILES_LIST_URL_BACKUP || "";

const PANEL_CSS_PATH = path.join(__dirname, "public", "panel.css");
const DEFAULT_PANEL_STYLE = `
  body {
    font-family: Arial, sans-serif;
    display: flex;
    justify-content: space-between;
    padding: 20px;
    height: 100vh;
    background: #111;
    color: #eee;
  }
  .panel {
    width: 48%;
    padding: 10px;
    border: 1px solid #555;
    border-radius: 5px;
    resize: horizontal;
    overflow: auto;
    background:#222;
  }
  #output {
    white-space: pre-wrap;
    border: 1px solid #555;
    padding: 10px;
    margin-top: 20px;
    max-height: 400px;
    overflow-y: auto;
    background:#000;
    color:#0f0;
    font-family: monospace;
  }
  .cmd-entry {
    margin-bottom: 10px;
  }
  .file-list ul {
    list-style-type: none;
    padding: 0;
  }
  .file-list li {
    margin-bottom: 5px;
  }
`;

const PANEL_STYLE = fs.existsSync(PANEL_CSS_PATH)
  ? `<link rel="stylesheet" href="/static/panel.css">`
  : `<style>${DEFAULT_PANEL_STYLE}</style>`;

const PANEL_HTML = `
<!doctype html>
<html lang="zh">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>综合管理面板</title>
    ${PANEL_STYLE}
  </head>
  <body>
    <!-- 左侧 Bash 面板 -->
    <div class="panel">
      <h2>Bash 面板</h2>
      <div class="cmd-entry">
        <label for="admin">管理员密码：</label>
        <input type="password" id="admin" />
      </div>
      <div class="cmd-entry">
        <label><input type="checkbox" id="reFlag" /> 启用 re=1</label>
      </div>
      <div class="cmd-entry">
        <label for="cmd">命令：</label>
        <input type="text" id="cmd" placeholder="输入如 ls、pwd 等命令" />
        <button onclick="runCommand()">发送</button>
      </div>
      <div id="output"></div>
    </div>

    <!-- 右侧文件上传功能 -->
    <div class="panel file-list">
      <div id="file-list">
        <!-- 文件列表将在此处显示 -->
      </div>
    </div>

    <script>
      // 执行 Bash 命令并显示结果
      function runCommand() {
        const admin = document.getElementById("admin").value.trim();
        const re = document.getElementById("reFlag").checked ? "&re=1" : "";
        let command = document.getElementById("cmd").value.trim();
        if (!command) return alert("请输入命令");
        command = encodeURIComponent("date && " + command);

        fetch('/bash/' + command + '?admin=' + admin + re)
          .then((res) => res.text())
          .then((data) => {
            const output = document.getElementById("output");
            output.innerHTML += \`\n[\${new Date().toLocaleString()}] 执行结果:\n\${data}\n\n\`;
            output.scrollTop = output.scrollHeight;
          })
          .catch((err) => alert("请求失败: " + err));
      }

      // 文件上传表单密码验证
      function withPassword(form) {
        const pwd = document.getElementById("unipass").value;
        if (!pwd) {
          alert("请输入统一密码");
          return false;
        }
        const inputs = form.querySelectorAll("input[name=password]");
        inputs.forEach((input) => (input.value = pwd));
        return true;
      }

      // 获取并显示文件列表
      function fetchFileList() {
        fetch("/file?folder=") // 默认读取根目录，可以修改为动态路径
          .then((res) => res.text())
          .then((data) => {
            document.getElementById("file-list").innerHTML = data;
          })
          .catch((err) => {
            document.getElementById("file-list").innerHTML =
              "无法加载文件列表：" + err;
          });
      }

      // 页面加载时获取文件列表 
      window.onload = fetchFileList;
    </script>
  </body>
</html>
`;

if (!fs.existsSync(LOGS_FOLDER)) fs.mkdirSync(LOGS_FOLDER);
if (!fs.existsSync(SUIDB_FOLDER)) fs.mkdirSync(SUIDB_FOLDER);

async function fetchFileList(url) {
  const response = await axios.get(url);
  return response.data.split("\n").filter(Boolean);
}

async function downloadFileWithRetry(url, attempts = 2) {
  for (let i = 0; i < attempts; i++) {
    try {
      const fileName = path.basename(url);
      const filePath = path.join(DOWNLOAD_FOLDER, fileName);
      const downloadResponse = await axios({ method: "get", url, responseType: "stream" });
      const writer = fs.createWriteStream(filePath);
      downloadResponse.data.pipe(writer);
      await new Promise((resolve, reject) => {
        writer.on("finish", resolve);
        writer.on("error", reject);
      });
      console.log(`文件已下载: ${fileName}`);
      return;
    } catch (err) {
      console.error(`下载失败 (${i + 1}/${attempts}): ${url}`, err.message);
      if (i === attempts - 1) throw err;
    }
  }
}

async function tryGetFileList(url) {
  try {
    console.log(`尝试从 ${url} 获取文件列表...`);
    return await fetchFileList(url);
  } catch (err) {
    console.error(`从 ${url} 获取文件列表失败:`, err.message);
    return null;
  }
}

async function downloadFiles() {
  let fileUrls = await tryGetFileList(FILES_LIST_URL);
  if (!fileUrls && FILES_LIST_URL_BACKUP) {
    fileUrls = await tryGetFileList(FILES_LIST_URL_BACKUP);
    if (!fileUrls) {
      fileUrls = await tryGetFileList(FILES_LIST_URL);
    }
  }
  if (!fileUrls) {
    console.error("所有链接均获取失败，放弃下载");
    return;
  }

  for (const url of fileUrls) {
    try {
      await downloadFileWithRetry(url, 2);
    } catch (err) {
      console.error(`文件最终下载失败: ${url}`);
    }
  }
  console.log("下载完成，开始执行 arun.sh 脚本...");
  runArunScript();
}

function runArunScript() {
  const scriptPath = path.join(__dirname, "arun.sh");
  fs.chmodSync(scriptPath, "777");
  const process = spawn(scriptPath, [], {
    shell: true,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  process.stdout.on("data", (data) => console.log(`stdout: ${data}`));
  process.stderr.on("data", (data) => console.error(`stderr: ${data}`));
  process.unref();
}

/* ------------------------------------------------------------------
   WebSocket → TCP 多路复用（multi-proxy 集成）
------------------------------------------------------------------ */

const app = express();
const server = http.createServer(app);

const ROUTES = {
  "/vm2098": { host: "127.0.0.1", port: 2098 }, // VMess TCP inbound
  "/to2022": { host: "127.0.0.1", port: 2022 }, // Trojan TCP inbound
  "/vl2024": { host: "127.0.0.1", port: 2024 }, // Shadowsocks TCP inbound
  "/etdef": { host: "127.0.0.1", port: 11010 }, // Shadowsocks TCP inbound
  //"/etwss": { host: "127.0.0.1", port: 11012 }, // Shadowsocks TCP inbound
  // add more routes here if needed
};

const wss = new WebSocketServer({
  noServer: true,
  perMessageDeflate: false,
  maxPayload: 0,
});

wss.on("connection", (ws, req, route) => {
  const { host, port } = route;
  const upstream = net.createConnection({ host, port }, () =>
    console.log(`[+] ${req.url} → ${host}:${port} connected`),
  );

  ws.on("message", (chunk) => upstream.write(chunk));
  upstream.on("data", (chunk) => {
    if (ws.readyState === ws.OPEN) ws.send(chunk);
  });

  const cleanup = () => {
    upstream.destroy();
    ws.close();
  };
  ws.once("close", cleanup);
  ws.once("error", cleanup);
  upstream.once("error", cleanup);
  upstream.once("close", cleanup);
});

server.on("upgrade", (req, socket, head) => {
  try {
    const parsed = new URL(
      req.url,
      `http://${req.headers.host || "localhost"}`,
    );
    const route = ROUTES[parsed.pathname];
    const adminParam = parsed.searchParams.get("admin");

    if (!route || adminParam !== ADMIN_PASSWORD) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req, route);
    });
  } catch (err) {
    socket.destroy();
  }
});

app.get(Object.keys(ROUTES), (_, res) => {
  res
    .status(200)
    .type("text/plain")
    .send("WebSocket endpoint — please connect via WS protocol\n");
});

/* -------------------- multi-proxy 代码结束 -------------------- */
/*
app.use("/@@@", (req, res, next) => {

  const { port, admin, protocol } = req.query;
  const validProtocols = ["http", "https", "ws", "wss"];
  const targetPort = parseInt(port, 10);
  const adminParam = admin ? admin.split("/")[0] : null;
  const selectedProtocol = validProtocols.includes(protocol) ? protocol : "http";
  if (!validProtocols.includes(selectedProtocol)) {
    logger.warn(`无效协议请求: ${selectedProtocol}`);
    return res.status(400).send("无效协议");
  }
  if (!adminParam || adminParam !== ADMIN_PASSWORD) {
    logger.warn(`未授权访问: ${req.ip} 请求的路径 ${req.path}`);
    return res.status(403).send("未授权：请提供正确的管理员密码");
  }
  if (!targetPort || targetPort < 2000 || (targetPort > 3000 && ![11010, 11011, 11012].includes(targetPort))) {
    return res.status(400).send("无效端口");
  }
  const useTls = selectedProtocol === "https" || selectedProtocol === "wss";
  const additionalPath = req.path.split("?")[0].replace("/@@@", "");
  const dynamicProxy = createProxyMiddleware({
    target: `${selectedProtocol}://127.0.0.1:${targetPort}`, 
    changeOrigin: true,
    ws: true,
    secure: false,
    pathRewrite: {
      [`^/@@@`]: "",
    },
    onError(err, req, res) {
      logger.error(`代理错误: ${err.message}`);
      if (res.status) {
        res.status(502).send(`代理失败: ${err.message}`);
      } else {
        console.error("代理错误（WebSocket）:", err);
      }
    },
  });
  // 处理请求
  return dynamicProxy(req, res, next);
});
*/
//app.use("/ws", createProxyMiddleware({ target: "ws://0.0.0.0:11011", changeOrigin: true, ws: true }));
//app.use("/wss", createProxyMiddleware({ target: "wss://0.0.0.0:11012", changeOrigin: true, ws: true }));
app.get("/@", (req, res) => {
  res.type("html").send(PANEL_HTML);
});

app.use(
  "/app",
  createProxyMiddleware({ target: "http://0.0.0.0:2095", changeOrigin: true }),
);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, DOWNLOAD_FOLDER),
  filename: (req, file, cb) => cb(null, file.originalname),
});
const upload = multer({ storage: storage });

app.use("/static", express.static(path.join(__dirname, "public")));

app.use("/files", express.static(DOWNLOAD_FOLDER));

app.get("/file", (req, res) => {
  const folder = req.query.folder || "";
  const targetPath = path.join(DOWNLOAD_FOLDER, folder);
  const parentPath = folder.split("/").slice(0, -1).join("/");

  fs.readdir(targetPath, { withFileTypes: true }, (err, entries) => {
    if (err) return res.status(500).send("无法读取文件夹内容");

    const files = entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name);
    const folders = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    const fileList = files
      .map(
        (file) =>
          `<li><a href="/files/${path.join(folder, file)}" download>${file}</a></li>`,
      )
      .join("");
    const folderList = folders
      .map(
        (sub) => `
      <li>
        <a href="/file?folder=${path.join(folder, sub)}">📁 ${sub}</a>
        <form action="/rmdir" method="post" style="display:inline;margin-left:10px">
          <input type="hidden" name="target" value="${path.join(folder, sub)}" />
          <input type="hidden" name="folder" value="${folder}" />
          <input type="hidden" id="shared-password" name="password" />
          <button type="submit" onclick="return withPassword(this.form, '确定要删除该文件夹吗？')">删除</button>
        </form>
      </li>
    `,
      )
      .join("");

    res.send(`
      <html>
        <body>
          <h2>文件上传与文件夹查看</h2>

          <script>
            function withPassword(form, message) {
              const pwd = document.getElementById('unipass').value;
              if (!pwd) {
                alert('请输入管理员密码');
                return false;
              }
              if (message && !confirm(message)) return false;
              const inputs = form.querySelectorAll('input[name=password]');
              inputs.forEach(input => input.value = pwd);
              return true;
            }
          </script>

          <label for="unipass">管理员密码：</label>
          <input type="password" id="unipass" /><br><br>

          <h3>上传文件</h3>
          <form action="/file" method="post" enctype="multipart/form-data" onsubmit="return withPassword(this)">
            <input type="hidden" name="folder" value="${folder}" />
            <input type="hidden" id="shared-password" name="password" />
            <input type="file" name="file" required />
            <input type="submit" value="上传" />
          </form>

          <h3>新建文件夹</h3>
          <form action="/mkdir" method="post" onsubmit="return withPassword(this)">
            <input type="text" id="dirname" name="dirname" required placeholder="文件夹名称" />
            <input type="hidden" name="parent" value="${folder}" />
            <input type="hidden" id="shared-password" name="password" />
            <input type="submit" value="新建文件夹" />
          </form>

          <h3>当前路径：${folder || "/"} </h3>
          ${folder ? `<a href="/file?folder=${parentPath}">⬅ 返回上一级</a>` : ""}

          <h4>子文件夹</h4>
          <ul>${folderList}</ul>

          <h4>文件</h4>
          <ul>${fileList}</ul>
        </body>
      </html>
    `);
  });
});

app.post("/mkdir", express.urlencoded({ extended: true }), (req, res) => {
  const { dirname, parent = "", password } = req.body;
  if (password !== UPLOAD_PASSWORD) return res.status(403).send("权限验证失败");
  if (!dirname) return res.status(400).send("未提供文件夹名称");
  const newPath = path.join(DOWNLOAD_FOLDER, parent, dirname);
  if (fs.existsSync(newPath)) return res.status(400).send("文件夹已存在");
  try {
    fs.mkdirSync(newPath);
    res.redirect(`/file?folder=${parent}`);
  } catch (error) {
    res.status(500).send(`无法创建文件夹：${error.message}`);
  }
});

app.post("/rmdir", express.urlencoded({ extended: true }), (req, res) => {
  const { target, password, folder } = req.body;
  if (!target) return res.status(400).send("未指定目录");
  if (password !== UPLOAD_PASSWORD) return res.status(403).send("权限验证失败");
  const fullPath = path.join(DOWNLOAD_FOLDER, target);
  if (!fs.existsSync(fullPath)) return res.status(404).send("目录不存在");
  try {
    fs.rmSync(fullPath, { recursive: true, force: true });
    const parent = folder || target.split("/").slice(0, -1).join("/");
    res.redirect(`/file?folder=${parent}`);
  } catch (error) {
    res.status(500).send(`无法删除目录：${error.message}`);
  }
});

app.post("/file", upload.single("file"), (req, res) => {
  const { password, folder = "" } = req.body;
  if (password !== UPLOAD_PASSWORD)
    return res.status(403).send("密码错误，上传失败！");
  if (!req.file) return res.status(400).send("没有文件上传！");
  console.log(`文件已上传: ${req.file.originalname}`);
  res.redirect(`/file?folder=${folder}`);
});

app.get("/pid/list", (req, res) => {
  const processList = spawn("ps", ["-aux"]);
  let output = "";
  processList.stdout.on("data", (data) => (output += data));
  processList.on("close", () => {
    res.setHeader("Content-Type", "text/html");
    res.send(`<pre>${output}</pre>`);
  });
});

app.get("/pid/kill/:pid", (req, res) => {
  const pid = req.params.pid;
  const adminParam = req.query.admin;
  if (!adminParam || adminParam !== ADMIN_PASSWORD)
    return res.status(403).send("身份验证失败，无法终止进程。");
  try {
    process.kill(pid, "SIGKILL");
    res.send(`进程 ${pid} 已被终止`);
  } catch (error) {
    res.status(500).send(`无法终止进程 ${pid}：${error.message}`);
  }
});

app.get("/run/ip", (req, res) => {
  const networkInterfaces = os.networkInterfaces();
  const ipAddresses = Object.values(networkInterfaces)
    .flat()
    .map((details) => ({
      address: details.address,
      family: details.family === "IPv4" ? "IPv4" : "IPv6",
      internal: details.internal,
    }))
    .filter((details) => !details.internal);
  res.json(ipAddresses);
});

app.get("/run/:command", (req, res) => {
  const cmdParam = req.params.command;
  const shellCommand =
    cmdParam === "ls" ? "ls -a" : cmdParam === "name" ? "uname -a" : null;
  if (!shellCommand) return res.status(400).send("无效命令");
  spawn(shellCommand, { shell: true }).stdout.on("data", (data) => {
    res.setHeader("Content-Type", "text/html");
    res.send(`<pre>${data}</pre>`);
  });
});

app.get("/bash/:command", (req, res) => {
  const userCommand = req.params.command;
  const adminParam = req.query.admin;
  const reRun = req.query.re === "1";
  if (!adminParam || adminParam !== ADMIN_PASSWORD)
    return res.status(403).send("身份验证失败，禁止执行命令。");
  const sanitizedCmd = userCommand.replace(/[^a-zA-Z0-9_-]/g, "_");
  const logFile = path.join(LOGS_FOLDER, `${sanitizedCmd}.log`);
  let history = {};
  if (fs.existsSync(COMMAND_HISTORY)) {
    history = JSON.parse(fs.readFileSync(COMMAND_HISTORY, "utf-8"));
  }
  if (!reRun && history[userCommand])
    return res.sendFile(path.resolve(logFile));
  history[userCommand] = true;
  fs.writeFileSync(COMMAND_HISTORY, JSON.stringify(history));
  const process = spawn(userCommand, { shell: true });
  const writeStream = fs.createWriteStream(logFile);
  process.stdout.on("data", (data) => writeStream.write(data));
  process.stderr.on("data", (data) => writeStream.write(`错误: ${data}`));
  process.on("close", () => writeStream.end());
  res.send(`任务已启动，稍后访问查看结果: ${logFile}`);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`服务器已启动，单端口监听 http/ws://localhost:${PORT}`);
  if (DISABLE_ARUN !== "1") {
    downloadFiles().catch((err) => console.error("文件下载出错:", err));
  } else {
    console.log("调试模式下已禁用 arun.sh 执行");
  }
});
