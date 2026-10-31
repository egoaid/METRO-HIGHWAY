// ════════════════════════════════════════════════
// VFD RACING — スマホ操作（フルスクリーン + バーチャルジョイスティック1本）
//
// ・フルスクリーン中だけ、画面全体がジョイスティックの操作面になる（浮動式: 触れた位置が中心）
//     左右 = ステア（アナログ） / 上 = アクセル / 下 = ブレーキ
// ・プレイ開始(PLAYボタン or フルスクリーン中の画面タップ)で、フルスクリーン化 → ゲーム開始 →
//   Auto Drone も開始する（startGame 内。Auto Drone カードの「現在の設定」のまま）
// ・フルスクリーンを閉じたらデモ表示に戻す（スマホのみ）
// IIFE で包み、公開は window.VfdTouch のみ。
// ════════════════════════════════════════════════
window.VfdTouch = (function(){
  const vp = document.getElementById('vfdGameViewport');
  if(!vp) return null;

  // ── ジョイスティックの値 → 入力 ──
  // dx,dy: 中心からの移動量(px)、R: 最大半径(px)。戻り値 ax: -1〜+1（デッドゾーン除去後）、U/D: 加速/ブレーキ
  const DEAD = 0.12, UP_T = 0.25, DOWN_T = 0.30;
  function joyToInput(dx, dy, R){
    const nx = Math.max(-1, Math.min(1, dx / R));
    const ny = Math.max(-1, Math.min(1, dy / R));
    const ax = Math.abs(nx) < DEAD ? 0 : Math.sign(nx) * (Math.abs(nx) - DEAD) / (1 - DEAD);
    return { ax, U: ny < -UP_T, D: ny > DOWN_T };
  }

  // ── DOM（フルスクリーン時だけ CSS で表示される）──
  const layer = document.createElement('div');
  layer.id = 'vfdTouchLayer';
  layer.innerHTML =
    '<div class="vfd-joy-base"><div class="vfd-joy-knob"></div></div>' +
    '<button type="button" id="vfdTouchExit" class="vfd-touch-btn" aria-label="Exit fullscreen">✕</button>';
  vp.appendChild(layer);
  const base = layer.querySelector('.vfd-joy-base');
  const knob = layer.querySelector('.vfd-joy-knob');
  const exitBtn = layer.querySelector('#vfdTouchExit');
  if(IS_TOUCH_DEVICE) document.body.classList.add('vfd-touch');

  const R = 56;                 // ジョイスティック最大半径(CSS px)
  let activeId = null, ox = 0, oy = 0;
  let tapId = null;             // 「開始タップ」の指。離した時に開始する（下記）

  function applyInput(dx, dy){
    const inp = joyToInput(dx, dy, R);
    keys.ax = inp.ax; keys.U = inp.U; keys.D = inp.D;
  }
  function release(){
    activeId = null;
    keys.ax = 0; keys.U = false; keys.D = false;
    base.style.display = 'none';
  }
  function place(e){
    let dx = e.clientX - ox, dy = e.clientY - oy;
    const len = Math.hypot(dx, dy);
    if(len > R){ dx *= R/len; dy *= R/len; }
    knob.style.transform = `translate(${dx}px,${dy}px)`;
    applyInput(dx, dy);
  }

  layer.addEventListener('pointerdown', e=>{
    if(e.target.closest('.vfd-touch-btn')) return;
    e.preventDefault();
    // デモ/ゲームオーバー中は画面タップで開始。開始は「指を離した時」に行う:
    // スマホの Web Audio / Auto Drone は pointerdown(タッチ)ではなく pointerup/click で再生許可が下りるため
    if(mode !== MODE.PLAY){ tapId = e.pointerId; return; }
    if(activeId !== null) return;                          // 2本目の指は無視（ジョイスティックは1本）
    activeId = e.pointerId;
    try{ layer.setPointerCapture(e.pointerId); }catch(_){}
    const r = layer.getBoundingClientRect();
    ox = e.clientX; oy = e.clientY;
    base.style.left = (ox - r.left) + 'px';
    base.style.top  = (oy - r.top)  + 'px';
    base.style.display = 'block';
    place(e);
  });
  layer.addEventListener('pointermove', e=>{ if(e.pointerId === activeId){ e.preventDefault(); place(e); } });
  layer.addEventListener('pointerup', e=>{
    if(e.pointerId === tapId){ tapId = null; if(mode !== MODE.PLAY){ if(window.AudioMix && AudioMix.handleTap(e.clientX, e.clientY)) return; if(window.Garage && Garage.handleTap(e.clientX, e.clientY)) return; startMobilePlay(); } return; }
    if(e.pointerId === activeId) release();
  });
  ['pointercancel','lostpointercapture'].forEach(ev =>
    layer.addEventListener(ev, e=>{ if(e.pointerId === tapId) tapId = null; if(e.pointerId === activeId) release(); }));
  layer.addEventListener('contextmenu', e=>e.preventDefault());

  exitBtn.addEventListener('click', ()=>{ if(window.VfdFullscreen) VfdFullscreen.exit(); });

  // ── プレイ開始: フルスクリーン → ゲーム開始 → Auto Drone ──
  function startMobilePlay(){
    if(window.VfdFullscreen && !VfdFullscreen.isActive()) VfdFullscreen.enter();
    startGame();   // Auto Drone も startGame() が開始する（デスクトップと共通。16a の ensureAutoDrone）
  }

  // フルスクリーンを閉じたら、スマホではデモ表示に戻す（ゲームを裏で続けない）
  document.addEventListener('vfd-fullscreenchange', e=>{
    if(e.detail.active) return;
    release();
    if(mode === MODE.PLAY || mode === MODE.OVER){                      // 通常画面に戻ったらゲームを終了してデモに戻す（スマホもPCも。v1.10.1）
      mode = MODE.DEMO; player.speed = 0; player.x = 0; player.xv = 0; player.bank = 0;
      player.slip = 0; player.slipV = 0; player.slideV = 0; traffic = [];
      const gb = document.getElementById('vfdGameBtn');
      if(gb){ gb.textContent = 'PLAY'; gb.classList.add('btn-red'); gb.classList.remove('btn'); }
    }
  });

  return { startMobilePlay, joyToInput };
})();
