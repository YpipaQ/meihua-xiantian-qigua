// 桌面端契约测试：node tests/run-desktop-tests.js
// 覆盖：零痕迹实现要点、跨平台路径、打包脚本配置、依赖声明
// ★ 这些坑都是「调试时踩过、且不写断言就会再踩」的，逐条钉住。
import fs from 'node:fs';
import path from 'node:path';
import { projectRoot } from '../src/platform.mjs';

const ROOT = projectRoot(import.meta.url, 2);
let pass = 0;
let fail = 0;
const failures = [];
function check(cond, msg) {
  if (cond) pass += 1;
  else { fail += 1; failures.push(msg); }
}
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

// ================= 1) 文件齐备 =================
{
  for (const f of ['desktop/main.cjs', 'desktop/preload.cjs', 'desktop/paths.cjs', 'desktop/cleanup.cjs', 'desktop/build.mjs']) {
    check(exists(f), `桌面端文件存在：${f}`);
  }
}

// ================= 2) ★零痕迹：必须重定向的路径全覆盖 =================
{
  const paths = read('desktop/paths.cjs');
  // 实测：少重定向任何一层都会在系统盘留文件
  for (const key of ['userData', 'sessionData', 'temp', 'logs', 'crashDumps', 'cache']) {
    check(paths.includes(`'${key}'`), `★paths.cjs 重定向了 app.setPath('${key}')`);
  }
  // Chromium 侧必须单独追加（setPath 管不到）
  check(/appendSwitch\('user-data-dir'/.test(paths), '★命令行 user-data-dir 重定向');
  check(/appendSwitch\('disk-cache-dir'/.test(paths), '★命令行 disk-cache-dir 重定向');
  check(/disable-breakpad/.test(paths), '★禁用 breakpad（否则写 Crashpad 目录）');
  // 环境变量层（部分子进程只认 env）
  for (const envKey of ['TMPDIR', 'TEMP', 'TMP', 'XDG_CACHE_HOME', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME']) {
    check(paths.includes(envKey), `环境变量 ${envKey} 重定向`);
  }
  // Windows 专用根目录
  check(paths.includes('APPDATA') && paths.includes('LOCALAPPDATA'), 'Windows APPDATA/LOCALAPPDATA 重定向');
  // 私有目录在应用目录内（不是系统盘）
  check(/runtimeDir\(\)[\s\S]{0,200}path\.join\(appRoot\(\), '\.runtime'\)/.test(paths), '★.runtime 位于应用目录内');
}

// ================= 3) ★退出清理：必须用 ELECTRON_RUN_AS_NODE =================
{
  const main = read('desktop/main.cjs');
  // 坑1：Electron 里 process.execPath 是 electron 二进制，直接跑清理脚本会再开一个实例
  check(/ELECTRON_RUN_AS_NODE/.test(main), '★清理进程用 ELECTRON_RUN_AS_NODE（不依赖系统 node）');
  check(/spawn\(process\.execPath/.test(main), '★用 process.execPath + RUN_AS_NODE，而非 PATH 里的 node');
  check(/detached:\s*true/.test(main), '清理进程 detached（父进程退出后仍能跑）');
  check(/unref\(\)/.test(main), '清理进程 unref（不阻塞退出）');
  // detached 必须有：否则 Electron 退出会带走子进程
  check(exists('desktop/cleanup.cjs'), 'cleanup.cjs 存在');
  const cleanup = read('desktop/cleanup.cjs');
  check(/setInterval/.test(cleanup), '★清理脚本用轮询重试（Chromium 延迟写盘，一次删不干净）');
  check(/MAX_TRIES|tries >=/.test(cleanup), '清理有重试上限（不会永久挂住）');
}

// ================= 4) ★单实例锁必须在路径重定向之前 =================
{
  const main = read('desktop/main.cjs');
  // ★ 注意：indexOf 会命中注释里的同名文本（我第一版就栽在这 —— lock@902 其实是注释）。
  //   必须跳过注释行，只找**实际调用**。
  const codeLines = main.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l));
  const code = codeLines.join('\n');
  const lockIdx = code.search(/\brequestSingleInstanceLock\(/);
  const redirectIdx = code.search(/^const RT = redirectAllPaths\(\);/m);
  check(lockIdx > 0, '使用 requestSingleInstanceLock');
  check(
    lockIdx < redirectIdx,
    `★取锁在重定向之前（实测：反了会让打包版 SIGTRAP；lock@${lockIdx} redirect@${redirectIdx}）`
  );
  // 锁失败要容错（不能阻断启动）
  check(/try\s*\{[^}]*requestSingleInstanceLock/.test(main), '取锁包在 try/catch（失败不阻断启动）');
}

// ================= 5) Linux 沙箱降级 =================
{
  const main = read('desktop/main.cjs');
  check(/process\.platform === 'linux'/.test(main), 'Linux 沙箱处理按平台分支');
  check(/chrome-sandbox/.test(main), '检测 chrome-sandbox 权限');
  // ★ 关键：appendSwitch 太晚，必须往 argv 塞
  check(/process\.argv\.push\('--no-sandbox'\)/.test(main), '★往 process.argv 注入 --no-sandbox（appendSwitch 在打包版太晚）');
  // 不能无条件降级：root 或权限正确时应保留沙箱
  check(/sandboxOk|isRoot/.test(main), '沙箱降级有条件（root/权限正确时不降级）');
}

// ================= 6) 安全基线 =================
{
  const preload = read('desktop/preload.cjs');
  check(/contextBridge\.exposeInMainWorld/.test(preload), 'preload 用 contextBridge');
  check(!/require\('node:fs'\)/.test(preload), '★preload 不暴露 fs');
  check(!/require\('node:child_process'\)/.test(preload), '★preload 不暴露 child_process');
  check(!/exposeInMainWorld\([^)]*ipcRenderer/.test(preload), '★preload 不暴露 ipcRenderer');

  const main = read('desktop/main.cjs');
  check(/nodeIntegration:\s*false/.test(main), 'nodeIntegration=false');
  check(/contextIsolation:\s*true/.test(main), 'contextIsolation=true');
  check(/setWindowOpenHandler/.test(main), '外部链接拦截（交给系统浏览器）');
  check(/will-navigate/.test(main), '导航拦截');
}

// ================= 7) 自定义协议（桌面端用 app:// 而非 file://） =================
{
  const main = read('desktop/main.cjs');
  // file:// 页面无权 fetch 本地 JSON，必须走协议
  check(/registerSchemesAsPrivileged/.test(main), '★注册 app 协议特权（supportFetchAPI）');
  check(/protocol\.handle\('app'/.test(main), 'app 协议 handler 存在');
  check(/app:\/\/local\/web\/index\.html/.test(main), '入口用 app://local/web/index.html');
  check(/startsWith\(APP_ROOT\)/.test(main), '★路径穿越防护（不得跳出应用目录）');
}

// ================= 8) 打包脚本 =================
{
  const build = read('desktop/build.mjs');
  check(/@electron\/packager/.test(build), '用 @electron/packager');
  check(/asar:\s*true/.test(build), 'asar 打包（减少文件数、加快启动）');
  // 必须排除内部资料
  for (const excl of ['tests', 'docs', 'tools', 'scripts']) {
    check(new RegExp(`\\^\\\\/${excl}`).test(build), `打包排除 /${excl}`);
  }
  // locales 精简（Electron 自带 50 种语言包，约 40M）
  check(/pruneLocales/.test(build), '精简 locales');
  check(/zh-CN\.pak/.test(build), '保留 zh-CN');
  // 离线优先（这台机器直连 github 会 ECONNREFUSED，实测）
  check(/mirrorOptions|mirror:/.test(build), '★配置了镜像（离线/国内环境可用）');
  check(/cacheRoot/.test(build), '使用本地缓存优先');
  // 平台参数
  check(/--all|--win|--linux/.test(build), '支持多平台参数');
}

// ================= 9) package.json 接线 =================
{
  const pkg = JSON.parse(read('package.json'));
  check(pkg.main === 'desktop/main.cjs', 'package.json main 指向 desktop/main.cjs');
  check(pkg.devDependencies && pkg.devDependencies.electron, 'devDependencies 含 electron');
  check(pkg.devDependencies && pkg.devDependencies['@electron/packager'], 'devDependencies 含 @electron/packager');
  check(pkg.scripts && pkg.scripts.desktop, '有 npm run desktop');
  check(pkg.scripts && pkg.scripts['desktop:build'], '有 npm run desktop:build');
}

// ================= 10) 网页版不受影响（必须继续可用） =================
{
  check(exists('web/index.html'), '网页版入口仍在');
  check(exists('tools/serve.mjs'), '网页版本地服务器仍在');
  check(exists('启动演示.cmd') && exists('启动演示.sh'), '双平台启动脚本仍在');
  const serve = read('tools/serve.mjs');
  check(/web\/index\.html/.test(serve), 'serve.mjs 仍指向网页版入口');
}

// ================= 11) 产物不进版本库 =================
{
  const gi = read('.gitignore');
  check(/dist-desktop/.test(gi), '.gitignore 排除 dist-desktop（体积大）');
  check(/node_modules/.test(gi), '.gitignore 排除 node_modules');
  check(/\.runtime/.test(gi), '.gitignore 排除 .runtime');
}

console.log(`桌面端契约测试：${pass} 项通过，${fail} 项失败`);
if (fail) {
  console.log('失败项：');
  failures.forEach((f) => console.log('  ✗ ' + f));
  process.exit(1);
}
console.log('DESKTOP TESTS PASSED');
