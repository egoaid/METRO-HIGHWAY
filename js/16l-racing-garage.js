// ════════════════════════════════════════════════
// VFD RACING — ガレージ（車の選択・購入・性能差）
//
//  ・コイン（16m）を貯めて車を買う。持っているコインと買った車・選んだ車は localStorage に保存（キー metrohwy_garage_v1）。
//  ・タイトル（デモ）画面とゲームオーバー後に ←→（タップなら左右の矢印）で車を見て選ぶ。未購入の車も見られる。
//    Space/Enter/PLAY: 持っている車ならその車で開始。持っていなければ購入（コイン不足なら不足数を表示）。
//  ・性能は6つの数値（下の CARS の s）。「何かが強ければ何かが弱い」ように配分し、高い車が全部上位互換にならないようにしてある。
//      vmax   最高速(km/h)            accel  加速(km/h/s)           brake  ブレーキ(km/h/s)
//      handling ハンドルの利き(倍率)  grip   カーブで外へ流されにくさ(倍率)  mass  重さ（他車との衝突で弾かれにくさ。他車は 0.9〜6.0）
//    車体の大きさ（長さ・幅）は車種の3Dモデルのまま＝当たり判定も車ごとに違う（長い車ほど前後の余裕が要る）。
//  ・カーブ: 以前は「速度に比例する弱い横流れ」で簡単だった。今は 速度の2乗に比例して外へ流される
//    （流れ = カーブ × K × (速度/220)² ÷ grip）。高速でカーブに入るほど急にきつくなるので、ブレーキと車選びが効く。
//  ・管理者デバッグモード（全車種を購入せずに選べる）: URL に ?admin=1 を付けて開く、またはタイトル画面で Alt+Shift+A で切り替え。
//    購入済みの記録は変えない（保存されるのはコインと本当に買った車だけ）。この表示に「ADMIN」と出る。通常のプレイヤーには案内しない。
// 公開: window.Garage
// ════════════════════════════════════════════════
window.Garage = (function(){
  const KEY = 'metrohwy_garage_v1';
  const SPD_REF = 220;                                          // 操舵・カーブの速度の基準（ferrari328 の最高速）
  const CURVE_K = 0.45;                                         // カーブの横流れの強さ（基準車・最高速・曲率0.5 で約 0.225/s。操舵力は 0.35/s）

  // 車の表（価格はコイン）。type は 16c の3Dモデル。性能の考え方:
  //   F328  優等生（初期車）  / COMPACT 軽くて機敏・弾かれやすい / COUPE コーナーの達人 / SALOON 高速で安定するツアラー
  //   EXECUTIVE 重くて安定・鈍い / F40 直線番長（最高速ダントツ・曲がらない・止まらない）
  const CARS = [
    { id:'f328',      name:'F328',      type:'ferrari328',  color:'#cc0020', role:'ALL-ROUNDER', price:0,
      s:{ vmax:220, accel:70, handling:1.00, brake:180, grip:1.00, mass:0.9 } },
    { id:'compact',   name:'COMPACT',   type:'compact80',   color:'#ffd020', role:'LIGHTWEIGHT', price:120,
      s:{ vmax:200, accel:85, handling:1.15, brake:195, grip:1.10, mass:0.80 } },
    { id:'coupe',     name:'COUPE',     type:'coupe',       color:'#ff8a20', role:'CORNERING',   price:300,
      s:{ vmax:200, accel:80, handling:1.20, brake:190, grip:1.12, mass:0.85 } },
    { id:'saloon',    name:'SALOON',    type:'saloon80',    color:'#2a70e0', role:'GRAND TOURER', price:450,
      s:{ vmax:228, accel:62, handling:0.90, brake:170, grip:1.00, mass:1.3 } },
    { id:'executive', name:'EXECUTIVE', type:'executive80', color:'#18a868', role:'HEAVYWEIGHT', price:650,
      s:{ vmax:205, accel:62, handling:1.05, brake:185, grip:1.30, mass:1.8 } },
    { id:'f40',       name:'F40',       type:'f40',         color:'#ff40a0', role:'TOP SPEED',   price:1000,
      s:{ vmax:250, accel:75, handling:0.88, brake:155, grip:0.92, mass:0.95 } },
  ];
  // 性能バーの表示範囲（最小〜最大）
  const RANGE = { vmax:[180,260], accel:[45,100], handling:[0.75,1.35], brake:[130,200], grip:[0.8,1.3], mass:[0.6,1.9] };
  const LABEL = { vmax:'SPEED', accel:'ACCEL', handling:'HANDLING', brake:'BRAKE', grip:'GRIP', mass:'WEIGHT' };

  let admin = false;
  try{ admin = /[?&#]admin=1(\b|$)/.test((location.search||'') + (location.hash||'')); }catch(_){}
  let st = { coins:0, owned:['f328'], sel:'f328' };
  let view = 0;                                                  // タイトル画面で見ている車の番号
  let msg = '', msgT = 0;
  const zones = {};                                              // タップ判定（キャンバス座標）: left / right / action

  function load(){
    try{
      const j = JSON.parse(localStorage.getItem(KEY));
      if(j && typeof j === 'object'){
        st.coins = Math.max(0, j.coins|0);
        if(Array.isArray(j.owned)) st.owned = j.owned.filter(id => CARS.some(c => c.id === id));
        if(!st.owned.includes('f328')) st.owned.unshift('f328');
        st.sel = (CARS.some(c => c.id === j.sel) && st.owned.includes(j.sel)) ? j.sel : 'f328';
      }
    }catch(_){}
    view = Math.max(0, CARS.findIndex(c => c.id === st.sel));
  }
  function save(){ try{ localStorage.setItem(KEY, JSON.stringify(st)); }catch(_){} }
  load();

  const owned = id => admin || st.owned.includes(id);        // 管理者モードでは全車種が使える（記録は変えない）
  const viewCar = () => CARS[view];
  const selCar  = () => CARS.find(c => c.id === st.sel) || CARS[0];
  // 画面に出す車（PLAY中は選んだ車、タイトル中は見ている車）
  const shownCar = () => (typeof mode !== 'undefined' && mode === MODE.PLAY) ? selCar() : viewCar();
  const stats = () => selCar().s;                                // 走行物理が使う性能（開始時に確定した車）

  function say(t){ msg = t; msgT = 2.5; if(typeof addLog === 'function') addLog(t); }

  // 車体サイズ・重さを自車へ反映（当たり判定が車ごとに変わる）
  // 車体サイズ: 長い車（SALOON/EXECUTIVE は全長が F328 の1.3倍）をそのまま当たり判定にすると、それだけで難しくなりすぎる
  // （計測: 同じ運転で走れる距離が半分以下）。そこで自車は「F328 の長さに近づくよう 0.75〜1.15 倍に縮尺」して描き、
  // 当たり判定も同じ縮尺にする（長い車は少し小さく描かれる。それでも長くて細いまま）。
  function fit(c){
    const d = carWorldSize(c.type), ref = carWorldSize('ferrari328').len;
    return Math.max(0.75, Math.min(1.15, ref/d.len));
  }
  const visScale = c => ((typeof TYPE_SCALE !== 'undefined' && TYPE_SCALE[c.type]) || 1) * fit(c);   // drawCar3D の typeScale
  function applyGeom(c){
    const d = carWorldSize(c.type), f = fit(c);
    PLAYER_LEN = d.len*f; PLAYER_HW = d.half*f/ROADW; PLAYER_MASS = c.s.mass;
  }
  function applyToPlayer(){ applyGeom(selCar()); }

  function select(d){
    view = (view + d + CARS.length) % CARS.length;
    applyGeom(viewCar());                                         // タイトル中のデモでも、見ている車の大きさで他車と離れる
    msg = ''; msgT = 0;
  }

  // 開始前の確認: 持っている車なら選択して true。持っていなければ購入を試みて false（開始しない）
  function ready(){
    const c = viewCar();
    if(owned(c.id)){ st.sel = c.id; if(!admin) save(); applyGeom(c); return true; }
    if(st.coins >= c.price){
      st.coins -= c.price; st.owned.push(c.id); st.sel = c.id; save();
      say(`PURCHASED ${c.name}!  PRESS AGAIN TO START`);
      if(typeof playPurchaseSound === 'function') playPurchaseSound();
    }else{
      say(`${c.name}: NEED ${c.price - st.coins} MORE COINS`);
    }
    return false;
  }
  const canStart = () => owned(viewCar().id);

  function addCoins(n){ st.coins += n; if(game) game.coins += n; save(); }
  function onGameOver(run){
    if(run > 0) addLog(`COINS +${run}   TOTAL ${st.coins}`);
    save();
  }

  // ── タイトル画面のパネル ──
  function bar(g, x, y, w, h, v, col){
    g.fillStyle = 'rgba(93,240,200,0.14)'; g.fillRect(x, y, w, h);
    g.fillStyle = col; g.fillRect(x, y, w*Math.max(0.04, Math.min(1, v)), h);
  }
  function drawPanel(g, dt){
    if(msgT > 0) msgT = Math.max(0, msgT - (dt || 0.033));
    const c = viewCar(), ok = owned(c.id);
    const pw = Math.min(W*0.92, H*1.25), ph = H*0.30, px = (W - pw)/2, py = H*0.285;
    g.save();
    g.fillStyle = 'rgba(2,10,16,0.62)'; g.fillRect(px, py, pw, ph);
    g.strokeStyle = 'rgba(93,240,200,0.45)'; g.lineWidth = 1; g.strokeRect(px, py, pw, ph);
    g.shadowColor = '#5df0c8'; g.shadowBlur = 4;
    const fs = H*0.030;
    g.textBaseline = 'middle';
    // 名前と矢印
    g.font = `${Math.round(H*0.046)}px 'Share Tech Mono',monospace`; g.textAlign = 'center';
    g.fillStyle = ok ? '#5df0c8' : 'rgba(93,240,200,0.55)';
    g.fillText(c.name, W/2, py + ph*0.14);
    g.fillStyle = '#5df0c8'; g.textAlign = 'center';
    g.fillText('◀', px + pw*0.10, py + ph*0.14); g.fillText('▶', px + pw*0.90, py + ph*0.14);
    zones.left  = { x:px, y:py, w:pw*0.22, h:ph*0.30 };
    zones.right = { x:px + pw*0.78, y:py, w:pw*0.22, h:ph*0.30 };
    // 役割
    g.font = `${Math.round(fs)}px 'Share Tech Mono',monospace`; g.fillStyle = 'rgba(93,240,200,0.65)';
    g.fillText(c.role, W/2, py + ph*0.30);
    // 性能バー（2列×3行）
    const keys6 = ['vmax','accel','handling','brake','grip','mass'];
    const colW = pw*0.40, bx0 = px + pw*0.07, bx1 = px + pw*0.53, bh = H*0.012;
    keys6.forEach((k, i) => {
      const x = (i < 3 ? bx0 : bx1), y = py + ph*(0.46 + 0.13*(i%3)), r = RANGE[k], v = (c.s[k] - r[0])/(r[1] - r[0]);
      g.font = `${Math.round(fs*0.72)}px 'Share Tech Mono',monospace`; g.textAlign = 'left'; g.fillStyle = 'rgba(93,240,200,0.7)';
      g.fillText(LABEL[k], x, y);
      bar(g, x + colW*0.42, y - bh/2, colW*0.58, bh, v, ok ? '#5df0c8' : 'rgba(93,240,200,0.5)');
    });
    // 状態（購入 / 所持）
    g.textAlign = 'center'; g.font = `${Math.round(fs*0.95)}px 'Share Tech Mono',monospace`;
    const ay = py + ph*0.90;
    let label, col;
    if(admin && !st.owned.includes(c.id)){ label = 'ADMIN  ·  UNLOCKED'; col = '#ff7bd0'; }
    else if(ok){ label = (c.id === st.sel ? 'OWNED  ·  SELECTED' : 'OWNED'); col = '#5df0c8'; }
    else if(st.coins >= c.price){ label = `BUY  ◎ ${c.price}`; col = '#ffd23a'; }
    else { label = `◎ ${c.price}   NEED ${c.price - st.coins} MORE`; col = '#ff7060'; }
    g.fillStyle = col; g.shadowColor = col;
    g.fillText(msgT > 0 && msg ? msg : label, W/2, ay);
    zones.action = { x:px + pw*0.2, y:py + ph*0.78, w:pw*0.6, h:ph*0.22 };
    // 所持コイン
    g.textAlign = 'right'; g.fillStyle = '#ffd23a'; g.shadowColor = '#ffd23a';
    g.font = `${Math.round(fs)}px 'Share Tech Mono',monospace`;
    g.fillText(`◎ ${st.coins}`, px + pw - 8, py - fs*0.8);
    if(admin){ g.textAlign = 'left'; g.fillStyle = '#ff7bd0'; g.shadowColor = '#ff7bd0'; g.fillText('ADMIN MODE', px + 8, py - fs*0.8); }
    g.restore();
  }

  // タップ（clientX/Y）: 矢印なら車を切り替えて true / 購入ボタン（未購入の車）なら購入して true / それ以外は false（呼び出し側が開始）
  function handleTap(cx, cy){
    // パネルが出ているのはタイトル画面だけ。走行中やゲームオーバー中の画面タップ（操舵の指など）で車が変わらないようにする
    if(typeof mode === 'undefined' || mode !== MODE.DEMO) return false;
    if(typeof cv === 'undefined' || !cv) return false;
    const r = cv.getBoundingClientRect(); if(!r.width) return false;
    const x = (cx - r.left)*(W/r.width), y = (cy - r.top)*(H/r.height);       // 描画座標(W×H)へ
    const hit = z => z && x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h;
    if(hit(zones.left))  { select(-1); return true; }
    if(hit(zones.right)) { select(1);  return true; }
    if(!canStart()){ ready(); return true; }                      // 未購入の車: タップは購入（開始しない）
    return false;
  }

  // 管理者モードの切り替え（タイトル画面で Alt+Shift+A）
  try{ window.addEventListener('keydown', e => {
    if(e.altKey && e.shiftKey && (e.code === 'KeyA' || e.key === 'A' || e.key === 'a') && typeof mode !== 'undefined' && mode === MODE.DEMO){
      admin = !admin; if(!admin && !st.owned.includes(st.sel)) st.sel = 'f328';
      say(admin ? 'ADMIN MODE: ALL CARS UNLOCKED' : 'ADMIN MODE OFF'); e.preventDefault();
    }
  }); }catch(_){}

  return { CARS, RANGE, stats, shownCar, visScale, fit, viewCar, selCar, select, ready, canStart, owned, addCoins,
           onGameOver, drawPanel, handleTap, applyToPlayer,
           coins(){ return st.coins; }, isAdmin(){ return admin; }, _setAdmin(v){ admin = !!v; }, _state(){ return st; }, _reset(s){ st = Object.assign({ coins:0, owned:['f328'], sel:'f328' }, s || {}); view = Math.max(0, CARS.findIndex(c => c.id === st.sel)); },
           SPD_REF, CURVE_K };
})();
