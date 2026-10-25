// ════════════════════════════════════════════════
// VFD RACING — 道路のコイン
//
//  ・走行距離で約 COIN_EVERY(300〜500m) ごとに、遠く（描画距離の手前92%）へコインの列を1つ置く。最初は 150〜300m 付近。
//    列は 直線（同じレーンに6枚）か 斜め（隣のレーンへ移りながら6枚）。多くは自車線の2レーン（x=0.22 / 0.66）、
//    COIN_ONC_P(25%) は対向車線の2レーン（x=-0.22 / -0.66）に置く。対向車線のコインは1枚 COIN_ONC_VALUE(2) で、橙色。
//    取りに行くと正面から車が来るので難しさが上がる。斜めの列は同じ側の2レーンの間だけ（中央線はまたがない）。
//    星・ハートと同じレーン・近い奥行きの所には置かない。
//  ・自車が上を通ると取得（1枚 = COIN_VALUE）。続けて取ると音が少しずつ高くなる（コンボ）。
//  ・取る＝車線を変える＝他車に近づく、が難しさの源。避けて通るのも自由。
//  ・描画は回転する金色の円盤（楕円の幅が |cos| で変わる）+ 小さな光暈。見えない・取れない距離のものは描かない。
// 公開: window.CoinBonus（update / items / draw / spawnGroup / reset）
// ════════════════════════════════════════════════
window.CoinBonus = (function(){
  const R = 105;                                 // 円盤の半径（ワールド単位）
  const SPACING = 270;                           // 列の中の枚数間隔（ワールドZ）
  const LANES = [0.22, 0.66];                    // 自車線の2レーン
  const LANES_ONC = [-0.22, -0.66];              // 対向車線の2レーン
  const rr = (a, b) => a + Math.random()*(b - a);
  let combo = 0, comboT = 0;

  // 列を1つ置く。枚数 6。直線 65% / 斜め 35%
  function spawnGroup(){
    if(bonusCoins.length > 24) return;
    const z0 = cam.pos + DRAW*SEGZ*0.92;
    // 星・ハートが近くにあるレーンは避ける（重なって取れない/見えないのを避ける）
    const busy = x => bonusStars.concat(bonusHearts).some(s => Math.abs(s.z - z0) < 5000 && Math.abs(s.x - x) < 0.3);
    const onc = Math.random() < COIN_ONC_P, set = onc ? LANES_ONC : LANES;
    let lanes = set.filter(x => !busy(x)); if(!lanes.length) lanes = set.slice();
    const a = lanes[Math.floor(Math.random()*lanes.length)], diag = Math.random() < 0.35;
    const b = diag ? (a === set[0] ? set[1] : set[0]) : a;
    const N = 6, gid = Math.random(), v = onc ? COIN_ONC_VALUE : COIN_VALUE;
    for(let i = 0; i < N; i++){
      const t = diag ? i/(N - 1) : 0;
      bonusCoins.push({ z: z0 + i*SPACING, x: a + (b - a)*t, ph: i*0.9 + gid*6, v, onc });
    }
  }

  function collect(c){
    comboT = 1.2; combo = Math.min(7, combo + 1);
    Garage.addCoins(c.v || COIN_VALUE);
    if(typeof playCoinSound === 'function') playCoinSound(combo);
  }

  // 毎フレーム（PLAY中のみ）: 出現（走行距離）・取得判定・後方へ去ったコインの削除
  function update(dt){
    if(comboT > 0){ comboT -= dt; if(comboT <= 0) combo = 0; }
    if(game.nextCoin > 0 && game.dist >= game.nextCoin){
      spawnGroup();
      game.nextCoin += rr(COIN_EVERY[0], COIN_EVERY[1]);
    }
    bonusCoins = bonusCoins.filter(c => {
      const relZ = c.z - cam.pos;
      if(relZ < -1200) return false;
      if(relZ + R > PLAYER_Z && relZ - R < PLAYER_Z + PLAYER_LEN && Math.abs(c.x - player.x) < 0.20){ collect(c); return false; }
      return true;
    });
  }

  // 描画: 回転する金色の円盤。relZ=カメラ基準の奥行き、cxAcc=カーブのオフセット
  function draw(g, c, relZ, cxAcc, t){
    if(relZ - R < CAR_NEAR_Z + 10) return;
    const px = CAM_D/relZ*(W*0.5);                               // 1ワールド単位あたりの横px
    if(px*R < 1.0) return;
    const Yw = 150 + 14*Math.sin(t*0.003 + c.ph);
    const p = _projWorld(c.x*ROADW, Yw, relZ, cxAcc);
    const ang = t*0.0062 + c.ph, w = Math.abs(Math.cos(ang));    // 回転: 横幅が変わる
    const ry = R*px, rx = Math.max(ry*0.14, ry*w);
    if(ry > 5) Roadside.glow(g, c.onc ? 'coinHaloO' : 'coinHalo', c.onc ? [255,140,50] : [255,205,60], 0.50, 0.14, p.sx, p.sy, Math.min(150, ry*2.4));
    g.save();
    g.fillStyle = c.onc ? '#ff9a3a' : '#ffcf3a'; g.strokeStyle = c.onc ? '#ffd2a0' : '#fff2a8'; g.lineWidth = Math.max(0.8, ry*0.10);
    g.beginPath(); g.ellipse(p.sx, p.sy, rx, ry, 0, 0, Math.PI*2); g.fill(); g.stroke();
    if(rx > 3.5){                                                // 中の刻印（円環）
      g.strokeStyle = 'rgba(160,100,10,0.85)'; g.lineWidth = Math.max(0.6, ry*0.07);
      g.beginPath(); g.ellipse(p.sx, p.sy, rx*0.58, ry*0.58, 0, 0, Math.PI*2); g.stroke();
    }
    g.restore();
  }

  return { update, draw, spawnGroup, items(){ return bonusCoins; },
           reset(){ bonusCoins = []; combo = 0; comboT = 0; }, R };
})();
