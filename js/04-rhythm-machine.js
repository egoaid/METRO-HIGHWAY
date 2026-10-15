// ════════════════════════════════════════════════
// ── リズムマシン ──
// ════════════════════════════════════════════════

const RHYTHM_STEPS = 16;
const DRUM_TRACKS = [
  { id: 'bd',  label: 'BASS' },
  { id: 'sd',  label: 'SNARE' },
  { id: 'hc',  label: 'HI-CL' },
  { id: 'ho',  label: 'HI-OP' },
  { id: 'rim', label: 'RIM' },
  { id: 'cow', label: 'COWBL' },
];

// パターンデータ: 各トラック16ステップ(1=通常, 2=アクセント, 0=無音)
const rhythmPatterns = {
  rock1: {
    bd:  [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
    sd:  [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    hc:  [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
    ho:  [0,0,0,0, 0,0,0,1, 0,0,0,0, 0,0,0,1],
    rim: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    cow: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
  },
  rock2: {
    bd:  [1,0,0,0, 0,0,1,0, 1,0,0,0, 0,0,1,0],
    sd:  [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,1],
    hc:  [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1],
    ho:  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    rim: [0,0,0,0, 0,0,0,0, 0,1,0,0, 0,0,0,0],
    cow: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
  },
  disco: {
    bd:  [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
    sd:  [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0],
    hc:  [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
    ho:  [0,1,0,1, 0,1,0,1, 0,1,0,1, 0,1,0,1],
    rim: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    cow: [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
  },
  soul: {
    bd:  [1,0,0,1, 0,0,1,0, 1,0,0,0, 0,0,1,0],
    sd:  [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    hc:  [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,1],
    ho:  [0,0,0,0, 0,0,0,1, 0,0,0,0, 0,0,0,0],
    rim: [0,0,0,1, 0,0,0,0, 0,0,1,0, 0,0,0,0],
    cow: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
  },
  swing: {
    bd:  [1,0,0,0, 0,0,1,0, 0,0,0,0, 1,0,0,0],
    sd:  [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    hc:  [1,0,1,1, 1,0,1,1, 1,0,1,1, 1,0,1,1],
    ho:  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,1,0],
    rim: [0,0,0,0, 0,1,0,0, 0,0,0,0, 0,1,0,0],
    cow: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
  },
  bossaNova: {
    bd:  [1,0,0,0, 0,0,1,0, 0,1,0,0, 0,0,0,0],
    sd:  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    hc:  [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
    ho:  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    rim: [1,0,0,1, 0,1,0,0, 1,0,0,1, 0,1,0,0],
    cow: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
  },
  samba: {
    bd:  [1,0,1,0, 0,0,1,0, 1,0,1,0, 0,0,0,0],
    sd:  [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    hc:  [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1],
    ho:  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    rim: [1,0,0,1, 1,0,0,1, 1,0,0,1, 1,0,0,1],
    cow: [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
  },
  beguine: {
    bd:  [1,0,0,0, 0,0,1,0, 0,0,0,0, 0,1,0,0],
    sd:  [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    hc:  [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
    ho:  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    rim: [0,1,0,0, 0,0,0,1, 0,1,0,0, 0,0,1,0],
    cow: [1,0,0,1, 0,0,1,0, 0,1,0,0, 1,0,0,0],
  },
  waltz: {
    bd:  [1,0,0,0, 0,0,1,0, 0,0,0,0, 1,0,0,0],
    sd:  [0,0,1,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
    hc:  [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0],
    ho:  [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
    rim: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    cow: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
  },
  march: {
    bd:  [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
    sd:  [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0],
    hc:  [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1],
    ho:  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    rim: [0,1,0,1, 0,1,0,1, 0,1,0,1, 0,1,0,1],
    cow: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
  },
  pops: {
    bd:  [1,0,0,0, 0,0,1,0, 1,0,0,0, 0,0,0,0],
    sd:  [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    hc:  [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
    ho:  [0,1,0,0, 0,1,0,1, 0,1,0,0, 0,1,0,1],
    rim: [0,0,0,1, 0,0,0,0, 0,0,0,1, 0,0,0,0],
    cow: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
  },
  reggae: {
    bd:  [1,0,0,0, 0,0,1,0, 0,0,0,0, 1,0,0,0],
    sd:  [0,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
    hc:  [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0],
    ho:  [0,1,0,0, 1,0,0,1, 0,0,1,0, 0,1,0,0],
    rim: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    cow: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
  },
  custom: {
    bd:  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    sd:  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    hc:  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    ho:  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    rim: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    cow: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
  },
};

// 現在の編集用パターン（プリセットをコピーして使う）
let currentPattern = {};
DRUM_TRACKS.forEach(t => { currentPattern[t.id] = [...rhythmPatterns.rock1[t.id]]; });

// ── ドラムキット定義 ──
// 各キットのパラメーター: bd/sd/hc/ho/rim/cow ごとに音色を変える
const DRUM_KITS = {
  standard: {
    bd:  { freq0:120, freq1:40, dur:0.25, decay:0.3, clickVol:0.5, noiseVol:0 },
    sd:  { toneFreq0:200, toneFreq1:100, toneDec:0.12, noiseBp:2000, noiseDec:0.18, noiseQ:0.8 },
    hc:  { hp:7000, dec:0.04, vol:0.6 },
    ho:  { hp:6000, dec:0.30, vol:0.5 },
    rim: { oscFreq:800, bp:1200, bpQ:2, oscDec:0.06 },
    cow: { f1:587, f2:845, bp:700, bpQ:1.5, dec:0.20 },
  },
  vintage: {
    // Casio MT風: ピッチ高め、鳴りは短く、ローファイ
    bd:  { freq0:90,  freq1:38, dur:0.18, decay:0.22, clickVol:0.8, noiseVol:0 },
    sd:  { toneFreq0:260, toneFreq1:130, toneDec:0.08, noiseBp:3000, noiseDec:0.12, noiseQ:1.5 },
    hc:  { hp:8000, dec:0.025, vol:0.7 },
    ho:  { hp:7500, dec:0.18,  vol:0.45 },
    rim: { oscFreq:1000, bp:1500, bpQ:3, oscDec:0.04 },
    cow: { f1:622,  f2:880, bp:750, bpQ:2.0, dec:0.14 },
  },
  electronic: {
    // TR-808風: 深いキック、長めのディケイ、クリスプなHH
    bd:  { freq0:160, freq1:30, dur:0.45, decay:0.55, clickVol:0.3, noiseVol:0 },
    sd:  { toneFreq0:180, toneFreq1:80,  toneDec:0.10, noiseBp:1800, noiseDec:0.28, noiseQ:0.5 },
    hc:  { hp:9000, dec:0.018, vol:0.55 },
    ho:  { hp:8000, dec:0.45,  vol:0.48 },
    rim: { oscFreq:600, bp:900, bpQ:1.5, oscDec:0.08 },
    cow: { f1:550,  f2:800, bp:660, bpQ:1.2, dec:0.30 },
  },
  jazz: {
    // ブラシ風: ソフト・短め・暗め
    bd:  { freq0:80,  freq1:42, dur:0.20, decay:0.28, clickVol:0.2, noiseVol:0 },
    sd:  { toneFreq0:160, toneFreq1:90,  toneDec:0.15, noiseBp:1200, noiseDec:0.22, noiseQ:0.4 },
    hc:  { hp:5000, dec:0.06,  vol:0.40 },
    ho:  { hp:4500, dec:0.50,  vol:0.35 },
    rim: { oscFreq:650, bp:900, bpQ:1.2, oscDec:0.07 },
    cow: { f1:500,  f2:720, bp:600, bpQ:1.0, dec:0.18 },
  },
  latin: {
    // コンガ/ティンバレ風: 高域成分多め、スナッピー
    bd:  { freq0:180, freq1:55, dur:0.16, decay:0.20, clickVol:0.6, noiseVol:0 },
    sd:  { toneFreq0:320, toneFreq1:160, toneDec:0.07, noiseBp:4000, noiseDec:0.10, noiseQ:2.0 },
    hc:  { hp:7500, dec:0.022, vol:0.65 },
    ho:  { hp:7000, dec:0.22,  vol:0.55 },
    rim: { oscFreq:1200, bp:2000, bpQ:4, oscDec:0.035 },
    cow: { f1:660,  f2:990, bp:820, bpQ:2.5, dec:0.25 },
  },

  // ── Casiotone MT シリーズ ローファイキット ──

  casiomt1: {
    // MT-40/45風: 極短・高ピッチ・ブライト。ゲームウォッチ世代のビート
    bd:  { freq0:200, freq1:50, dur:0.10, decay:0.13, clickVol:1.2, noiseVol:0 },
    sd:  { toneFreq0:400, toneFreq1:220, toneDec:0.04, noiseBp:5000, noiseDec:0.07, noiseQ:3.0 },
    hc:  { hp:9500, dec:0.012, vol:0.9 },
    ho:  { hp:8500, dec:0.10,  vol:0.7 },
    rim: { oscFreq:1400, bp:2200, bpQ:5, oscDec:0.03 },
    cow: { f1:700,  f2:1050, bp:880, bpQ:3.0, dec:0.10 },
  },

  casiomt2: {
    // MT-68/70風: 中域が詰まったブリキ感、薄いスネア、主張するカウベル
    bd:  { freq0:140, freq1:42, dur:0.13, decay:0.17, clickVol:0.9, noiseVol:0 },
    sd:  { toneFreq0:280, toneFreq1:140, toneDec:0.05, noiseBp:3500, noiseDec:0.09, noiseQ:2.5 },
    hc:  { hp:8800, dec:0.016, vol:0.75 },
    ho:  { hp:8000, dec:0.14,  vol:0.60 },
    rim: { oscFreq:1100, bp:1800, bpQ:4, oscDec:0.04 },
    cow: { f1:620,  f2:930, bp:780, bpQ:4.0, dec:0.18 },
  },

  casiomt3: {
    // MT-100/500風: 最もローファイ、ぐにゃっとしたキック、紙スネア
    bd:  { freq0:110, freq1:35, dur:0.18, decay:0.22, clickVol:0.5, noiseVol:0 },
    sd:  { toneFreq0:220, toneFreq1:100, toneDec:0.06, noiseBp:2800, noiseDec:0.11, noiseQ:1.2 },
    hc:  { hp:7800, dec:0.020, vol:0.65 },
    ho:  { hp:7000, dec:0.18,  vol:0.50 },
    rim: { oscFreq:900,  bp:1400, bpQ:3, oscDec:0.05 },
    cow: { f1:580,  f2:870, bp:720, bpQ:2.0, dec:0.22 },
  },

  cr78: {
    // Roland CR-78 (1978): アナログ回路の丸み、深いキック、独特のスネアトーン
    bd:  { freq0:145, freq1:38, dur:0.38, decay:0.48, clickVol:0.15, noiseVol:0 },
    sd:  { toneFreq0:240, toneFreq1:120, toneDec:0.18, noiseBp:2200, noiseDec:0.14, noiseQ:0.6 },
    hc:  { hp:6800, dec:0.032, vol:0.55 },
    ho:  { hp:6000, dec:0.38,  vol:0.45 },
    rim: { oscFreq:1050, bp:1700, bpQ:3.5, oscDec:0.045 },
    cow: { f1:420,  f2:640, bp:520, bpQ:1.8, dec:0.28 },
  },

  lm1: {
    // Linn LM-1 (1980): 世界初PCMドラムマシン。重いキック・クラック感のあるスネア
    // BD: どっしり重く長いテール、低ピッチ下降、わずかなクリック
    bd:  { freq0:100, freq1:28, dur:0.55, decay:0.70, clickVol:0.40, noiseVol:0 },
    // SD: アタッククラック強め、高めトーン、ブライトなノイズ帯域
    sd:  { toneFreq0:320, toneFreq1:180, toneDec:0.08, noiseBp:3800, noiseDec:0.12, noiseQ:1.8 },
    // HH: 非常にシャープで短い金属音
    hc:  { hp:9000, dec:0.018, vol:0.70 },
    ho:  { hp:8200, dec:0.28,  vol:0.55 },
    // RIM: 硬い木質クリック感、高いBP周波数
    rim: { oscFreq:1300, bp:2400, bpQ:5.0, oscDec:0.028 },
    // COW: 高めでシャープ、短い余韻
    cow: { f1:800,  f2:1200, bp:1000, bpQ:3.5, dec:0.14 },
  },
};

// ── ドラム音合成 ──
function synthDrum(type, vol) {
  const v = vol * parseFloat(document.getElementById('rhythmVol').value);
  const masterGain = ctx.createGain();
  masterGain.gain.value = v;
  masterGain.connect(rhythmGain);

  const now = ctx.currentTime;
  const kitName = document.getElementById('drumKit').value;
  const kit = DRUM_KITS[kitName] || DRUM_KITS.standard;

  if(type === 'bd') {
    const p = kit.bd;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(p.freq0, now);
    osc.frequency.exponentialRampToValueAtTime(p.freq1, now + 0.08);
    g.gain.setValueAtTime(0.9, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + p.dur);
    osc.connect(g); g.connect(masterGain);
    osc.start(now); osc.stop(now + p.decay);
    // click layer
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.01, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for(let i=0;i<d.length;i++) d[i] = (Math.random()*2-1) * (1 - i/d.length);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const cg = ctx.createGain(); cg.gain.value = p.clickVol;
    src.connect(cg); cg.connect(masterGain);
    src.start(now);

  } else if(type === 'sd') {
    const p = kit.sd;
    const osc = ctx.createOscillator();
    const og = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(p.toneFreq0, now);
    osc.frequency.exponentialRampToValueAtTime(p.toneFreq1, now + 0.06);
    og.gain.setValueAtTime(0.7, now);
    og.gain.exponentialRampToValueAtTime(0.0001, now + p.toneDec);
    osc.connect(og); og.connect(masterGain);
    osc.start(now); osc.stop(now + p.toneDec + 0.03);
    const nbuf = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate);
    const nd = nbuf.getChannelData(0);
    for(let i=0;i<nd.length;i++) nd[i] = Math.random()*2-1;
    const nsrc = ctx.createBufferSource();
    nsrc.buffer = nbuf;
    const nf = ctx.createBiquadFilter();
    nf.type = 'bandpass'; nf.frequency.value = p.noiseBp; nf.Q.value = p.noiseQ;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.8, now);
    ng.gain.exponentialRampToValueAtTime(0.0001, now + p.noiseDec);
    nsrc.connect(nf); nf.connect(ng); ng.connect(masterGain);
    nsrc.start(now);

  } else if(type === 'hc') {
    const p = kit.hc;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * (p.dec + 0.02)), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for(let i=0;i<d.length;i++) d[i] = Math.random()*2-1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = p.hp;
    const g = ctx.createGain();
    g.gain.setValueAtTime(p.vol, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + p.dec);
    src.connect(f); f.connect(g); g.connect(masterGain);
    src.start(now);

  } else if(type === 'ho') {
    const p = kit.ho;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * (p.dec + 0.05)), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for(let i=0;i<d.length;i++) d[i] = Math.random()*2-1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = p.hp;
    const g = ctx.createGain();
    g.gain.setValueAtTime(p.vol, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + p.dec);
    src.connect(f); f.connect(g); g.connect(masterGain);
    src.start(now);

  } else if(type === 'rim') {
    const p = kit.rim;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = p.oscFreq;
    g.gain.setValueAtTime(0.5, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + p.oscDec);
    osc.connect(g); g.connect(masterGain);
    osc.start(now); osc.stop(now + p.oscDec + 0.01);
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * (p.oscDec + 0.02)), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for(let i=0;i<d.length;i++) d[i] = Math.random()*2-1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = p.bp; f.Q.value = p.bpQ;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.4, now);
    ng.gain.exponentialRampToValueAtTime(0.0001, now + p.oscDec);
    src.connect(f); f.connect(ng); ng.connect(masterGain);
    src.start(now);

  } else if(type === 'cow') {
    const p = kit.cow;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const g = ctx.createGain();
    osc1.type = 'square'; osc1.frequency.value = p.f1;
    osc2.type = 'square'; osc2.frequency.value = p.f2;
    g.gain.setValueAtTime(0.4, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + p.dec);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = p.bp; f.Q.value = p.bpQ;
    osc1.connect(f); osc2.connect(f); f.connect(g); g.connect(masterGain);
    osc1.start(now); osc1.stop(now + p.dec + 0.02);
    osc2.start(now); osc2.stop(now + p.dec + 0.02);
  }

  setTimeout(() => { try { masterGain.disconnect(); } catch(_){} }, 800);
}

// ── シーケンサー ──
let rhythmPlaying = false;
let transportEpoch = 0;
let rhythmStep = 0;
let rhythmNextTime = 0;
let rhythmSchedulerTimer = null;
const LOOK_AHEAD = 0.1;    // 先読み秒
const SCHEDULE_INTERVAL = 30; // ms

function updateRhythmLEDs(step) {
  // Step LEDs removed — no-op
}

function highlightPads(step, masterCount) {
  document.querySelectorAll('.track-pad').forEach(el => {
    el.classList.remove('playing');
  });
  // サイクルパッドの再生位置ハイライトもリセット
  document.querySelectorAll('.cycle-pad').forEach(el => {
    el.classList.remove('playing');
  });
  DRUM_TRACKS.forEach(track => {
    const cycleLen = polyrhythmEnabled ? (cycleLengths[track.id] || 16) : 16;
    const trackStep = polyrhythmEnabled ? (masterCount % cycleLen) : step;
    const pad = document.querySelector(`.track-pad[data-track="${track.id}"][data-step="${trackStep}"]`);
    if(pad) pad.classList.add('playing');
    // POLY ON時: サイクルパッドの現在位置もハイライト
    if(polyrhythmEnabled) {
      const cp = document.querySelector(`.cycle-pad[data-cycle-track="${track.id}"][data-cycle-step="${trackStep + 1}"]`);
      if(cp) cp.classList.add('playing');
    }
  });
}

function rhythmStart() {
  if(ctx.state !== 'running') ctx.resume();
  startSharedFxLfos();
  transportEpoch++;
  rhythmStep = 0;
  masterStepCount = 0;
  slowSeqCurrentStep = -1;
  rhythmNextTime = ctx.currentTime + 0.05;
  rhythmPlaying = true;
  rhythmSchedulerTimer = setInterval(rhythmSchedule, SCHEDULE_INTERVAL);
  driftStart(); // ── Drift engine on
  if (lofiMotion.enabled) lofiMotionStart(); // ── Lo-Fi Motion on
  document.getElementById('rhythmStartBtn').textContent = 'STOP';
  document.getElementById('rhythmStartBtn').classList.add('playing');
}

function rhythmStop() {
  rhythmPlaying = false;
  clearInterval(rhythmSchedulerTimer);
  rhythmSchedulerTimer = null;
  document.querySelectorAll('.track-pad').forEach(el => el.classList.remove('playing'));
  document.querySelectorAll('.cycle-pad').forEach(el => el.classList.remove('playing'));
  document.querySelectorAll('.seq-step-led').forEach(el => el.classList.remove('active','beat'));
  document.querySelectorAll('.seq-step-btn').forEach(el => el.classList.remove('playing'));
  document.getElementById('rhythmStartBtn').textContent = 'START';
  document.getElementById('rhythmStartBtn').classList.remove('playing');
  // Stop active sequencer voices.
  if(typeof seqAllNotesOff === 'function') seqAllNotesOff();
  if(typeof slowSeqAllNotesOff === 'function') {
    slowSeqAllNotesOff();
    slowSeqCurrentStep = -1;
  }
  // Reset SEQ-B LEDs.
  document.querySelectorAll('.seq-step-led[data-slow-step]').forEach(el => el.classList.remove('active','beat'));
  document.querySelectorAll('button[data-slow-step]').forEach(el => el.classList.remove('playing'));
  driftStop(); // ── Drift engine off
  lofiMotionStop(); // ── Lo-Fi Motion off
}

function panicStop() {
  transportEpoch++;
  rhythmStop();
  heldKeys.clear();
  seqAllNotesOff();
  slowSeqAllNotesOff();
  Array.from(activeVoices.keys()).forEach(id => {
    try { noteOff(id); } catch(_) {}
  });
  document.querySelectorAll('.track-pad, .seq-step-led, .seq-step-btn').forEach(el => {
    el.classList.remove('active', 'beat', 'playing');
  });
  document.querySelectorAll('.white.pressed, .black.pressed').forEach(el => {
    el.classList.remove('pressed');
  });
}

// ── サイクルパッドの見た目を更新するヘルパー ──
// cycleLen: そのトラックのポリサイクル長 (1〜16)
function _updateCyclePads(wrap, cycleLen) {
  const pads = wrap.querySelectorAll('.cycle-pad');
  pads.forEach((cp, i) => {
    const step = i + 1; // 1〜16
    cp.classList.remove('in-cycle', 'cycle-end');
    if (step < cycleLen)  cp.classList.add('in-cycle');
    if (step === cycleLen) cp.classList.add('cycle-end');
  });
}

// ── UI構築 ──
function buildRhythmUI() {
  // ステップLED
  // トラックパッド
  const tracksEl = document.getElementById('rhythmTracks');
  tracksEl.innerHTML = '';
  DRUM_TRACKS.forEach(track => {
    const row = document.createElement('div');
    row.className = 'rhythm-track';

    const label = document.createElement('div');
    label.className = 'track-label';
    label.textContent = track.label;
    row.appendChild(label);

    const pads = document.createElement('div');
    pads.className = 'track-pads';

    for(let i=0; i<RHYTHM_STEPS; i++) {
      const pad = document.createElement('div');
      pad.className = 'track-pad';
      pad.dataset.track = track.id;
      pad.dataset.step = i;

      const val = currentPattern[track.id][i];
      if(val === 1) pad.classList.add('on');
      if(val === 2) { pad.classList.add('on', 'beat2'); }

      // クリック: 0→1→2→0 (オフ→通常→アクセント→オフ)
      pad.addEventListener('click', () => {
        const cur = currentPattern[track.id][i];
        const next = (cur + 1) % 3;
        currentPattern[track.id][i] = next;
        pad.classList.remove('on', 'beat2');
        if(next === 1) pad.classList.add('on');
        if(next === 2) { pad.classList.add('on', 'beat2'); }
        // カスタムに切り替え
        document.getElementById('rhythmPattern').value = 'custom';
      });

      pads.appendChild(pad);
    }

    // ── サイクルパッドグリッド（POLY ON時にメインパッドの直下に表示）──
    const cycleWrap = document.createElement('div');
    cycleWrap.className = 'poly-cycle-wrap';
    cycleWrap.dataset.track = track.id;

    // 16個のサイクルパッドを生成
    for(let i = 0; i < RHYTHM_STEPS; i++) {
      const cp = document.createElement('div');
      cp.className = 'cycle-pad';
      cp.dataset.cycleTrack = track.id;
      cp.dataset.cycleStep = i + 1; // 1〜16
      _updateCyclePads(cycleWrap, cycleLengths[track.id] || 16);

      cp.addEventListener('click', () => {
        cycleLengths[track.id] = i + 1;
        _updateCyclePads(cycleWrap, i + 1);
      });

      cycleWrap.appendChild(cp);
    }

    // pads-col: メインパッドとサイクルパッドを縦に束ねる
    const padsCol = document.createElement('div');
    padsCol.className = 'pads-col';
    padsCol.appendChild(pads);
    padsCol.appendChild(cycleWrap);

    row.appendChild(padsCol);
    tracksEl.appendChild(row);
  });
}

function loadRhythmPattern(name) {
  const pat = rhythmPatterns[name];
  if(!pat) return;
  DRUM_TRACKS.forEach(t => {
    currentPattern[t.id] = [...pat[t.id]];
  });
  // パッドUI更新
  DRUM_TRACKS.forEach(track => {
    for(let i=0; i<RHYTHM_STEPS; i++) {
      const pad = document.querySelector(`.track-pad[data-track="${track.id}"][data-step="${i}"]`);
      if(!pad) continue;
      const val = currentPattern[track.id][i];
      pad.classList.remove('on', 'beat2');
      if(val === 1) pad.classList.add('on');
      if(val === 2) { pad.classList.add('on', 'beat2'); }
    }
  });
}

// ── イベント ──
document.getElementById('rhythmStartBtn').addEventListener('click', () => {
  if(rhythmPlaying) {
    (window.rhythmStop || rhythmStop)();
  } else {
    (window.rhythmStart || rhythmStart)();
  }
});

function seqAllNotesOff() {
  for(let i = 0; i < SEQ_STEPS; i++) {
    if(seqTieVoices[i]) {
      noteOff(seqTieVoices[i]);
      seqTieVoices[i] = null;
    }
  }
  // activeVoicesに残っているseq_*ボイスも全て止める
  for(const [id] of activeVoices) {
    if(typeof id === 'string' && id.startsWith('seq_')) {
      noteOff(id);
    }
  }
}
let rhythmMuted = false;
let seqMuted    = false;

// ── ポリリズム ──
let polyrhythmEnabled = false;
const cycleLengths = { bd:16, sd:16, hc:16, ho:16, rim:16, cow:16 };

document.getElementById('polyrhythmBtn').addEventListener('click', () => {
  polyrhythmEnabled = !polyrhythmEnabled;
  const btn = document.getElementById('polyrhythmBtn');
  btn.classList.toggle('btn-blu', polyrhythmEnabled);
  btn.textContent = polyrhythmEnabled ? 'POLY ON' : 'POLY';
  // トラック行にクラスを付与してCSSでスライダー表示切替
  document.getElementById('rhythmTracks').classList.toggle('poly-enabled', polyrhythmEnabled);
  // OFFにした時はサイクルを全て16にリセット
  if(!polyrhythmEnabled) {
    DRUM_TRACKS.forEach(t => { cycleLengths[t.id] = 16; });
    document.querySelectorAll('.poly-cycle-wrap').forEach(wrap => {
      _updateCyclePads(wrap, 16);
    });
  }
});

document.getElementById('rhythmMuteBtn').addEventListener('click', () => {
  rhythmMuted = !rhythmMuted;
  const btn = document.getElementById('rhythmMuteBtn');
  btn.classList.toggle('muted', rhythmMuted);
  btn.textContent = rhythmMuted ? 'MUTED' : 'MUTE';
});

document.getElementById('seqMuteBtn').addEventListener('click', () => {
  seqMuted = !seqMuted;
  const btn = document.getElementById('seqMuteBtn');
  btn.classList.toggle('muted', seqMuted);
  btn.textContent = seqMuted ? 'MUTED' : 'MUTE';
  if(seqMuted) seqAllNotesOff();
});

document.getElementById('rhythmPattern').addEventListener('change', e => {
  loadRhythmPattern(e.target.value);
});

document.getElementById('rhythmClearBtn').addEventListener('click', () => {
  DRUM_TRACKS.forEach(t => { currentPattern[t.id] = new Array(RHYTHM_STEPS).fill(0); });
  DRUM_TRACKS.forEach(track => {
    for(let i=0; i<RHYTHM_STEPS; i++) {
      const pad = document.querySelector(`.track-pad[data-track="${track.id}"][data-step="${i}"]`);
      if(pad) pad.classList.remove('on', 'beat2');
    }
  });
  document.getElementById('rhythmPattern').value = 'custom';
});

// ── リズムランダム生成（関数化）──
function doRhythmRandomize() {
  const densityRange = {
    bd:  [2, 5],
    sd:  [2, 4],
    hc:  [4, 10],
    ho:  [0, 3],
    rim: [0, 3],
    cow: [0, 2],
  };
  DRUM_TRACKS.forEach(track => {
    const [dMin, dMax] = densityRange[track.id];
    const density = dMin + Math.floor(Math.random() * (dMax - dMin + 1));
    const newPat = new Array(RHYTHM_STEPS).fill(0);
    const candidates = track.id === 'bd'
      ? [0,2,4,6,8,10,12,14]
      : Array.from({length: RHYTHM_STEPS}, (_, i) => i);
    for(let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    candidates.slice(0, density).forEach(idx => {
      newPat[idx] = Math.random() < 0.2 ? 2 : 1;
    });
    currentPattern[track.id] = newPat;
    for(let i=0; i<RHYTHM_STEPS; i++) {
      const pad = document.querySelector(`.track-pad[data-track="${track.id}"][data-step="${i}"]`);
      if(!pad) continue;
      pad.classList.remove('on', 'beat2');
      if(newPat[i] === 1) pad.classList.add('on');
      if(newPat[i] === 2) { pad.classList.add('on', 'beat2'); }
    }
  });
  document.getElementById('rhythmPattern').value = 'custom';
}

document.getElementById('rhythmRandomBtn').addEventListener('click', doRhythmRandomize);

// ── オートランダム ──
let rhythmAutoEnabled  = false;
let rhythmLoopCounter  = 0; // 現在の周回数

document.getElementById('rhythmAutoBtn').addEventListener('click', () => {
  rhythmAutoEnabled = !rhythmAutoEnabled;
  const btn = document.getElementById('rhythmAutoBtn');
  const bar = document.getElementById('rhythmAutoBar');
  if(rhythmAutoEnabled) {
    btn.classList.add('btn-blu');
    btn.textContent = 'AUTO ON';
    bar.style.display = 'flex';
    rhythmLoopCounter = 0;
    _updateAutoCountdown();
  } else {
    btn.classList.remove('btn-blu');
    btn.textContent = 'AUTO';
    bar.style.display = 'none';
    document.getElementById('autoLoopCountdown').textContent = '—';
  }
});

document.getElementById('autoLoopSlider').addEventListener('input', () => {
  const v = parseInt(document.getElementById('autoLoopSlider').value);
  document.getElementById('autoLoopVal').textContent = v + ' LOOPS';
  rhythmLoopCounter = 0; // リセット
  _updateAutoCountdown();
});

function _updateAutoCountdown() {
  if(!rhythmAutoEnabled) return;
  const target = parseInt(document.getElementById('autoLoopSlider').value);
  const remaining = target - rhythmLoopCounter;
  document.getElementById('autoLoopCountdown').textContent = remaining + ' LEFT';
}

// rhythmSchedule から呼ばれるループ完了フック
function onRhythmLoopComplete() {
  driftOnLoopComplete(); // ── Loop drift: new target each cycle
  if(!rhythmAutoEnabled) return;
  rhythmLoopCounter++;
  const target = parseInt(document.getElementById('autoLoopSlider').value);
  _updateAutoCountdown();
  if(rhythmLoopCounter >= target) {
    rhythmLoopCounter = 0;
    // 次のステップ開始時に切り替えが自然に見えるよう即時実行
    doRhythmRandomize();
    _updateAutoCountdown();
  }
}

document.getElementById('rhythmBpm').addEventListener('input', () => {
  const v = document.getElementById('rhythmBpm').value;
  document.getElementById('rhythmBpmValue').textContent = `${v} BPM`;
});

// rhythmVol listener removed — controlled via Mixer

buildRhythmUI();
loadRhythmPattern('rock1');

// rhythmSchedule（seqTrigger + slowSeqTrigger 統合版）
// リズム・SEQ-A・SEQ-Bを駆動するマスタースケジューラー。
function rhythmSchedule() {
  const epoch = transportEpoch;
  const bpm = parseFloat(document.getElementById('rhythmBpm').value);
  const stepDur = 60 / bpm / 4;

  while(rhythmNextTime < ctx.currentTime + LOOK_AHEAD) {
    const step = rhythmStep;
    const t = rhythmNextTime;
    const masterCount = masterStepCount; // クロージャで保持

    DRUM_TRACKS.forEach(track => {
      const cycleLen  = polyrhythmEnabled ? (cycleLengths[track.id] || 16) : 16;
      const trackStep = polyrhythmEnabled ? (masterCount % cycleLen) : step;
      const val       = currentPattern[track.id] ? currentPattern[track.id][trackStep] : 0;
      if (val > 0) {
        const accentVol = val === 2 ? 1.0 : 0.72;

        // ── Humanize: route this drum hit through the central gateway ──
        // applyHumanize mutates event.time (timing jitter, Phase 1)
        // and will later mutate event.velocity (Phase 2).
        // event.freq and event.duration are 0 for unpitched one-shot drums.
        const drumEvent = applyHumanize({
          time:     t,
          velocity: accentVol,
          freq:     0,
          duration: 0,
          source:   'rhythm',
          track:    track.id,
          step:     trackStep,
          stepDur:  stepDur,
        });

        // Convert humanized AudioContext time → setTimeout delay.
        // Math.max(0, ...) is a second-layer guard: applyHumanize already
        // clamps event.time above ctx.currentTime, but floating-point
        // subtraction can produce a tiny negative on fast CPUs.
        const delay = Math.max(0, drumEvent.time - ctx.currentTime);
        setTimeout(() => {
          if(epoch !== transportEpoch) return;
          if (rhythmPlaying && !rhythmMuted) synthDrum(track.id, drumEvent.velocity);
        }, delay * 1000);
      }
    });

    const uiDelay = Math.max(0, t - ctx.currentTime);
    setTimeout(() => {
      if(epoch !== transportEpoch) return;
      if(!rhythmPlaying) return;
      // ループ完了フック（step==0 = 新しいループ開始）
      if(step === 0) onRhythmLoopComplete();
      updateRhythmLEDs(step);
      highlightPads(step, masterCount);
      // SEQ-A: メロディーシーケンサー
      seqTrigger(step);
      updateSeqLEDs(step);
      // SEQ-B: スロードローン（16マスターステップで1スロウステップ）
      const slowStep = Math.floor(masterCount / 16) % SLOW_SEQ_STEPS;
      slowSeqTrigger(slowStep);
      updateSlowSeqLEDs(slowStep);
    }, uiDelay * 1000);

    rhythmStep = (rhythmStep + 1) % RHYTHM_STEPS;
    masterStepCount++;
    rhythmNextTime += stepDur;
  }
}

