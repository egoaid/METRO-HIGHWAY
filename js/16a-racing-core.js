// ════════════════════════════════════════════════
// VFD RACING ENGINE v5
// (Loaded as 5 plain <script> files sharing global scope — see 16a..16e.
//  No IIFE wrapper: identifiers below were checked for collisions against
//  every other module and none were found.)
const cv=document.getElementById('vfdRacingCanvas');
const g = cv && cv.getContext('2d');

// ── サイズ ──
let W=0,H=0;
function resize(){
  const r=cv.parentElement.getBoundingClientRect();
  const d=Math.min(window.devicePixelRatio||1,2);
  W=Math.round(r.width*d);H=Math.round(r.height*d);
  // wkhtmltoimage fallback: getBoundingClientRect returns 0 before layout
  if(W<10||H<10){
    W=Math.round((cv.parentElement.offsetWidth||870)*d);
    H=Math.round((cv.parentElement.offsetHeight||220)*d);
  }
  if(W<10||H<10){W=870;H=220;}
  cv.width=W;cv.height=H;
}
resize();
// 再試行: レイアウト完了後にもう一度サイズ取得
setTimeout(resize, 100);
window.addEventListener('resize',resize);

// ════════════════════════════════════
// 定数
// ════════════════════════════════════
const SEG=240;        // コース総セグ数
const SEGZ=200;       // 1セグのZ長さ(ワールド単位)
const DRAW=100;       // 描画セグ数
const ROADW=2000;     // 道路ワールド半幅

// 速度は km/h 単位
const SPD_MAX   = 220;   // 最高速
const SPD_ACCEL = 70;    // 加速度 km/h/s
const SPD_BRAKE = 180;   // ブレーキ km/h/s
const SPD_DRAG  = 15;    // アクセルOFF時の空気抵抗
// cam.pos増分 = speed(km/h)*dt * CAM_SCALE
const CAM_SCALE = 14;

// ════════════════════════════════════
// ゲーム状態
// ════════════════════════════════════
const MODE={DEMO:'demo',PLAY:'play',OVER:'over'};
let mode=MODE.DEMO;
const game={hp:3,maxHp:3,dist:0,best:0,hitTimer:0,overTimer:0};
const cam={pos:0};
const player={x:0,xv:0,speed:0,bank:0,
  slip:0,    // 衝突スリップ: 車体の向き(ヨー角, rad)。+で鼻先が右。ロール(横転)はしない
  slipV:0,   // ヨー角速度(rad/s)
  slideV:0   // 衝突で横へ流れる速度(player.x単位/s)
};
// ── 衝突スリップ(横滑り)の定数 ──
// ヨー角は減衰ばね: slip'' = -K*slip - C*slip'。固有角速度 ω=√K=10rad/s(≈1.6Hz)、
// 減衰比 ζ=C/(2ω)=0.25 → 左右に2〜3回振れて約1秒で収まる。戻り際に「パッと0に飛ぶ」ことはない。
const SLIP_K=100, SLIP_C=5;
const SLIP_KICK=2.6;     // 衝突直後のヨー角速度(rad/s)。最大ヨー角 約0.2rad(≈11°)
const SLIDE_KICK=0.9;    // 衝突直後の横速度。指数減衰の積分で合計 SLIDE_KICK/SLIDE_DECAY ≒ 0.15 だけ流れる
const SLIDE_DECAY=6;     // 横速度の減衰率(1/s)
const SLIDE_LIMIT=0.90;  // スリップで路肩ペナルティ域(>0.90)へ押し出さない上限
const keys={L:false,R:false,U:false,D:false};

// 道路中心線のスクリーンオフセット(px) — drawScene で毎フレーム更新
// player.x は道路中心相対座標(-1〜1)なので、
// 描画時にこのオフセットを加算してスクリーン座標に変換する。
let roadCenterOffsetPx = 0;

window.addEventListener('keydown',e=>{
  if(e.key==='ArrowLeft') {keys.L=true;e.preventDefault();}
  if(e.key==='ArrowRight'){keys.R=true;e.preventDefault();}
  if(e.key==='ArrowUp')   {keys.U=true;e.preventDefault();}
  if(e.key==='ArrowDown') {keys.D=true;e.preventDefault();}
  if((e.key===' '||e.key==='Enter')&&mode!==MODE.PLAY)startGame();
});
window.addEventListener('keyup',e=>{
  if(e.key==='ArrowLeft') keys.L=false;
  if(e.key==='ArrowRight')keys.R=false;
  if(e.key==='ArrowUp')   keys.U=false;
  if(e.key==='ArrowDown') keys.D=false;
});

// ════════════════════════════════════
// コース生成
// ════════════════════════════════════
// terrain: 'city'|'suburb'|'rural'
let course=[];
function buildCourse(){
  course=[];
  // terrain ブロック定義
  // 都会と田舎が短い周期で入れ替わらないよう、1周(SEG=240)を
  // 「都会を長く→短い郊外の移行帯→田舎道を長く」という単一の
  // 大きな流れにしている（周回の継ぎ目で再び都会に戻る）。
  const TB=[
    {t:'city',  len:110},
    {t:'suburb',len:30},
    {t:'rural', len:100},
  ];
  let ti=0,tc=0;
  for(let i=0;i<SEG;i++){
    if(tc>=TB[ti%TB.length].len){ti++;tc=0;}
    course.push({curve:0,terrain:TB[ti%TB.length].t,alt:Math.floor(i/3)%2});
    tc++;
  }
  // カーブ配置
  function sc(s,l,v){for(let i=s;i<Math.min(s+l,SEG);i++)course[i].curve=v;}
  sc(0,20,0);sc(20,28,0.40);sc(48,18,0);sc(66,32,-0.48);
  sc(98,22,0);sc(120,30,0.42);sc(150,20,0);sc(170,28,-0.38);
  sc(198,18,0);sc(216,24,0.50);
}
buildCourse();

// ════════════════════════════════════
// 交通
// ════════════════════════════════════
const NEON=['#e03060','#5df0c8','#c060ff','#ff8020','#20a0ff'];
let traffic=[];
let spawnTick=0;

function spawnCar(){
  // ── 距離に応じた難易度レベル（0〜4） ──
  const distKm = game.dist / 1000;
  const lv = distKm < 4  ? 0
           : distKm < 6  ? 1
           : distKm < 9  ? 2
           : distKm < 13 ? 3
           :                4;

  // 最大同時台数: lv0=7、lv4=14
  const maxCars = 7 + lv * 2;
  if(traffic.length >= maxCars) return;

  // ── 車種ウェイト（距離が増えてもトラックは少しだけ増える） ──
  // lv0: truck=0.12、lv4: truck=0.22
  const truckW = Math.min(0.22, 0.12 + lv * 0.025);
  const rem    = 1.0 - truckW - 0.05; // f40は固定0.05
  const baseW  = rem / 3;
  const types  = ['ferrari328','coupe','sedan','truck','f40'];
  const weights= [baseW, baseW, baseW, truckW, 0.05];

  let r=Math.random(),ti=0;
  for(let i=0;i<weights.length;i++){r-=weights[i];if(r<=0){ti=i;break;}}
  const ct=types[ti];

  // 対向車: 25%確率。トラックは常に同方向。
  const oncoming = ct !== 'truck' && Math.random() < 0.25;

  const ownSpd = oncoming            ? (70+Math.random()*80)
               : ct==='truck'        ? (30+Math.random()*40)
               : ct==='f40'          ? (120+Math.random()*80)
               :                       (20+Math.random()*100);

  // ── 生成位置は2箇所のみ ──
  let absZ;
  if(oncoming || ownSpd >= player.speed){
    absZ = cam.pos + PLAYER_Z - SEGZ * 2;
  } else {
    absZ = cam.pos + DRAW * SEGZ + SEGZ * 2;
  }

  if(traffic.some(c=>Math.abs(c.z-absZ)<SEGZ*1.2))return;

  // 対向車は左車線、同方向車は全レーン
  const cx = oncoming
    ? -(0.25 + Math.random()*0.60)
    :  (Math.random()-0.5)*1.2;
  const col=ct==='f40'?'#ff40a0':ct==='truck'?'#e08020':NEON[Math.floor(Math.random()*NEON.length)];
  const avoidsPlayer = !oncoming && ct !== 'truck' && Math.random() < 0.10;

  // heading: 進行方向(rad)。0=前進(Z+)、Math.PI=後退(Z-)。
  // viewAngle: プレーヤーから見た相対角度(rad)。毎フレーム更新。
  //   将来の側面描画判定に使用。現時点では計算のみ、描画には未使用。
  const heading = oncoming ? Math.PI : 0;
  traffic.push({z:absZ,x:cx,ownSpd,col,carType:ct,oncoming,heading,viewAngle:0,hitTimer:0,avoidsPlayer});
}

// ════════════════════════════════════
// 環境オブジェクト
// ════════════════════════════════════
let envObjs=[];
// 木の葉色パレット（層ごとに変化をつけて奥行きを出す）
const LEAF_COLORS=['#0f6b2c','#1a8c3a','#0a5522','#227a3f','#144a24'];

function buildEnv(){
  envObjs=[];
  for(let i=0;i<SEG;i+=2){
    if(Math.random()<0.60){
      const seg=course[i]||{terrain:'city'};
      const isRural=seg.terrain==='rural';
      const winCols=2+Math.floor(Math.random()*4);
      const floors=2+Math.floor(Math.random()*10);
      // 窓の点灯パターンはビルごとに一度だけ確定（毎フレーム再抽選するとチカチカする）
      const winLit=isRural?null:Array.from({length:winCols*floors},()=>Math.random()<0.34);
      envObjs.push({
        segIdx:i,
        side:Math.random()<0.5?-1:1,
        type:isRural?'tree':'building',
        // ワールド単位でサイズ指定(ROADW基準)
        ww: isRural?(300+Math.random()*400):(600+Math.random()*1200),
        wh: isRural?(500+Math.random()*800):(2000+Math.random()*6000),
        c1:NEON[Math.floor(Math.random()*NEON.length)],
        c2:NEON[Math.floor(Math.random()*NEON.length)],
        fl:floors,
        winCols,
        winLit,
        // ビル: スカイライン変化用のセットバック（上段の後退したブロック）とアンテナ
        setback: !isRural && Math.random()<0.32,
        setbackW: 0.48+Math.random()*0.22,
        setbackH: 0.16+Math.random()*0.16,
        antenna: !isRural && Math.random()<0.35,
        // 木: 樹種・配色・不揃いさ（自然な見た目のばらつき）
        treeType: Math.random()<0.62 ? 'conifer' : 'round',
        leafA: LEAF_COLORS[Math.floor(Math.random()*LEAF_COLORS.length)],
        leafB: LEAF_COLORS[Math.floor(Math.random()*LEAF_COLORS.length)],
        lean: (Math.random()-0.5)*0.16,
        jitter: [ (Math.random()-0.5)*0.3, (Math.random()-0.5)*0.3, (Math.random()-0.5)*0.3 ],
      });
    }
  }
}
buildEnv();

// 星
const stars=Array.from({length:50},()=>({
  x:Math.random(),y:Math.random()*0.38,
  r:Math.random()<0.15?1.4:0.85,
  b:Math.random(),bs:0.5+Math.random()*1.5
}));

// ════════════════════════════════════
// 山脈（地平線背景・2層パララックス）
// ════════════════════════════════════
// 各層は x を -0.12〜1.12 の範囲で生成し、道路のカーブによる
// 横スクロール時にも画面端に隙間が生じないようにする。
let mountainsFar=[], mountainsNear=[];
function _genMountainRange(n, jagMin, jagMax){
  const pts=[];
  for(let i=0;i<n;i++){
    pts.push({
      x: -0.12 + (i/(n-1))*1.24,
      h: jagMin + Math.random()*(jagMax-jagMin),
    });
  }
  return pts;
}
function buildMountains(){
  mountainsFar  = _genMountainRange(10, 0.10, 0.42); // 遠景: 低め・なだらか・霞んだ色
  mountainsNear = _genMountainRange(7,  0.16, 0.62); // 近景: 高め・鋭角・濃い色
}
buildMountains();

// baseY=地平線Y、maxH=最高峰の高さ(px)、parallaxPx=道なりカーブに応じた横シフト
function drawMountains(pts, baseY, maxH, parallaxPx, fillTop, fillBottom){
  if(!pts.length) return;
  g.beginPath();
  g.moveTo(pts[0].x*W - parallaxPx, baseY);
  pts.forEach(p=>g.lineTo(p.x*W - parallaxPx, baseY - p.h*maxH));
  g.lineTo(pts[pts.length-1].x*W - parallaxPx, baseY);
  g.closePath();
  const grad=g.createLinearGradient(0, baseY-maxH, 0, baseY);
  grad.addColorStop(0, fillTop);
  grad.addColorStop(1, fillBottom);
  g.fillStyle=grad;
  g.fill();
}

// ログ
const logs=[];
function addLog(t){logs.unshift({text:t,age:0,life:300});if(logs.length>5)logs.pop();}
const stat={t0:Date.now(),songs:0,lastSong:''};
function uptime(){
  const s=Math.floor((Date.now()-stat.t0)/1000);
  return[Math.floor(s/3600),Math.floor(s%3600/60),s%60].map(v=>String(v).padStart(2,'0')).join(':');
}

// ════════════════════════════════════
// 透視投影
// scale = CAM_D / worldZ
// sy    = H/2 + scale*CAM_H*(H/2)  ← 地面Y(地平線より下)
// sw    = ROADW * scale * (W/2)     ← 道路半幅px
// ════════════════════════════════════
const CAM_H=1000,CAM_D=0.84;

// ── プレイヤー深度定数 ──
// プレイヤー車接地Y = H*0.82（前景路面 18% 確保）。
// sy = H/2 + (CAM_D/Z)*CAM_H*(H/2) = H*0.82
// → 0.32*H = (CAM_D/Z)*CAM_H*(H/2)
// → Z = CAM_D*CAM_H / (2*0.32) = 0.84*1000/0.64 = 1312.5
const PLAYER_Z = 1312.5;

// ── 統一透視投影関数（プレイヤー・AI 共通）──
// road segment 描画用: sy を H+20 でクランプ（台形が画面外にはみ出さない）
function proj(worldZ,cxAcc){
  if(worldZ<=0)return null;
  const s=CAM_D/worldZ;
  return{
    scale:s,
    cx:W*0.5 - (cxAcc||0),
    sy:Math.min(H*0.5 + s*CAM_H*(H*0.5), H+20),
    sw:ROADW*s*(W*0.5)
  };
}
// 車両描画用: sy クランプなし
// relZ は常に > 0（PLAYER_Z以上）で呼ばれるため worldZ=0 チェックのみ
function projFull(worldZ,cxAcc){
  if(worldZ<=0)return null;
  const s=CAM_D/worldZ;
  return{
    scale:s,
    cx:W*0.5 - (cxAcc||0),
    sy:H*0.5 + s*CAM_H*(H*0.5),
    sw:ROADW*s*(W*0.5)
  };
}

// 旧 playerCarRef()（スクリーン比率ベースの車サイズ基準）は廃止。
// 車体サイズは WORLD_CAR_HALF_W（ワールド単位の定数）に統一され、
// road と同一の _projWorld() で投影されるため、別途リファレンスは不要。

// ════════════════════════════════════
// ゲーム制御
// ════════════════════════════════════
function startGame(){
  initSound();
  mode=MODE.PLAY;
  game.hp=game.maxHp;game.dist=0;game.hitTimer=0;game.overTimer=0;
  cam.pos=0;player.x=0;player.xv=0;player.speed=0;player.bank=0;
  player.slip=0;player.slipV=0;player.slideV=0;
  traffic=[];spawnTick=0;
  addLog('GAME START!  ↑ACCEL  ↓BRAKE  ←→STEER');
  const gb=document.getElementById('vfdGameBtn');
  if(gb){gb.textContent='DEMO';gb.classList.remove('btn-red');gb.classList.add('btn');}
}

// pushDir: 車体が流れる向き(+1=右 / -1=左)。相手車なら「相手から離れる側」、
//          路肩なら「中央へ戻る側」を呼び出し側が渡す。未指定/0(真横一致)のみランダム。
function takeDamage(pushDir){
  if(game.hitTimer>0)return;
  playCrashSound();
  game.hp--;game.hitTimer=90;
  // 衝突スリップ: 横転ではなく、ヨー(向き)の振れと横への流れだけ
  const dir=(pushDir===1||pushDir===-1)?pushDir:((Math.random()<0.5)?1:-1);
  player.slipV=dir*SLIP_KICK;
  player.slideV=dir*SLIDE_KICK;
  addLog(`DAMAGE! HP:${'♥'.repeat(Math.max(0,game.hp))}`);
  if(game.hp<=0)endGame();
}

function endGame(){
  mode=MODE.OVER;
  if(game.dist>game.best)game.best=game.dist;
  addLog(`GAME OVER! ${(game.dist/1000).toFixed(2)}km`);
  if(game.dist>=game.best&&game.dist>0)addLog('★ NEW RECORD!');
  setTimeout(()=>{
    mode=MODE.DEMO;
    player.speed=0;player.x=0;player.xv=0;player.bank=0;
    player.slip=0;player.slipV=0;player.slideV=0;
    traffic=[];
    const gb=document.getElementById('vfdGameBtn');
    if(gb){gb.textContent='PLAY';gb.classList.add('btn-red');gb.classList.remove('btn');}
  },3500);
}

// ════════════════════════════════════
// メインループ
// ════════════════════════════════════
let enabled=true,rafId=null,lastT=0,tunnelA=0;
function getBpm(){return parseFloat(document.getElementById('rhythmBpm')?.value||'120');}

