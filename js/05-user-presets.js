// ════════════════════════════════════════════════
// ── ユーザープリセット ──
// ════════════════════════════════════════════════

const USER_PRESET_KEY = 'metrohwy_user_presets';

function loadUserPresetsFromStorage() {
  try { return JSON.parse(localStorage.getItem(USER_PRESET_KEY)) || {}; }
  catch(_) { return {}; }
}

function saveUserPresetsToStorage(data) {
  try { localStorage.setItem(USER_PRESET_KEY, JSON.stringify(data)); } catch(_) {}
}

// 現在のUIパラメーターを全部スナップショットする
function captureCurrentSettings() {
  const s = {};
  const ids = ['waveform','brightness','resonance','attack','decay','sustain','release',
    'lfoRate','lfoDepth','bitDepth','sampleRate','jitter','drift','speaker','battery','noise',
    'chorusRate','chorusDepth','chorusMix','delayMode','delayTime','delayFeedback','delayMix',
    'delayBass','delayTreble','delayWow'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if(el) s[id] = el.value;
  });
  return s;
}

function rebuildUserPresetUI() {
  const data = loadUserPresetsFromStorage();
  const names = Object.keys(data);

  const mainGroup     = document.getElementById('userPresetGroup');
  const seqGroup      = document.getElementById('seqUserGroup');
  const slowSeqGroup  = document.getElementById('slowSeqUserGroup');

  mainGroup.innerHTML = '';
  seqGroup.innerHTML  = '';
  if(slowSeqGroup) slowSeqGroup.innerHTML = '';

  names.forEach(name => {
    [mainGroup, seqGroup, slowSeqGroup].forEach(group => {
      if(!group) return;
      const opt = document.createElement('option');
      opt.value = 'user__' + name;
      opt.textContent = name.toUpperCase();
      group.appendChild(opt);
    });
  });
}

function getUserPresetSettings(name) {
  const data = loadUserPresetsFromStorage();
  return data[name] || null;
}

document.getElementById('userPresetSaveBtn').addEventListener('click', () => {
  const raw = document.getElementById('userPresetName').value.trim();
  if(!raw) { alert('プリセット名を入力してください'); return; }
  const name = raw.toUpperCase().replace(/[^A-Z0-9 _\-]/g, '').slice(0, 16);
  if(!name) return;
  const data = loadUserPresetsFromStorage();
  data[name] = captureCurrentSettings();
  saveUserPresetsToStorage(data);
  rebuildUserPresetUI();
  // セレクトをそのプリセットに切り替え
  document.getElementById('preset').value = 'user__' + name;
  document.getElementById('lcdDisplay').textContent = name.slice(0,8).padEnd(8,'_');
});

document.getElementById('userPresetDeleteBtn').addEventListener('click', () => {
  const val = document.getElementById('preset').value;
  if(!val.startsWith('user__')) { alert('USERプリセットを選択してください'); return; }
  const name = val.slice(6);
  if(!confirm(`"${name}" を削除しますか？`)) return;
  const data = loadUserPresetsFromStorage();
  delete data[name];
  saveUserPresetsToStorage(data);
  rebuildUserPresetUI();
  document.getElementById('preset').value = 'init';
});

// preset change ハンドラにUSER対応を追加
document.getElementById('preset').addEventListener('change', e => {
  const val = e.target.value;
  if(val.startsWith('user__')) {
    const name = val.slice(6);
    const s = getUserPresetSettings(name);
    if(s) {
      applySettings(s);
      document.getElementById('lcdDisplay').textContent = name.slice(0,8).padEnd(8,'_');
    }
  } else if(presets[val]) {
    applySettings(presets[val]);
    document.getElementById('lcdDisplay').textContent = val.toUpperCase().slice(0,8).padEnd(8,'_');
  }
});

rebuildUserPresetUI();

