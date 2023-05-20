#!/bin/bash

if [ -z "$OPTIMIZER_CONFIG_JS" ]; then
  echo "Environment variable OPTIMIZER_CONFIG_JS is not set. Skipping file generation."
else
  # 生成 optimizer.config.js 文件
  echo "Generating optimizer.config.js"
  echo "$OPTIMIZER_CONFIG_JS" > optimizer.config.js
fi

# 运行 yarn start
echo "Running yarn start"
yarn start