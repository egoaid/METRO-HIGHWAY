// ════════════════════════════════════
// 車描画
// ════════════════════════════════════



// ════════════════════════════════════════════════════════════
// ── 3D CAR RENDERING SYSTEM v2.1 — Hard Drivin' style ──
//
// 参照: index-jsfiddle-Lzxw7e1q-0.html (MDN WebGL perspective matrix)
// Canvas 2D 上で同等の行列演算を実行。Float32Array は使わない。
//
// ── 行列演算（plain array, column-major 4x4）──
function _m4mul(a, b) {
  const r = [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0];
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[i + k*4] * b[k + j*4];
      r[i + j*4] = s;
    }
  return r;
}
function _m4v(m, x, y, z, w) {
  return [
    m[0]*x + m[4]*y + m[8]*z  + m[12]*w,
    m[1]*x + m[5]*y + m[9]*z  + m[13]*w,
    m[2]*x + m[6]*y + m[10]*z + m[14]*w,
    m[3]*x + m[7]*y + m[11]*z + m[15]*w,
  ];
}
function _mRY(a) { const c=Math.cos(a), s=Math.sin(a);
  return [c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1]; }
function _mRZ(a) { const c=Math.cos(a), s=Math.sin(a);
  return [c,s,0,0, -s,c,0,0, 0,0,1,0, 0,0,0,1]; }
function _mS(sx, sy, sz) {
  return [sx,0,0,0, 0,sy,0,0, 0,0,sz,0, 0,0,0,1]; }
function _mT(tx, ty, tz) {
  return [1,0,0,0, 0,1,0,0, 0,0,1,0, tx,ty,tz,1]; }

// ── 透視投影（道路と完全に同一のカメラパラメータ）──
// road の proj()/projFull() と同じ CAM_D / CAM_H のみを使用する。
// 専用の CAR3D_F / FOV は廃止 — 道路と車が別々の消失点を持つ
// 不整合（二重カメラ問題）の根本原因だったため。
//
// 導出（projFull()と同一）:
//   s  = CAM_D / Zw
//   sx = W/2 - cxAccPx + Xw * s * (W/2)        ← road の cx,sw と同じ式
//   sy = (H/2 + s*CAM_H*(H/2)) - Yw * s * (H/2) ← road の sy(地面)から高さ分を引く
//
// Xw, Yw, Zw はワールド単位（road の ROADW と同じ単位系）。
// cxAccPx は road のカーブによるスクリーン空間オフセット（proj()のcxAcc）。
function _projWorld(Xw, Yw, Zw, cxAccPx) {
  if (Zw <= 0.5) return null;
  const s = CAM_D / Zw;
  return {
    sx: (W * 0.5 - (cxAccPx || 0)) + Xw * s * (W * 0.5),
    sy: (H * 0.5 + s * CAM_H * (H * 0.5)) - Yw * s * (H * 0.5),
  };
}

// ── 車体ワールドサイズ定数 ──
// road と同一の透視式を共有するため、車体は画面比率ではなく
// 「ワールド単位の実サイズ」で定義する。解像度(W,H)に依存しない定数。
// 導出: 旧仕様でプレイヤー車が PLAYER_Z において画面幅の10%(=W*0.10)の
//半幅で見えていたことに合わせて逆算 (W非依存になるよう整理):
//   halfW_px = WORLD_CAR_HALF_W * (CAM_D/PLAYER_Z) * (W*0.5) = W*0.10
//   → WORLD_CAR_HALF_W = 0.20 * PLAYER_Z / CAM_D
const WORLD_CAR_HALF_W = 0.20 * PLAYER_Z / CAM_D;  // ワールド単位（ROADWと同じ単位系）

// ── ユーティリティ ──
function _hexA(hex, a) {
  if (!hex || hex[0] !== '#') return `rgba(93,240,200,${a})`;
  const r = parseInt(hex.slice(1,3),16),
        gr = parseInt(hex.slice(3,5),16),
        b  = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${gr},${b},${a})`;
}

// フラットシェーディング: 光源は上方やや後方
function _shade(col, ny, nz, alpha) {
  const lum = Math.max(0.22, 0.52 + ny*0.36 + nz*0.18);
  // lum(面の明るさ)はRGBの減衰にのみ使う。alpha(不透明度)には掛けない。
  // 旧実装は alpha*lum をそのままアルファチャンネルに渡していたため、
  // 光が当たりにくい向きの面ほど「暗い」だけでなく「透明」にもなり、
  // 背景のネオンライン等が車体パネル越しに透けて見える原因になっていた
  // （実際にNode.js+@napi-rs/canvasでピクセル値を検証し確認済み）。
  const r = parseInt(col.slice(1,3),16), g = parseInt(col.slice(3,5),16), b = parseInt(col.slice(5,7),16);
  const dr = Math.round(r*lum), dg = Math.round(g*lum), db = Math.round(b*lum);
  return `rgba(${dr},${dg},${db},${alpha})`;
}

// 背面カリング — カメラ空間で法線ベクトルと視線方向の内積で判定
// cam0,cam1,cam2: カメラ空間の3Dベクトル [x,y,z]
// 法線 = (cam1-cam0) × (cam2-cam0)
// dot(法線, cam0) < 0 → カメラに向いている → 描画
// スクリーン空間2D外積は透視変換後のyaw回転で破綻するため使わない
function _isFrontCam(cam0, cam1, cam2) {
  const e1x=cam1[0]-cam0[0], e1y=cam1[1]-cam0[1], e1z=cam1[2]-cam0[2];
  const e2x=cam2[0]-cam0[0], e2y=cam2[1]-cam0[1], e2z=cam2[2]-cam0[2];
  const nx = e1y*e2z - e1z*e2y;
  const ny = e1z*e2x - e1x*e2z;
  const nz = e1x*e2y - e1y*e2x;
  // カメラは原点(0,0,0)なので視線ベクトル = cam0 - origin = cam0
  return (nx*cam0[0] + ny*cam0[1] + nz*cam0[2]) < 0;
}
// ── Newell法による多角形法線カリング ──
// _isFrontCam(cam0,cam1,cam2) は面の最初の3頂点だけで法線を計算するため、
// 横幅の広い四角形（ボンネット等）では、その3点がたまたま与える法線が
// 面全体の実際の向きと食い違うことがあり、特定のyaw角度で本来見えるべき
// 面を誤ってカリングし、背景が透ける穴の原因になっていた（実際に
// Node.js+@napi-rs/canvasでカリングを無効化すると穴が消えることを
// 確認して特定）。Newell法は全頂点を使うため、頂点の選び方に依存せず
// 常に面全体を代表する法線を返す。
function _isFrontCamN(camPts) {
  let nx=0, ny=0, nz=0, cx=0, cy=0, cz=0;
  const n = camPts.length;
  for (let i = 0; i < n; i++) {
    const a = camPts[i], b = camPts[(i+1)%n];
    nx += (a[1]-b[1])*(a[2]+b[2]);
    ny += (a[2]-b[2])*(a[0]+b[0]);
    nz += (a[0]-b[0])*(a[1]+b[1]);
    cx += a[0]; cy += a[1]; cz += a[2];
  }
  cx /= n; cy /= n; cz /= n;
  // 視点は原点ではなく (0, CAM_H, 0)。_projWorld の投影式
  // (sy = H/2 + (CAM_H - Y)*CAM_D/Z*H/2) と同一のカメラ位置で判定する。
  // 原点基準だと、視点より低い車の屋根/ボンネット等の上向き面が
  // 「裏向き」と誤判定されて描かれず、車が上の開いた殻に見えていた。
  return (nx*cx + ny*(cy - CAM_H) + nz*cz) < 0;
}
// 後方互換用（スクリーン空間版 - 使用箇所なし）
function _isFront(p0, p1, p2) {
  const ax=p1.sx-p0.sx, ay=p1.sy-p0.sy;
  const bx=p2.sx-p0.sx, by=p2.sy-p0.sy;
  return (ax*by-ay*bx)>0;
}

// ポリゴン描画
function _poly(g, pts, fill, stroke, lw) {
  if (!pts || pts.some(p => !p || p.clip)) return;
  g.fillStyle = fill;
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw || 0.8; }
  g.beginPath();
  g.moveTo(pts[0].sx, pts[0].sy);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].sx, pts[i].sy);
  g.closePath();
  g.fill();
  if (stroke) g.stroke();
}

// ════════════════════════════════════════════════
// ── 車体頂点定義（ローカル座標）──
// X=右±, Y=上(0=地面), Z=前方(0=リア,正=フロント)
// スケール: X±1.0=半幅, Y=高さ比, Z=奥行比
// ════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════
// ── 車体頂点定義（ローカル座標）── [2026-07 トポロジー全面再設計]
// X=右±, Y=上(0=地面), Z=前方(0=リア,正=フロント)
//
// 旧デザインには、トランクデッキ/カウル境界(TRL,TRR,TFL,TFR,CBL,CBR)
// 周辺で「同じ1本の稜線を3つの面（垂直パネル・デッキ・ガラス）が
// 同時に共有する」という、閉じた2-manifoldとして数学的に無効な
// 構造があった（非多様体エッジ、全5車種で検証・確認済み）。
// 今回、グリーンハウス（ルーフ+ガラス）をベルトライン矩形の上に
// 直接乗る単純なフラスタム（Hard Drivin'流のシンプルな箱型）として
// 再設計し、全車種で watertight（境界エッジ0・非多様体エッジ0・
// 法線の向き整合）を Python(trimesh)で検証した。
// ════════════════════════════════════════════════════════════

// Ferrari 328 風ボディ。2026-07 トポロジー全面再設計（watertight検証済み・頂点12/面10）
// ════════════════════════════════════════════════════════════
// ── 車体頂点定義（ローカル座標）── [2026-07 ウェッジ型に全面再設計]
// X=右±, Y=上(0=地面), Z=前方(0=リア,正=フロント)
//
// 単純な2段ボックス構成（旧版）から、ボンネット→カウル→フロント
// ガラス→ルーフ→リアガラス→トランクという6ステーションの
// プロファイルを持つ「くさび形」に再設計。各ステーション間は
// ちょうど2面が共有する構造にし、側面はプロファイル全体を1枚の
// hexagonでつなぐことで watertight を保証（Python/trimeshで
// 全車種 watertight・法線整合・euler数=2（f40はwing込みで4）を検証済み）。
// 全パネルは不透明(alpha=1.0)。窓もガラスも透明表現はしない。
// ════════════════════════════════════════════════════════════

// Ferrari 328 風ボディ。2026-07 ウェッジ型に全面再設計（ボンネット/カウル/フロントガラス/ルーフ/リアガラス/トランクの6角形プロファイル。watertight検証済み）
const _V328 = {
  BRL:[-1.00, 0.00, 0.00], BRR:[1.00, 0.00, 0.00],
  BFL:[-1.00, 0.00, 2.20], BFR:[1.00, 0.00, 2.20],
  BHL:[-1.02, 0.62, 0.00], BHR:[1.02, 0.62, 0.00],
  BHFL:[-1.02, 0.62, 1.85], BHFR:[1.02, 0.62, 1.85],
  CWL:[-0.86, 0.95, 1.50], CWR:[0.86, 0.95, 1.50],
  RFL:[-0.42, 1.44, 1.25], RFR:[0.42, 1.44, 1.25],
  RRL:[-0.42, 1.44, 0.55], RRR:[0.42, 1.44, 0.55],
  TWL:[-0.55, 0.85, 0.30], TWR:[0.55, 0.85, 0.30],
};

// Ferrari F40 風ボディ + ウィング（ウィングは薄いソリッドとして閉じている）
const _VF40 = {
  BRL:[-1.05, 0.00, 0.00], BRR:[1.05, 0.00, 0.00],
  BFL:[-1.05, 0.00, 2.40], BFR:[1.05, 0.00, 2.40],
  BHL:[-1.07, 0.55, 0.00], BHR:[1.07, 0.55, 0.00],
  BHFL:[-1.07, 0.55, 2.00], BHFR:[1.07, 0.55, 2.00],
  CWL:[-0.90, 0.85, 1.65], CWR:[0.90, 0.85, 1.65],
  RFL:[-0.44, 1.22, 1.40], RFR:[0.44, 1.22, 1.40],
  RRL:[-0.44, 1.22, 0.65], RRR:[0.44, 1.22, 0.65],
  TWL:[-0.60, 0.72, 0.35], TWR:[0.60, 0.72, 0.35],
  WL:[-1.05, 1.07, 0.22], WR:[1.05, 1.07, 0.22],
  WFL:[-1.05, 1.07, 0.58], WFR:[1.05, 1.07, 0.58],
  WL_b:[-1.05, 1.04, 0.22], WR_b:[1.05, 1.04, 0.22],
  WFL_b:[-1.05, 1.04, 0.58], WFR_b:[1.05, 1.04, 0.58],
};

// セダン風ボディ（ウェッジ型、直立気味のプロファイル）
const _VSED = {
  BRL:[-1.00, 0.00, 0.00], BRR:[1.00, 0.00, 0.00],
  BFL:[-1.00, 0.00, 2.50], BFR:[1.00, 0.00, 2.50],
  BHL:[-1.02, 0.68, 0.00], BHR:[1.02, 0.68, 0.00],
  BHFL:[-1.02, 0.68, 2.05], BHFR:[1.02, 0.68, 2.05],
  CWL:[-0.86, 1.05, 1.65], CWR:[0.86, 1.05, 1.65],
  RFL:[-0.50, 1.48, 1.40], RFR:[0.50, 1.48, 1.40],
  RRL:[-0.50, 1.48, 0.70], RRR:[0.50, 1.48, 0.70],
  TWL:[-0.62, 0.94, 0.45], TWR:[0.62, 0.94, 0.45],
};

// クーペ風ボディ（ウェッジ型）
const _VCPE = {
  BRL:[-1.02, 0.00, 0.00], BRR:[1.02, 0.00, 0.00],
  BFL:[-1.02, 0.00, 2.30], BFR:[1.02, 0.00, 2.30],
  BHL:[-1.04, 0.60, 0.00], BHR:[1.04, 0.60, 0.00],
  BHFL:[-1.04, 0.60, 1.95], BHFR:[1.04, 0.60, 1.95],
  CWL:[-0.88, 0.92, 1.55], CWR:[0.88, 0.92, 1.55],
  RFL:[-0.42, 1.40, 1.35], RFR:[0.42, 1.40, 1.35],
  RRL:[-0.42, 1.40, 0.62], RRR:[0.42, 1.40, 0.62],
  TWL:[-0.52, 0.86, 0.35], TWR:[0.52, 0.86, 0.35],
};

// トラック（庇/eaveの重複ジオメトリを除去、watertight検証済み・頂点12/面12）
// トラック（庇/eave除去 + 2026-07 長辺分割によるペインターズソート精度向上、watertight検証済み）
// 元は floor/roof/side が4.5ユニットの全長を1面の平均Zでソートしており、
// 斜め視点で著しい前後判定ミスが起きていた（Node.js+@napi-rs/canvasで
// yaw=175°において穴10000px超を実測）。中央(z=2.25)で前後半分に分割し、
// 各半分が自身に近いローカルな深度でソートされるようにした。
function _faces328() {
  return [
    {k:['BRR','BRL','BHL','BHR'], ny:0.0, nz:1.0, t:'body', z:0.0},
    {k:['BFL','BHFL','BHL','BRL'], ny:-0.35, nz:0, t:'sideL', z:1.01},
    {k:['BHR','BHFR','BFR','BRR'], ny:-0.1, nz:0, t:'sideR', z:1.01},
    {k:['BRR','BFR','BFL','BRL'], ny:-1.0, nz:-0.0, t:'floor', z:1.1},
    {k:['BHFR','BHFL','BFL','BFR'], ny:0.49, nz:-0.87, t:'body', z:2.03},
    {k:['BHFL','BHFR','CWR','CWL'], ny:0.73, nz:-0.69, t:'body', z:1.68},
    {k:['CWL','CWR','RFR','RFL'], ny:0.45, nz:-0.89, t:'glass', z:1.38},
    {k:['RRR','RRL','RFL','RFR'], ny:1.0, nz:-0.0, t:'roof', z:0.9},
    {k:['RRL','RRR','TWR','TWL'], ny:0.39, nz:0.92, t:'glass', z:0.43},
    {k:['TWL','TWR','BHR','BHL'], ny:0.79, nz:0.61, t:'body', z:0.15},
    // ── サイドパネル4面（旧: 4頂点クアッド）は三角形2枚に分割 ──
    // これら4面の頂点は3D空間で平面上に乗っておらず（ベルトライン/
    // カウル/ルーフ/トランクが異なるXにあるため）、クアッドのまま
    // 描画すると投影後に「ねじれた」自己交差ポリゴンとなり、パネルが
    // めくれ上がって見えたり面同士が繋がっていないように見える原因に
        // なっていた（Node.js+@napi-rs/canvasでyaw込みの実投影を行い、
    // 4点の平面性を数値検証（スカラー三重積）して確認済み）。
    // 三角形は3点なので常に平面 = 常に非自己交差。対角線は2通りの
    // 分割のうち短い方（=元のクアッドの形状に最も近い自然な折れ線）
    // を選んで統一した。
    {k:['BHFL','CWL','RRL'], ny:-0.35, nz:0, t:'sideL', z:1.29},
    {k:['CWL','RFL','RRL'],  ny:-0.35, nz:0, t:'sideL', z:1.29},
    {k:['BHFL','RRL','BHL'], ny:-0.35, nz:0, t:'sideL', z:0.68},
    {k:['RRL','TWL','BHL'],  ny:-0.35, nz:0, t:'sideL', z:0.68},
    {k:['BHFR','BHR','RRR'], ny:-0.1, nz:0, t:'sideR', z:0.68},
    {k:['BHR','TWR','RRR'],  ny:-0.1, nz:0, t:'sideR', z:0.68},
    {k:['BHFR','RRR','CWR'], ny:-0.1, nz:0, t:'sideR', z:1.29},
    {k:['RRR','RFR','CWR'],  ny:-0.1, nz:0, t:'sideR', z:1.29},
  ];
}

function _facesF40() {
  return [
    {k:['BRR','BRL','BHL','BHR'], ny:0.0, nz:1.0, t:'body', z:0.0},
    {k:['BFL','BHFL','BHL','BRL'], ny:-0.35, nz:0, t:'sideL', z:1.1},
    {k:['BHR','BHFR','BFR','BRR'], ny:-0.1, nz:0, t:'sideR', z:1.1},
    {k:['BRR','BFR','BFL','BRL'], ny:-1.0, nz:-0.0, t:'floor', z:1.2},
    {k:['BHFR','BHFL','BFL','BFR'], ny:0.59, nz:-0.81, t:'body', z:2.2},
    {k:['BHFL','BHFR','CWR','CWL'], ny:0.76, nz:-0.65, t:'body', z:1.83},
    {k:['CWL','CWR','RFR','RFL'], ny:0.56, nz:-0.83, t:'glass', z:1.52},
    {k:['RRR','RRL','RFL','RFR'], ny:1.0, nz:-0.0, t:'roof', z:1.02},
    {k:['RRL','RRR','TWR','TWL'], ny:0.51, nz:0.86, t:'glass', z:0.5},
    {k:['TWL','TWR','BHR','BHL'], ny:0.9, nz:0.44, t:'body', z:0.17},
    // ── サイドパネル4面を三角形2枚ずつに分割（詳細は_faces328参照）──
    {k:['BHFL','CWL','RRL'], ny:-0.35, nz:0, t:'sideL', z:1.43},
    {k:['CWL','RFL','RRL'],  ny:-0.35, nz:0, t:'sideL', z:1.43},
    {k:['BHFL','RRL','BHL'], ny:-0.35, nz:0, t:'sideL', z:0.75},
    {k:['RRL','TWL','BHL'],  ny:-0.35, nz:0, t:'sideL', z:0.75},
    {k:['BHFR','BHR','RRR'], ny:-0.1, nz:0, t:'sideR', z:0.75},
    {k:['BHR','TWR','RRR'],  ny:-0.1, nz:0, t:'sideR', z:0.75},
    {k:['BHFR','RRR','CWR'], ny:-0.1, nz:0, t:'sideR', z:1.42},
    {k:['RRR','RFR','CWR'],  ny:-0.1, nz:0, t:'sideR', z:1.42},
    {k:['WR','WL','WFL','WFR'], ny:1.0, nz:-0.0, t:'wing', z:0.4},
    {k:['WL_b','WR_b','WFR_b','WFL_b'], ny:-1.0, nz:-0.0, t:'wing', z:0.4},
    {k:['WL','WL_b','WFL_b','WFL'], ny:0.0, nz:-0.0, t:'body', z:0.4},
    {k:['WR','WFR','WFR_b','WR_b'], ny:0.0, nz:-0.0, t:'body', z:0.4},
    {k:['WR_b','WL_b','WL','WR'], ny:0.0, nz:1.0, t:'body', z:0.22},
    {k:['WFL_b','WFR_b','WFR','WFL'], ny:0.0, nz:-1.0, t:'body', z:0.58},
  ];
}

function _facesSed() {
  return [
    {k:['BRR','BRL','BHL','BHR'], ny:0.0, nz:1.0, t:'body', z:0.0},
    {k:['BFL','BHFL','BHL','BRL'], ny:-0.35, nz:0, t:'sideL', z:1.14},
    {k:['BHR','BHFR','BFR','BRR'], ny:-0.1, nz:0, t:'sideR', z:1.14},
    {k:['BRR','BFR','BFL','BRL'], ny:-1.0, nz:-0.0, t:'floor', z:1.25},
    {k:['BHFR','BHFL','BFL','BFR'], ny:0.55, nz:-0.83, t:'body', z:2.27},
    {k:['BHFL','BHFR','CWR','CWL'], ny:0.73, nz:-0.68, t:'body', z:1.85},
    {k:['CWL','CWR','RFR','RFL'], ny:0.5, nz:-0.86, t:'glass', z:1.52},
    {k:['RRR','RRL','RFL','RFR'], ny:1.0, nz:-0.0, t:'roof', z:1.05},
    {k:['RRL','RRR','TWR','TWL'], ny:0.42, nz:0.91, t:'glass', z:0.57},
    {k:['TWL','TWR','BHR','BHL'], ny:0.87, nz:0.5, t:'body', z:0.23},
    // ── サイドパネル4面を三角形2枚ずつに分割（詳細は_faces328参照）──
    {k:['BHFL','CWL','RRL'], ny:-0.35, nz:0, t:'sideL', z:1.45},
    {k:['CWL','RFL','RRL'],  ny:-0.35, nz:0, t:'sideL', z:1.45},
    {k:['BHFL','RRL','BHL'], ny:-0.35, nz:0, t:'sideL', z:0.8},
    {k:['RRL','TWL','BHL'],  ny:-0.35, nz:0, t:'sideL', z:0.8},
    {k:['BHFR','BHR','RRR'], ny:-0.1, nz:0, t:'sideR', z:0.8},
    {k:['BHR','TWR','RRR'],  ny:-0.1, nz:0, t:'sideR', z:0.8},
    {k:['BHFR','RRR','CWR'], ny:-0.1, nz:0, t:'sideR', z:1.45},
    {k:['RRR','RFR','CWR'],  ny:-0.1, nz:0, t:'sideR', z:1.45},
  ];
}

function _facesCpe() {
  return [
    {k:['BRR','BRL','BHL','BHR'], ny:0.0, nz:1.0, t:'body', z:0.0},
    {k:['BFL','BHFL','BHL','BRL'], ny:-0.35, nz:0, t:'sideL', z:1.06},
    {k:['BHR','BHFR','BFR','BRR'], ny:-0.1, nz:0, t:'sideR', z:1.06},
    {k:['BRR','BFR','BFL','BRL'], ny:-1.0, nz:-0.0, t:'floor', z:1.15},
    {k:['BHFR','BHFL','BFL','BFR'], ny:0.5, nz:-0.86, t:'body', z:2.12},
    {k:['BHFL','BHFR','CWR','CWL'], ny:0.78, nz:-0.62, t:'body', z:1.75},
    {k:['CWL','CWR','RFR','RFL'], ny:0.38, nz:-0.92, t:'glass', z:1.45},
    {k:['RRR','RRL','RFL','RFR'], ny:1.0, nz:-0.0, t:'roof', z:0.98},
    {k:['RRL','RRR','TWR','TWL'], ny:0.45, nz:0.89, t:'glass', z:0.48},
    {k:['TWL','TWR','BHR','BHL'], ny:0.8, nz:0.6, t:'body', z:0.17},
    // ── サイドパネル4面を三角形2枚ずつに分割（詳細は_faces328参照）──
    {k:['BHFL','CWL','RRL'], ny:-0.35, nz:0, t:'sideL', z:1.37},
    {k:['CWL','RFL','RRL'],  ny:-0.35, nz:0, t:'sideL', z:1.37},
    {k:['BHFL','RRL','BHL'], ny:-0.35, nz:0, t:'sideL', z:0.73},
    {k:['RRL','TWL','BHL'],  ny:-0.35, nz:0, t:'sideL', z:0.73},
    {k:['BHFR','BHR','RRR'], ny:-0.1, nz:0, t:'sideR', z:0.73},
    {k:['BHR','TWR','RRR'],  ny:-0.1, nz:0, t:'sideR', z:0.73},
    {k:['BHFR','RRR','CWR'], ny:-0.1, nz:0, t:'sideR', z:1.37},
    {k:['RRR','RFR','CWR'],  ny:-0.1, nz:0, t:'sideR', z:1.37},
  ];
}

const _VTRK = {
  BRL:[-1.10, 0.00, 0.00], BRR:[1.10, 0.00, 0.00], BFL:[-1.10, 0.00, 4.50],
  BFR:[1.10, 0.00, 4.50], BHL:[-1.12, 0.22, 0.00], BHR:[1.12, 0.22, 0.00],
  BHFL:[-1.12, 0.22, 4.50], BHFR:[1.12, 0.22, 4.50], CTL:[-1.10, 1.69, 0.00],
  CTR:[1.10, 1.69, 0.00], CTFL:[-1.10, 1.69, 4.50], CTFR:[1.10, 1.69, 4.50],
  BML:[-1.10, 0.00, 2.25], BMR:[1.10, 0.00, 2.25], BHML:[-1.12, 0.22, 2.25],
  BHMR:[1.12, 0.22, 2.25], CTML:[-1.10, 1.69, 2.25], CTMR:[1.10, 1.69, 2.25],
};

function _facesTrk() {
  return [
    {k:['BRR','BRL','BHL','BHR'], ny:0, nz:1, t:'body', z:0.0},
    {k:['BHR','BHL','CTL','CTR'], ny:0, nz:1, t:'body', z:0.1},
    {k:['CTR','CTL','CTML','CTMR'], ny:1, nz:0, t:'roof', z:1.1},
    {k:['CTMR','CTML','CTFL','CTFR'], ny:1, nz:0, t:'roof', z:3.4},
    {k:['BFL','BHFL','BHML','BML'], ny:0, nz:0, t:'sideL', z:3.4},
    {k:['BML','BHML','BHL','BRL'], ny:0, nz:0, t:'sideL', z:1.1},
    {k:['BHFL','CTFL','CTML','BHML'], ny:0, nz:0, t:'sideL', z:3.4},
    {k:['BHML','CTML','CTL','BHL'], ny:0, nz:0, t:'sideL', z:1.1},
    {k:['BHR','BHMR','BMR','BRR'], ny:0, nz:0, t:'sideR', z:1.1},
    {k:['BHMR','BHFR','BFR','BMR'], ny:0, nz:0, t:'sideR', z:3.4},
    {k:['CTR','CTMR','BHMR','BHR'], ny:0, nz:0, t:'sideR', z:1.1},
    {k:['CTMR','CTFR','BHFR','BHMR'], ny:0, nz:0, t:'sideR', z:3.4},
    {k:['BRR','BMR','BML','BRL'], ny:-1, nz:0, t:'floor', z:1.1},
    {k:['BMR','BFR','BFL','BML'], ny:-1, nz:0, t:'floor', z:3.4},
    {k:['BFL','BFR','BHFR'], ny:0, nz:-1, t:'body', z:4.5},
    {k:['BFL','BHFR','CTFR'], ny:0, nz:-1, t:'body', z:3.5},
    {k:['BFL','CTFR','CTFL'], ny:0, nz:-1, t:'body', z:4.5},
    {k:['BFL','CTFL','BHFL'], ny:0, nz:-1, t:'body', z:3.5},
  ];
}
// ── 面タイプ別描画 ──
// camPts: カメラ空間座標マップ（カリング用）
function _drawFace(g, pts, camPts, face, bodyCol, glowCol) {
  const fp = face.k.map(k => pts[k]);
  if (!fp || fp.some(p => !p || p.clip)) return;
  // カメラ空間法線でカリング（スクリーン空間2D外積より正確、全頂点使用）
  const cp = face.k.map(k => camPts[k]);
  if (cp.every(p => p && p[2] > 0.5)) {
    if (!_isFrontCamN(cp)) return;
  }

  const lw = Math.max(0.5, Math.abs((fp[0].sx||0) - (fp[1]||fp[0]).sx) * 0.018);

  switch (face.t) {
    case 'body':
      _poly(g, fp, _shade(bodyCol, face.ny, face.nz, 1.0), _hexA(glowCol, 0.25), lw);
      break;
    case 'roof':
      _poly(g, fp, _shade(bodyCol, face.ny, face.nz, 1.0), _hexA(glowCol, 0.18), lw);
      break;
    case 'sideL':
      // 左側面: 光源から遠め（暗め）— alphaは常に1.0、暗さはlumのみで表現
      _poly(g, fp, _shade(bodyCol, -0.35, 0, 1.0), _hexA(glowCol, 0.15), lw * 0.8);
      break;
    case 'sideR':
      // 右側面: やや明るめ — alphaは常に1.0、暗さはlumのみで表現
      _poly(g, fp, _shade(bodyCol, -0.10, 0, 1.0), _hexA(glowCol, 0.18), lw * 0.8);
      break;
    case 'glass':
    case 'glassL':
    case 'glassR':
      // 窓ガラスも完全不透明の単色パネルとして描画（透明表現はしない）。
      // 旧色 rgb(8,18,40) は実際の道路背景色 #071528(=rgb(7,21,40)) と
      // ほぼ同一で、夜間シーンでは背景に溶け込んでパネルが消えて見える
      // ことがあった（車両の角度・位置によって「面が閉じたり開いたり
      // する」ように見えた原因）。全背景色（空・道路4種）との色距離を
      // 計算し、最も離れた配色に変更した。
      _poly(g, fp, 'rgb(24,42,72)', _hexA(glowCol, 0.4), lw * 0.9);
      break;
    case 'wing':
      _poly(g, fp, _shade(bodyCol, face.ny, face.nz, 1.0), _hexA(glowCol, 0.32), lw * 0.75);
      break;
    case 'floor':
      _poly(g, fp, 'rgb(4,6,10)', null, 0);
      break;
  }
}

// ── ライト/ナンバー: 車体の面に張り付く3Dデカール ──
// 旧実装は画面座標の軸平行矩形で、向きに関係なく常に最前面へ描いていた
// （対向車の正面にテールライトとナンバーが出る、回転すると形が破綻する）。
// 今は母面(hosts)上の点を (u,v) 双線形補間でモデル空間の3D四角形にし、
//   ・母面の直後に描く（母面より手前の面があれば隠れる）
//   ・デカール自身の法線でカリング（見えている側の面にだけ出る）
//   ・投影は車体頂点と同じ _projWorld
// なので、3D空間として矛盾しない。
const _DECAL_STYLE = {
  tail:   { fill:'rgb(221,16,32)',   glow:'#ff2040' },
  tailHi: { fill:'rgb(255,48,80)',   glow:null },
  brake:  { fill:'rgb(255,64,96)',   glow:'#ff2040' },
  plate:  { fill:'rgb(228,226,208)', glow:null },
  head:   { fill:'rgb(255,246,216)', glow:'#ffffaa' },
  headHi: { fill:'rgb(255,255,255)', glow:null },
  backup: { fill:'rgb(255,255,210)', glow:'#ffffff' },
};
function _lerp3(a, b, t) { return [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t]; }
function _newellModel(P) {
  let nx=0, ny=0, nz=0;
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i+1)%P.length];
    nx += (a[1]-b[1])*(a[2]+b[2]);
    ny += (a[2]-b[2])*(a[0]+b[0]);
    nz += (a[0]-b[0])*(a[1]+b[1]);
  }
  return [nx, ny, nz];
}
// 母面クアッド hk=[p0,p1,p2,p3] 上の点 (u:p0→p1, v:下辺→上辺)。母面が平面なら結果も同一平面上。
function _hostPt(V, hk, u, v) {
  const a = _lerp3(V[hk[0]], V[hk[1]], u), b = _lerp3(V[hk[3]], V[hk[2]], u);
  return _lerp3(a, b, v);
}
// corners を outward（母面の外向き法線）側が表になる巻き順に揃える
function _mkDecal(kind, hosts, outward, corners) {
  const n = _newellModel(corners);
  if (n[0]*outward[0] + n[1]*outward[1] + n[2]*outward[2] < 0) corners = corners.slice().reverse();
  return { kind, hosts, corners };
}
function _hostDecals(V, hk, specs) {
  const outward = _newellModel(hk.map(k => V[k]));
  const hosts = [hk.join(',')];
  return specs.map(([kind, u0, u1, v0, v1]) => _mkDecal(kind, hosts, outward, [
    _hostPt(V, hk, u0, v0), _hostPt(V, hk, u1, v0), _hostPt(V, hk, u1, v1), _hostPt(V, hk, u0, v1),
  ]));
}
const _DECAL_CACHE = {};
function _decalsOf(carType) {
  if (_DECAL_CACHE[carType]) return _DECAL_CACHE[carType];
  let out;
  if (carType === 'truck') {
    // 後面: コンテナ後面の下部にテール/バックランプ/ナンバー
    out = _hostDecals(_VTRK, ['BHR','BHL','CTL','CTR'], [
      ['tail',   .03,.17, .02,.10], ['tail',   .83,.97, .02,.10],
      ['tailHi', .03,.09, .05,.10], ['tailHi', .91,.97, .05,.10],
      ['backup', .46,.54, .03,.08],
      ['plate',  .37,.63, .13,.29],
    ]);
    // 前面: z=4.5 の平面（前面は三角形4枚）に左右ヘッドライト
    const fh = ['BFL,BFR,BHFR','BFL,BHFR,CTFR','BFL,CTFR,CTFL','BFL,CTFL,BHFL'];
    const fz = _VTRK.BFL[2], up = [0,0,1];
    const q = (x0,x1,y0,y1) => [[x0,y0,fz],[x1,y0,fz],[x1,y1,fz],[x0,y1,fz]];
    out.push(_mkDecal('head',   fh, up, q(-1.00,-0.70, .40,.62)), _mkDecal('head',   fh, up, q(0.70,1.00, .40,.62)),
             _mkDecal('headHi', fh, up, q(-0.94,-0.78, .46,.58)), _mkDecal('headHi', fh, up, q(0.78,0.94, .46,.58)));
  } else {
    const V = { f40:_VF40, sedan:_VSED, coupe:_VCPE }[carType] || _V328;
    out = _hostDecals(V, ['BRR','BRL','BHL','BHR'], [          // 後面パネル
      ['tail',   .05,.27, .34,.84], ['tail',   .73,.95, .34,.84],
      ['tailHi', .05,.15, .58,.84], ['tailHi', .85,.95, .58,.84],
      ['brake',  .43,.57, .86,.95],
      ['plate',  .36,.64, .08,.42],
    ]).concat(_hostDecals(V, ['BHFR','BHFL','BFL','BFR'], [     // 前面ノーズ（斜面）
      ['head',   .06,.28, .20,.70], ['head',   .72,.94, .20,.70],
      ['headHi', .06,.16, .30,.60], ['headHi', .84,.94, .30,.60],
    ]));
  }
  return (_DECAL_CACHE[carType] = out);
}
function _drawDecal(g, d, model, cxAccPx) {
  const cam = d.corners.map(c => _m4v(model, c[0], c[1], c[2], 1));
  if (cam.some(c => c[2] <= 0.5)) return;
  if (!_isFrontCamN(cam)) return;                 // 見えていない側の面には出さない
  const pts = cam.map(c => { const p = _projWorld(c[0], c[1], c[2], cxAccPx); return { sx: p.sx, sy: p.sy, clip: false }; });
  const st = _DECAL_STYLE[d.kind];
  if (st.glow) {
    const wpx = Math.hypot(pts[1].sx - pts[0].sx, pts[1].sy - pts[0].sy);
    g.shadowColor = st.glow; g.shadowBlur = Math.max(3, wpx * 0.5);
  }
  _poly(g, pts, st.fill, null, 0);
  if (st.glow) g.shadowBlur = 0;
}

// ── 地面影 ──
function _drawShadow(g, pts) {
  const brl = pts.BRL, brr = pts.BRR;
  if (!brl || !brr || brl.clip || brr.clip) return;
  const cx2 = (brl.sx + brr.sx) * 0.5, cy2 = brl.sy;
  // yaw=180°(対向車)ではBRL/BRRのスクリーン上の左右が入れ替わるため
  // (brr.sx - brl.sx) が負になりうる。createRadialGradient/ellipse は
  // 負の半径を渡すと IndexSizeError を投げ、それが sortedTraffic.forEach
  // の外まで伝播して「この車以降、その手前の車が全て描画されない」
  // という重大なバグを引き起こしていた（実際にNode.js+@napi-rs/canvasで
  // 対向車を含む配列を forEach 処理させ、例外で処理が中断することを確認済み）。
  const rw  = Math.max(1, Math.abs(brr.sx - brl.sx) * 1.1);
  const sh  = g.createRadialGradient(cx2, cy2, 0, cx2, cy2, rw);
  sh.addColorStop(0, 'rgba(0,0,0,0.55)'); sh.addColorStop(1, 'transparent');
  g.fillStyle = sh;
  g.beginPath();
  g.ellipse(cx2, cy2, rw, Math.max(2, rw * 0.16), 0, 0, Math.PI * 2);
  g.fill();
}

// ── アンダーグロー ──
function _drawGlow(g, pts, glowCol) {
  const brl = pts.BRL, brr = pts.BRR;
  if (!brl || !brr || brl.clip || brr.clip) return;
  const cx2 = (brl.sx + brr.sx) * 0.5, cy2 = brl.sy;
  // 同上の理由で負の半径を防ぐ
  const rw  = Math.max(1, Math.abs(brr.sx - brl.sx) * 0.70);
  const ug  = g.createRadialGradient(cx2, cy2 + 2, 0, cx2, cy2 + 2, rw);
  ug.addColorStop(0, _hexA(glowCol, 0.22)); ug.addColorStop(1, 'transparent');
  g.fillStyle = ug;
  g.fillRect(cx2 - rw, cy2, rw * 2, 10);
}

// ════════════════════════════════════════════════
// ── drawCar3D: メインエントリポイント ──
//
// Xw, Yw, Zw   : 車体アンカー（後面接地点）のワールド座標
//                Xw=道路中心からの横位置(world units, 例: car.x*ROADW)
//                Yw=0 (地面)
//                Zw=カメラからの距離 (= relZ)
// cxAccPx      : road のカーブによるスクリーン空間オフセット(px)
//                road の proj()/projFull() が使うものと同一の値を渡す。
//                これにより road・車とも同じ消失点・同じカーブ表現を共有する。
// bodyCol      : ボディ色 (#rrggbb)
// glowCol      : グロー色
// yaw          : Y軸回転(rad) — heading（道路に対する車体の絶対的な向き）から渡される。
//                viewAngleは使わない（視差は_projWorld()が自動再現するため）。
// rollZ        : Z軸ロール(rad) — プレーヤーのbank用
// carType      : 'ferrari328'|'f40'|'sedan'|'coupe'|'truck'
// isPlayer     : true=プレーヤー
// hitFlash     : 衝突フラッシュ中
// typeScale    : 車種ごとのワールドサイズ倍率（旧 TYPE_SCALE 相当）
// ════════════════════════════════════════════════
function drawCar3D(g, Xw, Yw, Zw, cxAccPx, bodyCol, glowCol,
                   yaw, rollZ, carType, isPlayer, hitFlash, typeScale) {

  // ── モデル変換行列 ──
  // road と同一の WORLD_CAR_HALF_W（ワールド単位の固定サイズ）でスケール。
  // 画面上のサイズは road と全く同じ _projWorld() が Zw から自動算出するため、
  // ここで relZ に応じたスケール補正は一切行わない（=二重透視の排除）。
  const sx = WORLD_CAR_HALF_W * (typeScale || 1.0);

  // 変換行列: Scale → RollZ → RotY → Translate（ワールド座標へ配置）
  let model = _mS(sx, sx, sx);
  if (rollZ !== 0) model = _m4mul(_mRZ(rollZ), model);
  model = _m4mul(_mRY(yaw), model);
  model = _m4mul(_mT(Xw, Yw, Zw), model);

  // ── 頂点・フェイス選択 ──
  let vObj, fArr;
  switch (carType) {
    case 'f40':   vObj = _VF40;  fArr = _facesF40();  break;
    case 'sedan': vObj = _VSED;  fArr = _facesSed();  break;
    case 'coupe': vObj = _VCPE;  fArr = _facesCpe();  break;
    case 'truck': vObj = _VTRK;  fArr = _facesTrk();  break;
    default:      vObj = _V328;  fArr = _faces328();  break;
  }

  // ── 全頂点投影（road と同一の _projWorld を使用）──
  const pts = {};
  const camPts = {};  // ワールド/カメラ空間座標（カリング・ソート用）
  for (const k in vObj) {
    const v = vObj[k];
    const cam = _m4v(model, v[0], v[1], v[2], 1);
    camPts[k] = cam;
    if (cam[2] <= 0.5) { pts[k] = { sx: W*0.5, sy: H*0.5, clip: true }; continue; }
    const p = _projWorld(cam[0], cam[1], cam[2], cxAccPx);
    pts[k] = p ? { sx: p.sx, sy: p.sy, clip: false }
               : { sx: W*0.5, sy: H*0.5, clip: true };
  }

  // ── 描画 ──
  _drawShadow(g, pts);

  if (hitFlash) {
    // 衝突フラッシュ: 全面白
    const allFaces = fArr.concat();
    allFaces.sort((a,b) => b.z - a.z);
    for (const face of allFaces) {
      const fp = face.k.map(k => pts[k]);
      const cp = face.k.map(k => camPts[k]);
      if (!fp || fp.some(p => !p || p.clip)) continue;
      if (cp.every(p => p) && !_isFrontCamN(cp)) continue;
      _poly(g, fp, 'rgba(255,255,255,0.92)', null, 0);
    }
  } else {
    // 通常描画: 各面の実カメラ空間平均Zでソート（ペインターズアルゴリズム）
    // 固定avgZではなくyaw回転後の実際の奥行きで正しく順序付け
    const facesWithZ = fArr.map(face => {
      const cps = face.k.map(k => camPts[k]).filter(cp => cp && cp[2] > 0);
      const avgCamZ = cps.length > 0
        ? cps.reduce((s, cp) => s + cp[2], 0) / cps.length
        : face.z * 100 + 1000;
      return { face, avgCamZ };
    });
    facesWithZ.sort((a, b) => b.avgCamZ - a.avgCamZ);
    // デカールは「最後に描かれる母面」の直後に挿入する（母面の上に載り、
    // それより後（=手前）に描かれる面には正しく隠される）。
    const sigIdx = new Map();
    facesWithZ.forEach((fz, i) => sigIdx.set(fz.face.k.join(','), i));
    const after = {};
    for (const d of _decalsOf(carType)) {
      let idx = -1;
      for (const h of d.hosts) { const i = sigIdx.get(h); if (i !== undefined && i > idx) idx = i; }
      if (idx < 0) idx = facesWithZ.length - 1;
      (after[idx] = after[idx] || []).push(d);
    }
    facesWithZ.forEach(({ face }, i) => {
      _drawFace(g, pts, camPts, face, bodyCol, glowCol);
      if (after[i]) for (const d of after[i]) _drawDecal(g, d, model, cxAccPx);
    });
  }

  _drawGlow(g, pts, glowCol || bodyCol);
}

// ════════════════════════════════════════════════
// ── 車種ごとのワールドサイズ倍率 ──
// WORLD_CAR_HALF_W（ferrari328基準）に対する相対倍率。
// 旧実装の TYPE_SCALE をそのまま world-unit 版として踏襲。
// ════════════════════════════════════════════════
const TYPE_SCALE = {
  ferrari328: 1.00,
  coupe      : 1.00,
  sedan      : 1.05,
  f40        : 1.05,
  truck      : 1.46,
  bike       : 0.50,
};

// ════════════════════════════════════════════════
// ── drawTrafficCar: ゲームエンジンから呼ばれる ──
// Xw, Zw, cxAccPx を road と同じ単位・基準で受け取り、
// road と全く同じ _projWorld() / WORLD_CAR_HALF_W を共有する。
// ════════════════════════════════════════════════
function drawTrafficCar(g, Xw, Zw, cxAccPx, col, carType, heading, hitFlash) {
  // 距離フェード: 遠いほど薄く、極小なら描画スキップ
  const s = CAM_D / Zw;
  const approxHalfPx = WORLD_CAR_HALF_W * (TYPE_SCALE[carType] || 1.0) * s * (W * 0.5);
  const alpha = Math.min(1, Math.max(0.5, approxHalfPx / 3));
  if (alpha < 0.12 || approxHalfPx < 1) return;
  g.globalAlpha = alpha;

  // yaw = heading（道路に対する車体の絶対的な向き。位置に依存しない固定値）。
  // viewAngle（カメラから見た方位角=視差）は使わない — 視差は
  // _projWorld() による真の透視投影が自動的に再現するため、
  // ここでさらに yaw として重ねて適用すると視差の二重適用になり、
  // 車ごとに勝手な向きへ回転して消失点がバラバラに見える原因になる。
  const yaw = heading;

  drawCar3D(g, Xw, 0, Zw, cxAccPx, hitFlash ? '#ffffff' : col, col,
            yaw, 0, carType, false, hitFlash, TYPE_SCALE[carType] || 1.0);

  g.globalAlpha = 1;
}

// ── 後方互換ヘルパー（旧コードが参照する可能性） ──
function drawTireRect(g,cx,cy,tW,tH,col){
  const r=Math.min(tH*0.6,tW*0.25),x0=cx-tW,y0=cy-tH*2,w=tW*2,h=tH*2;
  g.fillStyle='#060a0e';g.strokeStyle=_hexA(col,0.50);g.lineWidth=1.0;
  g.beginPath();g.moveTo(x0+r,y0);g.lineTo(x0+w-r,y0);
  g.arcTo(x0+w,y0,x0+w,y0+r,r);g.lineTo(x0+w,y0+h-r);
  g.arcTo(x0+w,y0+h,x0+w-r,y0+h,r);g.lineTo(x0+r,y0+h);
  g.arcTo(x0,y0+h,x0,y0+h-r,r);g.lineTo(x0,y0+r);
  g.arcTo(x0,y0,x0+r,y0,r);g.closePath();g.fill();g.stroke();
}
function hexA(hex,a){return _hexA(hex,a);}
function hlCol(oc,cW){const a=Math.min(0.95,cW*0.06);return oc?`rgba(255,255,255,${a})`:`rgba(255,255,190,${a})`;}
function hlGlow(g,oc,cW){g.shadowColor=oc?'#ffffff':'#ffffaa';g.shadowBlur=Math.max(3,cW*(oc?0.18:0.12));}

function drawPlayerCar(g,bpm,t){
  // bank>0(右カーブ)→左側面わずかに見える, bank<0→右側面
  // player.slip: 衝突スリップによる車体の向きの振れ(ヨー)。+で鼻先が右。
  // 衝突時はロール(横転)も白フラッシュもさせず、向きが左右に振れるだけにする。
  const yaw   = player.bank * 0.55 + player.slip;
  const rollZ = player.bank * 0.15;
  // road と同一の cxAcc（直前の道路中心オフセット）と単位系を共有する。
  drawCar3D(g, player.x * ROADW, 0, PLAYER_Z, roadCenterOffsetPx,
            '#cc0020', '#5df0c8', yaw, rollZ, 'ferrari328', true, false, 1.0);
}

