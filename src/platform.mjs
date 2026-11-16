// 跨平台路径工具（Windows / Linux / macOS 通用，零依赖）
//
// ★ 为什么需要这个文件：
//   `new URL('..', import.meta.url).pathname` 在 **Windows** 上返回 `/C:/Users/.../`（带前导斜杠），
//   而 `path.resolve('/C:/Users/...')` 在 win32 上会把 `/C:` 当成「根目录下的 C: 目录」，
//   得到 `\C:\Users\...` —— 路径直接失效。Linux/macOS 上恰好正确，所以这个坑只在 Windows 暴露。
//
//   正确做法一律用 `fileURLToPath()`：它会把 `/C:/...` 还原成 `C:\...`，且 POSIX 上等价。
//   同理，判断「本文件是否被当作入口脚本执行」不能用 ``file://${process.argv[1]}``
//   （Windows 的盘符与反斜杠会让字符串永远不相等），要用 `pathToFileURL(process.argv[1])` 比较。
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * 取某个模块文件 URL 的上一级目录（项目根），跨平台安全。
 * @param {string|URL} moduleUrl  通常是 `import.meta.url`
 * @param {number} [up=1]          向上几级（1 = 上一级目录）
 * @returns {string} 绝对路径（Windows 形如 `C:\...`，POSIX 形如 `/...`）
 */
export function projectRoot(moduleUrl, up = 1) {
  // fileURLToPath 是唯一跨平台正确的 URL→路径转换；不要用 .pathname
  let dir = path.dirname(fileURLToPath(moduleUrl));
  for (let i = 1; i < up; i += 1) dir = path.dirname(dir);
  return dir;
}

/**
 * 判断当前模块是否被当作「主程序」直接执行（而非被 import）。
 * 用法：`if (isMainModule(import.meta.url)) main();`
 *
 * ★ 不要写成 `import.meta.url === `file://${process.argv[1]}``：
 *   Windows 上 import.meta.url 是 `file:///C:/a/b.mjs`（三斜杠 + 正斜杠 + 盘符），
 *   而 `file://${process.argv[1]}` 是 `file://C:\a\b.mjs` —— 永不相等，入口逻辑永远不执行。
 * @param {string|URL} moduleUrl
 * @returns {boolean}
 */
export function isMainModule(moduleUrl) {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    // 两侧统一转成 file:// URL 再比，天然吃掉盘符大小写/分隔符差异
    return pathToFileURL(path.resolve(entry)).href === new URL(moduleUrl).href;
  } catch {
    return false;
  }
}

/**
 * 平台相关的「打开浏览器」命令。
 * @param {string} url
 * @returns {{cmd: string, args: string[]}}
 */
export function openBrowserCommand(url) {
  const platform = process.platform;
  if (platform === 'win32') {
    // 第二参数空字符串是必需的：否则 `start` 会把带引号的 URL 当成窗口标题
    return { cmd: 'cmd', args: ['/c', 'start', '', url] };
  }
  if (platform === 'darwin') return { cmd: 'open', args: [url] };
  return { cmd: 'xdg-open', args: [url] }; // Linux / 其他 POSIX
}

/**
 * 当前平台的换行符（供生成脚本文件用；读入时不必关心）。
 * Windows 的 .cmd/.bat 必须是 CRLF，否则部分 cmd 版本会解析异常。
 */
export const EOL = process.platform === 'win32' ? '\r\n' : '\n';

export default { projectRoot, isMainModule, openBrowserCommand, EOL };
