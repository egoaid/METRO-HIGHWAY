

// ════════════════════════════════════
// レトロ走行音・衝突音 (Web Audio API)
// V8エンジン風の低い唸り + マフラー音
// ════════════════════════════════════
let sndCtx = null;
let sndReady = false;
// エンジン音ノード群
let eng1Osc=null, eng1Gain=null;  // 基音(低い唸り)
let eng2Osc=null, eng2Gain=null;  // 第2高調波
let eng3Osc=null, eng3Gain=null;  // 第3高調波(倍音)
let engMaster=null;               // マスターゲイン
let roadNoiseNode=null, roadNoiseGain=null; // ロードノイズ
let lastGear=-1;

function initSound(){
  if(sndReady) return;
  try {
    sndCtx = new (window.AudioContext||window.webkitAudioContext)();

    // マスターゲイン → コンプレッサー → destination
    const comp = sndCtx.createDynamicsCompressor();
    comp.threshold.value=-12; comp.ratio.value=4;
    comp.connect(sndCtx.destination);

    engMaster = sndCtx.createGain();
    engMaster.gain.value=0;
    engMaster.connect(comp);

    // ── 基音: のこぎり波を強くディストーション ──
    // V8は点火が不均等で独特の音→基音を低く+倍音豊かに
    eng1Gain = sndCtx.createGain(); eng1Gain.gain.value=0.55;
    eng1Osc  = sndCtx.createOscillator();
    eng1Osc.type='sawtooth'; eng1Osc.frequency.value=45;
    // ウェーブシェーパーで倍音を増やす
    const ws1 = sndCtx.createWaveShaper();
    const c1  = new Float32Array(512);
    for(let i=0;i<512;i++){const x=i/256-1; c1[i]=Math.tanh(x*3.5)*0.7+Math.sin(x*Math.PI)*0.3;}
    ws1.curve=c1;
    eng1Osc.connect(ws1); ws1.connect(eng1Gain); eng1Gain.connect(engMaster);

    // ── 第2高調波: 矩形波(排気音の"ぼぼぼ"感) ──
    eng2Gain = sndCtx.createGain(); eng2Gain.gain.value=0.30;
    eng2Osc  = sndCtx.createOscillator();
    eng2Osc.type='square'; eng2Osc.frequency.value=90;
    const lp2 = sndCtx.createBiquadFilter();
    lp2.type='lowpass'; lp2.frequency.value=800; lp2.Q.value=2.5;
    eng2Osc.connect(lp2); lp2.connect(eng2Gain); eng2Gain.connect(engMaster);

    // ── 第3高調波: 三角波(高回転の唸り) ──
    eng3Gain = sndCtx.createGain(); eng3Gain.gain.value=0.12;
    eng3Osc  = sndCtx.createOscillator();
    eng3Osc.type='triangle'; eng3Osc.frequency.value=135;
    eng3Osc.connect(eng3Gain); eng3Gain.connect(engMaster);

    // ── ロードノイズ(タイヤ+風切り) ──
    const nBuf = sndCtx.createBuffer(1, sndCtx.sampleRate*3, sndCtx.sampleRate);
    const nd   = nBuf.getChannelData(0);
    for(let i=0;i<nd.length;i++) nd[i]=Math.random()*2-1;
    roadNoiseNode = sndCtx.createBufferSource();
    roadNoiseNode.buffer=nBuf; roadNoiseNode.loop=true;
    const nFilt = sndCtx.createBiquadFilter();
    nFilt.type='bandpass'; nFilt.frequency.value=300; nFilt.Q.value=0.6;
    roadNoiseGain = sndCtx.createGain(); roadNoiseGain.gain.value=0;
    roadNoiseNode.connect(nFilt); nFilt.connect(roadNoiseGain); roadNoiseGain.connect(engMaster);

    eng1Osc.start(); eng2Osc.start(); eng3Osc.start(); roadNoiseNode.start();
    sndReady=true;
  } catch(e){ sndReady=false; }
}

function updateEngineSound(speed, maxSpeed){
  if(!sndReady||!eng1Osc) return;
  const now   = sndCtx.currentTime;
  const ratio = Math.max(0, Math.min(1, speed/maxSpeed));

  // ギア計算(4速): 各ギアでrpmが落ちてまた上がる
  const gear    = Math.min(3, Math.floor(ratio*4));
  const gearPos = ratio*4 - gear;           // 0〜1 within current gear
  // 基本rpm周波数: ギアが上がるごとに低くなり再上昇
  // 1速:40-65Hz, 2速:50-80Hz, 3速:60-95Hz, 4速:70-110Hz
  const gearBase = [40,50,60,70];
  const gearTop  = [65,80,95,110];
  const rpm = gearBase[gear] + gearPos*(gearTop[gear]-gearBase[gear]);

  // ギアチェンジ瞬間: 一瞬dip
  if(gear!==lastGear && lastGear>=0){
    eng1Osc.frequency.setValueAtTime(rpm*0.82, now);
    eng1Osc.frequency.linearRampToValueAtTime(rpm, now+0.12);
    lastGear=gear;
  } else {
    eng1Osc.frequency.setTargetAtTime(rpm,      now, 0.06);
    lastGear=gear;
  }
  eng2Osc.frequency.setTargetAtTime(rpm*2.0,   now, 0.06);
  eng3Osc.frequency.setTargetAtTime(rpm*3.1,   now, 0.06);

  // 音量: PLAYモードのみ。DEMOと待機中は無音。
  const isActive = (mode===MODE.PLAY);
  const vol = isActive ? Math.max(0.04, ratio*0.22+(1-ratio)*0.04) : 0.01;
  engMaster.gain.setTargetAtTime(vol, now, 0.10);

  // ロードノイズ: PLAYモード・速度に比例
  const noiseVol = isActive ? ratio*0.25 : 0;
  roadNoiseGain.gain.setTargetAtTime(noiseVol, now, 0.08);

  // 高調波バランス: 高回転ほど倍音が増える
  eng2Gain.gain.setTargetAtTime(0.25+ratio*0.20, now, 0.08);
  eng3Gain.gain.setTargetAtTime(0.08+ratio*0.18, now, 0.08);
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
