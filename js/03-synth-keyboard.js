
const activeVoices = new Map();
const WHITE_KEY_WIDTH = 40;

// ── Shared noise buffer ──
let _sharedNoiseBuffer = null;
function getSharedNoiseBuffer() {
  if (_sharedNoiseBuffer) return _sharedNoiseBuffer;
  _sharedNoiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = _sharedNoiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return _sharedNoiseBuffer;
}




// ── オクターブシフト ──
let octaveShift = 0;

// ── Snap to Scale ──
let snapToScaleEnabled = false;

function snapMidi(midi) {
  if(!snapToScaleEnabled) return midi;
  const scaleName = document.getElementById('seqScale').value;
  const intervals = SCALES[scaleName] || SCALES.major;
  const noteClass = midi % 12;
  // スケール内に含まれているかチェック
  if(intervals.includes(noteClass)) return midi;
  // 最も近いスケール音を探す（上下両方向で距離最小）
  let bestMidi = midi;
  let bestDist = 999;
  for(let offset = -6; offset <= 6; offset++) {
    const candidate = midi + offset;
    if(candidate < 0 || candidate > 127) continue;
    if(intervals.includes(candidate % 12)) {
      const dist = Math.abs(offset);
      if(dist < bestDist) {
        bestDist = dist;
        bestMidi = candidate;
      }
    }
  }
  return bestMidi;
}

document.getElementById('snapScaleBtn').addEventListener('click', () => {
  snapToScaleEnabled = !snapToScaleEnabled;
  const btn = document.getElementById('snapScaleBtn');
  if(snapToScaleEnabled) {
    btn.textContent = 'SNAP ON';
    btn.classList.add('btn-blu');
  } else {
    btn.textContent = 'SNAP OFF';
    btn.classList.remove('btn-blu');
  }
});

document.getElementById('octDn').onclick = () => {
  if(octaveShift > -2) {
    octaveShift--;
    document.getElementById('octaveDisplay').textContent = `OCT: ${octaveShift}`;
    rebuildKeyLabels();
  }
};
document.getElementById('octUp').onclick = () => {
  if(octaveShift < 2) {
    octaveShift++;
    document.getElementById('octaveDisplay').textContent = `OCT: ${octaveShift}`;
    rebuildKeyLabels();
  }
};

// ── PCキーボード → ピアノ標準配列 ──
// 下段(Z列): C3〜B3+C#3〜A#3 (ホワイト+ブラック1オクターブ)
// 上段(Q列): C4〜C5+C#4〜A#4
// keyToSemitone: キー → 基準音からの半音数 + オクターブ情報

const KEY_TO_NOTE = {
  // 下オクターブ (C3 = MIDI 48 基準)
  'z': { semi: 0,  oct: 3 }, // C
  's': { semi: 1,  oct: 3 }, // C#
  'x': { semi: 2,  oct: 3 }, // D
  'd': { semi: 3,  oct: 3 }, // D#
  'c': { semi: 4,  oct: 3 }, // E
  'v': { semi: 5,  oct: 3 }, // F
  'g': { semi: 6,  oct: 3 }, // F#
  'b': { semi: 7,  oct: 3 }, // G
  'h': { semi: 8,  oct: 3 }, // G#
  'n': { semi: 9,  oct: 3 }, // A
  'j': { semi: 10, oct: 3 }, // A#
  'm': { semi: 11, oct: 3 }, // B
  ',': { semi: 12, oct: 3 }, // C4
  'l': { semi: 13, oct: 3 }, // C#4
  '.': { semi: 14, oct: 3 }, // D4
  ';': { semi: 15, oct: 3 }, // D#4
  '/': { semi: 16, oct: 3 }, // E4
  // 上オクターブ (C4 = MIDI 60 基準)
  'q': { semi: 0,  oct: 4 }, // C
  '2': { semi: 1,  oct: 4 }, // C#
  'w': { semi: 2,  oct: 4 }, // D
  '3': { semi: 3,  oct: 4 }, // D#
  'e': { semi: 4,  oct: 4 }, // E
  'r': { semi: 5,  oct: 4 }, // F
  '5': { semi: 6,  oct: 4 }, // F#
  't': { semi: 7,  oct: 4 }, // G
  '6': { semi: 8,  oct: 4 }, // G#
  'y': { semi: 9,  oct: 4 }, // A
  '7': { semi: 10, oct: 4 }, // A#
  'u': { semi: 11, oct: 4 }, // B
  'i': { semi: 12, oct: 4 }, // C5
  '9': { semi: 13, oct: 4 }, // C#5
  'o': { semi: 14, oct: 4 }, // D5
  '0': { semi: 15, oct: 4 }, // D#5
  'p': { semi: 16, oct: 4 }, // E5
  '[': { semi: 17, oct: 4 }, // F5
  ']': { semi: 18, oct: 4 }, // F#5
};

function keyToMidi(k) {
  const entry = KEY_TO_NOTE[k];
  if(!entry) return null;
  const baseOct = entry.oct;
  const baseMidi = (baseOct + 1) * 12 + entry.semi;
  return baseMidi + octaveShift * 12;
}

function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// ── 鍵盤データ構築 ──
const notes = [];
const START_MIDI = 36;
const TOTAL_KEYS = 61;

for(let i = 0; i < TOTAL_KEYS; i++) {
  const midi = START_MIDI + i;
  const octave = Math.floor(midi / 12) - 1;
  const noteNames = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const noteName = noteNames[midi % 12];
  const isWhite = !noteName.includes('#');
  notes.push({ midi, n: `${noteName}${octave}`, f: midiToFreq(midi), w: isWhite });
}

// ── デフォルト・プリセット ──
const defaults = {
  waveform:'square', brightness:2800, resonance:0, attack:0.01, decay:0.2,
  sustain:0.5, release:0.5, lfoRate:0, lfoDepth:0, bitDepth:16, sampleRate:1,
  jitter:0, drift:0, speaker:4000, battery:0, noise:0,
  chorusRate:0.1, chorusDepth:0, chorusMix:0,
  delayMode:'single', delayTime:0.02, delayFeedback:0, delayMix:0,
  delayBass:0, delayTreble:0, delayWow:0
};

const lofiDefaults = { bitDepth:16, sampleRate:1, jitter:0, drift:0, battery:0, noise:0 };

// shorthand helpers for preset building
const _d0 = {delayMode:'single',delayTime:0.02,delayFeedback:0,delayMix:0,delayBass:0,delayTreble:0,delayWow:0};
function dp(mode,t,fb,mix,bass,treble,wow){return{delayMode:mode,delayTime:t,delayFeedback:fb,delayMix:mix,delayBass:bass,delayTreble:treble,delayWow:wow};}

const presets = {
  init: defaults,

  // PIANO
  elecPiano:{waveform:'sine',brightness:4800,resonance:1.5,attack:0.005,decay:0.6,sustain:0.2,release:0.7,lfoRate:5,lfoDepth:3,bitDepth:11,sampleRate:0.65,jitter:1,drift:0,speaker:2800,battery:2,noise:3,chorusRate:1.8,chorusDepth:0.006,chorusMix:0.28,...dp('double',0.35,0.3,0.18,-2,1,0.1)},

  // ORGAN
  pipeOrgan:{waveform:'triangle',brightness:3200,resonance:1,attack:0.04,decay:0.1,sustain:0.95,release:0.2,lfoRate:3,lfoDepth:4,bitDepth:10,sampleRate:0.55,jitter:2,drift:1,speaker:2000,battery:5,noise:7,chorusRate:1.2,chorusDepth:0.008,chorusMix:0.35,...dp('double',0.08,0.25,0.15,2,-1,0)},

  // STRINGS
  strings2:{waveform:'sawtooth',brightness:2800,resonance:0.5,attack:0.6,decay:0.8,sustain:0.7,release:1.4,lfoRate:4,lfoDepth:9,bitDepth:10,sampleRate:0.55,jitter:3,drift:1,speaker:2000,battery:5,noise:9,chorusRate:1.2,chorusDepth:0.014,chorusMix:0.55,...dp('single',0.02,0,0,0,0,0)},
  violin:{waveform:'sawtooth',brightness:4200,resonance:2,attack:0.15,decay:0.3,sustain:0.8,release:0.5,lfoRate:5.5,lfoDepth:5,bitDepth:11,sampleRate:0.68,jitter:2,drift:1,speaker:2800,battery:3,noise:6,chorusRate:1.8,chorusDepth:0.007,chorusMix:0.2,...dp('single',0.02,0,0,0,0,0)},

  // BRASS
  trumpet:{waveform:'sawtooth',brightness:2600,resonance:3,attack:0.02,decay:0.15,sustain:0.75,release:0.18,lfoRate:4,lfoDepth:2,bitDepth:8,sampleRate:0.45,jitter:4,drift:2,speaker:1700,battery:10,noise:10,chorusRate:0.7,chorusDepth:0.002,chorusMix:0.08,...dp('single',0.02,0,0,0,0,0)},
  brass:{waveform:'square',brightness:2000,resonance:4,attack:0.03,decay:0.2,sustain:0.65,release:0.2,lfoRate:3,lfoDepth:3,bitDepth:8,sampleRate:0.42,jitter:4,drift:2,speaker:1600,battery:10,noise:12,chorusRate:1,chorusDepth:0.004,chorusMix:0.18,...dp('single',0.02,0,0,0,0,0)},

  // WOODWIND
  clarinet:{waveform:'square',brightness:3000,resonance:1,attack:0.03,decay:0.15,sustain:0.78,release:0.22,lfoRate:4,lfoDepth:3,bitDepth:10,sampleRate:0.6,jitter:2,drift:1,speaker:2200,battery:5,noise:6,chorusRate:1.2,chorusDepth:0.003,chorusMix:0.1,...dp('single',0.02,0,0,0,0,0)},
  saxophone:{waveform:'sawtooth',brightness:2400,resonance:2,attack:0.025,decay:0.18,sustain:0.72,release:0.2,lfoRate:4.5,lfoDepth:4,bitDepth:9,sampleRate:0.5,jitter:3,drift:1,speaker:1900,battery:8,noise:8,chorusRate:0.8,chorusDepth:0.003,chorusMix:0.12,...dp('single',0.02,0,0,0,0,0)},

  // MALLET
  bell:{waveform:'sine',brightness:7000,resonance:2,attack:0.001,decay:1.2,sustain:0,release:1.5,lfoRate:6,lfoDepth:1,bitDepth:12,sampleRate:0.8,jitter:1,drift:0,speaker:3500,battery:0,noise:3,chorusRate:2,chorusDepth:0.006,chorusMix:0.2,...dp('double',0.48,0.42,0.25,0,2,0.05)},

  // SYNTH
  synthLead:{waveform:'square',brightness:3800,resonance:4,attack:0.005,decay:0.15,sustain:0.65,release:0.18,lfoRate:0,lfoDepth:0,bitDepth:14,sampleRate:0.9,jitter:0,drift:0,speaker:4500,battery:0,noise:2,chorusRate:0.5,chorusDepth:0.001,chorusMix:0.05,...dp('slap',0.08,0.2,0.15,0,2,0)},
  synthPad:{waveform:'sawtooth',brightness:2800,resonance:1,attack:0.8,decay:0.8,sustain:0.7,release:2.0,lfoRate:3,lfoDepth:8,bitDepth:12,sampleRate:0.75,jitter:2,drift:1,speaker:2200,battery:3,noise:5,chorusRate:1.2,chorusDepth:0.012,chorusMix:0.5,...dp('triple',0.4,0.48,0.3,-1,0,0.15)},
  synthBass:{waveform:'sawtooth',brightness:1200,resonance:5,attack:0.005,decay:0.2,sustain:0.5,release:0.15,lfoRate:0,lfoDepth:0,bitDepth:14,sampleRate:0.9,jitter:0,drift:0,speaker:900,battery:0,noise:3,chorusRate:0.5,chorusDepth:0.001,chorusMix:0.04,...dp('single',0.02,0,0,0,0,0)},

  // LO-FI
  vhsPad:{waveform:'sawtooth',brightness:3200,resonance:1,attack:1.2,decay:1,sustain:0.8,release:2.5,lfoRate:3,lfoDepth:12,bitDepth:7,sampleRate:0.25,jitter:10,drift:6,speaker:1700,battery:25,noise:18,chorusRate:0.7,chorusDepth:0.02,chorusMix:0.65,...dp('triple',0.5,0.52,0.38,3,-3,0.35)},
  brokenCassette:{waveform:'square',brightness:1400,resonance:5,attack:0.02,decay:0.4,sustain:0.4,release:0.8,lfoRate:0.4,lfoDepth:15,bitDepth:4,sampleRate:0.08,jitter:18,drift:14,speaker:900,battery:40,noise:35,chorusRate:0.4,chorusDepth:0.018,chorusMix:0.35,...dp('double',0.3,0.62,0.28,4,-4,0.6)},
  gameboyLead:{waveform:'square',brightness:6500,resonance:0,attack:0.001,decay:0.1,sustain:0.7,release:0.08,lfoRate:7,lfoDepth:2,bitDepth:3,sampleRate:0.05,jitter:1,drift:0,speaker:5000,battery:0,noise:2,chorusRate:0.2,chorusDepth:0.001,chorusMix:0.02,...dp('slap',0.12,0.35,0.2,0,3,0.05)},
  hauntedToy:{waveform:'sine',brightness:1800,resonance:6,attack:0.6,decay:1.4,sustain:0.3,release:3,lfoRate:0.2,lfoDepth:20,bitDepth:5,sampleRate:0.12,jitter:12,drift:9,speaker:700,battery:45,noise:28,chorusRate:0.3,chorusDepth:0.025,chorusMix:0.7,...dp('triple',0.62,0.58,0.42,5,-5,0.7)},

  // ── CASIOTONE MT シリーズ再現 ──
  // MT-PIANO: MT-40/45/68の内蔵ピアノ。薄くビットノイズのある打鍵感
  mtPiano:{waveform:'triangle',brightness:3800,resonance:0,attack:0.003,decay:0.3,sustain:0.1,release:0.25,lfoRate:0,lfoDepth:0,bitDepth:6,sampleRate:0.18,jitter:2,drift:0,speaker:2800,battery:12,noise:8,chorusRate:0.8,chorusDepth:0.001,chorusMix:0.05,...dp('single',0.02,0,0,0,0,0)},
  // MT-ORGAN: 矩形波ベースのチープなオルガン。sustain長め
  mtOrgan:{waveform:'square',brightness:1800,resonance:0,attack:0.008,decay:0.04,sustain:0.88,release:0.06,lfoRate:0,lfoDepth:0,bitDepth:7,sampleRate:0.22,jitter:3,drift:2,speaker:1500,battery:15,noise:12,chorusRate:1.2,chorusDepth:0.002,chorusMix:0.1,...dp('single',0.02,0,0,0,0,0)},
  // MT-STRINGS: のこぎり波の薄いストリングス。ローファイアタック
  mtStrings:{waveform:'sawtooth',brightness:2200,resonance:0.5,attack:0.25,decay:0.5,sustain:0.65,release:0.8,lfoRate:4,lfoDepth:6,bitDepth:7,sampleRate:0.2,jitter:4,drift:2,speaker:1800,battery:18,noise:14,chorusRate:1.0,chorusDepth:0.006,chorusMix:0.35,...dp('single',0.02,0,0,0,0,0)},
  // MT-BRASS: MT-68/70のブラス。鼻にかかった独特のトーン
  mtBrass:{waveform:'square',brightness:1600,resonance:2,attack:0.015,decay:0.12,sustain:0.68,release:0.15,lfoRate:3,lfoDepth:2,bitDepth:7,sampleRate:0.2,jitter:5,drift:2,speaker:1400,battery:16,noise:14,chorusRate:0.6,chorusDepth:0.002,chorusMix:0.08,...dp('single',0.02,0,0,0,0,0)},
  // MT-FLUTE: 正弦波ベースの素朴なフルート
  mtFlute:{waveform:'triangle',brightness:4500,resonance:0,attack:0.05,decay:0.15,sustain:0.75,release:0.25,lfoRate:4.5,lfoDepth:4,bitDepth:8,sampleRate:0.28,jitter:2,drift:1,speaker:2500,battery:8,noise:6,chorusRate:1.4,chorusDepth:0.002,chorusMix:0.08,...dp('single',0.02,0,0,0,0,0)},
  // MT-VIOLIN: MT特有の細くローファイなバイオリン
  mtViolin:{waveform:'sawtooth',brightness:2800,resonance:1,attack:0.12,decay:0.2,sustain:0.72,release:0.4,lfoRate:5,lfoDepth:5,bitDepth:7,sampleRate:0.22,jitter:3,drift:1,speaker:2000,battery:14,noise:10,chorusRate:1.5,chorusDepth:0.004,chorusMix:0.15,...dp('single',0.02,0,0,0,0,0)},
  // MT-MARIMBA: 短くクリアな打鍵音、MT独特の薄いサスティン
  mtMarimba:{waveform:'sine',brightness:4200,resonance:0,attack:0.001,decay:0.22,sustain:0,release:0.18,lfoRate:0,lfoDepth:0,bitDepth:8,sampleRate:0.3,jitter:1,drift:0,speaker:3000,battery:5,noise:4,chorusRate:0.3,chorusDepth:0.001,chorusMix:0.03,...dp('single',0.02,0,0,0,0,0)},
  // MT-VIBRAPHONE: ビブラート付きビブラフォン
  mtVibraphone:{waveform:'sine',brightness:5000,resonance:0.5,attack:0.003,decay:0.8,sustain:0.08,release:1.0,lfoRate:5,lfoDepth:5,bitDepth:9,sampleRate:0.35,jitter:1,drift:0,speaker:3200,battery:3,noise:3,chorusRate:1.8,chorusDepth:0.004,chorusMix:0.18,...dp('single',0.02,0,0,0,0,0)},
  // MT-GUITAR: MTシリーズのナイロンギター風。ピーキーなアタック
  mtGuitar:{waveform:'triangle',brightness:4800,resonance:0,attack:0.001,decay:0.4,sustain:0.05,release:0.35,lfoRate:0,lfoDepth:0,bitDepth:8,sampleRate:0.32,jitter:1,drift:0,speaker:3400,battery:6,noise:5,chorusRate:0.5,chorusDepth:0.001,chorusMix:0.06,...dp('single',0.02,0,0,0,0,0)},
  // MT-BASS: MT低音弦。太く短い
  mtBass:{waveform:'sawtooth',brightness:1000,resonance:1,attack:0.004,decay:0.15,sustain:0.45,release:0.12,lfoRate:0,lfoDepth:0,bitDepth:8,sampleRate:0.3,jitter:1,drift:0,speaker:800,battery:8,noise:5,chorusRate:0.3,chorusDepth:0.001,chorusMix:0.03,...dp('single',0.02,0,0,0,0,0)},
  // MT-TRUMPET: チープなブリキトランペット
  mtTrumpet:{waveform:'sawtooth',brightness:2000,resonance:2.5,attack:0.018,decay:0.1,sustain:0.7,release:0.14,lfoRate:3.5,lfoDepth:2,bitDepth:7,sampleRate:0.22,jitter:4,drift:2,speaker:1600,battery:14,noise:12,chorusRate:0.5,chorusDepth:0.001,chorusMix:0.06,...dp('single',0.02,0,0,0,0,0)},
  // MT-BANJO: 金属的に弾けるバンジョー風
  mtBanjo:{waveform:'sawtooth',brightness:5500,resonance:0,attack:0.001,decay:0.18,sustain:0,release:0.15,lfoRate:0,lfoDepth:0,bitDepth:7,sampleRate:0.25,jitter:2,drift:0,speaker:4000,battery:4,noise:6,chorusRate:0.2,chorusDepth:0.001,chorusMix:0.03,...dp('slap',0.06,0.15,0.1,0,2,0)},
  // MT-HARMONICA: MT-40に搭載のハーモニカ
  mtHarmonica:{waveform:'square',brightness:2500,resonance:1.5,attack:0.02,decay:0.1,sustain:0.75,release:0.18,lfoRate:5,lfoDepth:3,bitDepth:8,sampleRate:0.28,jitter:3,drift:2,speaker:2000,battery:12,noise:10,chorusRate:1.0,chorusDepth:0.003,chorusMix:0.12,...dp('single',0.02,0,0,0,0,0)},
  // MT-HARPSICHORD: MT-100/500のハープシコード風
  mtHarpsichord:{waveform:'sawtooth',brightness:4500,resonance:0,attack:0.001,decay:0.28,sustain:0,release:0.2,lfoRate:0,lfoDepth:0,bitDepth:7,sampleRate:0.24,jitter:2,drift:0,speaker:3200,battery:5,noise:7,chorusRate:0.3,chorusDepth:0.001,chorusMix:0.04,...dp('single',0.02,0,0,0,0,0)},
  // MT-XYLOPHONE: MT-65/68のシロフォン
  mtXylophone:{waveform:'sine',brightness:6000,resonance:0,attack:0.001,decay:0.15,sustain:0,release:0.12,lfoRate:0,lfoDepth:0,bitDepth:8,sampleRate:0.32,jitter:1,drift:0,speaker:4500,battery:3,noise:3,chorusRate:0.2,chorusDepth:0.001,chorusMix:0.02,...dp('single',0.02,0,0,0,0,0)},
  // MT-CHOIRPAD: MT-500の合唱パッド風。ゆっくりのアタック
  mtChoirPad:{waveform:'triangle',brightness:2600,resonance:0.5,attack:0.5,decay:0.6,sustain:0.78,release:1.5,lfoRate:3,lfoDepth:8,bitDepth:8,sampleRate:0.3,jitter:4,drift:2,speaker:1900,battery:10,noise:8,chorusRate:1.3,chorusDepth:0.008,chorusMix:0.45,...dp('double',0.18,0.22,0.18,1,-1,0.08)},
  // MT-FANTASIA: MT-500の幻想的なリード。LFO揺れが特徴
  mtFantasia:{waveform:'sine',brightness:3200,resonance:2,attack:0.1,decay:0.4,sustain:0.65,release:1.2,lfoRate:0.8,lfoDepth:14,bitDepth:8,sampleRate:0.32,jitter:3,drift:2,speaker:2200,battery:8,noise:6,chorusRate:0.8,chorusDepth:0.01,chorusMix:0.55,...dp('triple',0.3,0.35,0.22,1,-1,0.15)},

  // ── DRONE ── ドローンシーケンサー向け持続音
  // TIBETAN BOWL: 倍音豊かなゆっくり持続するボウル音
  tibetanBowl:{waveform:'sine',brightness:7500,resonance:3,attack:0.05,decay:3.0,sustain:0.5,release:5.0,lfoRate:0.3,lfoDepth:3,bitDepth:14,sampleRate:0.95,jitter:0,drift:0,speaker:5000,battery:0,noise:1,chorusRate:2.5,chorusDepth:0.005,chorusMix:0.2,...dp('triple',0.8,0.55,0.28,0,3,0.05)},
  // TANPURA: インド古典のタンプーラ風ドローン。うなりと揺れ
  tanpura:{waveform:'sawtooth',brightness:2200,resonance:1,attack:0.3,decay:1.5,sustain:0.85,release:3.0,lfoRate:0.4,lfoDepth:10,bitDepth:12,sampleRate:0.8,jitter:2,drift:1,speaker:1800,battery:2,noise:3,chorusRate:0.5,chorusDepth:0.018,chorusMix:0.75,...dp('triple',0.6,0.5,0.35,2,-1,0.2)},
  // SHIMMERDRONE: キラキラしたシマードローン。高いリバーブ感
  shimmerDrone:{waveform:'triangle',brightness:6000,resonance:1.5,attack:1.5,decay:1.0,sustain:0.88,release:4.0,lfoRate:0.2,lfoDepth:6,bitDepth:14,sampleRate:0.9,jitter:0,drift:0,speaker:4500,battery:0,noise:1,chorusRate:1.8,chorusDepth:0.012,chorusMix:0.65,...dp('triple',0.45,0.52,0.35,-1,2,0.12)},
  // SUBOCTAVE: 深い低音ドローン。サブベース感
  subOctave:{waveform:'sine',brightness:600,resonance:0.5,attack:0.8,decay:1.0,sustain:0.9,release:3.5,lfoRate:0.15,lfoDepth:4,bitDepth:14,sampleRate:0.95,jitter:0,drift:0,speaker:500,battery:0,noise:2,chorusRate:0.3,chorusDepth:0.008,chorusMix:0.3,...dp('single',0.02,0,0,0,0,0)},
  // ORGANPOINT: パイプオルガンのペダルポイント風、荘厳なドローン
  organPoint:{waveform:'square',brightness:1400,resonance:0,attack:0.1,decay:0.2,sustain:0.95,release:2.5,lfoRate:1.5,lfoDepth:3,bitDepth:10,sampleRate:0.55,jitter:1,drift:1,speaker:1200,battery:4,noise:5,chorusRate:0.8,chorusDepth:0.01,chorusMix:0.4,...dp('double',0.12,0.3,0.2,3,-1,0.05)},

  // ── NATURE ── 環境音・効果音
  // OCEAN: 白いノイズで海の波音を再現
  ocean:{waveform:'sine',brightness:800,resonance:0,attack:2.0,decay:1.5,sustain:0.7,release:4.0,lfoRate:0.08,lfoDepth:25,bitDepth:8,sampleRate:0.15,jitter:22,drift:18,speaker:600,battery:0,noise:95,chorusRate:0.1,chorusDepth:0.025,chorusMix:0.8,...dp('triple',0.7,0.55,0.45,4,-4,0.5)},
  // RAIN: 細かい雨音。高域ノイズ中心
  rain:{waveform:'sine',brightness:5000,resonance:0,attack:0.5,decay:0.3,sustain:0.8,release:1.5,lfoRate:0.2,lfoDepth:8,bitDepth:6,sampleRate:0.12,jitter:20,drift:10,speaker:3500,battery:0,noise:88,chorusRate:0.3,chorusDepth:0.015,chorusMix:0.6,...dp('double',0.15,0.4,0.35,0,-2,0.3)},
  // STREAM: せせらぎ。中域ノイズ+ランダムなピッチ揺れ
  stream:{waveform:'sine',brightness:2500,resonance:0.5,attack:1.0,decay:0.8,sustain:0.75,release:2.5,lfoRate:0.5,lfoDepth:18,bitDepth:7,sampleRate:0.14,jitter:25,drift:20,speaker:1800,battery:0,noise:80,chorusRate:0.4,chorusDepth:0.02,chorusMix:0.7,...dp('triple',0.4,0.45,0.38,2,-2,0.4)},
  // BIRDS: 鳥のさえずり風。高域の断続的な揺れ
  birds:{waveform:'sine',brightness:7000,resonance:2,attack:0.04,decay:0.25,sustain:0.3,release:0.4,lfoRate:8,lfoDepth:22,bitDepth:10,sampleRate:0.55,jitter:15,drift:12,speaker:5000,battery:0,noise:10,chorusRate:3,chorusDepth:0.008,chorusMix:0.3,...dp('slap',0.08,0.2,0.18,0,3,0.1)},
  // INSECTS: 夏の虫の声。LFO高速・ノイズ+ピッチ揺れ
  insects:{waveform:'square',brightness:3500,resonance:1,attack:0.01,decay:0.08,sustain:0.6,release:0.15,lfoRate:14,lfoDepth:8,bitDepth:6,sampleRate:0.1,jitter:18,drift:8,speaker:2800,battery:0,noise:45,chorusRate:4,chorusDepth:0.005,chorusMix:0.25,...dp('double',0.05,0.3,0.2,-1,1,0.2)},
};

// ── UI helpers ──
function updateValues() {
  document.querySelectorAll('input[type=range]').forEach(el => {
    const v = document.getElementById(el.id + 'Value');
    if(v) v.textContent = parseFloat(el.value).toFixed(el.step && el.step < 0.1 ? 3 : (el.step == 1 || !el.step ? 0 : 2));
  });
}

function applySettings(settings) {
  Object.entries(settings).forEach(([k,v]) => {
    const el = document.getElementById(k);
    if(el) el.value = v;
  });
  updateValues();
  // Sync shared FX buses with new preset values
  updateChorusBus();
  updateEchoBus();
  updateMasterLoFi();
}

function randomize() {
  const safeRanges = {
    brightness:[800, 5000], resonance:[0, 3.5], attack:[0.001,0.8], decay:[0.05,1.2],
    sustain:[0.5, 0.85], release:[0.05,1.8], lfoRate:[0,6], lfoDepth:[0,5],
    bitDepth:[10,16], sampleRate:[0.5,1], jitter:[0,5], drift:[0,3],
    speaker:[2000,5500], battery:[0,12], noise:[0,10],
    chorusRate:[0.1,3], chorusDepth:[0,0.008], chorusMix:[0,0.35],
    delayTime:[0.02,0.6], delayFeedback:[0,0.55], delayMix:[0,0.35],
    delayBass:[-6,4], delayTreble:[-6,4], delayWow:[0,0.3]
  };
  Object.entries(safeRanges).forEach(([id,[min,max]]) => {
    const el = document.getElementById(id);
    if(el) el.value = min + Math.random() * (max - min);
  });
  const waves = ['square','sawtooth','triangle','sine'];
  document.getElementById('waveform').value = waves[Math.floor(Math.random()*waves.length)];
  updateValues();
}

// ── AudioEngine ──
function createCrusher(bitDepth, reduction) {
  if(workletReady) {
    return new AudioWorkletNode(ctx, 'bit-crusher', {
      processorOptions: { bitDepth, reduction }
    });
  }
  // フォールバック：ScriptProcessor（非推奨だが互換性維持）
  const node = ctx.createScriptProcessor(512, 1, 1);
  let phase = 0, lastSample = 0;
  const step = Math.pow(0.5, bitDepth);
  node.onaudioprocess = e => {
    const input = e.inputBuffer.getChannelData(0);
    const output = e.outputBuffer.getChannelData(0);
    for(let i = 0; i < input.length; i++) {
      phase += reduction;
      if(phase >= 1.0) { phase -= 1.0; lastSample = step * Math.floor(input[i] / step + 0.5); }
      output[i] = lastSample;
    }
  };
  return node;
}

function createNoise(amount) {
  // BufferSource is still per-voice (must be, it has start/stop state).
  // AudioBuffer is shared — no allocation here.
  const source = ctx.createBufferSource();
  source.buffer = getSharedNoiseBuffer();
  source.loop = true;
  // Amplitude scaling moved to a GainNode so the shared buffer stays unmodified.
  // The GainNode is the node callers connect/disconnect — source is internal.
  const gainNode = ctx.createGain();
  gainNode.gain.value = amount;
  source.connect(gainNode);
  // Expose start/stop on the wrapper so call-sites don't change.
  gainNode._noiseSrc = source;
  gainNode.start = () => source.start();
  gainNode.stop  = (t) => { try { source.stop(t); } catch(_) {} };
  return gainNode;
}

// ── noteOn v1.3: lightweight per-voice chain ──
// FX (chorus/echo) are now shared buses — NOT per voice.
// Per voice: OSC → BitCrusher → LPF → SpeakerEQ → Saturator → ADSR gain → sourceGain
// sourceGain is passed in so keyboard/seq/drone route to correct mixer channel.
function noteOn(freq, id, settingsOverride, velocityScale, _destGain) {
  if(activeVoices.size >= MAX_VOICES) {
    const stolenId = activeVoices.keys().next().value;
    // slowSeqActiveVoicesからも削除
    const sIdx = slowSeqActiveVoices.indexOf(stolenId);
    if(sIdx !== -1) slowSeqActiveVoices.splice(sIdx, 1);
    noteOff(stolenId);
  }

  const S = settingsOverride || {};
  const gv = (key, parse) => {
    if(S[key] !== undefined) return parse ? parseFloat(S[key]) : S[key];
    const el = document.getElementById(key);
    return el ? (parse ? parseFloat(el.value) : el.value) : undefined;
  };

  const waveform     = S.waveform || document.getElementById('waveform').value;
  const brightness   = gv('brightness', true);
  const resonance    = gv('resonance', true);
  const attack       = gv('attack', true);
  const decay        = gv('decay', true);
  const sustain      = gv('sustain', true);
  const release      = gv('release', true);
  const lfoRate      = gv('lfoRate', true);
  const lfoDepth     = gv('lfoDepth', true);
  const jitterAmount = S.jitter  !== undefined ? parseFloat(S.jitter)  : getLofiParam('jitter');
  const drift        = S.drift   !== undefined ? parseFloat(S.drift)   : getLofiParam('drift');
  const speaker      = gv('speaker', true);
  const battery      = S.battery !== undefined ? parseFloat(S.battery) : getLofiParam('battery');
  const noiseAmount  = (S.noise  !== undefined ? parseFloat(S.noise)   : getLofiParam('noise')) / 3000;

  const destGain = _destGain || keyboardGain;

  // ── Node creation: osc→filter→speakerFilt→saturator→gain→dest ──
  // per-voice BitCrusher は除去済み。
  // bitDepth/sampleRate は master LoFi（AudioWorklet/ScriptProcessor）が一括処理。
  const osc         = ctx.createOscillator();
  const gain        = ctx.createGain();
  const filter      = ctx.createBiquadFilter();
  const speakerFilt = ctx.createBiquadFilter();
  const saturator   = ctx.createWaveShaper();
  const lfo         = ctx.createOscillator();
  const lfoGain     = ctx.createGain();

  // ── Oscillator ──
  osc.type = waveform;
  osc.frequency.value = freq - battery * 0.12;

  // ── Filter ──
  filter.type = 'lowpass';
  filter.frequency.value = brightness;
  filter.Q.value = resonance;

  // ── Speaker cabinet sim ──
  speakerFilt.type = 'highshelf';
  speakerFilt.frequency.value = speaker * 0.8;
  speakerFilt.gain.value = -6;

  // ── Saturator ──
  const curve = new Float32Array(256);
  for(let i = 0; i < 256; i++) {
    const x = i / 128 - 1;
    curve[i] = Math.tanh(x * (1.5 + battery / 40));
  }
  saturator.curve = curve;

  // ── ADSR ──
  const vScale = (velocityScale !== undefined) ? Math.max(0.05, Math.min(1.0, velocityScale)) : 1.0;
  const resonanceComp = 1.0 / (1.0 + resonance * 0.06);
  const peakGain = 0.65 * vScale * resonanceComp;
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(peakGain, ctx.currentTime + attack);
  gain.gain.linearRampToValueAtTime(Math.max(sustain, 0.5) * peakGain, ctx.currentTime + attack + decay);

  // ── LFO ──
  lfo.frequency.value = lfoRate;
  lfoGain.gain.value = lfoDepth;
  lfo.connect(lfoGain);
  lfoGain.connect(osc.frequency);

  // ── Signal chain ──
  osc.connect(filter);
  filter.connect(speakerFilt);
  speakerFilt.connect(saturator);
  saturator.connect(gain);
  gain.connect(destGain);

  // ── Noise floor ──
  const noise = createNoise(noiseAmount);
  noise.connect(gain);

  // ── Jitter / drift ──
  const baseFreq = freq - battery * 0.12;
  let jitterInterval = null;
  if(jitterAmount > 0 || drift > 0) {
    jitterInterval = setInterval(() => {
      if(!activeVoices.has(id)) { clearInterval(jitterInterval); return; }
      const t = ctx.currentTime;
      const delta = (Math.random() - 0.5) * jitterAmount + drift * 0.02;
      try {
        osc.frequency.cancelScheduledValues(t);
        osc.frequency.setValueAtTime(osc.frequency.value, t);
        osc.frequency.linearRampToValueAtTime(baseFreq + delta, t + 0.08);
      } catch(_) {}
    }, 80);
  }

  osc.start();
  lfo.start();
  noise.start();

  activeVoices.set(id, {
    osc, gain, filter, speakerFilt, saturator,
    lfo, lfoGain, noise,
    release, jitter: jitterInterval
  });
}


function noteOff(id) {
  const voice = activeVoices.get(id);
  if(!voice) return;
  activeVoices.delete(id);

  clearInterval(voice.jitter);

  const now = ctx.currentTime;
  voice.gain.gain.cancelScheduledValues(now);
  voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
  voice.gain.gain.exponentialRampToValueAtTime(0.0001, now + voice.release);

  const stopAt = now + voice.release + 0.05;
  voice.osc.stop(stopAt);
  voice.lfo.stop(stopAt);
  voice.noise.stop(stopAt);

  voice.osc.onended = () => {
    [voice.osc, voice.filter, voice.speakerFilt,
     voice.saturator, voice.lfo, voice.lfoGain,
     voice.gain, voice.noise].forEach(n => {
      try { n.disconnect(); } catch(_) {}
    });
    try { if(voice.noise._noiseSrc) voice.noise._noiseSrc.disconnect(); } catch(_) {}
  };
}

// ── 鍵盤UI構築 ──
const keyboard = document.getElementById('keyboard');
const keyEls = new Map(); // midi → element
let whiteIndex = 0;
const KEYBOARD_VELOCITY_SCALE = 0.8;
const PC_KEYBOARD_VELOCITY_SCALE = 0.55;

notes.forEach(note => {
  const key = document.createElement('div');
  if(note.w) {
    key.className = 'white';
    whiteIndex++;
  } else {
    key.className = 'black';
    key.style.left = `${whiteIndex * WHITE_KEY_WIDTH - 13}px`;
  }

  key.dataset.midi = note.midi;

  const inner = document.createElement('div');
  inner.style.cssText = 'pointer-events:none;text-align:center;line-height:1.4;';
  inner.innerHTML = `<span class="key-note">${note.n}</span><br><span class="key-kb" style="opacity:.5;font-size:8px;"></span>`;
  key.appendChild(inner);

  key.addEventListener('mousedown', async () => {
    await ctx.resume();
    startSharedFxLfos();
    const snappedMidi = snapMidi(note.midi);
    const snappedFreq = snappedMidi !== note.midi ? midiToFreq(snappedMidi) : note.f;
    noteOn(snappedFreq, note.midi, null, KEYBOARD_VELOCITY_SCALE, keyboardGain);
    key.classList.add('pressed');
  });

  const releaseKey = () => {
    noteOff(note.midi);
    key.classList.remove('pressed');
  };
  key.addEventListener('mouseup', releaseKey);
  key.addEventListener('mouseleave', releaseKey);

  // touch
  key.addEventListener('touchstart', async e => {
    e.preventDefault();
    await ctx.resume();
    startSharedFxLfos();
    const snappedMidi = snapMidi(note.midi);
    const snappedFreq = snappedMidi !== note.midi ? midiToFreq(snappedMidi) : note.f;
    noteOn(snappedFreq, note.midi, null, KEYBOARD_VELOCITY_SCALE, keyboardGain);
    key.classList.add('pressed');
  }, { passive:false });
  key.addEventListener('touchend', releaseKey);

  keyEls.set(note.midi, key);
  keyboard.appendChild(key);
});

// キーボードラベルをオクターブシフトに合わせて更新
function rebuildKeyLabels() {
  // 全キーのラベルをクリア
  keyEls.forEach((el) => {
    const span = el.querySelector('.key-kb');
    if(span) span.textContent = '';
  });
  // 現在のオクターブシフトに基づいてラベルを設定
  Object.entries(KEY_TO_NOTE).forEach(([k, entry]) => {
    const baseMidi = (entry.oct + 1) * 12 + entry.semi;
    const midi = baseMidi + octaveShift * 12;
    const el = keyEls.get(midi);
    if(el) {
      const span = el.querySelector('.key-kb');
      if(span) span.textContent = k.toUpperCase();
    }
  });
}

rebuildKeyLabels();

// ── PCキーボードイベント ──
const heldKeys = new Set();

window.addEventListener('keydown', async e => {
  const active = document.activeElement;
  // テキスト入力中はピアノ処理をスキップ（blurもしない）
  if(active && active.tagName === 'INPUT' && active.type === 'text') return;
  // SELECT/BUTTONはblurしてピアノに戻す
  if(active && (active.tagName === 'SELECT' || active.tagName === 'BUTTON')) {
    active.blur();
  }

  const k = e.key.toLowerCase();
  if(e.repeat) {
    e.preventDefault();
    return;
  }
  if(heldKeys.has(k)) return;

  const midi = keyToMidi(k);
  if(midi === null) return;

  heldKeys.add(k);
  e.preventDefault();

  await ctx.resume();
  startSharedFxLfos();
  const snappedMidi = snapMidi(midi);
  const freq = midiToFreq(snappedMidi);
  noteOn(freq, `kb_${k}`, null, PC_KEYBOARD_VELOCITY_SCALE, keyboardGain);

  // 視覚フィードバック
  const el = keyEls.get(midi);
  if(el) el.classList.add('pressed');
});

window.addEventListener('keyup', e => {
  const k = e.key.toLowerCase();
  heldKeys.delete(k);

  const midi = keyToMidi(k);
  if(midi === null) return;

  noteOff(`kb_${k}`);

  // 視覚フィードバック解除
  const el = keyEls.get(midi);
  if(el) el.classList.remove('pressed');
});

// ── スライダーイベント ──
document.querySelectorAll('input[type=range]').forEach(el => {
  el.addEventListener('input', updateValues);
});

// ── ボタン ──
document.getElementById('resetBtn').onclick = () => {
  applySettings(defaults);
  document.getElementById('preset').value = 'init';
  document.getElementById('lcdDisplay').textContent = 'METRO HWY';
};

document.getElementById('panicBtn').onclick = () => {
  panicStop();
};

document.getElementById('loficlearBtn').onclick = () => {
  applySettings(lofiDefaults);
};

const echoDefaults = { delayMode:'single', delayTime:0.02, delayFeedback:0, delayMix:0, delayBass:0, delayTreble:0, delayWow:0 };

document.getElementById('echoclearBtn').onclick = () => {
  applySettings(echoDefaults);
};

document.getElementById('randomBtn').onclick = () => {
  randomize();
  document.getElementById('preset').value = '';
  document.getElementById('lcdDisplay').textContent = 'RANDOM__';
};

// ── MIDI ──
async function initMIDI() {
  if(!navigator.requestMIDIAccess) return;
  try {
    const midi = await navigator.requestMIDIAccess();
    for(const input of midi.inputs.values()) {
      input.onmidimessage = async msg => {
        await ctx.resume();
        startSharedFxLfos();
        const [status, note, velocity] = msg.data;
        const command = status & 0xf0;
        const snappedMidi = snapMidi(note);
        const freq = midiToFreq(snappedMidi);
        if(command === 0x90 && velocity > 0) noteOn(freq, `midi_${note}`, null, velocity/127, keyboardGain);
        if(command === 0x80 || (command === 0x90 && velocity === 0)) noteOff(`midi_${note}`);
      };
    }
  } catch(err) {
    // MIDI unavailable in this environment (permissions policy etc.) — silent fallback
  }
}

