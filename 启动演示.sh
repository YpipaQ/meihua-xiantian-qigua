#!/usr/bin/env bash
# 梅花易数 —— 启动（Linux / macOS）
#
# 用法（Linux/macOS 都在终端里执行）：
#   ./启动演示.sh
#   bash 启动演示.sh
#   或：node tools/serve.mjs --open
#
# ⚠️ 为什么双击没反应（实测结论，2026-11-16）：
#   Linux 桌面环境普遍把 .sh 关联到**文本编辑器**（本机是 featherpad），
#   双击只是打开源码，不会执行。这是系统 MIME 关联设置，不是脚本问题。
#   实测即使设了 Thunar 的 misc-exec-shell-scripts=true 也无效（Thunar 4.20）。
#
#   ⇒ 请**在终端里跑**这一行：
#        cd /path/to/meihua-xiantian-qigua && ./启动演示.sh
#
#   或者直接双击桌面版（那是可执行文件，不受此限制）：
#        dist-desktop/linux/梅花易数-linux-x64/梅花易数
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "错误：未找到 node。请先安装 Node.js 18 或更高版本。" >&2
  echo "  Ubuntu/Debian: sudo apt install nodejs" >&2
  echo "  macOS:         brew install node" >&2
  # 有图形环境时弹窗提示，避免"双击后什么都没看见"
  if command -v zenity >/dev/null 2>&1; then
    zenity --error --title="梅花易数" --text="未找到 Node.js。\n\n请先安装 Node.js 18 或更高版本：\nhttps://nodejs.org/" 2>/dev/null || true
  fi
  exit 1
fi

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "错误：Node.js 版本为 $NODE_MAJOR，需要 18 或更高。" >&2
  if command -v zenity >/dev/null 2>&1; then
    zenity --error --title="梅花易数" --text="Node.js 版本过低（当前 $NODE_MAJOR），需要 18 或更高。" 2>/dev/null || true
  fi
  exit 1
fi

echo "=================================================="
echo "  Meihua Xiantian Qigua - Demo Server"
echo "  URL:  http://127.0.0.1:8642/web/index.html"
echo "  Press Ctrl+C to stop."
echo "=================================================="
exec node tools/serve.mjs --open
