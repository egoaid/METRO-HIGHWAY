

// ════════════════════════════════════
// 走行音・衝突音 (Web Audio API)
//
// エンジン音（v1.7.0 で作り直し）。車ごとに「気筒数・回転数・音色」が違う。
//  ・回転数 rpm は 速度とギアから決める（ギアごとに速度の範囲があり、アップシフトで回転が落ちてまた上がる）。
//  ・基本の音は「点火の周波数」 f0 = rpm/60 × 気筒数/2 （4ストロークは1回転で気筒数/2回点火）。
//    V8 の 7600rpm なら約507Hz、アイドルの 950rpm なら約63Hz。ここに、排気の脈動に近い倍音の並び
//    （PeriodicWave: 倍音 n の強さ n^-p、奇数次の強調 odd）を持つ波を使う。
//  ・重ねる音: ①排気の主音 ②半次数のうねり（V8の「ボボボ」: f0/2）③少しずらした二重音（不揃いな点火の厚み）
//    ④吸気ノイズ（回転とアクセルで明るくなる）⑤高回転のメカ音 ⑥ターボの笛と、アクセルを戻した時のブローオフ（F40）
//  ・アクセルを踏むと音が明るく大きく、離すとこもって小さくなる（エンジンブレーキ）。
// 車ごとの設定は ENGINES（キーは 16l の車の id）。
// ════════════════════════════════════
let sndCtx = null;
let sndReady = false;
let eng = null;                    // エンジン音のノード一式（initSound で作る）
let roadNoiseGain=null;            // ロードノイズ
const ENGINES = {
  //            cyl: 気筒数  idle/red: アイドル/レッドゾーンの rpm  gears: 段数  p: 倍音の減衰（小さいほど明るい）  odd: 奇数次の強調
  //            lump: 半次数のうねり  drive: 歪み  cut: 音の明るさ（ローパスの下限/上限Hz）  vol: 音量  intake/whine: 吸気/メカ音  turbo: ターボ
  f328:      { cyl:8, idle:950,  red:7600, gears:5, p:1.15, odd:1.0, lump:0.16, drive:1.6, cut:[500,3800], vol:1.00, intake:0.9, whine:0.5, turbo:0 },   // フラットプレーン風V8: 高く抜ける
  compact:   { cyl:4, idle:850,  red:6800, gears:5, p:1.00, odd:1.6, lump:0.04, drive:1.3, cut:[600,4200], vol:0.85, intake:1.3, whine:0.9, turbo:0 },   // 直4: 細くブンブン
  coupe:     { cyl:4, idle:1000, red:8800, gears:5, p:0.80, odd:0.8, lump:0.00, drive:1.0, cut:[900,6200], vol:0.90, intake:0.8, whine:1.5, turbo:0 },   // 高回転型（ロータリー風）: 滑らかに甲高い
  saloon:    { cyl:6, idle:750,  red:6200, gears:4, p:1.50, odd:1.0, lump:0.03, drive:1.1, cut:[400,2600], vol:0.90, intake:0.7, whine:0.3, turbo:0 },   // 直6: 絹のように滑らか
  executive: { cyl:8, idle:650,  red:5200, gears:4, p:1.70, odd:0.8, lump:0.45, drive:1.9, cut:[300,1900], vol:1.15, intake:0.6, whine:0.1, turbo:0 },   // 大排気量V8: 低く太いボボボ
  f40:       { cyl:8, idle:1000, red:8200, gears:5, p:1.00, odd:1.1, lump:0.22, drive:2.2, cut:[600,5200], vol:1.05, intake:1.0, whine:0.8, turbo:1 },   // ツインターボV8: 荒々しい+ターボの笛+ブローオフ
};
const engState = { prof:null, load:0, boost:0, gear:-1, shiftT:0, lastThrottle:0 };

function engProfileId(){ return (typeof Garage!=='undefined' && Garage.selCar && ENGINES[Garage.selCar().id]) ? Garage.selCar().id : 'f328'; }

// 排気の脈動に近い倍音の波（odd: 奇数次を odd 倍、p: n^-p で減衰）
function makeEngineWave(P){
  const N = 40, re = new Float32Array(N + 1), im = new Float32Array(N + 1);
  for(let n = 1; n <= N; n++) im[n] = Math.pow(n, -P.p) * (n % 2 ? P.odd : 1);
  return sndCtx.createPeriodicWave(re, im);
}

function initSound(){
  if(sndReady) return;
  try {
    sndCtx = new (window.AudioContext||window.webkitAudioContext)();
    const comp = sndCtx.createDynamicsCompressor();
    comp.threshold.value=-12; comp.ratio.value=4;
    comp.connect(sndCtx.destination);

    const master = sndCtx.createGain(); master.gain.value=0; master.connect(comp);
    const noiseBuf = sndCtx.createBuffer(1, sndCtx.sampleRate*3, sndCtx.sampleRate), nd = noiseBuf.getChannelData(0);
    for(let i=0;i<nd.length;i++) nd[i]=Math.random()*2-1;
    const noise = () => { const n = sndCtx.createBufferSource(); n.buffer=noiseBuf; n.loop=true; return n; };

    // ①排気の主音: 脈動波 → 歪み → ローパス
    const main = sndCtx.createOscillator(); main.frequency.value=60;
    const shaper = sndCtx.createWaveShaper(), curve = new Float32Array(512);
    shaper.curve = curve;                                     // 歪みの強さは車ごと（applyEngineProfile で作り直す）
    const lp = sndCtx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=1500; lp.Q.value=1.2;
    const mainG = sndCtx.createGain(); mainG.gain.value=0.6;
    main.connect(shaper); shaper.connect(lp); lp.connect(mainG); mainG.connect(master);
    // ②半次数のうねり（V8の「ボボボ」）
    const lump = sndCtx.createOscillator(); lump.type='triangle'; lump.frequency.value=30;
    const lumpG = sndCtx.createGain(); lumpG.gain.value=0; lump.connect(lumpG); lumpG.connect(master);
    // ③少しずらした二重音（不揃いな点火の厚み）
    const twin = sndCtx.createOscillator(); twin.frequency.value=60;
    const twinLp = sndCtx.createBiquadFilter(); twinLp.type='lowpass'; twinLp.frequency.value=1200; twinLp.Q.value=0.7;
    const twinG = sndCtx.createGain(); twinG.gain.value=0.25; twin.connect(twinLp); twinLp.connect(twinG); twinG.connect(master);
    // ④吸気ノイズ
    const inN = noise(), inBp = sndCtx.createBiquadFilter(); inBp.type='bandpass'; inBp.frequency.value=500; inBp.Q.value=0.8;
    const inG = sndCtx.createGain(); inG.gain.value=0; inN.connect(inBp); inBp.connect(inG); inG.connect(master);
    // ⑤高回転のメカ音
    const whN = noise(), whBp = sndCtx.createBiquadFilter(); whBp.type='bandpass'; whBp.frequency.value=3000; whBp.Q.value=4;
    const whG = sndCtx.createGain(); whG.gain.value=0; whN.connect(whBp); whBp.connect(whG); whG.connect(master);
    // ⑥ターボの笛 とブローオフ
    const tur = sndCtx.createOscillator(); tur.type='sine'; tur.frequency.value=2000;
    const turG = sndCtx.createGain(); turG.gain.value=0; tur.connect(turG); turG.connect(master);
    const boN = noise(), boBp = sndCtx.createBiquadFilter(); boBp.type='bandpass'; boBp.frequency.value=2600; boBp.Q.value=0.9;
    const boG = sndCtx.createGain(); boG.gain.value=0; boN.connect(boBp); boBp.connect(boG); boG.connect(master);

    // ロードノイズ（タイヤ+風切り）
    const rn = noise(), rBp = sndCtx.createBiquadFilter(); rBp.type='bandpass'; rBp.frequency.value=300; rBp.Q.value=0.6;
    roadNoiseGain = sndCtx.createGain(); roadNoiseGain.gain.value=0;
    rn.connect(rBp); rBp.connect(roadNoiseGain); roadNoiseGain.connect(master);

    eng = { master, main, shaper, curve, lp, mainG, lump, lumpG, twin, twinLp, twinG, inBp, inG, whBp, whG, tur, turG, boG };
    [main, lump, twin, tur, inN, whN, boN, rn].forEach(n => n.start());
    sndReady=true;
    engState.prof = null; engState.gear = -1;
  } catch(e){ sndReady=false; }
}

// 車（プロファイル）を切り替えた時に、車ごとに変わる値を入れ直す
function applyEngineProfile(id){
  const P = ENGINES[id] || ENGINES.f328, E = eng;
  const w = makeEngineWave(P); E.main.setPeriodicWave(w); E.twin.setPeriodicWave(w);
  for(let i=0;i<512;i++){ const x=i/256-1; E.curve[i]=Math.tanh(x*P.drive*2.2)*0.8 + Math.sin(x*Math.PI)*0.2; }
  E.shaper.curve = E.curve;
  engState.prof = id; engState.gear = -1; engState.boost = 0;
}

function updateEngineSound(speed, maxSpeed){
  if(!sndReady||!eng) return;
  const now = sndCtx.currentTime, E = eng;
  const id = engProfileId(); if(engState.prof !== id) applyEngineProfile(id);
  const P = ENGINES[id];
  const isActive = (mode===MODE.PLAY);

  // ── アクセル（滑らかに）──
  const thr = (isActive && typeof keys!=='undefined' && keys.U) ? 1 : 0;
  engState.load += (thr - engState.load)*0.18;
  const load = engState.load;

  // ── ギアと回転数 ──
  const N = P.gears, v = Math.max(0, Math.min(maxSpeed, speed));
  const bound = i => maxSpeed*Math.pow(i/N, 0.8);
  let gear = 0; while(gear < N-1 && v >= bound(gear+1)) gear++;
  const t = (v - bound(gear))/Math.max(1e-6, bound(gear+1) - bound(gear));
  const lo = gear === 0 ? P.idle/P.red : 0.60, hi = gear === N-1 ? 0.92 : 0.97;
  const frac = lo + (hi - lo)*Math.max(0, Math.min(1, t));          // 回転数 / レッド
  const rpm = P.red*frac;
  const f0 = rpm/60*P.cyl/2;                                         // 点火の周波数

  // シフト: 回転が落ちるのでアクセルを一瞬抜く（音量を落とす）。ターボ車はブローオフ
  if(engState.gear >= 0 && gear > engState.gear){ engState.shiftT = 0.16; if(P.turbo && engState.boost > 0.45) blowOff(now); }
  engState.gear = gear;
  if(engState.shiftT > 0) engState.shiftT = Math.max(0, engState.shiftT - 0.033);

  E.main.frequency.setTargetAtTime(f0, now, 0.035);
  E.twin.frequency.setTargetAtTime(f0*1.006, now, 0.035);
  E.lump.frequency.setTargetAtTime(f0/2, now, 0.035);

  // ── 音色: 回転とアクセルで明るくなる ──
  const bright = Math.min(1, frac*0.7 + load*0.45);
  E.lp.frequency.setTargetAtTime(P.cut[0] + (P.cut[1]-P.cut[0])*bright, now, 0.06);
  E.twinLp.frequency.setTargetAtTime((P.cut[0] + (P.cut[1]-P.cut[0])*bright)*0.7, now, 0.06);
  E.mainG.gain.setTargetAtTime(0.50 + 0.25*load, now, 0.06);
  E.twinG.gain.setTargetAtTime(0.18 + 0.10*frac, now, 0.06);
  E.lumpG.gain.setTargetAtTime(P.lump*(0.4 + 0.6*(1-frac))*(0.6 + 0.4*load), now, 0.06);   // うねりは低回転で目立つ
  E.inBp.frequency.setTargetAtTime(350 + 2200*frac, now, 0.06);
  E.inG.gain.setTargetAtTime(P.intake*0.05*(0.25 + 0.75*load)*(0.4 + frac), now, 0.06);
  E.whBp.frequency.setTargetAtTime(1800 + 4200*frac, now, 0.06);
  E.whG.gain.setTargetAtTime(P.whine*0.018*Math.pow(frac, 2.2)*(0.4 + 0.6*load), now, 0.06);

  // ── ターボ: ブーストは アクセル×回転 に遅れて追従。笛の高さ=ブースト ──
  const tgtBoost = P.turbo ? load*Math.pow(frac, 1.4) : 0;
  engState.boost += (tgtBoost - engState.boost)*(tgtBoost > engState.boost ? 0.05 : 0.12);
  if(P.turbo && engState.lastThrottle >= 0.7 && load < 0.7 && engState.boost > 0.35) blowOff(now);   // アクセルを戻した瞬間（ブーストが残っている時）
  engState.lastThrottle = load;
  E.tur.frequency.setTargetAtTime(1800 + 3600*engState.boost, now, 0.05);
  E.turG.gain.setTargetAtTime(P.turbo ? 0.045*engState.boost : 0, now, 0.05);

  // ── 音量: PLAYのみ。DEMOと待機中はほぼ無音 ──
  const shiftDip = engState.shiftT > 0 ? 0.35 : 1;
  const vol = isActive ? (0.07 + 0.15*frac*(0.55 + 0.45*load))*P.vol*shiftDip : 0.01;
  E.master.gain.setTargetAtTime(vol, now, 0.06);

  // ロードノイズ: PLAYモード・速度に比例
  roadNoiseGain.gain.setTargetAtTime(isActive ? (v/maxSpeed)*0.25 : 0, now, 0.08);
}

// ターボのブローオフ（アクセルを戻した時の「プシュッ」）
function blowOff(now){
  if(!eng) return; const g = eng.boG.gain;
  g.cancelScheduledValues(now); g.setValueAtTime(0.0001, now);
  g.linearRampToValueAtTime(0.20, now + 0.012); g.exponentialRampToValueAtTime(0.001, now + 0.45);
  engState.boost *= 0.4;
}

function playStarSound(){
  if(!sndReady) return;
  // 星を取った時: 明るい上昇アルペジオ（C6 E6 G6 C7）
  const now = sndCtx.currentTime;
  [1046.5,1318.5,1568,2093].forEach((f,i)=>{
    const osc = sndCtx.createOscillator(), gn = sndCtx.createGain();
    osc.type='triangle'; osc.frequency.value=f;
    const t0 = now + i*0.07;
    gn.gain.setValueAtTime(0.0001,t0);
    gn.gain.exponentialRampToValueAtTime(0.16,t0+0.015);
    gn.gain.exponentialRampToValueAtTime(0.001,t0+0.28);
    osc.connect(gn); gn.connect(sndCtx.destination);
    osc.start(t0); osc.stop(t0+0.30);
  });
}
function playHeartSound(){
  if(!sndReady) return;
  // ハートを取った時: やわらかい2音（A5 → E6）。星の明るいアルペジオより控えめ
  const now = sndCtx.currentTime;
  [880,1318.5].forEach((f,i)=>{
    const osc = sndCtx.createOscillator(), gn = sndCtx.createGain();
    osc.type='sine'; osc.frequency.value=f;
    const t0 = now + i*0.09;
    gn.gain.setValueAtTime(0.0001,t0);
    gn.gain.exponentialRampToValueAtTime(0.16,t0+0.02);
    gn.gain.exponentialRampToValueAtTime(0.001,t0+0.30);
    osc.connect(gn); gn.connect(sndCtx.destination);
    osc.start(t0); osc.stop(t0+0.32);
  });
}
function playCoinSound(combo){
  if(!sndReady) return;
  // コイン: 短い「チン」。続けて取るほど半音ずつ高くなる（最大7段）
  const now = sndCtx.currentTime, f = 1318.5*Math.pow(2,(combo||0)/12);
  [f, f*1.5].forEach((fr,i)=>{
    const osc = sndCtx.createOscillator(), gn = sndCtx.createGain();
    osc.type='square'; osc.frequency.value=fr;
    const t0 = now + i*0.045;
    gn.gain.setValueAtTime(0.0001,t0);
    gn.gain.exponentialRampToValueAtTime(0.07,t0+0.008);
    gn.gain.exponentialRampToValueAtTime(0.001,t0+0.16);
    osc.connect(gn); gn.connect(sndCtx.destination);
    osc.start(t0); osc.stop(t0+0.18);
  });
}
function playPurchaseSound(){
  if(!sndReady) return;
  const now = sndCtx.currentTime;
  [523.3,659.3,784,1046.5].forEach((fr,i)=>{
    const osc = sndCtx.createOscillator(), gn = sndCtx.createGain();
    osc.type='triangle'; osc.frequency.value=fr;
    const t0 = now + i*0.08;
    gn.gain.setValueAtTime(0.0001,t0);
    gn.gain.exponentialRampToValueAtTime(0.14,t0+0.02);
    gn.gain.exponentialRampToValueAtTime(0.001,t0+0.35);
    osc.connect(gn); gn.connect(sndCtx.destination);
    osc.start(t0); osc.stop(t0+0.38);
  });
}
function playCrashSound(){
  if(!sndReady) return;
  const now = sndCtx.currentTime;
  // 衝突音: ノイズバースト + 低音パンチ
  const g2 = sndCtx.createGain();
  g2.gain.setValueAtTime(0.6, now);
  g2.gain.exponentialRampToValueAtTime(0.001, now+0.35);
  g2.connect(sndCtx.destination);

  // ノイズ(金属衝突感)
  const buf = sndCtx.createBuffer(1, Math.ceil(sndCtx.sampleRate*0.35), sndCtx.sampleRate);
  const d = buf.getChannelData(0);
  for(let i=0;i<d.length;i++) d[i]=(Math.random()*2-1)*(1-i/d.length);
  const src = sndCtx.createBufferSource();
  src.buffer = buf;
  const filt = sndCtx.createBiquadFilter();
  filt.type='bandpass'; filt.frequency.value=800; filt.Q.value=1.5;
  src.connect(filt); filt.connect(g2);
  src.start(now);

  // 低音パンチ
  const osc2 = sndCtx.createOscillator();
  const g3 = sndCtx.createGain();
  osc2.type='sine'; osc2.frequency.setValueAtTime(180,now);
  osc2.frequency.exponentialRampToValueAtTime(40,now+0.25);
  g3.gain.setValueAtTime(0.5,now);
  g3.gain.exponentialRampToValueAtTime(0.001,now+0.30);
  osc2.connect(g3); g3.connect(sndCtx.destination);
  osc2.start(now); osc2.stop(now+0.30);
}

function playPassSound(){
  if(!sndReady) return;
  // 追い越し時: ドップラー効果風のスウィープ
  const now = sndCtx.currentTime;
  const osc = sndCtx.createOscillator();
  const gn  = sndCtx.createGain();
  osc.type='sawtooth';
  osc.frequency.setValueAtTime(320,now);
  osc.frequency.linearRampToValueAtTime(120,now+0.18);
  gn.gain.setValueAtTime(0.12,now);
  gn.gain.exponentialRampToValueAtTime(0.001,now+0.20);
  osc.connect(gn); gn.connect(sndCtx.destination);
  osc.start(now); osc.stop(now+0.22);
}

addLog('METRO HIGHWAY — CYBERPUNK DRIVE');
addLog('SPACE / PLAY BUTTON TO START');
rafId=requestAnimationFrame(frame);
// END VFD RACING ENGINE v3
