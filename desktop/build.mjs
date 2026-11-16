// 桌面端打包脚本：产出可直接双击运行的可执行包（Windows / Linux / macOS）
//
// 用法：
//   node desktop/build.mjs             # 打当前平台
//   node desktop/build.mjs --all       # 打 Linux + Windows
//   node desktop/build.mjs --win       # 只打 Windows
//   node desktop/build.mjs --linux     # 只打 Linux
//
// 产物：dist-desktop/<平台>/梅花易数/
//
// 设计要点：
//   · 只把运行必需的塞进包：desktop/ + web/ + src/ + data/ + package.json
//   · 排除 tests/docs/tools/scripts —— 否则包大一倍，还暴露内部资料
//   · locales 精简（Electron 自带 50 种语言包约 40M，中文用户用不上）
import { packager } from '@electron/packager';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist-desktop');
const APP_NAME = '梅花易数';

const argv = process.argv.slice(2);
const ALL = argv.includes('--all');
const ONLY_WIN = argv.includes('--win');
const ONLY_LINUX = argv.includes('--linux');

let targets;
if (ALL) targets = ['linux', 'win32'];
else if (ONLY_WIN) targets = ['win32'];
else if (ONLY_LINUX) targets = ['linux'];
else targets = [process.platform];

const arch = 'x64';

// 打包时排除（相对项目根，posix 风格）
const IGNORE = [
  /^\/tests($|\/)/,
  /^\/docs($|\/)/,
  /^\/tools($|\/)/,
  /^\/scripts($|\/)/,
  /^\/dist-desktop($|\/)/,
  /^\/scratch($|\/)/,
  /^\/node_modules($|\/)/,
  /^\/\.runtime($|\/)/,
  /^\/\.git($|\/)/,
  /^\/\.gitignore$/,
  /^\/PLAN\.md$/,
  /^\/CHANGELOG\.md$/,
  // 语料源与校对参照：桌面端运行时不需要（仅生成器用，生成器已排除）
  /^\/data\/(ref-corpus|proofread-sources)($|\/)/,
  // 打包脚本自身不必进包
  /^\/desktop\/build\.mjs$/,
];

function log(msg) {
  console.log(`[build] ${msg}`);
}

/** 找 Electron 二进制缓存目录（@electron/get 的默认缓存根） */
function findElectronCache() {
  const os = process.platform;
  if (os === 'win32') return path.join(process.env.LOCALAPPDATA || '', 'electron', 'Cache');
  if (os === 'darwin') return path.join(process.env.HOME || '', 'Library', 'Caches', 'electron');
  return path.join(process.env.HOME || '', '.cache', 'electron');
}

/** 精简 locales：只留简繁中 + 英 */
function pruneLocales(appOutDir) {
  const localesDir = path.join(appOutDir, 'locales');
  if (!fs.existsSync(localesDir)) return 0;
  const keep = new Set(['zh-CN.pak', 'zh-TW.pak', 'en-US.pak']);
  let removed = 0;
  for (const f of fs.readdirSync(localesDir)) {
    if (!keep.has(f)) {
      try {
        fs.rmSync(path.join(localesDir, f), { force: true });
        removed += 1;
      } catch {}
    }
  }
  return removed;
}

/** 包内说明（用户能读到的唯一"安装"痕迹） */
function writeReadme(appOutDir) {
  const txt = `${APP_NAME} · 先天起卦法
=====================================

启动：
  Windows  → 双击「${APP_NAME}.exe」
  Linux    → 运行「${APP_NAME}」或「${APP_NAME}.sh」
  macOS    → 打开「${APP_NAME}.app」

关于「零痕迹」：
  · 本程序是绿色版，不需要安装；删掉整个目录即彻底移除。
  · 运行时的临时数据全部写在本目录下的 .runtime 文件夹，退出时自动删除。
  · 不写注册表、不写系统盘（~/.config、%APPDATA%、%TEMP% 均不落文件）。
  · 不联网、不上传任何数据。

如果程序被强制结束（任务管理器 / kill -9）：
  .runtime 可能残留在本目录内（只影响本目录，不碰系统盘），下次启动会自动清理。

版本与更新日志见应用内「帮助 → 关于」。
`;
  fs.writeFileSync(path.join(appOutDir, '使用说明.txt'), txt, 'utf8');
}

function dirSize(d) {
  let total = 0;
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else total += fs.statSync(p).size;
    }
  };
  walk(d);
  return total;
}

async function buildOne(platform) {
  const outDir = path.join(OUT, platform);
  fs.rmSync(outDir, { recursive: true, force: true });

  log(`开始打包 ${platform}-${arch} …`);
  const t0 = Date.now();
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

  const paths = await packager({
    dir: ROOT,
    out: outDir,
    name: APP_NAME,
    platform,
    arch,
    asar: true,
    overwrite: true,
    prune: true,
    appVersion: pkg.version,
    // 离线优先：Electron 二进制走本地缓存（已装过一次就有），没有再走国内镜像
    // （直连 github/npmjs 在这台机器上会 ECONNREFUSED，实测）
    download: {
      cacheRoot: findElectronCache(),
      mirrorOptions: {
        mirror: process.env.ELECTRON_MIRROR || 'https://npmmirror.com/mirrors/electron/',
      },
    },
    ignore: IGNORE,
  });

  const appOut = paths[0];
  const removed = pruneLocales(appOut);
  writeReadme(appOut);
  const size = dirSize(appOut);

  log(
    `完成 ${platform}：${path.relative(ROOT, appOut)}\n` +
      `        精简 locales ${removed} 个 | 体积 ${(size / 1024 / 1024).toFixed(1)} MB | ` +
      `耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`
  );
  return { platform, appOut, size };
}

// ---- 主流程 ----
fs.mkdirSync(OUT, { recursive: true });
const results = [];
for (const p of targets) results.push(await buildOne(p));

log('');
log('全部完成：');
for (const r of results) {
  log(`  ${r.platform.padEnd(6)} ${(r.size / 1024 / 1024).toFixed(1)} MB  ${path.relative(ROOT, r.appOut)}`);
}
log('');
log('零痕迹：运行数据写 <应用目录>/.runtime，退出自动清理（详见包内 使用说明.txt）');
