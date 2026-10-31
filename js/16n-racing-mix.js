// ════════════════════════════════════════════════
// VFD RACING — 音量バランス（BGM とゲーム音）
//
//  ・BGM（シンセ側）とゲーム音（エンジン・衝突・星・ハート・コイン・エネルギー）を別々に調整できる。設定は保存される。
//  ・ゲーム中でも使える（PC のキー）:  -  /  =   BGM を下げる / 上げる（0〜100%）
//                                      [  /  ]   ゲーム音を下げる / 上げる（0〜150%）    ※10%刻み。押すと画面上部に現在値を2秒表示
//  ・タイトル画面とゲームオーバー画面では、画面上部の「BGM [-] ◀ 100% ▶ [=]  GAME [[] ◀ 100% ▶ []]」（押すキーを枠で表示）をクリック/タップでも変えられる
//    （v1.9.2: スマホは大きな − / + ボタン。走行中に指が操舵で塞がるため、走行中はキーのみ。端末の音量ボタンはそのまま使える）。
//  ・仕組み: BGM は 01-audio-engine.js の bgmLevelGain（BGM の出口。既定 1.0）。ゲーム音は 16e の gameBus
//    （基準 GAME_BOOST=2.8 倍 ×  GAME の割合）。ゲームの開始・終了で BGM を動かさない
//    （v1.8.3 のダック方式は、ゲームオーバーで BGM が急に大きくなって驚くため廃止）。
//  ・基準では ゲーム音 ≒ BGM より約 9dB 大きい。端末の音量を下げれば全体が下がり、この差は残る。
// 公開: window.AudioMix
// ════════════════════════════════════════════════
window.AudioMix = (function(){
  const KEY = 'metrohwy_audio_v1', SCHEMA = 1;
  const STEP = 0.1, BGM_MAX = 1.0, GAME_MAX = 1.5;               // BGM は 100% を超えない（元の設計の余裕を超えて増幅しない）
  let st = { bgm:1.0, game:1.0 }, raw = {};
  let toastT = 0, zones = {};

  const q = v => Math.round(v*10)/10;                              // 10%刻み（0.1+0.2 のような誤差を残さない）
  const clampB = v => Math.max(0, Math.min(BGM_MAX, q(v)));
  const clampG = v => Math.max(0, Math.min(GAME_MAX, q(v)));
  function load(){
    try{
      const j = JSON.parse(localStorage.getItem(KEY));
      if(j && typeof j === 'object'){ raw = j; if(Number.isFinite(j.bgm)) st.bgm = clampB(j.bgm); if(Number.isFinite(j.game)) st.game = clampG(j.game); }
    }catch(_){}
  }
  function save(){ try{ localStorage.setItem(KEY, JSON.stringify(Object.assign({}, raw, { schema:SCHEMA, bgm:st.bgm, game:st.game }))); }catch(_){} }

  // 反映（BGM は ctx の bgmLevelGain、ゲーム音は sndCtx の gameBus。まだ無い間は何もしない）
  function applyBgm(now){ try{ if(typeof bgmLevelGain !== 'undefined' && typeof ctx !== 'undefined'){ if(now) bgmLevelGain.gain.setTargetAtTime(st.bgm, ctx.currentTime, 0.04); else bgmLevelGain.gain.value = st.bgm; } }catch(_){} }
  function applyGame(){ try{ if(typeof gameBus !== 'undefined' && gameBus && typeof sndCtx !== 'undefined' && sndCtx) gameBus.gain.setTargetAtTime(GAME_BOOST*st.game, sndCtx.currentTime, 0.04); }catch(_){} }
  load(); applyBgm(false);                                         // 起動時に保存された BGM レベルを反映

  function setBgm(v){ st.bgm = clampB(v); save(); applyBgm(true); toastT = 2.0; }
  function setGame(v){ st.game = clampG(v); save(); applyGame(); toastT = 2.0; }

  // キー（どのモードでも。自動リピートも許可して押しっぱなしで動かせる）。使ったら true
  function onKey(e){
    const k = e.key;
    if(k === '-' || k === '_'){ setBgm(st.bgm - STEP); return true; }
    if(k === '=' || k === '+'){ setBgm(st.bgm + STEP); return true; }
    if(k === '[' || k === '{'){ setGame(st.game - STEP); return true; }
    if(k === ']' || k === '}'){ setGame(st.game + STEP); return true; }
    return false;
  }

  // 表示: タイトル(DEMO)/ゲームオーバーでは常に操作列、走行中は調整した直後の2秒だけ（PC のキー操作の確認用）。
  //  PC   : BGM [-] ◀ 100% ▶ [=]   GAME [[] ◀ 100% ▶ []]   … 押すキーを枠つきで常に見せる。◀ ▶ とキーの枠はクリックもできる
  //  スマホ: 大きなボタン（− / +、44 CSS px 以上）。ガレージ（全画面シート）が開いている間と、高さが足りない埋め込み表示では出さない
  function draw(g, dt){
    if(toastT > 0) toastT = Math.max(0, toastT - (dt || 0.033));
    zones = {};
    const demo = (typeof mode !== 'undefined' && mode === MODE.DEMO), over = (typeof mode !== 'undefined' && mode === MODE.OVER);
    if(!demo && !(toastT > 0)) return;
    const touch = (typeof IS_TOUCH_DEVICE !== 'undefined' && IS_TOUCH_DEVICE), ui = (typeof VfdUI !== 'undefined') ? VfdUI : null, u = ui ? ui.unit() : 1;
    if(touch && ui && (ui.compact() || (typeof Garage !== 'undefined' && Garage.isOpen()))) return;
    const a = demo || over ? 1 : Math.min(1, toastT/0.5);
    const items = [ { key:'bgm', label:'BGM', v:st.bgm, set:setBgm, max:BGM_MAX, kd:'-', ki:'=' }, { key:'game', label:'GAME', v:st.game, set:setGame, max:GAME_MAX, kd:'[', ki:']' } ];
    g.save(); g.globalAlpha = a; g.textBaseline = 'middle'; g.textAlign = 'center';
    g.shadowColor = '#5df0c8'; g.shadowBlur = 4;
    const colOf = it => it.v > 1 ? '#ffd23a' : '#5df0c8';
    if(touch){
      const bs = 44*u, iw = Math.min((W - 8*u*3)/2, 230*u), y = Math.max(H*(H > W ? 0.19 : 0.16), bs*0.5 + 10*u), fs = 15*u;
      items.forEach((it, i) => {
        const cx = W/2 + (i ? 1 : -1)*(iw/2 + 4*u), x0 = cx - iw/2, pct = Math.round(it.v*100);
        g.strokeStyle = 'rgba(93,240,200,0.28)'; g.lineWidth = Math.max(1, u); g.fillStyle = 'rgba(2,10,16,0.45)';       // 1つの操作のまとまり（BGM と GAME を取り違えない）
        g.beginPath(); (g.roundRect ? g.roundRect(x0 - 3*u, y - bs/2 - 3*u, iw + 6*u, bs + 6*u, 11*u) : g.rect(x0 - 3*u, y - bs/2 - 3*u, iw + 6*u, bs + 6*u)); g.fill(); g.stroke();
        const pill = (x, label, key, f) => { g.strokeStyle = 'rgba(93,240,200,0.8)'; g.fillStyle = 'rgba(2,10,16,0.7)'; g.lineWidth = Math.max(1, u);
          g.beginPath(); (g.roundRect ? g.roundRect(x, y - bs/2, bs, bs, 8*u) : g.rect(x, y - bs/2, bs, bs)); g.fill(); g.stroke();
          g.shadowBlur = 0; g.fillStyle = '#5df0c8'; g.font = `${Math.round(24*u)}px 'Share Tech Mono',monospace`; g.fillText(label, x + bs/2, y + 1*u); g.shadowBlur = 4;
          zones[key] = { x, y:y - bs/2, w:bs, h:bs, f }; };
        pill(x0, '−', it.key + 'Dec', () => it.set(it.v - STEP)); pill(x0 + iw - bs, '+', it.key + 'Inc', () => it.set(it.v + STEP));
        g.font = `${Math.round(11*u)}px 'Share Tech Mono',monospace`; g.fillStyle = 'rgba(93,240,200,0.75)'; g.fillText(it.label, cx, y - 11*u);
        g.font = `bold ${Math.round(fs)}px 'Share Tech Mono',monospace`; g.fillStyle = colOf(it); g.fillText(`${pct}%`, cx, y + 6*u);
        const bw = iw - bs*2 - 10*u, bh = Math.max(2, 3*u), bx = cx - bw/2;
        g.fillStyle = 'rgba(93,240,200,0.16)'; g.fillRect(bx, y + 17*u, bw, bh); g.fillStyle = colOf(it); g.fillRect(bx, y + 17*u, bw*Math.min(1, it.v/it.max), bh);
        if(!(demo || over)){ delete zones[it.key + 'Dec']; delete zones[it.key + 'Inc']; }
      });
    }else{
      const fs = Math.max(11, Math.round(H*0.026)), y = H*(demo ? 0.17 : 0.235), gap = fs*2.2;
      g.font = `${fs}px 'Share Tech Mono',monospace`;
      const wLabel = it => g.measureText(it.label).width, capW = k => Math.max(fs*1.5, g.measureText(k).width + fs*0.9), wPct = fs*3.6;
      const wItem = it => wLabel(it) + fs*0.7 + capW(it.kd) + fs*0.3 + fs*1.2 + wPct + fs*1.2 + fs*0.3 + capW(it.ki);
      const total = items.reduce((n, it) => n + wItem(it), 0) + gap*(items.length - 1);
      let x = W/2 - total/2;
      items.forEach(it => {
        const pct = Math.round(it.v*100), col = colOf(it);
        g.textAlign = 'left'; g.font = `${fs}px 'Share Tech Mono',monospace`; g.fillStyle = 'rgba(93,240,200,0.75)'; g.fillText(it.label, x, y); x += wLabel(it) + fs*0.7;
        const dx0 = x; x = (typeof VfdUI !== 'undefined' ? VfdUI.keycap(g, it.kd, x, y, fs) : x + capW(it.kd)) + fs*0.3;
        g.font = `${fs}px 'Share Tech Mono',monospace`; g.textAlign = 'center'; g.fillStyle = '#5df0c8'; g.fillText('◀', x + fs*0.6, y); x += fs*1.2;
        const dx1 = x;
        g.fillStyle = col; g.fillText(`${pct}%`, x + wPct/2, y); x += wPct;
        const ix0 = x; g.fillStyle = '#5df0c8'; g.fillText('▶', x + fs*0.6, y); x += fs*1.2 + fs*0.3;
        x = (typeof VfdUI !== 'undefined' ? VfdUI.keycap(g, it.ki, x, y, fs) : x + capW(it.ki));
        const bx = dx1, bw = wPct, bh = Math.max(2, fs*0.16);                                           // 値の棒（％の下）
        g.fillStyle = 'rgba(93,240,200,0.16)'; g.fillRect(bx, y + fs*1.05, bw, bh); g.fillStyle = col; g.fillRect(bx, y + fs*1.05, bw*Math.min(1, it.v/it.max), bh);
        if(demo || over){                                                                                // クリックできるのはタイトル/ゲームオーバー画面だけ（走行中の読み出しは表示のみ）
          zones[it.key + 'Dec'] = { x:dx0, y:y - fs*1.0, w:dx1 - dx0, h:fs*2.0, f:() => it.set(it.v - STEP) };
          zones[it.key + 'Inc'] = { x:ix0, y:y - fs*1.0, w:x - ix0, h:fs*2.0, f:() => it.set(it.v + STEP) };
        }
        x += gap;
      });
    }
    g.restore();
  }

  // タップ/クリック（タイトル・ゲームオーバー画面のみ）。使ったら true。当たり判定は VfdUI.hit（最小サイズ・近い方を選ぶ）
  function handleTap(cx, cy){
    if(typeof mode === 'undefined' || mode === MODE.PLAY) return false;
    if(typeof cv === 'undefined' || !cv) return false;
    const p = (typeof VfdUI !== 'undefined') ? VfdUI.toCanvas(cx, cy) : null; if(!p) return false;
    const k = VfdUI.pick(zones, p.x, p.y);
    if(k && zones[k].f){ zones[k].f(); return true; }
    return false;
  }
  try{
    if(typeof cv !== 'undefined' && cv && cv.addEventListener && typeof IS_TOUCH_DEVICE !== 'undefined' && !IS_TOUCH_DEVICE)
      cv.addEventListener('click', e => { handleTap(e.clientX, e.clientY); });
  }catch(_){}

  return { onKey, draw, handleTap, setBgm, setGame, bgm(){ return st.bgm; }, game(){ return st.game; },
           applyGame, applyBgm, BGM_MAX, GAME_MAX, STEP, KEY, SCHEMA, _zones(){ return zones; }, _load: load, _state(){ return st; } };
})();
