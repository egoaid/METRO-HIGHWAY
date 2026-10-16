// ════════════════════════════════════════════════
// Screen Wake Lock — スマホの自動スリープを抑制する
//
// ・タッチ端末（pointer: coarse）で、ページが見えている間だけ画面を点灯し続ける。
// ・タブを離れるなどでロックが解除されたら、戻った時に取り直す。
// ・初回に拒否された場合や、省電力などで解除された場合は、次の操作で取り直す。
// ・非対応ブラウザでは何もしない。
// ════════════════════════════════════════════════
(function(){
  if(!('wakeLock' in navigator)) return;
  if(!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches)) return;

  let lock = null, pending = false;

  async function acquire(){
    if(lock || pending || document.visibilityState !== 'visible') return;
    pending = true;
    try{
      const l = await navigator.wakeLock.request('screen');
      lock = l;
      l.addEventListener('release', () => { if(lock === l) lock = null; });
    }catch(_){
      lock = null;   // 拒否・省電力などで失敗。次の操作/表示復帰で再試行する
    }finally{
      pending = false;
    }
  }

  document.addEventListener('visibilitychange', () => {
    if(document.visibilityState === 'visible') acquire();
  });
  ['pointerdown', 'touchend', 'click', 'keydown'].forEach(ev =>
    document.addEventListener(ev, () => { if(!lock) acquire(); }, { passive: true }));
  ['fullscreenchange', 'webkitfullscreenchange'].forEach(ev =>
    document.addEventListener(ev, () => { if(!lock) acquire(); }));

  acquire();
})();
