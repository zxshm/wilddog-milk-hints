'use strict';
// 关闭终端输入回显，将部署输入直接传给 SSH 进程；不保存凭据。
const { spawn } = require('node:child_process');
const path = require('node:path');
const child = spawn(process.env.PYTHON_BIN || 'python', [path.join(__dirname, 'remote-session.py'), ...process.argv.slice(2)], { stdio: ['pipe', 'inherit', 'inherit'], windowsHide: true });
if (process.stdin.isTTY) process.stdin.setRawMode(true);
process.stdin.setEncoding('utf8');
let pending = '';
process.stdin.on('data', data => {
  for (const char of data) {
    if (char === '\u0003') { child.kill(); return; }
    if (char === '\r' || char === '\n') {
      if (pending) child.stdin.write(pending + '\n');
      pending = '';
    } else pending += char;
  }
});
child.on('exit', code => { if (process.stdin.isTTY) process.stdin.setRawMode(false); process.exit(code || 0); });
