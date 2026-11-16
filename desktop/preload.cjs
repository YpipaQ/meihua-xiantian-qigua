// 极窄 preload：只暴露桌面端需要的那一点点能力
// 原则：不暴露 fs / 路径 / 任意 IPC —— 网页代码不该有桌面特权。
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('__DESKTOP__', {
  // 仅一个标记，用于 UI 判断"是否在桌面端"(例如隐藏"下载txt"换成"保存到本机")
  isDesktop: true,
  platform: process.platform,
  version: process.env.npm_package_version || '',
});
