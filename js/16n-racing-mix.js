// ════════════════════════════════════════════════
// VFD RACING — 音量バランス（BGM とゲーム音）
//
//  ・BGM（シンセ側）とゲーム音（エンジン・衝突・星・ハート・コイン・エネルギー）を別々に調整できる。設定は保存される。
//  ・ゲーム中でも使える（PC のキー）:  -  /  =   BGM を下げる / 上げる（0〜100%）
//                                      [  /  ]   ゲーム音を下げる / 上げる（0〜150%）    ※10%刻み。押すと画面上部に現在値を2秒表示
//  ・タイトル画面とゲームオーバー画面では、画面上部の「BGM ◀ 100% ▶  GAME ◀ 100% ▶」をタップ/クリックでも変えられる
//    （スマホは走行中に指が操舵で塞がるため、走行中はキーのみ。端末の音量ボタンはそのまま使える）。
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

  // 表示: タイトル(DEMO)では常に小さな操作列、それ以外は調整した直後の2秒だけ
  function draw(g, dt){
    if(toastT > 0) toastT = Math.max(0, toastT - (dt || 0.033));
    zones = {};
    const demo = (typeof mode !== 'undefined' && mode === MODE.DEMO), over = (typeof mode !== 'undefined' && mode === MODE.OVER);
    if(!demo && !(toastT > 0)) return;
    const a = demo || over ? 1 : Math.min(1, toastT/0.5), fs = Math.round(H*0.026), y = H*(demo ? 0.17 : 0.235);
    g.save(); g.globalAlpha = a; g.font = `${fs}px 'Share Tech Mono',monospace`; g.textBaseline = 'middle'; g.textAlign = 'center';
    g.shadowColor = '#5df0c8'; g.shadowBlur = 4;
    const items = [ { key:'bgm', label:'BGM', v:st.bgm, set:setBgm, max:BGM_MAX }, { key:'game', label:'GAME', v:st.game, set:setGame, max:GAME_MAX } ];
    const seg = fs*13, x0 = W/2 - seg*items.length/2;
    items.forEach((it, i) => {
      const cx = x0 + seg*(i + 0.5), pct = Math.round(it.v*100);
      g.fillStyle = 'rgba(93,240,200,0.75)'; g.fillText(it.label, cx - fs*3.9, y);
      g.fillStyle = '#5df0c8'; g.fillText('◀', cx - fs*2.0, y);
      g.fillStyle = it.v > 1 ? '#ffd23a' : '#5df0c8'; g.fillText(`${pct}%`, cx + fs*0.2, y);
      g.fillStyle = '#5df0c8'; g.fillText('▶', cx + fs*2.5, y);
      const bw = fs*8.4, bh = Math.max(2, fs*0.16), bx = cx - bw/2 + fs*0.3;                         // 値の棒
      g.fillStyle = 'rgba(93,240,200,0.16)'; g.fillRect(bx, y + fs*0.8, bw, bh);
      g.fillStyle = it.v > 1 ? '#ffd23a' : '#5df0c8'; g.fillRect(bx, y + fs*0.8, bw*Math.min(1, it.v/it.max), bh);
      if(demo || over){                                                                            // タップできるのはタイトル/ゲームオーバー画面だけ（走行中の読み出しは表示のみ）
        zones[it.key + 'Dec'] = { x:cx - fs*2.9, y:y - fs*1.0, w:fs*1.8, h:fs*2.0, f:() => it.set(it.v - STEP) };
        zones[it.key + 'Inc'] = { x:cx + fs*1.6, y:y - fs*1.0, w:fs*1.8, h:fs*2.0, f:() => it.set(it.v + STEP) };
      }
    });
    if(demo && !(typeof Garage !== 'undefined' && Garage.isOpen())){ g.shadowBlur = 0; g.font = `${Math.round(fs*0.7)}px 'Share Tech Mono',monospace`; g.fillStyle = 'rgba(93,240,200,0.38)';
      g.fillText((typeof IS_TOUCH_DEVICE !== 'undefined' && IS_TOUCH_DEVICE) ? '' : '- =  BGM      [ ]  GAME  (also while playing)', W/2, y + fs*2.0); }
    g.restore();
  }

  // タップ/クリック（タイトル・ゲームオーバー画面のみ）。使ったら true
  function handleTap(cx, cy){
    if(typeof mode === 'undefined' || mode === MODE.PLAY) return false;
    if(typeof cv === 'undefined' || !cv) return false;
    const r = cv.getBoundingClientRect(); if(!r.width) return false;
    const x = (cx - r.left)*(W/r.width), y = (cy - r.top)*(H/r.height);
    for(const z of Object.values(zones)) if(x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h){ z.f(); return true; }
    return false;
  }
  try{
    if(typeof cv !== 'undefined' && cv && cv.addEventListener && typeof IS_TOUCH_DEVICE !== 'undefined' && !IS_TOUCH_DEVICE)
      cv.addEventListener('click', e => { handleTap(e.clientX, e.clientY); });
  }catch(_){}

  return { onKey, draw, handleTap, setBgm, setGame, bgm(){ return st.bgm; }, game(){ return st.game; },
           applyGame, applyBgm, BGM_MAX, GAME_MAX, STEP, KEY, SCHEMA, _zones(){ return zones; }, _load: load, _state(){ return st; } };
})();
