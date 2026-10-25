// ════════════════════════════════════════════════
// VFD RACING — ガレージ（車の選択・購入・強化・塗装・性能差）
//
//  ・コイン（16m）を貯めて車を買い、強化（チューニング）し、色を塗る。データは localStorage（キー metrohwy_garage_v1）に保存。
//  ・タイトル（デモ）画面は、ふだんは「G: GARAGE」の小さな案内だけ。ガレージは開いた時だけ出る（デモ中の画面をじゃましない）。
//      開く: G / ←→ / 案内をタップ    閉じる: G / Esc / ✕    車を選ぶ: ←→（またはタップ）    T: 強化・塗装の画面
//      車ページ: Space/Enter/PLAY で、持っている車なら開始、持っていなければ購入。
//      強化ページ: ↑↓ で行を選び Enter/Space（またはタップ）で強化・色の購入と適用。
//  ・性能は6つ（CARS の s）: vmax 最高速(km/h)  accel 加速(km/h/s)  brake ブレーキ(km/h/s)
//      handling ハンドルの利き = 車線変更の速さ（操舵の速さの倍率）  grip カーブで外へ流されにくさ  mass 重さ（衝突で弾かれにくさ）
//    このゲームの難しさは「対向車や他車を避けながらコイン・ハートを取るための車線変更の速さ」で決まる。
//    handling を車ごとの個性の中心にし（COUPE が最も速く切り替えられる）、強化でも伸ばせる（ただし高価）。
//  ・強化（TUNE）: 車ごとに、最高速・加速・ブレーキ・グリップ・ハンドルを 0〜5段階。1段ごとに基準値の +per%（TUNE の per）。
//    値段は段階が上がるほど高い（TUNE の cost）。強化した車は「楽に」なるので、高いのは意図どおり。
//  ・塗装（PAINTS）: 12色。基本の8色は無料、白・黒・銀・金は有料（一度買えば全車で使える）。色は車ごとに保存。
//  ・保存データの互換性: schema 付きで保存し、知らない項目・知らない車のデータは捨てずに残して書き戻す
//    （将来車種や項目が増減しても、以前の保存データが壊れたり消えたりしない）。読み込み時に値の範囲を丸める。
//  ・カーブ: 外へ流される量 = カーブ × K × (速度/220)² ÷ grip（速く入るほどきつい）。
//  ・管理者デバッグモード: URL に ?admin=1 / タイトルで Alt+Shift+A。全車種が使え、強化と塗装も無料（記録の購入履歴は変えない）。
// 公開: window.Garage
// ════════════════════════════════════════════════
window.Garage = (function(){
  const KEY = 'metrohwy_garage_v1';
  const SCHEMA = 2;                                              // 保存データの版（1 = コイン/所持/選択のみ。2 = + 強化/塗装/色の解放）
  const SPD_REF = 220;                                           // 操舵・カーブの速度の基準（ferrari328 の最高速）
  const CURVE_K = 0.45;                                          // カーブの横流れの強さ

  // 車の表（価格はコイン）。type は 16c の3Dモデル。
  //   F328 優等生（初期車）/ COMPACT 軽くて機敏 / COUPE 車線変更が最速（コーナーの達人）/ SALOON 高速で安定するツアラー
  //   EXECUTIVE 重くて安定 / F40 直線番長（最高速ダントツ・曲がらない・止まらない）
  const CARS = [
    { id:'f328',      name:'F328',      type:'ferrari328',  color:'#cc0020', role:'ALL-ROUNDER', price:0,
      s:{ vmax:220, accel:70, handling:1.00, brake:180, grip:1.00, mass:0.9 } },
    { id:'compact',   name:'COMPACT',   type:'compact80',   color:'#ffd020', role:'LIGHTWEIGHT', price:120,
      s:{ vmax:200, accel:85, handling:1.20, brake:190, grip:1.00, mass:0.75 } },
    { id:'coupe',     name:'COUPE',     type:'coupe',       color:'#ff8a20', role:'QUICK STEERING', price:300,
      s:{ vmax:205, accel:75, handling:1.45, brake:170, grip:0.95, mass:0.70 } },
    { id:'saloon',    name:'SALOON',    type:'saloon80',    color:'#2a70e0', role:'GRAND TOURER', price:450,
      s:{ vmax:235, accel:62, handling:0.90, brake:175, grip:1.15, mass:1.3 } },
    { id:'executive', name:'EXECUTIVE', type:'executive80', color:'#18a868', role:'HEAVYWEIGHT', price:650,
      s:{ vmax:210, accel:55, handling:0.95, brake:185, grip:1.30, mass:1.8 } },
    { id:'f40',       name:'F40',       type:'f40',         color:'#ff40a0', role:'TOP SPEED',   price:1000,
      s:{ vmax:255, accel:80, handling:0.85, brake:150, grip:0.90, mass:0.95 } },
  ];
  // 強化: 5項目 × 0〜5段階。per = 1段あたりの伸び（基準値に対する割合）、cost[段] = その段へ上げる値段
  const MAXLV = 5;
  const TUNE = {
    handling: { label:'LANE CHANGE', per:0.05,  cost:[70,130,210,310,440] },     // 車線変更の速さ（難しさを決める項目なので高め）
    vmax:     { label:'TOP SPEED',   per:0.025, cost:[80,140,220,320,450] },
    accel:    { label:'ACCEL',       per:0.06,  cost:[50,90,140,200,280] },
    brake:    { label:'BRAKE',       per:0.05,  cost:[40,70,110,160,220] },
    grip:     { label:'GRIP',        per:0.04,  cost:[60,110,170,250,350] },
  };
  const TUNE_KEYS = ['handling','vmax','accel','brake','grip'];
  // 塗装（price 0 は最初から使える）
  const PAINTS = [
    { id:'red',    hex:'#cc0020', price:0 },  { id:'orange', hex:'#ff8a20', price:0 },  { id:'yellow', hex:'#ffd020', price:0 },
    { id:'green',  hex:'#18a868', price:0 },  { id:'teal',   hex:'#20d0b0', price:0 },  { id:'blue',   hex:'#2a70e0', price:0 },
    { id:'purple', hex:'#a050ff', price:0 },  { id:'pink',   hex:'#ff40a0', price:0 },
    { id:'white',  hex:'#f2f2f2', price:40 }, { id:'black',  hex:'#14161c', price:40 }, { id:'silver', hex:'#b8bcc8', price:40 },
    { id:'gold',   hex:'#d8a840', price:60 },
  ];
  // 性能バーの表示範囲（強化の最大まで入る）
  const RANGE = { vmax:[180,290], accel:[45,130], handling:[0.75,1.85], brake:[130,250], grip:[0.8,1.6], mass:[0.6,1.9] };
  const LABEL = { vmax:'TOP SPEED', accel:'ACCEL', handling:'LANE CHANGE', brake:'BRAKE', grip:'GRIP', mass:'WEIGHT' };

  // ── 状態と保存 ──
  const known = id => CARS.some(c => c.id === id);
  const emptyState = () => ({ coins:0, owned:['f328'], sel:'f328', tune:{}, paint:{}, colors:[] });
  let st = emptyState();
  let raw = {};                                                  // 読み込んだ元のデータ（知らない項目を書き戻すため）
  let admin = false;
  try{ admin = /[?&#]admin=1(\b|$)/.test((location.search||'') + (location.hash||'')); }catch(_){}
  let view = 0;                                                  // 見ている車の番号
  let open = false, page = 'car', row = 0, colIdx = 0;           // ガレージの開閉・ページ・強化ページのカーソル
  let msg = '', msgT = 0;
  let zones = {};                                                // タップ判定（描画座標）

  const clampLv = n => Math.max(0, Math.min(MAXLV, n|0));
  function load(){
    try{
      const j = JSON.parse(localStorage.getItem(KEY));
      if(j && typeof j === 'object'){
        raw = j;
        st.coins = Math.max(0, j.coins|0);
        if(Array.isArray(j.owned)) st.owned = j.owned.filter(known);
        if(!st.owned.includes('f328')) st.owned.unshift('f328');
        st.sel = (known(j.sel) && st.owned.includes(j.sel)) ? j.sel : 'f328';
        if(j.tune && typeof j.tune === 'object') for(const id of Object.keys(j.tune)) if(known(id) && j.tune[id] && typeof j.tune[id] === 'object'){
          st.tune[id] = {}; for(const k of TUNE_KEYS) st.tune[id][k] = clampLv(j.tune[id][k]);
        }
        if(j.paint && typeof j.paint === 'object') for(const id of Object.keys(j.paint)) if(known(id) && /^#[0-9a-fA-F]{6}$/.test(j.paint[id])) st.paint[id] = j.paint[id];
        if(Array.isArray(j.colors)) st.colors = j.colors.filter(c => PAINTS.some(p => p.id === c));
      }
    }catch(_){}
    view = Math.max(0, CARS.findIndex(c => c.id === st.sel));
  }
  // 保存: 読み込んだ元データの上に上書きする。知らない車の所持/強化/塗装、知らない項目は残す
  function save(){
    try{
      const out = Object.assign({}, raw);
      out.schema = SCHEMA; out.coins = st.coins; out.sel = st.sel;
      const unknownOwned = Array.isArray(raw.owned) ? raw.owned.filter(id => !known(id)) : [];
      out.owned = st.owned.concat(unknownOwned);
      out.tune = Object.assign({}, raw.tune || {}, st.tune);
      out.paint = Object.assign({}, raw.paint || {}, st.paint);
      const unknownColors = Array.isArray(raw.colors) ? raw.colors.filter(c => !PAINTS.some(p => p.id === c)) : [];
      out.colors = st.colors.concat(unknownColors);
      raw = out;
      localStorage.setItem(KEY, JSON.stringify(out));
    }catch(_){}
  }
  load();

  const owned = id => admin || st.owned.includes(id);            // 管理者モードでは全車種が使える（記録は変えない）
  const viewCar = () => CARS[view];
  const selCar  = () => CARS.find(c => c.id === st.sel) || CARS[0];
  const lvOf = id => Object.assign({ handling:0, vmax:0, accel:0, brake:0, grip:0 }, st.tune[id] || {});
  const paintOf = c => st.paint[c.id] || c.color;
  const paintOpen = p => admin || p.price === 0 || st.colors.includes(p.id);
  // 強化込みの性能（走行物理が使う）
  function statsOf(c){
    const lv = lvOf(c.id), s = Object.assign({}, c.s);
    for(const k of TUNE_KEYS) s[k] = c.s[k]*(1 + TUNE[k].per*lv[k]);
    return s;
  }
  const stats = () => statsOf(selCar());
  // 画面に出す車（PLAY中は選んだ車、タイトル中は見ている車）。色は塗装を反映
  const shownCar = () => { const c = (typeof mode !== 'undefined' && mode === MODE.PLAY) ? selCar() : viewCar(); return Object.assign({}, c, { color: paintOf(c) }); };

  function say(t){ msg = t; msgT = 2.5; if(typeof addLog === 'function') addLog(t); }

  // 車体サイズ: 長い車をそのまま当たり判定にすると難しくなりすぎるので、F328 の長さに近づくよう 0.75〜1.15 倍に縮尺して描き、当たり判定も同じ縮尺にする
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
    applyGeom(viewCar());
    if(page === 'tune' && !owned(viewCar().id)) page = 'car';
    msg = ''; msgT = 0;
  }
  function setOpen(b){ open = !!b; if(!open){ page = 'car'; } msg = ''; msgT = 0; }
  function close(){ setOpen(false); }

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

  // ── 強化・塗装 ──
  function upgrade(k){
    const c = viewCar(); if(!owned(c.id)){ say('BUY THIS CAR FIRST'); return false; }
    const lv = lvOf(c.id)[k];
    if(lv >= MAXLV){ say(`${TUNE[k].label}: MAX`); return false; }
    const cost = admin ? 0 : TUNE[k].cost[lv];
    if(st.coins < cost){ say(`${TUNE[k].label}: NEED ${cost - st.coins} MORE COINS`); return false; }
    st.coins -= cost; st.tune[c.id] = Object.assign(lvOf(c.id), { [k]: lv + 1 }); save();
    say(`${c.name} ${TUNE[k].label} LV${lv + 1}`); if(typeof playPurchaseSound === 'function') playPurchaseSound();
    return true;
  }
  function paint(i){
    const c = viewCar(), p = PAINTS[i]; if(!p) return false;
    if(!owned(c.id)){ say('BUY THIS CAR FIRST'); return false; }
    if(!paintOpen(p)){
      if(st.coins < p.price){ say(`${p.id.toUpperCase()}: NEED ${p.price - st.coins} MORE COINS`); return false; }
      st.coins -= p.price; st.colors.push(p.id);
      if(typeof playPurchaseSound === 'function') playPurchaseSound();
    }
    st.paint[c.id] = p.hex; save(); say(`${c.name} PAINT ${p.id.toUpperCase()}`);
    return true;
  }
  function tuneAction(){ return row < TUNE_KEYS.length ? upgrade(TUNE_KEYS[row]) : paint(colIdx); }

  function addCoins(n){ st.coins += n; if(game) game.coins += n; save(); }
  function onGameOver(run){
    close();
    if(run > 0) addLog(`COINS +${run}   TOTAL ${st.coins}`);
    save();
  }

  // ── キー操作（タイトル画面でキーを押した時。消費したら true）──
  function onKey(e){
    const k = e.key;
    if(k === 'g' || k === 'G'){ setOpen(!open); return true; }
    if(k === 'Escape'){ if(!open) return false; if(page === 'tune') page = 'car'; else close(); return true; }
    if(k === 't' || k === 'T'){
      if(!open) setOpen(true);
      if(page === 'tune') page = 'car'; else if(owned(viewCar().id)) page = 'tune'; else say('BUY THIS CAR FIRST');
      return true;
    }
    if(k === 'ArrowLeft' || k === 'ArrowRight'){
      const d = k === 'ArrowLeft' ? -1 : 1;
      if(!open){ setOpen(true); select(d); return true; }
      if(page === 'tune' && row === TUNE_KEYS.length){ colIdx = (colIdx + d + PAINTS.length) % PAINTS.length; return true; }
      select(d); return true;
    }
    if((k === 'ArrowUp' || k === 'ArrowDown') && open && page === 'tune'){
      row = (row + (k === 'ArrowUp' ? -1 : 1) + TUNE_KEYS.length + 1) % (TUNE_KEYS.length + 1); return true;
    }
    if((k === ' ' || k === 'Enter') && open && page === 'tune'){ tuneAction(); return true; }
    return false;                                                 // それ以外（Space/Enter で開始など）は呼び出し側へ
  }

  // ── 描画 ──
  function bar(g, x, y, w, h, v, col, bonus){
    g.fillStyle = 'rgba(93,240,200,0.14)'; g.fillRect(x, y, w, h);
    const f = Math.max(0.04, Math.min(1, v)); g.fillStyle = col; g.fillRect(x, y, w*f, h);
    if(bonus > 0){ const b = Math.min(1 - f, bonus); g.fillStyle = '#ffd23a'; g.fillRect(x + w*f, y, w*b, h); }     // 強化で増えた分
  }
  const FONT = (g, px) => { g.font = `${Math.round(px)}px 'Share Tech Mono',monospace`; };
  function btn(g, key, x, y, w, h, text, col){
    zones[key] = { x, y, w, h };
    g.strokeStyle = col; g.fillStyle = 'rgba(2,10,16,0.55)'; g.fillRect(x, y, w, h); g.strokeRect(x, y, w, h);
    g.fillStyle = col; g.textAlign = 'center'; g.fillText(text, x + w/2, y + h/2);
  }
  // 閉じている時の案内（デモ中の画面は出さない）
  function drawHint(g){
    FONT(g, H*0.026); g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = '#5df0c8'; g.shadowBlur = 4;
    const typeTouch = (typeof IS_TOUCH_DEVICE !== 'undefined' && IS_TOUCH_DEVICE);
    if(typeTouch){
      const w = H*0.30, h = H*0.055, x = (W - w)/2, y = H*0.285;
      btn(g, 'garage', x, y, w, h, `GARAGE  ◎ ${st.coins}`, 'rgba(93,240,200,0.8)');
    }else{
      g.fillStyle = 'rgba(93,240,200,0.55)'; g.fillText(`G : GARAGE  (CHOOSE · TUNE · PAINT)     ◎ ${st.coins}`, W/2, H*0.31);
      zones.garage = { x:W*0.25, y:H*0.285, w:W*0.5, h:H*0.05 };
    }
    if(admin){ g.fillStyle = '#ff7bd0'; g.shadowColor = '#ff7bd0'; g.fillText('ADMIN MODE', W/2, H*0.355); }
    g.shadowBlur = 0;
  }
  // 戻り値: ガレージのパネルを描いたら true（閉じていて案内だけなら false）
  function drawPanel(g, dt){
    zones = {};
    if(msgT > 0) msgT = Math.max(0, msgT - (dt || 0.033));
    g.save();
    if(!open){ drawHint(g); g.restore(); return false; }
    const c = viewCar(), ok = owned(c.id), lvs = lvOf(c.id), eff = statsOf(c);
    const pw = Math.min(W*0.94, H*1.35), ph = H*0.31, px = (W - pw)/2, py = H*0.285;
    g.fillStyle = 'rgba(2,10,16,0.70)'; g.fillRect(px, py, pw, ph);
    g.strokeStyle = 'rgba(93,240,200,0.45)'; g.lineWidth = 1; g.strokeRect(px, py, pw, ph);
    g.shadowColor = '#5df0c8'; g.shadowBlur = 4; g.textBaseline = 'middle';
    const fs = H*0.027;
    // 名前・矢印・閉じる
    FONT(g, H*0.044); g.textAlign = 'center'; g.fillStyle = ok ? '#5df0c8' : 'rgba(93,240,200,0.55)';
    g.fillText(c.name, W/2, py + ph*0.10);
    g.fillStyle = '#5df0c8'; g.fillText('◀', px + pw*0.10, py + ph*0.10); g.fillText('▶', px + pw*0.90, py + ph*0.10);
    zones.left  = { x:px, y:py, w:pw*0.22, h:ph*0.20 };
    zones.right = { x:px + pw*0.78, y:py, w:pw*0.22, h:ph*0.20 };
    FONT(g, fs); g.fillStyle = 'rgba(93,240,200,0.7)'; g.fillText('✕', px + pw - fs, py + fs*0.8); zones.close = { x:px + pw - fs*2.2, y:py, w:fs*2.2, h:fs*1.8 };
    // 所持コイン
    g.textAlign = 'left'; g.fillStyle = '#ffd23a'; g.shadowColor = '#ffd23a'; g.fillText(`◎ ${st.coins}`, px + 8, py + fs*0.8);
    if(admin){ g.fillStyle = '#ff7bd0'; g.shadowColor = '#ff7bd0'; g.fillText('ADMIN', px + 8, py + fs*2.0); }
    g.shadowColor = '#5df0c8';
    FONT(g, fs*0.95); g.textAlign = 'center'; g.fillStyle = 'rgba(93,240,200,0.65)'; g.fillText(c.role + (page === 'tune' ? '   ·   TUNE' : ''), W/2, py + ph*0.22);

    if(page === 'car'){
      // 性能バー（強化込み。黄色が強化で増えた分）
      const colW = pw*0.40, bx0 = px + pw*0.07, bx1 = px + pw*0.53, bh = H*0.012;
      const keys6 = ['handling','vmax','accel','brake','grip','mass'];
      keys6.forEach((k, i) => {
        const x = (i < 3 ? bx0 : bx1), y = py + ph*(0.38 + 0.13*(i%3)), r = RANGE[k];
        const base = (c.s[k] - r[0])/(r[1] - r[0]), bonus = (eff[k] - c.s[k])/(r[1] - r[0]);
        FONT(g, fs*0.72); g.textAlign = 'left'; g.fillStyle = k === 'handling' ? '#ffd23a' : 'rgba(93,240,200,0.7)';
        g.fillText(LABEL[k], x, y);
        bar(g, x + colW*0.46, y - bh/2, colW*0.54, bh, base, ok ? '#5df0c8' : 'rgba(93,240,200,0.5)', bonus);
      });
      // 状態（購入 / 所持）と ボタン
      FONT(g, fs*0.95); g.textAlign = 'center';
      let label, col;
      if(admin && !st.owned.includes(c.id)){ label = 'ADMIN  ·  UNLOCKED'; col = '#ff7bd0'; }
      else if(ok){ label = (c.id === st.sel ? 'OWNED  ·  SELECTED' : 'OWNED'); col = '#5df0c8'; }
      else if(st.coins >= c.price){ label = `BUY  ◎ ${c.price}`; col = '#ffd23a'; }
      else { label = `◎ ${c.price}   NEED ${c.price - st.coins} MORE`; col = '#ff7060'; }
      g.fillStyle = col; g.shadowColor = col;
      g.fillText(msgT > 0 && msg ? msg : label, W/2, py + ph*0.84);
      zones.action = { x:px + pw*0.2, y:py + ph*0.74, w:pw*0.6, h:ph*0.20 };
      g.shadowColor = '#5df0c8';
      if(ok){ FONT(g, fs*0.9); btn(g, 'tune', px + pw*0.80, py + ph*0.78, pw*0.18, ph*0.18, 'TUNE', '#ffd23a'); }
      FONT(g, fs*0.7); g.textAlign = 'center'; g.fillStyle = 'rgba(93,240,200,0.4)';
      g.fillText(IS_TOUCH_DEVICE ? '' : '← → CAR     T TUNE     G CLOSE     SPACE START/BUY', W/2, py + ph + fs*0.9);
    }else{
      // 強化ページ: 5項目（段階の四角・値・値段）と 色
      const rowsTop = 0.34, step = 0.105;
      TUNE_KEYS.forEach((k, i) => {
        const y = py + ph*(rowsTop + step*i), lv = lvs[k], sel = (row === i), T = TUNE[k];
        FONT(g, fs*0.82); g.textAlign = 'left';
        g.fillStyle = sel ? '#ffd23a' : 'rgba(93,240,200,0.8)'; g.shadowColor = g.fillStyle;
        g.fillText((sel ? '▶ ' : '  ') + T.label, px + pw*0.04, y);
        for(let n = 0; n < MAXLV; n++){                            // 段階
          const bx = px + pw*0.34 + n*pw*0.045, bs = H*0.016;
          g.fillStyle = n < lv ? '#ffd23a' : 'rgba(93,240,200,0.16)'; g.fillRect(bx, y - bs/2, pw*0.036, bs);
        }
        g.textAlign = 'left'; g.fillStyle = 'rgba(93,240,200,0.8)'; g.shadowColor = '#5df0c8';
        const v = (k === 'vmax' || k === 'accel' || k === 'brake') ? Math.round(eff[k]) : eff[k].toFixed(2);
        g.fillText(String(v), px + pw*0.60, y);
        const nextCost = lv >= MAXLV ? null : (admin ? 0 : T.cost[lv]);
        const can = nextCost !== null && st.coins >= nextCost;
        btn(g, 'up' + i, px + pw*0.74, y - ph*0.043, pw*0.22, ph*0.086, nextCost === null ? 'MAX' : `▲ ◎ ${nextCost}`, nextCost === null ? 'rgba(93,240,200,0.5)' : (can ? '#ffd23a' : '#ff7060'));
      });
      // 色
      const sy = py + ph*(rowsTop + step*5 + 0.01), sw = Math.min(pw*0.062, H*0.052), gap = pw*0.012, total = PAINTS.length*sw + (PAINTS.length - 1)*gap;
      let sx = px + (pw - total)/2;
      PAINTS.forEach((p, i) => {
        zones['sw' + i] = { x:sx, y:sy - sw/2, w:sw, h:sw };
        g.fillStyle = p.hex; g.shadowColor = p.hex; g.fillRect(sx, sy - sw/2, sw, sw);
        const cur = paintOf(c).toLowerCase() === p.hex.toLowerCase();
        g.strokeStyle = (row === TUNE_KEYS.length && colIdx === i) ? '#ffd23a' : (cur ? '#ffffff' : 'rgba(93,240,200,0.3)');
        g.lineWidth = (row === TUNE_KEYS.length && colIdx === i) || cur ? 2 : 1; g.strokeRect(sx, sy - sw/2, sw, sw);
        if(!paintOpen(p)){ g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(sx, sy - sw/2, sw, sw); g.fillStyle = '#ffd23a'; FONT(g, sw*0.30); g.textAlign = 'center'; g.fillText(String(p.price), sx + sw/2, sy); }
        sx += sw + gap;
      });
      g.lineWidth = 1; g.shadowColor = '#5df0c8';
      FONT(g, fs*0.82); g.textAlign = 'center'; g.fillStyle = msgT > 0 && msg ? '#ffd23a' : 'rgba(93,240,200,0.55)';
      g.fillText(msgT > 0 && msg ? msg : (row === TUNE_KEYS.length ? `PAINT: ${PAINTS[colIdx].id.toUpperCase()}${paintOpen(PAINTS[colIdx]) ? '' : '  ◎ ' + PAINTS[colIdx].price}` : 'ENTER: UPGRADE'), W/2, py + ph*0.955);
      btn(g, 'back', px + pw*0.02, py + ph*0.88, pw*0.14, ph*0.10, 'BACK', 'rgba(93,240,200,0.8)');
      FONT(g, fs*0.7); g.fillStyle = 'rgba(93,240,200,0.4)';
      g.fillText(IS_TOUCH_DEVICE ? '' : '↑ ↓ ROW     ← → CAR / COLOUR     ENTER UPGRADE · APPLY     T BACK', W/2, py + ph + fs*0.9);
    }
    g.restore();
    return true;
  }

  // タップ/クリック（clientX/Y）。ガレージの操作に使ったら true。false なら呼び出し側が「開始」として扱う
  function handleTap(cx, cy){
    if(typeof mode === 'undefined' || mode !== MODE.DEMO) return false;         // 走行中・ゲームオーバー中のタップ（操舵の指など）では何も起きない
    if(typeof cv === 'undefined' || !cv) return false;
    const r = cv.getBoundingClientRect(); if(!r.width) return false;
    const x = (cx - r.left)*(W/r.width), y = (cy - r.top)*(H/r.height);          // 描画座標(W×H)へ
    const hit = z => z && x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h;
    if(!open){ if(hit(zones.garage)){ setOpen(true); return true; } return false; }
    if(hit(zones.close)){ close(); return true; }
    if(hit(zones.left))  { select(-1); return true; }
    if(hit(zones.right)) { select(1);  return true; }
    if(page === 'tune'){
      if(hit(zones.back)){ page = 'car'; return true; }
      for(let i = 0; i < TUNE_KEYS.length; i++) if(hit(zones['up' + i])){ row = i; upgrade(TUNE_KEYS[i]); return true; }
      for(let i = 0; i < PAINTS.length; i++) if(hit(zones['sw' + i])){ row = TUNE_KEYS.length; colIdx = i; paint(i); return true; }
      return true;
    }
    if(hit(zones.tune)){ page = 'tune'; row = 0; return true; }
    if(!canStart()){ ready(); return true; }                                     // 未購入の車: タップは購入（開始しない）
    return false;                                                                // 持っている車: 開始
  }
  // デスクトップのクリック（タッチ端末は 16g が pointerup で handleTap を呼ぶ）
  try{
    if(typeof cv !== 'undefined' && cv && cv.addEventListener && typeof IS_TOUCH_DEVICE !== 'undefined' && !IS_TOUCH_DEVICE)
      cv.addEventListener('click', e => { handleTap(e.clientX, e.clientY); });
  }catch(_){}

  // 管理者モードの切り替え（タイトル画面で Alt+Shift+A）
  try{ window.addEventListener('keydown', e => {
    if(e.altKey && e.shiftKey && (e.code === 'KeyA' || e.key === 'A' || e.key === 'a') && typeof mode !== 'undefined' && mode === MODE.DEMO){
      admin = !admin; if(!admin && !st.owned.includes(st.sel)) st.sel = 'f328';
      say(admin ? 'ADMIN MODE: ALL CARS UNLOCKED' : 'ADMIN MODE OFF'); e.preventDefault();
    }
  }); }catch(_){}

  return { CARS, RANGE, LABEL, TUNE, TUNE_KEYS, PAINTS, MAXLV, SCHEMA, KEY, stats, statsOf, lvOf, paintOf, shownCar, visScale, fit,
           viewCar, selCar, select, ready, canStart, owned, addCoins, upgrade, paint, onKey, close, setOpen,
           isOpen(){ return open; }, page(){ return page; },
           onGameOver, drawPanel, handleTap, applyToPlayer,
           coins(){ return st.coins; }, isAdmin(){ return admin; }, _setAdmin(v){ admin = !!v; },
           _zones(){ return zones; }, _state(){ return st; }, _raw(){ return raw; }, _load: load, _save: save,
           _reset(s){ st = Object.assign(emptyState(), s || {}); raw = {}; open = false; page = 'car'; row = 0; colIdx = 0; view = Math.max(0, CARS.findIndex(c => c.id === st.sel)); },
           SPD_REF, CURVE_K };
})();
