'use strict';
// 启动器随首页一起到达，消除启动器请求悬挂后连重试按钮都无法使用的问题。
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '../dist');
const code = fs.readFileSync(path.join(root, 'startup.js'), 'utf8').replace(/\r\n/g, '\n');
const file = path.join(root, 'index.html');
let html = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const marker = /<!-- 启动器内联开始 -->[\s\S]*?<!-- 启动器内联结束 -->/;
if (!marker.test(html)) throw new Error('首页缺少启动器生成标记');
// 小样式与首页一起到达，避免挂起的样式请求占满同域名连接。
html = html.replace(/<style data-source="([^"]+)">[\s\S]*?<\/style>/g, (_, name) =>
  '<style data-source="' + name + '">\n' + fs.readFileSync(path.join(root, name), 'utf8').replace(/\r\n/g, '\n') + '\n</style>');
html = html.replace(marker, '<!-- 启动器内联开始 -->\n<script>\n' + code.replace(/<\/script/gi, '<\\/script') + '\n</script>\n<!-- 启动器内联结束 -->');
fs.writeFileSync(file, html);
