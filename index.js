const express = require("express");
const { spawn } = require("child_process");
const { createProxyMiddleware } = require("http-proxy-middleware");
const os = require("os");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const multer = require("multer"); // Import multer for file uploading

const app = express();
const PORT = 3000;
const LOGS_FOLDER = "./logs"; // 存储所有进程的输出
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "passwd"; // 在环境变量中修改你的密码
const UPLOAD_PASSWORD = process.env.UPLOAD_PASSWORD || "passwd"; // 上传文件的密码
const COMMAND_HISTORY = "command.json";
const DOWNLOAD_FOLDER = "./";
const SUIDB_FOLDER = "./db";
const FILES_LIST_URL = process.env.FILES_LIST_URL || "https://raw.githubusercontent.com/valetzx/nodejs-shell/refs/heads/main/down"; // 远程文件列表的 URL

// 确保日志文件夹和下载文件夹存在
if (!fs.existsSync(LOGS_FOLDER)) {
  fs.mkdirSync(LOGS_FOLDER);
}
if (!fs.existsSync(SUIDB_FOLDER)) {
  fs.mkdirSync(SUIDB_FOLDER);
}

// 启动时自动从网络下载文件
async function downloadFiles() {
  try {
    const response = await axios.get(FILES_LIST_URL);
    const fileUrls = response.data.split("\n").filter(Boolean);

    for (const url of fileUrls) {
      try {
        const fileName = path.basename(url);
        const filePath = path.join(DOWNLOAD_FOLDER, fileName);

        const downloadResponse = await axios({
          method: "get",
          url: url,
          responseType: "stream",
        });

        const writer = fs.createWriteStream(filePath);
        downloadResponse.data.pipe(writer);

        await new Promise((resolve, reject) => {
          writer.on("finish", resolve);
          writer.on("error", reject);
        });

        console.log(`文件已下载: ${fileName}`);
      } catch (error) {
        console.error(`下载文件失败: ${url}`, error.message);
      }
    }

    console.log("下载完成，开始执行 arun.sh 脚本...");
    runArunScript();
  } catch (error) {
    console.error("无法从远程获取文件列表:", error.message);
  }
}

// 执行 arun.sh 脚本
function runArunScript() {
  const scriptPath = path.join(__dirname, "arun.sh");

  fs.chmodSync(scriptPath, "755");

  const process = spawn(scriptPath, [], {
    shell: true,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  process.stdout.on("data", (data) => {
    console.log(`stdout: ${data}`);
  });

  process.stderr.on("data", (data) => {
    console.error(`stderr: ${data}`);
  });

  process.unref();
}

// 文件上传中间件设置
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, DOWNLOAD_FOLDER); // 上传文件保存至根目录
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname); // 保持原文件名
  },
});

const upload = multer({ storage: storage });

// 上传与文件列表合并的页面
app.get("/file", (req, res) => {
  // 读取文件夹中的文件
  fs.readdir(DOWNLOAD_FOLDER, (err, files) => {
    if (err) {
      return res.status(500).send("wrong file");
    }

    const fileList = files
      .map((file) => {
        return `<li><a href="/files/${file}" download>${file}</a></li>`;
      })
      .join("");

    const html = `
      <html>
        <body>
          <h2>File</h2>

          <h3>Upload</h3>
          <form action="/file" method="post" enctype="multipart/form-data">
            <label for="password">Password：</label>
            <input type="password" id="password" name="password" required /><br><br>
            <input type="file" name="file" required /><br><br>
            <input type="submit" value="up" />
          </form>

          <br><br>
          <h3>List</h3>
          <ul>
            ${fileList}
          </ul>
        </body>
      </html>
    `;
    res.send(html);
  });
});

// 文件上传处理
app.post("/file", upload.single("file"), (req, res) => {
  const { password } = req.body;

  // 检查上传密码
  if (password !== UPLOAD_PASSWORD) {
    return res.status(403).send("wrong passwd!");
  }

  if (!req.file) {
    return res.status(400).send("no file error!");
  }

  const uploadedFile = req.file;
  console.log(`file has been upload: ${uploadedFile.originalname}`);

  // 上传完成后，刷新文件列表
  res.redirect("/file"); // Redirect to the same page to show updated list
});

// 文件下载
app.get("/files/:filename", (req, res) => {
  const fileName = req.params.filename;
  const filePath = path.join(DOWNLOAD_FOLDER, fileName);

  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      return res.status(404).send("file does not exist");
    }

    res.download(filePath, fileName, (err) => {
      if (err) {
        console.error("download error:", err);
        res.status(500).send("download error");
      }
    });
  });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`!!VISIT!!：http://localhost:${PORT}`);
  downloadFiles().catch((error) => console.error("文件下载出错:", error));
});
