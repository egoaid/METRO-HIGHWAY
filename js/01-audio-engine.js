// ════════════════════════════════════════════════
// ── AUDIO INFRASTRUCTURE v1.3 ──
// ════════════════════════════════════════════════
const AudioContext = window.AudioContext || window.webkitAudioContext;
const ctx = new AudioContext();

// ══════════════════════════════════════════════════════════
// ── MASTER SIGNAL CHAIN (v1.5 corrected order) ──
//
//  masterMixGain
//    → shared FX buses (chorus / echo)
//    → fxOutGain
//    → masterLoFiNode        (bit-crush / sample-rate)
//    → masterLimiter         (dynamics compressor — hard ceiling)
//    → ceilingGain           (0.92 safety headroom)
//    → masterAnalyser        (oscilloscope + recorder tap — POST-limiter)
//    → masterVolGain         (user volume fader)
//    → ctx.destination
//
//  The limiter MUST be before the analyser so that:
//  • oscilloscope never shows clipped flat-tops
//  • WAV recorder captures post-limiter, peak-safe PCM
//  • masterVolGain cannot push signal above 0 dBFS into destination
// ══════════════════════════════════════════════════════════

// ── ctx.destination is the final sink — nothing connects directly to it
//    except masterVolGain below. ──

// ── Master volume (post-analyser, controls room volume only) ──
const masterVolGain = ctx.createGain();
masterVolGain.gain.value = 0.8;

// ── 録音専用アナライザー（masterVolGain の後 = フェードが反映される） ──
const recAnalyser = ctx.createAnalyser();
recAnalyser.fftSize = 2048;
masterVolGain.connect(recAnalyser);
// ── BGM レベル用ゲイン（v1.9.0）: ユーザーが「BGM」の音量を 0〜100% で選ぶ（16n の AudioMix。保存される）。
//    既定は 1.0（完全に透明）。ユーザーのフェーダー(masterVolGain)や Auto Drone のフェードとは「掛け算」で独立して働く。
//    録音の取り出し口(recAnalyser)はこの手前なので、録音の音量には影響しない（room volume のみ）。
//    ゲームの開始・終了では動かさない（v1.8.3 のダックは、ゲームオーバーで BGM が急に大きくなって驚くため廃止）。 ──
const bgmLevelGain = ctx.createGain();
bgmLevelGain.gain.value = 1;
recAnalyser.connect(bgmLevelGain);
bgmLevelGain.connect(ctx.destination);         // ONLY connection to destination

// ── Master analyser (oscilloscope + recording tap — POST-limiter) ──
const masterAnalyser = ctx.createAnalyser();
masterAnalyser.fftSize = 2048;
masterAnalyser.smoothingTimeConstant = 0.75;
masterAnalyser.connect(masterVolGain);           // analyser → vol → destination

// ── Hard ceiling gain (safety headroom before analyser) ──
const ceilingGain = ctx.createGain();
ceilingGain.gain.value = 0.92;                  // –0.72 dB absolute ceiling
ceilingGain.connect(masterAnalyser);             // ceiling → analyser

// ── Master limiter ──
// Sits AFTER LoFi (which can produce harmonic spikes at low bit-depths)
// and BEFORE the analyser/recorder tap so both see peak-safe audio.
// Settings: softer knee + lower ratio than brick-wall for musical transparency,
// but threshold low enough to catch dense chord buildup.
const masterLimiter = ctx.createDynamicsCompressor();
masterLimiter.threshold.value = -6.0;   // start limiting at -6 dBFS
masterLimiter.knee.value      =  6.0;   // soft knee: gentle 6 dB transition zone
masterLimiter.ratio.value     = 12.0;   // 12:1 — aggressive but not brick-wall
masterLimiter.attack.value    = 0.003;  // 3 ms — fast enough to catch transients
masterLimiter.release.value   = 0.12;   // 120 ms — natural release
masterLimiter.connect(ceilingGain);              // limiter → ceiling → analyser

// ════════════════════════════════════════════════
// ── MASTER LO-FI PROCESSOR (Phase 3) ──
// Master lo-fi sits between mix bus and limiter.
// AudioWorklet is preferred; ScriptProcessor is fallback only.
const MASTER_LOFI_BUFSIZE = 512;
let masterLoFiNode = null;
let masterLoFiWorkletNode = null;
let _mlfStep   = 1.0;   // bit-crush step  (1.0 = bypass)
let _mlfReduce = 1.0;   // sample-rate reduction (1.0 = bypass)
let _mlfPhaseL = 0, _mlfPhaseR = 0;
let _mlfLastL  = 0, _mlfLastR  = 0;
function _createMasterLoFiFallbackNode() {
  const node = ctx.createScriptProcessor(MASTER_LOFI_BUFSIZE, 2, 2);
  node.onaudioprocess = e => {
    const inL  = e.inputBuffer.getChannelData(0);
    const inR  = e.inputBuffer.getChannelData(1);
    const outL = e.outputBuffer.getChannelData(0);
    const outR = e.outputBuffer.getChannelData(1);
    const step   = _mlfStep;
    const reduce = _mlfReduce;
    for(let i = 0; i < inL.length; i++) {
      _mlfPhaseL += reduce;
      _mlfPhaseR += reduce;
      if(_mlfPhaseL >= 1.0) {
        _mlfPhaseL -= 1.0;
        _mlfLastL = step < 1.0 ? step * Math.floor(inL[i] / step + 0.5) : inL[i];
      }
      if(_mlfPhaseR >= 1.0) {
        _mlfPhaseR -= 1.0;
        _mlfLastR = step < 1.0 ? step * Math.floor(inR[i] / step + 0.5) : inR[i];
      }
      outL[i] = _mlfLastL;
      outR[i] = _mlfLastR;
    }
  };
  return node;
}

function _bindMasterLoFiNode(nextNode) {
  if(masterLoFiNode) {
    try { fxOutGain.disconnect(masterLoFiNode); } catch(_) {}
    try { masterLoFiNode.disconnect(masterLimiter); } catch(_) {}
  }
  masterLoFiNode = nextNode;
  fxOutGain.connect(masterLoFiNode);
  masterLoFiNode.connect(masterLimiter);
}

function updateMasterLoFi() {
  const bd = parseInt(document.getElementById('bitDepth').value);
  const sr = parseFloat(document.getElementById('sampleRate').value);
  _mlfStep   = bd < 16 ? Math.pow(0.5, bd) : 1.0;
  _mlfReduce = Math.max(0.02, Math.min(1.0, sr));
  if(masterLoFiWorkletNode) {
    masterLoFiWorkletNode.port.postMessage({
      type: 'params',
      step: _mlfStep,
      reduce: _mlfReduce,
    });
  }
}

// ── Shared FX buses (Phase 2) ──
// ── CHORUS BUS ──
const chorusBusIn   = ctx.createGain(); // receives sends from mix bus
const chorusDryG    = ctx.createGain();
const chorusWetG    = ctx.createGain();
chorusDryG.gain.value = 1.0;
chorusWetG.gain.value = 0.0;

const chorusBusDelayL  = ctx.createDelay();
const chorusBusDelayR  = ctx.createDelay();
const chorusBusPanL    = ctx.createStereoPanner();
const chorusBusPanR    = ctx.createStereoPanner();
const chorusBusLFOL    = ctx.createOscillator();
const chorusBusLFOR    = ctx.createOscillator();
const chorusBusModL    = ctx.createGain();
const chorusBusModR    = ctx.createGain();
chorusBusPanL.pan.value = -0.7;
chorusBusPanR.pan.value =  0.7;
chorusBusDelayL.delayTime.value = 0.02;
chorusBusDelayR.delayTime.value = 0.028;
chorusBusLFOL.frequency.value = 0.5;
chorusBusLFOR.frequency.value = 0.505;
chorusBusModL.gain.value = 0.0;
chorusBusModR.gain.value = 0.0;
chorusBusLFOL.connect(chorusBusModL); chorusBusModL.connect(chorusBusDelayL.delayTime);
chorusBusLFOR.connect(chorusBusModR); chorusBusModR.connect(chorusBusDelayR.delayTime);
chorusBusIn.connect(chorusBusDelayL); chorusBusDelayL.connect(chorusBusPanL); chorusBusPanL.connect(chorusWetG);
chorusBusIn.connect(chorusBusDelayR); chorusBusDelayR.connect(chorusBusPanR); chorusBusPanR.connect(chorusWetG);

// ── ECHO BUS (RE-201) ──
const echoBusIn      = ctx.createGain();
const echoBusDryG    = ctx.createGain();
const echoBusWetG    = ctx.createGain();
echoBusDryG.gain.value = 1.0;
echoBusWetG.gain.value = 0.0;

const echoBusBassEQ  = ctx.createBiquadFilter();
echoBusBassEQ.type = 'lowshelf';
echoBusBassEQ.frequency.value = 250;
echoBusBassEQ.gain.value = 0;
const echoBusTrebEQ  = ctx.createBiquadFilter();
echoBusTrebEQ.type = 'highshelf';
echoBusTrebEQ.frequency.value = 3500;
echoBusTrebEQ.gain.value = 0;
const echoBusDelay   = ctx.createDelay(3.0);
echoBusDelay.delayTime.value = 0.35;
const echoBusFB      = ctx.createGain();
echoBusFB.gain.value = 0.0;
// Wow/flutter LFOs
const echoBusWowLFO  = ctx.createOscillator();
const echoBusWowG    = ctx.createGain();
echoBusWowLFO.frequency.value = 0.5;
echoBusWowG.gain.value = 0.0;
const echoBusFlutLFO = ctx.createOscillator();
const echoBusFlutG   = ctx.createGain();
echoBusFlutLFO.frequency.value = 7.0;
echoBusFlutG.gain.value = 0.0;
echoBusWowLFO.connect(echoBusWowG);  echoBusWowG.connect(echoBusDelay.delayTime);
echoBusFlutLFO.connect(echoBusFlutG); echoBusFlutG.connect(echoBusDelay.delayTime);
// Routing: in → bassEQ → trebEQ → delay → wet; delay → FB → bassEQ (recirculate)
echoBusIn.connect(echoBusBassEQ);
echoBusBassEQ.connect(echoBusTrebEQ);
echoBusTrebEQ.connect(echoBusDelay);
echoBusDelay.connect(echoBusWetG);
echoBusDelay.connect(echoBusFB);
echoBusFB.connect(echoBusBassEQ);

// ── MASTER MIX BUS ──
const masterMixGain = ctx.createGain();
masterMixGain.gain.value = 1.0;

// ドライ信号: masterMixGain → chorusDryG / echoBusDryG（今まで通り）
masterMixGain.connect(chorusDryG);
masterMixGain.connect(echoBusDryG);
// ※ masterMixGain → chorusBusIn / echoBusIn は接続しない
//   (チャンネル別sendに置き換えるため)

// FX returns merge into fxOut
const fxOutGain = ctx.createGain();
fxOutGain.gain.value = 1.0;
chorusDryG.connect(fxOutGain);
chorusWetG.connect(fxOutGain);
echoBusDryG.connect(fxOutGain);
echoBusWetG.connect(fxOutGain);

// fxOut → master Lo-Fi → master Limiter
// Connect after the node is created.

// ── Per-source gain nodes (channel strips) ──
const keyboardGain = ctx.createGain();
keyboardGain.gain.value = 0.8;
keyboardGain.connect(masterMixGain);

const seqGain = ctx.createGain();
seqGain.gain.value = 0.8;
seqGain.connect(masterMixGain);

const droneGain = ctx.createGain();
droneGain.gain.value = 0.5;
droneGain.connect(masterMixGain);

const rhythmGain = ctx.createGain();
rhythmGain.gain.value = 0.7;
rhythmGain.connect(masterMixGain);

// Legacy alias
const synthVolGain = keyboardGain;

// ── Per-channel FX send gains ──
// Chorus sends
const keysChorusSend   = ctx.createGain(); keysChorusSend.gain.value   = 0;
const seqChorusSend    = ctx.createGain(); seqChorusSend.gain.value    = 0;
const droneChorusSend  = ctx.createGain(); droneChorusSend.gain.value  = 0;
const rhythmChorusSend = ctx.createGain(); rhythmChorusSend.gain.value = 0;
keyboardGain.connect(keysChorusSend);   keysChorusSend.connect(chorusBusIn);
seqGain.connect(seqChorusSend);         seqChorusSend.connect(chorusBusIn);
droneGain.connect(droneChorusSend);     droneChorusSend.connect(chorusBusIn);
rhythmGain.connect(rhythmChorusSend);   rhythmChorusSend.connect(chorusBusIn);

// Echo sends
const keysEchoSend   = ctx.createGain(); keysEchoSend.gain.value   = 0;
const seqEchoSend    = ctx.createGain(); seqEchoSend.gain.value    = 0;
const droneEchoSend  = ctx.createGain(); droneEchoSend.gain.value  = 0;
const rhythmEchoSend = ctx.createGain(); rhythmEchoSend.gain.value = 0;
keyboardGain.connect(keysEchoSend);   keysEchoSend.connect(echoBusIn);
seqGain.connect(seqEchoSend);         seqEchoSend.connect(echoBusIn);
droneGain.connect(droneEchoSend);     droneEchoSend.connect(echoBusIn);
rhythmGain.connect(rhythmEchoSend);   rhythmEchoSend.connect(echoBusIn);

// FX param update helpers.
// Wet returns stay fixed; send gains control mix amount.

function updateChorusBus() {
  const rate  = parseFloat(document.getElementById('chorusRate').value);
  const depth = parseFloat(document.getElementById('chorusDepth').value);
  const now   = ctx.currentTime;
  // rate / depth のみ更新 (mix は per-channel send で制御)
  chorusBusLFOL.frequency.setTargetAtTime(rate, now, 0.05);
  chorusBusLFOR.frequency.setTargetAtTime(rate * 1.01, now, 0.05);
  chorusBusModL.gain.setTargetAtTime(depth, now, 0.02);
  chorusBusModR.gain.setTargetAtTime(depth, now, 0.02);
  // wetG は常時1.0 (sendゲインでmix量を決める)
  chorusWetG.gain.setTargetAtTime(1.0, now, 0.02);
  chorusDryG.gain.setTargetAtTime(1.0, now, 0.02);
}

function updateEchoBus() {
  const time = parseFloat(document.getElementById('delayTime').value);
  const fb   = parseFloat(document.getElementById('delayFeedback').value);
  const bass = parseFloat(document.getElementById('delayBass').value);
  const treb = parseFloat(document.getElementById('delayTreble').value);
  const wow  = parseFloat(document.getElementById('delayWow').value);
  const now  = ctx.currentTime;
  // time / fb / EQ / wow のみ更新 (mix は per-channel send で制御)
  echoBusDelay.delayTime.setTargetAtTime(Math.max(0.02, time), now, 0.05);
  echoBusFB.gain.setTargetAtTime(Math.min(0.88, fb), now, 0.02);
  echoBusBassEQ.gain.setTargetAtTime(bass, now, 0.02);
  echoBusTrebEQ.gain.setTargetAtTime(treb, now, 0.02);
  echoBusWowG.gain.setTargetAtTime(wow * 0.012, now, 0.02);
  echoBusFlutG.gain.setTargetAtTime(wow * 0.003, now, 0.02);
  // wetG は常時1.0
  echoBusWetG.gain.setTargetAtTime(1.0, now, 0.02);
  echoBusDryG.gain.setTargetAtTime(1.0, now, 0.02);
}

// チャンネル別Chorus sendゲイン更新
function updateChorusSends() {
  const now = ctx.currentTime;
  const keys   = parseFloat(document.getElementById('keysChorusSend').value);
  const seq    = parseFloat(document.getElementById('seqChorusSend').value);
  const drone  = parseFloat(document.getElementById('droneChorusSend').value);
  const rhythm = parseFloat(document.getElementById('rhythmChorusSend').value);
  keysChorusSend.gain.setTargetAtTime(keys,   now, 0.02);
  seqChorusSend.gain.setTargetAtTime(seq,     now, 0.02);
  droneChorusSend.gain.setTargetAtTime(drone, now, 0.02);
  rhythmChorusSend.gain.setTargetAtTime(rhythm, now, 0.02);
}

// チャンネル別Echo sendゲイン更新
function updateEchoSends() {
  const now = ctx.currentTime;
  const keys   = parseFloat(document.getElementById('keysEchoSend').value);
  const seq    = parseFloat(document.getElementById('seqEchoSend').value);
  const drone  = parseFloat(document.getElementById('droneEchoSend').value);
  const rhythm = parseFloat(document.getElementById('rhythmEchoSend').value);
  keysEchoSend.gain.setTargetAtTime(keys,   now, 0.02);
  seqEchoSend.gain.setTargetAtTime(seq,     now, 0.02);
  droneEchoSend.gain.setTargetAtTime(drone, now, 0.02);
  rhythmEchoSend.gain.setTargetAtTime(rhythm, now, 0.02);
}

let sharedFxLfosStarted = false;
function startSharedFxLfos() {
  if(sharedFxLfosStarted) return;
  try {
    chorusBusLFOL.start();
    chorusBusLFOR.start();
    echoBusWowLFO.start();
    echoBusFlutLFO.start();
    sharedFxLfosStarted = true;
  } catch(_) {}
}

// ── AudioWorklet (per-voice BitCrusher — lightweight) ──
let workletReady = false;

const crusherCode = `
class BitCrusherProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const p = options.processorOptions || {};
    this._step = Math.pow(0.5, p.bitDepth || 16);
    this._reduction = p.reduction || 1.0;
    this._phase = 0;
    this._lastSample = 0;
  }
  process(inputs, outputs) {
    const input = inputs[0][0];
    const output = outputs[0][0];
    if(!input) return true;
    const step = this._step;
    const reduction = this._reduction;
    for(let i = 0; i < input.length; i++) {
      this._phase += reduction;
      if(this._phase >= 1.0) {
        this._phase -= 1.0;
        this._lastSample = step * Math.floor(input[i] / step + 0.5);
      }
      output[i] = this._lastSample;
    }
    return true;
  }
}
registerProcessor('bit-crusher', BitCrusherProcessor);

class StereoLoFiProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._step = 1.0;
    this._reduce = 1.0;
    this._phaseL = 0;
    this._phaseR = 0;
    this._lastL = 0;
    this._lastR = 0;
    this.port.onmessage = event => {
      const data = event.data || {};
      if(data.type === 'params') {
        if(typeof data.step === 'number') this._step = data.step;
        if(typeof data.reduce === 'number') this._reduce = data.reduce;
      }
    };
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    const inL = input[0] || input[1] || new Float32Array(output[0].length);
    const inR = input[1] || input[0] || inL;
    const outL = output[0];
    const outR = output[1] || output[0];
    const step = this._step;
    const reduce = this._reduce;

    for(let i = 0; i < outL.length; i++) {
      this._phaseL += reduce;
      this._phaseR += reduce;
      if(this._phaseL >= 1.0) {
        this._phaseL -= 1.0;
        this._lastL = step < 1.0 ? step * Math.floor(inL[i] / step + 0.5) : inL[i];
      }
      if(this._phaseR >= 1.0) {
        this._phaseR -= 1.0;
        this._lastR = step < 1.0 ? step * Math.floor(inR[i] / step + 0.5) : inR[i];
      }
      outL[i] = this._lastL;
      outR[i] = this._lastR;
    }
    return true;
  }
}
registerProcessor('stereo-lofi', StereoLoFiProcessor);
`;

const crusherURL  = 'data:application/javascript;base64,' + btoa(crusherCode);
ctx.audioWorklet.addModule(crusherURL).then(() => {
  workletReady = true;
  try {
    masterLoFiWorkletNode = new AudioWorkletNode(ctx, 'stereo-lofi', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
    _bindMasterLoFiNode(masterLoFiWorkletNode);
    updateMasterLoFi();
  } catch(_) {
    masterLoFiWorkletNode = null;
  }
}).catch(() => {
  workletReady = false;
  try {
    masterLoFiNode = _createMasterLoFiFallbackNode();
    _bindMasterLoFiNode(masterLoFiNode);
  } catch(_) {
    masterLoFiNode = null;
  }
});

window.addEventListener('click', async () => {
  if(ctx.state !== 'running') await ctx.resume();
  startSharedFxLfos();
}, { once: true });

const MAX_VOICES = 6;

