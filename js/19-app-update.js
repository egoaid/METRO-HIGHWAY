// ════════════════════════════════════════════════
// アプリのバージョン管理と更新通知
//
// ・APP_VERSION がこのビルドのバージョン（唯一の定義元。ヘッダー表示もここから）。
//   リリース時は version.json / service-worker.js の CACHE_VERSION / ドキュメントと揃える
//   （tools/check_versions.js が不一致を検出する）。
// ・サーバーの version.json と比較し、サーバー側が新しければ更新バナーを出す。
// ・バナーをクリックすると、このアプリのキャッシュ(Service Worker/Cache Storage/HTTPキャッシュ)を
//   削除して再読み込みし、最新版にする。
// ════════════════════════════════════════════════
(function(){
  const APP_VERSION = '1.5.1';
  window.APP_VERSION = APP_VERSION;

  document.querySelectorAll('[data-app-version]').forEach(el => { el.textContent = 'v' + APP_VERSION; });

  // ── バージョン比較（"1.10.0" > "1.9.0" を数値で正しく扱う）──
  function parseVer(v){ return String(v).trim().replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0); }
  function isNewer(remote, local){
    const a = parseVer(remote), b = parseVer(local);
    for(let i = 0; i < Math.max(a.length, b.length); i++){
      const x = a[i] || 0, y = b[i] || 0;
      if(x !== y) return x > y;
    }
    return false;
  }

  // ── 更新バナー ──
  let banner = null;
  function showBanner(ver){
    if(banner) return;
    banner = document.createElement('div');
    banner.id = 'appUpdateBanner';
    banner.setAttribute('role', 'status');
    banner.innerHTML =
      '<span class="aub-text">NEW VERSION <b></b> AVAILABLE</span>' +
      '<button type="button" class="aub-go">UPDATE</button>' +
      '<button type="button" class="aub-x" aria-label="Dismiss">×</button>';
    banner.querySelector('b').textContent = 'v' + ver;
    banner.querySelector('.aub-go').addEventListener('click', applyUpdate);
    banner.querySelector('.aub-x').addEventListener('click', () => banner.remove());
    document.body.appendChild(banner);
  }

  // ── 更新の実行: キャッシュを削除して再読み込み ──
  // 1) このスコープの Service Worker を解除  2) このアプリの Cache Storage を削除
  //    （github.io は他のプロジェクトと origin を共有するので、metro-highway-cache- だけを消す）
  // 3) 読み込み済みのファイルを cache:'reload' で取り直し、ブラウザのHTTPキャッシュも最新にする
  // 4) 再読み込み
  async function applyUpdate(){
    const btn = banner && banner.querySelector('.aub-go');
    if(btn){ btn.disabled = true; btn.textContent = 'UPDATING…'; }
    try{
      if('serviceWorker' in navigator){
        const reg = await navigator.serviceWorker.getRegistration();
        if(reg) await reg.unregister();
      }
      if('caches' in window){
        const keys = await caches.keys();
        await Promise.all(keys.filter(k => k.startsWith('metro-highway-cache-')).map(k => caches.delete(k)));
      }
      const urls = new Set([location.href.split('#')[0]]);
      document.querySelectorAll('script[src], link[rel="stylesheet"], link[rel="manifest"]').forEach(el => {
        const u = el.src || el.href;
        if(u && u.startsWith(location.origin)) urls.add(u);
      });
      await Promise.allSettled([...urls].map(u => fetch(u, { cache: 'reload' })));
    }catch(_){ /* 失敗しても再読み込みは行う */ }
    location.reload();
  }

  // ── サーバーのバージョン確認 ──
  let lastCheck = 0;
  async function check(){
    const now = Date.now();
    if(now - lastCheck < 60 * 1000) return;     // 連続確認を避ける
    lastCheck = now;
    try{
      const res = await fetch('version.json?_=' + now, { cache: 'no-store' });
      if(!res.ok) return;
      const j = await res.json();
      if(j && j.version && isNewer(j.version, APP_VERSION)) showBanner(String(j.version));
    }catch(_){ /* オフライン / file:// などでは何もしない */ }
  }

  setTimeout(check, 3000);                                          // 起動直後
  document.addEventListener('visibilitychange', () => {             // タブ/アプリに戻った時
    if(document.visibilityState === 'visible') check();
  });
  setInterval(check, 30 * 60 * 1000);                               // 開きっぱなしの時は30分ごと

  window.AppUpdate = { isNewer, check };
})();
