// ════════════════════════════════════════════════
// ── VFD オシロスコープ（実信号版）──
// ════════════════════════════════════════════════
(function() {
  const canvas = document.getElementById('scopeCanvas');
  if(!canvas) return;
  const scopeEl = document.getElementById('vfdScope');

  // masterAnalyser（スクリプト冒頭で定義済み）から実波形を取得
  const bufLen = masterAnalyser.fftSize;
  // NOTE: getFloatTimeDomainData() requires a real Float32Array — passing a
  // plain Array (as this used to) throws a TypeError on every animation
  // frame, silently killing the waveform draw while the scanline/reflection
  // CSS overlays kept rendering, which is why the scope looked "empty".
  const timeData = new Float32Array(bufLen);

  // Canvas サイズ設定
  function resizeCanvas() {
    const rect = scopeEl.getBoundingClientRect();
    if(rect.width === 0) return;
    canvas.width  = Math.round(rect.width  * window.devicePixelRatio);
    canvas.height = Math.round(rect.height * window.devicePixelRatio);
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  const C = canvas.getContext('2d');

  // トリガー: ゼロクロス点を探して波形を安定表示
  function findTrigger(data, len) {
    const start = Math.floor(len * 0.1);
    const end   = Math.floor(len * 0.5);
    for(let i = start; i < end - 1; i++) {
      if(data[i] <= 0 && data[i + 1] > 0) return i;
    }
    return 0;
  }

  let _scopeLastTime = 0;
  function drawScope(timestamp) {
    requestAnimationFrame(drawScope);
    if(timestamp - _scopeLastTime < 33) return; // ~30fps throttle
    _scopeLastTime = timestamp;

    const w = canvas.width;
    const h = canvas.height;
    const dpr = window.devicePixelRatio || 1;

    if(w === 0 || h === 0) return;

    masterAnalyser.getFloatTimeDomainData(timeData);

    C.clearRect(0, 0, w, h);

    // 薄いグリッド（中央線・垂直中心線）
    C.strokeStyle = 'rgba(93,240,200,0.07)';
    C.lineWidth = 0.5 * dpr;
    C.beginPath();
    C.moveTo(0, h * 0.5);   C.lineTo(w, h * 0.5);
    C.moveTo(w * 0.5, 0);   C.lineTo(w * 0.5, h);
    C.stroke();

    // 描画するサンプル数（1〜2周期分表示）
    const drawLen = Math.min(Math.floor(bufLen * 0.5), bufLen);
    const trigOffset = findTrigger(timeData, drawLen);

    // 信号レベル確認（無音判定）
    let maxAbs = 0;
    for(let i = 0; i < drawLen; i++) {
      const v = Math.abs(timeData[trigOffset + i] || 0);
      if(v > maxAbs) maxAbs = v;
    }
    const isSilent = maxAbs < 0.001;

    if(isSilent) {
      // 無音: ゼロライン（細く・暗め）
      C.beginPath();
      C.strokeStyle = 'rgba(93,240,200,0.22)';
      C.lineWidth = 0.8 * dpr;
      C.moveTo(0, h * 0.5);
      C.lineTo(w, h * 0.5);
      C.stroke();
      return;
    }

    // 3パスグロー描画（VFD蛍光体の多重発光）
    const passes = [
      { color: 'rgba(93,240,200,0.07)', width: 6 * dpr },
      { color: 'rgba(93,240,200,0.30)', width: 2.0 * dpr },
      { color: 'rgba(93,240,200,1.0)',  width: 0.85 * dpr },
    ];

    for(const pass of passes) {
      C.beginPath();
      C.strokeStyle = pass.color;
      C.lineWidth   = pass.width;
      C.lineJoin    = 'round';
      C.lineCap     = 'round';

      for(let i = 0; i < drawLen; i++) {
        const sample = timeData[trigOffset + i] || 0;
        const x = (i / (drawLen - 1)) * w;
        const y = h * 0.5 - sample * h * 0.44;

        if(i === 0) C.moveTo(x, y);
        else        C.lineTo(x, y);
      }
      C.stroke();
    }
  }

  requestAnimationFrame(drawScope);
})();

// ════════════════════════════════════════════════
