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
  const loaded = new Set(), downloads = new Map(), images = [];
  let executionError = null;
  let running = false, complete = false, imageCount = 0, imageRun = null, imageFailed = false;
  let imageQueue = [];
  window.GameAssets = { images, prioritize(levels) {
    const first = [...new Set(levels)].filter(index => imageQueue.includes(index));
    imageQueue = first.concat(imageQueue.filter(index => !first.includes(index)));
  } };
  document.getElementById('board').append(assetNotice);
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
  function download(template) {
    if (downloads.has(template)) return downloads.get(template);
    // 只下载文本，超时中止旧请求；成功后再执行一次，避免慢脚本晚到导致重复开局。
    const task = retry(attempt => new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', resourceUrl(template.getAttribute('src'), attempt), true);
      xhr.timeout = 10000;
      xhr.onload = () => {
        if ((xhr.status === 200 || (location.protocol === 'file:' && xhr.status === 0)) && xhr.responseText.trim()) resolve(xhr.responseText);
        else reject(new Error('脚本下载失败：' + template.getAttribute('src')));
      };
      xhr.onerror = xhr.ontimeout = xhr.onabort = () => reject(new Error('脚本连接中断或超时：' + template.getAttribute('src')));
      xhr.send();
    }));
    downloads.set(template, task);
    // 为并行下载立即挂上失败处理，避免后面的依赖先失败而触发未处理拒绝。
    task.catch(() => { downloads.delete(template); });
    return task;
  }
  async function loadScript(template) {
    if (loaded.has(template)) return;
    const code = await download(template);
    const script = document.createElement('script');
    if (template.dataset.worker) script.dataset.worker = template.dataset.worker;
    let failure;
    const onError = event => { failure = event.error || new Error(event.message || '脚本执行失败'); };
    window.addEventListener('error', onError);
    try {
      script.textContent = code + '\n//# sourceURL=' + resourceUrl(template.getAttribute('src'), 0);
      document.body.append(script);
      if (failure) throw failure;
      loaded.add(template);
    } catch (error) {
      // 已执行了一部分的脚本不能安全重放；保留明确错误，允许用户重新打开。
      executionError = error; throw error;
    } finally { window.removeEventListener('error', onError); script.remove(); }
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
  async function start() {
    if (running || complete) return;
    if (executionError) { location.reload(); return; }
    running = true; retryButton.hidden = true;
    status.textContent = '正在打开游戏与放置提示…';
    try {
      // 排行榜的恢复不阻塞物理引擎、操作或辅助计算。
      const core = scripts.filter(s => !/\bleaderboard\.js(?:\?|$)/.test(s.getAttribute('src')));
      for (const script of core) download(script);
      for (const script of core) await loadScript(script);
      if (!window.Game?.initialized) throw new Error('游戏初始化没有完成');
      complete = true; panel.remove(); showAssets();
      window.dispatchEvent(new Event('wilddog:ready'));
      startImages();
      const ranking = scripts.find(s => /\bleaderboard\.js(?:\?|$)/.test(s.getAttribute('src')));
      if (ranking) {
        const openRanking = () => loadScript(ranking).catch(() => {
          for (const id of ['rankButton', 'rankEndButton']) {
            const button = document.getElementById(id);
            button.textContent = '重试排行榜'; button.onclick = openRanking;
          }
        });
        openRanking();
      }
    } catch (error) {
      window.GameStartup.error = String(error.message || error);
      status.textContent = executionError ? '游戏初始化失败，请重新打开。' : '游戏脚本连接中断，可继续加载，无需刷新。';
      retryButton.textContent = executionError ? '重新打开' : '继续加载';
      retryButton.hidden = false;
    } finally { running = false; }
  }
  retryButton.onclick = start;
  assetRetry.onclick = startImages;
  window.addEventListener('online', () => { if (complete) startImages(); else start(); });
  window.GameStartup = { start };
  start();
})();
