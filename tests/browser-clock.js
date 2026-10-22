'use strict';
// 只加快验收页的显示时钟，游戏仍按原版 1/60 秒物理步长更新。
const nativeFrame = window.requestAnimationFrame.bind(window);
let acceptanceClock = 0;
window.requestAnimationFrame = callback => nativeFrame(() => { acceptanceClock += 100; callback(acceptanceClock); });
