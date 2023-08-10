#!/bin/sh

if [ -z "$OPTIMIZER_CONFIG_JS" ]; then
  echo "Environment variable OPTIMIZER_CONFIG_JS is not set. Skipping file generation."
else
  # 生成 optimizer.config.js 文件
  echo "Generating optimizer.config.js"
  echo "$OPTIMIZER_CONFIG_JS" > optimizer.config.js
fi

echo "Running yarn install"
yarn install --production=false

# 将第一个参数附加在 yarn cli 后面执行
echo "Running yarn cli $1"
yarn cli $1