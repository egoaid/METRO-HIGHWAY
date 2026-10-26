

// ════════════════════════════════════
// 走行音・衝突音 (Web Audio API)
//
// エンジン音（v1.8.2 で低音重視に作り直し）。車ごとに「気筒数・回転数・音色」が違う。
//  ・回転数 rpm は 速度とギアから決める（ギアごとに速度の範囲があり、アップシフトで回転が落ちてまた上がる）。
//  ・点火の周波数 f0 = rpm/60 × 気筒数/2。ただし、そのまま鳴らすと 350〜500Hz の「ピー」という単音になる
//    （v1.8.1 を周波数分析した結果: 走行中の 20〜250Hz のエネルギーは 0〜10%、600〜1500Hz に 60〜90%、主音が周囲より 35〜55dB 突出）。
//    実機のエンジンは、低い回転次数（半次・1次・1.5次…）に厚みがあり、点火が不揃いで、倍音が低い方に密集している。
//    そこで主音は f0 × pitch（V8 は 0.5 = 1オクターブ下）で鳴らし、倍音の減衰を急に（p）して、
//    下記の層で低音と粗さを作る。
//  ・層: ①主音（倍音の波 → 歪み → ローパス。歪みは「手前のゲイン」で車ごとに変える）
//        ②サブ（主音の半分の周波数の正弦波: 腹に響く「ボーン」）
//        ③粗さ（回転数と同じ周波数で主音の音量をゆらす: V8 の不揃いな点火の「ボボボ」）
//        ④少しずらした二重音 ⑤吸気・排気のこもったノイズ ⑥高回転のメカ音（控えめ）
//        ⑦ターボの笛（F40。低めの周波数で控えめ）とブローオフ
//        周波数は毎フレーム ±0.8% ゆらす（完全に周期的だと機械的なビープになる）。
//  ・全体を 低音の持ち上げ（ローシェルフ +7dB / 120Hz、ピーク +4dB / 85Hz）と 高域のカット（ハイシェルフ −9dB / 2.2kHz）に通す。
//  ・アクセルを踏むと明るく大きく、離すとこもって小さくなる（エンジンブレーキ）。
// 車ごとの設定は ENGINES（キーは 16l の車の id）。
// 注意: WaveShaperNode.curve は一度しか代入できない（仕様。2回目は例外）。曲線は初期化で1回だけ代入する。
// ════════════════════════════════════
let sndCtx = null;
let sndReady = false;
let eng = null;                    // エンジン音のノード一式（initSound で作る）
let roadNoiseGain=null;            // ロードノイズ
const ENGINES = {
  // cyl: 気筒数  idle/red: アイドル/レッドゾーンの rpm  gears: 段数  p: 倍音の減衰（大きいほど低音寄り）  even: 偶数次の強調
  // pitch: 主音を点火周波数の何倍で鳴らすか  sub: サブ（半分の周波数）の量  rough: 粗さ（回転周波数での音量のゆれ）  drive: 歪み
  // cut: 音の明るさ（ローパスの下限/上限Hz）  vol: 音量  intake/whine: 吸気ノイズ/メカ音  turbo: ターボ
  f328:      { cyl:8, idle:950,  red:7600, gears:5, p:1.15, even:1.60, pitch:0.50, sub:0.25, rough:0.34, drive:1.8, cut:[320,1420], vol:1.00, intake:1.0, whine:0.35, turbo:0 },   // フラットプレーン風V8: 太く、上で抜ける
  compact:   { cyl:4, idle:850,  red:6800, gears:5, p:1.05, even:2.40, pitch:0.50, sub:0.10, rough:0.18, drive:1.5, cut:[340,1650], vol:0.90, intake:1.3, whine:0.60, turbo:0 },   // 直4: 軽く元気
  coupe:     { cyl:4, idle:1000, red:8800, gears:5, p:0.95, even:3.00, pitch:0.50, sub:0.07, rough:0.10, drive:1.2, cut:[410,2250], vol:0.90, intake:0.9, whine:1.00, turbo:0 },   // 高回転型（ロータリー風）: 滑らかで伸びる
  saloon:    { cyl:6, idle:750,  red:6200, gears:4, p:1.30, even:3.00, pitch:0.50, sub:0.18, rough:0.10, drive:1.2, cut:[270,1120], vol:0.95, intake:0.8, whine:0.20, turbo:0 },   // 直6: 絹のように滑らか
  executive: { cyl:8, idle:650,  red:5200, gears:4, p:1.45, even:1.50, pitch:0.50, sub:0.32, rough:0.42, drive:2.0, cut:[220,900], vol:1.10, intake:0.7, whine:0.10, turbo:0 },   // 大排気量V8: 低く太いボボボ
  f40:       { cyl:8, idle:1000, red:8200, gears:5, p:1.00, even:1.70, pitch:0.50, sub:0.22, rough:0.26, drive:2.4, cut:[390,1950], vol:1.05, intake:1.1, whine:0.50, turbo:1 },   // ツインターボV8: 荒々しい+ターボの笛+ブローオフ
};
const ENGINE_GAIN = 0.22;           // 全体の音量（v1.8.1 より低音が増えて大きく聞こえるため、実測の RMS が約 -26dBFS になるよう下げた）
const engState = { prof:null, load:0, boost:0, gear:-1, shiftT:0, lastThrottle:0 };

function engProfileId(){ return (typeof Garage!=='undefined' && Garage.selCar && ENGINES[Garage.selCar().id]) ? Garage.selCar().id : 'f328'; }

// 排気の脈動に近い倍音の波（even: 偶数次を even 倍、p: n^-p で減衰）
function makeEngineWave(P){
  const N = 40, re = new Float32Array(N + 1), im = new Float32Array(N + 1);
  for(let n = 1; n <= N; n++) im[n] = Math.pow(n, -P.p) * (n % 2 ? 1 : P.even);
  return sndCtx.createPeriodicWave(re, im);
}

function initSound(){
  if(sndReady) return;
  try {
    sndCtx = new (window.AudioContext||window.webkitAudioContext)();
    const comp = sndCtx.createDynamicsCompressor();
    comp.threshold.value=-14; comp.ratio.value=4;
    comp.connect(sndCtx.destination);

    // 音全体の仕上げ: 低音を持ち上げ、高域を削る（小さなスピーカーでも低音が「聞こえる」帯域 80〜250Hz を厚くする）
    const master = sndCtx.createGain(); master.gain.value=0;
    const ls = sndCtx.createBiquadFilter(); ls.type='lowshelf';  ls.frequency.value=120; ls.gain.value=5;
    const pk = sndCtx.createBiquadFilter(); pk.type='peaking';   pk.frequency.value=90;  pk.Q.value=1.0; pk.gain.value=2.5;
    const hs = sndCtx.createBiquadFilter(); hs.type='highshelf'; hs.frequency.value=2500; hs.gain.value=-7;
    master.connect(ls); ls.connect(pk); pk.connect(hs); hs.connect(comp);

    const noiseBuf = sndCtx.createBuffer(1, sndCtx.sampleRate*3, sndCtx.sampleRate), nd = noiseBuf.getChannelData(0);
    for(let i=0;i<nd.length;i++) nd[i]=Math.random()*2-1;
    const noise = () => { const n = sndCtx.createBufferSource(); n.buffer=noiseBuf; n.loop=true; return n; };

    // ①主音: 脈動波 → 手前のゲイン(歪みの量) → 歪み(固定曲線) → ローパス → 音量(粗さで揺らす)
    const main = sndCtx.createOscillator(); main.frequency.value=40;
    const pre = sndCtx.createGain(); pre.gain.value=1.8;
    const shaper = sndCtx.createWaveShaper(), curve = new Float32Array(1024);
    for(let i=0;i<1024;i++){ const x=i/512-1; curve[i]=Math.tanh(x*2.2)*0.85 + Math.sin(x*Math.PI)*0.15; }
    shaper.curve = curve;                                      // 一度だけ代入（2回目は InvalidStateError）。車ごとの歪みは pre.gain で変える
    const lp = sndCtx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=600; lp.Q.value=0.7;
    const mainG = sndCtx.createGain(); mainG.gain.value=0.6;
    main.connect(pre); pre.connect(shaper); shaper.connect(lp); lp.connect(mainG); mainG.connect(master);
    // ②サブ（主音の半分の周波数の正弦波）
    const sub = sndCtx.createOscillator(); sub.type='sine'; sub.frequency.value=20;
    const subG = sndCtx.createGain(); subG.gain.value=0; sub.connect(subG); subG.connect(master);
    // ③粗さ: 回転数と同じ周波数の正弦波で主音の音量を揺らす
    const lfo = sndCtx.createOscillator(); lfo.type='sine'; lfo.frequency.value=15;
    const lfoG = sndCtx.createGain(); lfoG.gain.value=0; lfo.connect(lfoG); lfoG.connect(mainG.gain);
    // ④少しずらした二重音
    const twin = sndCtx.createOscillator(); twin.frequency.value=40;
    const twinLp = sndCtx.createBiquadFilter(); twinLp.type='lowpass'; twinLp.frequency.value=500; twinLp.Q.value=0.6;
    const twinG = sndCtx.createGain(); twinG.gain.value=0.25; twin.connect(twinLp); twinLp.connect(twinG); twinG.connect(master);
    // ⑤吸気・排気のこもったノイズ
    const inN = noise(), inBp = sndCtx.createBiquadFilter(); inBp.type='bandpass'; inBp.frequency.value=250; inBp.Q.value=0.7;
    const inG = sndCtx.createGain(); inG.gain.value=0; inN.connect(inBp); inBp.connect(inG); inG.connect(master);
    // 点火に同期して脈打つノイズ（排気の「ドッドッ」）: 点火周波数の正弦波で吸気ノイズの音量を揺らす
    const puls = sndCtx.createOscillator(); puls.type='sine'; puls.frequency.value=30;
    const pulsG = sndCtx.createGain(); pulsG.gain.value=0; puls.connect(pulsG); pulsG.connect(inG.gain);
    // ⑥高回転のメカ音（控えめ）
    const whN = noise(), whBp = sndCtx.createBiquadFilter(); whBp.type='bandpass'; whBp.frequency.value=1500; whBp.Q.value=3;
    const whG = sndCtx.createGain(); whG.gain.value=0; whN.connect(whBp); whBp.connect(whG); whG.connect(master);
    // ⑦ターボの笛 とブローオフ
    const tur = sndCtx.createOscillator(); tur.type='sine'; tur.frequency.value=1200;
    const turG = sndCtx.createGain(); turG.gain.value=0; tur.connect(turG); turG.connect(master);
    const boN = noise(), boBp = sndCtx.createBiquadFilter(); boBp.type='bandpass'; boBp.frequency.value=1800; boBp.Q.value=0.9;
    const boG = sndCtx.createGain(); boG.gain.value=0; boN.connect(boBp); boBp.connect(boG); boG.connect(master);

    // ロードノイズ（タイヤ+風切り）
    const rn = noise(), rBp = sndCtx.createBiquadFilter(); rBp.type='bandpass'; rBp.frequency.value=300; rBp.Q.value=0.6;
    roadNoiseGain = sndCtx.createGain(); roadNoiseGain.gain.value=0;
    rn.connect(rBp); rBp.connect(roadNoiseGain); roadNoiseGain.connect(master);

    eng = { master, main, pre, lp, mainG, sub, subG, lfo, lfoG, twin, twinLp, twinG, inBp, inG, puls, pulsG, whBp, whG, tur, turG, boG };
    [main, sub, lfo, twin, puls, tur, inN, whN, boN, rn].forEach(n => n.start());
    sndReady=true;
    engState.prof = null; engState.gear = -1;
  } catch(e){ sndReady=false; }
}

// 車（プロファイル）を切り替えた時に、車ごとに変わる値を入れ直す
function applyEngineProfile(id){
  const P = ENGINES[id] || ENGINES.f328, E = eng;
  const w = makeEngineWave(P); E.main.setPeriodicWave(w); E.twin.setPeriodicWave(w);
  E.pre.gain.value = P.drive;                                  // 歪みの量（曲線は変えない）
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
  const fm = f0*P.pitch;                                              // 主音（低く鳴らす）

  // シフト: 回転が落ちるのでアクセルを一瞬抜く（音量を落とす）。ターボ車はブローオフ
  if(engState.gear >= 0 && gear > engState.gear){ engState.shiftT = 0.16; if(P.turbo && engState.boost > 0.45) blowOff(now); }
  engState.gear = gear;
  if(engState.shiftT > 0) engState.shiftT = Math.max(0, engState.shiftT - 0.033);

  // 周波数: 毎フレーム ±0.8% ゆらす（完全に周期的だと機械的なビープになる）
  const jit = 1 + (Math.random() - 0.5)*0.016;
  E.main.frequency.setTargetAtTime(fm*jit, now, 0.035);
  E.twin.frequency.setTargetAtTime(fm*1.012*jit, now, 0.035);
  E.sub.frequency.setTargetAtTime(fm/2, now, 0.035);
  E.lfo.frequency.setTargetAtTime(rpm/60, now, 0.035);
  E.puls.frequency.setTargetAtTime(f0, now, 0.035);

  // ── 音色: 回転とアクセルで明るくなる（ただし上限は低め）──
  const bright = Math.min(1, frac*0.7 + load*0.45);
  const cutF = P.cut[0] + (P.cut[1]-P.cut[0])*bright;
  E.lp.frequency.setTargetAtTime(cutF, now, 0.06);
  E.twinLp.frequency.setTargetAtTime(cutF*0.6, now, 0.06);
  const mainBase = 0.55 + 0.25*load;
  E.mainG.gain.setTargetAtTime(mainBase, now, 0.06);
  E.lfoG.gain.setTargetAtTime(P.rough*mainBase*(0.5 + 0.5*load), now, 0.06);                  // 粗さ（音量のゆれ）
  E.subG.gain.setTargetAtTime(P.sub*(0.55 + 0.45*load)*(1.1 - 0.4*frac), now, 0.06);           // サブは低回転でより厚く
  E.twinG.gain.setTargetAtTime(0.20 + 0.10*frac, now, 0.06);
  E.inBp.frequency.setTargetAtTime(150 + 900*frac, now, 0.06);
  const inBase = P.intake*0.13*(0.25 + 0.75*load)*(0.4 + frac);
  E.inG.gain.setTargetAtTime(inBase, now, 0.06);
  E.pulsG.gain.setTargetAtTime(inBase*0.9, now, 0.06);                                        // ノイズを点火ごとに脈打たせる（谷間が埋まり、機械的な単音に聞こえない）
  E.whBp.frequency.setTargetAtTime(1200 + 2200*frac, now, 0.06);
  E.whG.gain.setTargetAtTime(P.whine*0.008*Math.pow(frac, 2.2)*(0.4 + 0.6*load), now, 0.06);

  // ── ターボ: ブーストは アクセル×回転 に遅れて追従。笛の高さ=ブースト（低めの周波数・控えめ）──
  const tgtBoost = P.turbo ? load*Math.pow(frac, 1.4) : 0;
  engState.boost += (tgtBoost - engState.boost)*(tgtBoost > engState.boost ? 0.05 : 0.12);
  if(P.turbo && engState.lastThrottle >= 0.7 && load < 0.7 && engState.boost > 0.35) blowOff(now);   // アクセルを戻した瞬間（ブーストが残っている時）
  engState.lastThrottle = load;
  E.tur.frequency.setTargetAtTime(1100 + 1700*engState.boost, now, 0.05);
  E.turG.gain.setTargetAtTime(P.turbo ? 0.028*engState.boost : 0, now, 0.05);

  // ── 音量: PLAYのみ。DEMOと待機中はほぼ無音 ──
  const shiftDip = engState.shiftT > 0 ? 0.35 : 1;
  const vol = isActive ? (0.10 + 0.22*frac*(0.55 + 0.45*load))*P.vol*shiftDip*ENGINE_GAIN : 0.003;
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
