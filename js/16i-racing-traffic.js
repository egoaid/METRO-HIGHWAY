// ════════════════════════════════════════════════
// VFD RACING — 他車の交通（右側通行 / 出現 / 追従・車線変更 / 衝突と揺れ）
//
// ルール
//  ・右側通行: 自車と同方向の車は道路の右半分(LANES_FWD)、対向車は左半分(LANES_ONC)。道路は4車線。
//  ・一部(ROGUE_P=12%)は違反車: 反対側の半分を走り、2〜4秒ごとに自由に車線を変える。
//    普通の車も、ごくまれに自分の側の中で車線を変える。
//  ・対向車の比率は 40% を目標に出現を調整する（少なすぎ/多すぎにならない）。
//  ・交通量（v1.4.0）: 出現は「時間」で決める（CFG.gap〜gap+jitter 秒に1台まで。端末のフレームレートに左右されない）。
//    同時に道路にいる台数の上限は CFG.maxBase + 距離レベル×CFG.maxPerLv。ハートで回復しながら長く遊べる程度に、
//    何も避けずに走り続けても衝突が毎秒のようには起きない量にしてある。
//  ・他車同士は重ならない: 出現時に空きを確認 / 前の車に合わせて減速 / 車線変更は空いている時だけ。
//    それでも触れた場合（違反車どうし等）は衝突として、揺れ・減速を起こし、重ならない位置へ離す。
//  ・衝突の揺れ（自車↔他車、他車↔他車 共通: kickCar）は次で変わる:
//      場所  : 車体の前後のどこに当たったか（端ほどヨー(向き)が大きく振れ、中央は横へ滑る）
//      速度  : 相対速度が大きいほど大きい
//      重量  : 当てた側の質量比。自車→トラックはほとんど揺れず、トラック→自車は大きく揺れ、
//              トラックどうし・乗用車どうしは通常。
//    星(無敵)中に自車が当てた他車は INV_BOOST 倍に揺れる。
// 公開: window.Traffic（spawn / update / visYaw）
// ════════════════════════════════════════════════
window.Traffic = (function(){
  const MASS = { ferrari328:0.9, f40:0.9, coupe:1.0, sedan:1.2, compact80:1.0, saloon80:1.2, executive80:1.4, truck:6.0 };
  const PLAYER_MASS = 0.9;                     // 自車 = ferrari328
  const mass = t => MASS[t] || 1;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const rr = (a, b) => a + Math.random()*(b - a);
  const ROGUE_P = 0.12, ONC_TARGET = 0.50;     // 対向車は道路上の約4割を目標（出現率の目標は高めに置く: 対向車は短時間で通り過ぎるため）
  // 交通量の設定（16b のループが出現間隔 gap/jitter を、spawn が台数の上限 maxBase/maxPerLv を使う）
  const CFG = { gap:1.6, jitter:1.0, maxBase:6, maxPerLv:1 };
  const HW_P = 0.164;                          // 自車の半幅(道路単位) = 312.5*1.05/ROADW
  const ALL_LANES = [-0.66, -0.22, 0.22, 0.66];
  const E_REST = 0.2;                          // 反発係数
  let nextId = 1;

  function geom(c){
    if(!c._g || c._gt !== c.carType){ const d = carWorldSize(c.carType); c._g = { len:d.len, hw:d.half/ROADW }; c._gt = c.carType; }
    return c._g;
  }
  function ensure(c){                          // テスト等で直接作られた車にも既定値を補う
    if(c.id === undefined) c.id = nextId++;
    if(c.cruise === undefined) c.cruise = c.ownSpd;
    if(c.tx === undefined) c.tx = c.x;
    if(c.slip === undefined){ c.slip = 0; c.slipV = 0; c.slideV = 0; c.steer = 0; }
    if(c.laneT === undefined) c.laneT = rr(4, 10);
    if(c.cool === undefined) c.cool = {};
    if(c.rogue === undefined) c.rogue = false;
  }
  // 2台の矩形(道路の横×奥行き)の重なり。px=横(ワールド単位), pz=奥行き。両方 >0 で重なっている
  function pen(a, b, shrink, mz, mx){
    const ga = geom(a), gb = geom(b);
    return {
      px: (ga.hw + gb.hw)*shrink*ROADW - Math.abs(a.x - b.x)*ROADW + (mx||0),
      pz: Math.min(a.z + ga.len, b.z + gb.len) - Math.max(a.z, b.z) + (mz||0),
    };
  }

  // ── 出現 ──
  function blocked(car){
    for(const o of traffic){ ensure(o); const p = pen(car, o, 1.0, 700, 0.06*ROADW); if(p.px > 0 && p.pz > 0) return true; }
    return false;
  }
  function spawn(){
    // 距離に応じた難易度レベル（0〜4）
    const distKm = game.dist/1000;
    const lv = distKm < 4 ? 0 : distKm < 6 ? 1 : distKm < 9 ? 2 : distKm < 13 ? 3 : 4;
    const maxCars = CFG.maxBase + lv*CFG.maxPerLv;
    if(traffic.length >= maxCars) return;

    // 車種（トラックは距離とともに少し増える。f40 は5%。残りを乗用車で分ける: 80年代の日本車セダン3種で64%、他の3種で36%）
    const truckW = Math.min(0.22, 0.12 + lv*0.025), rem = 1.0 - truckW - 0.05;
    const types = ['ferrari328','coupe','sedan','compact80','saloon80','executive80','truck','f40'];
    const share6 = [0.10, 0.12, 0.14, 0.22, 0.22, 0.20], weights = share6.map(w => w*rem).concat([truckW, 0.05]);
    let r = Math.random(), ti = 0;
    for(let i = 0; i < weights.length; i++){ r -= weights[i]; if(r <= 0){ ti = i; break; } }
    const ct = types[ti];

    // 対向車の比率を目標(40%)へ寄せる: 少なければ出やすく、多ければ出にくく
    let nOnc = 0; for(const c of traffic) if(c.oncoming) nOnc++;
    const share = traffic.length >= 4 ? nOnc/traffic.length : ONC_TARGET;
    const pOnc = clamp(ONC_TARGET + (0.42 - share)*1.5, 0.2, 0.7);
    const oncoming = Math.random() < pOnc;
    const rogue = Math.random() < ROGUE_P;

    const ownSpd = ct === 'truck' ? (oncoming ? 40 + Math.random()*40 : 30 + Math.random()*40)
                 : oncoming       ? 70 + Math.random()*80
                 : ct === 'f40'   ? 120 + Math.random()*80
                 :                  20 + Math.random()*100;

    // 出現位置: 自車より遅い同方向車/対向車は奥から、自車より速い同方向車は画面の下の外(後方)から
    let absZ;
    if(oncoming || ownSpd < player.speed) absZ = cam.pos + DRAW*SEGZ + SEGZ*2;
    else absZ = cam.pos + carBehindSpawnRelZ(ct);

    // 車線: 右側通行。違反車は反対側の半分に出る
    const lanes = (oncoming !== rogue) ? LANES_ONC : LANES_FWD;
    const x = lanes[Math.random() < 0.5 ? 0 : 1];

    // 色: f40/トラックは固定。80年代セダンは車種ごとの色（白や暗すぎる色は夜の道で見えないので使わない）で、車種を見分けやすくする
    const SEDAN_COLS = { compact80:['#ffd020','#20d0b0','#ff8a20'], saloon80:['#d02050','#2a70e0','#a050ff'], executive80:['#18a868','#d8a840','#5080b0'] };
    const pal = SEDAN_COLS[ct] || NEON;
    const col = ct === 'f40' ? '#ff40a0' : ct === 'truck' ? '#e08020' : pal[Math.floor(Math.random()*pal.length)];
    const car = { id:nextId++, z:absZ, x, tx:x, ownSpd, cruise:ownSpd, col, carType:ct, oncoming, rogue,
                  heading: oncoming ? Math.PI : 0, viewAngle:0, hitTimer:0, avoidsPlayer:false,
                  passed:(absZ - cam.pos) < PLAYER_Z,
                  slip:0, slipV:0, slideV:0, steer:0, laneT: rogue ? rr(1.5, 4) : rr(8, 16), cool:{} };
    if(blocked(car)) return;                   // 他車と重なる位置には出さない
    traffic.push(car);
  }

  // ── 衝突の揺れ ──
  // 重量: 当てた側の質量比 (mH/(mH+mS))^1.5 を、同質量=1 に正規化。上限 2.5。
  //   自車(0.9)→トラック(6): 0.1  / トラック→自車: 約2.1 / 同質量: 1
  function massFactor(mHit, mSelf){ return Math.min(2.5, Math.pow(mHit/(mHit + mSelf), 1.5)/0.35355); }
  // 速度: 相対速度(km/h換算) 90 で 1。0.35〜2.0
  function speedFactor(rel){ return clamp(rel/90, 0.35, 2.0); }
  // 衝突でできる揺れ（ヨー角速度 yaw[rad/s]・横速度 slide）。
  //   dir : 自分が押される向き(+1=右) / u : 自分の車体のどこに当たったか(-1=後端 … +1=前端、ワールドZ向き)
  //   トルク ∝ u*dir（端に当たるほどヨーが大きい。中央は横へ滑る）。lat: 横から当たったほど大きい
  function kickFor(dir, u, rel, mHit, mSelf, lat, boost){
    const k = speedFactor(rel)*massFactor(mHit, mSelf)*(boost||1);
    return {
      // 端に当たるほどトルクが大きい(±u 対称)。中央でも少しだけ押された向きへ振れる(1-|u|で消える)
      yaw:   clamp(SLIP_KICK*k*lat*(0.9*u*dir + 0.2*dir*(1 - Math.abs(u))), -7, 7),
      slide: clamp(SLIDE_KICK*k*lat*(1 - 0.4*Math.abs(u))*dir, -3, 3),
    };
  }
  function kickCar(c, dir, u, rel, mHit, lat, boost){
    const k = kickFor(dir, u, rel, mHit, mass(c.carType), lat, boost);
    c.slipV += k.yaw; c.slideV += k.slide;
  }
  // 速度の受け渡し（正面・追突の衝突）。符号付き速度 v(+=Z+)。後ろの車 R と前の車 F。戻り値は新しい v
  function exchange(vR, vF, mR, mF, scaleR, scaleF){
    const closing = vR - vF; if(closing <= 0) return null;
    const jn = (1 + E_REST)*closing/(1/mR + 1/mF);
    return { vR: vR - scaleR*jn/mR, vF: vF + scaleF*jn/mF };
  }
  const setSpd = (c, v) => { c.ownSpd = Math.max(5, c.oncoming ? -v : v); };
  const sv = c => (c.oncoming ? -1 : 1)*c.ownSpd;

  // 他車どうしの衝突
  function carCar(a, b, p){
    const ga = geom(a), gb = geom(b), ma = mass(a.carType), mb = mass(b.carType);
    const fresh = !(a.cool[b.id] > 0);
    if(fresh){
      const zc = (Math.max(a.z, b.z) + Math.min(a.z + ga.len, b.z + gb.len))/2;
      const uA = clamp(((zc - a.z)/ga.len)*2 - 1, -1, 1), uB = clamp(((zc - b.z)/gb.len)*2 - 1, -1, 1);
      const dirA = a.x === b.x ? (a.id < b.id ? -1 : 1) : Math.sign(a.x - b.x), dirB = -dirA;
      const va = sv(a), vb = sv(b), rel = Math.abs(va - vb);
      const lat = 0.35 + 0.65*clamp(Math.abs(a.x - b.x)/(ga.hw + gb.hw), 0, 1);
      kickCar(a, dirA, uA, rel, mb, lat, 1);
      kickCar(b, dirB, uB, rel, ma, lat, 1);
      if(p.pz < 0.5*Math.min(ga.len, gb.len)){            // 追突・正面衝突: 速度も受け渡す
        const rear = a.z < b.z ? a : b, front = rear === a ? b : a;
        const ex = exchange(sv(rear), sv(front), mass(rear.carType), mass(front.carType), 1, 1);
        if(ex){ setSpd(rear, ex.vR); setSpd(front, ex.vF); }
      }
      a.cool[b.id] = 0.5; b.cool[a.id] = 0.5;
    }
    separate(a, b);
  }

  // 重ならない位置へ離す（軽い方がより動く）。浅い軸で離し、道路の端などで横に動けなければ前後へ離す。
  function separate(a, b){
    const ma = mass(a.carType), mb = mass(b.carType), wa = mb/(ma + mb), wb = ma/(ma + mb);
    for(let it = 0; it < 3; it++){
      const q = pen(a, b, 1.0); if(q.px <= 0 || q.pz <= 0) return;
      if(it === 0 && q.px < q.pz){
        const sft = (q.px + 3)/ROADW, dA = Math.sign(a.x - b.x) || (a.id < b.id ? -1 : 1);
        a.x = clamp(a.x + dA*sft*wa, -0.92, 0.92); b.x = clamp(b.x - dA*sft*wb, -0.92, 0.92);
      }else{
        const sft = q.pz + 3;                                   // 前後へ（後ろの車を下げ、前の車を進める）
        if(a.z < b.z){ a.z -= sft*wa; b.z += sft*wb; } else { a.z += sft*wa; b.z -= sft*wb; }
      }
    }
  }

  // 自車（PLAY=自車 / DEMO=デモ車）の車体から他車を押し出す（v1.4.0）。
  // 衝突した後も、車体が自車に食い込んだままになって「重なって見える」のを防ぐ。自車は動かさず、他車だけを
  // 浅い軸で離す（横に離せる時は横へ、そうでなければ前後へ）。他車どうしの重なりは次フレームの 2) で解消される。
  function pushFromPlayer(c, g){
    const relZ = c.z - cam.pos;
    const px = (g.hw + HW_P)*ROADW - Math.abs(c.x - player.x)*ROADW;
    const pz = Math.min(relZ + g.len, PLAYER_Z + PLAYER_LEN) - Math.max(relZ, PLAYER_Z);
    if(px <= 0 || pz <= 0) return false;
    if(px < pz){ c.x = clamp(c.x + (Math.sign(c.x - player.x) || 1)*(px + 3)/ROADW, -0.92, 0.92); }
    else{
      const ahead = relZ + g.len/2 >= PLAYER_Z + PLAYER_LEN/2;
      c.z += (ahead ? 1 : -1)*(pz + 3);
      // 前の車に押し付けている間、自車はその車より速く進めない（突き抜けて食い込み続けない）
      if(ahead && !c.oncoming && !(player.inv > 0)) player.speed = Math.min(player.speed, Math.max(0, sv(c)));
    }
    return true;
  }

  // 自車と他車の衝突
  function carPlayer(c, relZ, g){
    const inv = player.inv > 0, mc = mass(c.carType);
    const zlo = Math.max(relZ, PLAYER_Z), zhi = Math.min(relZ + g.len, PLAYER_Z + PLAYER_LEN), zc = (zlo + zhi)/2;
    const uC = clamp(((zc - relZ)/g.len)*2 - 1, -1, 1), uP = clamp(((zc - PLAYER_Z)/PLAYER_LEN)*2 - 1, -1, 1);
    const dirP = Math.sign(player.x - c.x) || 1, dirC = -dirP;
    const vP = player.speed, vC = sv(c), rel = Math.abs(vP - vC);
    const lat = 0.35 + 0.65*clamp(Math.abs(c.x - player.x)/(g.hw + HW_P), 0, 1);
    // 他車の揺れ（無敵中は INV_BOOST 倍）
    kickCar(c, dirC, uC, rel, PLAYER_MASS, lat, inv ? INV_BOOST : 1);
    // 追突・正面衝突は速度も受け渡す（自車は6割、無敵なら自車は減速しない・相手は1.6倍に弾かれる）
    if(zhi - zlo < 0.5*Math.min(g.len, PLAYER_LEN)){
      const carAhead = relZ > PLAYER_Z;
      const ex = carAhead ? exchange(vP, vC, PLAYER_MASS, mc, inv ? 0 : 0.6, inv ? 1.6 : 1)
                          : exchange(vC, vP, mc, PLAYER_MASS, inv ? 1.6 : 1, inv ? 0 : 0.6);
      if(ex){
        if(carAhead){ player.speed = Math.max(0, ex.vR); setSpd(c, ex.vF); }
        else        { setSpd(c, ex.vR); player.speed = Math.max(0, ex.vF); }
      }
    }
    // 自車の揺れとダメージ（takeDamage が無敵・無敵時間を判定）
    takeDamage(dirP, kickFor(dirP, uP, rel, mc, PLAYER_MASS, lat, 1));
    c.hitTimer = 40;
  }

  // 描画用の車体のヨー(ワールド): 衝突の揺れ + 車線変更の舵
  //  slip>0 = +Z側の端が +X へ向く。前進車は鼻先=+Z端、対向車は鼻先=-Z端なので舵だけ符号が逆。
  function visYaw(c){ return (c.slip || 0) + (c.oncoming ? -(c.steer || 0) : (c.steer || 0)); }

  // ── 毎フレームの更新 ──
  // 障害物: 他車すべて + デモ中は自車（衝突しないデモで、他車が自車を幽霊のようにすり抜けて見えるのを防ぐ。
  // PLAY 中は自車を前走車として扱わない: 停止中の自車に後ろから追いつけば衝突するし、速い車は後ろから追い越していく）
  function obstacles(){
    if(mode !== MODE.DEMO) return traffic;
    const proxy = { id:-1, z:cam.pos + PLAYER_Z, x:player.x, ownSpd:player.speed, oncoming:false, carType:'ferrari328', cool:{} };
    return traffic.concat([proxy]);
  }
  function laneClear(c, tx, ahead, obs){
    const g = geom(c);
    for(const o of (obs || traffic)){
      if(o === c) continue; const go = geom(o);
      if(Math.abs(o.x - tx) > g.hw + go.hw + 0.05) continue;
      if(o.z + go.len > c.z - 800 && o.z < c.z + g.len + ahead) return false;
    }
    return true;
  }

  function resolveCars(list){
    for(let pass = 0; pass < 4; pass++){
      let any = false;
      for(let i = 0; i < list.length; i++) for(let j = i + 1; j < list.length; j++){
        const a = list[i], b = list[j], p = pen(a, b, 1.0);
        if(p.px > 0 && p.pz > 0){ carCar(a, b, p); any = true; }
      }
      if(!any) break;
    }
  }

  // 隣の車線へ逃げる（自分が走れる車線の中で、今の車線に最も近い空いている車線）。逃げられたら true
  // force=true は空き確認をしない（詰まって動けない時の最後の手段）
  function sidestep(c, obs, ahead, force){
    const lanes = c.rogue ? ALL_LANES : (c.oncoming ? LANES_ONC : LANES_FWD);
    // 正面から来る車どうしが同じ車線へ逃げて向き合い続けないよう、「自分の進行方向の右側」を先に選ぶ
    // （同じ向きなら +x 側、対向車は -x 側。右側通行なので、すれ違う2台は互いに逆の側へ逃げる）
    const right = c.oncoming ? -1 : 1;
    const cands = lanes.filter(x => Math.abs(x - c.x) > 0.1)
      .sort((a, b) => ((Math.sign(a - c.x) === right ? 0 : 10) + Math.abs(a - c.x)) - ((Math.sign(b - c.x) === right ? 0 : 10) + Math.abs(b - c.x)));
    for(const tx of cands) if(force || laneClear(c, tx, ahead, obs)){ c.tx = tx; return true; }
    return false;
  }

  function update(dt){
    const list = traffic;
    for(const c of list) ensure(c);
    const obs = obstacles();

    // 1) 運転: 追従(前の車に合わせて減速) / 車線変更 / 位置と揺れの積分
    for(const c of list){
      const g = geom(c), dirS = c.oncoming ? -1 : 1;
      let lead = null, gapMin = 1e9;
      for(const o of obs){
        if(o === c || o.oncoming !== c.oncoming) continue;                 // 同じ進行方向だけ
        const go = geom(o); if(Math.abs(o.x - c.x) > (g.hw + go.hw)*1.05) continue;
        const gap = c.oncoming ? (c.z - (o.z + go.len)) : (o.z - (c.z + g.len));
        if(gap > -100 && gap < gapMin){ gapMin = gap; lead = o; }
      }
      let target = c.cruise;
      if(lead){
        const safe = 300 + c.ownSpd*CAM_SCALE*0.7;
        if(gapMin < safe){ const k = clamp((gapMin - 100)/(safe - 100), 0, 1); target = Math.min(target, lead.ownSpd*(0.80 + 0.20*k)); }
      }
      c.ownSpd += clamp(target - c.ownSpd, -90*dt, 25*dt);                  // 減速は強く、加速は穏やかに

      // 渋滞を作らないための3つの決まり（v1.5.1）。以前は逆向きの車は「見えない」扱いで、
      //   逆走気味の車と対向車が同じ車線で正面衝突 → お互い時速5kmで押し合ったまま動かない、が起きていた。
      // (a) 同じ車線で向かってくる逆向きの車が近づいたら、先に隣の車線へよける
      c.dodgeCool = (c.dodgeCool || 0) - dt;
      if(c.dodgeCool <= 0){
        for(const o of obs){
          if(o === c || o.oncoming === c.oncoming) continue;
          const go = geom(o); if(Math.abs(o.x - c.x) > (g.hw + go.hw)*1.05) continue;
          const gapH = c.oncoming ? (c.z - (o.z + go.len)) : (o.z - (c.z + g.len));
          const closing = (SpeedFx.vis(c.ownSpd) + SpeedFx.vis(Math.abs(sv(o))))*CAM_SCALE;      // 近づく速さ(ワールド/秒)
          if(gapH > -100 && gapH < closing*1.8 + 500){ c.dodgeCool = 1.0; sidestep(c, obs, 1500, false); break; }
        }
      }
      // (b) 他車とぶつかった直後は、隣の車線へ抜ける
      if(c.dodgeCool <= 0 && Object.keys(c.cool).length){ c.dodgeCool = 1.0; sidestep(c, obs, 1200, false); }
      // (c) 速度が巡航の35%未満の状態が3秒続いたら、空きを見ずに隣の車線へ。8秒続いたら消す（最後の手段）
      c.stall = (c.ownSpd < 0.35*c.cruise) ? (c.stall || 0) + dt : 0;
      if(c.stall > 3 && c.dodgeCool <= 0){ c.dodgeCool = 1.5; sidestep(c, obs, 0, true); c.ownSpd = Math.max(c.ownSpd, 0.5*c.cruise); }

      // 遅い前走車に詰まったら、空いていれば隣の車線へ移って追い越す（自分の側の半分の中で）
      c.passCool = (c.passCool || 0) - dt;
      if(lead && c.passCool <= 0 && gapMin < 300 + c.ownSpd*CAM_SCALE*0.5 && lead.ownSpd < c.cruise - 8){
        c.passCool = 3;
        const lanes = c.rogue ? ALL_LANES : (c.oncoming ? LANES_ONC : LANES_FWD);
        const tx = lanes.filter(x => Math.abs(x - c.tx) > 0.1).sort((a, b) => Math.abs(a - c.tx) - Math.abs(b - c.tx))[0];
        if(tx !== undefined && laneClear(c, tx, 1800, obs)) c.tx = tx;
      }

      c.laneT -= dt;
      if(c.laneT <= 0){
        c.laneT = c.rogue ? rr(1.5, 4.0) : rr(8, 16);
        if(c.rogue || Math.random() < 0.35){
          const lanes = c.rogue ? ALL_LANES : (c.oncoming ? LANES_ONC : LANES_FWD);
          const cands = lanes.filter(x => Math.abs(x - c.tx) > 0.1).sort((a, b) => Math.abs(a - c.tx) - Math.abs(b - c.tx));
          if(cands.length){
            const tx = cands[Math.random() < 0.7 ? 0 : cands.length - 1];
            if(laneClear(c, tx, c.rogue ? 2500 : 1500, obs)) c.tx = tx;
          }
        }
      }
      const dx = c.tx - c.x, step = 0.26*dt;
      c.x += clamp(dx, -step, step);
      c.steer = clamp(dx*1.2, -0.1, 0.1);

      c.z += dirS*SpeedFx.vis(c.ownSpd)*dt*CAM_SCALE;
      // 揺れ: ヨーは減衰ばね、横は指数減衰（自車と同じ定数）
      c.slipV += (-SLIP_K*c.slip - SLIP_C*c.slipV)*dt; c.slip += c.slipV*dt;
      c.x = clamp(c.x + c.slideV*dt, -0.92, 0.92); c.slideV *= Math.exp(-SLIDE_DECAY*dt);
      if(Math.abs(c.slip) < 0.002 && Math.abs(c.slipV) < 0.02 && Math.abs(c.slideV) < 0.005){ c.slip = 0; c.slipV = 0; c.slideV = 0; }
      for(const k in c.cool){ c.cool[k] -= dt; if(c.cool[k] <= 0) delete c.cool[k]; }
    }

    // 2) 他車どうしの衝突（玉突きで連鎖して重なることがあるので、重なりが無くなるまで数回繰り返す。
    //    揺れ・速度の受け渡しは各ペア 0.5秒に1回だけ(cool)）
    resolveCars(list);

    // 3) 自車との衝突・追い越し・消滅
    traffic = list.filter(car => {
      const relZ = car.z - cam.pos;
      car.viewAngle = Math.atan2(car.x*ROADW, relZ);
      const g = geom(car);

      // 消滅: 追い越されても、画面の下へ完全に出る(前端が下端の外)まで消さない / 描画限界の外へ離れた
      if(relZ + g.len < carCullFrontZ(car.carType)) return false;
      if(relZ > DRAW*SEGZ + SEGZ*3) return false;
      if(car.stall > 8) return false;                                       // 8秒以上動けない車は消す（最後の手段）

      // 追い越し(PASS!): 自車の後端より完全に後ろへ下がった時に1回だけ
      if(!car.oncoming){
        if(!car.passed && relZ + g.len < PLAYER_Z){ car.passed = true; if(mode === MODE.PLAY){ playPassSound(); addLog('PASS!'); } }
        else if(car.passed && relZ > PLAYER_Z + PLAYER_LEN) car.passed = false;
      }

      // 自車との衝突: 描画と同じ基準（車体の長さが重なり、横も重なった）
      // 同じ向きで速度がほぼ同じ（押し付けて並走しているだけ）なら、新たな衝突にはしない（毎回ダメージを受けないように）
      if(mode === MODE.PLAY && !car.hitTimer && carTouchesPlayer(relZ, car.carType) && Math.abs(player.speed - sv(car)) > 6){
        if(Math.abs(car.x - player.x) < (g.hw + HW_P)*0.85) carPlayer(car, relZ, g);
      }
      if(car.hitTimer > 0) car.hitTimer--;
      return true;
    });
    // 4) 自車（デモ車）の車体から他車を押し出す。押し出した車が前の車に食い込むことがあるので、
    //    そのたびに他車どうしを離し直す（数回で収まる。前方は空いているので前の車がさらに進める）
    if(mode === MODE.PLAY || mode === MODE.DEMO){
      for(let it = 0; it < 3; it++){
        let moved = false;
        // PLAY では「もう衝突した車（hitTimer>0）」と「横がかすっただけで衝突にならない車（横の重なりが15%未満）」を押し出す。
        // 衝突になる車を接触の前に押し出すと衝突が起きなくなるので、それは除く
        for(const c of traffic){ const g = geom(c);
          if((mode === MODE.DEMO || c.hitTimer > 0 || Math.abs(c.x - player.x) >= (g.hw + HW_P)*0.85) && pushFromPlayer(c, g)) moved = true; }
        if(!moved) break;
        resolveCars(traffic);
      }
    }
  }

  return { spawn, update, visYaw, CFG, pushFromPlayer, massFactor, speedFactor, kickFor, exchange, overlapAny: list => {
    for(let i = 0; i < list.length; i++) for(let j = i + 1; j < list.length; j++){
      ensure(list[i]); ensure(list[j]); const p = pen(list[i], list[j], 1.0); if(p.px > 0 && p.pz > 0) return [list[i], list[j]];
    } return null; }, MASS };
})();
