// ════════════════════════════════════════════════
// VFD RACING — 路側物の描画（街路樹 / 街灯 / 信号機 / 横断歩道 / 路面の灯り）
//
// データ側は 16a-racing-core.js（TREE_*, makeTree, buildRoadside, roadsideBySeg）。
// このファイルは「描くだけ」。IIFE で包み、公開は window.Roadside のみ
// （16a〜16e とグローバルを共有しているため、識別子の衝突を避ける）。
// すべて 2D（3D化しない）。サイズはワールド単位 × (sc*W/2) でpx化する。
// ════════════════════════════════════════════════
window.Roadside = (function(){

  // ── 色ヘルパー ──
  const clamp255 = v => v < 0 ? 0 : v > 255 ? 255 : v;
  const mix = (a, b, t) => [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t];
  const shade = (c, k) => [clamp255(c[0]*k), clamp255(c[1]*k), clamp255(c[2]*k)];
  const css = (c, a) => a === undefined
    ? `rgb(${c[0]|0},${c[1]|0},${c[2]|0})`
    : `rgba(${c[0]|0},${c[1]|0},${c[2]|0},${a})`;
  const litOf = a => [clamp255(a[0]*1.6+34), clamp255(a[1]*1.6+44), clamp255(a[2]*1.6+20)];

  // ── 光暈/影スプライト ──
  // 放射グラデーションを毎フレーム何十個も作るのは重いので、64x64 のスプライトを1回だけ作って
  // drawImage で拡大縮小して使う（作れない環境ではグラデーションにフォールバック）。
  const _sprites = {};
  function sprite(key, r, gr, b, a0, a1){
    if(_sprites[key] !== undefined) return _sprites[key];
    let c = null;
    try{
      c = document.createElement('canvas'); c.width = c.height = 64;
      const x = c.getContext('2d');
      const gg = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      gg.addColorStop(0,    `rgba(${r},${gr},${b},${a0})`);
      gg.addColorStop(0.30, `rgba(${r},${gr},${b},${a1})`);
      gg.addColorStop(1,    `rgba(${r},${gr},${b},0)`);
      x.fillStyle = gg; x.fillRect(0, 0, 64, 64);
    }catch(_){ c = null; }
    _sprites[key] = c;
    return c;
  }
  // 加算合成で光暈を描く（cx,cy 中心、半径 rad px）
  function glow(g, key, rgb, a0, a1, cx, cy, rad){
    const sp = sprite(key, rgb[0], rgb[1], rgb[2], a0, a1);
    g.globalCompositeOperation = 'lighter';
    if(sp){
      g.drawImage(sp, cx - rad, cy - rad, rad*2, rad*2);
    }else{
      const gg = g.createRadialGradient(cx, cy, 0, cx, cy, rad);
      gg.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a0})`);
      gg.addColorStop(0.30, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a1})`);
      gg.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
      g.fillStyle = gg; g.fillRect(cx - rad, cy - rad, rad*2, rad*2);
    }
    g.globalCompositeOperation = 'source-over';
  }

  // ════════════════════════════════
  // ヘッドライトによる照明
  // ════════════════════════════════
  // 光源 = 自車 + 画面内の交通車。向き dir: +1=奥(Z+)へ照らす / -1=手前(Z-)へ照らす（対向車）。
  // 木 (xt, zt) の明るさ = Σ (1-dz/RANGE)^1.5 × 横方向の減衰 × 強さ × GAIN（0〜1にクランプ）
  //   dz  : 光の向きに沿った距離（光源より前方にある木だけ照らす）
  //   横  : ビームは奥ほど広がる（半幅 = 3000 + dz*0.5）
  const LIGHT_RANGE = 7000, LIGHT_GAIN = 1.7;

  function collectLights(){
    const L = [{ x: player.x * ROADW, z: PLAYER_Z, dir: 1, k: 1.0 }];
    for(const c of traffic){
      const z = c.z - cam.pos;
      if(z < PLAYER_Z*0.3 || z > DRAW*SEGZ) continue;
      L.push({ x: c.x * ROADW, z, dir: c.oncoming ? -1 : 1, k: 0.8 });
    }
    return L;
  }

  function lightAt(lights, xt, zt){
    let s = 0;
    for(const l of lights){
      const dz = (zt - l.z) * l.dir;
      if(dz <= 0 || dz > LIGHT_RANGE) continue;
      const lat = 1 - Math.abs(xt - l.x) / (3000 + dz*0.5);
      if(lat <= 0) continue;
      s += Math.pow(1 - dz/LIGHT_RANGE, 1.5) * lat * l.k * LIGHT_GAIN;
    }
    return s > 1 ? 1 : s;
  }

  // ════════════════════════════════
  // 街路樹
  // ════════════════════════════════
  // 幹（先細り）→ 枝 → 樹冠（こぶ状の外周を滑らかに結んだシルエット）→ 葉むらの明暗。
  // L(0〜1) = ヘッドライトの当たり具合。暗い基調色から lit 色へ寄せる。
  function crownPath(g, b, S, cx, cy, rx, ry){
    const n = b.crown.length, P = [];
    for(let k = 0; k < n; k++){
      const ang = -Math.PI/2 + k*2*Math.PI/n;
      let f = b.crown[k];
      if(S.pointed && k === 0) f *= 1.10;           // 円柱型: 頂部を尖らせる
      P.push([cx + Math.cos(ang)*rx*f, cy + Math.sin(ang)*ry*f]);
    }
    g.beginPath();
    g.moveTo((P[n-1][0]+P[0][0])/2, (P[n-1][1]+P[0][1])/2);
    for(let k = 0; k < n; k++){
      const q = P[(k+1)%n];
      g.quadraticCurveTo(P[k][0], P[k][1], (P[k][0]+q[0])/2, (P[k][1]+q[1])/2);
    }
    g.closePath();
  }

  function drawTree(g, b, bx, fy, tw, th, sc, L){
    const S = TREE_SHAPES[b.shape];
    const crownH = th*S.crownH, trunkH = th - crownH;
    const rx = tw*S.rx, ry = crownH*0.5;
    const cx = bx + b.lean*th, cy = fy - trunkH - ry;
    const lit = litOf(b.palA);

    // 遠方の小さい木は簡易描画（幹の線 + 樹冠の楕円）。細部は見えないので省く
    if(tw < 5){
      const cA = mix(b.palA, lit, L);
      g.strokeStyle = css(mix([28,24,20], [96,82,64], L)); g.lineWidth = Math.max(0.8, tw*0.08);
      g.beginPath(); g.moveTo(bx, fy); g.lineTo(cx, cy); g.stroke();
      g.fillStyle = css(shade(cA, 1.0));
      g.beginPath(); g.ellipse(cx, cy, Math.max(0.8, rx), Math.max(0.8, ry), 0, 0, Math.PI*2); g.fill();
      return;
    }

    // 接地影（スプライトを潰して楕円に）
    const shR = Math.max(2, tw*0.55);
    const shS = sprite('shadow', 0, 0, 0, 0.40, 0.22);
    if(shS) g.drawImage(shS, bx - shR, fy - shR*0.30, shR*2, shR*0.60);
    // 幹（先細り）
    const trunkCol = css(mix([28,24,20], [96,82,64], L));
    const baseW = Math.max(1.2, tw*0.075), topW = baseW*0.65;
    const topX = bx + b.lean*th*0.5, topY = cy + ry*0.55;
    g.fillStyle = trunkCol;
    g.beginPath();
    g.moveTo(bx - baseW*0.6, fy); g.lineTo(bx + baseW*0.6, fy);
    g.lineTo(topX + topW*0.5, topY); g.lineTo(topX - topW*0.5, topY);
    g.closePath(); g.fill();

    // 詳細度(LOD): 小さい木ほど省く。 tw<14px: 枝・グラデ・葉むら・縁光なし / tw>24px: 葉むらも描く
    const cA = mix(b.palA, lit, L);
    if(tw < 14){
      crownPath(g, b, S, cx, cy, rx, ry);
      g.fillStyle = css(shade(cA, 0.95)); g.fill();
      return;
    }

    // 枝（幹の先端から樹冠の下部へ）
    g.strokeStyle = trunkCol; g.lineWidth = Math.max(0.8, baseW*0.45); g.lineCap = 'round';
    for(const br of b.branches){
      g.beginPath(); g.moveTo(topX, topY);
      g.lineTo(cx + br*rx, cy + ry*0.10); g.stroke();
    }
    g.lineCap = 'butt';

    // 樹冠
    const grad = g.createLinearGradient(0, cy - ry, 0, cy + ry);
    grad.addColorStop(0, css(shade(cA, 1.25)));
    grad.addColorStop(1, css(shade(mix(b.palA, lit, L*0.85), 0.62)));
    crownPath(g, b, S, cx, cy, rx, ry);
    g.fillStyle = grad; g.fill();

    // 葉むらの明暗（大きく見える時だけ）。パッチは樹冠の内側に収まる範囲(16a makeTree)なのでクリップ不要
    if(tw > 24){
      const m = Math.min(rx, ry);
      for(const p of b.patches){
        g.fillStyle = p.lite ? css(lit, 0.06 + 0.24*L) : css(b.palB, 0.38);
        g.beginPath();
        g.ellipse(cx + p.u*rx, cy + p.v*ry, p.r*m*1.25, p.r*m, 0, 0, Math.PI*2);
        g.fill();
      }
    }

    // 照らされている時の縁の反射光
    if(L > 0.05){
      g.strokeStyle = css(lit, L*0.35);
      g.lineWidth = Math.max(0.6, tw*0.012);
      g.stroke();
    }
  }

  // ════════════════════════════════
  // 街灯
  // ════════════════════════════════
  const STEEL = '#262c36';

  function drawLamp(g, o, fc, fy, fw, sc){
    const u = sc*(W*0.5), uy = sc*(H*0.5);    // 横は W/2、縦は H/2 の倍率（地面・車と同じ）
    const bx = fc + o.side*fw*1.06;           // 縁石のすぐ外側
    const topY = fy - o.h*uy, pw = Math.max(0.9, 34*u);
    // 支柱（先細り）
    g.fillStyle = STEEL;
    g.beginPath();
    g.moveTo(bx - pw*0.65, fy); g.lineTo(bx + pw*0.65, fy);
    g.lineTo(bx + pw*0.40, topY); g.lineTo(bx - pw*0.40, topY);
    g.closePath(); g.fill();
    // アーム（道路側へ湾曲）
    const ax = bx - o.side*o.arm*u, ay = topY - 40*uy;
    g.strokeStyle = STEEL; g.lineWidth = Math.max(0.8, 26*u);
    g.beginPath(); g.moveTo(bx, topY);
    g.quadraticCurveTo(bx - o.side*o.arm*0.3*u, topY - 110*uy, ax, ay); g.stroke();
    // 灯具
    const hw = Math.max(2, 240*u), hh = Math.max(1, 60*uy);
    g.fillStyle = '#303743'; g.fillRect(ax - hw*0.5, ay - hh*0.5, hw, hh);
    g.fillStyle = '#ffe6b8'; g.fillRect(ax - hw*0.42, ay + hh*0.1, hw*0.84, Math.max(1, hh*0.45));
    // 光暈（加算合成）。近い街灯ほど半径が巨大になり画面全体が白飛びするので上限(px)を設ける
    glow(g, 'lamp', [255,220,160], 0.50, 0.12, ax, ay, Math.max(3, Math.min(70, 300*u)));
  }

  // 路面に落ちる灯り。全セグメント描画後にまとめて描く（手前の路面に上書きされないため）。
  // 地面上の円(半径R)の透視: rx = R*s*(W/2),  ry = rx * (CAM_H/Z) * (H/W)
  function drawPool(g, q){
    const Z = CAM_D / q.sc;
    if(Z < 1200) return;      // 手前すぎる灯りは巨大で塗りも重いので描かない
    const alpha = 0.10 * Math.max(0, 1 - Z/(DRAW*SEGZ*0.92));
    const rx = 800 * q.sc * (W*0.5);
    if(rx < 1.5 || alpha < 0.01) return;
    const ry = rx * (CAM_H/Z) * (H/W);
    const cx = q.fc + q.o.side*(1.06 - q.o.arm/ROADW)*q.fw;
    // 地面上の円は画面では横長の楕円。スプライトの高さだけ ry/rx に潰して描く
    const sp = sprite('pool', 255, 214, 150, 1.0, 0.45);
    if(!sp) return;
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = alpha;
    g.drawImage(sp, cx - rx, q.fy - ry, rx*2, ry*2);
    g.restore();
  }

  // ════════════════════════════════
  // 信号機（片持ち式: 路側の支柱 + 道路を横切るマストアーム + 灯器2基）
  // ════════════════════════════════
  // 12秒周期: 青 0〜5.5s / 黄 5.5〜7s / 赤 7〜12s。位相は信号ごとに異なる。
  // 灯器は手前を向き、左から 青・黄・赤 の横並び。
  const SIG_COL = [[53,255,154], [255,200,58], [255,48,80]];

  function signalState(tMs, phase){
    const c = (((tMs*0.001 + phase) % 12) + 12) % 12;
    return c < 5.5 ? 0 : c < 7 ? 1 : 2;
  }

  function drawSignal(g, o, fc, fy, fw, sc, tMs){
    const u = sc*(W*0.5), uy = sc*(H*0.5);
    const bx = fc + o.side*fw*1.06;
    const armY = fy - 2050*uy;
    const armEnd = fc - o.side*fw*0.30;
    const st = signalState(tMs, o.phase);
    // 支柱
    const pw = Math.max(1, 56*u);
    g.fillStyle = STEEL;
    g.beginPath();
    g.moveTo(bx - pw*0.6, fy); g.lineTo(bx + pw*0.6, fy);
    g.lineTo(bx + pw*0.4, armY); g.lineTo(bx - pw*0.4, armY);
    g.closePath(); g.fill();
    // マストアーム
    g.strokeStyle = STEEL; g.lineWidth = Math.max(0.9, 40*u);
    g.beginPath(); g.moveTo(bx, armY); g.lineTo(armEnd, armY); g.stroke();
    // 灯器
    [0.42, -0.18].forEach(rel => {
      const hx = fc + fw*rel*o.side;
      const hw = 720*u, hh = 250*uy;  // 実物より大きめ（遠くからでも信号と分かるように誇張）
      if(hh >= 2.5){
        g.fillStyle = '#12161c'; g.fillRect(hx - hw/2, armY, hw, hh);
        g.strokeStyle = '#2a303a'; g.lineWidth = Math.max(0.5, 8*u);
        g.strokeRect(hx - hw/2, armY, hw, hh);
      }
      for(let i = 0; i < 3; i++){
        const lx = hx + (i-1)*hw*0.31, ly = armY + hh*0.5, lr = Math.max(0.8, hh*0.34);
        const on = (i === st);
        if(hh >= 2.5 || on){
          g.fillStyle = on ? css(SIG_COL[i]) : css(mix([10,14,18], SIG_COL[i], 0.10));
          g.beginPath(); g.arc(lx, ly, lr, 0, Math.PI*2); g.fill();
        }
        if(on) glow(g, 'sig'+i, SIG_COL[i], 0.75, 0.30, lx, ly, Math.max(4, Math.min(90, hh*2.2)));
      }
    });
  }

  // ════════════════════════════════
  // 反射ポスト（縁石のすぐ外。左=橙 / 右=白）
  // 画面の縁を速く流れる近景の手がかり。細く低いので、遠方では簡略化する。
  // ════════════════════════════════
  const POST_COL = { '-1': [255,178,60], '1': [225,255,250] };
  function drawPost(g, o, fc, fy, fw, sc){
    const u = sc*(W*0.5), uy = sc*(H*0.5);
    const bx = fc + o.side*fw*1.035;
    const h = 360*uy, w = Math.max(1, 26*u);
    if(h < 1.5) return;
    const col = POST_COL[o.side];
    g.fillStyle = '#9aa7aa'; g.fillRect(bx - w*0.5, fy - h, w, h);
    const rh = Math.max(1.2, 80*uy);
    g.fillStyle = css(col); g.fillRect(bx - w*0.75, fy - h, w*1.5, rh);
    if(w >= 2.2) glow(g, 'post'+o.side, col, 0.55, 0.15, bx, fy - h + rh*0.5, Math.max(3, Math.min(28, 150*u)));
  }

  // ════════════════════════════════
  // 横断歩道（11本の白帯。セグメントの台形に沿って描く）
  // ════════════════════════════════
  function drawCrosswalk(g, fc, fy, fw, nc, ny, nw){
    g.fillStyle = 'rgba(225,235,225,0.50)';
    g.beginPath();                      // 11本まとめて1回の fill（帯は重ならない）
    for(let k = -5; k <= 5; k++){
      const a = (k - 0.30)/5.8, b = (k + 0.30)/5.8;
      g.moveTo(fc + fw*a, fy); g.lineTo(fc + fw*b, fy);
      g.lineTo(nc + nw*b, ny); g.lineTo(nc + nw*a, ny);
      g.closePath();
    }
    g.fill();
  }

  return { collectLights, lightAt, drawTree, drawLamp, drawPool, drawSignal, drawPost, drawCrosswalk, signalState };
})();
