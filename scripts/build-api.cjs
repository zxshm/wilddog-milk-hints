'use strict';
// 只生成后端产物，保留 GitHub Pages 的游戏文件。
const fs = require('node:fs');
fs.mkdirSync('dist/server', { recursive: true });
fs.mkdirSync('dist/.openai', { recursive: true });
fs.copyFileSync('worker/index.mjs', 'dist/server/index.js');
fs.copyFileSync('.openai/hosting.json', 'dist/.openai/hosting.json');
console.log('排行榜后端构建完成');
