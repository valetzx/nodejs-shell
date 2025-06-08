/**
 * WS ➜ TCP reverse proxy
 * 将客户端的 VMess+WS 流量接入本机 :2098，再转发到真实 VMess inbound
 *
 * 环境变量：
 *   REMOTE_HOST  真实 VMess 服务器地址（默认 127.0.0.1）
 *   REMOTE_PORT  真实 VMess 服务器端口（默认 10000）
 *   WS_PATH      WebSocket 路径（默认 /vmess，要与客户端一致）
 *
 * 依赖：npm i ws
 * Node ≥14
 */

const http = require('http');
const net  = require('net');
const { WebSocketServer } = require('ws');

const LISTEN_PORT = 2098;
const WS_PATH     = process.env.WS_PATH     || '/vmess';
const REMOTE_HOST = process.env.REMOTE_HOST || '127.0.0.1';
const REMOTE_PORT = Number(process.env.REMOTE_PORT) || 10000;

/* ---------- HTTP 回落页面，可自定义 ---------- */
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('VMess WebSocket Reverse Proxy is running.\n');
});

/* ---------- WebSocket “upgrade” ---------- */
server.on('upgrade', (req, socket, head) => {
  if (req.url !== WS_PATH) {           // 只接受指定路径
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

/* ---------- WS → TCP 桥 ---------- */
const wss = new WebSocketServer({ noServer: true, maxPayload: 0 });

wss.on('connection', (ws) => {
  // 连上后端 VMess inbound
  const upstream = net.createConnection(
    { host: REMOTE_HOST, port: REMOTE_PORT },
    () => console.log('[+] TCP connected →', `${REMOTE_HOST}:${REMOTE_PORT}`)
  );

  // WS → TCP
  ws.on('message', (chunk) => upstream.write(chunk));
  // TCP → WS
  upstream.on('data',  (chunk) => ws.readyState === ws.OPEN && ws.send(chunk));

  // 清理
  const cleanup = () => {
    ws.close();
    upstream.destroy();
  };
  ws.once('close',  cleanup);
  ws.once('error',  cleanup);
  upstream.once('error', cleanup);
  upstream.once('close', cleanup);
});

/* ---------- Listen ---------- */
server.listen(LISTEN_PORT, () => {
  console.log(`WS reverse proxy listening on :${LISTEN_PORT}`);
  console.log(`Forwarding to ${REMOTE_HOST}:${REMOTE_PORT}, path ${WS_PATH}\n`);
});
