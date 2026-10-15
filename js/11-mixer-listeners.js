// ════════════════════════════════════════════════
// ── MIXER LISTENERS (v1.3) ──
// ════════════════════════════════════════════════
document.getElementById('masterVolSlider').addEventListener('input', () => {
  const v = parseFloat(document.getElementById('masterVolSlider').value);
  masterVolGain.gain.setTargetAtTime(v, ctx.currentTime, 0.01);
  document.getElementById('masterVolVal').textContent = Math.round(v * 100) + '%';
});

document.getElementById('keyboardVolSlider').addEventListener('input', () => {
  const v = parseFloat(document.getElementById('keyboardVolSlider').value);
  keyboardGain.gain.setTargetAtTime(v, ctx.currentTime, 0.01);
  document.getElementById('keyboardVolVal').textContent = Math.round(v * 100) + '%';
});

document.getElementById('seqMixVolSlider').addEventListener('input', () => {
  const v = parseFloat(document.getElementById('seqMixVolSlider').value);
  seqGain.gain.setTargetAtTime(v, ctx.currentTime, 0.01);
  document.getElementById('seqMixVolVal').textContent = Math.round(v * 100) + '%';
});

document.getElementById('droneVolSlider').addEventListener('input', () => {
  const v = parseFloat(document.getElementById('droneVolSlider').value);
  droneGain.gain.setTargetAtTime(v, ctx.currentTime, 0.01);
  document.getElementById('droneVolVal').textContent = Math.round(v * 100) + '%';
});

document.getElementById('rhythmMixVolSlider').addEventListener('input', () => {
  const v = parseFloat(document.getElementById('rhythmMixVolSlider').value);
  rhythmGain.gain.setTargetAtTime(v, ctx.currentTime, 0.01);
  document.getElementById('rhythmMixVolVal').textContent = Math.round(v * 100) + '%';
});

// ── FX BUS UPDATE HOOKS ──
['chorusRate','chorusDepth'].forEach(id => {
  const el = document.getElementById(id);
  if(el) el.addEventListener('input', updateChorusBus);
});

['delayTime','delayFeedback','delayBass','delayTreble','delayWow'].forEach(id => {
  const el = document.getElementById(id);
  if(el) el.addEventListener('input', updateEchoBus);
});

// ── Per-channel Chorus send listeners ──
['keysChorusSend','seqChorusSend','droneChorusSend','rhythmChorusSend'].forEach(id => {
  const el = document.getElementById(id);
  if(!el) return;
  el.addEventListener('input', () => {
    updateChorusSends();
    const valId = id + 'Val';
    const valEl = document.getElementById(valId);
    if(valEl) valEl.textContent = Math.round(parseFloat(el.value) * 100) + '%';
  });
});

// ── Per-channel Echo send listeners ──
['keysEchoSend','seqEchoSend','droneEchoSend','rhythmEchoSend'].forEach(id => {
  const el = document.getElementById(id);
  if(!el) return;
  el.addEventListener('input', () => {
    updateEchoSends();
    const valId = id + 'Val';
    const valEl = document.getElementById(valId);
    if(valEl) valEl.textContent = Math.round(parseFloat(el.value) * 100) + '%';
  });
});

// Lo-Fi master update hooks
['bitDepth','sampleRate'].forEach(id => {
  const el = document.getElementById(id);
  if(el) el.addEventListener('input', updateMasterLoFi);
});


