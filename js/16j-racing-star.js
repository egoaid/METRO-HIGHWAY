// ════════════════════════════════════════════════
// VFD RACING — 星のボーナス（無敵）
//
//  ・走行距離が STAR_FIRST_DIST(5km) を超えると、道路に星が落ちる。以後 0.7〜1.4km ごとに次の星。
//    （同時に最大3つ。レーンはランダム。道路に固定され、自車が近づくと手前へ流れてくる）
//  ・星は立体（五角形の星を押し出した形）で、ゆっくり回転し、少し光り輝く。上下にもゆっくり浮き沈みする。
//  ・自車が星の上を通ると取得 → INV_TIME(8秒)の無敵。ハートは減らない。残り2秒で自車が点滅して知らせる。
//  ・無敵中に自車が当てた他車は、通常より大きく揺れる（INV_BOOST 倍。16i）。
//  ・自車が光る表現は drawPlayerCar（16c）、残り時間の表示は drawGameHUD（16d）。
// 公開: window.StarBonus（update / items / draw / reset）
// ════════════════════════════════════════════════
window.StarBonus = (function(){
  const R = 290, R_IN = 0.46, T = 85;           // 外半径 / 内半径比 / 厚みの半分（ワールド単位）
  const SPIN = 0.9;                              // 回転速度(rad/s)
  const LIGHT = (()=>{ const v=[-0.30,0.70,-0.65], n=Math.hypot(...v); return v.map(a=>a/n); })();
  const rr = (a, b) => a + Math.random()*(b - a);

  // 星形（10頂点: 外/内 交互）と、押し出した立体の面
  const RING = [];
  for(let i = 0; i < 10; i++){
    const r = i % 2 ? R*R_IN : R, a = -Math.PI/2 + i*Math.PI/5;
    RING.push([Math.cos(a)*r, Math.sin(a)*r]);
  }
  // 側面の外向き法線（モデル空間）: 辺の向きに垂直で、重心から外向き
  const SIDE_N = RING.map((p, i) => {
    const q = RING[(i + 1)%10], ex = q[0] - p[0], ey = q[1] - p[1], l = Math.hypot(ex, ey);
    let nx = ey/l, ny = -ex/l; const mx = (p[0] + q[0])/2, my = (p[1] + q[1])/2;
    if(nx*mx + ny*my < 0){ nx = -nx; ny = -ny; }
    return [nx, ny];
  });

  function spawnStar(){
    if(bonusStars.length >= 3) return;
    const lanes = [-0.66, -0.22, 0.22, 0.66];
    bonusStars.push({ z: cam.pos + DRAW*SEGZ*0.92, x: lanes[Math.floor(Math.random()*4)] + rr(-0.08, 0.08), ph: Math.random()*6.28 });
  }

  function collect(){
    player.inv = INV_TIME;
    addLog('★ STAR!  INVINCIBLE');
    if(typeof playStarSound === 'function') playStarSound();
  }

  // 毎フレーム（PLAY中のみ）: 無敵の残り時間・星の出現・取得判定・後方へ去った星の削除
  function update(dt, t){
    if(player.inv > 0) player.inv = Math.max(0, player.inv - dt);
    if(game.nextStar > 0 && game.dist >= game.nextStar){
      spawnStar();
      game.nextStar += rr(700, 1400);
    }
    bonusStars = bonusStars.filter(s => {
      const relZ = s.z - cam.pos;
      if(relZ < -1200) return false;
      // 自車の車体の上を通った（奥行きが重なり、横が近い）
      if(relZ + R > PLAYER_Z && relZ - R < PLAYER_Z + PLAYER_LEN && Math.abs(s.x - player.x) < 0.24){
        collect(); return false;
      }
      return true;
    });
  }

  // 描画: 立体の星 + 光暈 + 床の光 + きらめき。relZ=カメラ基準の奥行き、cxAcc=カーブのオフセット
  function draw(g, s, relZ, cxAcc, t){
    if(relZ - R < CAR_NEAR_Z + 10) return;                      // カメラの真横を過ぎた星は描かない
    const ang = t*0.001*SPIN + s.ph;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const Xw = s.x*ROADW, Yw = 340 + 34*Math.sin(t*0.0028 + s.ph);
    const c = _projWorld(Xw, Yw, relZ, cxAcc), gp = _projWorld(Xw, 0, relZ, cxAcc);
    const px = CAM_D/relZ*(W*0.5);                               // 1ワールド単位あたりの横px
    if(px*R < 1.2) return;

    // 床: 影と金色の照り返し（地面に落ちている感じ）
    const sr = Math.max(2, R*px*1.1);
    g.save();
    g.fillStyle = 'rgba(0,0,0,0.30)';
    g.beginPath(); g.ellipse(gp.sx, gp.sy, sr, Math.max(1, sr*0.20), 0, 0, Math.PI*2); g.fill();
    Roadside.glow(g, 'starFloor', [255,205,70], 0.40, 0.12, gp.sx, gp.sy, Math.max(4, Math.min(260, R*px*2.6)));
    g.restore();
    // 背面の光暈（加算合成）。脈動する
    const pulse = 0.85 + 0.15*Math.sin(t*0.006 + s.ph);
    Roadside.glow(g, 'starHalo', [255,215,90], 0.65*pulse, 0.22, c.sx, c.sy, Math.max(6, Math.min(420, R*px*2.8)));

    // 立体: 全頂点をワールドへ（回転→平行移動）して投影し、奥の面から塗る
    const P = (mx, my, mz) => [Xw + mx*ca + mz*sa, Yw + my, relZ - mx*sa + mz*ca];
    const faces = [];
    const cap = (sign) => {
      const pts = RING.map(v => P(v[0], -v[1], sign*T));
      const n = [sign*sa, 0, sign*ca];
      faces.push({ pts, n, z: pts.reduce((a, p) => a + p[2], 0)/10 });
    };
    cap(1); cap(-1);
    for(let i = 0; i < 10; i++){
      const a = RING[i], b = RING[(i + 1)%10];
      const pts = [P(a[0], -a[1], -T), P(b[0], -b[1], -T), P(b[0], -b[1], T), P(a[0], -a[1], T)];
      const mn = SIDE_N[i], n = [mn[0]*ca, -mn[1], -mn[0]*sa];
      faces.push({ pts, n, z: pts.reduce((x, p) => x + p[2], 0)/4 });
    }
    faces.sort((a, b) => b.z - a.z);
    g.save();
    g.lineJoin = 'round';
    for(const f of faces){
      const pr = f.pts.map(p => _projWorld(p[0], p[1], p[2], cxAcc));
      const d = f.n[0]*LIGHT[0] + f.n[1]*LIGHT[1] + f.n[2]*LIGHT[2];
      const b = 0.42 + 0.58*Math.abs(d);                          // 両面照明（回転で裏面が見えるため）
      const r = Math.min(255, 255*b + 30*b*b), gg = Math.min(255, 200*b + 55*b*b), bl = Math.min(255, 40*b + 120*b*b*b);
      g.fillStyle = `rgb(${r|0},${gg|0},${bl|0})`;
      g.strokeStyle = 'rgba(255,244,190,0.75)';
      g.lineWidth = Math.max(0.6, R*px*0.018);
      g.beginPath(); g.moveTo(pr[0].sx, pr[0].sy);
      for(let i = 1; i < pr.length; i++) g.lineTo(pr[i].sx, pr[i].sy);
      g.closePath(); g.fill(); g.stroke();
    }
    // きらめき（十字の光条。ゆっくり明滅）
    const tw = Math.max(0, Math.sin(t*0.004 + s.ph*2));
    if(tw > 0.05 && R*px > 4){
      const L = R*px*(0.7 + 0.5*tw);
      g.globalCompositeOperation = 'lighter';
      g.strokeStyle = `rgba(255,248,210,${0.55*tw})`; g.lineWidth = Math.max(1, R*px*0.04);
      g.beginPath(); g.moveTo(c.sx - L, c.sy); g.lineTo(c.sx + L, c.sy); g.moveTo(c.sx, c.sy - L); g.lineTo(c.sx, c.sy + L); g.stroke();
    }
    g.restore();
  }

  return { update, draw, spawnStar,
           items(){ return bonusStars; },
           reset(){ bonusStars = []; player.inv = 0; game.nextStar = STAR_FIRST_DIST; },
           R };
})();
