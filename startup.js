'use strict';
(() => {
  // 计算脚本按依赖启动，图片独立在后台加载，二者互不等待。
  if (window.GameStartup) return;
  const status = document.getElementById('loadingStatus');
  const retryButton = document.getElementById('loadingRetry');
  const panel = document.getElementById('loadingPanel');
  const assetNotice = document.getElementById('textureNotice');
  const assetStatus = document.getElementById('textureStatus');
  const assetRetry = document.getElementById('textureRetry');
  const scripts = [...document.querySelectorAll('script[type="application/x-game-script"]')];
  const loaded = new Set(), images = [];
  let running = false, complete = false, imageCount = 0, imageRun = null, imageFailed = false;
  let imageQueue = [];
  window.GameAssets = { images, prioritize(levels) {
    const first = [...new Set(levels)].filter(index => imageQueue.includes(index));
    imageQueue = first.concat(imageQueue.filter(index => !first.includes(index)));
  } };
  document.getElementById('board').append(assetNotice);
  // 提前并行下载，随后仍按依赖顺序执行，避免串行网络请求拖慢首屏。
  for (const template of scripts) {
    const preload = document.createElement('link');
    preload.rel = 'preload'; preload.as = 'script'; preload.href = template.getAttribute('src');
    document.head.append(preload);
  }
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function settleAll(tasks) {
    const results = await Promise.allSettled(tasks);
    const failed = results.find(item => item.status === 'rejected');
    if (failed) throw failed.reason;
  }
  const resourceUrl = (source, attempt) => {
    const url = new URL(source, document.baseURI);
    if (attempt) url.searchParams.set('retry', attempt);
    return url.href;
  };
  async function retry(task, onFailure = () => { status.textContent = '连接较慢，正在自动重试…'; }) {
    let error;
    for (let attempt = 0; attempt < 5; attempt++) {
      try { return await task(attempt); }
      catch (reason) {
        error = reason;
        onFailure();
        if (attempt < 4) await wait(Math.min(800 * 2 ** attempt, 5000));
      }
    }
    throw error;
  }
  function loadScript(template) {
    if (loaded.has(template)) return Promise.resolve();
    return retry(attempt => new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = resourceUrl(template.getAttribute('src'), attempt);
      if (template.dataset.worker) script.dataset.worker = template.dataset.worker;
      script.onload = () => { loaded.add(template); resolve(); };
      script.onerror = () => { script.remove(); reject(new Error('脚本加载失败')); };
      // 不在超时后重新执行脚本，避免慢请求晚到时重复初始化游戏。
      document.body.append(script);
    }));
  }
  function loadImage(index) {
    if (images[index]) return Promise.resolve();
    return retry(attempt => new Promise((resolve, reject) => {
      const img = new Image();
      let finished = false;
      const finish = error => {
        if (finished) return;
        finished = true; clearTimeout(timer); img.onload = img.onerror = null;
        if (error) { img.src = ''; reject(error); }
        else {
          images[index] = img; imageCount++; showAssets();
          window.dispatchEvent(new CustomEvent('wilddog:texture', { detail: { index } }));
          resolve();
        }
      };
      const timer = setTimeout(() => finish(new Error('图片加载超时')), 12000);
      img.onload = () => img.naturalWidth > 0 ? finish() : finish(new Error('图片内容为空'));
      img.onerror = () => finish(new Error('图片加载失败'));
      // 图案内容未变化时沿用固定地址，避免每次更新脚本都重新下载整套图片。
      img.src = resourceUrl(`img/${index + 1}.png`, attempt);
    }), () => {});
  }
  async function loadImages() {
    // 初始出盒只有前三种；后续优先补齐实际的当前盒和下一盒。
    imageQueue = Array.from({ length: 11 }, (_, index) => index).filter(index => !images[index]);
    const state = window.Game?.state();
    if (state) window.GameAssets.prioritize([state.level, state.nextLevel]);
    const errors = [];
    await settleAll(Array.from({ length: 3 }, async () => {
      while (imageQueue.length) {
        const index = imageQueue.shift();
        try { await loadImage(index); } catch (error) { errors.push(error); }
      }
    }));
    if (errors.length) throw errors[0];
  }
  function showAssets() {
    assetNotice.hidden = !complete || imageCount === 11;
    assetStatus.textContent = imageFailed ? '部分图案暂未加载，仍可游戏' : `图案加载 ${imageCount}/11 · 游戏可用`;
    assetRetry.hidden = !imageFailed;
  }
  function startImages() {
    if (imageRun || imageCount === 11) return imageRun;
    imageFailed = false; showAssets();
    imageRun = loadImages().catch(() => { imageFailed = true; })
      .finally(() => { imageRun = null; showAssets(); });
    return imageRun;
  }
  function loadStyle(link) {
    // 部分内核即使下载失败也留下空样式表，不能只判断 sheet 是否存在。
    const valid = node => {
      try { return !!node.sheet?.cssRules.length; }
      // 直接打开本地文件时，浏览器可能禁止读取已加载样式表的规则。
      catch (_) { return location.protocol === 'file:' && !!node.sheet; }
    };
    if (valid(link)) return Promise.resolve();
    return retry(attempt => new Promise((resolve, reject) => {
      if (valid(link)) { resolve(); return; }
      const replacement = document.createElement('link');
      replacement.rel = 'stylesheet'; replacement.href = resourceUrl(link.href, attempt + 1);
      let finished = false;
      const finish = error => {
        if (finished) return;
        finished = true; clearTimeout(timer);
        replacement.onload = replacement.onerror = null;
        if (error) { replacement.remove(); reject(error); }
        else { link.remove(); resolve(); }
      };
      const timer = setTimeout(() => finish(new Error('样式加载超时')), 12000);
      replacement.onload = () => finish(valid(replacement) ? null : new Error('样式内容为空'));
      replacement.onerror = () => finish(new Error('样式加载失败'));
      link.after(replacement);
    }));
  }
  async function start() {
    if (running || complete) return;
    running = true; retryButton.hidden = true;
    status.textContent = '正在打开游戏与放置提示…';
    startImages();
    try {
      const preparations = await Promise.allSettled([
        settleAll([...document.querySelectorAll('link[rel="stylesheet"]')].map(loadStyle)),
        (async () => { for (const script of scripts.filter(s => !/\bgame\.js(?:\?|$)/.test(s.getAttribute('src')))) await loadScript(script); })(),
      ]);
      const failure = preparations.find(item => item.status === 'rejected');
      if (failure) throw failure.reason;
      status.textContent = '准备好了，正在打开游戏…';
      await loadScript(scripts.find(s => /\bgame\.js(?:\?|$)/.test(s.getAttribute('src'))));
      complete = true; panel.remove(); showAssets();
      window.dispatchEvent(new Event('wilddog:ready'));
    } catch (_) {
      status.textContent = '还有部分内容没加载好，连接恢复后会继续。';
      retryButton.hidden = false;
    } finally { running = false; }
  }
  retryButton.onclick = start;
  assetRetry.onclick = startImages;
  window.addEventListener('online', () => { startImages(); start(); });
  window.GameStartup = { start };
  start();
})();
