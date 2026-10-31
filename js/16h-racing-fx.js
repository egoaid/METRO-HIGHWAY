// ════════════════════════════════════════════════
// VFD RACING — 演出（ホログラムのグリッチ / 山脈の色変化 / 速度感）
//
// IIFE で包み、公開は window.Hologram と window.SpeedFx のみ。描画だけを担当し、ゲームの状態は変えない
// （唯一の例外: SpeedFx.vis() は「見かけの進行速度」で、cam/他車の移動量に使う → 下記）。
// ════════════════════════════════════════════════

// ── ホログラム ──
// 設定: 道路の外にある建造物・木・街灯、遠景の山脈は「ホログラム」。時々、信号ノイズ(グリッチ)が乗る。
//  ・グリッチは「バースト」: 7〜16秒おきに 0.25〜0.7秒だけ発生（最初は 6〜11秒後）。あまり頻繁にしない。
//  ・バースト中は構造物の約45%に、60ms ごとに変わるパターンで次のいずれかが掛かる:
//      tear : 横に4分割して帯ごとに左右へずらす（走査線のズレ）
//      echo : 少しずらした残像を加算合成で重ねる
//    さらに一部は明滅（半透明）。道路・車・信号機・反射ポストは対象外（実体のある路上設備）。
//  ・バースト中は空の上に走査ノイズの帯も出る。
//  ・山脈の色: 20〜50秒おきに別の配色へ 2.5秒かけて滑らかに変わる。バースト中は色が瞬間的にちらつく。
window.Hologram = (function(){
  const rr = (a, b) => a + Math.random()*(b - a);
  let started = false, active = false, nextAt = 0, endAt = 0, burstAt = 0, seed = 1, frame = 0;

  // 山脈の配色（RGB。アルファは固定: 遠景 .55/.68、近景 .78/.90）
  const PAL = [
    { farTop:[124,108,190], farBot:[ 70, 58,120], nearTop:[ 96, 80,168], nearBot:[42,34,76] },  // 紫（従来）
    { farTop:[ 96,190,176], farBot:[ 40,100,100], nearTop:[ 60,160,150], nearBot:[20,56,62] },  // 青緑
    { farTop:[190,100,170], farBot:[110, 50,100], nearTop:[170, 70,150], nearBot:[70,28,64] },  // マゼンタ
    { farTop:[100,140,205], farBot:[ 48, 74,130], nearTop:[ 70,110,190], nearBot:[26,40,84] },  // 青
    { farTop:[205,150, 96], farBot:[120, 76, 46], nearTop:[180,120, 70], nearBot:[72,44,30] },  // 琥珀
  ];
  const KEYS = ['farTop', 'farBot', 'nearTop', 'nearBot'];
  const ALPHA = { farTop:0.55, farBot:0.68, nearTop:0.78, nearBot:0.90 };
  const FADE_MS = 2500;
  let palFrom = PAL[0], palTo = PAL[0], palT0 = 0, palIdx = 0, palNext = 0, palChanges = 0;

  function mixPal(a, b, k){
    const o = {};
    for(const key of KEYS) o[key] = [0,1,2].map(i => a[key][i] + (b[key][i] - a[key][i])*k);
    return o;
  }
  function palNow(t){
    const x = Math.min(1, Math.max(0, (t - palT0)/FADE_MS));
    return mixPal(palFrom, palTo, x*x*(3 - 2*x));
  }

  // 整数 2つ + バーストの seed から決まる乱数(0〜1)。同じバースト・同じ60msフレームなら毎回同じ結果。
  function hash(a, b){
    let h = (Math.imul(a|0, 374761393) + Math.imul(b|0, 668265263) + Math.imul(seed|0, 1274126177)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    return (h >>> 0)/4294967296;
  }

  function update(t){
    if(!started){ started = true; nextAt = t + rr(6000, 11000); palNext = t + rr(20000, 45000); palT0 = t - FADE_MS; }
    if(!active && t >= nextAt){ active = true; burstAt = t; endAt = t + rr(250, 700); seed = (Math.random()*1e9)|0; }
    else if(active && t >= endAt){ active = false; nextAt = t + rr(7000, 16000); }
    frame = active ? Math.floor((t - burstAt)/60) : 0;
    if(t >= palNext){                                  // 別の配色へ（今の色から滑らかに）
      palFrom = palNow(t);
      let n; do{ n = Math.floor(Math.random()*PAL.length); }while(n === palIdx && PAL.length > 1);
      palIdx = n; palTo = PAL[n]; palT0 = t; palNext = t + rr(20000, 50000); palChanges++;
    }
  }

  const rgba = (c, a) => `rgba(${c[0]|0},${c[1]|0},${c[2]|0},${a})`;
  // 山脈の4色。バースト中は一部フレームで別配色/明るさがちらつく
  function mountainFills(t){
    let p = palNow(t), gain = 1;
    if(active){
      if(hash(77, frame) < 0.30) p = PAL[Math.floor(hash(79, frame)*PAL.length)];
      if(hash(78, frame) < 0.35) gain = 0.65 + hash(80, frame)*0.9;
    }
    const o = {};
    for(const key of KEYS) o[key] = rgba(p[key].map(v => Math.min(255, v*gain)), ALPHA[key]);
    return o;
  }

  // 1つの構造物を描く。fn() がその描画。(x0,y0)-(x1,y1) は画面上の範囲。
  function paint(g, id, x0, y0, x1, y1, fn){
    if(!active){ fn(); return; }
    const r = hash(id, frame*3);
    const w = x1 - x0, h = y1 - y0;
    if(r > 0.45 || w < 2 || h < 2){ fn(); return; }
    const kind = hash(id, frame*3 + 1), amt = hash(id, frame*3 + 2);
    g.save();
    if(amt < 0.25) g.globalAlpha *= 0.30 + amt*2.4;    // 明滅
    if(kind < 0.5){                                    // tear: 4つの帯を左右にずらす
      const bands = 4, bh = h/bands;
      for(let b = 0; b < bands; b++){
        const dx = (hash(id*7 + b, frame) - 0.5)*w*(b % 2 ? 0.40 : 0.22);
        g.save();
        g.beginPath(); g.rect(x0 - w, y0 + b*bh, w*3, bh + 1); g.clip();
        g.translate(dx, 0); fn();
        g.restore();
      }
    }else{                                             // echo: ずらした残像を加算合成
      fn();
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha *= 0.35;
      g.translate((hash(id, frame*3 + 5) - 0.5)*w*0.16, 0);
      fn();
    }
    g.restore();
  }

  // 走査ノイズの帯（空の部分だけ。yTop〜yBottom）
  function overlay(g, w, yTop, yBottom){
    if(!active || yBottom <= yTop) return;
    const n = 5 + Math.floor(hash(91, frame)*8);
    g.save();
    g.globalCompositeOperation = 'lighter';
    for(let i = 0; i < n; i++){
      const y = yTop + hash(92 + i, frame)*(yBottom - yTop);
      const bw = w*(0.12 + hash(120 + i, frame)*0.5), bx = hash(150 + i, frame)*(w - bw);
      g.fillStyle = hash(180 + i, frame) < 0.5 ? 'rgba(120,255,230,0.22)' : 'rgba(255,90,210,0.18)';
      g.fillRect(bx, y, bw, 1 + Math.floor(hash(200 + i, frame)*3));
    }
    g.restore();
  }

  return { update, paint, overlay, mountainFills,
           get active(){ return active; }, get paletteChanges(){ return palChanges; }, _palCount: PAL.length };
})();

// ── 速度感 ──
// 時速200km以上を「厳密に」再現すると映像が速すぎて操作できない。そこで物理(表示km/h・走行距離)は
// そのままに、見え方だけを段階的に強める。すべて player.speed の一つの指標 level(v) から決める（ルール化）:
//   level(v): 120km/h 以下で 0、220km/h 以上で 1、その間は滑らか。
//  1) 見かけの進行速度 vis(v): 120km/h を超えた分を 1.5倍にして、背景の流れる速さと他車の相対速度に使う
//     → 220km/h は見かけ 270km/h 相当。自車も他車も同じ vis() を通すので、他車が止まって見えることはない
//        （自車より遅い車はつねに「物理の差 以上」の速さで近づく。自車と同速の車だけが並走して見える）。
//  2) 放射状のスピードライン（画面の左右、消失点から外へ流れる）
//  3) 画面の微振動（縦方向）
//  4) 残像（高速ほど長く残る）
//  5) 道路端の反射ポスト（16a/16f）が近景を速く流れる（常時）
//  6) エネルギータンク中（v1.9.1）: 追加の引数 e(0〜1) で 2)3)4) をさらに強める。スピードラインは本数が倍・長く・速く・広い角度・緑がかる。
//     e は EnergyTank.level()（最高速を超えた分 ÷ +ENERGY_VMAX_BONUS）。見かけの進行速度 vis() は変えない（物理・難易度に影響させない）。
window.SpeedFx = (function(){
  const START = 120, FULL = 220, GAIN = 1.5;
  function level(v){
    const t = (v - START)/(FULL - START);
    return t <= 0 ? 0 : t >= 1 ? 1 : t*t*(3 - 2*t);
  }
  function vis(v){ return v <= START ? v : START + (v - START)*GAIN; }
  // 縦の微振動(px)。k = 画面サイズの補正（H/540 程度）
  function shakeY(t, v, k, e){
    e = e || 0;
    const sp = Math.max(level(v), e*0.7);
    if(sp <= 0) return 0;
    return (Math.sin(t*0.047) + 0.7*Math.sin(t*0.0113 + 1.3) + 0.4*Math.sin(t*0.131))*sp*0.9*k*(1 + 0.8*e);
  }
  // 残像の消し込みアルファ（小さいほど残る）
  function trailAlpha(v, e){ return 0.50 - 0.16*level(v) - 0.12*(e || 0); }

  // スピードライン: 消失点(vx,vy)から左右へ放射。角度は±35°（水平付近）に限る（道路の中央は避ける）。
  const N = 28, STREAKS = [];
  for(let i = 0; i < N; i++){
    const base = (i*0.6180339887) % 1, side = i % 2 ? 1 : -1;
    const off = (base*70 - 35)*Math.PI/180;
    STREAKS.push({ ang: side > 0 ? off : Math.PI + off, phase: (i*0.37) % 1, k: 0.7 + ((i*0.29) % 1)*0.6, len: 0.5 + ((i*0.53) % 1)*0.8 });
  }
  function drawStreaks(g, w, sh, vx, vy, t, v, e){
    e = e || 0;
    const sp = Math.max(level(v), e);
    if(sp < 0.03) return;
    const R = Math.hypot(w, sh*2), flat = sh/w, rate = 0.6 + 1.6*sp + 1.4*e;
    const col = `${200 - 80*e|0},255,${245 - 55*e|0}`;                      // 通常は白っぽい水色 → ブースト中は緑
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'round';
    for(let pass = 0; pass < (e > 0.05 ? 2 : 1); pass++){                  // ブースト中は本数が倍（2周目は位相をずらす）
      const pk = pass ? e : 1;
      for(let i = 0; i < STREAKS.length; i++){
        const s = STREAKS[i];
        const u = (s.phase + (pass ? 0.5 : 0) + t*0.001*rate*s.k*(pass ? 1.15 : 1)) % 1;
        // 画面の周辺だけ（消失点から離れた位置で出現し、外へ伸びながら流れる）。道路や車の近くは通らない
        const r0 = R*(0.30 + 0.45*u*u), r1 = r0 + R*(0.02 + 0.12*u)*s.len*(1 + 0.8*e);
        const a = sp*0.32*(1 + 0.9*e)*pk*Math.sin(Math.PI*u);
        if(a < 0.01) continue;
        const ang = s.ang, c = Math.cos(ang), sn = Math.sin(ang)*flat*2*(1 + 0.45*e);   // 角度は上下へ少し広がる
        g.strokeStyle = `rgba(${col},${Math.min(0.9, a)})`;
        g.lineWidth = Math.max(1, w/900*(1 + 1.6*u)*(1 + 0.8*e));
        g.beginPath();
        g.moveTo(vx + c*r0, vy + sn*r0);
        g.lineTo(vx + c*r1, vy + sn*r1);
        g.stroke();
      }
    }
    g.restore();
  }
  return { level, vis, shakeY, trailAlpha, drawStreaks, START, FULL, GAIN };
})();
