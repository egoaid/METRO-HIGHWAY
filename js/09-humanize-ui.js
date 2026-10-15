// ════════════════════════════════════════════════
// ── HUMANIZE UI LISTENERS ──
// ════════════════════════════════════════════════

// Swing value → display label
function _swingLabel(v) {
  if (v <= 0.50) return 'STR';
  if (v <= 0.54) return 'LITE';
  if (v <= 0.60) return 'SHFL';
  if (v <= 0.64) return 'MED';
  if (v <= 0.69) return 'JAZZ';
  return 'HVY';
}

// Sync all 4 sliders from humanize state
function _humanizeUISync() {
  document.getElementById('humanizeTiming').value   = humanize.timing;
  document.getElementById('humanizeVelocity').value = humanize.velocity;
  document.getElementById('humanizePitch').value    = humanize.pitch;
  document.getElementById('humanizeSwing').value    = humanize.swing;
  document.getElementById('humanizeTimingVal').textContent   = humanize.timing + 'ms';
  document.getElementById('humanizeVelocityVal').textContent = Math.round(humanize.velocity * 100) + '%';
  document.getElementById('humanizePitchVal').textContent    = humanize.pitch + '¢';
  document.getElementById('humanizeSwingVal').textContent    = _swingLabel(humanize.swing);
  // Also sync drift sliders
  _driftUISync();
}

// Drift UI display helpers
function _driftGrooveLabel(v) { return v === 0 ? 'OFF' : '±' + v + 'ms'; }
function _driftPitchLabel(v)  { return v === 0 ? 'OFF' : '±' + v + '¢';  }
function _driftLoopLabel(v)   { return v === 0 ? 'OFF' : '±' + v + 'ms'; }
function _driftVelLabel(v)    { return v === 0 ? 'OFF' : '±' + Math.round(v * 100) + '%'; }
function _driftSpeedLabel(v)  {
  // Show approximate full-cycle duration so the user knows what they're setting.
  // groove base = 0.063 rad/tick at 200ms/tick → cycle = 2π/(0.063×v) × 0.2s
  const cycleS = Math.round((2 * Math.PI) / (0.063 * Math.max(0.02, v)) * 0.2);
  if (cycleS >= 60) return '~' + Math.round(cycleS / 60) + 'min';
  return '~' + cycleS + 's';
}
function _driftUISync() {
  document.getElementById('driftGroove').value      = drift.grooveDrift;
  document.getElementById('driftPitch').value       = drift.pitchDrift;
  document.getElementById('driftLoop').value        = drift.loopDrift;
  document.getElementById('driftVelocity').value    = drift.velocityDrift;
  document.getElementById('driftSpeed').value       = drift.driftSpeed;
  document.getElementById('driftCorrelation').value = drift.correlation;
  document.getElementById('driftGrooveVal').textContent      = _driftGrooveLabel(drift.grooveDrift);
  document.getElementById('driftPitchVal').textContent       = _driftPitchLabel(drift.pitchDrift);
  document.getElementById('driftLoopVal').textContent        = _driftLoopLabel(drift.loopDrift);
  document.getElementById('driftVelocityVal').textContent    = _driftVelLabel(drift.velocityDrift);
  document.getElementById('driftSpeedVal').textContent       = _driftSpeedLabel(drift.driftSpeed);
  document.getElementById('driftCorrelationVal').textContent = drift.correlation >= 0.5 ? 'LINKED' : 'FREE';
}

// Drift slider listeners
document.getElementById('driftGroove').addEventListener('input', () => {
  drift.grooveDrift = parseInt(document.getElementById('driftGroove').value);
  document.getElementById('driftGrooveVal').textContent = _driftGrooveLabel(drift.grooveDrift);
});
document.getElementById('driftPitch').addEventListener('input', () => {
  drift.pitchDrift = parseInt(document.getElementById('driftPitch').value);
  document.getElementById('driftPitchVal').textContent = _driftPitchLabel(drift.pitchDrift);
});
document.getElementById('driftLoop').addEventListener('input', () => {
  drift.loopDrift = parseInt(document.getElementById('driftLoop').value);
  document.getElementById('driftLoopVal').textContent = _driftLoopLabel(drift.loopDrift);
});
document.getElementById('driftVelocity').addEventListener('input', () => {
  drift.velocityDrift = parseFloat(document.getElementById('driftVelocity').value);
  document.getElementById('driftVelocityVal').textContent = _driftVelLabel(drift.velocityDrift);
});
document.getElementById('driftSpeed').addEventListener('input', () => {
  drift.driftSpeed = parseFloat(document.getElementById('driftSpeed').value);
  document.getElementById('driftSpeedVal').textContent = _driftSpeedLabel(drift.driftSpeed);
});
document.getElementById('driftCorrelation').addEventListener('input', () => {
  drift.correlation = parseInt(document.getElementById('driftCorrelation').value);
  document.getElementById('driftCorrelationVal').textContent = drift.correlation >= 0.5 ? 'LINKED' : 'FREE';
});

// Highlight active preset button
function _humanizePresetHighlight(name) {
  document.querySelectorAll('.human-preset-btn').forEach(btn => {
    const isActive = btn.dataset.preset === name;
    btn.classList.toggle('btn-grn', isActive);
    btn.classList.toggle('playing', isActive);
  });
}

// Enable / disable toggle
document.getElementById('humanizeEnableBtn').addEventListener('click', () => {
  humanize.enabled = !humanize.enabled;
  const btn = document.getElementById('humanizeEnableBtn');
  if (humanize.enabled) {
    btn.textContent = 'ON';
    btn.classList.add('btn-grn');
    btn.classList.remove('btn');
    btn.className = 'btn btn-grn' + (btn.classList.contains('playing') ? ' playing' : '');
  } else {
    btn.textContent = 'OFF';
    btn.className = 'btn';
  }
});

// CLR — reset humanize to 'off' + reset all drift
document.getElementById('humanizeClearBtn').addEventListener('click', () => {
  setHumanizePreset('off');
  humanize.enabled = true;
  document.getElementById('humanizeEnableBtn').textContent = 'ON';
  document.getElementById('humanizeEnableBtn').className = 'btn btn-grn';
  // Reset drift state
  drift.grooveDrift   = 0; drift.pitchDrift    = 0;
  drift.loopDrift     = 0; drift.velocityDrift = 0;
  drift.driftSpeed    = 0.3; drift.correlation = 1;
  drift.grooveMs = 0; drift.pitchCents = 0;
  drift.velocityScale = 0; drift.loopMs = 0;
  _humanizeUISync();
  _humanizePresetHighlight('off');
});

// Preset buttons
document.querySelectorAll('.human-preset-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    setHumanizePreset(btn.dataset.preset);
    _humanizeUISync();
    _humanizePresetHighlight(btn.dataset.preset);
  });
});

// Timing slider
document.getElementById('humanizeTiming').addEventListener('input', () => {
  humanize.timing = parseInt(document.getElementById('humanizeTiming').value);
  document.getElementById('humanizeTimingVal').textContent = humanize.timing + 'ms';
  humanize.preset = 'custom';
  _humanizePresetHighlight('');
});

// Velocity slider
document.getElementById('humanizeVelocity').addEventListener('input', () => {
  humanize.velocity = parseFloat(document.getElementById('humanizeVelocity').value);
  document.getElementById('humanizeVelocityVal').textContent = Math.round(humanize.velocity * 100) + '%';
  humanize.preset = 'custom';
  _humanizePresetHighlight('');
});

// Pitch slider
document.getElementById('humanizePitch').addEventListener('input', () => {
  humanize.pitch = parseInt(document.getElementById('humanizePitch').value);
  document.getElementById('humanizePitchVal').textContent = humanize.pitch + '¢';
  humanize.preset = 'custom';
  _humanizePresetHighlight('');
});

// Swing slider
document.getElementById('humanizeSwing').addEventListener('input', () => {
  humanize.swing = parseFloat(document.getElementById('humanizeSwing').value);
  document.getElementById('humanizeSwingVal').textContent = _swingLabel(humanize.swing);
  humanize.preset = 'custom';
  _humanizePresetHighlight('');
});

// Init: apply default state (natural preset) to UI
setHumanizePreset('natural');
_humanizeUISync();
_humanizePresetHighlight('natural');

