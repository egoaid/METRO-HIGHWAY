// ── テンポ連動LED点滅 ──
// ════════════════════════════════════════════════
(function() {
  const dots = document.querySelectorAll('.header-dots .dot');
  if(!dots.length) return;

  // ドット色定義 (旧LED風)
  const LED_ON  = ['#ff2a18', '#ff9010', '#f0e000'];  // 赤 / 橙 / 黄
  const LED_GLW = [
    'rgba(255,42,24,0.75)',
    'rgba(255,144,16,0.65)',
    'rgba(240,224,0,0.6)'
  ];
  const LED_OFF = ['#2a0a06', '#2a1a06', '#1e1a04'];

  // 初期: 消灯状態
  dots.forEach((d, i) => {
    d.style.background = LED_OFF[i];
    d.style.boxShadow = 'none';
    d.style.transition = 'background 0.04s, box-shadow 0.04s';
  });

  let beatCount = 0;
  let blinkTimer = null;

  function flashDot(idx) {
    const d = dots[idx];
    // 点灯: ハードな立ち上がり
    d.style.background = LED_ON[idx];
    d.style.boxShadow = [
      `0 0 2px 1px ${LED_ON[idx]}`,
      `0 0 6px 2px ${LED_GLW[idx]}`,
      `0 0 12px 3px ${LED_GLW[idx].replace(/[\d.]+\)$/, '0.3)')}`
    ].join(', ');
    // 減衰: 旧LEDは立ち上がり急・減衰なだらか
    setTimeout(() => {
      d.style.background = LED_OFF[idx];
      d.style.boxShadow = 'none';
    }, 80);
  }

  function tick() {
    // 拍ごとに3つのドットを順番に光らせる (red→orange→yellow→red→...)
    const idx = beatCount % 3;
    flashDot(idx);
    beatCount++;

    const bpm = parseFloat(document.getElementById('rhythmBpm').value) || 120;
    const interval = (60 / bpm) * 1000;
    blinkTimer = setTimeout(tick, interval);
  }

  // リズムSTARTと連動
  const origStart = rhythmStart;
  const origStop  = rhythmStop;
  window.rhythmStart = function() {
    origStart();
    beatCount = 0;
    clearTimeout(blinkTimer);
    tick();
  };
  window.rhythmStop = function() {
    origStop();
    clearTimeout(blinkTimer);
    // 消灯
    dots.forEach((d, i) => {
      d.style.background = LED_OFF[i];
      d.style.boxShadow = 'none';
    });
    // スタンバイ点滅を再開
    clearTimeout(standbyTimer);
    standbyBlink();
  };

  // window.rhythmStart/Stop は最初のSTARTボタンリスナーから参照される

  // リズム未再生でも常時点滅（スタンバイ）: 遅め・赤1つのみ
  let standbyTimer = null;
  function standbyBlink() {
    clearTimeout(standbyTimer); // 二重登録防止
    if(rhythmPlaying) return;   // 再生中は止まる
    flashDot(0);
    standbyTimer = setTimeout(standbyBlink, 1000);
  }
  standbyBlink();

  // BPM変更時にスタンバイ点滅周期は固定(1秒)のままでよい
})();


// ════════════════════════════════════════════════
