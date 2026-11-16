// 零依赖本地静态服务器（仅用 Node 内置模块），用于演示 Web MVP
// 用法：node tools/serve.mjs            （不开浏览器）
//       node tools/serve.mjs --open     （启动后自动打开浏览器）
// 端口：默认 8642，可用环境变量 PORT 或第一个位置参数覆盖；
//       若默认端口被本演示服务占用 → 提示直接打开并退出；被其他进程占用 → 自动改用随机空闲端口。
// 说明：日志用英文，避免 Windows cmd(GBK) 控制台显示乱码。
// 跨平台：路径一律用 fileURLToPath（不用 .pathname，Windows 下会解析错），见 src/platform.mjs。
import { createServer, get } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { openBrowserCommand } from '../src/platform.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const port = Number(process.env.PORT || args.find((a) => /^\d+$/.test(a)) || 8642);
const shouldOpen = args.includes('--open');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

function makeHandler(port) {
  return async (req, res) => {
    try {
      const url = new URL(req.url, `http://127.0.0.1:${port}`);
      let pathname = decodeURIComponent(url.pathname);
      if (pathname === '/') pathname = '/web/index.html'; // 根路径 → 演示页（须先判，否则下行补 index.html 后此分支永不命中）
      else if (pathname.endsWith('/')) pathname += 'index.html';
      const filePath = path.normalize(path.join(root, pathname));
      if (!filePath.startsWith(root)) {
        res.writeHead(403).end('Forbidden');
        return;
      }
      const body = await readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
    }
  };
}

const pageUrl = (p) => `http://127.0.0.1:${p}/web/index.html`;

function openBrowser(url) {
  // 跨平台打开浏览器：win32=cmd start / darwin=open / linux=xdg-open（见 src/platform.mjs）
  const { cmd, args } = openBrowserCommand(url);
  try {
    spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref();
  } catch {
    // 无 GUI / 无 xdg-open 时静默降级：URL 已打印，用户可手动打开
    console.log(`[serve] Could not auto-open browser. Please open manually: ${url}`);
  }
}

function probe(port) {
  return new Promise((resolve) => {
    const req = get({ host: '127.0.0.1', port, path: '/web/index.html', timeout: 1500 }, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

function startServer(port) {
  const server = createServer(makeHandler(port));
  server.on('error', (err) => {
    if (err.code !== 'EADDRINUSE') {
      console.error(err);
      process.exit(1);
    }
    probe(port).then((ok) => {
      if (ok) {
        // 已有本服务实例在跑：无需再起，直接提示打开
        console.log(`[serve] Port ${port} is already running this demo server.`);
        console.log(`[serve] Open:  ${pageUrl(port)}`);
        if (shouldOpen) openBrowser(pageUrl(port));
        process.exit(0);
      }
      // 端口被其他进程占用：换随机空闲端口
      const fallback = createServer(makeHandler(0));
      fallback.listen(0, '127.0.0.1', () => {
        const p = fallback.address().port;
        console.log(`[serve] Port ${port} is busy (other process), using free port ${p}.`);
        console.log(`[serve] Demo running at:  ${pageUrl(p)}`);
        if (shouldOpen) openBrowser(pageUrl(p));
      });
    });
  });
  server.listen(port, '127.0.0.1', () => {
    console.log('[serve] Meihua Xiantian Qigua demo server started.');
    console.log(`[serve] Open:  ${pageUrl(port)}`);
    console.log('[serve] Press Ctrl+C to stop.');
    if (shouldOpen) openBrowser(pageUrl(port));
  });
}

startServer(port);
