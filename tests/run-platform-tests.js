// 跨平台兼容测试（Windows / Linux / macOS）：node tests/run-platform-tests.js
// 锁的是「只在某个平台才暴露」的四类坑 —— 这类 bug 在本机（Linux）写代码时看不见，
// 所以必须用断言把它们钉住，而不是靠人工记得。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { projectRoot, isMainModule, openBrowserCommand, EOL } from '../src/platform.mjs';
import { DATA_MANIFEST } from '../src/catalog.js';

const ROOT = projectRoot(import.meta.url, 2);
let pass = 0;
let fail = 0;
const failures = [];
function check(cond, msg) {
  if (cond) pass += 1;
  else { fail += 1; failures.push(msg); }
}

// ================= 1) projectRoot 正确性 =================
{
  check(projectRoot(import.meta.url, 2) === ROOT, 'projectRoot(up=2) = 项目根');
  check(projectRoot(import.meta.url, 1) === path.join(ROOT, 'tests'), 'projectRoot(up=1) = 本文件所在目录');
  check(path.isAbsolute(ROOT), 'projectRoot 返回绝对路径');
  // 关键：不得出现 Windows 上那种「\C:\...」畸形形式
  check(!/^[\\/][A-Za-z]:/.test(ROOT), '★路径不得是 "/C:..." 形态（.pathname 误用的典型症状）');
  check(fs.existsSync(path.join(ROOT, 'package.json')), '项目根下能找到 package.json');
}

// ================= 2) 全仓不得再用 .pathname 做路径 =================
{
  const scanDirs = ['src', 'tools', 'tests', 'scripts'];
  const bad = [];
  for (const d of scanDirs) {
    for (const name of fs.readdirSync(path.join(ROOT, d))) {
      if (!/\.(mjs|js)$/.test(name)) continue;
      const p = path.join(ROOT, d, name);
      const src = fs.readFileSync(p, 'utf8');
      // 允许出现在注释里（作为反例说明），故按行过滤
      for (const line of src.split('\n')) {
        if (/^\s*(\/\/|\*)/.test(line)) continue;
        if (/new URL\([^)]*import\.meta\.url\)\.pathname/.test(line)) bad.push(`${d}/${name}`);
      }
    }
  }
  check(bad.length === 0, `★无 .pathname 误用（违规：${bad.join(', ') || '无'}）`);
}

// ================= 3) 入口脚本判定（Windows 下 file:// 拼接会失败）=================
{
  const bad = [];
  for (const d of ['tools', 'scripts', 'src']) {
    for (const name of fs.readdirSync(path.join(ROOT, d))) {
      if (!/\.(mjs|js)$/.test(name)) continue;
      const src = fs.readFileSync(path.join(ROOT, d, name), 'utf8');
      for (const line of src.split('\n')) {
        if (/^\s*(\/\/|\*)/.test(line)) continue;
        // `file://${process.argv[1]}` 在 Windows 上永不相等
        if (/import\.meta\.url\s*===\s*`file:\/\/\$\{process\.argv\[1\]\}`/.test(line)) bad.push(`${d}/${name}`);
      }
    }
  }
  check(bad.length === 0, `★无 file:// 拼接式入口判定（违规：${bad.join(', ') || '无'}）`);
}

// ================= 4) isMainModule 行为 =================
{
  // 注意：本测试文件自身就是入口脚本（node tests/xxx.js 直接执行），
  // 所以 isMainModule(本文件) 应为 **true**；要验「被 import 时为 false」得用**别的模块**。
  check(isMainModule(import.meta.url) === true, 'isMainModule：本文件被直接执行时返回 true');
  check(isMainModule(pathToFileURL(path.join(ROOT, 'src', 'platform.mjs')).href) === false, 'isMainModule：别的模块（非入口）返回 false');
  // 构造一个真实的临时入口脚本，跑起来验证「被直接执行时为 true」
  const tmp = path.join(ROOT, 'tests', '.tmp-main-check.mjs');
  fs.writeFileSync(
    tmp,
    `import { isMainModule } from '../src/platform.mjs';\n` +
      `console.log(isMainModule(import.meta.url) ? 'TRUE' : 'FALSE');\n`,
    'utf8'
  );
  try {
    const out = (await import('node:child_process')).execFileSync(process.execPath, [tmp], { encoding: 'utf8' }).trim();
    check(out === 'TRUE', '★isMainModule：被直接执行时返回 true（Windows 上旧写法会得 false）');
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

// ================= 5) 打开浏览器命令按平台分派 =================
{
  const cmds = { win32: openBrowserCommand, darwin: openBrowserCommand, linux: openBrowserCommand };
  check(typeof cmds.linux === 'function', 'openBrowserCommand 可调用');
  // 当前平台下应返回非空命令
  const cur = openBrowserCommand('http://127.0.0.1:8642/web/index.html');
  check(typeof cur.cmd === 'string' && cur.cmd.length > 0, '返回非空命令名');
  check(Array.isArray(cur.args) && cur.args.includes('http://127.0.0.1:8642/web/index.html'), '参数含目标 URL');
  // 源码层面确认三平台都覆盖
  const psrc = fs.readFileSync(path.join(ROOT, 'src', 'platform.mjs'), 'utf8');
  check(/win32/.test(psrc) && /darwin/.test(psrc) && /xdg-open/.test(psrc), '源码覆盖 win32/darwin/linux 三平台');
}

// ================= 6) 启动脚本：双平台齐备 + 换行符正确 =================
{
  const cmd = path.join(ROOT, '启动演示.cmd');
  const sh = path.join(ROOT, '启动演示.sh');
  check(fs.existsSync(cmd), '存在 Windows 启动脚本（启动演示.cmd）');
  check(fs.existsSync(sh), '存在 Linux/macOS 启动脚本（启动演示.sh）');

  // .cmd 必须 CRLF，否则部分 cmd 版本解析异常
  const cbuf = fs.readFileSync(cmd);
  const crlf = (cbuf.toString('binary').match(/\r\n/g) || []).length;
  const bareLf = (cbuf.toString('binary').match(/(?<!\r)\n/g) || []).length;
  check(crlf > 0 && bareLf === 0, `★启动演示.cmd 为纯 CRLF（CRLF ${crlf} / 裸 LF ${bareLf}）`);

  // .sh 必须 LF（CRLF 会让 bash 报 $'\r' 错误）且可执行
  const sbuf = fs.readFileSync(sh, 'utf8');
  check(!sbuf.includes('\r'), '★启动演示.sh 为纯 LF（含回车符会导致 bash 报错）');
  check(sbuf.startsWith('#!'), '.sh 有 shebang');
  const mode = fs.statSync(sh).mode;
  check((mode & 0o111) !== 0, `★启动演示.sh 有可执行位（mode ${(mode & 0o777).toString(8)}）`);

  // 两个脚本都必须调用同一个入口
  check(fs.readFileSync(cmd, 'utf8').includes('serve.mjs'), '.cmd 调用 tools/serve.mjs');
  check(sbuf.includes('serve.mjs'), '.sh 调用 tools/serve.mjs');
  // .sh 要做 Node 版本检查（对新手友好）
  check(/node/i.test(sbuf) && /18/.test(sbuf), '.sh 检查 Node 版本 ≥18');
}

// ================= 7) 数据文件名在 Windows 上合法 =================
{
  // Windows 非法字符：< > : " / \ | ? *  以及保留名 CON/PRN/AUX/NUL/COM1..9/LPT1..9
  const ILLEGAL = /[<>:"|?*]/;
  const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
  const bad = [];
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
      if (name.name === '.git') continue;
      const p = path.join(dir, name.name);
      if (ILLEGAL.test(name.name) || RESERVED.test(name.name)) bad.push(path.relative(ROOT, p));
      // 结尾的点或空格在 Windows 上会被静默丢弃
      if (/[. ]$/.test(name.name)) bad.push(path.relative(ROOT, p));
      if (name.isDirectory()) walk(p);
    }
  };
  walk(ROOT);
  check(bad.length === 0, `★无 Windows 非法文件名（违规：${bad.slice(0, 5).join(', ') || '无'}）`);

  // 大小写冲突（Windows 大小写不敏感，两个仅大小写不同的文件会互相覆盖）
  const seen = new Map();
  const dup = [];
  const walk2 = (dir) => {
    for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
      if (name.name === '.git') continue;
      const p = path.join(dir, name.name);
      const rel = path.relative(ROOT, p).toLowerCase();
      if (seen.has(rel)) dup.push(`${seen.get(rel)} / ${path.relative(ROOT, p)}`);
      else seen.set(rel, path.relative(ROOT, p));
      if (name.isDirectory()) walk2(p);
    }
  };
  walk2(ROOT);
  check(dup.length === 0, `★无大小写冲突文件名（Windows 不区分大小写；冲突：${dup.slice(0, 3).join(', ') || '无'}）`);
}

// ================= 8) DATA_MANIFEST 路径用正斜杠且可解析 =================
{
  const badSlash = DATA_MANIFEST.filter((m) => m.path.includes('\\'));
  check(badSlash.length === 0, 'manifest 路径统一正斜杠（反斜杠在 POSIX 上不是分隔符）');
  const missing = DATA_MANIFEST.filter((m) => !m.optional && !fs.existsSync(path.join(ROOT, m.path)));
  check(missing.length === 0, `manifest 必需文件都存在（缺：${missing.map((m) => m.path).join(', ') || '无'}）`);
}

// ================= 9) 源码/脚本一律 UTF-8 且无 BOM =================
{
  const bad = [];
  const dirs = ['src', 'tools', 'tests', 'scripts', 'web', 'data'];
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, name.name);
      if (name.isDirectory()) { walk(p); continue; }
      if (!/\.(mjs|js|json|css|html|md)$/.test(name.name)) continue;
      const buf = fs.readFileSync(p);
      // UTF-8 BOM 会让 Node/浏览器把首字符读成 \uFEFF
      if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) bad.push(path.relative(ROOT, p));
    }
  };
  for (const d of dirs) walk(path.join(ROOT, d));
  check(bad.length === 0, `★无 UTF-8 BOM 文件（BOM 会让首字符异常；违规：${bad.slice(0, 5).join(', ') || '无'}）`);
}

// ================= 10) 生成器跨工具数据保真（实测过的丢数据 bug）=================
{
  // proofread-classic.mjs 曾把 crosscheck-shiyi.mjs 写的 `shiyi` 段整段抹掉。
  // 锁：其 OWNED_KEYS 之外的外来键必须原样保留。
  const src = fs.readFileSync(path.join(ROOT, 'tools', 'proofread-classic.mjs'), 'utf8');
  check(/OWNED_KEYS/.test(src), '★proofread-classic 有「自有键」白名单（防跨工具覆盖）');
  check(/existing\)\)\s*\{?[\s\S]{0,200}out\[k\]\s*=\s*existing\[k\]/.test(src), '★外来键被原样搬回 out');
  // 当前数据文件里 shiyi 段确实存在（交叉校验成果未被抹）
  const pf = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'zhouyi-proofread.json'), 'utf8'));
  check(!!pf.shiyi && pf.shiyi.stats && pf.shiyi.stats.agree > 0, '★data/zhouyi-proofread.json 保留 shiyi 交叉校验段');
}

console.log(`跨平台兼容测试：${pass} 项通过，${fail} 项失败`);
if (fail) {
  console.log('失败项：');
  failures.forEach((f) => console.log('  ✗ ' + f));
  process.exit(1);
}
console.log('PLATFORM TESTS PASSED');
