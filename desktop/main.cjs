// 桌面端主进程 —— 零痕迹（绿色版）
//
// 设计要点（每一条都有实测依据，见 scratch/meihua-desktop-poc/DESKTOP-PLAN.md）：
//   1. 所有运行时数据重定向到 <应用目录>/.runtime，**绝不碰系统盘**
//   2. 退出时 spawn 一个**真正的 node** 进程延迟删除 .runtime（Chromium 子进程会延迟写盘，
//      同步删不干净；且 Electron 的 process.execPath 是 electron 二进制、不是 node）
//   3. 不注册文件关联/开始菜单/注册表；删掉应用目录 = 彻底移除
//   4. 网页版与桌面端共用同一套 web/ 与 src/（不复制代码，避免双真身）
//
// CommonJS：项目 package.json 是 "type": "module"，故本文件用 .cjs 扩展名。
const { app, BrowserWindow, Menu, shell, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');

const { redirectAllPaths, runtimeDir } = require('./paths.cjs');

// ---------------------------------------------------------------------------
// ★ 单实例锁：必须在 userData 重定向**之前**取
// ---------------------------------------------------------------------------
// 实测坑：先 redirectAllPaths() 再 requestSingleInstanceLock() 会让打包版 SIGTRAP
// （退出码 133、无日志、连 JS 都没跑完）—— 因为锁的实现依赖 userData 路径，
// 中途改路径导致 Chromium 内部锁机制拿到不一致状态。
// 顺序：取锁 → 重定向 → 起窗。
let gotLock = true;
try {
  gotLock = app.requestSingleInstanceLock();
} catch (e) {
  // 锁失败不应阻断启动（单实例是增强，不是必需）
  try { process.stderr.write('[desktop] 单实例锁异常，忽略继续：' + e.message + '\n'); } catch {}
  gotLock = true;
}

// ★ 必须在 whenReady 之前：路径重定向 + 环境变量
const RT = redirectAllPaths();

// ---------------------------------------------------------------------------
// Linux 沙箱降级（打包版必踩的坑，实测）
// ---------------------------------------------------------------------------
// Chromium 的 chrome-sandbox 要求文件属 root:root 且权限 4755。绿色版解压后是当前用户所有，
// 无法满足 ⇒ 进程直接 SIGTRAP（退出码 133），**连一行日志都不打印**，用户会以为"双击没反应"。
//
// 处理策略：
//   1. 若已是 root 或 sandbox 权限正确 ⇒ 不动（保留沙箱，安全）
//   2. 否则自动追加 --no-sandbox（仅 Linux；Windows/macOS 无此问题）
// 注：--no-sandbox 会降低进程隔离，但本应用只加载本地可信内容、不访问网络，风险可控。
if (process.platform === 'linux') {
  const sandbox = path.join(path.dirname(process.execPath), 'chrome-sandbox');
  let sandboxOk = false;
  try {
    const st = fs.statSync(sandbox);
    sandboxOk = st.uid === 0 && (st.mode & 0o4000) !== 0; // root 所有 + setuid
  } catch {
    sandboxOk = false;
  }
  const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;
  if (!sandboxOk && !isRoot) {
    // ★ appendSwitch 在打包版里**太晚**（Chromium 沙箱初始化早于 JS 执行），
    //   实测打包版仍 SIGTRAP。唯一可靠做法：往 argv 里塞 —— Chromium 解析命令行在 JS 之前。
    if (!process.argv.includes('--no-sandbox')) process.argv.push('--no-sandbox');
    if (!process.argv.includes('--disable-setuid-sandbox')) process.argv.push('--disable-setuid-sandbox');
    app.commandLine.appendSwitch('no-sandbox');
    app.commandLine.appendSwitch('disable-setuid-sandbox');
    try {
      process.stderr.write('[desktop] chrome-sandbox 权限不足（绿色版常态），已自动降级 no-sandbox\n');
    } catch {}
  }
  // 无显示环境（如 SSH 直跑）时给出可读提示而不是静默 SIGTRAP
  if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
    try {
      process.stderr.write('[desktop] 未检测到图形环境（DISPLAY/WAYLAND_DISPLAY），无法打开窗口\n');
    } catch {}
  }
}

const APP_ROOT = path.resolve(__dirname, '..');
const WEB_ENTRY = path.join(APP_ROOT, 'web', 'index.html');

let mainWindow = null;
let cleanupScheduled = false;

// ---------------------------------------------------------------------------
// 退出清理
// ---------------------------------------------------------------------------
// 为什么不能直接用 process.execPath：Electron 里它指向 electron 二进制，直接跑脚本会
//   再开一个 Electron 实例（不是当 node 用）。
//
// ★ 正确解法：ELECTRON_RUN_AS_NODE=1 + process.execPath —— Electron 二进制内置 node，
//   设了这个环境变量就以纯 node 模式运行。这样**完全不依赖用户环境里有没有 node**，
//   打包版在任何机器上都能自清理（实测：从 GUI 启动时 PATH 极短，找 'node' 会失败）。
function scheduleCleanup() {
  if (cleanupScheduled) return;
  cleanupScheduled = true;
  const cleanupScript = path.join(__dirname, 'cleanup.cjs');
  if (!fs.existsSync(cleanupScript)) return;

  try {
    const c = spawn(process.execPath, [cleanupScript, RT], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1', // ★ Electron 二进制当 node 用
        // 清理进程不需要任何 GUI/沙箱能力
        ELECTRON_NO_ATTACH_CONSOLE: '1',
      },
    });
    c.on('error', () => {
      /* 极端情况下失败：下次启动时 redirectAllPaths 会 rmSync 清理 */
    });
    c.unref();
  } catch {
    /* 同上 */
  }
}

// ---------------------------------------------------------------------------
// 菜单：只留必要项（去掉 DevTools/帮助/检查更新等噪音，桌面版用户不需要）
// ---------------------------------------------------------------------------
function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac
      ? [{
          label: app.name,
          submenu: [
            { role: 'about' },
            { type: 'separator' },
            { role: 'hide' },
            { role: 'hideOthers' },
            { type: 'separator' },
            { role: 'quit' },
          ],
        }]
      : []),
    {
      label: '文件',
      submenu: [isMac ? { role: 'close', label: '关闭窗口' } : { role: 'quit', label: '退出' }],
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' },
      ],
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '关于',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: '关于',
              message: '梅花易数 · 先天起卦法',
              detail:
                `版本 ${app.getVersion()}\n\n` +
                '离线可用 · 零依赖 · 本地运行\n' +
                '所有数据仅在本机，不联网、不上传。\n\n' +
                '本程序为绿色版：运行数据存于应用目录下 .runtime，退出即清理，不在系统盘留文件。',
              buttons: ['好'],
              noLink: true,
            });
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------------------------------------------------------------------------
// 窗口
// ---------------------------------------------------------------------------
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 860,
    minWidth: 380,
    minHeight: 480,
    show: false,
    backgroundColor: '#f5f3ee',
    title: '梅花易数 · 先天起卦法',
    autoHideMenuBar: process.platform !== 'darwin',
    webPreferences: {
      // 安全基线：渲染进程不接触 node，只通过极窄 preload 暴露必要能力
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false, // 需要 preload 里的少量能力；仍禁用 nodeIntegration
      preload: path.join(__dirname, 'preload.cjs'),
      // 桌面端不需要 devtools 之外的调试能力
      devTools: !app.isPackaged,
      spellcheck: false,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  // 用 file:// 加载？不行 —— 浏览器禁止 file:// 页面 fetch 本地 JSON。
  // 桌面端用自定义协议 app:// 提供同源访问，复用与网页版完全一致的相对路径语义。
  mainWindow.loadURL('app://local/web/index.html');

  // 外部链接一律交给系统浏览器，不在应用内打开（避免应用成为通用浏览器）
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('app://local/')) {
      e.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ---------------------------------------------------------------------------
// 自定义协议：app://local/<相对路径>  →  <应用目录>/<相对路径>
// 与 tools/serve.mjs 的静态服务语义一致（只是换成 Electron 内置，不需起端口）
// ---------------------------------------------------------------------------
function registerAppProtocol() {
  const { protocol, net } = require('electron');
  const { pathToFileURL } = require('node:url');

  // 必须在 ready 之前声明特权（standard + secure 才能让 fetch/ESM 正常工作）
  protocol.registerSchemesAsPrivileged([
    { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
  ]);

  app.whenReady().then(() => {
    protocol.handle('app', (request) => {
      const url = new URL(request.url);
      // app://local/web/index.html → host='local', pathname='/web/index.html'
      let rel = decodeURIComponent(url.pathname);
      if (rel === '/' || rel === '') rel = '/web/index.html';
      // 安全：禁止穿越出应用目录
      const target = path.normalize(path.join(APP_ROOT, rel));
      if (!target.startsWith(APP_ROOT)) {
        return new Response('Forbidden', { status: 403 });
      }
      try {
        if (!fs.existsSync(target)) return new Response('404 Not Found', { status: 404 });
        return net.fetch(pathToFileURL(target).toString());
      } catch {
        return new Response('404 Not Found', { status: 404 });
      }
    });
  });
}

// ---------------------------------------------------------------------------
// 生命周期
// ---------------------------------------------------------------------------
// 单实例结果已在文件顶部取好（见上方说明）
if (!gotLock) {
  try { process.stderr.write('[desktop] 已有实例在运行，聚焦后退出\n'); } catch {}
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  registerAppProtocol();

  app.whenReady().then(() => {
    buildMenu();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('window-all-closed', () => {
  // 非 macOS 一律退出（桌面版是单窗口应用）
  if (process.platform !== 'darwin') app.quit();
});

// 退出时调度清理（必须放在 quit 而非 will-quit：will-quit 同步删不干净）
app.on('quit', scheduleCleanup);

// 兜底：异常情况也尽量清（尽力而为，失败留给下次启动）
process.on('exit', scheduleCleanup);
