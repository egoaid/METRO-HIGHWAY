// ── パネル表示制御（タブ廃止 → 縦スクロール） ──
// ════════════════════════════════════════════════
// モバイル・デスクトップ共に全パートを常時表示
function syncPartsVisibility() {
  const isMobile = window.innerWidth <= 768;
  document.querySelectorAll('.part-panel').forEach(p => {
    p.style.display = isMobile ? 'block' : 'flex';
  });
}

syncPartsVisibility();
window.addEventListener('resize', syncPartsVisibility);

// ════════════════════════════════════════════════
