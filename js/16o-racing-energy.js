// ════════════════════════════════════════════════
// VFD RACING — エネルギータンク
//
//  ・走行距離で約 ENERGY_EVERY(1.4〜2.2km) ごとに、遠くへタンクを1つ置く（最初は 1.2〜1.8km 付近）。同時に最大2つ。
//    レーンは ENERGY_ONC_P(25%) で対向車線、ほかは自車線。星・ハート・コインと同じレーン・近い奥行きには置かない。
//  ・取ると ENERGY_TIME(=星と同じ8秒) の間、最高速が +ENERGY_VMAX_BONUS(70) km/h、加速が ×ENERGY_ACCEL_MULT。
//    重ねて取ると 8秒に戻る（積み上がらない）。効果が切れたら、最高速を超えている分は ENERGY_DECAY km/h/s でなめらかに戻る。
//  ・無敵ではない: 速いまま衝突すればハートは減る。速度の2乗で効くカーブの流れもきつくなる。操舵は速度に比例して効くので
//    車線変更は速くなる。取りに行くか、避けるかはプレイヤーの判断。
//  ・実際の走行への反映は 16b（最高速・加速・エンジン音の最高速）。ここでは出現・取得・残り時間・描画だけ。
//  ・演出（v1.9.1・派手）: 全て level()（0〜1）一つから決める。level = 「最高速を超えている分 ÷ ENERGY_VMAX_BONUS」（効果中は最低 0.5）。
//      → 加速で上がり、効果が切れて速度が戻る間に下がる。取得の瞬間だけ burst()（0〜1、BURST_T 秒で消える）が加わる。
//      見た目: 取得フラッシュ＋衝撃リング / 画面ズーム / 画面の縁の緑の光 / 車体の緑のグロー＋残像 /（16h）緑の増えたスピードライン・強い揺れ
//      音（16e）: 取得時のうなり・風切り・低音ドン / エンジンが明るく・太く・ターボ笛 / 終了時にブローオフ
//      物理には一切触れない（見た目と音だけ）。
// 公開: window.EnergyTank（update / items / draw / spawnTank / reset / level / burst / zoom / drawScreenFx / drawRing / carGlow）
// ════════════════════════════════════════════════
window.EnergyTank = (function(){
  const R = 120;                                   // タンクの大きさ（ワールド単位の半径に相当）
  const LANES_OWN = [0.22, 0.66], LANES_ONC = [-0.22, -0.66];
  const rr = (a, b) => a + Math.random()*(b - a);
  const BURST_T = 0.55;                            // 取得の瞬間の演出の長さ(秒)
  const ZOOM_SUS = 0.035, ZOOM_KICK = 0.07;        // 画面ズーム: 効果中の常時分 / 取得の瞬間の追加分（消失点を固定した拡大率）
  let fxLv = 0, burstT = 0, wasOn = false;
  const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;

  function spawnTank(){
    if(bonusEnergy.length >= 2) return;
    const z = cam.pos + DRAW*SEGZ*0.92;
    const onc = Math.random() < ENERGY_ONC_P, set = onc ? LANES_ONC : LANES_OWN;
    const busy = x => bonusStars.concat(bonusHearts, bonusCoins).some(s => Math.abs(s.z - z) < 5000 && Math.abs(s.x - x) < 0.3);
    let lanes = set.filter(x => !busy(x)); if(!lanes.length) lanes = set;
    bonusEnergy.push({ z, x: lanes[Math.floor(Math.random()*lanes.length)] + rr(-0.06, 0.06), ph: Math.random()*6.28 });
  }

  function collect(){
    const was = player.energy > 0;
    player.energy = ENERGY_TIME; burstT = BURST_T; wasOn = true;
    addLog(was ? 'ENERGY! TIME RESET' : `ENERGY! +${ENERGY_VMAX_BONUS}km/h`);
    if(typeof playEnergySound === 'function') playEnergySound();
  }

  // 毎フレーム（PLAY中のみ）: 出現（走行距離）・取得判定・残り時間・後方へ去ったタンクの削除
  function update(dt){
    if(player.energy > 0) player.energy = Math.max(0, player.energy - dt);
    // 演出の強さ: 最高速を超えた分の割合。効果中は最低 0.5（まだ加速中でも「効いている」見た目にする）。なめらかに追従
    const over = (player.speed - Garage.stats().vmax)/ENERGY_VMAX_BONUS;
    fxLv += (Math.max(clamp01(over), player.energy > 0 ? 0.5 : 0) - fxLv)*Math.min(1, dt*8);
    burstT = Math.max(0, burstT - dt);
    if(wasOn && player.energy <= 0){                                  // 効果が切れた: ターボのプシュッ（ブローオフ）
      wasOn = false;
      if(typeof sndReady !== 'undefined' && sndReady && typeof blowOff === 'function') blowOff(sndCtx.currentTime);
    }
    if(game.nextEnergy > 0 && game.dist >= game.nextEnergy){
      spawnTank();
      game.nextEnergy += rr(ENERGY_EVERY[0], ENERGY_EVERY[1]);
    }
    bonusEnergy = bonusEnergy.filter(s => {
      const relZ = s.z - cam.pos;
      if(relZ < -1200) return false;
      // 星・ハートと同じ取得判定（奥行きが重なり、横が近い）
      if(relZ + R > PLAYER_Z && relZ - R < PLAYER_Z + PLAYER_LEN && Math.abs(s.x - player.x) < 0.24){ collect(); return false; }
      return true;
    });
  }

  // ── 演出（描画だけ。ゲームの状態は変えない）──
  const level = () => (typeof mode !== 'undefined' && mode === MODE.PLAY) ? fxLv : 0;
  const burst = () => (typeof mode !== 'undefined' && mode === MODE.PLAY) ? burstT/BURST_T : 0;
  // 画面ズーム倍率: 効果中の常時分 + 取得の瞬間のキック（二次で素早く戻る）
  function zoom(){ const b = burst(); return 1 + ZOOM_SUS*level() + ZOOM_KICK*b*b; }

  // 実画面の座標: 取得フラッシュ（加算の緑）と、効果中の画面の縁の緑の光（中央は抜く）
  function drawScreenFx(g, w, h, t){
    const lv = level(), b = burst();
    if(lv < 0.02 && b <= 0) return;
    g.save(); g.globalCompositeOperation = 'lighter';
    if(b > 0){ g.fillStyle = `rgba(110,255,190,${0.34*b*b})`; g.fillRect(0, 0, w, h); }
    if(lv >= 0.02){
      const pulse = 0.85 + 0.15*Math.sin(t*0.012), r = Math.hypot(w, h)*0.5;
      const gg = g.createRadialGradient(w*0.5, h*0.5, r*0.50, w*0.5, h*0.5, r);
      gg.addColorStop(0, 'rgba(61,255,166,0)');
      gg.addColorStop(1, `rgba(61,255,166,${0.34*lv*pulse})`);
      g.fillStyle = gg; g.fillRect(0, 0, w, h);
    }
    g.restore();
  }

  // 世界の座標（drawPlayerCar の中から）: 取得の瞬間の衝撃リング（車の位置から広がる楕円を2本、時間差で）
  function drawRing(g, t){
    const b = burst(); if(b <= 0) return;
    const c = _projWorld(player.x*ROADW, 180, PLAYER_Z, roadCenterOffsetPx);
    const rad = WORLD_CAR_HALF_W*(CAM_D/PLAYER_Z)*(W*0.5);
    g.save(); g.globalCompositeOperation = 'lighter';
    for(let i = 0; i < 2; i++){
      const p = 1 - b - i*0.18; if(p <= 0 || p >= 1) continue;               // 0→1 で広がる
      const k = 1 - (1 - p)*(1 - p), rx = rad*(1.2 + 6.5*k);
      g.strokeStyle = `rgba(140,255,205,${0.85*(1 - p)})`; g.lineWidth = Math.max(2, rad*0.30*(1 - p));
      g.beginPath(); g.ellipse(c.sx, c.sy, rx, rx*0.55, 0, 0, Math.PI*2); g.stroke();
    }
    g.restore();
  }

  // 車体の発光の強さ（0〜1）。効果が切れる2秒前は点滅して終わりを知らせる（星と同じ周期）
  function carGlow(t){
    const lv = level(); if(lv < 0.02) return 0;
    const blink = player.energy > 0 && player.energy < 2 && (Math.floor(t/110) % 2 === 0);
    return Math.min(1, lv*(blink ? 0.35 : 1) + burst()*0.3);
  }

  function rrect(g, x, y, w, h, r){
    r = Math.min(r, w/2, h/2);
    g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.arcTo(x + w, y, x + w, y + r, r);
    g.lineTo(x + w, y + h - r); g.arcTo(x + w, y + h, x + w - r, y + h, r); g.lineTo(x + r, y + h); g.arcTo(x, y + h, x, y + h - r, r);
    g.lineTo(x, y + r); g.arcTo(x, y, x + r, y, r); g.closePath();
  }

  // 描画: 光る円筒形のタンク（中に液体と稲妻）。ゆっくり上下に浮き、脈打つ。relZ=カメラ基準の奥行き、cxAcc=カーブのオフセット
  function draw(g, s, relZ, cxAcc, t){
    if(relZ - R < CAR_NEAR_Z + 10) return;
    const px = CAM_D/relZ*(W*0.5);                                // 1ワールド単位あたりの横px
    if(px*R < 1.2) return;
    const Yw = 230 + 30*Math.sin(t*0.003 + s.ph), c = _projWorld(s.x*ROADW, Yw, relZ, cxAcc), gp = _projWorld(s.x*ROADW, 0, relZ, cxAcc);
    const hh = R*px*1.25, ww = R*px*0.70, pulse = 0.8 + 0.2*Math.sin(t*0.008 + s.ph);
    g.save();
    // 床の影と照り返し
    const sr = Math.max(2, ww*1.5);
    g.fillStyle = 'rgba(0,0,0,0.30)'; g.beginPath(); g.ellipse(gp.sx, gp.sy, sr, Math.max(1, sr*0.2), 0, 0, Math.PI*2); g.fill();
    Roadside.glow(g, 'energyFloor', [60,255,170], 0.40, 0.12, gp.sx, gp.sy, Math.max(4, Math.min(260, ww*3.2)));
    Roadside.glow(g, 'energyHalo', [70,255,180], 0.60*pulse, 0.22, c.sx, c.sy, Math.max(6, Math.min(420, hh*2.6)));   // 背面の光暈（加算合成）
    const x0 = c.sx - ww, y0 = c.sy - hh, w = ww*2, h = hh*2, lw = Math.max(0.8, ww*0.12);
    // 本体（暗い青緑）→ 液体（下から72%・明るい緑）→ 縁取り → キャップ
    rrect(g, x0, y0, w, h, ww*0.55); g.fillStyle = '#082f2b'; g.fill();
    g.save(); rrect(g, x0, y0, w, h, ww*0.55); g.clip();
    const lv = 0.72 + 0.04*Math.sin(t*0.006 + s.ph);
    g.fillStyle = '#3dffa6'; g.globalAlpha = 0.92; g.fillRect(x0, y0 + h*(1 - lv), w, h*lv);
    g.globalAlpha = 0.5; g.fillStyle = '#c8ffe8'; g.fillRect(x0 + w*0.12, y0, w*0.16, h);                  // ガラスの反射
    g.restore();
    rrect(g, x0, y0, w, h, ww*0.55); g.strokeStyle = '#9dffd8'; g.lineWidth = lw; g.stroke();
    g.fillStyle = '#9dffd8'; g.fillRect(c.sx - ww*0.42, y0 - hh*0.14, ww*0.84, hh*0.16);                      // キャップ
    // 稲妻（白）
    const u = ww*0.9, bx = c.sx, by = c.sy;
    g.beginPath(); g.moveTo(bx + 0.20*u, by - 0.95*u); g.lineTo(bx - 0.45*u, by + 0.10*u); g.lineTo(bx - 0.02*u, by + 0.10*u);
    g.lineTo(bx - 0.22*u, by + 0.95*u); g.lineTo(bx + 0.48*u, by - 0.18*u); g.lineTo(bx + 0.04*u, by - 0.18*u); g.closePath();
    g.fillStyle = '#ffffff'; g.fill(); g.strokeStyle = '#0b7a5a'; g.lineWidth = Math.max(0.6, lw*0.5); g.stroke();
    g.restore();
  }

  return { update, draw, spawnTank, level, burst, zoom, drawScreenFx, drawRing, carGlow,
           items(){ return bonusEnergy; },
           reset(){ bonusEnergy = []; player.energy = 0; fxLv = 0; burstT = 0; wasOn = false; game.nextEnergy = ENERGY_FIRST[0] + Math.random()*(ENERGY_FIRST[1] - ENERGY_FIRST[0]); },
           R };
})();
