#!/usr/bin/env node
// 退出后的延迟清理（**由独立 node 进程运行**，不是在 Electron 里同步删）
//
// 为什么必须独立进程：
//   app.quit() 之后 Chromium 子进程仍在写 Session Storage（实测残留 sd 目录），
//   will-quit 里同步 rmSync 删不干净。必须等 Electron 进程树真正退出后再删。
//
// 为什么必须用「真正的 node」：
//   Electron 里 process.execPath 指向 electron 二进制，用它跑本脚本会变成再开一个 Electron 实例。
//   main.js 会优先找系统 node；找不到则退化为「下次启动时清理」（main.js 启动即 rmSync）。
//
// 用法：node cleanup.cjs <runtimeDir>
const fs = require('node:fs');
const path = require('node:path');

const RT = process.argv[2];
if (!RT) process.exit(0);

const MAX_TRIES = 30;
const INTERVAL = 150;
let tries = 0;

const timer = setInterval(() => {
  tries += 1;
  try {
    fs.rmSync(RT, { recursive: true, force: true, maxRetries: 1 });
  } catch {
    /* 文件还被占用，下一轮再试 */
  }
  if (!fs.existsSync(RT) || tries >= MAX_TRIES) {
    clearInterval(timer);
    process.exit(0);
  }
}, INTERVAL);
