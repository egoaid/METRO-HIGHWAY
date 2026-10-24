// ── デモの自動運転の状態 ──
// 目標は「レーン」（自車線=右半分の2レーン 0.22 / 0.66）。切り替えは最低 DEMO_LANE_HOLD 秒あけてヒステリシスを持たせ、
// 目標は低域通過で滑らかにして、臨界減衰のばねで追従する。これで左右の小刻みな揺れが出ない。
const DEMO_LANE_HOLD=2.0;
let demoLane=0.66, demoLaneT=0, demoTgtS=0.66, demoVx=0;
function frame(t){
  if(!enabled)return;
  rafId=requestAnimationFrame(frame);
  if(typeof Roadside==='undefined'||typeof Hologram==='undefined'||typeof SpeedFx==='undefined'||typeof Traffic==='undefined'||typeof StarBonus==='undefined'||typeof HeartBonus==='undefined'||typeof CoinBonus==='undefined'||typeof Garage==='undefined')return; // 16f/16h/16i/16j/16k/16l/16m が読み込み中の間は描かない
  if(t-lastT<33)return;
  const dt=Math.min((t-lastT)/1000,0.08);
  lastT=t;
  // W/H がまだ0なら再試行（wkhtmltoimage ではlayout遅延があるため）
  if(!W||!H){resize();if(!W||!H)return;}

  const bpm=getBpm();
  const curSeg=course[Math.floor(cam.pos/SEGZ)%SEG]||{curve:0,terrain:'city'};

  // ══ 物理更新 ══
  if(mode===MODE.PLAY){
    // ── 縦速度 ──
    // 走行性能は、ガレージで選んだ車の値（16l の CARS）。最高速・加速・ブレーキ・ハンドル・グリップが車ごとに違う。
    const S=Garage.stats();
    if(keys.U) player.speed=Math.min(S.vmax,player.speed+S.accel*dt);
    else if(keys.D) player.speed=Math.max(0,player.speed-S.brake*dt);
    else player.speed=Math.max(0,player.speed-SPD_DRAG*dt);

    // ── 横操舵（直接 x 操作モデル）──
    // xv の蓄積をやめ、キー押下中だけ x を動かす。
    // キーを離したら即座に停止 → 「少し押す = 少し動く」が線形で予測可能。
    // 速度依存: 高速ほど同じキー時間で多く動く。
    // STEER_RATE=0.35/sec @ 最高速 → 最高速で端まで約2.6秒。
    const STEER_RATE = 0.35;
    const sr = player.speed / Garage.SPD_REF;          // 操舵・カーブは基準速度 220km/h に対する比（速い車ほど大きくなる）
    // steerInput: キーボードは ±1、ジョイスティックは -1〜+1 のアナログ値
    let steerInput = 0;
    if(player.speed > 5){
      steerInput = Math.max(-1, Math.min(1, (keys.R?1:0) - (keys.L?1:0) + keys.ax));
      player.x += STEER_RATE * S.handling * sr * dt * steerInput;
    }

    // ── カーブによる横ドリフト ──
    // プレイヤーが走行中のセグメントのカーブ値を直接 x に加算。
    // speedFactor MAX=0.25 → 最高速+最大カーブで路端まで約7秒。
    // 操舵力(0.35/s) はドリフト(最大0.125/s)の約2.8倍なので
    // ハンドルで十分打ち消せる。
    if(player.speed > 5){
      // v1.6.0: 流れは速度の2乗に比例（以前は比例）。グリップが高いほど流されにくい。高速でカーブに入るほどきつくなる
      player.x += curSeg.curve * Garage.CURVE_K * sr * sr / S.grip * dt;
    }

    player.x = Math.max(-0.98, Math.min(0.98, player.x));

    // xv はバンク計算のためだけに維持（実際の位置更新には使わない）
    player.xv = steerInput * STEER_RATE * S.handling * sr;

    // ── バンク ──
    player.bank += (-(player.xv * 0.45) - player.bank) * 0.12;
    player.bank = Math.max(-0.45, Math.min(0.45, player.bank));

    // ── 路肩ペナルティ（段階的）──
    const ax = Math.abs(player.x);
    if(ax > 0.90){
      player.speed = Math.max(0, player.speed - 40 * dt);
      if(ax > 0.97) takeDamage(-Math.sign(player.x)); // 中央側へ戻す
    }

    game.dist += player.speed * dt / 3.6;
    if(game.hitTimer > 0) game.hitTimer--;

  } else if(mode===MODE.DEMO){
    // ── デモ: BPM連動速度 + 自然な自動運転 ──
    // 旧実装は curve をそのまま xv に積分していたため、カーブが続くと
    // xv が符号反転するまで際限なく蓄積し、端(±0.85)に張り付いては
    // 反対側へ振れる「暴れた」挙動になっていた（xv自体はdt非依存の
    // フレーム毎加算のため、実質的な減衰が効く前に飽和していた）。
    // 今回は「目標レーン位置 demoTargetX」を先に決め、そこへ
    // ばね/減衰(xv)で滑らかに追従させる方式に変更。目標自体が
    // 常に穏当な範囲(±0.65)に収まるため、暴れる余地がない。
    const tgt=(bpm/120)*110;
    player.speed+=(tgt-player.speed)*0.04;

    // ── 目標レーン（右側通行: 自車線の2レーンのどちらか）──
    // 以前は毎フレーム「カーブの段差」と「避ける向き(相手の横位置で反転)・強さ(距離で連続変化)」から
    // 目標を作り直していたため、目標が小刻みに揺れ、車体の傾き(bank)も揺れて見えた。
    demoLaneT += dt;
    const laneBlocked=(x,fromSeg,toSeg)=>traffic.some(car=>{
      const ahead=(car.z-cam.pos-PLAYER_Z)/SEGZ;
      return ahead>fromSeg&&ahead<toSeg&&Math.abs(car.x-x)<0.26;
    });
    if(demoLaneT>DEMO_LANE_HOLD&&laneBlocked(demoLane,0.3,8)){
      const other=demoLane>0.44?0.22:0.66;
      if(!laneBlocked(other,-2.5,9)){demoLane=other;demoLaneT=0;}   // 空いている方へ1回だけ移る
    }
    // カーブには僅かだけ内側へ寄る。目標自体を低域通過（約0.6秒）して段差を消す
    const rawTgt=Math.max(-0.7,Math.min(0.7,demoLane-curSeg.curve*0.10));
    demoTgtS+=(rawTgt-demoTgtS)*Math.min(1,dt*1.6);
    // 臨界減衰のばね（K=6, C=2√K）。速度[1/s]で積分し、player.xv(1フレームあたり)へ変換
    demoVx+=(6*(demoTgtS-player.x)-4.9*demoVx)*dt;
    demoVx=Math.max(-0.9,Math.min(0.9,demoVx));
    player.x=Math.max(-0.7,Math.min(0.7,player.x+demoVx*dt));
    player.xv=demoVx*dt;
    player.bank += (-(player.xv*16) - player.bank) * 0.12;
    player.bank = Math.max(-0.35, Math.min(0.35, player.bank));
    // ── 衝突判定なし ──
    // デモ中は道端(player.x)や他車と重なっても takeDamage() 等は
    // 一切呼ばれない。当たり判定は PLAY 分岐にのみ実装されている。

  } else { // OVER
    player.speed=Math.max(0,player.speed-SPD_BRAKE*dt);
    game.overTimer++;
  }

  // 見かけの進行速度（SpeedFx.vis: 120km/h超を1.5倍）。表示速度・走行距離は物理のまま。他車も同じ関数を通す。
  cam.pos+=SpeedFx.vis(player.speed)*dt*CAM_SCALE;

  // ── 衝突スリップ更新（横滑り: ヨーの振れ + 横への流れ。横転はしない）──
  if(player.slip!==0||player.slipV!==0||player.slideV!==0){
    // ヨー: 減衰ばねで0へ戻る（半陰的オイラー）
    player.slipV += (-SLIP_K*player.slip - SLIP_C*player.slipV)*dt;
    player.slip  += player.slipV*dt;
    // 横: 指数減衰しながら流れる。路肩ペナルティ域へは入れない（内向きの移動は常に許可）
    const nx = player.x + player.slideV*dt;
    if(Math.abs(nx)<=SLIDE_LIMIT || Math.abs(nx)<Math.abs(player.x)) player.x = nx;
    else player.slideV = 0;
    player.slideV *= Math.exp(-SLIDE_DECAY*dt);
    if(Math.abs(player.slip)<0.002 && Math.abs(player.slipV)<0.02 && Math.abs(player.slideV)<0.005){
      player.slip=0; player.slipV=0; player.slideV=0;
    }
    // 横滑り中は速度も少し落とす
    if(Math.abs(player.slip)>0.03) player.speed=Math.max(0,player.speed-SPD_BRAKE*0.4*dt);
  }

  // ══ 交通スポーン ══
  // 出現は時間で決める（秒）。以前はフレーム数だったため、端末が重くてフレームが落ちると交通量まで減って、速度感が端末ごとに違った。
  // 次の出現までの間隔 = Traffic.CFG.gap 〜 gap+jitter 秒（spawnTick は経過秒。負の値からのカウントで揺らぎを付ける）
  spawnTick+=dt;
  if(spawnTick>Traffic.CFG.gap){spawnTick=-Math.random()*Traffic.CFG.jitter;spawnCar();}

  // ══ 交通更新 ══
  // 右側通行・追従・車線変更・違反車・衝突と揺れ・追い越し/消滅は 16i-racing-traffic.js
  Traffic.update(dt);

  // ══ 星のボーナス・無敵 ══（16j-racing-star.js）
  if(mode===MODE.PLAY) StarBonus.update(dt,t);

  // ══ ハートの回復アイテム ══（16k-racing-heart.js）
  if(mode===MODE.PLAY) HeartBonus.update(dt,t);

  // ══ コイン ══（16m-racing-coin.js）
  if(mode===MODE.PLAY) CoinBonus.update(dt);

  updateEngineSound(player.speed, mode===MODE.PLAY?Garage.stats().vmax:SPD_MAX);
  drawScene(t,bpm);
  if(mode===MODE.OVER)drawGameOver();
}

// ════════════════════════════════════
// 描画
// ════════════════════════════════════
function drawScene(t,bpm){
  // シーン（道路・車・街並み）は枠 SH に描き、画面下端へ寄せる（縦長画面対策。16a の SCENE_AR_MAX を参照）。
  // drawWorld 中だけ H を枠の高さに差し替えるので、投影式(proj/_projWorld など)は H をそのまま使える。
  const realH=H;
  // 高速時は世界だけを縦に微振動させる（HUD は揺らさない）
  const shk=SpeedFx.shakeY(t,player.speed,Math.max(1,SH/540));
  g.save();g.translate(0,SY0+shk);H=SH;
  try{drawWorld(t,bpm);}finally{H=realH;g.restore();}

  // 被弾フラッシュ・HUD は実画面の座標で描く
  if(mode===MODE.PLAY&&game.hitTimer>70){
    g.fillStyle=`rgba(255,0,0,${(game.hitTimer-70)*0.012})`;g.fillRect(0,0,W,H);
  }
  drawHUD(g,bpm);
  if(mode===MODE.DEMO)drawDemoOverlay(g);
  if(mode===MODE.PLAY||mode===MODE.OVER)drawGameHUD(g);
  drawLogs(g);
}

function drawWorld(t,bpm){
  // 地平線 = 道路の消失点(proj の H*0.5)。以前は空側だけ H*0.42 で、その差の黒い帯に
  // 遠景の構造物が乗って「接地面が地平線に固定」されて見えていた。
  const HY=Math.round(H*0.5);
  Hologram.update(t);                         // グリッチ/山脈の配色のスケジュール
  const EXT=SY0+6;                            // 上へ延長する空の高さ（振動の余白 6px を含む）
  // afterglow（縦長画面の延長した空・手前の路面も含めて消す。高速ほど残像が長い）
  g.fillStyle=`rgba(0,4,8,${SpeedFx.trailAlpha(player.speed)})`;g.fillRect(0,-EXT,W,HB+EXT+6);

  // 空（縦長画面では上へ延長）
  const sg=g.createLinearGradient(0,-EXT,0,HY);
  sg.addColorStop(0,'#000306');sg.addColorStop(1,'#010b12');
  g.fillStyle=sg;g.fillRect(0,-EXT,W,HY+EXT);

  // 星
  const nt=t*0.001;
  stars.forEach(s=>{
    const bv=0.38+0.62*Math.sin(nt*s.bs+s.b*6.28);
    g.beginPath();g.arc(s.x*W,s.y*(HY+EXT)-EXT,s.r,0,Math.PI*2);
    g.fillStyle=`rgba(93,240,200,${bv*(1-tunnelA)*0.75})`;g.fill();
  });

  // ── セグメント描画(遠→近) ──
  // フォワードパス: カメラ位置からDRAWセグメント先まで
  // 各セグメントの横オフセットをスクリーンピクセル単位で積算する。
  // dxA/cxA は 1/Z を掛けない直接スクリーン空間値。
  // これにより遠方の地平線が大きく曲がり、Out Run 的なスウィープが生まれる。
  const camSeg=Math.floor(cam.pos/SEGZ);
  const camFrac=cam.pos%SEGZ;
  const camPhase=cam.pos/SEGZ;
  const fwdCxA=new Array(DRAW+1).fill(0);
  {
    let fdx=0,fca=0;
    for(let n=0;n<=DRAW;n++){
      const idx=(camSeg+n)%SEG;
      const seg=course[idx]||{curve:0};
      fdx+=seg.curve*0.8;   // screen-space coefficient (0.032→0.8 で Out Run 級)
      fca+=fdx;
      fwdCxA[n]=fca;
    }
    // n=1 の道路中心オフセットをプレイヤー描画用に公開
    // (n=0 はカメラ位置そのもの = 0、n=1 が直前の地面)
    roadCenterOffsetPx = fwdCxA[1] || 0;
  }

  // ── 山脈（地平線背景）──
  // 「無限遠」よりさらに奥にあるという体で、道路自体のカーブオフセットの
  // ごく一部だけをパララックスとして与える（近景ほど大きく揺れると
  // 山が road と一緒に振り回されて見えてしまうため、係数を大きく絞る）。
  const farCurveTotal = fwdCxA[DRAW] || 0;
  // 山脈もホログラム: 配色が時々変わり、グリッチ時はずれ/ちらつきが入る（16h-racing-fx.js）
  const mf=Hologram.mountainFills(t);
  Hologram.paint(g,90010,0,HY-H*0.17,W,HY,()=>drawMountains(mountainsFar,  HY, H*0.17, farCurveTotal*0.06, mf.farTop,  mf.farBot));
  Hologram.paint(g,90011,0,HY-H*0.24,W,HY,()=>drawMountains(mountainsNear, HY, H*0.24, farCurveTotal*0.13, mf.nearTop, mf.nearBot));
  Hologram.overlay(g,W,-EXT,HY);              // グリッチ時の走査ノイズ（空の部分だけ）

  // 地平線より下の地面（描画距離より奥の部分。何も描かないと afterglow の黒が残る）
  g.fillStyle='#010609';g.fillRect(0,HY,W,HB-HY+6);

  // 地平線グロー（山の稜線に滲むように、山より後に重ねる）
  const hg=g.createLinearGradient(0,HY-4,0,HY+6);
  hg.addColorStop(0,'transparent');
  hg.addColorStop(0.5,`rgba(93,240,200,${0.18*(1-tunnelA*0.7)})`);
  hg.addColorStop(1,'transparent');
  g.fillStyle=hg;g.fillRect(0,HY-4,W,10);

  // バックワードパス: 遠→近の順に描画（ペインターズアルゴリズム）
  const slices=[];
  for(let n=DRAW;n>=0;n--){
    const idx=(camSeg+n)%SEG;
    const seg=course[idx]||{curve:0,terrain:'city',alt:0};
    const stripe=((Math.floor(n-camPhase)%2)+2)%2;
    const worldZ=n*SEGZ+(SEGZ-camFrac);
    const p=proj(worldZ,fwdCxA[n]);
    slices.unshift({n,seg,p,idx,cxA:fwdCxA[n],stripe});
  }

  const _lights=Roadside.collectLights();   // ヘッドライト光源（自車＋交通車）
  const _pools=[];                          // 路面の灯り（全セグメント描画後にまとめて描く）
  // slices[0] が最も近いセグメント（n=0）。ペインターズアルゴリズムのため遠→近へ走査する。
  // （以前は近→遠で、遠いセグメントの地面の塗りが手前の木・ビル・街灯の下半分を塗りつぶしていた）
  // 変数名 far/near は歴史的経緯で逆: far=slices[i](手前側の縁 y=fy), near=slices[i+1](奥側の縁 y=ny)。
  for(let i=slices.length-2;i>=0;i--){
    const far=slices[i],near=slices[i+1];
    if(!far.p||!near.p)continue;
    const fy=far.p.sy,ny=near.p.sy,fc=far.p.cx,nc=near.p.cx,fw=far.p.sw,nw=near.p.sw;
    if(fy>=HB+6&&ny>=HB+6)continue; // 両方画面外（描画下端 HB より下）
    const sc=far.p.scale;
    const alt=far.stripe;
    const tr=far.seg.terrain;

    // ── 道路 ──
    const roadC=alt
      ?(tr==='rural'?'#0a1808':'#050e1a')
      :(tr==='rural'?'#0c2010':'#071528');
    g.fillStyle=roadC;
    g.beginPath();
    g.moveTo(fc-fw,fy);g.lineTo(fc+fw,fy);
    g.lineTo(nc+nw,ny);g.lineTo(nc-nw,ny);
    g.closePath();g.fill();

    // 路肩
    g.fillStyle=tr==='rural'?'#122008':'#020508';
    g.beginPath();g.moveTo(0,fy);g.lineTo(fc-fw,fy);g.lineTo(nc-nw,ny);g.lineTo(0,ny);g.closePath();g.fill();
    g.beginPath();g.moveTo(W,fy);g.lineTo(fc+fw,fy);g.lineTo(nc+nw,ny);g.lineTo(W,ny);g.closePath();g.fill();

    // 縁石
    const kf=fw*0.07,kn=nw*0.07;
    const kc=tr==='rural'?(alt?'#ddd':'#999'):(alt?'#e03060':'#5df0c8');
    g.fillStyle=kc;
    g.beginPath();g.moveTo(fc-fw,fy);g.lineTo(fc-fw+kf,fy);g.lineTo(nc-nw+kn,ny);g.lineTo(nc-nw,ny);g.closePath();g.fill();
    g.beginPath();g.moveTo(fc+fw-kf,fy);g.lineTo(fc+fw,fy);g.lineTo(nc+nw,ny);g.lineTo(nc+nw-kn,ny);g.closePath();g.fill();

    // 路肩白線
    if(alt){
      g.strokeStyle='rgba(93,240,200,0.52)';g.lineWidth=Math.max(0.5,fw*0.025);
      g.beginPath();g.moveTo(fc-fw*0.88,fy);g.lineTo(nc-nw*0.88,ny);g.stroke();
      g.beginPath();g.moveTo(fc+fw*0.88,fy);g.lineTo(nc+nw*0.88,ny);g.stroke();
    }
    // センターライン破線
    if(!alt){
      g.strokeStyle='rgba(255,255,200,0.68)';g.lineWidth=Math.max(0.5,nw*0.026);
      g.beginPath();g.moveTo(fc,fy);g.lineTo(nc,ny);g.stroke();
    }
    // レーン分割
    if(alt){
      g.strokeStyle='rgba(93,240,200,0.16)';g.lineWidth=Math.max(0.4,nw*0.015);
      g.beginPath();g.moveTo(fc-fw*0.44,fy);g.lineTo(nc-nw*0.44,ny);g.stroke();
      g.beginPath();g.moveTo(fc+fw*0.44,fy);g.lineTo(nc+nw*0.44,ny);g.stroke();
    }
    // 横断歩道（信号機のあるセグメント）
    if(far.seg.xing)Roadside.drawCrosswalk(g,fc,fy,fw,nc,ny,nw);

    // ── 地面（道路・路肩）を描いた後に、その上に立つ構造物を描く ──
    // 構造物の接地点は手前側の縁 fy。上へ伸びて奥のセグメント（描画済み）に重なるのが正しい。
    // ── 環境オブジェクト ──
    envObjs.forEach(b=>{
      if(b.segIdx!==far.idx)return;
      // ピクセルサイズ = ワールドサイズ * scale * 補正
      // ROADW=2000がfw=ROADW*scale*(W/2)に相当
      // → 1ワールド単位 = scale*(W/2)/1 px
      // 幅は x 倍率(W/2)、高さは y 倍率(H/2)。地面の奥行き(sy)・車(_projWorld)と同じ式にそろえる。
      // （高さだけ W/2 で描くと、構造物が実際より背高になり、接地点との釣り合いが崩れる）
      const pxPerUnit=sc*(W*0.5);
      const pyPerUnit=sc*(H*0.5);
      const bwpx=b.ww*pxPerUnit;
      const bhpx=b.wh*pyPerUnit;
      // 遠景ほど小さく描画し、カメラが近づくにつれて滑らかに拡大させる
      // （以前は sc<0.0002 で描画距離の手前約2割しか使えておらず、
      //   遠くで小さく現れて徐々に大きくなる遠近感がほぼ無かった）。
      if(bwpx<0.5||bhpx<0.5)return;
      // 道路端（縁石を含む）の外側に配置。中心は「半幅」ぶん外へ（ビルは bx±bwpx、木は全幅 bwpx の半分）。
      // 以前は全種類 bwpx*0.5 だったため、ビルが道路側へ半幅ぶん食い込んでいた。
      const isTree=b.type==='tree';
      const bx=fc+b.side*roadsideCenterOffset(fw,isTree?bwpx*0.5:bwpx);
      const hid=b.id||(b.segIdx*2+(b.side>0?1:0));   // グリッチ乱数用の固定ID

      if(isTree){
        // ── 街路樹: 形状は Roadside.drawTree。ヘッドライトの当たり具合 L(0〜1) で明暗が変わる ──
        const zs=CAM_D/sc;
        const L=Roadside.lightAt(_lights,b.side*(ROADW+b.ww*0.5),zs);
        Hologram.paint(g,hid,bx-bwpx*0.5,fy-bhpx,bx+bwpx*0.5,fy,()=>Roadside.drawTree(g,b,bx,fy,bwpx,bhpx,sc,L));
      } else {
        // ── ビル: シルエット + セットバック + 窓グリッド + 屋上アンテナ（ホログラム）──
        Hologram.paint(g,hid,bx-bwpx,fy-bhpx*(1+(b.setback?b.setbackH:0)+(b.antenna?0.18:0)),bx+bwpx,fy,()=>{
        const bgr=g.createLinearGradient(bx-bwpx,fy-bhpx,bx+bwpx,fy);
        bgr.addColorStop(0,hexA(b.c1,Math.min(0.30,sc*200)));
        bgr.addColorStop(1,'rgba(2,6,12,0.97)');
        g.fillStyle=bgr;
        g.fillRect(bx-bwpx,fy-bhpx,bwpx*2,bhpx);

        let topY=fy-bhpx;
        let topHalfW=bwpx;
        if(b.setback){
          const sw=bwpx*b.setbackW, sh=bhpx*b.setbackH;
          const sgr=g.createLinearGradient(bx-sw,topY-sh,bx+sw,topY);
          sgr.addColorStop(0,hexA(b.c1,Math.min(0.34,sc*220)));
          sgr.addColorStop(1,'rgba(2,6,12,0.97)');
          g.fillStyle=sgr;
          g.fillRect(bx-sw,topY-sh,sw*2,sh);
          topY-=sh; topHalfW=sw;
        }

        // 屋上ラインのハイライト
        const roofA=Math.min(0.6,sc*260);
        if(roofA>0.02){
          g.strokeStyle=hexA(b.c1,roofA);
          g.lineWidth=Math.max(0.5,sc*220);
          g.beginPath();g.moveTo(bx-topHalfW,topY);g.lineTo(bx+topHalfW,topY);g.stroke();
        }

        // アンテナ（点滅する航空障害灯付き）
        if(b.antenna && sc>0.00035){
          const ah=bhpx*0.18;
          g.strokeStyle=hexA(b.c2,0.7);
          g.lineWidth=Math.max(0.5,sc*120);
          g.beginPath();g.moveTo(bx,topY);g.lineTo(bx,topY-ah);g.stroke();
          g.fillStyle='#ff3050';
          g.beginPath();g.arc(bx,topY-ah,Math.max(1,sc*400),0,Math.PI*2);g.fill();
        }

        // 窓グリッド（点灯パターンはbuildEnv()で確定済み — 毎フレーム同じ配置）
        // 点灯窓は「室内照明」を意識した暖色のぼんやりしたグロー表現。
        const cols=b.winCols, rows=b.fl;
        const winW=(bwpx*2*0.72)/cols;
        const winH=(bhpx*0.86)/rows;
        if(winW>1.1 && winH>1.1){
          const gapX=(bwpx*2-winW*cols)/(cols+1);
          const gapY=(bhpx*0.86-winH*rows)/(rows+1);
          const winTopY=fy-bhpx*0.94;
          for(let row=0; row<rows; row++){
            const wy=winTopY+gapY+row*(winH+gapY);
            if(wy < topY - winH) continue; // セットバックより上の窓は描かない
            for(let col=0; col<cols; col++){
              const wx=bx-bwpx+gapX+col*(winW+gapX);
              const lit=b.winLit[(row*cols+col)%b.winLit.length];
              if(lit){
                // ぼんやりした暖色の光暈（部屋の照明が漏れている感じ）
                const cx2=wx+winW*0.5, cy2=wy+winH*0.5;
                const glowR=Math.max(winW,winH)*1.7;
                const glow=g.createRadialGradient(cx2,cy2,0,cx2,cy2,glowR);
                glow.addColorStop(0,'rgba(255,214,150,0.55)');
                glow.addColorStop(1,'rgba(255,214,150,0)');
                g.fillStyle=glow;
                g.fillRect(cx2-glowR,cy2-glowR,glowR*2,glowR*2);
                g.fillStyle='rgba(255,224,175,0.82)';
                g.fillRect(wx,wy,winW,winH);
              } else {
                g.fillStyle='rgba(5,9,16,0.68)';
                g.fillRect(wx,wy,winW,winH);
              }
            }
          }
        }
        });
      }
    });

    // ── 街灯・信号機・反射ポスト ──
    const _rso=roadsideBySeg[far.idx];
    if(_rso)_rso.forEach(o=>{
      if(o.kind==='lamp'){
        // 街灯は道路の外の構造物なのでホログラム扱い（信号機・反射ポストは実体のある路上設備なので対象外）
        const lu=sc*(H*0.5), lx=fc+o.side*fw*1.06, lax=lx-o.side*o.arm*sc*(W*0.5);
        Hologram.paint(g,90100+o.segIdx*2+(o.side>0?1:0),Math.min(lx,lax)-3,fy-o.h*lu-60*lu,Math.max(lx,lax)+3,fy,
          ()=>Roadside.drawLamp(g,o,fc,fy,fw,sc));
        _pools.push({o,fc,fy,fw,sc});
      }else if(o.kind==='post') Roadside.drawPost(g,o,fc,fy,fw,sc);
      else Roadside.drawSignal(g,o,fc,fy,fw,sc,t);
    });

  }

  // 街灯が路面に落とす灯り（遠→近の順）
  _pools.forEach(q=>Roadside.drawPool(g,q));

  // ── スピードライン（高速時のみ。消失点から左右へ放射。車より後ろの層）──
  {
    const vp=slices[slices.length-1].p;
    SpeedFx.drawStreaks(g,W,H,vp?vp.cx:W*0.5,HY,t,player.speed);
  }

  // ── 交通車両 ──
  // 全セグメント描画後にまとめて描く（道路による上書き防止）。
  // 画面に見えている間は描く（carOffscreen）。追い越された車は自車より下へ下がっても消えず、
  // 画面の下へ出きってから（更新処理で）取り除かれる。後方から来る車は画面の下の外から現れる。
  // 自車より手前(relZ<PLAYER_Z)の車は自車の手前にあるので、自車より「後」に描く。
  // road と完全に同一の _projWorld()/WORLD_CAR_HALF_W を使うため、road 由来のスクリーン座標は経由しない。
  // 渡すのはワールド座標(Xw=car.x*ROADW, Zw=relZ)と curve オフセット(cxAcc)のみ。
  {
    const sliceMap = new Map();
    slices.forEach(s => { sliceMap.set(s.n, s.cxA); });

    // 描く物（他車と星）を奥行き順に。自車(PLAYER_Z)より手前のものは自車より後に描く
    const farList=[], nearList=[];
    const items=[];
    traffic.forEach(car=>{
      const relZ = car.z - cam.pos;
      if(relZ > DRAW*SEGZ) return;
      if(carOffscreen(relZ, car.x*ROADW, car.carType)) return;
      items.push({k:'car', relZ, car});
    });
    StarBonus.items().forEach(st=>{
      const relZ = st.z - cam.pos;
      if(relZ > DRAW*SEGZ || relZ < 200) return;
      items.push({k:'star', relZ, star:st});
    });
    CoinBonus.items().forEach(cn=>{
      const relZ = cn.z - cam.pos;
      if(relZ > DRAW*SEGZ || relZ < 200) return;
      items.push({k:'coin', relZ, coin:cn});
    });
    HeartBonus.items().forEach(ht=>{
      const relZ = ht.z - cam.pos;
      if(relZ > DRAW*SEGZ || relZ < 200) return;
      items.push({k:'heart', relZ, heart:ht});
    });
    items.sort((a,b)=>b.relZ-a.relZ);                       // 遠→近
    items.forEach(it=>(it.relZ < PLAYER_Z ? nearList : farList).push(it));
    const drawCars = list => list.forEach(it=>{
      const relZ = it.relZ;
      // カーブオフセット取得（slicesから補間）— road と同一のcxAcc
      const nFloat = (relZ - (SEGZ - camFrac)) / SEGZ;
      const nIdx   = Math.max(0, Math.floor(nFloat));
      const cxAcc  = sliceMap.has(nIdx) ? sliceMap.get(nIdx) : 0;
      try {
        if(it.k==='star'){ StarBonus.draw(g, it.star, relZ, cxAcc, t); return; }
        if(it.k==='heart'){ HeartBonus.draw(g, it.heart, relZ, cxAcc, t); return; }
        if(it.k==='coin'){ CoinBonus.draw(g, it.coin, relZ, cxAcc, t); return; }
        const car = it.car;
        // 向き = 基本の向き + 衝突の揺れ + 車線変更の舵（Traffic.visYaw）
        drawTrafficCar(g, car.x * ROADW, relZ, cxAcc,
          car.col, car.carType, car.heading + Traffic.visYaw(car), false);
      } catch(_) {
        // 1つの描画で例外が出ても、他の描画を巻き添えで止めない
      }
    });
    drawCars(farList);
    drawPlayerCar(g,bpm,t);
    drawCars(nearList);
  }
}
