#!/bin/bash
# =========================================================
# 脚本名称: 1git_commit_all.sh
# 功能: git全部提交
# =========================================================

set -e
# 提交信息设置
COMMIT_MSG="tradingview.html中文调整"
############################
# 基础变量设置
############################

# 项目根目录设置
#BASE_DIR="/var/www/${PROJECT_NAME}"
BASE_DIR="$(pwd)"


#COMMIT_MSG="dockercompose文件更新"

echo "提交前仓库状态"
git status

# 提交仓库
echo "git add ."
git add .
echo "git commit -m ${COMMIT_MSG}"
git commit -m "${COMMIT_MSG}"

echo "之后推送到远程仓库只需要运行:"
echo "git push"

echo "当前仓库状态"
git status

# 快速执行
# sudo bash 1git_commit_all.sh && sudo git push
