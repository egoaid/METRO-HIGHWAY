function frame(t){
  if(!enabled)return;
  rafId=requestAnimationFrame(frame);
  if(typeof Roadside==='undefined')return; // 16f がまだ読み込み中の間は描かない
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
    if(keys.U) player.speed=Math.min(SPD_MAX,player.speed+SPD_ACCEL*dt);
    else if(keys.D) player.speed=Math.max(0,player.speed-SPD_BRAKE*dt);
    else player.speed=Math.max(0,player.speed-SPD_DRAG*dt);

    // ── 横操舵（直接 x 操作モデル）──
    // xv の蓄積をやめ、キー押下中だけ x を動かす。
    // キーを離したら即座に停止 → 「少し押す = 少し動く」が線形で予測可能。
    // 速度依存: 高速ほど同じキー時間で多く動く。
    // STEER_RATE=0.35/sec @ 最高速 → 最高速で端まで約2.6秒。
    const STEER_RATE = 0.35;
    const sr = player.speed / SPD_MAX;
    // steerInput: キーボードは ±1、ジョイスティックは -1〜+1 のアナログ値
    let steerInput = 0;
    if(player.speed > 5){
      steerInput = Math.max(-1, Math.min(1, (keys.R?1:0) - (keys.L?1:0) + keys.ax));
      player.x += STEER_RATE * sr * dt * steerInput;
    }

    // ── カーブによる横ドリフト ──
    // プレイヤーが走行中のセグメントのカーブ値を直接 x に加算。
    // speedFactor MAX=0.25 → 最高速+最大カーブで路端まで約7秒。
    // 操舵力(0.35/s) はドリフト(最大0.125/s)の約2.8倍なので
    // ハンドルで十分打ち消せる。
    if(player.speed > 5){
      const speedFactor = sr * 0.25;
      player.x += curSeg.curve * speedFactor * dt;
    }

    player.x = Math.max(-0.98, Math.min(0.98, player.x));

    // xv はバンク計算のためだけに維持（実際の位置更新には使わない）
    player.xv = steerInput * STEER_RATE * sr;

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

    // 基本レーン位置: 中央付近、カーブには僅かだけ内側へ寄る
    // （大げさに振られないよう係数は小さめに抑える）。
    let demoTargetX = -curSeg.curve * 0.22;

    // ── 前方車両を自然に回避 ──
    // 実際の当たり判定・ダメージは下の PLAY 分岐でのみ発生するため
    // （if(mode===MODE.PLAY&&...) でガード済み）、ここは見た目上の
    // 運転挙動だけを作る。最も近い「進路が重なりそうな」前方車両を
    // 探し、空いている側へ目標位置をずらす。
    let avoidDx = 0, avoidDist = Infinity;
    traffic.forEach(car=>{
      const fwd = (car.z - cam.pos) / SEGZ;
      if(fwd > 0.3 && fwd < 7 && fwd < avoidDist){
        const dx = car.x - player.x;
        if(Math.abs(dx) < 0.55){ avoidDist = fwd; avoidDx = dx; }
      }
    });
    if(avoidDist < 7){
      const avoidDir = avoidDx >= 0 ? -1 : 1; // 相手が右→左へ、左→右へ
      const strength = 0.5 * (1 - avoidDist / 7); // 近いほど強く避ける
      demoTargetX += avoidDir * (0.35 + strength);
    }
    demoTargetX = Math.max(-0.65, Math.min(0.65, demoTargetX));

    // 目標へばね/減衰で滑らかに追従（xv・xとも穏当な範囲でクランプ）
    player.xv += (demoTargetX - player.x) * 0.045 - player.xv * 0.16;
    player.xv = Math.max(-0.045, Math.min(0.045, player.xv));
    player.x  = Math.max(-0.7, Math.min(0.7, player.x + player.xv));
    player.bank += (-(player.xv*16) - player.bank) * 0.12;
    player.bank = Math.max(-0.35, Math.min(0.35, player.bank));
    // ── 衝突判定なし ──
    // デモ中は道端(player.x)や他車と重なっても takeDamage() 等は
    // 一切呼ばれない。当たり判定は PLAY 分岐にのみ実装されている。

  } else { // OVER
    player.speed=Math.max(0,player.speed-SPD_BRAKE*dt);
    game.overTimer++;
  }

  cam.pos+=player.speed*dt*CAM_SCALE;

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
  spawnTick++;
  if(spawnTick>Math.max(20,60-(bpm-60)*0.12)){spawnTick=0;spawnCar();}

  // ══ 交通更新 ══
  traffic=traffic.filter(car=>{
    // ── 前方車両の移動 ──
    // car.z はワールド座標（固定）。
    // cam.pos が player.speed*dt*CAM_SCALE で増加することで
    // relZ = car.z - cam.pos は自動的に減少する（プレーヤーが前進）。
    //
    // 車両固有速度による補正:
    //   車両の固有速度分だけ car.z を前進させることで
    //   「この車は実際に走っている」状態を表現する。
    //
    //   相対速度 = player.speed - car.ownSpd
    //   正: プレーヤーが速い → 追い付く → relZ 縮小（car.z 補正後）
    //   負: 車両が速い → 引き離される → relZ 拡大
    //   プレーヤー停止時(player.speed=0):
    //     car.z += car.ownSpd * dt * CAM_SCALE
    //     → relZ が増大 → 車両が前方に走り去る（追い抜かれる）
    car.z += (car.oncoming ? -1 : 1) * car.ownSpd * dt * CAM_SCALE;

    // viewAngle: 道路中心（=固定カメラの視線方向）から見た車両への角度(rad)。
    // Math.atan2(dx, dz) → 0=真正面、±π/2=真横、±π=真後ろ。
    // カメラは画面中央に固定されており、横移動するのはプレーヤーのみ。
    // よってyaw（車体の向き）はplayer.xに依存してはならず、road center
    // （car.xそのもの、正規化座標-1〜+1）だけを基準にする。
    // player.xはscreenX側（p.cx + car.x*fw）でのみ使用し、ここでは使わない。
    const _relZ = car.z - cam.pos;
    const _relX = car.x * ROADW;
    car.viewAngle = Math.atan2(_relX, _relZ);

    const relZ2 = _relZ;

    // ── 消滅判定 ──
    // 後方消滅: relZ2 < PLAYER_Z * 0.3
    //   生成位置(PLAYER_Z - SEGZ*2 ≒ 912)より手前で消滅。
    //   プレーヤーに完全に追い越されてから消える。
    if(relZ2 < PLAYER_Z * 0.3){
      if(mode===MODE.PLAY && !car.oncoming){ playPassSound(); addLog('PASS!'); }
      return false;
    }
    // 前方消滅: 速い車が描画限界の外まで離れた
    if(relZ2 > DRAW*SEGZ+SEGZ*3) return false;

    // ── 衝突判定 ──
    if(mode===MODE.PLAY&&!car.hitTimer&&game.hitTimer===0){
      const fwd = relZ2/SEGZ;
      if(fwd >= -0.5 && fwd < 3){
        const hitW = car.carType==='truck' ? 0.35 : 0.26;
        if(Math.abs(car.x - player.x) < hitW){
          car.hitTimer=40; takeDamage(Math.sign(player.x - car.x)); // 相手から離れる側へ
        }
      }
    }
    if(car.hitTimer > 0) car.hitTimer--;

    // ── 車両の回避・分離 ──
    const fwd = relZ2/SEGZ;
    if(fwd > 0 && fwd < 12){
      // 車同士の分離（常時）
      traffic.forEach(o=>{
        if(o===car) return;
        if(Math.abs(o.z-car.z)<SEGZ*1.5){
          const dx=car.x-o.x;
          if(Math.abs(dx)<0.28){
            car.x=Math.max(-0.88,Math.min(0.88,car.x+(dx>=0?0.015:-0.015)));
          }
        }
      });
      // プレーヤー回避: 10%のスポーツカー系のみ
      if(car.avoidsPlayer){
        const dx = car.x - player.x;
        if(Math.abs(dx) < 0.40){
          car.x = Math.max(-0.88, Math.min(0.88, car.x + (dx>=0 ? 0.025 : -0.025)));
        }
      }
    }

    return true;
  });

  updateEngineSound(player.speed, SPD_MAX);
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
  g.save();g.translate(0,SY0);H=SH;
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
  // afterglow（縦長画面の延長した空の部分 -SY0..0 も含めて消す）
  g.fillStyle='rgba(0,4,8,0.50)';g.fillRect(0,-SY0,W,H+SY0);

  // 空（縦長画面では上へ延長）
  const sg=g.createLinearGradient(0,-SY0,0,HY);
  sg.addColorStop(0,'#000306');sg.addColorStop(1,'#010b12');
  g.fillStyle=sg;g.fillRect(0,-SY0,W,HY+SY0);

  // 星
  const nt=t*0.001;
  stars.forEach(s=>{
    const bv=0.38+0.62*Math.sin(nt*s.bs+s.b*6.28);
    g.beginPath();g.arc(s.x*W,s.y*(HY+SY0)-SY0,s.r,0,Math.PI*2);
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
  drawMountains(mountainsFar,  HY, H*0.17, farCurveTotal*0.06, 'rgba(124,108,190,0.55)', 'rgba(70,58,120,0.68)');
  drawMountains(mountainsNear, HY, H*0.24, farCurveTotal*0.13, 'rgba(96,80,168,0.78)',   'rgba(42,34,76,0.90)');

  // 地平線より下の地面（描画距離より奥の部分。何も描かないと afterglow の黒が残る）
  g.fillStyle='#010609';g.fillRect(0,HY,W,H-HY);

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
    if(fy>=H&&ny>=H)continue; // 両方画面外
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
      // 道路端の外側に配置
      const margin=fw+bwpx*0.5+4;
      const bx=fc+b.side*margin;

      if(b.type==='tree'){
        // ── 街路樹: 形状は Roadside.drawTree。ヘッドライトの当たり具合 L(0〜1) で明暗が変わる ──
        const zs=CAM_D/sc;
        Roadside.drawTree(g,b,bx,fy,bwpx,bhpx,sc,
          Roadside.lightAt(_lights,b.side*(ROADW+b.ww*0.5),zs));
      } else {
        // ── ビル: シルエット + セットバック + 窓グリッド + 屋上アンテナ ──
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
      }
    });

    // ── 街灯・信号機（道路の手前側セグメントより先に描く）──
    const _rso=roadsideBySeg[far.idx];
    if(_rso)_rso.forEach(o=>{
      if(o.kind==='lamp'){
        Roadside.drawLamp(g,o,fc,fy,fw,sc);
        _pools.push({o,fc,fy,fw,sc});
      }else Roadside.drawSignal(g,o,fc,fy,fw,sc,t);
    });

  }

  // 街灯が路面に落とす灯り（遠→近の順）
  _pools.forEach(q=>Roadside.drawPool(g,q));

  // ── 交通車両 後処理パス (遠→近ソート済み) ──
  // 全セグメント描画後にまとめて描く（道路による上書き防止）。
  //
  // レンダリング範囲: PLAYER_Z <= relZ <= DRAW*SEGZ
  //   relZ < PLAYER_Z = プレーヤー後方 → 描画不要
  //
  // road と完全に同一の _projWorld()/WORLD_CAR_HALF_W を使うため、
  // ここでは road 由来のスクリーン座標(p.cx/p.sw)を一切経由しない。
  // 渡すのはワールド座標(Xw=car.x*ROADW, Zw=relZ)と curve オフセット(cxAcc)のみ。
  {
    const sliceMap = new Map();
    slices.forEach(s => { sliceMap.set(s.n, s.cxA); });

    // 遠→近ソート
    const sortedTraffic = traffic.slice().sort((a,b)=>(b.z-a.z));

    sortedTraffic.forEach(car=>{
      const relZ = car.z - cam.pos;

      // PLAYER_Z より手前は描画しない（プレーヤー後方 or 落下防止）
      if(relZ < PLAYER_Z) return;
      if(relZ > DRAW * SEGZ) return;

      // カーブオフセット取得（slicesから補間）— road と同一のcxAcc
      const nFloat = (relZ - (SEGZ - camFrac)) / SEGZ;
      const nIdx   = Math.max(0, Math.floor(nFloat));
      const cxAcc  = sliceMap.has(nIdx) ? sliceMap.get(nIdx) : 0;

      try {
        drawTrafficCar(g, car.x * ROADW, relZ, cxAcc,
          car.col, car.carType, car.heading, false);
      } catch(_) {
        // 1台の描画で例外が出ても、手前の他の車の描画を巻き添えで
        // 止めない（このtry/catchが無いと forEach 全体が中断し、
        // それ以降＝より手前の車が全て未描画のまま＝透明に見える、
        // という重大な症状を引き起こしていた）。
      }
    });
  }

  // トンネル暗転なし

  // プレイヤー車
  drawPlayerCar(g,bpm,t);
}

