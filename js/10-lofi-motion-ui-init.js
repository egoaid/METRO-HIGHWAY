// ════════════════════════════════════════════════
// ── LO-FI MOTION UI LISTENERS ──
// ════════════════════════════════════════════════

function _lofiMotionSpeedLabel(v) {
  const cycleS = Math.round((2 * Math.PI) / (_LOFI_MOTION_BASE_RATE * Math.max(0.02, v)) * 0.25);
  if (cycleS >= 60) return '~' + Math.round(cycleS / 60) + 'min';
  return '~' + cycleS + 's';
}

function _lofiMotionDepthLabel(v) {
  if (v <= 0) return 'OFF';
  if (v <= 0.25) return 'SUBTLE';
  if (v <= 0.55) return 'MED';
  if (v <= 0.80) return 'HEAVY';
  return 'MAX';
}

// MOTION toggle button
document.getElementById('lofiMotionBtn').addEventListener('click', () => {
  lofiMotion.enabled = !lofiMotion.enabled;
  const btn = document.getElementById('lofiMotionBtn');
  if (lofiMotion.enabled) {
    btn.classList.add('btn-grn');
    btn.textContent = 'MOTION ON';
    if (rhythmPlaying) lofiMotionStart();
  } else {
    btn.classList.remove('btn-grn');
    btn.textContent = 'MOTION';
    lofiMotionStop();
  }
});

// Depth slider
document.getElementById('lofiMotionDepth').addEventListener('input', () => {
  lofiMotion.depth = parseFloat(document.getElementById('lofiMotionDepth').value);
  document.getElementById('lofiMotionDepthVal').textContent = _lofiMotionDepthLabel(lofiMotion.depth);
  // Auto-start motion timer if enabled and playing
  if (lofiMotion.enabled && rhythmPlaying && !_lofiMotionTimer) lofiMotionStart();
  if (!lofiMotion.enabled && lofiMotion.depth > 0) {
    // Depth set but button not ON — auto-enable
    lofiMotion.enabled = true;
    const btn = document.getElementById('lofiMotionBtn');
    btn.classList.add('btn-grn');
    btn.textContent = 'MOTION ON';
    if (rhythmPlaying) lofiMotionStart();
  }
});

// Speed slider
document.getElementById('lofiMotionSpeed').addEventListener('input', () => {
  lofiMotion.speed = parseFloat(document.getElementById('lofiMotionSpeed').value);
  document.getElementById('lofiMotionSpeedVal').textContent = _lofiMotionSpeedLabel(lofiMotion.speed);
});

// CLR button: also stop motion and reset
const _origLoficlearBtn = document.getElementById('loficlearBtn').onclick;
document.getElementById('loficlearBtn').onclick = () => {
  lofiMotionStop();
  lofiMotion.enabled = false;
  lofiMotion.depth = 0;
  document.getElementById('lofiMotionBtn').classList.remove('btn-grn');
  document.getElementById('lofiMotionBtn').textContent = 'MOTION';
  document.getElementById('lofiMotionDepth').value = 0;
  document.getElementById('lofiMotionDepthVal').textContent = 'OFF';
  applySettings(lofiDefaults);
};

// Init display
document.getElementById('lofiMotionSpeedVal').textContent = _lofiMotionSpeedLabel(lofiMotion.speed);
document.getElementById('lofiMotionDepthVal').textContent = _lofiMotionDepthLabel(lofiMotion.depth);

// MIDI はここでは接続しない（KEYBOARD の MIDI ボタンを押したときだけ接続する。03）
applySettings(defaults);

// ── iOS Safari AudioContext safety (Pass 2) ──
// iOS suspends the AudioContext when the tab is backgrounded. Without explicit
// resume on foreground, audio silently stops — giving the "dying battery" feel.
// The 'interrupted' state is iOS-specific: occurs on phone calls, Siri, etc.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    // Suspend when backgrounded to free audio thread resources on iPhone SE.
    if (ctx.state === 'running') ctx.suspend();
  } else {
    // Resume when foregrounded — required on iOS after suspension.
    if (ctx.state === 'suspended' || ctx.state === 'interrupted') ctx.resume();
  }
});

// Lightweight interrupted-state recovery (iOS phone call / Siri interruption).
// Polls every 3s — low frequency means negligible overhead, catches the edge
// case where visibilitychange alone doesn't fire on all iOS versions.
setInterval(() => {
  if (ctx.state === 'interrupted') ctx.resume();
}, 3000);

