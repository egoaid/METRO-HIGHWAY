// ── WAV 録音機能 ──
// ════════════════════════════════════════════════
(function() {
  const recBtn  = document.getElementById('recBtn');
  const recTime = document.getElementById('recTime');
  if(!recBtn) return;

  // PCM バッファ収集用
  let isRecording  = false;
  let recStartTime = 0;
  let recTimerID   = null;
  let pcmChunksL   = [];
  let pcmChunksR   = [];
  let scriptProc   = null;
  let silentGain   = null;

  // WAVヘッダー生成（16-bit PCM, mono/stereo）
  function encodeWAV(samples, sampleRate, numChannels) {
    const bitsPerSample = 16;
    const byteRate      = sampleRate * numChannels * bitsPerSample / 8;
    const blockAlign    = numChannels * bitsPerSample / 8;
    const dataLen       = samples.length * 2; // 16-bit = 2 bytes/sample
    const buf           = new ArrayBuffer(44 + dataLen);
    const view          = new DataView(buf);

    function writeStr(off, str) {
      for(let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i));
    }
    writeStr(0,  'RIFF');
    view.setUint32(4,  36 + dataLen,       true);
    writeStr(8,  'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16,                 true); // PCM chunk size
    view.setUint16(20, 1,                  true); // PCM format
    view.setUint16(22, numChannels,        true);
    view.setUint32(24, sampleRate,         true);
    view.setUint32(28, byteRate,           true);
    view.setUint16(32, blockAlign,         true);
    view.setUint16(34, bitsPerSample,      true);
    writeStr(36, 'data');
    view.setUint32(40, dataLen,            true);

    // float32 → int16 変換
    let offset = 44;
    for(let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      offset += 2;
    }
    return buf;
  }

  // モバイル用ボタン・タイマー要素（存在しない場合はnull）
  const recBtnMobile  = document.getElementById('recBtnMobile');
  const recTimeMobile = document.getElementById('recTimeMobile');

  // 両方のUIを同時更新するヘルパー
  function setRecUI(recording) {
    [recBtn, recBtnMobile].forEach(btn => {
      if(!btn) return;
      btn.classList.toggle('recording', recording);
    });
    [recTime, recTimeMobile].forEach(el => {
      if(!el) return;
      el.classList.toggle('recording', recording);
      if(!recording) el.textContent = '00:00';
    });
  }

  // 録音タイマー表示更新
  function updateTimer() {
    const elapsed = Math.floor((Date.now() - recStartTime) / 1000);
    const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const ss = String(elapsed % 60).padStart(2, '0');
    const text = `${mm}:${ss}`;
    if(recTime)       recTime.textContent = text;
    if(recTimeMobile) recTimeMobile.textContent = text;
  }

  function startRecording() {
    if(ctx.state !== 'running') ctx.resume();

    pcmChunksL   = [];
    pcmChunksR   = [];
    isRecording  = true;
    recStartTime = Date.now();

    scriptProc = ctx.createScriptProcessor(4096, 2, 2);
    scriptProc.onaudioprocess = e => {
      if(!isRecording) return;
      const L = e.inputBuffer.getChannelData(0);
      const R = e.inputBuffer.numberOfChannels > 1
        ? e.inputBuffer.getChannelData(1)
        : e.inputBuffer.getChannelData(0);
      pcmChunksL.push(new Float32Array(L));
      pcmChunksR.push(new Float32Array(R));
    };

    silentGain = ctx.createGain();
    silentGain.gain.value = 0;
    silentGain.connect(ctx.destination);
    recAnalyser.connect(scriptProc);
    scriptProc.connect(silentGain);

    setRecUI(true);
    recTimerID = setInterval(updateTimer, 500);
    updateTimer();
  }

  function stopRecording() {
    isRecording = false;
    clearInterval(recTimerID);

    try { recAnalyser.disconnect(scriptProc); } catch(_) {}
    try { scriptProc.disconnect(); } catch(_) {}
    try { silentGain.disconnect(); } catch(_) {}
    scriptProc = null;
    silentGain = null;

    setRecUI(false);

    if(pcmChunksL.length === 0) return;

    const totalLen = pcmChunksL.reduce((s, c) => s + c.length, 0);
    const mergedL  = new Float32Array(totalLen);
    const mergedR  = new Float32Array(totalLen);
    let offset = 0;
    for(let i = 0; i < pcmChunksL.length; i++) {
      mergedL.set(pcmChunksL[i], offset);
      mergedR.set(pcmChunksR[i], offset);
      offset += pcmChunksL[i].length;
    }

    const interleaved = new Float32Array(totalLen * 2);
    for(let i = 0; i < totalLen; i++) {
      interleaved[i * 2]     = mergedL[i];
      interleaved[i * 2 + 1] = mergedR[i];
    }

    const wavBuf = encodeWAV(interleaved, ctx.sampleRate, 2);
    const blob   = new Blob([wavBuf], { type: 'audio/wav' });
    const url    = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const now    = new Date();
    const stamp  = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}${String(now.getSeconds()).padStart(2,'0')}`;
    anchor.href     = url;
    anchor.download = `METROHWY_${stamp}.wav`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);

    pcmChunksL = [];
    pcmChunksR = [];
  }

  function toggleRecording() {
    if(isRecording) stopRecording();
    else            startRecording();
  }

  recBtn.addEventListener('click', async () => { await ctx.resume(); toggleRecording(); });
  if(recBtnMobile) recBtnMobile.addEventListener('click', async () => { await ctx.resume(); toggleRecording(); });
})();

