// ════════════════════════════════════════════════
// ── SEQ-B: Slow Drone Sequencer ──
// ════════════════════════════════════════════════

const SLOW_SEQ_STEPS = 16;
let slowSeqOctave    = 3;
let slowSeqMuted     = false;
let masterStepCount  = 0; // リズム全体のステップカウンタ（リセットなし）

// slowSeqData: 各ステップ { on:bool, notes:[midi,...], rest:bool }
let slowSeqData = Array.from({length: SLOW_SEQ_STEPS}, () => ({
  rest: true,
  notes: [],  // MIDI番号の配列（2〜3音）
}));

// 現在発音中のドローンボイスID
let slowSeqActiveVoices = []; // string[]
let slowSeqCurrentStep  = -1;

// ── スロードローン全停止 ──
function slowSeqAllNotesOff() {
  // Snapshot before clearing — prevents mutation during iteration.
  // Guard activeVoices.has() so we don't call noteOff on already-evicted
  // voices (MAX_VOICES eviction removes from activeVoices but not this array).
  const ids = slowSeqActiveVoices.slice();
  slowSeqActiveVoices = [];
  for (const id of ids) {
    if (activeVoices.has(id)) noteOff(id);
    // If not in activeVoices: already evicted by MAX_VOICES policy — skip.
  }
}

// ── SEQ-B UI構築 ──
function buildSlowSeqUI() {
  const grid = document.getElementById('slowSeqNoteRow');
  if(!grid) return;
  grid.innerHTML = '';

  for(let i = 0; i < SLOW_SEQ_STEPS; i++) {
    const cell = document.createElement('div');
    cell.className = 'seq-note-cell';

    // LED
    const led = document.createElement('div');
    led.className = 'seq-step-led';
    led.dataset.slowStep = i;

    // ステップボタン（クリックでrest↔on切替）
    const btn = document.createElement('button');
    btn.className = 'seq-step-btn';
    btn.dataset.slowStep = i;
    btn.textContent = (i + 1).toString().padStart(2, '0');
    _updateSlowSeqBtn(btn, slowSeqData[i]);
    btn.addEventListener('click', () => {
      slowSeqData[i].rest = !slowSeqData[i].rest;
      if(!slowSeqData[i].rest && slowSeqData[i].notes.length === 0) {
        // ONにする時にノートがなければランダム生成
        slowSeqData[i].notes = _genChordNotes(slowSeqOctave);
      }
      _updateSlowSeqBtn(btn, slowSeqData[i]);
      _updateSlowSeqCellLabel(cell, slowSeqData[i]);
    });

    // コードラベル表示
    const label = document.createElement('div');
    label.style.cssText = 'font-size:8px;color:var(--txt-2);text-align:center;letter-spacing:0.5px;min-height:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    label.dataset.slowLabel = i;
    _updateSlowSeqCellLabel2(label, slowSeqData[i]);

    cell.appendChild(led);
    cell.appendChild(btn);
    cell.appendChild(label);
    grid.appendChild(cell);
  }
}

function _updateSlowSeqBtn(btn, step) {
  btn.className = 'seq-step-btn';
  if(!step.rest) {
    btn.classList.add('on');
  }
}

function _updateSlowSeqCellLabel(cell, step) {
  const label = cell.querySelector('[data-slow-label]');
  if(label) _updateSlowSeqCellLabel2(label, step);
}

function _updateSlowSeqCellLabel2(label, step) {
  if(step.rest || step.notes.length === 0) {
    label.textContent = '—';
    label.style.color = 'var(--txt-2)';
  } else {
    const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    label.textContent = step.notes.map(m => NOTE_NAMES[m % 12]).join('+');
    label.style.color = 'var(--lcd-txt)';
  }
}

// ── ランダムコード生成ヘルパー ──
function _genChordNotes(oct) {
  const scaleName = document.getElementById('seqScale').value;
  const intervals = SCALES[scaleName] || SCALES.major;
  const root = (oct + 1) * 12;
  // 2音をスケールからランダムに選択（重複なし）
  const size = 2;
  const shuffled = [...intervals].sort(() => Math.random() - 0.5);
  const chosen = shuffled.slice(0, Math.min(size, shuffled.length));
  // オクターブまたぎを自然にする
  return chosen.map(interval => {
    const octShift = interval > 6 ? 0 : (Math.random() < 0.3 ? 1 : 0);
    return root + interval + octShift * 12;
  }).sort((a, b) => a - b);
}

// ── SEQ-B ランダム生成 ──
function slowSeqRandomize() {
  slowSeqAllNotesOff();
  const restProb = 0.35; // 35%はrest
  for(let i = 0; i < SLOW_SEQ_STEPS; i++) {
    if(Math.random() < restProb) {
      slowSeqData[i] = { rest: true, notes: [] };
    } else {
      slowSeqData[i] = { rest: false, notes: _genChordNotes(slowSeqOctave) };
    }
  }
  // 最低でも5ステップはON
  let onCount = slowSeqData.filter(s => !s.rest).length;
  while(onCount < 5) {
    const idx = Math.floor(Math.random() * SLOW_SEQ_STEPS);
    if(slowSeqData[idx].rest) {
      slowSeqData[idx] = { rest: false, notes: _genChordNotes(slowSeqOctave) };
      onCount++;
    }
  }
  _refreshSlowSeqUI();
}

function _refreshSlowSeqUI() {
  for(let i = 0; i < SLOW_SEQ_STEPS; i++) {
    const btn = document.querySelector(`button[data-slow-step="${i}"]`);
    if(btn) _updateSlowSeqBtn(btn, slowSeqData[i]);
    const label = document.querySelector(`[data-slow-label="${i}"]`);
    if(label) _updateSlowSeqCellLabel2(label, slowSeqData[i]);
  }
}

// ── SEQ-B トリガー（rhythmScheduleから呼ばれる）──
function slowSeqTrigger(slowStep) {
  if(slowSeqMuted) return;
  const epoch = transportEpoch;
  if(slowStep === slowSeqCurrentStep) return;

  slowSeqAllNotesOff();
  slowSeqCurrentStep = slowStep;

  const step = slowSeqData[slowStep];
  if(!step || step.rest || step.notes.length === 0) return;

  // コード和音は複数ボイスが同時発音するため1ボイスあたりのゲインを抑える
  const chordSize = step.notes.length;
  const chordComp = chordSize === 3 ? 0.55 : 0.65; // 3音なら55%、2音なら65%
  const perVoiceVol = parseFloat(document.getElementById('slowSeqVol').value) * 0.8 * chordComp;
  const bpm = parseFloat(document.getElementById('rhythmBpm').value);
  const stepDur = (60 / bpm / 4) * 16;

  // 音色設定を解決
  const toneVal = document.getElementById('slowSeqTone').value;
  let settings = null;
  if(toneVal === '__current__') {
    settings = null;
  } else if(toneVal.startsWith('user__')) {
    settings = getUserPresetSettings(toneVal.slice(6));
  } else if(presets[toneVal]) {
    settings = { ...presets[toneVal] };
  }
  const finalSettings = settings ? { ...settings } : null;

  step.notes.forEach((midi, idx) => {
    const freq = midiToFreq(midi);
    const voiceId = `slowseq_${slowStep}_${idx}_${Date.now()}`;

    // ── Humanize: velocity variation per chord voice (SEQ-B) ──
    // Timing humanize is NOT applied here — SEQ-B steps are
    // very long (16× rhythm steps) so ms-level jitter is inaudible
    // and would only risk noteOff/noteOn ordering issues.
    // Velocity variation adds subtle chord balance movement.
    const slowEvent = applyHumanize({
      time:     ctx.currentTime, // not used for scheduling here
      velocity: perVoiceVol,
      freq:     freq,
      duration: stepDur * 0.95,
      source:   'seqB',
      track:    null,
      step:     slowStep,
    });

    slowSeqActiveVoices.push(voiceId);
    noteOn(slowEvent.freq, voiceId, finalSettings, slowEvent.velocity, droneGain);

    setTimeout(() => {
      if(epoch !== transportEpoch) return;
      const idx = slowSeqActiveVoices.indexOf(voiceId);
      if (idx !== -1) {
        slowSeqActiveVoices.splice(idx, 1);
        if (activeVoices.has(voiceId)) noteOff(voiceId);
      }
    }, stepDur * 1000 * 0.95);
  });
}

// ── LED更新 ──
function updateSlowSeqLEDs(slowStep) {
  document.querySelectorAll('.seq-step-led[data-slow-step]').forEach((el, i) => {
    el.classList.remove('active', 'beat');
    if(i === slowStep) el.classList.add(slowStep % 4 === 0 ? 'beat' : 'active');
  });
  document.querySelectorAll('button[data-slow-step]').forEach((btn, i) => {
    btn.classList.remove('playing');
    if(i === slowStep && !slowSeqData[i].rest) btn.classList.add('playing');
  });
}

// ── イベントリスナー ──
document.getElementById('slowSeqRandomBtn').addEventListener('click', slowSeqRandomize);

document.getElementById('slowSeqClearBtn').addEventListener('click', () => {
  slowSeqAllNotesOff();
  slowSeqData = Array.from({length: SLOW_SEQ_STEPS}, () => ({ rest: true, notes: [] }));
  _refreshSlowSeqUI();
});

document.getElementById('slowSeqMuteBtn').addEventListener('click', () => {
  slowSeqMuted = !slowSeqMuted;
  const btn = document.getElementById('slowSeqMuteBtn');
  btn.classList.toggle('muted', slowSeqMuted);
  btn.textContent = slowSeqMuted ? 'MUTED' : 'MUTE';
  if(slowSeqMuted) slowSeqAllNotesOff();
});

document.getElementById('slowSeqOctDn').addEventListener('click', () => {
  if(slowSeqOctave > 1) {
    slowSeqOctave--;
    document.getElementById('slowSeqOctDisplay').textContent = `OCT: ${slowSeqOctave}`;
  }
});
document.getElementById('slowSeqOctUp').addEventListener('click', () => {
  if(slowSeqOctave < 6) {
    slowSeqOctave++;
    document.getElementById('slowSeqOctDisplay').textContent = `OCT: ${slowSeqOctave}`;
  }
});

// slowSeqVol listener removed — controlled via Mixer

// seqScaleが変わったらSEQ-Bのスケール表示も更新
function _updateSlowSeqScaleDisplay() {
  const sel = document.getElementById('seqScale');
  const label = document.getElementById('slowSeqScaleDisplay');
  if(!label || !sel) return;
  const text = sel.options[sel.selectedIndex].text;
  // 日本語カッコ以降を除去
  label.textContent = text.replace(/[（(].*/, '').trim();
}
document.getElementById('seqScale').addEventListener('change', _updateSlowSeqScaleDisplay);
// 初期表示
_updateSlowSeqScaleDisplay();

buildSlowSeqUI();

