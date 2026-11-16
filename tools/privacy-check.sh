#!/usr/bin/env bash
# 发布前隐私体检 —— 逐类扫描，任一命中即需人工确认
#
# 用法：
#   bash tools/privacy-check.sh            # 扫工作区
#   bash tools/privacy-check.sh --history  # 额外扫 git 全历史
#
# 设计原则：
#   · 精确匹配真令牌格式，**不用宽泛正则**（否则 disk-cache / task- 都会被误报成 sk-）
#   · 每类都给出「命中数 + 样例」，便于判断是误报还是真问题
#   · 归档文档也扫（历史上曾把本机路径写进去过）
set -uo pipefail
cd "$(dirname "$0")/.."

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; NC='\033[0m'
FAIL=0

# 扫描范围：排除依赖与构建产物
EXCLUDES=(--exclude-dir=node_modules --exclude-dir=dist-desktop --exclude-dir=release-assets
          --exclude-dir=.git --exclude-dir=ref-corpus
          --exclude=privacy-check.sh)   # 排除自身：规则里的字面量会自匹配

scan() {
  local label="$1" pattern="$2"
  local out
  out=$(grep -rInE "$pattern" . "${EXCLUDES[@]}" 2>/dev/null \
        | grep -vE "solarlunar|JJonline@|example\.(com|org)|@localhost" \
        | head -6)
  if [ -z "$out" ]; then
    printf "  ${GREEN}✓${NC} %-28s 0\n" "$label"
  else
    local n
    n=$(printf '%s\n' "$out" | wc -l)
    printf "  ${RED}✗${NC} %-28s %s 处\n" "$label" "$n"
    printf '%s\n' "$out" | sed 's/^/      /'
    FAIL=$((FAIL+1))
  fi
}

echo "=========== 发布前隐私体检 ==========="
echo
echo "[1] 本机身份"
scan "本机用户名"            "ypipaq"
scan "POSIX 家目录绝对路径"   "/home/[a-z]+/"
scan "Windows 用户目录"       "C:\\\\\\\\Users\\\\\\\\[A-Za-z]"
scan "macOS 用户目录"         "/Users/[A-Za-z]+/"
scan "内部工作区路径"         "/ias/|共享文件夹|MX共享"

echo
echo "[2] 联系方式"
scan "邮箱（排除第三方署名）"  "[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\\\.[A-Za-z]{2,}"
scan "中国大陆手机号"         "1[3-9][0-9]{9}"
scan "身份证号"              "[0-9]{17}[0-9Xx]"

echo
echo "[3] 网络与设备"
scan "内网 IP"               "192\\\\.168\\\\.[0-9]+\\\\.[0-9]+|10\\\\.[0-9]{1,3}\\\\.[0-9]{1,3}\\\\.[0-9]{1,3}|172\\\\.(1[6-9]|2[0-9]|3[01])\\\\.[0-9]+\\\\.[0-9]+"
scan "内部服务端口"           "127\\\\.0\\\\.0\\\\.1:3080|:7897"

echo
echo "[4] 凭据（精确格式，避免误报）"
scan "GitHub token"          "gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}"
scan "OpenAI/AWS/GCP 密钥"    "sk-[A-Za-z0-9]{32,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}"
scan "Slack token"           "xox[baprs]-[A-Za-z0-9-]{10,}"
scan "私钥文件"               "BEGIN [A-Z ]*PRIVATE KEY"

echo
echo "[5] 第三方站名（不再为转载站引流）"
scan "已移除的转载站名"        "汉运网|hanyunshi"

if [ "${1:-}" = "--history" ]; then
  echo
  echo "[6] git 全历史"
  hist=$(git log --all --format="%s%n%b" 2>/dev/null | grep -cE "(/home/[a-z]+/|ypipaq@|共享文件夹)")
  if [ "$hist" -eq 0 ]; then
    printf "  ${GREEN}✓${NC} %-28s 0\n" "提交信息隐私"
  else
    printf "  ${RED}✗${NC} %-28s %s 处\n" "提交信息隐私" "$hist"
    FAIL=$((FAIL+1))
  fi
  tok=$(git log --all -p 2>/dev/null | grep -cE "gh[pousr]_[A-Za-z0-9]{30,}|sk-[A-Za-z0-9]{32,}")
  if [ "$tok" -eq 0 ]; then
    printf "  ${GREEN}✓${NC} %-28s 0\n" "历史中的令牌"
  else
    printf "  ${RED}✗${NC} %-28s %s 处\n" "历史中的令牌" "$tok"
    FAIL=$((FAIL+1))
  fi
fi

echo
if [ "$FAIL" -eq 0 ]; then
  echo -e "${GREEN}体检通过：未发现隐私泄露${NC}"
  exit 0
else
  echo -e "${YELLOW}发现 $FAIL 类需要人工确认的命中 —— 逐条看上面对应行${NC}"
  echo "（部分是误报，例如代码里的 C:\\\\Users 反例注释；确认后可在本脚本加豁免）"
  exit 1
fi
