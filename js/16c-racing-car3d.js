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
// 近接面クリッピング: 追い越された車は、後端がカメラ面(Z≈0)を越えても前側が画面の下部に見えている
// （トラックは全長約2000ユニット）。面を捨てると見えている部分が突然消え、点を Z=近接面に
// 「押さえる(クランプ)」と、見えている面が画面の外へ引き伸ばされて歪む（実際にトラックで発生した）。
// そこで各ポリゴンをカメラ空間で Z>=CAR_NEAR_Z の側に切り取り(Sutherland–Hodgman)、切断点を含めて
// 投影する。切り取った辺は直線のまま投影されるので、見えている部分の形は正確になる。
let CAR_NEAR_Z = 30;
function _clipNear(poly) {          // poly: カメラ空間の [x,y,z] の配列
  const out = [], n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    const ina = a[2] >= CAR_NEAR_Z, inb = b[2] >= CAR_NEAR_Z;
    if (ina) out.push(a);
    if (ina !== inb) {
      const t = (CAR_NEAR_Z - a[2]) / (b[2] - a[2]);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, CAR_NEAR_Z]);
    }
  }
  return out;
}
// 画面クリップ: 近接面(Z=30)で切った面でも、投影すると座標が数万pxになる（トラックで X=-36000, Y=15000）。
// 極端な座標は Canvas の描画エンジンが正しく塗れず、画面全体に半透明のくさび形が出る（実機ブラウザで発生）。
// そこで投影後のポリゴンを、画面より少し外側の矩形（余白 CLIP_MARGIN）でもクリップして座標を有界にする。
// 余白は画面の外なので、見えている部分の形は変わらない。
const CLIP_MARGIN = 160;
function _clipRect(pts, x0, y0, x1, y1) {
  let out = pts;
  const edges = [
    [p => p.sx >= x0, (a, b) => { const t = (x0 - a.sx) / (b.sx - a.sx); return { sx: x0, sy: a.sy + (b.sy - a.sy) * t, clip: false }; }],
    [p => p.sx <= x1, (a, b) => { const t = (x1 - a.sx) / (b.sx - a.sx); return { sx: x1, sy: a.sy + (b.sy - a.sy) * t, clip: false }; }],
    [p => p.sy >= y0, (a, b) => { const t = (y0 - a.sy) / (b.sy - a.sy); return { sx: a.sx + (b.sx - a.sx) * t, sy: y0, clip: false }; }],
    [p => p.sy <= y1, (a, b) => { const t = (y1 - a.sy) / (b.sy - a.sy); return { sx: a.sx + (b.sx - a.sx) * t, sy: y1, clip: false }; }],
  ];
  for (const [inside, cut] of edges) {
    const inp = out; out = [];
    for (let i = 0; i < inp.length; i++) {
      const a = inp[i], b = inp[(i + 1) % inp.length], ia = inside(a), ib = inside(b);
      if (ia) out.push(a);
      if (ia !== ib) out.push(cut(a, b));
    }
    if (out.length < 3) return null;
  }
  return out;
}
function _projPoly(cp, cxAccPx) {   // 近接面でクリップ → 投影 → 画面矩形でクリップ。見える部分が無ければ null
  const c = cp.every(p => p[2] >= CAR_NEAR_Z) ? cp : _clipNear(cp);
  if (c.length < 3) return null;
  const pr = c.map(p => { const q = _projWorld(p[0], p[1], p[2], cxAccPx); return { sx: q.sx, sy: q.sy, clip: false }; });
  // 描画範囲（シーン座標）: 横 0..W、縦 -SY0..HB。縦長画面では上に空・下に路面が延びる
  const top = -(typeof SY0 === 'number' ? SY0 : 0), bot = (typeof HB === 'number' && HB > 0) ? HB : H;
  return _clipRect(pr, -CLIP_MARGIN, top - CLIP_MARGIN, W + CLIP_MARGIN, bot + CLIP_MARGIN);
}
function _projWorld(Xw, Yw, Zw, cxAccPx) {
  if (Zw < CAR_NEAR_Z) Zw = CAR_NEAR_Z;   // 安全策（クリップ済みの点はここに来ない）
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

// ══ 乗用車: パラメータから頂点・面・窓を作る共通ジェネレータ（v1.4.0）══
// 車は 側面プロファイル（鼻 → ボンネット → カウル → ルーフ前 → ルーフ後 → リアガラス下 → 後端）の数値だけで決まる。
// 以前は車種ごとに頂点と面を手書きし、側面は「平面にならない六角形」を三角形4枚に割っていたため、
//   ・面の縁取りが側面に三角形の斜線として見えた
//   ・側面に窓がなかった
// 今は、ルーフの縁(x=xr)とベルトライン(x=W)を結ぶ平面の上に カウル(CW)・リアガラス下(TW) の x を置く
// （x(y) = W − (W−xr)·(y−yb)/(ルーフ高−yb)）。これで側面の上半分（グリーンハウス）は1枚の平面六角形になり、
// 中央(ルーフ中央の z)で前後2枚の五角形に割るだけで済む。その割れ目が B ピラーになる。
// 側面の窓は、この平面の上に前席ドア窓・後席ドア窓の2枚（デカール）を置く。
// 頂点の名前は従来と同じ（BRL/BRR=後端下は影・光暈の基準）。ローカル座標: X=右±, Y=上, Z=前方(0=後端)。
// P: bw=下端の半幅, W=ベルトラインの半幅, L=全長, yb=ベルトライン高, zh=ボンネット前端の z,
//    cw=[z,y]=カウル(フロントガラス下端), rf=[z,y]=ルーフ前端, rr=[z,y]=ルーフ後端(y は rf と同じ), xr=ルーフ半幅, tw=[z,y]=リアガラス下端
const _CARP = {
  ferrari328:  { bw:1.00, W:1.02, L:2.20, yb:0.62, zh:1.85, cw:[1.50,0.95], rf:[1.25,1.44], rr:[0.55,1.44], xr:0.42, tw:[0.30,0.95] },
  f40:         { bw:1.05, W:1.07, L:2.40, yb:0.55, zh:2.00, cw:[1.65,0.85], rf:[1.40,1.22], rr:[0.65,1.22], xr:0.44, tw:[0.35,0.85] },
  sedan:       { bw:1.00, W:1.02, L:2.50, yb:0.68, zh:2.05, cw:[1.65,1.05], rf:[1.40,1.48], rr:[0.70,1.48], xr:0.50, tw:[0.45,1.05] },
  coupe:       { bw:1.02, W:1.04, L:2.30, yb:0.60, zh:1.95, cw:[1.55,0.92], rf:[1.35,1.40], rr:[0.62,1.40], xr:0.42, tw:[0.35,0.92] },
  // 80年代の日本車セダン（3ボックス: 平らなボンネット・立ったガラス・独立したトランク）
  // 3車種は「長さ・高さ・屋根・窓・ランプ・色」をはっきり変えて見分けがつくようにしてある
  //   win: 'split'=前後ドアの窓がBピラーで分かれる / 'hardtop'=ピラーレスで窓が1枚  roofT: 'roofDark'=黒いビニールレザー風の屋根
  //   lamp: テールランプの形（small=小さな角型 / bar=横一文字 / big=大きな角型 / 省略=標準）
  compact80:   { bw:0.98, W:0.99, L:2.25, yb:0.70, zh:2.02, cw:[1.70,0.88], rf:[1.44,1.52], rr:[0.62,1.52], xr:0.62, tw:[0.40,0.88], lamp:'small' },                     // 小型セダン（カローラ/シビック級: 短く背が高い）
  saloon80:    { bw:1.03, W:1.04, L:2.85, yb:0.66, zh:2.55, cw:[2.10,0.84], rf:[1.70,1.36], rr:[0.70,1.36], xr:0.58, tw:[0.30,0.84], lamp:'bar', win:'hardtop' },     // 中型ハードトップ（マークII/クレスタ級: 低く長い・ピラーレス）
  executive80: { bw:1.04, W:1.05, L:2.95, yb:0.76, zh:2.65, cw:[2.12,0.96], rf:[1.80,1.60], rr:[0.82,1.60], xr:0.68, tw:[0.50,0.96], lamp:'big', roofT:'roofDark' },  // 大型セダン（クラウン/セドリック級: 背が高く箱型・黒い屋根）
};
function _carVerts(P) {
  const V = {}, both = (n, x, y, z) => { V[n + 'L'] = [-x, y, z]; V[n + 'R'] = [x, y, z]; };
  const s = (P.W - P.xr) / (P.rf[1] - P.yb), X = y => P.W - s * (y - P.yb), m = (P.rf[0] + P.rr[0]) / 2;
  both('BR', P.bw, 0, 0);   both('BF', P.bw, 0, P.L);
  both('BH', P.W, P.yb, 0); both('BHF', P.W, P.yb, P.zh);
  both('CW', X(P.cw[1]), P.cw[1], P.cw[0]);
  both('RF', P.xr, P.rf[1], P.rf[0]); both('RR', P.xr, P.rf[1], P.rr[0]);
  both('TW', X(P.cw[1]), P.cw[1], P.tw[0]);                 // リアガラスの下端は、カウル（フロントガラスの下端）と同じ高さ＝窓の下辺(ガラスライン)をそろえる
  both('MB', P.W, P.yb, m); both('MR', P.xr, P.rf[1], m);        // 側面を前後に割る線（Bピラー）の両端
  return V;
}
function _carFaces(P, V, extra) {
  const cen = [0, P.rf[1] * 0.5, P.L / 2];
  const F = (k, t, fixedNy) => {                       // 巻き順は Newell 法線が外向き（車の中心から離れる向き）になるよう自動で揃える
    const n = _newellModel(k.map(q => V[q])), c = [0, 1, 2].map(i => k.reduce((a, q) => a + V[q][i], 0) / k.length);
    if (n[0]*(c[0]-cen[0]) + n[1]*(c[1]-cen[1]) + n[2]*(c[2]-cen[2]) < 0) { k = k.slice().reverse(); n[0] = -n[0]; n[1] = -n[1]; n[2] = -n[2]; }
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    return { k, ny: fixedNy !== undefined ? fixedNy : n[1]/l, nz: fixedNy !== undefined ? 0 : -n[2]/l, t, z: k.reduce((a, q) => a + V[q][2], 0) / k.length };
  };
  const out = [
    F(['BRR','BRL','BHL','BHR'], 'body'),
    F(['BFL','BHFL','BHL','BRL'], 'sideL', -0.35), F(['BHR','BHFR','BFR','BRR'], 'sideR', -0.10),     // 下半分の側面（ほぼ垂直な平面）
    F(['BRR','BFR','BFL','BRL'], 'floor'),
    F(['BHFR','BHFL','BFL','BFR'], 'body'),                                                              // 鼻
    F(['BHFL','BHFR','CWR','CWL'], 'body'),                                                              // ボンネット
    F(['CWL','CWR','RFR','RFL'], 'glass'),                                                               // フロントガラス
    F(['RRR','RRL','RFL','RFR'], P.roofT || 'roof'),
    F(['RRL','RRR','TWR','TWL'], 'glass'),                                                               // リアガラス
    F(['TWL','TWR','BHR','BHL'], 'body'),                                                                // トランク
    // グリーンハウスの側面（平面）を Bピラーの線で前後2枚に
    F(['BHFL','CWL','RFL','MRL','MBL'], 'sideL', -0.35), F(['MBL','MRL','RRL','TWL','BHL'], 'sideL', -0.35),
    F(['BHFR','CWR','RFR','MRR','MBR'], 'sideR', -0.10), F(['MBR','MRR','RRR','TWR','BHR'], 'sideR', -0.10),
  ];
  return extra ? out.concat(extra) : out;
}
// F40 のリアウィング（薄いソリッド）。頂点と面は従来のまま
const _F40_WING_V = {
  WL:[-1.05, 1.07, 0.22], WR:[1.05, 1.07, 0.22], WFL:[-1.05, 1.07, 0.58], WFR:[1.05, 1.07, 0.58],
  WL_b:[-1.05, 1.04, 0.22], WR_b:[1.05, 1.04, 0.22], WFL_b:[-1.05, 1.04, 0.58], WFR_b:[1.05, 1.04, 0.58],
};
const _F40_WING_F = [
  {k:['WR','WL','WFL','WFR'], ny:1.0, nz:-0.0, t:'wing', z:0.4},
  {k:['WL_b','WR_b','WFR_b','WFL_b'], ny:-1.0, nz:-0.0, t:'wing', z:0.4},
  {k:['WL','WL_b','WFL_b','WFL'], ny:0.0, nz:-0.0, t:'body', z:0.4},
  {k:['WR','WFR','WFR_b','WR_b'], ny:0.0, nz:-0.0, t:'body', z:0.4},
  {k:['WR_b','WL_b','WL','WR'], ny:0.0, nz:1.0, t:'body', z:0.22},
  {k:['WFL_b','WFR_b','WFR','WFL'], ny:0.0, nz:-1.0, t:'body', z:0.58},
];
const _MESH = {};                                            // 車種 → { V: 頂点, F: 面(キャッシュ), P: パラメータ }
for (const t in _CARP) {
  const P = _CARP[t], V = _carVerts(P);
  if (t === 'f40') Object.assign(V, _F40_WING_V);
  _MESH[t] = { P, V, F: _carFaces(P, V, t === 'f40' ? _F40_WING_F : null) };
}
// 従来の名前（検証ツールが使う）
const _V328 = _MESH.ferrari328.V, _VF40 = _MESH.f40.V, _VSED = _MESH.sedan.V, _VCPE = _MESH.coupe.V;
const _faces328 = () => _MESH.ferrari328.F, _facesF40 = () => _MESH.f40.F, _facesSed = () => _MESH.sedan.F, _facesCpe = () => _MESH.coupe.F;

// トラック（v1.4.0 で作り直し）。構造は3つの部品に分かれる:
//   フレーム（シャーシ・黒）: 全長。幅 FW。床と側面と前後の面だけ。
//   上物（ボディ・荷台コンテナ）: 後ろ側 z=0〜ZC。高さ YC（車の最高点）。幅 CW。
//   キャビン（運転席）: 前側 z=ZC〜ZF。高さ YK（上物より低い）。幅 KW。
//   3つの幅は同じにして、側面が同一平面で隣り合うようにしてある（幅を変えて奥まらせると、
//   フレームの側面が上物の側面と画面上で重なり、前後の描画順だけでは正しく決まらなくなる。ray-cast で確認済み）。
//   キャビンと上物の境目は、キャビン側面の後端に暗い継ぎ目（seam）のデカールを置いて表す。
//     前面は平らな下半分（グリル+ヘッドライト）と、後ろへ傾いたフロントガラス。
// 前面を三角形の扇で作ると縁取りが斜めの線になるので、全ての面を平面の四角形（側面だけ五角形）にした。
// ローカル座標: X=右±, Y=上(0=地面), Z=前方(0=後端, ZF=前端)。後端 BRL/BRR は影・光暈の基準点。
const _TRK = { FW:1.12, CW:1.12, KW:1.12, YF:0.28, YWS:0.82, YK:1.35, YC:1.69, ZM:1.575, ZC:3.15, ZKR:4.28, ZF:4.50, ZFM:2.25 };
const _VTRK = (() => {
  const T = _TRK, V = {};
  const both = (name, x, y, z) => { V[name + 'L'] = [-x, y, z]; V[name + 'R'] = [x, y, z]; };
  // フレーム: 底 B / 上 T × 後 R / 中 M / 前 F
  both('BR', T.FW, 0, 0);       both('BM', T.FW, 0, T.ZFM);     both('BF', T.FW, 0, T.ZF);
  both('TR', T.FW, T.YF, 0);    both('TM', T.FW, T.YF, T.ZFM);  both('TF', T.FW, T.YF, T.ZF);
  // 上物: 底 GB / 上 GT × 後 R / 中 M / 前 F
  both('GBR', T.CW, T.YF, 0);   both('GBM', T.CW, T.YF, T.ZM);  both('GBF', T.CW, T.YF, T.ZC);
  both('GTR', T.CW, T.YC, 0);   both('GTM', T.CW, T.YC, T.ZM);  both('GTF', T.CW, T.YC, T.ZC);
  // キャビン: 後下 KB / 前下 KF / 前面の上端=ガラスの下端 KM / 屋根の前端 KT / 屋根の後端 KU
  both('KB', T.KW, T.YF, T.ZC); both('KF', T.KW, T.YF, T.ZF);   both('KM', T.KW, T.YWS, T.ZF);
  both('KT', T.KW, T.YK, T.ZKR); both('KU', T.KW, T.YK, T.ZC);
  return V;
})();

let _TRK_FACES = null;
function _facesTrk() {
  if (_TRK_FACES) return _TRK_FACES;
  const V = _VTRK;
  // 巻き順は Newell 法の法線が外向きになるように自動で揃える（手書きの順序ミスを防ぐ）
  const F = (k, out, t, z) => {
    const n = _newellModel(k.map(q => V[q]));
    if (n[0]*out[0] + n[1]*out[1] + n[2]*out[2] < 0) k = k.slice().reverse();
    return { k, ny: out[1], nz: out[2], t, z };
  };
  const X = [1,0,0], NX = [-1,0,0], UP = [0,1,0], DN = [0,-1,0], FR = [0,0,1], RE = [0,0,-1];
  _TRK_FACES = [
    // フレーム（シャーシ）
    F(['BRR','BMR','BML','BRL'], DN, 'floor', 0.8),  F(['BMR','BFR','BFL','BML'], DN, 'floor', 3.4),
    F(['BRR','TRR','TMR','BMR'], X,  'frame', 0.8),  F(['BMR','TMR','TFR','BFR'], X,  'frame', 3.4),
    F(['BRL','TRL','TML','BML'], NX, 'frame', 0.8),  F(['BML','TML','TFL','BFL'], NX, 'frame', 3.4),
    F(['BRR','BRL','TRL','TRR'], RE, 'frame', 0.0),  F(['BFL','BFR','TFR','TFL'], FR, 'frame', 4.5),
    // 上物（荷台）
    F(['GBRR','GBRL','GTRL','GTRR'], RE, 'body', 0.0),
    F(['GTRL','GTRR','GTMR','GTML'], UP, 'roof', 0.8), F(['GTML','GTMR','GTFR','GTFL'], UP, 'roof', 2.4),
    F(['GBRR','GBMR','GTMR','GTRR'], X,  'sideR', 0.8), F(['GBMR','GBFR','GTFR','GTMR'], X,  'sideR', 2.4),
    F(['GBRL','GBML','GTML','GTRL'], NX, 'sideL', 0.8), F(['GBML','GBFL','GTFL','GTML'], NX, 'sideL', 2.4),
    F(['GBFL','GBFR','GTFR','GTFL'], FR, 'body', 3.15),
    // キャビン（運転席）
    F(['KBR','KFR','KMR','KTR','KUR'], X,  'sideR', 3.8),
    F(['KBL','KFL','KML','KTL','KUL'], NX, 'sideL', 3.8),
    F(['KUL','KUR','KTR','KTL'], UP, 'roof', 3.7),
    F(['KML','KMR','KTR','KTL'], [0, 0.4, 1], 'body', 4.4),     // フロントガラスの枠（ガラスはデカール）
    F(['KFL','KFR','KMR','KML'], FR, 'body', 4.5),              // 前面の下半分（グリル・ヘッドライト）
  ];
  return _TRK_FACES;
}
// ── 面タイプ別描画 ──
// camPts: カメラ空間座標マップ（カリング用）
function _drawFace(g, camPts, face, bodyCol, glowCol, cxAccPx) {
  // カメラ空間法線でカリング（スクリーン空間2D外積より正確、全頂点使用）。近接面をまたぐ面も正しく判定できる
  const cp = face.k.map(k => camPts[k]);
  if (cp.some(p => !p) || !_isFrontCamN(cp)) return;
  const fp = _projPoly(cp, cxAccPx);        // 近接面でクリップして投影
  if (!fp) return;

  const lw = Math.max(0.5, Math.abs((fp[0].sx||0) - (fp[1]||fp[0]).sx) * 0.018);

  switch (face.t) {
    case 'body':
      _poly(g, fp, _shade(bodyCol, face.ny, face.nz, 1.0), _hexA(glowCol, 0.25), lw);
      break;
    case 'roof':
      _poly(g, fp, _shade(bodyCol, face.ny, face.nz, 1.0), _hexA(glowCol, 0.18), lw);
      break;
    case 'roofDark':
      _poly(g, fp, _shade('#141824', face.ny, face.nz, 1.0), _hexA(glowCol, 0.18), lw);   // 黒い屋根（ビニールレザー風）
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
    case 'frame':
      // トラックのシャーシ: 暗い無彩色（車体色の上物・キャビンと見分けがつく）
      _poly(g, fp, 'rgb(14,18,26)', _hexA(glowCol, 0.12), lw * 0.6);
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
  glass:  { fill:'rgb(24,42,72)',    glow:null },      // フロントガラス・側面の窓（不透明。背景から離れた色）
  grille: { fill:'rgb(8,12,18)',     glow:null },      // トラックのグリル
  seam:   { fill:'rgb(6,9,14)',      glow:null },      // トラックのキャビンと上物の継ぎ目
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
    const V = _VTRK, T = _TRK, FACES = _facesTrk();
    // 面の頂点の並びは _facesTrk が外向きに揃えて決めるので、デカールの母面キーはその並びに合わせる
    const hostKey = ks => { const set = ks.slice().sort().join(); return FACES.find(f => f.k.slice().sort().join() === set).k.join(','); };
    const onHost = (ks, specs) => { const hk = hostKey(ks); return _hostDecals(V, ks, specs).map(d => (d.hosts = [hk], d)); };
    // 後面: 上物の後面の下部にテール/バックランプ/ナンバー
    out = onHost(['GBRR','GBRL','GTRL','GTRR'], [
      ['tail',   .03,.17, .02,.10], ['tail',   .83,.97, .02,.10],
      ['tailHi', .03,.09, .05,.10], ['tailHi', .91,.97, .05,.10],
      ['backup', .46,.54, .03,.08],
      ['plate',  .37,.63, .13,.29],
    ]);
    // 前面（キャビン）: 下半分にグリルと左右のヘッドライト、上にフロントガラス
    out = out.concat(onHost(['KFL','KFR','KMR','KML'], [
      ['grille', .33,.67, .18,.82],
      ['head',   .05,.27, .24,.76], ['head',   .73,.95, .24,.76],
      ['headHi', .08,.17, .34,.66], ['headHi', .83,.92, .34,.66],
    ]));
    out = out.concat(onHost(['KML','KMR','KTR','KTL'], [
      ['glass',  .05,.95, .12,.88],
    ]));
    // 側面の窓: キャビン側面（五角形）の平面 x=±KW 上。傾いた前縁の内側に収まる長方形
    const sideKeys = { R:['KBR','KFR','KMR','KTR','KUR'], L:['KBL','KFL','KML','KTL','KUL'] };
    for (const sd of ['R','L']) {
      const x = (sd === 'R' ? 1 : -1) * T.KW, o = [sd === 'R' ? 1 : -1, 0, 0];
      const y0 = 0.88, y1 = 1.27, z0 = 3.45, z1 = 4.12;
      out.push(_mkDecal('glass', [hostKey(sideKeys[sd])], o, [[x,y0,z0],[x,y0,z1],[x,y1,z1],[x,y1,z0]]));
      // キャビンと上物の継ぎ目（キャビン側面の後端に沿った細い暗い帯）
      out.push(_mkDecal('seam', [hostKey(sideKeys[sd])], o, [[x,T.YF,T.ZC],[x,T.YF,T.ZC+0.07],[x,T.YK,T.ZC+0.07],[x,T.YK,T.ZC]]));
    }
  } else {
    const M = _MESH[carType] || _MESH.ferrari328, V = M.V, P = M.P, FACES = M.F;
    const hostKey = ks => { const set = ks.slice().sort().join(); return FACES.find(f => f.k.slice().sort().join() === set).k.join(','); };
    const onHost = (ks, specs) => { const hk = hostKey(ks); return _hostDecals(V, ks, specs).map(d => (d.hosts = [hk], d)); };
    const LAMPS = {
      std:   [['tail', .05,.27, .34,.84], ['tail', .73,.95, .34,.84], ['tailHi', .05,.15, .58,.84], ['tailHi', .85,.95, .58,.84], ['brake', .43,.57, .86,.95]],
      small: [['tail', .04,.17, .46,.78], ['tail', .83,.96, .46,.78], ['tailHi', .04,.10, .56,.78], ['tailHi', .90,.96, .56,.78]],
      bar:   [['tail', .05,.95, .56,.76], ['tailHi', .05,.95, .64,.68]],
      big:   [['tail', .04,.31, .26,.86], ['tail', .69,.96, .26,.86], ['tailHi', .04,.12, .40,.86], ['tailHi', .88,.96, .40,.86], ['brake', .42,.58, .88,.95]],
    };
    out = onHost(['BRR','BRL','BHL','BHR'], (LAMPS[P.lamp] || LAMPS.std).concat([['plate', .36,.64, .08,.42]])
    ).concat(onHost(['BHFR','BHFL','BFL','BFR'], [           // 前面ノーズ（斜面）
      ['head',   .06,.28, .20,.70], ['head',   .72,.94, .20,.70],
      ['headHi', .06,.16, .30,.60], ['headHi', .84,.94, .30,.60],
    ]));
    // 側面の窓: グリーンハウスの平面の上に 前席ドア窓 と 後席ドア窓（Bピラー=前後の割れ目を挟む）
    const yb = P.yb, ry = P.rf[1], yw0 = P.cw[1], yw1 = ry, mz = (P.rf[0] + P.rr[0]) / 2, pil = 0.05;   // 窓の下辺=ガラスライン(フロント/リアガラスの下端と同じ高さ)・上辺=ルーフの縁
    const s = (P.W - P.xr) / (ry - yb), X = y => P.W - s * (y - yb);
    const lerpZ = (a, b, y) => a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]);
    const BHF = [P.zh, yb], CW = P.cw, RF = P.rf, RR = P.rr, TW = P.tw, BH = [0, yb];
    const zFront = y => (y >= CW[1] ? lerpZ(CW, RF, y) : lerpZ(BHF, CW, y)) - 0.06;     // Aピラー側の縁（内側へ少し）
    const zRear  = y => (y >= TW[1] ? lerpZ(RR, TW, y) : lerpZ(BH, TW, y)) + 0.06;      // Cピラー側の縁
    const wins = P.win === 'hardtop'
      ? [ [[zFront(yw0), yw0], [zFront(yw1), yw1], [zRear(yw1), yw1], [zRear(yw0), yw0]] ]                    // ピラーレス: 1枚（Bピラー線をまたぐ）
      : [ [[zFront(yw0), yw0], [zFront(yw1), yw1], [mz + pil, yw1], [mz + pil, yw0]],
          [[mz - pil, yw0], [mz - pil, yw1], [zRear(yw1), yw1], [zRear(yw0), yw0]] ];
    const sideKeys = { R:[['BHFR','CWR','RFR','MRR','MBR'], ['MBR','MRR','RRR','TWR','BHR']], L:[['BHFL','CWL','RFL','MRL','MBL'], ['MBL','MRL','RRL','TWL','BHL']] };
    for (const sd of ['R','L']) {
      const sg = sd === 'R' ? 1 : -1, o = [sg, s, 0];
      wins.forEach((w, i) => out.push(_mkDecal('glass', P.win === 'hardtop' ? sideKeys[sd].map(hostKey) : [hostKey(sideKeys[sd][i])], o, w.map(q => [sg*X(q[1]), q[1], q[0]]))));
    }
  }
  return (_DECAL_CACHE[carType] = out);
}
function _drawDecal(g, d, model, cxAccPx) {
  const cam = d.corners.map(c => _m4v(model, c[0], c[1], c[2], 1));
  if (!_isFrontCamN(cam)) return;                 // 見えていない側の面には出さない
  const pts = _projPoly(cam, cxAccPx);            // 近接面でクリップして投影
  if (!pts) return;
  const st = _DECAL_STYLE[d.kind];
  if (st.glow) {
    const wpx = Math.hypot(pts[1].sx - pts[0].sx, pts[1].sy - pts[0].sy);
    g.shadowColor = st.glow; g.shadowBlur = Math.max(3, wpx * 0.5);
  }
  _poly(g, pts, st.fill, null, 0);
  if (st.glow) g.shadowBlur = 0;
}

// ── 地面影 ──
// 描画範囲の下端（シーン座標）。縦長画面では HB（手前の路面まで）、それ以外は H
function _bottomY() { return (typeof HB === 'number' && HB > 0) ? HB : H; }
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
  const rw  = Math.min(W*1.2, Math.max(1, Math.abs(brr.sx - brl.sx) * 1.1));   // 後端が近い時に巨大になりすぎないよう上限
  if (cy2 - rw*0.2 > _bottomY() + 20) return;   // 影が画面の下の外なら描かない
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
  const rw  = Math.min(W*1.2, Math.max(1, Math.abs(brr.sx - brl.sx) * 0.70));
  if (cy2 > _bottomY() + 20) return;            // 光暈が画面の下の外なら描かない
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
// carType      : 'ferrari328'|'f40'|'sedan'|'coupe'|'compact80'|'saloon80'|'executive80'|'truck'
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
    case 'truck': vObj = _VTRK;  fArr = _facesTrk();  break;
    default: { const M = _MESH[carType] || _MESH.ferrari328; vObj = M.V; fArr = M.F; }
  }

  // ── 全頂点投影（road と同一の _projWorld を使用）──
  const pts = {};
  const camPts = {};  // ワールド/カメラ空間座標（カリング・ソート用）
  for (const k in vObj) {
    const v = vObj[k];
    const cam = _m4v(model, v[0], v[1], v[2], 1);
    camPts[k] = cam;
    // 名前付き点（影・光暈が使う後端の点）は、近接面より手前なら clip 扱い（その時は影・光暈を省く）
    if (cam[2] < CAR_NEAR_Z) { pts[k] = { sx: W*0.5, sy: H*0.5, clip: true }; continue; }
    const p = _projWorld(cam[0], cam[1], cam[2], cxAccPx);
    pts[k] = { sx: p.sx, sy: p.sy, clip: false };
  }

  // ── 描画 ──
  _drawShadow(g, pts);

  if (hitFlash) {
    // 衝突フラッシュ: 全面白
    const allFaces = fArr.concat();
    allFaces.sort((a,b) => b.z - a.z);
    for (const face of allFaces) {
      const cp = face.k.map(k => camPts[k]);
      if (cp.some(p => !p) || !_isFrontCamN(cp)) continue;
      const fp = _projPoly(cp, cxAccPx);
      if (fp) _poly(g, fp, 'rgba(255,255,255,0.92)', null, 0);
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
      _drawFace(g, camPts, face, bodyCol, glowCol, cxAccPx);
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
  compact80  : 1.00,
  saloon80   : 1.08,
  executive80: 1.12,
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
  const s = CAM_D / Math.max(Zw, 200);   // 距離フェード用（追い越し中の Zw<=0 でも破綻しない）
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

  // 無敵（星を取った直後）: 車全体が金色に光る。残り2秒は点滅して終わりを知らせ、終わると元に戻る。
  //  ・車の周りに光暈（加算合成）  ・同じ車を金色で加算合成して重ね、全体を明るく  ・光り方は脈動する
  if (player.inv > 0) {
    const blinkOff = player.inv < 2 && (Math.floor(t / 110) % 2 === 0);
    if (!blinkOff) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 0.014);
      const c = _projWorld(player.x * ROADW, 180, PLAYER_Z, roadCenterOffsetPx);
      const rad = WORLD_CAR_HALF_W * (CAM_D / PLAYER_Z) * (W * 0.5) * 3.2;
      Roadside.glow(g, 'invAura', [255, 215, 90], 0.55 + 0.20 * pulse, 0.20, c.sx, c.sy, Math.max(8, rad));
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.34 + 0.20 * pulse;
      drawCar3D(g, player.x * ROADW, 0, PLAYER_Z, roadCenterOffsetPx,
                '#ffb020', '#fff0a0', yaw, rollZ, 'ferrari328', true, false, 1.0);
      g.restore();
    }
  }
}

