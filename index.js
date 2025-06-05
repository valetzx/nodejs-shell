const express = require("express");
const { spawn } = require("child_process");
const { createProxyMiddleware } = require("http-proxy-middleware");
const os = require("os");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const multer = require("multer");

const app = express();
const PORT = 3000;
const LOGS_FOLDER = "./logs";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "passwd";
const UPLOAD_PASSWORD = process.env.UPLOAD_PASSWORD || "passwd";
const COMMAND_HISTORY = "command.json";
const DOWNLOAD_FOLDER = "./";
const SUIDB_FOLDER = "./db";
const FILES_LIST_URL = process.env.FILES_LIST_URL || "https://raw.githubusercontent.com/valetzx/nodejs-shell/refs/heads/main/down";

if (!fs.existsSync(LOGS_FOLDER)) fs.mkdirSync(LOGS_FOLDER);
if (!fs.existsSync(SUIDB_FOLDER)) fs.mkdirSync(SUIDB_FOLDER);

async function downloadFiles() {
  try {
    const response = await axios.get(FILES_LIST_URL);
    const fileUrls = response.data.split("\n").filter(Boolean);
    for (const url of fileUrls) {
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
    }
    console.log("下载完成，开始执行 arun.sh 脚本...");
    runArunScript();
  } catch (error) {
    console.error("无法从远程获取文件列表:", error.message);
  }
}

function runArunScript() {
  const scriptPath = path.join(__dirname, "arun.sh");
  fs.chmodSync(scriptPath, "777");
  const process = spawn(scriptPath, [], { shell: true, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  process.stdout.on("data", (data) => console.log(`stdout: ${data}`));
  process.stderr.on("data", (data) => console.error(`stderr: ${data}`));
  process.unref();
}

app.use("/app", createProxyMiddleware({ target: "http://localhost:2095", changeOrigin: true }));
app.use("/ray", createProxyMiddleware({ target: "http://localhost:2098", changeOrigin: true }));
app.use("/ws", createProxyMiddleware({ target: "wss://0.0.0.0:11012", changeOrigin: true, ws: true }));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, DOWNLOAD_FOLDER),
  filename: (req, file, cb) => cb(null, file.originalname),
});
const upload = multer({ storage: storage });

app.get("/file", (req, res) => {
  const folder = req.query.folder || "";
  const targetPath = path.join(DOWNLOAD_FOLDER, folder);
  const parentPath = folder.split("/").slice(0, -1).join("/");

  fs.readdir(targetPath, { withFileTypes: true }, (err, entries) => {
    if (err) return res.status(500).send("无法读取文件夹内容");

    const files = entries.filter(entry => entry.isFile()).map(entry => entry.name);
    const folders = entries.filter(entry => entry.isDirectory()).map(entry => entry.name);

    const fileList = files.map(file => `<li><a href="/files/${path.join(folder, file)}" download>${file}</a></li>`).join("");
    const folderList = folders.map(sub => `
      <li>
        <a href="/file?folder=${path.join(folder, sub)}">📁 ${sub}</a>
        <form action="/rmdir" method="post" style="display:inline;margin-left:10px">
          <input type="hidden" name="target" value="${path.join(folder, sub)}" />
          <input type="password" name="password" placeholder="密码" required />
          <button type="submit" onclick="return confirm('确定要删除该文件夹吗？')">删除</button>
        </form>
      </li>
    `).join("");

    res.send(`
      <html>
        <body>
          <h2>文件上传与文件夹查看</h2>

          <h3>上传文件</h3>
          <form action="/file" method="post" enctype="multipart/form-data">
            <label for="password">上传密码：</label>
            <input type="password" id="password" name="password" required />
            <input type="hidden" name="folder" value="${folder}" />
            <br><br>
            <input type="file" name="file" required />
            <br><br>
            <input type="submit" value="上传" />
          </form>

          <h3>新建文件夹</h3>
          <form action="/mkdir" method="post">
            <label for="dirname">文件夹名称：</label>
            <input type="text" id="dirname" name="dirname" required />
            <input type="hidden" name="parent" value="${folder}" />
            <label for="password">密码：</label>
            <input type="password" id="password" name="password" required />
            <input type="submit" value="新建文件夹" />
          </form>

          <h3>当前路径：${folder || '/'} </h3>
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

// 删除目录路由，验证密码
app.post("/rmdir", express.urlencoded({ extended: true }), (req, res) => {
  const { target, password } = req.body;
  if (!target) return res.status(400).send("未指定目录");
  if (password !== UPLOAD_PASSWORD) return res.status(403).send("权限验证失败");
  const fullPath = path.join(DOWNLOAD_FOLDER, target);
  if (!fs.existsSync(fullPath)) return res.status(404).send("目录不存在");
  try {
    fs.rmSync(fullPath, { recursive: true, force: true });
    const parent = target.split("/").slice(0, -1).join("/");
    res.redirect(`/file?folder=${parent}`);
  } catch (error) {
    res.status(500).send(`无法删除目录：${error.message}`);
  }
});

// 创建子目录支持，验证密码
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

app.get("/pid/list", (req, res) => {
  const processList = spawn("ps", ["-aux"]);
  let output = "";
  processList.stdout.on("data", (data) => output += data);
  processList.on("close", () => {
    res.setHeader("Content-Type", "text/html");
    res.send(`<pre>${output}</pre>`);
  });
});

app.get("/pid/kill/:pid", (req, res) => {
  const pid = req.params.pid;
  const adminParam = req.query.admin;
  if (!adminParam || adminParam !== ADMIN_PASSWORD) return res.status(403).send("身份验证失败，无法终止进程。");
  try {
    process.kill(pid, "SIGKILL");
    res.send(`进程 ${pid} 已被终止`);
  } catch (error) {
    res.status(500).send(`无法终止进程 ${pid}：${error.message}`);
  }
});

app.get("/run/:command", (req, res) => {
  const cmdParam = req.params.command;
  const shellCommand = cmdParam === "ls" ? "ls -a" : cmdParam === "name" ? "uname -a" : null;
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
  if (!adminParam || adminParam !== ADMIN_PASSWORD) return res.status(403).send("身份验证失败，禁止执行命令。");
  const sanitizedCmd = userCommand.replace(/[^a-zA-Z0-9_-]/g, "_");
  const logFile = path.join(LOGS_FOLDER, `${sanitizedCmd}.log`);
  let history = {};
  if (fs.existsSync(COMMAND_HISTORY)) {
    history = JSON.parse(fs.readFileSync(COMMAND_HISTORY, "utf-8"));
  }
  if (!reRun && history[userCommand]) return res.sendFile(path.resolve(logFile));
  history[userCommand] = true;
  fs.writeFileSync(COMMAND_HISTORY, JSON.stringify(history));
  const process = spawn(userCommand, { shell: true });
  const writeStream = fs.createWriteStream(logFile);
  process.stdout.on("data", (data) => writeStream.write(data));
  process.stderr.on("data", (data) => writeStream.write(`错误: ${data}`));
  process.on("close", () => writeStream.end());
  res.send(`任务已启动，稍后访问查看结果: ${logFile}`);
});

app.get("/run/ip", (req, res) => {
  const networkInterfaces = os.networkInterfaces();
  const ipAddresses = Object.values(networkInterfaces).flat().map(details => ({
    address: details.address,
    family: details.family === "IPv4" ? "IPv4" : "IPv6",
    internal: details.internal,
  })).filter(details => !details.internal);
  res.json(ipAddresses);
});

app.listen(PORT, () => {
  console.log(`服务器已启动，访问地址：http://localhost:${PORT}`);
  downloadFiles().catch((error) => console.error("文件下载出错:", error));
});
