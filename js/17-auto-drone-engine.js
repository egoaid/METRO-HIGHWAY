

// ════════════════════════════════════════════════

// ── AUTO DRONE FX SEND RANGE スライダーリスナー ──
document.getElementById('adChorusMax').addEventListener('input', () => {
  const v = parseFloat(document.getElementById('adChorusMax').value);
  document.getElementById('adChorusMaxVal').textContent = Math.round(v * 100) + '%';
});
document.getElementById('adEchoMax').addEventListener('input', () => {
  const v = parseFloat(document.getElementById('adEchoMax').value);
  document.getElementById('adEchoMaxVal').textContent = Math.round(v * 100) + '%';
});

// ════════════════════════════════════════════════
// ── AUTO DRONE ENGINE ──
//
// 全セクションを自動ランダマイズしながら
// 無限（または指定曲数）再生し続けるシステム。
//
// フロー:
//   START → [fadeIn] → [play songDur] → [fadeOut]
//         → [gap silence] → randomize all
//         → [fadeIn] → ... → (repeat or stop)
//
// 音声制御: masterVolGain.gain の ramp のみ使用。
// CPU追加負荷: setTimeout × 1本のみ。
// ════════════════════════════════════════════════
(function() {

  // ── state ──
  const ad = {
    running:    false,
    songIndex:  0,      // 0-based 現在の曲番号
    timer:      null,   // 現在フェーズのsetTimeoutハンドル
    savedVol:   0.8,    // AUTO DRONE開始前のmasterVol値を保存
  };

  // ── UIエレメント ──
  const btn        = document.getElementById('autoDroneBtn');
  const statusBar  = document.getElementById('autoDroneStatus');
  const songCounter= document.getElementById('adSongCounter');
  const phaseLabel = document.getElementById('adPhaseLabel');
  const remainEl   = document.getElementById('adRemain');

  // ── パラメーター取得ヘルパー ──
  function adParams() {
    const durMin   = parseInt(document.getElementById('adDurMin').value);
    const durMax   = parseInt(document.getElementById('adDurMax').value);
    const bpmMin   = Math.max(40,  Math.min(240, parseInt(document.getElementById('adBpmMin').value) || 70));
    const bpmMax   = Math.max(40,  Math.min(240, parseInt(document.getElementById('adBpmMax').value) || 130));
    const songCount= parseInt(document.getElementById('adSongCount').value); // 0=∞
    const fade     = parseInt(document.getElementById('adFade').value);
    const gap      = parseInt(document.getElementById('adGap').value);
    // min > max の場合は swap
    return {
      durMin:    Math.min(durMin, durMax),
      durMax:    Math.max(durMin, durMax),
      bpmMin:    Math.min(bpmMin, bpmMax),
      bpmMax:    Math.max(bpmMin, bpmMax),
      songCount,
      fade,
      gap,
    };
  }

  // ── ステータス表示更新 ──
  function adSetPhase(phase) {
    const labels = { fadein:'FADE IN', play:'PLAYING', fadeout:'FADE OUT', gap:'GAP', done:'DONE' };
    phaseLabel.textContent = labels[phase] || phase;
  }

  // 残り時間カウントダウン（1秒ごとに更新）
  let _remainTimer = null;
  function adStartRemain(totalSec) {
    clearInterval(_remainTimer);
    let left = Math.round(totalSec);
    const update = () => {
      const m = Math.floor(left / 60);
      const s = String(left % 60).padStart(2, '0');
      remainEl.textContent = m > 0 ? `${m}:${s}` : `${left}s`;
    };
    update();
    _remainTimer = setInterval(() => {
      left--;
      if(left <= 0) { clearInterval(_remainTimer); remainEl.textContent = '—'; return; }
      update();
    }, 1000);
  }
  function adStopRemain() {
    clearInterval(_remainTimer);
    remainEl.textContent = '—';
  }

  // ── 全セクションのランダマイズ ──
  function adRandomizeAll() {
    const p = adParams();

    // 1. BPM
    const bpm = Math.round(p.bpmMin + Math.random() * (p.bpmMax - p.bpmMin));
    const bpmEl = document.getElementById('rhythmBpm');
    bpmEl.value = bpm;
    document.getElementById('rhythmBpmValue').textContent = `${bpm} BPM`;

    // 2. 音色 — RANDOMボタンと同じ効果
    randomize();
    document.getElementById('preset').value = '';
    document.getElementById('lcdDisplay').textContent = 'RANDOM__';

    // 3. Rhythm Machine ランダマイズ
    doRhythmRandomize();

    // 4. ポリリズム: 30%の確率でON、ONならランダムサイクル長
    const wantPoly = Math.random() < 0.3;
    if(wantPoly !== polyrhythmEnabled) {
      document.getElementById('polyrhythmBtn').click();
    }
    if(polyrhythmEnabled) {
      DRUM_TRACKS.forEach(track => {
        const len = 2 + Math.floor(Math.random() * 15); // 2〜16
        cycleLengths[track.id] = len;
        const wrap = document.querySelector(`.poly-cycle-wrap[data-track="${track.id}"]`);
        if(wrap) _updateCyclePads(wrap, len);
      });
    }

    // 5. Rhythm AUTO: 50%の確率でAUTO ON
    const wantAuto = Math.random() < 0.5;
    if(wantAuto !== rhythmAutoEnabled) {
      document.getElementById('rhythmAutoBtn').click();
    }
    if(rhythmAutoEnabled) {
      // ループ数をランダムに設定（2〜12）
      const loops = 2 + Math.floor(Math.random() * 11);
      const autoSlider = document.getElementById('autoLoopSlider');
      autoSlider.value = loops;
      document.getElementById('autoLoopVal').textContent = `${loops} LOOPS`;
      rhythmLoopCounter = 0;
      _updateAutoCountdown();
    }

    // 6. スケール（SEQ-A / SEQ-B 共有）
    const scaleKeys = Object.keys(SCALES);
    const randomScale = scaleKeys[Math.floor(Math.random() * scaleKeys.length)];
    const scaleEl = document.getElementById('seqScale');
    scaleEl.value = randomScale;
    // slowSeqScaleDisplayも更新
    const scaleText = scaleEl.options[scaleEl.selectedIndex].text.replace(/[（(].*/, '').trim();
    const slowScaleDisp = document.getElementById('slowSeqScaleDisplay');
    if(slowScaleDisp) slowScaleDisp.textContent = scaleText;

    // 7. SEQ-A ランダマイズ（オクターブもランダム: 3〜5）
    seqOctave = 3 + Math.floor(Math.random() * 3);
    document.getElementById('seqOctDisplay').textContent = `OCT: ${seqOctave}`;
    seqRandomize();

    // 8. SEQ-B ランダマイズ（オクターブ: 2〜4）
    slowSeqOctave = 2 + Math.floor(Math.random() * 3);
    document.getElementById('slowSeqOctDisplay').textContent = `OCT: ${slowSeqOctave}`;
    slowSeqRandomize();

    // 9. Humanizeプリセットをランダムに
    const humanPresets = ['tight', 'natural', 'loose', 'lazy', 'jazz'];
    const hp = humanPresets[Math.floor(Math.random() * humanPresets.length)];
    setHumanizePreset(hp);
    _humanizeUISync();
    _humanizePresetHighlight(hp);

    // 10. Lo-Fi Motion: 40%の確率でON
    const wantMotion = Math.random() < 0.4;
    if(wantMotion !== lofiMotion.enabled) {
      document.getElementById('lofiMotionBtn').click();
    }
    if(lofiMotion.enabled) {
      // depth: 0.1〜0.6、speed: 0.1〜1.0 をランダムに
      const depth = 0.1 + Math.random() * 0.5;
      const speed = 0.1 + Math.random() * 0.9;
      lofiMotion.depth = depth;
      lofiMotion.speed = speed;
      document.getElementById('lofiMotionDepth').value = depth;
      document.getElementById('lofiMotionSpeed').value = speed;
      document.getElementById('lofiMotionDepthVal').textContent = _lofiMotionDepthLabel(depth);
      document.getElementById('lofiMotionSpeedVal').textContent = _lofiMotionSpeedLabel(speed);
    }

    // 11. Mixer: Chorus / Echo sends をランダマイズ（UIで設定した上限値を使用）
    const chorusMax = parseFloat(document.getElementById('adChorusMax').value);
    const echoMax   = parseFloat(document.getElementById('adEchoMax').value);
    const cSends = ['keysChorusSend','seqChorusSend','droneChorusSend','rhythmChorusSend'];
    const eSends = ['keysEchoSend',  'seqEchoSend',  'droneEchoSend',  'rhythmEchoSend'];
    cSends.forEach(id => {
      const v = parseFloat((Math.random() * chorusMax).toFixed(2));
      const el = document.getElementById(id);
      if(el) {
        el.value = v;
        const valEl = document.getElementById(id + 'Val');
        if(valEl) valEl.textContent = Math.round(v * 100) + '%';
      }
    });
    eSends.forEach(id => {
      const v = parseFloat((Math.random() * echoMax).toFixed(2));
      const el = document.getElementById(id);
      if(el) {
        el.value = v;
        const valEl = document.getElementById(id + 'Val');
        if(valEl) valEl.textContent = Math.round(v * 100) + '%';
      }
    });
    updateChorusSends();
    updateEchoSends();

    // 12. Drum Kit をランダマイズ
    const kitKeys = Object.keys(DRUM_KITS);
    const randomKit = kitKeys[Math.floor(Math.random() * kitKeys.length)];
    const drumKitEl = document.getElementById('drumKit');
    if(drumKitEl) drumKitEl.value = randomKit;
  }

  // ── gain を安全にリセットするヘルパー ──
  // cancelScheduledValues は now+小数秒先まで一括キャンセル
  // setValueAtTime で現在値をピン留めしてから新しいランプを発行
  function adGainReset(targetValue) {
    const now = ctx.currentTime;
    masterVolGain.gain.cancelScheduledValues(now);
    // 現在の実測値をピン留め（rampが途中でも確実に現在値から始める）
    masterVolGain.gain.setValueAtTime(masterVolGain.gain.value, now);
    masterVolGain.gain.linearRampToValueAtTime(targetValue, now + 0.02);
  }

  // ── フェードイン ──
  function adFadeIn(fadeSec, cb) {
    const now = ctx.currentTime;
    masterVolGain.gain.cancelScheduledValues(now);
    masterVolGain.gain.setValueAtTime(0.0001, now);
    masterVolGain.gain.linearRampToValueAtTime(ad.savedVol, now + fadeSec);
    adSetPhase('fadein');
    adStartRemain(fadeSec);
    // fadeSecより少し長めに待ってからコールバック（ランプ完了を保証）
    ad.timer = setTimeout(() => {
      adGainReset(ad.savedVol); // ランプ完了後に確実にピン留め
      cb();
    }, (fadeSec + 0.15) * 1000);
  }

  // ── フェードアウト ──
  function adFadeOut(fadeSec, cb) {
    const now = ctx.currentTime;
    masterVolGain.gain.cancelScheduledValues(now);
    masterVolGain.gain.setValueAtTime(masterVolGain.gain.value, now);
    masterVolGain.gain.linearRampToValueAtTime(0.0001, now + fadeSec);
    adSetPhase('fadeout');
    adStartRemain(fadeSec);
    ad.timer = setTimeout(() => {
      adGainReset(0.0001); // 完全にゼロ近くにピン留め
      cb();
    }, (fadeSec + 0.15) * 1000);
  }

  // ── 1曲再生フロー ──
  function adPlaySong() {
    if(!ad.running) return;
    const p = adParams();

    // 曲数チェック
    if(p.songCount > 0 && ad.songIndex >= p.songCount) {
      adFinish();
      return;
    }

    ad.songIndex++;
    const total = p.songCount > 0 ? p.songCount : '∞';
    songCounter.textContent = `${ad.songIndex} / ${total}`;

    // ランダマイズ
    adRandomizeAll();

    // rhythmStart
    if(!rhythmPlaying) (window.rhythmStart || rhythmStart)();

    // gain を確実に 0 近くにリセット（前曲のランプ残骸を排除）
    const nowReset = ctx.currentTime;
    masterVolGain.gain.cancelScheduledValues(nowReset);
    masterVolGain.gain.setValueAtTime(0.0001, nowReset);

    // 曲尺をランダムに決定
    const songDur = p.durMin + Math.random() * (p.durMax - p.durMin);

    // フェードイン → 再生待機 → フェードアウト → ギャップ → 次へ
    adFadeIn(p.fade, () => {
      if(!ad.running) return;
      adSetPhase('play');
      // 再生中の残り時間 = songDur - fade（フェードイン分を引く）
      const playDur = Math.max(1, songDur - p.fade - p.fade);
      adStartRemain(playDur + p.fade); // fadeOut込みの残り

      ad.timer = setTimeout(() => {
        if(!ad.running) return;
        adFadeOut(p.fade, () => {
          if(!ad.running) return;
          // rhythmStop
          (window.rhythmStop || rhythmStop)();
          // ギャップ
          if(p.gap > 0) {
            adSetPhase('gap');
            adStartRemain(p.gap);
            ad.timer = setTimeout(() => {
              if(!ad.running) return;
              adPlaySong();
            }, p.gap * 1000);
          } else {
            adPlaySong();
          }
        });
      }, playDur * 1000);
    });
  }

  // ── 終了処理 ──
  function adFinish() {
    ad.running = false;
    clearTimeout(ad.timer);
    adStopRemain();
    // gain を確実に savedVol に戻す
    const now = ctx.currentTime;
    masterVolGain.gain.cancelScheduledValues(now);
    masterVolGain.gain.setValueAtTime(masterVolGain.gain.value, now);
    masterVolGain.gain.linearRampToValueAtTime(ad.savedVol, now + 0.3);
    setTimeout(() => {
      // ランプ完了後に確実にピン留め
      masterVolGain.gain.cancelScheduledValues(ctx.currentTime);
      masterVolGain.gain.setValueAtTime(ad.savedVol, ctx.currentTime);
      // UIスライダーも同期
      const masterSlider = document.getElementById('masterVolSlider');
      if(masterSlider) {
        masterSlider.value = ad.savedVol;
        document.getElementById('masterVolVal').textContent = Math.round(ad.savedVol * 100) + '%';
      }
    }, 350);
    // rhythmStop（再生中なら）
    if(rhythmPlaying) (window.rhythmStop || rhythmStop)();
    // UI更新
    btn.textContent = 'START';
    btn.classList.remove('playing');
    adSetPhase('done');
    setTimeout(() => {
      statusBar.style.display = 'none';
    }, 2000);
  }

  // ── START / STOP ──
  btn.addEventListener('click', async () => {
    await ctx.resume();
    startSharedFxLfos();

    if(ad.running) {
      // 手動STOP
      ad.running = false;
      clearTimeout(ad.timer);
      adStopRemain();
      adFinish();
      return;
    }

    // START
    ad.running   = true;
    ad.songIndex = 0;
    ad.savedVol  = masterVolGain.gain.value;

    btn.textContent = 'STOP';
    btn.classList.add('playing');
    statusBar.style.display = 'flex';

    adPlaySong();
  });

})();

