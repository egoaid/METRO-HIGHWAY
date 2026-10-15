function frame(t){
  if(!enabled)return;
  rafId=requestAnimationFrame(frame);
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
    let steerInput = 0;
    if(player.speed > 5){
      if(keys.L){ player.x -= STEER_RATE * sr * dt; steerInput = -1; }
      if(keys.R){ player.x += STEER_RATE * sr * dt; steerInput =  1; }
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
      if(ax > 0.97) takeDamage();
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

  // ── スピン更新 ──
  if(player.spin!==0||player.spinV!==0){
    player.spin+=player.spinV;
    player.spinV*=0.82; // 減衰
    if(Math.abs(player.spinV)<0.002){ player.spinV=0; player.spin=0; }
    // スピン中は速度も落とす
    if(Math.abs(player.spin)>0.05) player.speed=Math.max(0,player.speed-SPD_BRAKE*0.4*dt);
  }
  if(player.hitFlash>0) player.hitFlash--;

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
          car.hitTimer=40; takeDamage();
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
  const HY=Math.round(H*0.42);
  // afterglow
  g.fillStyle='rgba(0,4,8,0.50)';g.fillRect(0,0,W,H);

  // 空
  const sg=g.createLinearGradient(0,0,0,HY);
  sg.addColorStop(0,'#000306');sg.addColorStop(1,'#010b12');
  g.fillStyle=sg;g.fillRect(0,0,W,HY);

  // 星
  const nt=t*0.001;
  stars.forEach(s=>{
    const bv=0.38+0.62*Math.sin(nt*s.bs+s.b*6.28);
    g.beginPath();g.arc(s.x*W,s.y*HY,s.r,0,Math.PI*2);
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

  for(let i=0;i<slices.length-1;i++){
    const far=slices[i],near=slices[i+1];
    if(!far.p||!near.p)continue;
    const fy=far.p.sy,ny=near.p.sy,fc=far.p.cx,nc=near.p.cx,fw=far.p.sw,nw=near.p.sw;
    if(fy>=H&&ny>=H)continue; // 両方画面外
    const sc=far.p.scale;
    const alt=far.stripe;
    const tr=far.seg.terrain;

    // ── 環境オブジェクト ──
    envObjs.forEach(b=>{
      if(b.segIdx!==far.idx)return;
      // ピクセルサイズ = ワールドサイズ * scale * 補正
      // ROADW=2000がfw=ROADW*scale*(W/2)に相当
      // → 1ワールド単位 = scale*(W/2)/1 px
      const pxPerUnit=sc*(W*0.5);
      const bwpx=b.ww*pxPerUnit;
      const bhpx=b.wh*pxPerUnit;
      // 遠景ほど小さく描画し、カメラが近づくにつれて滑らかに拡大させる
      // （以前は sc<0.0002 で描画距離の手前約2割しか使えておらず、
      //   遠くで小さく現れて徐々に大きくなる遠近感がほぼ無かった）。
      if(bwpx<0.5||bhpx<0.5)return;
      // 道路端の外側に配置
      const margin=fw+bwpx*0.5+4;
      const bx=fc+b.side*margin;

      if(b.type==='tree'){
        // ── 木: 接地影 + 先細りの幹 + 樹種ごとのキャノピー ──
        const tw=bwpx,th=bhpx;
        const trunkH=th*0.22;
        const trunkTopW=tw*0.14, trunkBotW=tw*0.22;
        const lean=b.lean*th*0.35;

        // 接地影（低ポリでも木が地面に立っている感を出す）
        const shR=Math.max(2,tw*0.62);
        const shGrad=g.createRadialGradient(bx,fy,0,bx,fy,shR);
        shGrad.addColorStop(0,'rgba(0,0,0,0.40)');
        shGrad.addColorStop(1,'rgba(0,0,0,0)');
        g.fillStyle=shGrad;
        g.beginPath();g.ellipse(bx,fy,shR,Math.max(1,shR*0.32),0,0,Math.PI*2);g.fill();

        g.fillStyle='#1a3016';
        g.beginPath();
        g.moveTo(bx-trunkBotW/2, fy);
        g.lineTo(bx+trunkBotW/2, fy);
        g.lineTo(bx+trunkTopW/2+lean*0.3, fy-trunkH);
        g.lineTo(bx-trunkTopW/2+lean*0.3, fy-trunkH);
        g.closePath();g.fill();

        const canopyTopY=fy-th;
        const canopyBottomY=fy-trunkH*0.55;
        const canopySpan=canopyBottomY-canopyTopY;

        g.shadowColor='#2af080';g.shadowBlur=Math.min(3,sc*600);

        if(b.treeType==='round'){
          // ── 広葉樹: 重なり合う丸みのある房（不揃いな円の集合）──
          const blobs=[
            {cx:0,      cy:0.32, r:0.62},
            {cx:-0.34,  cy:0.10, r:0.46},
            {cx:0.32,   cy:0.06, r:0.48},
            {cx:0,      cy:-0.30,r:0.40},
          ];
          blobs.forEach((bl,i)=>{
            const jit=b.jitter[i%b.jitter.length];
            const cx2=bx+lean*0.5+(bl.cx+jit*0.5)*tw;
            const cy2=canopyBottomY-canopySpan*(0.5+bl.cy+jit*0.15);
            const r=Math.max(1,(bl.r+jit*0.12)*tw*0.62);
            g.fillStyle = i%2===0 ? b.leafA : b.leafB;
            g.beginPath();g.arc(cx2,cy2,r,0,Math.PI*2);g.fill();
          });
        } else {
          // ── 針葉樹: 3層の重なるキャノピー（各層に僅かな不揃いさ）──
          for(let L=0; L<3; L++){
            const jit=b.jitter[L];
            const frac0=L/3, frac1=(L+0.62)/3;
            const baseY=canopyBottomY-canopySpan*frac0*0.86;
            const tipY =canopyBottomY-canopySpan*frac1*(1.02+jit*0.1);
            const width=tw*(1.08-L*0.26)*(1+jit*0.16);
            const cx=bx+lean*frac0+jit*tw*0.12;
            g.fillStyle = L===2 ? b.leafB : b.leafA;
            g.beginPath();
            g.moveTo(cx, tipY);
            g.lineTo(cx-width*0.5, baseY);
            g.lineTo(cx+width*0.5, baseY);
            g.closePath();
            g.fill();
          }
        }
        g.shadowBlur=0;
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

  }

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

      const hitFlash = car.hitTimer > 0;
      try {
        drawTrafficCar(g, car.x * ROADW, relZ, cxAcc,
          car.col, car.carType, car.heading, hitFlash);
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

  // 被弾フラッシュ
  if(mode===MODE.PLAY&&game.hitTimer>70){
    g.fillStyle=`rgba(255,0,0,${(game.hitTimer-70)*0.012})`;g.fillRect(0,0,W,H);
  }

  drawHUD(g,bpm);
  if(mode===MODE.DEMO)drawDemoOverlay(g);
  if(mode===MODE.PLAY||mode===MODE.OVER)drawGameHUD(g);
  drawLogs(g);
}

