'use strict';
(() => {
  // 先恢复所有必需资源，再启动游戏，防止一次网络错误留下半初始化页面。
  if (window.GameStartup) return;
  const status = document.getElementById('loadingStatus');
  const retryButton = document.getElementById('loadingRetry');
  const panel = document.getElementById('loadingPanel');
  const scripts = [...document.querySelectorAll('script[type="application/x-game-script"]')];
  const loaded = new Set(), images = [];
  const release = new URL(document.currentScript.src).searchParams.get('v');
  let running = false, complete = false, imageCount = 0;
  window.GameAssets = { images };
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
  async function retry(task) {
    let error;
    for (let attempt = 0; attempt < 5; attempt++) {
      try { return await task(attempt); }
      catch (reason) {
        error = reason;
        status.textContent = '网络有些慢，正在自动补齐内容…';
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
        else { images[index] = img; imageCount++; status.textContent = `正在准备奶盒图案 ${imageCount}/11…`; resolve(); }
      };
      const timer = setTimeout(() => finish(new Error('图片加载超时')), 12000);
      img.onload = () => img.naturalWidth > 0 ? finish() : finish(new Error('图片内容为空'));
      img.onerror = () => finish(new Error('图片加载失败'));
      img.src = resourceUrl(`img/${index + 1}.png${release ? '?v=' + encodeURIComponent(release) : ''}`, attempt);
    }));
  }
  async function loadImages() {
    // 限制冷启动同时下载的图片数量，避免与计算脚本争用手机连接。
    let next = 0;
    await settleAll(Array.from({ length: 3 }, async () => {
      while (next < 11) await loadImage(next++);
    }));
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
    status.textContent = '正在准备奶盒和放置提示…';
    try {
      const preparations = await Promise.allSettled([
        loadImages(),
        settleAll([...document.querySelectorAll('link[rel="stylesheet"]')].map(loadStyle)),
        (async () => { for (const script of scripts.filter(s => !/\bgame\.js(?:\?|$)/.test(s.getAttribute('src')))) await loadScript(script); })(),
      ]);
      const failure = preparations.find(item => item.status === 'rejected');
      if (failure) throw failure.reason;
      status.textContent = '准备好了，正在打开游戏…';
      await loadScript(scripts.find(s => /\bgame\.js(?:\?|$)/.test(s.getAttribute('src'))));
      complete = true; panel.remove();
      window.dispatchEvent(new Event('wilddog:ready'));
    } catch (_) {
      status.textContent = '还有部分内容没加载好，连接恢复后会继续。';
      retryButton.hidden = false;
    } finally { running = false; }
  }
  retryButton.onclick = start;
  window.addEventListener('online', start);
  window.GameStartup = { start };
  start();
})();
