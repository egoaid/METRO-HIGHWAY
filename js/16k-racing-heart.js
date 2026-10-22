// ════════════════════════════════════════════════
// VFD RACING — ハートの回復アイテム
//
//  ・道路にときどきハートが落ちている。走行距離で約 1km に1個（HEART_EVERY = 800〜1200m、最初の1個は 400〜800m 付近）。
//    レーンはランダム。道路に固定され、自車が近づくと手前へ流れてくる（星と同じ）。同時に最大2つ。
//  ・自車が上を通ると取得 → HP が HEART_HEAL(=ハート半分) 回復する。maxHp(=3) を超えない。
//    すでに満タンなら回復はしない（ハートは消える）。ダメージは1回で1ハート。
//  ・ハートは立体（ハート形を押し出した形）で、ゆっくり回転し、赤く光る。上下にもゆっくり浮き沈みする。
//  ・星(16j)と同じ描き方・同じ取得判定。星と同じレーン/近い奥行きには出さない。
// 公開: window.HeartBonus（update / items / draw / reset / spawnHeart）
// ════════════════════════════════════════════════
window.HeartBonus = (function(){
  const R = 290, T = 85;                         // 大きさ（星と同じ）/ 厚みの半分（ワールド単位）
  const SPIN = 0.9;                              // 回転速度(rad/s)
  const N = 32;                                  // 輪郭の点の数
  const LIGHT = (()=>{ const v=[-0.30,0.70,-0.65], n=Math.hypot(...v); return v.map(a=>a/n); })();
  const rr = (a, b) => a + Math.random()*(b - a);

  // ハート形の輪郭（左右対称。 x=16sin³t, y=13cos t−5cos2t−2cos3t−cos4t を、幅が ±R*0.92 になるよう拡大し、中心を原点へ）
  const RING = (() => {
    const raw = [];
    for(let i = 0; i < N; i++){
      const t = i/N*Math.PI*2;
      raw.push([16*Math.pow(Math.sin(t), 3), 13*Math.cos(t) - 5*Math.cos(2*t) - 2*Math.cos(3*t) - Math.cos(4*t)]);
    }
    let y0 = Infinity, y1 = -Infinity; for(const p of raw){ y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    const k = R*0.92/16, cy = (y0 + y1)/2;
    const ring = raw.map(p => [p[0]*k, (p[1] - cy)*k]);
    // 向きを反時計回り（y が上向き）に揃える。側面の外向き法線をこの向きで計算するため
    let area = 0; for(let i = 0; i < N; i++){ const a = ring[i], b = ring[(i + 1)%N]; area += a[0]*b[1] - b[0]*a[1]; }
    return area < 0 ? ring.reverse() : ring;
  })();
  // 側面の外向き法線（モデル空間）。反時計回りの辺 (ex,ey) の外向きは (ey,-ex)。凹みがあっても正しい
  const SIDE_N = RING.map((p, i) => {
    const q = RING[(i + 1)%N], ex = q[0] - p[0], ey = q[1] - p[1], l = Math.hypot(ex, ey) || 1;
    return [ey/l, -ex/l];
  });

  function spawnHeart(){
    if(bonusHearts.length >= 2) return;
    const z = cam.pos + DRAW*SEGZ*0.92;
    let lanes = [-0.66, -0.22, 0.22, 0.66];
    // 星と同じレーン・近い奥行きには出さない（重なって取れない/見えないのを避ける）
    const free = lanes.filter(x => !bonusStars.some(s => Math.abs(s.z - z) < 4000 && Math.abs(s.x - x) < 0.3));
    if(free.length) lanes = free;
    bonusHearts.push({ z, x: lanes[Math.floor(Math.random()*lanes.length)] + rr(-0.08, 0.08), ph: Math.random()*6.28 });
  }

  function collect(){
    if(game.hp >= game.maxHp){
      addLog('♥ HP FULL');
    }else{
      game.hp = Math.min(game.maxHp, game.hp + HEART_HEAL);
      game.healT = 0.7;                           // HUD のハートを一瞬光らせる
      addLog(`♥ +½  HP:${hpText()}`);
    }
    if(typeof playHeartSound === 'function') playHeartSound();
  }

  // 毎フレーム（PLAY中のみ）: 出現（走行距離）・取得判定・後方へ去ったハートの削除
  function update(dt, t){
    if(game.healT > 0) game.healT = Math.max(0, game.healT - dt);
    if(game.nextHeart > 0 && game.dist >= game.nextHeart){
      spawnHeart();
      game.nextHeart += rr(HEART_EVERY[0], HEART_EVERY[1]);
    }
    bonusHearts = bonusHearts.filter(s => {
      const relZ = s.z - cam.pos;
      if(relZ < -1200) return false;
      // 自車の車体の上を通った（奥行きが重なり、横が近い）— 星と同じ判定
      if(relZ + R > PLAYER_Z && relZ - R < PLAYER_Z + PLAYER_LEN && Math.abs(s.x - player.x) < 0.24){
        collect(); return false;
      }
      return true;
    });
  }

  // 描画: 立体のハート + 光暈 + 床の光。relZ=カメラ基準の奥行き、cxAcc=カーブのオフセット
  function draw(g, s, relZ, cxAcc, t){
    if(relZ - R < CAR_NEAR_Z + 10) return;                      // カメラの真横を過ぎたものは描かない
    const ang = t*0.001*SPIN + s.ph;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const Xw = s.x*ROADW, Yw = 340 + 34*Math.sin(t*0.0028 + s.ph);
    const c = _projWorld(Xw, Yw, relZ, cxAcc), gp = _projWorld(Xw, 0, relZ, cxAcc);
    const px = CAM_D/relZ*(W*0.5);                               // 1ワールド単位あたりの横px
    if(px*R < 1.2) return;

    // 床: 影と赤い照り返し
    const sr = Math.max(2, R*px*1.1);
    g.save();
    g.fillStyle = 'rgba(0,0,0,0.30)';
    g.beginPath(); g.ellipse(gp.sx, gp.sy, sr, Math.max(1, sr*0.20), 0, 0, Math.PI*2); g.fill();
    Roadside.glow(g, 'heartFloor', [255,60,100], 0.40, 0.12, gp.sx, gp.sy, Math.max(4, Math.min(260, R*px*2.6)));
    g.restore();
    // 背面の光暈（加算合成）。脈動する（ドクンと）
    const pulse = 0.82 + 0.18*Math.sin(t*0.008 + s.ph);
    Roadside.glow(g, 'heartHalo', [255,70,110], 0.65*pulse, 0.22, c.sx, c.sy, Math.max(6, Math.min(420, R*px*2.8)));

    // 立体: 全頂点をワールドへ（回転→平行移動）して投影し、奥の面から塗る
    const P = (mx, my, mz) => [Xw + mx*ca + mz*sa, Yw + my, relZ - mx*sa + mz*ca];
    const faces = [];
    const cap = (sign) => {
      const pts = RING.map(v => P(v[0], v[1], sign*T));
      const n = [sign*sa, 0, sign*ca];
      faces.push({ pts, n, z: pts.reduce((a, p) => a + p[2], 0)/N });
    };
    cap(1); cap(-1);
    for(let i = 0; i < N; i++){
      const a = RING[i], b = RING[(i + 1)%N];
      const pts = [P(a[0], a[1], -T), P(b[0], b[1], -T), P(b[0], b[1], T), P(a[0], a[1], T)];
      const mn = SIDE_N[i], n = [mn[0]*ca, mn[1], -mn[0]*sa];
      faces.push({ pts, n, z: pts.reduce((x, p) => x + p[2], 0)/4 });
    }
    faces.sort((a, b) => b.z - a.z);
    g.save();
    g.lineJoin = 'round';
    for(const f of faces){
      const pr = f.pts.map(p => _projWorld(p[0], p[1], p[2], cxAcc));
      const d = f.n[0]*LIGHT[0] + f.n[1]*LIGHT[1] + f.n[2]*LIGHT[2];
      const b = 0.42 + 0.58*Math.abs(d);                          // 両面照明（回転で裏面が見えるため）
      const r = Math.min(255, 235*b + 40*b*b), gg = Math.min(255, 30*b + 70*b*b*b), bl = Math.min(255, 60*b + 100*b*b*b);
      g.fillStyle = `rgb(${r|0},${gg|0},${bl|0})`;
      g.strokeStyle = 'rgba(255,190,205,0.70)';
      g.lineWidth = Math.max(0.6, R*px*0.018);
      g.beginPath(); g.moveTo(pr[0].sx, pr[0].sy);
      for(let i = 1; i < pr.length; i++) g.lineTo(pr[i].sx, pr[i].sy);
      g.closePath(); g.fill(); g.stroke();
    }
    g.restore();
  }

  return { update, draw, spawnHeart,
           items(){ return bonusHearts; },
           reset(){ bonusHearts = []; game.healT = 0; game.nextHeart = HEART_FIRST[0] + Math.random()*(HEART_FIRST[1] - HEART_FIRST[0]); },
           R };
})();
