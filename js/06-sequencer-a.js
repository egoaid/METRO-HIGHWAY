// ════════════════════════════════════════════════
// ── シーケンサー ──
// ════════════════════════════════════════════════

const SEQ_STEPS = 16;
let seqOctave = 4;
let seqPlaying = false; // rhythmPlayingと共有 → rhythm側のON/OFFで同期

// スケール定義 (半音インターバル)
const SCALES = {
  chromatic:        [0,1,2,3,4,5,6,7,8,9,10,11],
  major:            [0,2,4,5,7,9,11],
  minor:            [0,2,3,5,7,8,10],
  dorian:           [0,2,3,5,7,9,10],
  phrygian:         [0,1,3,5,7,8,10],
  lydian:           [0,2,4,6,7,9,11],
  mixolydian:       [0,2,4,5,7,9,10],
  locrian:          [0,1,3,5,6,8,10],
  melodicMinor:     [0,2,3,5,7,9,11],
  dorianSharp4:     [0,2,3,6,7,9,10],
  phrygianDominant: [0,1,4,5,7,8,10],
  lydianAugmented:  [0,2,4,6,8,9,11],
  lydianDominant:   [0,2,4,6,7,9,10],
  superLocrian:     [0,1,3,4,6,8,10],
  harmonicMinor:    [0,2,3,5,7,8,11],
  harmonicMajor:    [0,2,4,5,7,8,11],
  pentatonic:       [0,2,4,7,9],
  minorPentatonic:  [0,3,5,7,10],
  blues:            [0,3,5,6,7,10],
  wholeTone:        [0,2,4,6,8,10],
  halfWholeDim:     [0,1,3,4,6,7,9,10],
  wholeHalfDim:     [0,2,3,5,6,8,9,11],
  bhairav:          [0,1,4,5,7,8,11],
  hungarianMinor:   [0,2,3,6,7,8,11],
  eightToneSpanish: [0,1,3,4,5,6,8,10],
  pelogSelisir:     [0,1,3,7,8],
  pelogTembung:     [0,1,5,7,8],
};

const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

// seqData: 各ステップ { on: bool, midi: number }
let seqData = Array.from({length: SEQ_STEPS}, (_, i) => ({
  on: false,
  midi: 60 + (i % 8),
  velocity: 0.8,
  gate: 0.85,
  tie: false,
}));

// ノート名からMIDI番号
function noteNameToMidi(name, oct) {
  const idx = NOTE_NAMES.indexOf(name);
  if(idx < 0) return 60;
  return (oct + 1) * 12 + idx;
}

function buildSeqNoteOptions(oct) {
  const notes = [];
  NOTE_NAMES.forEach((n, i) => {
    notes.push({ label: n + oct, midi: (oct + 1) * 12 + i });
  });
  return notes;
}

function buildSeqUI() {
  const grid = document.getElementById('seqNoteRow');
  grid.innerHTML = '';
  for(let i = 0; i < SEQ_STEPS; i++) {
    const cell = document.createElement('div');
    cell.className = 'seq-note-cell';

    // LED
    const led = document.createElement('div');
    led.className = 'seq-step-led';
    led.dataset.seqStep = i;

    // ノートセレクト
    const sel = document.createElement('select');
    sel.className = 'seq-note-select';
    sel.dataset.seqStep = i;
    populateSeqSelect(sel, seqOctave, seqData[i].midi);
    sel.addEventListener('change', () => {
      seqData[i].midi = parseInt(sel.value);
    });

    // ONボタン（クリック: off→on→tie→off の3状態）
    const btn = document.createElement('button');
    btn.dataset.seqStep = i;
    btn.textContent = (i + 1).toString().padStart(2, '0');
    _updateSeqBtn(btn, seqData[i]);
    btn.addEventListener('click', () => {
      if(!seqData[i].on && !seqData[i].tie) {
        seqData[i].on = true; seqData[i].tie = false;
      } else if(seqData[i].on && !seqData[i].tie) {
        seqData[i].on = false; seqData[i].tie = true;
      } else {
        seqData[i].on = false; seqData[i].tie = false;
      }
      _updateSeqBtn(btn, seqData[i]);
    });

    // velocityバー
    const velBar = document.createElement('div');
    velBar.className = 'mini-bar';
    const velFill = document.createElement('div');
    velFill.className = 'mini-bar-fill-vel';
    velFill.style.width = `${seqData[i].velocity*100}%`;
    velBar.appendChild(velFill);
    velBar.title = 'Velocity';
    let velDragging = false;
    velBar.addEventListener('mousedown', e => {
      velDragging = true;
      const setVel = ev => {
        const rect = velBar.getBoundingClientRect();
        const v = Math.max(0.1, Math.min(1.0, (ev.clientX - rect.left) / rect.width));
        seqData[i].velocity = v;
        velFill.style.width = (v * 100) + '%';
      };
      setVel(e);
      const onMove = ev => { if(velDragging) setVel(ev); };
      const onUp = () => { velDragging = false; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });

    // gateバー
    const gateBar = document.createElement('div');
    gateBar.className = 'mini-bar';
    const gateFill = document.createElement('div');
    gateFill.className = 'mini-bar-fill-gate';
    gateFill.style.width = `${Math.min(100, seqData[i].gate*100)}%`;
    gateBar.appendChild(gateFill);
    gateBar.title = 'Gate';
    let gateDragging = false;
    gateBar.addEventListener('mousedown', e => {
      gateDragging = true;
      const setGate = ev => {
        const rect = gateBar.getBoundingClientRect();
        const v = Math.max(0.05, Math.min(1.5, (ev.clientX - rect.left) / rect.width * 1.5));
        seqData[i].gate = v;
        gateFill.style.width = Math.min(100, (v / 1.5) * 100) + '%';
      };
      setGate(e);
      const onMove = ev => { if(gateDragging) setGate(ev); };
      const onUp = () => { gateDragging = false; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });

    cell.appendChild(led);
    cell.appendChild(sel);
    cell.appendChild(btn);
    cell.appendChild(velBar);
    cell.appendChild(gateBar);
    grid.appendChild(cell);
  }
}

// ステップボタンの見た目を状態に合わせて更新
function _updateSeqBtn(btn, step) {
  btn.className = 'seq-step-btn';
  if(step.tie) {
    btn.classList.add('on');
    btn.style.background = '#5a2a8a';
    btn.style.borderColor = '#3a1a6a';
    btn.style.color = '#cc99ff';
    btn.style.boxShadow = '0 0 5px rgba(90,42,138,0.6)';
    btn.title = 'TIE';
  } else if(step.on) {
    btn.classList.add('on');
    btn.style.background = '';
    btn.style.borderColor = '';
    btn.style.color = '';
    btn.style.boxShadow = '';
    btn.title = 'ON';
  } else {
    btn.style.background = '';
    btn.style.borderColor = '';
    btn.style.color = '';
    btn.style.boxShadow = '';
    btn.title = 'OFF';
  }
}

function populateSeqSelect(sel, oct, currentMidi) {
  sel.innerHTML = '';
  const noteOpts = buildSeqNoteOptions(oct);
  noteOpts.forEach(({label, midi}) => {
    const opt = document.createElement('option');
    opt.value = midi;
    opt.textContent = label;
    if(midi === currentMidi) opt.selected = true;
    sel.appendChild(opt);
  });
}

function updateSeqSelects() {
  for(let i = 0; i < SEQ_STEPS; i++) {
    const sel = document.querySelector(`.seq-note-select[data-seq-step="${i}"]`);
    if(sel) populateSeqSelect(sel, seqOctave, seqData[i].midi);
  }
}

// シーケンサーの発音 (リズムスケジューラーから呼ばれる)

// タイ持続中のvoiceIdを管理
const seqTieVoices = new Array(SEQ_STEPS).fill(null);

function seqTrigger(step) {
  if(seqMuted) return;
  const epoch = transportEpoch;
  const bpm = parseFloat(document.getElementById('rhythmBpm').value);
  const stepDur = 60 / bpm / 4;
  const volScale = parseFloat(document.getElementById('seqVol').value);

  const toneVal = document.getElementById('seqTone').value;
  let settings = null;
  if(toneVal === '__current__') {
    settings = null;
  } else if(toneVal.startsWith('user__')) {
    settings = getUserPresetSettings(toneVal.slice(6));
  } else if(presets[toneVal]) {
    settings = { ...presets[toneVal] };
  }

  // タイ処理: 前のステップのvoiceを引き継ぐ（noteOffしない）
  if(seqData[step].tie) {
    const prevStep = (step - 1 + SEQ_STEPS) % SEQ_STEPS;
    const tiedVoice = seqTieVoices[prevStep];
    if(tiedVoice) {
      seqTieVoices[step] = tiedVoice;
      seqTieVoices[prevStep] = null;
      const holdTime = stepDur * 1.0 * 1000;
      setTimeout(() => {
        if(epoch !== transportEpoch) return;
        // seqAllNotesOff等で既にクリアされていたら触らない
        if(seqTieVoices[step] !== tiedVoice) return;
        const nextStep = (step + 1) % SEQ_STEPS;
        if(!seqData[nextStep] || !seqData[nextStep].tie) {
          noteOff(tiedVoice);
          seqTieVoices[step] = null;
        }
      }, holdTime);
    }
    return;
  }

  if(!seqData[step].on) return;

  const freq = midiToFreq(seqData[step].midi);
  const velocity = (seqData[step].velocity ?? 0.8) * volScale;
  const gate     =  seqData[step].gate     ?? 0.85;

  // ── Humanize: timing + velocity via central gateway ──
  const seqEvent = applyHumanize({
    time:     ctx.currentTime,
    velocity: velocity,
    freq:     freq,
    duration: stepDur * Math.min(gate, 1.49),
    source:   'seqA',
    track:    null,
    step:     step,
    stepDur:  stepDur,
  });

  const finalSettings = settings ? { ...settings } : null;
  const voiceId = `seq_${step}_${Date.now()}`;

  // Small timing offset from humanize: schedule via setTimeout offset
  // (noteOn fires immediately, so we delay the whole call by the delta).
  const seqDelay = Math.max(0, seqEvent.time - ctx.currentTime);
  const holdTime = stepDur * Math.min(gate, 1.49) * 1000;
  const nextStep = (step + 1) % SEQ_STEPS;
  seqTieVoices[step] = voiceId;

  setTimeout(() => {
    if(epoch !== transportEpoch) return;
    noteOn(seqEvent.freq, voiceId, finalSettings, seqEvent.velocity, seqGain);
  }, seqDelay * 1000);

  setTimeout(() => {
    if(epoch !== transportEpoch) return;
    if(seqTieVoices[step] !== voiceId) return;
    if(!seqData[nextStep] || !seqData[nextStep].tie) {
      noteOff(voiceId);
      seqTieVoices[step] = null;
    }
  }, seqDelay * 1000 + holdTime);
}


// LEDとパッドのUI更新（シーケンサー側）
function updateSeqLEDs(step) {
  document.querySelectorAll('.seq-step-led').forEach((el, i) => {
    el.classList.remove('active', 'beat');
    if(i === step) el.classList.add(step % 4 === 0 ? 'beat' : 'active');
  });
  document.querySelectorAll('.seq-step-btn').forEach((el, i) => {
    el.classList.remove('playing');
    if(i === step && seqData[i].on) el.classList.add('playing');
  });
}

// ── ランダム生成 ──
function seqRandomize() {
  seqAllNotesOff();
  const scaleName = document.getElementById('seqScale').value;
  const intervals = SCALES[scaleName] || SCALES.major;
  const root = seqOctave * 12 + 12; // Cをルートに

  // ランダムにON/OFFとノートを設定
  // 密度をランダムに（3〜10音）
  const density = 3 + Math.floor(Math.random() * 8);
  const onSteps = new Set();
  while(onSteps.size < Math.min(density, SEQ_STEPS)) {
    onSteps.add(Math.floor(Math.random() * SEQ_STEPS));
  }

  // タイの候補: ONステップの後にtieを自然に続けることがある
  const onStepsArr = [...onSteps].sort((a,b) => a - b);

  for(let i = 0; i < SEQ_STEPS; i++) {
    seqData[i].tie = false;
    seqData[i].on = onSteps.has(i);
    const octShift = Math.floor(Math.random() * 2);
    const interval = intervals[Math.floor(Math.random() * intervals.length)];
    seqData[i].midi = root + interval + octShift * 12;

    // velocity: 強拍(0,4,8,12)は強め、それ以外は自然なばらつき
    const isDownbeat = i % 4 === 0;
    const isBackbeat = i % 4 === 2;
    if(isDownbeat)      seqData[i].velocity = 0.75 + Math.random() * 0.25;
    else if(isBackbeat) seqData[i].velocity = 0.55 + Math.random() * 0.25;
    else                seqData[i].velocity = 0.35 + Math.random() * 0.35;

    // gate: 基本は短め〜普通。たまに長く伸ばす
    const gateDie = Math.random();
    if(gateDie < 0.15)      seqData[i].gate = 0.9 + Math.random() * 0.6;  // 長音
    else if(gateDie < 0.35) seqData[i].gate = 0.25 + Math.random() * 0.2; // スタッカート
    else                    seqData[i].gate = 0.5  + Math.random() * 0.35; // 普通

    const sel = document.querySelector(`.seq-note-select[data-seq-step="${i}"]`);
    if(sel) populateSeqSelect(sel, seqOctave, seqData[i].midi);
    const btn = document.querySelector(`button[data-seq-step="${i}"]`);
    if(btn) _updateSeqBtn(btn, seqData[i]);

    // velocityバー・gateバーも更新
    const cell = document.querySelectorAll('.seq-note-cell')[i];
    if(cell) {
      const bars = cell.querySelectorAll('div[title]');
      bars.forEach(bar => {
        const fill = bar.querySelector('div');
        if(!fill) return;
        if(bar.title === 'Velocity') fill.style.width = (seqData[i].velocity * 100) + '%';
        if(bar.title === 'Gate')     fill.style.width = Math.min(100, (seqData[i].gate / 1.5) * 100) + '%';
      });
    }
  }

  // タイ挿入: ONステップの直後のOFFステップを30%の確率でTIEに変換
  for(let i = 0; i < SEQ_STEPS - 1; i++) {
    if(seqData[i].on && !seqData[i+1].on && Math.random() < 0.30) {
      seqData[i+1].tie = true;
      const btn = document.querySelector(`button[data-seq-step="${i+1}"]`);
      if(btn) _updateSeqBtn(btn, seqData[i+1]);
    }
  }
}

// ── イベント ──
document.getElementById('seqOctDn').addEventListener('click', () => {
  if(seqOctave > 1) { seqOctave--; document.getElementById('seqOctDisplay').textContent = `OCT: ${seqOctave}`; updateSeqSelects(); }
});
document.getElementById('seqOctUp').addEventListener('click', () => {
  if(seqOctave < 7) { seqOctave++; document.getElementById('seqOctDisplay').textContent = `OCT: ${seqOctave}`; updateSeqSelects(); }
});

document.getElementById('seqRandomBtn').addEventListener('click', seqRandomize);

document.getElementById('seqClearBtn').addEventListener('click', () => {
  seqAllNotesOff();
  seqData.forEach((s, i) => {
    s.on = false;
    s.tie = false;
    s.velocity = 0.8;
    s.gate = 0.85;
  });
  document.querySelectorAll('button[data-seq-step]').forEach((btn, i) => {
    _updateSeqBtn(btn, seqData[i]);
  });
  // バー表示リセット
  document.querySelectorAll('.seq-note-cell').forEach((cell, i) => {
    const bars = cell.querySelectorAll('div[title]');
    bars.forEach(bar => {
      const fill = bar.querySelector('div');
      if(!fill) return;
      if(bar.title === 'Velocity') fill.style.width = '80%';
      if(bar.title === 'Gate')     fill.style.width = Math.min(100, (0.85/1.5)*100) + '%';
    });
  });
});

// seqVol / slowSeqVol / rhythmVol — スライダーはMixerに統合済み
// hidden inputの値は固定値として保持 (リスナー不要)

// seqToneのUSERグループ同期はrebuildUserPresetUIで行われる

buildSeqUI();

