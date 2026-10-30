// ════════════════════════════════════════════════
// VFD RACING ENGINE v5
// (Loaded as 5 plain <script> files sharing global scope — see 16a..16e.
//  No IIFE wrapper: identifiers below were checked for collisions against
//  every other module and none were found.)
const cv=document.getElementById('vfdRacingCanvas');
const g = cv && cv.getContext('2d');

// ── サイズ ──
let W=0,H=0;
// ── シーン枠（カメラの画角）──
// 投影は x を W/2、y を H/2 で拡大する（車・道路・構造物すべて同じ式）。縦長画面にそのまま当てはめると
// 縦の倍率だけが大きくなり、すべてが縦に伸びて見える。必要なのは「絵を縦長に変形する」ことではなく
// 「同じ形のまま、カメラの画角(撮影範囲)だけを縦長にする」こと。
//  ・倍率の比（縦/横）は基準の 16:9（SCENE_REF_AR=0.5625）に固定 = どの画面でも車やビルの形は同じ。
//    シーン枠の高さ SH = W*SCENE_REF_AR（これが投影の基準 H）。
//  ・画面が 16:9 より縦長なら、枠より上は夜空、下は手前の路面として「描画範囲」だけを広げる。
//    自車の接地点が画面の高さの CAR_SCREEN_Y に来るよう、枠の上端を SY0 だけ下げる。
//  ・HB = 仮想座標での描画下端（道路・地面を塗る範囲。SH 以上）。
// 16:9 以下の横長画面（埋め込み表示・スマホ横持ちなど）では SH===H, SY0===0, HB===H で従来どおり。
// HUD・タッチ操作は実画面 (W,H) の座標を使う。
const SCENE_REF_AR=0.5625;
const CAR_SCREEN_Y=0.72;
let SH=0,SY0=0,HB=0;
// タッチ端末（スマホ/タブレット）か。フルスクリーン時の操作UIと描画解像度の上限に使う。
const IS_TOUCH_DEVICE=!!(window.matchMedia&&window.matchMedia('(pointer: coarse)').matches);
function resize(){
  const r=cv.parentElement.getBoundingClientRect();
  // スマホのフルスクリーンは画素数が大きくなるので上限を1.5にして描画負荷を抑える
  const d=Math.min(window.devicePixelRatio||1,IS_TOUCH_DEVICE?1.5:2);
  W=Math.round(r.width*d);H=Math.round(r.height*d);
  // wkhtmltoimage fallback: getBoundingClientRect returns 0 before layout
  if(W<10||H<10){
    W=Math.round((cv.parentElement.offsetWidth||870)*d);
    H=Math.round((cv.parentElement.offsetHeight||220)*d);
  }
  if(W<10||H<10){W=870;H=220;}
  cv.width=W;cv.height=H;
  if(H<=W*SCENE_REF_AR){SH=H;SY0=0;}
  else{
    SH=Math.round(W*SCENE_REF_AR);
    SY0=Math.max(0,Math.round(H*CAR_SCREEN_Y-0.82*SH));  // 0.82*SH = 枠内での自車の接地Y（PLAYER_Z で決まる）
  }
  HB=H-SY0;
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
// hp は 0.5 刻み（ダメージ=1、ハート取得=+0.5）。maxHp を超えない。
const game={hp:3,maxHp:3,dist:0,best:0,hitTimer:0,overTimer:0,nextStar:0,nextHeart:0,healT:0,coins:0,nextCoin:0,nextEnergy:0};

// ── 交通ルールと星のボーナス ──
// 右側通行: 自車と同方向の車線は道路の右半分、対向車線は左半分（車線の中央。道路は4車線: ±0.22, ±0.66）。
// 他車は原則これを守る。一部は違反して自由に走る（16i-racing-traffic.js）。自車はどこへでも走れる。
const LANES_FWD=[0.22,0.66];
const LANES_ONC=[-0.22,-0.66];
const PLAYER_START_X=0.44;       // 開始位置: 右半分（自車線）の中央
// 走行距離が STAR_FIRST_DIST(m) を超えると、道路に星が落ちる（16j-racing-star.js）。取ると INV_TIME 秒だけ無敵。
// v1.5.1: 5km を超えると星が毎km出て無敵だらけになり、難しさが下がっていた。星もハートも「約2kmに1個」にした（星は3kmから、ハートは1km付近から。ずらしてある）
const STAR_FIRST_DIST=3000;
const STAR_EVERY=[1600,2400];     // 次の星までの距離の範囲(m)（平均 2000m）
const INV_TIME=8;                // 無敵時間(秒)
const INV_BOOST=2.2;             // 無敵中に衝突された他車の揺れの倍率
let bonusStars=[];
// 道路にときどき落ちているハート（16k-racing-heart.js）。取ると HP が HEART_HEAL(=ハート半分)回復。
// 出現は 約 HEART_EVERY(m) に1個（2km に1個程度）。最初の1個は HEART_FIRST(m) 付近。
const HEART_HEAL=0.5;
const HEART_FIRST=[800,1400];    // 最初のハートまでの距離の範囲(m)
const HEART_EVERY=[1600,2400];   // 次のハートまでの距離の範囲(m)（平均 2000m）
let bonusHearts=[];
// 道路に落ちているコイン（16m-racing-coin.js）。1枚=COIN_VALUE。貯めたコインでガレージ（16l）の車を買う。
// コインは 5〜6枚の列（直線 or 斜め）で、多くは自車線の2レーン、約 COIN_ONC_P は対向車線の2レーン（1枚 COIN_ONC_VALUE）に置く。取ろうとして車線を変えること自体が、
// 衝突の危険を増やす（取るか避けるかの判断がゲームの難しさになる）。約 COIN_EVERY(m) ごとに1列。
const COIN_VALUE=1;
const COIN_ONC_P=0.25;           // コイン列が対向車線に置かれる確率（対向車線は逆向きの車が来るので危ない）
const COIN_ONC_VALUE=2;          // 対向車線のコイン1枚の価値（危険に見合う報酬）
const COIN_FIRST=[150,300];      // 最初のコイン列までの距離の範囲(m)
const COIN_EVERY=[300,500];      // 次のコイン列までの距離の範囲(m)（平均 400m ≒ 1kmに6枚前後を取れる）
let bonusCoins=[];
// 道路に落ちている「エネルギータンク」（16o-racing-energy.js）。取ると ENERGY_TIME 秒の間、最高速が +ENERGY_VMAX_BONUS km/h（加速も ×ENERGY_ACCEL_MULT）。
// 無敵ではない（ぶつかればハートは減る）。速くなる＝同じ秒数で遠くまで行ける代わりに、避ける余裕・カーブの外への流れ（速度の2乗）がきつくなる。
// 約 ENERGY_EVERY(m) に1個（星・ハートと同じ約2km間隔だが、取るかどうかはプレイヤーの判断）。
const ENERGY_TIME=INV_TIME;           // 効果の長さ（星と同じ）
const ENERGY_VMAX_BONUS=50;           // 最高速に足す km/h
const ENERGY_ACCEL_MULT=1.6;          // 効果中の加速の倍率（+50km/h に約1秒で届くように）
const ENERGY_DECAY=45;                // 効果が切れた後、最高速を超えている分が減っていく速さ km/h/s（急に落とさない）
const ENERGY_FIRST=[1200,1800];       // 最初のタンクまでの距離の範囲(m)
const ENERGY_EVERY=[1400,2200];       // 次のタンクまでの距離の範囲(m)（平均 1.8km）
const ENERGY_ONC_P=0.25;              // 対向車線に置かれる確率
let bonusEnergy=[];
const cam={pos:0};
const player={x:0,xv:0,speed:0,bank:0,
  energy:0,  // エネルギータンクの効果の残り時間(秒)。>0 の間は最高速 +ENERGY_VMAX_BONUS km/h・加速 ×ENERGY_ACCEL_MULT
  inv:0,     // 無敵の残り時間(秒)。星を取ると INV_TIME
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
// ax: アナログ操舵 -1(左)〜+1(右)。バーチャルジョイスティック(16g)が書き込む。キーボードは L/R を使う。
const keys={L:false,R:false,U:false,D:false,ax:0};

// 道路中心線のスクリーンオフセット(px) — drawScene で毎フレーム更新
// player.x は道路中心相対座標(-1〜1)なので、
// 描画時にこのオフセットを加算してスクリーン座標に変換する。
let roadCenterOffsetPx = 0;

window.addEventListener('keydown',e=>{
  // 音量: - = で BGM、[ ] でゲーム音（どのモードでも・走行中でも。16n）
  if(typeof AudioMix!=='undefined'&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&AudioMix.onKey(e)){e.preventDefault();return;}
  if(e.key==='ArrowLeft') {keys.L=true;e.preventDefault();}
  if(e.key==='ArrowRight'){keys.R=true;e.preventDefault();}
  if(e.key==='ArrowUp')   {keys.U=true;e.preventDefault();}
  if(e.key==='ArrowDown') {keys.D=true;e.preventDefault();}
  // タイトル画面だけ: ガレージのキー操作（G=開閉 ←→=車 T=強化 ↑↓/Enter=強化ページ）。キーの自動リピート(e.repeat)は無視する
  //（走行中に押しっぱなしだった ←→ が、ゲームオーバー後にリピートして車種が次々に変わるバグの原因だった）
  if(mode===MODE.DEMO&&!e.repeat&&typeof Garage!=='undefined'&&Garage.onKey(e)){e.preventDefault();return;}
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
// 路側物（街灯・信号機）: course から決定的に導出する（buildCourse() の末尾で再構築）
let roadside=[];           // 全ての路側物
let roadsideBySeg={};      // segIdx → [路側物]
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
  buildRoadside();
}

// ── 路側物（一般道路: 街灯と、時々信号機）──
// ルール（すべて terrain と seg 番号だけで決まる。乱数なし）:
//  ・街灯 : 市街/郊外は12セグごと、田舎は24セグごとに、左右交互（反対側は半周期ずらし）
//  ・信号 : 市街/郊外の「前後4セグがすべて直線」の地点に、前の信号から40セグ以上離して置く
//           （カーブ区間だと建物に隠れて見えないため）。置いたセグと次のセグに横断歩道を描く
//  ・信号は常に青（右側の支柱から道路を横切るアーム。自車側の灯器は手前向き、対向車線側は裏面が見える）
//  ・反射ポスト: 縁石のすぐ外に 3セグごと・左右両側（左=橙 / 右=白）。画面の縁を速く流れる近景の
//    手がかりで、速度感を出すためのもの（SpeedFx と対）
function buildRoadside(){
  roadside=[]; roadsideBySeg={};
  const add=o=>{ roadside.push(o); (roadsideBySeg[o.segIdx]=roadsideBySeg[o.segIdx]||[]).push(o); };
  const straight=i=>{ for(let k=-4;k<=4;k++) if(course[i+k].curve!==0) return false; return true; };
  let lastSig=-1e9;
  for(let i=0;i<SEG;i++){
    const rural=course[i].terrain==='rural';
    const sp=rural?24:12;
    if(i%3===0){ add({kind:'post',segIdx:i,side:-1}); add({kind:'post',segIdx:i,side:1}); }
    if(i%sp===0)        add({kind:'lamp',segIdx:i,side:-1,h:2500,arm:1100});
    if(i%sp===sp/2)     add({kind:'lamp',segIdx:i,side: 1,h:2500,arm:1100});
    if(!rural && i>=4 && i<SEG-4 && i-lastSig>=40 && straight(i)){
      add({kind:'signal',segIdx:i,side:1});
      course[i].xing=true; course[i+1].xing=true;
      lastSig=i;
    }
  }
}
buildCourse();

// ════════════════════════════════════
// 交通
// ════════════════════════════════════
const NEON=['#e03060','#5df0c8','#c060ff','#ff8020','#20a0ff'];
let traffic=[];
let spawnTick=0;

// 他車の出現は 16i-racing-traffic.js（右側通行・対向車の比率・違反車・重なり防止）
function spawnCar(){ Traffic.spawn(); }

// ════════════════════════════════════
// 環境オブジェクト
// ════════════════════════════════════
let envObjs=[];
// ── 街路樹 ──
// 夜の道路に合わせて暗く、緑を抑えた配色。ヘッドライトに照らされると lit 色へ寄る
// （lit = a*1.6 + [34,44,20] を描画時に計算）。値は RGB(0-255)。
const TREE_PALETTES=[
  {a:[16,46,30], b:[10,32,22]},
  {a:[20,52,32], b:[12,38,26]},
  {a:[14,40,34], b:[ 9,28,26]},
  {a:[26,54,30], b:[16,40,24]},
];
// 樹形（街路樹の実在樹種を単純化した3種）。ww/wh はワールド単位(1m≒347)の [min,max]
//  broad : ケヤキ/プラタナス型（太い幹が分岐して横に広い樹冠）
//  column: イチョウ/ポプラ型（細長く先が尖る樹冠）
//  dome  : クスノキ型（低めで丸いドーム状の樹冠）
// crownH: 全高のうち樹冠が占める割合（残りは枝下の幹）。lobes: 樹冠の外周のこぶの数
const TREE_SHAPES={
  broad :{ww:[1100,1700],wh:[2000,3200],crownH:0.60,rx:0.50,lobes:9},
  column:{ww:[ 550, 850],wh:[2300,3600],crownH:0.78,rx:0.50,lobes:7,pointed:true},
  dome  :{ww:[1000,1500],wh:[1500,2400],crownH:0.66,rx:0.50,lobes:8},
};
function makeTree(shapeName){
  const S=TREE_SHAPES[shapeName], R=Math.random;
  const pal=TREE_PALETTES[Math.floor(R()*TREE_PALETTES.length)];
  const n=S.lobes*2;
  // 樹冠外周: 偶数=こぶの頂点, 奇数=くびれ。下半分のくびれは深くして枝下に隙間を作る
  const crown=[];
  for(let k=0;k<n;k++){
    const ang=-Math.PI/2+k*2*Math.PI/n, below=Math.sin(ang)>0.35;
    crown.push(k%2===0 ? 0.94+R()*0.12 : (0.80+R()*0.10)*(below?0.86:1));
  }
  // 葉むら（樹冠内の明暗パッチ）: 楕円内の単位座標
  // クリップなしで描くので、外周のくびれ(最小≈0.69)より内側に収まる範囲に限る
  // （中心からの距離 ≤0.50、半径 ≤0.19、下半分は v を縮めて枝下の隙間に食い込ませない）
  const patches=Array.from({length:7},(_,i)=>{
    const a=R()*Math.PI*2, d=Math.sqrt(R())*0.50;
    let v=Math.sin(a)*d; if(v>0) v*=0.75;
    return {u:Math.cos(a)*d, v, r:0.12+R()*0.07, lite:i%2===1};
  });
  // 枝: 幹の先端から樹冠下部へ（樹冠の半幅に対する左右位置）
  const branches=[-0.42+R()*0.12, (R()-0.5)*0.16, 0.30+R()*0.12];
  return {
    shape:shapeName,
    ww:S.ww[0]+R()*(S.ww[1]-S.ww[0]),
    wh:S.wh[0]+R()*(S.wh[1]-S.wh[0]),
    palA:pal.a, palB:pal.b, crown, patches, branches,
    lean:(R()-0.5)*0.10,
  };
}

function buildEnv(){
  envObjs=[];
  let _envId=0;                                  // 構造物ごとの固定ID（ホログラムのグリッチ乱数用）
  for(let i=0;i<SEG;i+=2){
    if(Math.random()<0.60){
      const seg=course[i]||{terrain:'city'};
      const isRural=seg.terrain==='rural';
      const side=Math.random()<0.5?-1:1;
      if(isRural){
        // 街路樹（樹形3種を 広葉:円柱:ドーム = 45:30:25 で混ぜる）
        const r=Math.random();
        const t=makeTree(r<0.45?'broad':r<0.75?'column':'dome');
        t.segIdx=i; t.side=side; t.type='tree'; t.id=++_envId;
        envObjs.push(t);
        continue;
      }
      const winCols=2+Math.floor(Math.random()*4);
      const floors=2+Math.floor(Math.random()*10);
      // 窓の点灯パターンはビルごとに一度だけ確定（毎フレーム再抽選するとチカチカする）
      const winLit=Array.from({length:winCols*floors},()=>Math.random()<0.34);
      envObjs.push({
        id:++_envId,
        segIdx:i,
        side,
        type:'building',
        // ワールド単位でサイズ指定(ROADW基準)
        ww: 600+Math.random()*1200,
        wh: 2000+Math.random()*6000,
        c1:NEON[Math.floor(Math.random()*NEON.length)],
        c2:NEON[Math.floor(Math.random()*NEON.length)],
        fl:floors,
        winCols,
        winLit,
        // ビル: スカイライン変化用のセットバック（上段の後退したブロック）とアンテナ
        setback: Math.random()<0.32,
        setbackW: 0.48+Math.random()*0.22,
        setbackH: 0.16+Math.random()*0.16,
        antenna: Math.random()<0.35,
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
// road segment 描画用: sy を描画下端 HB+20 でクランプ（台形が画面外にはみ出さない）
function proj(worldZ,cxAcc){
  if(worldZ<=0)return null;
  const s=CAM_D/worldZ;
  return{
    scale:s,
    cx:W*0.5 - (cxAcc||0),
    sy:Math.min(H*0.5 + s*CAM_H*(H*0.5), HB+20),
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

// ── 他車の寸法・画面外判定・衝突判定（描画と必ず同じ基準を使う）──
// モデルのローカル最大寸法（高さ y・長さ z）。実寸 = 値 × WORLD_CAR_HALF_W × TYPE_SCALE（16c）。
// 車体は「後端が Zw、前端が Zw+長さ」（ローカル z=0 が後端）。
const CAR_LOCAL={ferrari328:{y:1.44,z:2.2},f40:{y:1.22,z:2.4},sedan:{y:1.48,z:2.5},coupe:{y:1.40,z:2.3},compact80:{y:1.52,z:2.25},saloon80:{y:1.36,z:2.85},executive80:{y:1.60,z:2.95},truck:{y:1.69,z:4.5}};
function carWorldSize(type){
  const k=(typeof WORLD_CAR_HALF_W==='number'?WORLD_CAR_HALF_W:312.5)
         *((typeof TYPE_SCALE!=='undefined'&&TYPE_SCALE[type])||1);
  const l=CAR_LOCAL[type]||CAR_LOCAL.ferrari328;
  return {roof:l.y*k, len:l.z*k, half:k*1.05};
}
// 自車の車体サイズ（ガレージで選んだ車で変わる: Garage.applyToPlayer）。初期値は ferrari328
let PLAYER_LEN=2.2*312.5, PLAYER_HW=0.164, PLAYER_MASS=0.9;
// 前端の屋根（車の中で画面上いちばん高い点）が画面下端 HB に達する前端Z。
// 前端Z がこれ以下になると、車全体が画面の下へ出ている。
function carBelowZ(roof){
  const ys=SH*0.5;
  return CAM_D*ys*Math.max(1,CAM_H-roof)/Math.max(1,HB-ys);
}
// 画面外か（描画を省略してよいか）。見えている部分があるかを、いちばん奥の前端で判定する
// （前端は後端より中心寄りにあるので、前端が出ていれば車全体が出ている）。
function carOffscreen(relZ,xWorld,type){
  const d=carWorldSize(type), zf=relZ+d.len;
  if(zf<=30) return true;                                   // 全体がカメラの真下/後ろ
  const ys=SH*0.5, s=CAM_D/zf;
  if(ys+s*(CAM_H-d.roof)*ys>=HB+4) return true;             // 前端の屋根が画面下端より下
  const cx=W*0.5+xWorld*s*W*0.5, hw=d.half*s*W*0.5;
  return cx-hw>W+8||cx+hw<-8;                               // 左右の外
}
// 追い越されて画面の下へ完全に出た車を消す前端Z / 画面の下の外（後方）への出現位置
function carCullFrontZ(type){ return 0.5*carBelowZ(carWorldSize(type).roof); }
function carBehindSpawnRelZ(type){ const d=carWorldSize(type); return 0.9*carBelowZ(d.roof)-d.len; }
// 自車と接触しているか（相対Z）。後端同士の差で、互いの車体の長さが重なる範囲（8割で判定）。
function carTouchesPlayer(relZ,type){
  const d=carWorldSize(type);
  // v1.4.0: 車体が実際に触れた時（以前は互いに2割食い込むまで衝突にならず、その間は車体が重なって見えた）
  return relZ+d.len>PLAYER_Z && relZ<PLAYER_Z+PLAYER_LEN;
}

// ── 道路の外側に置く物の中心位置 ──
// 縁石(路肩の帯)まで含めて道路とみなす余白 ROAD_EDGE_CLEAR を取り、その外側に「半幅」ぶん離す。
// 半幅は 建物=bwpx（左右 bx±bwpx で描く）/ 木=全幅の半分。
const ROAD_EDGE_CLEAR=1.08;
function roadsideCenterOffset(fw,halfWidthPx){ return fw*ROAD_EDGE_CLEAR+halfWidthPx+4; }

// 旧 playerCarRef()（スクリーン比率ベースの車サイズ基準）は廃止。
// 車体サイズは WORLD_CAR_HALF_W（ワールド単位の定数）に統一され、
// road と同一の _projWorld() で投影されるため、別途リファレンスは不要。

// ════════════════════════════════════
// ゲーム制御
// ════════════════════════════════════
// プレイを始めたら Auto Drone も自動で始める（デスクトップ・スマホ共通。Auto Drone カードの現在の設定のまま）。
// すでに再生中なら何もしない（START を再度押すと止まってしまう）。ボタンの処理は非同期で、再生中を示す
// クラスが付くまでに少し時間がかかるので、短時間の二重呼び出しも防ぐ。
let _adKickAt=-1e9;
function ensureAutoDrone(){
  const now=(typeof performance!=='undefined'&&performance.now)?performance.now():Date.now();
  if(now-_adKickAt<2000)return;
  const b=document.getElementById('autoDroneBtn');
  if(b&&!b.classList.contains('playing')){_adKickAt=now;b.click();}
}
// ゲームオーバー→デモへ戻る予約（endGame）を、再スタートや次のゲームオーバーで無効にするための番号
let overToken=0;
function startGame(){
  if(typeof Garage!=='undefined'&&!Garage.ready())return;   // 未購入の車を見ている時は、開始ではなく購入（コイン不足ならメッセージ）
  initSound();
  ensureAutoDrone();
  mode=MODE.PLAY;
  game.hp=game.maxHp;game.dist=0;game.hitTimer=0;game.overTimer=0;game.nextStar=STAR_FIRST_DIST;game.nextHeart=HEART_FIRST[0]+Math.random()*(HEART_FIRST[1]-HEART_FIRST[0]);
  cam.pos=0;player.x=PLAYER_START_X;player.xv=0;player.speed=0;player.bank=0;player.inv=0;player.energy=0;
  player.slip=0;player.slipV=0;player.slideV=0;
  overToken++;                                              // 直前のゲームオーバーの「3.5秒後にデモへ戻る」予約を無効にする（再スタート直後に新しいゲームがデモへ戻されるバグの修正）
  traffic=[];bonusStars=[];bonusHearts=[];bonusCoins=[];bonusEnergy=[];spawnTick=0;
  game.coins=0;game.nextCoin=COIN_FIRST[0]+Math.random()*(COIN_FIRST[1]-COIN_FIRST[0]);game.nextEnergy=ENERGY_FIRST[0]+Math.random()*(ENERGY_FIRST[1]-ENERGY_FIRST[0]);
  if(typeof Garage!=='undefined'){Garage.close();Garage.applyToPlayer();}
  addLog('GAME START!  ↑ACCEL  ↓BRAKE  ←→STEER');
  const gb=document.getElementById('vfdGameBtn');
  if(gb){gb.textContent='DEMO';gb.classList.remove('btn-red');gb.classList.add('btn');}
}

// pushDir: 車体が流れる向き(+1=右 / -1=左)。相手車なら「相手から離れる側」、
//          路肩なら「中央へ戻る側」を呼び出し側が渡す。未指定/0(真横一致)のみランダム。
// 自車の衝突スリップ（横滑り）。kick={yaw,slide} があればそれを使う（衝突位置・速度・重量で決めた値、16i）。
// なければ従来の固定量（路肩への接触など）。
function applyPlayerKick(dir,kick){
  if(kick){player.slipV=kick.yaw;player.slideV=kick.slide;}
  else{player.slipV=dir*SLIP_KICK;player.slideV=dir*SLIDE_KICK;}
}
// ハートの表示文字列（半分は ½）
function hpText(){const h=Math.max(0,game.hp);return '♥'.repeat(Math.floor(h))+(h%1?'½':'');}
function takeDamage(pushDir,kick){
  if(game.hitTimer>0)return;
  const dir=(pushDir===1||pushDir===-1)?pushDir:((Math.random()<0.5)?1:-1);
  if(player.inv>0){                 // 無敵（星）: ハートは減らない。揺れもごく小さく
    game.hitTimer=30;
    applyPlayerKick(dir,kick?{yaw:kick.yaw*0.25,slide:kick.slide*0.25}:{yaw:dir*SLIP_KICK*0.25,slide:dir*SLIDE_KICK*0.25});
    playCrashSound();
    return;
  }
  playCrashSound();
  game.hp=Math.max(0,game.hp-1);game.hitTimer=90;           // 半ハート(0.5)で被弾しても 0 未満にならない
  // 衝突スリップ: 横転ではなく、ヨー(向き)の振れと横への流れだけ
  applyPlayerKick(dir,kick);
  addLog(`DAMAGE! HP:${hpText()}`);
  if(game.hp<=0)endGame();
}

function endGame(){
  mode=MODE.OVER;
  if(game.dist>game.best)game.best=game.dist;
  addLog(`GAME OVER! ${(game.dist/1000).toFixed(2)}km`);
  if(game.dist>=game.best&&game.dist>0)addLog('★ NEW RECORD!');
  if(typeof Garage!=='undefined')Garage.onGameOver(game.coins);
  const tk=++overToken;
  setTimeout(()=>{
    if(tk!==overToken||mode!==MODE.OVER)return;               // その後に再スタートした/別のゲームオーバーになった場合は何もしない
    mode=MODE.DEMO;
    player.speed=0;player.x=PLAYER_START_X;player.xv=0;player.bank=0;player.inv=0;player.energy=0;
    player.slip=0;player.slipV=0;player.slideV=0;
    traffic=[];bonusStars=[];bonusHearts=[];bonusCoins=[];bonusEnergy=[];
    const gb=document.getElementById('vfdGameBtn');
    if(gb){gb.textContent='PLAY';gb.classList.add('btn-red');gb.classList.remove('btn');}
  },3500);
}

// ════════════════════════════════════
// メインループ
// ════════════════════════════════════
let enabled=true,rafId=null,lastT=0,tunnelA=0;
function getBpm(){return parseFloat(document.getElementById('rhythmBpm')?.value||'120');}

