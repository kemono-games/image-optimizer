#!/bin/sh

if [ -z "$OPTIMIZER_CONFIG_JS" ]; then
  echo "Environment variable OPTIMIZER_CONFIG_JS is not set. Skipping file generation."
else
  # 生成 optimizer.config.js 文件
  echo "Generating optimizer.config.js"
  echo "$OPTIMIZER_CONFIG_JS" > optimizer.config.js
fi

if [ -z "$IS_WORKER" ]; then
  # 如果 IS_WORKER 不存在
  echo "Running server"
  yarn start
else
  # 如果 IS_WORKER 存在
  echo "Running worker"
  yarn start:worker
fi
# 运行 yarn start