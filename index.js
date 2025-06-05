const express = require("express");
const { spawn } = require("child_process");
const { createProxyMiddleware } = require("http-proxy-middleware");
const os = require("os");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 3000;
const LOGS_FOLDER = "./logs"; // 存储所有进程的输出
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "default_password";
const COMMAND_HISTORY = "command_history.json";

// 确保日志文件夹存在
if (!fs.existsSync(LOGS_FOLDER)) {
  fs.mkdirSync(LOGS_FOLDER);
}

// 反向代理 /user -> localhost:5000
app.use(
  "/app",
  createProxyMiddleware({
    target: "http://localhost:2095",
    changeOrigin: true,
  }),
);

app.use(
  "/sub",
  createProxyMiddleware({
    target: "http://localhost:2096",
    changeOrigin: true,
  }),
);

// 获取服务器 IPv4 和 IPv6 地址
app.get("/start/ip", (req, res) => {
  const networkInterfaces = os.networkInterfaces();

  const ipAddresses = Object.values(networkInterfaces)
    .flat()
    .map((details) => ({
      address: details.address,
      family: details.family === "IPv4" ? "IPv4" : "IPv6",
      internal: details.internal,
    }))
    .filter((details) => !details.internal); // 过滤掉本地回环地址

  res.json(ipAddresses);
});

// 预定义命令执行
app.get("/start/:command", (req, res) => {
  const cmdParam = req.params.command;
  let shellCommand = "";

  if (cmdParam === "ls") {
    shellCommand = "ls -a";
  } else if (cmdParam === "name") {
    shellCommand = "uname";
  } else {
    return res.status(400).send('无效命令，请使用 "ls" 或 "name"。');
  }

  spawn(shellCommand, { shell: true }).stdout.on("data", (data) => {
    res.setHeader("Content-Type", "text/html");
    res.send(`<pre>${data}</pre>`);
  });
});

// **执行任意 shell 命令**，并存储多个进程的输出到不同文件
app.get("/bash/:command", (req, res) => {
  const userCommand = req.params.command;
  const adminParam = req.query.admin;
  const reRun = req.query.re === "1"; // 解析 `re=1` 传参

  // **查看所有正在运行的进程**
  app.get("/p/list", (req, res) => {
    const processList = spawn("ps", ["-aux"]);

    let output = "";
    processList.stdout.on("data", (data) => {
      output += data;
    });

    processList.on("close", () => {
      res.setHeader("Content-Type", "text/html");
      res.send(`<pre>${output}</pre>`);
    });
  });

  // **终止指定进程**
  app.get("/p/kill/:pid", (req, res) => {
    const pid = req.params.pid;
    const adminParam = req.query.admin;

    if (!adminParam || adminParam !== ADMIN_PASSWORD) {
      return res.status(403).send("身份验证失败，禁止终止进程。");
    }

    // 终止进程
    const killProcess = spawn("kill", [pid]);

    killProcess.on("close", (code) => {
      res.send(`进程 ${pid} 已终止（退出代码: ${code}）`);
    });

    killProcess.stderr.on("data", (data) => {
      res.status(500).send(`无法终止进程 ${pid}: ${data.toString()}`);
    });
  });

  // 身份验证
  if (!adminParam || adminParam !== ADMIN_PASSWORD) {
    return res.status(403).send("身份验证失败，禁止执行命令。");
  }

  // **文件名改为命令头**
  const sanitizedCmd = userCommand.replace(/[^a-zA-Z0-9_-]/g, "_"); // 防止非法字符
  const logFile = path.join(LOGS_FOLDER, `${sanitizedCmd}.log`);

  // 读取已执行的命令历史
  let history = {};
  if (fs.existsSync(COMMAND_HISTORY)) {
    history = JSON.parse(fs.readFileSync(COMMAND_HISTORY, "utf-8"));
  }

  // **如果 `re=1` 传入，则重新执行命令**
  if (!reRun && history[userCommand]) {
    return res.sendFile(path.resolve(logFile));
  }

  // 标记命令已执行（如果是重新执行，则覆盖历史记录）
  history[userCommand] = true;
  fs.writeFileSync(COMMAND_HISTORY, JSON.stringify(history));

  // **启动子进程**
  const process = spawn(userCommand, { shell: true });
  const writeStream = fs.createWriteStream(logFile);

  process.stdout.on("data", (data) => {
    writeStream.write(data);
  });

  process.stderr.on("data", (data) => {
    writeStream.write(`错误: ${data}`);
  });

  process.on("close", () => {
    writeStream.end();
  });

  res.send(`任务已启动，稍后访问查看结果: ${logFile}`);
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`服务器已启动，访问地址：http://localhost:${PORT}`);
});
