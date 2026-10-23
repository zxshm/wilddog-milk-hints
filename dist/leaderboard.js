'use strict';
(() => {
  const API = 'https://wilddog-milk-hints-20261022.zhangqiongxingzhe.chatgpt.site/api';
  const $ = id => document.getElementById(id);
  const read = key => { try { return localStorage.getItem(key); } catch { return null; } };
  const save = (key, value) => { try { localStorage.setItem(key, value); } catch {} };
  let ended = null, identity = null, loading = 0;
  try { identity = JSON.parse(read('wildDogRankIdentity')); } catch {}
  const dialog = document.createElement('dialog');
  dialog.id = 'rankDialog';
  dialog.innerHTML = `<div class="rank-heading"><h2>玩家排行榜</h2><button id="rankClose" type="button" aria-label="关闭排行榜">✕</button></div>
    <p class="rank-note">所有玩家共用 · 每个浏览器保留最高成绩</p>
    <div class="rank-actions"><span>可使用提示 · 前 50 名</span><button id="rankRefresh" type="button">刷新</button></div>
    <p id="rankStatus" role="status" aria-live="polite"></p>
    <ol id="rankList"></ol><p class="rank-note">成绩由客户端上报，尚未逐局回放验证。昵称公开，请勿填写个人信息。</p>
    <form id="rankForm"><label for="rankName">上榜昵称</label><input id="rankName" maxlength="32" autocomplete="nickname" placeholder="1～16 个字"><button id="rankSubmit" type="submit" disabled>本局结束后可提交</button></form>`;
  document.body.append(dialog);
  $('rankName').value = read('wildDogRankName') || '';
  async function api(path, options = {}) {
    // 部分微信内核没有 AbortSignal.timeout，直接调用会导致请求尚未发出就失败。
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    let timer;
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => { controller?.abort(); reject(new Error('连接超时，请稍后重试')); }, 12000);
    });
    try {
      return await Promise.race([deadline, (async () => {
        const response = await fetch(API + path, { ...options, ...(controller ? { signal: controller.signal } : {}), credentials: 'omit' });
        let data;
        try { data = await response.json(); } catch { throw new Error('排行榜服务暂时不可用，请稍后重试'); }
        if (!response.ok) { if (response.status === 401) { identity = null; save('wildDogRankIdentity', 'null'); } throw new Error(data.error || '连接失败'); }
        return data;
      })()]);
    } finally { clearTimeout(timer); }
  }
  async function refresh() {
    const current = ++loading;
    $('rankStatus').textContent = '正在读取共享榜单…';
    try {
      let data;
      // 只自动重试读取，创建身份和提交成绩仍各发一次，避免网络波动时重复写入。
      for (let attempt = 0; attempt < 2; attempt++) {
        if (current !== loading) return;
        try { data = await api('/leaderboard?mode=player'); break; }
        catch (error) {
          if (attempt || current !== loading) throw error;
          $('rankStatus').textContent = '连接较慢，正在自动重试…';
          await new Promise(resolve => setTimeout(resolve, 800));
        }
      }
      if (current !== loading) return;
      if (!Array.isArray(data?.entries)) throw new Error('榜单内容暂时不可用');
      $('rankList').replaceChildren();
      for (const item of data.entries) {
        const li = document.createElement('li'), name = document.createElement('span'), points = document.createElement('strong');
        name.textContent = item.nickname; points.textContent = item.score.toLocaleString() + ' 分';
        li.append(name, points); $('rankList').append(li);
      }
      $('rankStatus').textContent = data.entries.length ? `已同步 · 前 ${data.entries.length} 名` : '暂无成绩，完成一局后提交你的纪录吧。';
    } catch { if (current === loading) $('rankStatus').textContent = $('rankList').children.length
      ? '暂时无法同步，以下保留上次读取的榜单。请稍后重试。'
      : '暂时连接不上共享榜单，请检查网络后重试。'; }
  }
  function open() { if (!dialog.open) dialog.showModal(); return refresh(); }
  $('rankClose').onclick = () => dialog.close();
  $('rankRefresh').onclick = refresh;
  $('rankButton').onclick = open; $('rankEndButton').onclick = open;
  window.addEventListener('online', () => { if (dialog.open) refresh(); });
  $('rankForm').onsubmit = async event => {
    event.preventDefault(); if (!ended) return;
    const nickname = $('rankName').value.trim();
    if (!nickname || [...nickname].length > 16 || /[<>\p{Cc}\p{Cf}]/u.test(nickname)) { $('rankStatus').textContent = '昵称请填写 1～16 个普通字符。'; return; }
    $('rankSubmit').disabled = true; $('rankStatus').textContent = '正在提交…';
    try {
      if (!identity) { identity = await api('/players', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); save('wildDogRankIdentity', JSON.stringify(identity)); }
      await api('/scores', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${identity.id}:${identity.token}` }, body: JSON.stringify({ ...ended, nickname }) });
      save('wildDogRankName', nickname);
      $('rankSubmit').textContent = '本局成绩已提交'; await refresh();
    } catch (error) { $('rankStatus').textContent = error.message || '提交失败，请重试'; $('rankSubmit').disabled = false; }
  };
  window.addEventListener('wilddog:reset', () => { ended = null; $('rankSubmit').disabled = true; $('rankSubmit').textContent = '本局结束后可提交'; });
  window.addEventListener('wilddog:over', event => {
    if (location.pathname.startsWith('/__qa/')) {
      ended = null; $('rankSubmit').disabled = true; $('rankSubmit').textContent = '自动测试不参与玩家排名'; return;
    }
    ended = { ...event.detail, mode: 'player' };
    $('rankSubmit').disabled = false; $('rankSubmit').textContent = `提交本局 ${ended.score} 分`;
  });
})();
