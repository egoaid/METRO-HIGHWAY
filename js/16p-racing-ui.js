// ════════════════════════════════════════════════
// VFD RACING — 画面UI の共通ルール（v1.9.2）
//
//  1) タップ/クリックの当たり判定: どの領域も短い辺が最小サイズ（タッチ 44 / マウス 26 CSS px）になるまで中心から広げて判定する。
//     重なったら「中心がいちばん近い領域」を選ぶ（pick）。→ 小さなボタンでも押しやすく、隣と取り違えない。
//  2) マウスカーソル: フルスクリーンでも常に見える。隠すのは「走行中に 2.5 秒動かさなかった時」だけ（動かせばすぐ出る）。
//     押せる場所の上では指の形（pointer）になる。
//  3) キーの案内（PC）: タイトル/ゲームオーバーでは押すキーを常に画面に出す。走行開始の6秒間は操作キーも出す。
//     「?」で全ショートカットの一覧（走行中は5秒で自動で閉じる）、「F」でフルスクリーンの切り替え（Esc で解除）。
//     ※ピアノ用のキー（h など）と重ならないよう、一覧は「?」にしてある。
//  4) 文字入力中（プリセット名など）はゲームのキーを無視する（以前は「-」「G」「T」などが入力できなかった）。
//  5) スマホ: 画面の大きさは CSS px 基準（unit() = 描画px ÷ CSS px）で決める。ガレージは全画面のシートで開く（16l）。
// 公開: window.VfdUI
// ════════════════════════════════════════════════
window.VfdUI = (function(){
  const MIN_TOUCH = 44, MIN_MOUSE = 26;               // 最小の押せる大きさ（CSS px）
  const CURSOR_IDLE_MS = 2500;                         // 走行中、これだけ動かさないとカーソルを隠す
  const HELP_AUTO_MS = 5000, HINT_MS = 6000;           // 走行中の一覧の自動クローズ / 走行開始時の操作キー案内の長さ
  let helpOpen = false, helpAt = 0, lastMove = -1e9, curCss = '', hover = false, lastMode = null, modeAt = 0;

  const now = () => (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0;
  const isTouch = () => (typeof IS_TOUCH_DEVICE !== 'undefined' && IS_TOUCH_DEVICE);
  const fsActive = () => !!(window.VfdFullscreen && VfdFullscreen.isActive());
  function rect(){ try{ return (typeof cv !== 'undefined' && cv) ? cv.getBoundingClientRect() : null; }catch(_){ return null; } }
  // 描画座標 1 つ分が CSS px の何倍か（画面の密度）。レイアウトは「CSS px × unit()」で書くと端末によらず同じ大きさになる
  function unit(){ const r = rect(); return (r && r.width) ? W/r.width : 1; }
  function cssW(){ const r = rect(); return (r && r.width) ? r.width : W; }
  function cssH(){ const r = rect(); return (r && r.height) ? r.height : H; }
  function toCanvas(cx, cy){ const r = rect(); if(!r || !r.width) return null; return { x:(cx - r.left)*(W/r.width), y:(cy - r.top)*(H/r.height) }; }
  // スマホで高さが足りない（埋め込み表示の 220px など）: 音量や全画面シートは出さず、ガレージは「全画面にしてから開く」
  function compact(){ return isTouch() && cssH() < 300; }

  // ── 1) 当たり判定 ──
  function hit(z, x, y){
    if(!z) return false;
    const m = (isTouch() ? MIN_TOUCH : MIN_MOUSE)*unit(), w = Math.max(z.w, m), h = Math.max(z.h, m);
    return Math.abs(x - (z.x + z.w/2)) <= w/2 && Math.abs(y - (z.y + z.h/2)) <= h/2;
  }
  // zones = { key: {x,y,w,h} }。当たった中で中心が最も近いキー（無ければ null）
  function pick(zones, x, y){
    let best = null, bd = Infinity;
    for(const k in zones){ const z = zones[k]; if(!hit(z, x, y)) continue;
      const d = Math.hypot(x - (z.x + z.w/2), y - (z.y + z.h/2)); if(d < bd){ bd = d; best = k; } }
    return best;
  }

  // ── 4) 文字入力中か ──
  function typing(e){
    const t = (e && e.target && e.target.tagName) ? e.target : ((typeof document !== 'undefined' && document.activeElement) || null);
    if(!t || !t.tagName) return false;
    const tag = t.tagName.toUpperCase();
    if(tag === 'TEXTAREA' || t.isContentEditable) return true;
    if(tag === 'INPUT'){ const ty = (t.type || 'text').toLowerCase(); return !['range','checkbox','radio','button','submit','reset','file','color','image'].includes(ty); }
    return false;
  }

  // ── 2) カーソル ──
  function overClickable(x, y){
    if(typeof mode === 'undefined' || mode === MODE.PLAY) return false;
    for(const src of [window.AudioMix, window.Garage]){ try{ if(src && src._zones && pick(src._zones(), x, y)) return true; }catch(_){} }
    return false;
  }
  function applyCursor(){
    if(typeof cv === 'undefined' || !cv || !cv.style) return;
    const hide = fsActive() && typeof mode !== 'undefined' && mode === MODE.PLAY && !helpOpen && now() - lastMove > CURSOR_IDLE_MS;
    const css = hide ? 'none' : (hover ? 'pointer' : 'default');
    if(css !== curCss){ curCss = css; cv.style.cursor = css; }
  }
  function onMove(e){
    lastMove = now();
    const p = toCanvas(e.clientX, e.clientY);
    hover = p ? overClickable(p.x, p.y) : false;
    applyCursor();
  }
  function cursorState(){ return curCss; }

  // ── 3) キーの案内 ──
  function keycap(g, text, x, y, fs, col){                  // 枠つきのキー表示。右端の x を返す（x は左端、y は中心）
    g.save();
    g.font = `${Math.round(fs)}px 'Share Tech Mono',monospace`; g.textBaseline = 'middle'; g.textAlign = 'center';
    const w = Math.max(fs*1.5, g.measureText(text).width + fs*0.9), h = fs*1.55;
    g.shadowBlur = 0; g.fillStyle = 'rgba(2,10,16,0.75)'; g.strokeStyle = col || 'rgba(93,240,200,0.85)'; g.lineWidth = Math.max(1, fs*0.07);
    g.beginPath(); (g.roundRect ? g.roundRect(x, y - h/2, w, h, fs*0.25) : g.rect(x, y - h/2, w, h)); g.fill(); g.stroke();
    g.fillStyle = col || '#5df0c8'; g.fillText(text, x + w/2, y + fs*0.04);
    g.restore(); return x + w;
  }
  // [キー] 説明 を横に並べて中央に置く（items = [[キー, 説明], ...]）
  function legendRow(g, items, cy, fs, alpha){
    g.save(); g.globalAlpha = alpha; g.font = `${Math.round(fs)}px 'Share Tech Mono',monospace`;
    const gap = fs*1.1, keyW = t => Math.max(fs*1.5, g.measureText(t).width + fs*0.9);
    const widths = items.map(([k, d]) => keyW(k) + fs*0.45 + g.measureText(d).width);
    const total = widths.reduce((a, b) => a + b, 0) + gap*(items.length - 1);
    let x = W/2 - total/2;
    items.forEach(([k, d], i) => {
      x = keycap(g, k, x, cy, fs) + fs*0.45;
      g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillStyle = 'rgba(93,240,200,0.85)'; g.fillText(d, x, cy);
      x += g.measureText(d).width + gap;
    });
    g.restore();
  }
  function drawLegend(g){
    if(isTouch() || typeof mode === 'undefined') return;
    if(window.Garage && Garage.isOpen && Garage.isOpen()) return;
    const t = now() - modeAt, fs = Math.max(11, Math.round(H*0.027));
    if(mode === MODE.DEMO){
      legendRow(g, [['F','FULL SCREEN'], ['?','ALL KEYS']], H*0.395, fs, 1);                // 開始(SPACE)・ガレージ(G)・音量は、それぞれの表示の中に押すキーを出している
    }else if(mode === MODE.OVER){
      legendRow(g, [['SPACE','RETRY'], ['F','FULL SCREEN'], ['?','ALL KEYS']], H*0.655, fs, 1);
    }else if(mode === MODE.PLAY && t < HINT_MS && !helpOpen){                            // 走行開始の数秒だけ操作キーを出して消える
      legendRow(g, [['←→','STEER'], ['↑','GAS'], ['↓','BRAKE'], ['- =','BGM'], ['[ ]','GAME'], ['?','KEYS']], H*0.93, fs*0.9, Math.min(1, (HINT_MS - t)/800));
    }
  }
  // 2列: 左 = 運転・開始・画面、右 = ガレージ・音量
  const HELP_COLS = [
    [ ['DRIVE',  [['← →','steer'], ['↑','accelerate'], ['↓','brake']]],
      ['START',  [['SPACE','start / retry  (ENTER too)']]],
      ['SCREEN', [['F','full screen  (ESC: leave)'], ['?','this list']]] ],
    [ ['GARAGE', [['G','open / close'], ['← →','choose car'], ['T','tune page'], ['↑ ↓','row (tune)'], ['ENTER','buy / upgrade / paint']]],
      ['VOLUME', [['- =','BGM  down / up'], ['[ ]','GAME sound  down / up']]] ],
  ];
  function drawHelp(g){
    if(!helpOpen) return;
    const fs = Math.max(12, Math.round(H*0.028)), lh = fs*1.75, colH = col => col.reduce((n, sec) => n + 0.9 + sec[1].length, 0)*lh;
    const pw = Math.min(W*0.96, fs*50), ph = lh*2.2 + Math.max(colH(HELP_COLS[0]), colH(HELP_COLS[1])) + lh*0.4, px = (W - pw)/2, py = Math.max(H*0.02, (H - ph)/2);
    g.save();
    g.fillStyle = 'rgba(2,10,16,0.92)'; g.fillRect(px, py, pw, ph); g.strokeStyle = 'rgba(93,240,200,0.6)'; g.lineWidth = 1; g.strokeRect(px, py, pw, ph);
    g.textBaseline = 'middle'; g.textAlign = 'left'; g.font = `bold ${Math.round(fs*1.1)}px 'Share Tech Mono',monospace`; g.fillStyle = '#5df0c8';
    g.fillText('KEYBOARD SHORTCUTS', px + fs*1.2, py + lh*0.9);
    g.textAlign = 'right'; g.font = `${Math.round(fs*0.8)}px 'Share Tech Mono',monospace`; g.fillStyle = 'rgba(93,240,200,0.5)'; g.fillText('press ? or ESC to close', px + pw - fs*1.2, py + lh*0.9);
    HELP_COLS.forEach((col, ci) => {
      const x0 = px + fs*1.2 + ci*(pw/2); let y = py + lh*2.2;
      col.forEach(([sec, list]) => {
        g.textAlign = 'left'; g.font = `${Math.round(fs*0.8)}px 'Share Tech Mono',monospace`; g.fillStyle = 'rgba(93,240,200,0.55)'; g.fillText(sec, x0, y); y += lh*0.9;
        list.forEach(([k, d]) => {
          keycap(g, k, x0, y, fs*0.9);
          g.font = `${Math.round(fs*0.92)}px 'Share Tech Mono',monospace`; g.fillStyle = 'rgba(93,240,200,0.92)'; g.textAlign = 'left'; g.fillText(d, x0 + fs*5.4, y);
          y += lh;
        });
      });
    });
    g.restore();
  }
  function setHelp(b){ helpOpen = !!b; helpAt = now(); applyCursor(); }

  // キー（どのモードでも）。使ったら true
  function onKey(e){
    if(e.ctrlKey || e.metaKey || e.altKey) return false;
    const k = e.key;
    if(k === '?'){ if(!e.repeat) setHelp(!helpOpen); return true; }
    if(k === 'Escape' && helpOpen){ setHelp(false); return true; }
    if((k === 'f' || k === 'F') && !isTouch() && window.VfdFullscreen){
      if(!e.repeat){ if(VfdFullscreen.isActive()) VfdFullscreen.exit(); else VfdFullscreen.enter(); }
      return true;
    }
    return false;
  }

  // 毎フレーム（16b から）: カーソルの隠す/出す、一覧の自動クローズ、モード切り替えの時刻
  function tick(){
    if(typeof mode !== 'undefined' && mode !== lastMode){ lastMode = mode; modeAt = now(); if(mode === MODE.PLAY && helpOpen) helpAt = now(); }
    if(helpOpen && typeof mode !== 'undefined' && mode === MODE.PLAY && now() - helpAt > HELP_AUTO_MS) helpOpen = false;
    applyCursor();
  }
  function draw(g){ drawLegend(g); drawHelp(g); }

  try{
    if(typeof cv !== 'undefined' && cv && cv.addEventListener){
      cv.addEventListener('mousemove', onMove);
      cv.addEventListener('mousedown', onMove);
      // スマホの埋め込み表示（全画面でない時）: 全画面のタッチ面（16g）が無いので、キャンバスのタップで音量・ガレージを操作できるようにする
      cv.addEventListener('click', e => {
        if(!isTouch() || fsActive()) return;
        if(window.AudioMix && AudioMix.handleTap(e.clientX, e.clientY)) return;
        if(window.Garage) Garage.handleTap(e.clientX, e.clientY);
      });
    }
  }catch(_){}

  return { hit, pick, unit, cssW, cssH, toCanvas, compact, typing, keycap, legendRow, onKey, tick, draw, setHelp,
           helpOpen(){ return helpOpen; }, cursorState, MIN_TOUCH, MIN_MOUSE, CURSOR_IDLE_MS, HELP_AUTO_MS, HINT_MS, _onMove: onMove };
})();
