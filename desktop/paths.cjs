// 桌面端私有目录：所有运行时数据都放这里，**绝不碰系统盘**
// 语义：绿色版 —— 删掉应用目录 = 彻底移除，不留残余。
//
// ⚠️ 关键约束：Electron 默认会往 ~/.config/Electron、~/.cache、/tmp（Windows: %APPDATA%/%TEMP%）
//    写 userData/sessionData/cache/logs/crashDumps。实测这些**必须**全部重定向，
//    少重定向一层就会有残留（详见 scratch/meihua-desktop-poc/DESKTOP-PLAN.md §1.2）。
const path = require('node:path');
const fs = require('node:fs');

/** 应用根目录（打包后 = 可执行文件所在目录的上一级 resources 的上一级；开发时 = 项目根） */
function appRoot() {
  // app.getAppPath() 在打包后指向 .../resources/app.asar 或 .../resources/app
  // 我们要的是「可执行文件身边」，用 process.execPath 的目录更准（绿色版语义）
  const { app } = require('electron');
  const exeDir = path.dirname(process.execPath);
  // 开发模式（electron .）：execPath 是 node_modules/electron/dist/electron
  if (/node_modules[\\/]electron[\\/]dist/.test(exeDir)) {
    return path.resolve(__dirname, '..');
  }
  return exeDir;
}

/** 私有运行时目录 */
function runtimeDir() {
  return path.join(appRoot(), '.runtime');
}

/**
 * 把 Electron 所有会写盘的路径都重定向到私有目录。
 * ★ 必须在 app.whenReady() **之前**调用（setPath 在 ready 后部分键会失效）。
 * @returns {string} runtimeDir
 */
function redirectAllPaths() {
  const { app } = require('electron');
  const RT = runtimeDir();

  // 启动即清：上次若是被强杀，.runtime 可能残留 —— 覆盖式清理，保证每次起跑都干净
  try {
    fs.rmSync(RT, { recursive: true, force: true });
  } catch {}
  fs.mkdirSync(RT, { recursive: true });

  const P = (n) => path.join(RT, n);

  // ---- 第一层：Electron 自身的路径 ----
  // 注意：shaderCache / diskCache 不是合法 key（setPath 会抛），它们由命令行开关控制
  for (const [key, sub] of [
    ['userData', 'ud'],
    ['sessionData', 'sd'],
    ['temp', 'tmp'],
    ['logs', 'logs'],
    ['crashDumps', 'crash'],
    ['cache', 'cache'],
    ['userCache', 'ucache'],
  ]) {
    try {
      app.setPath(key, P(sub));
    } catch {
      /* 某些平台/版本不支持该 key，忽略（下面命令行开关兜底） */
    }
  }

  // ---- 第二层：Chromium 侧（独立于 setPath，必须单独指定）----
  app.commandLine.appendSwitch('user-data-dir', P('ud'));
  app.commandLine.appendSwitch('disk-cache-dir', P('cache'));
  app.commandLine.appendSwitch('crash-dumps-dir', P('crash'));
  app.commandLine.appendSwitch('disk-cache-size', '1'); // 近似关闭磁盘缓存

  // ---- 第三层：禁止外溢的功能 ----
  app.commandLine.appendSwitch('disable-breakpad');
  app.commandLine.appendSwitch('disable-crash-reporter');
  app.commandLine.appendSwitch('no-first-run');
  app.commandLine.appendSwitch('disable-background-networking');
  app.commandLine.appendSwitch('disable-component-update');
  app.commandLine.appendSwitch('disable-sync');
  app.commandLine.appendSwitch('disable-features', 'OptimizationHints,MediaRouter,Translate');

  // ---- 第四层：环境变量（部分子进程只认 env）----
  process.env.TMPDIR = P('tmp');
  process.env.TEMP = P('tmp');
  process.env.TMP = P('tmp');
  process.env.XDG_CACHE_HOME = P('xdg-cache');
  process.env.XDG_CONFIG_HOME = P('xdg-config');
  process.env.XDG_DATA_HOME = P('xdg-data');
  // Windows 的 APPDATA/LOCALAPPDATA 是 Electron 默认根，一并改到私有目录
  process.env.APPDATA = P('appdata');
  process.env.LOCALAPPDATA = P('localappdata');

  return RT;
}

module.exports = { appRoot, runtimeDir, redirectAllPaths };
