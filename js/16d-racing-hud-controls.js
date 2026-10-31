// ════════════════════════════════════
// HUD
// ════════════════════════════════════
function drawHUD(g,bpm){
  g.shadowColor='#5df0c8';g.shadowBlur=8;
  g.textAlign='right';g.fillStyle='#5df0c8';
  g.font=`bold ${Math.round(H*0.07)}px 'Share Tech Mono',monospace`;
  g.fillText(Math.round(player.speed),W-W*0.03,H*0.10);
  g.font=`${Math.round(H*0.030)}px 'Share Tech Mono',monospace`;
  g.fillStyle='rgba(93,240,200,0.5)';g.fillText('km/h',W-W*0.03,H*0.148);
  const songEl=document.getElementById('adSongCounter');
  const songTxt=songEl?songEl.textContent:'—';
  g.textAlign='left';g.fillStyle='rgba(93,240,200,0.40)';
  g.font=`${Math.round(H*0.028)}px 'Share Tech Mono',monospace`;
  g.fillText('SONG',W*0.03,H*0.082);
  g.fillStyle='#5df0c8';g.shadowBlur=6;
  g.font=`bold ${Math.round(H*0.052)}px 'Share Tech Mono',monospace`;
  g.fillText(songTxt,W*0.03,H*0.148);
  g.shadowBlur=0;g.textAlign='left';
}
function drawGameHUD(g){
  const fs=Math.round(H*0.032);
  // スマホの全画面: 画面上部中央に終了ボタン（✕ 44px 級）があるので、星・エネルギーのバーはその下へずらす（PC は 0）
  const topPad=(IS_TOUCH_DEVICE&&window.VfdFullscreen&&VfdFullscreen.isActive()&&window.VfdUI)?Math.max(0,56*VfdUI.unit()-H*0.085):0;
  g.shadowColor='#5df0c8';g.shadowBlur=4;
  // コイン（この走行で取った数 / 持っている合計）
  g.font=`${Math.round(H*0.034)}px 'Share Tech Mono',monospace`;g.fillStyle='#ffd23a';g.shadowColor='#ffd23a';g.shadowBlur=5;
  g.fillText(`◎ ${game.coins}`,W*0.03,H*0.31);
  g.fillStyle='rgba(255,210,58,0.55)';g.font=`${Math.round(H*0.024)}px 'Share Tech Mono',monospace`;
  g.fillText(`TOTAL ${Garage.coins()}`,W*0.03,H*0.345);
  if(Garage.isAdmin()){g.fillStyle='#ff7bd0';g.shadowColor='#ff7bd0';g.fillText('ADMIN',W*0.03,H*0.375);}
  g.shadowColor='#5df0c8';g.shadowBlur=4;
  // HP ハート（0.5刻み: 半分のハートは左半分だけ赤く塗る）。ハートを取った直後は一瞬光る
  g.font=`${Math.round(H*0.048)}px serif`;
  if(game.healT>0){g.shadowColor='#ff3050';g.shadowBlur=6+18*Math.min(1,game.healT/0.7);}
  for(let i=0;i<game.maxHp;i++){
    const hx=W*0.03+i*(H*0.055), hy=H*0.252, fill=Math.max(0,Math.min(1,game.hp-i));
    g.fillStyle=fill>=1?'#ff3050':'rgba(255,48,80,0.22)';
    g.fillText('♥',hx,hy);
    if(fill>0&&fill<1){
      g.save();g.beginPath();g.rect(hx,hy-H*0.06,g.measureText('♥').width*fill,H*0.08);g.clip();
      g.fillStyle='#ff3050';g.fillText('♥',hx,hy);g.restore();
    }
  }
  g.shadowColor='#5df0c8';g.shadowBlur=4;
  g.font=`${fs}px 'Share Tech Mono',monospace`;
  g.fillStyle='#5df0c8';g.textAlign='right';
  g.fillText(`${(game.dist/1000).toFixed(2)}km`,W-W*0.03,H*0.215);
  g.fillStyle='rgba(93,240,200,0.42)';
  g.fillText(`BEST ${(game.best/1000).toFixed(2)}km`,W-W*0.03,H*0.252);
  // 無敵（星）の残り時間: 画面上部中央に星マークとバー。残り2秒は点滅
  if(player.inv>0){
    const cx=W*0.5, y=H*0.085+topPad, bw=W*0.20, bh=Math.max(4,H*0.012);
    const blink=player.inv<2&&(Math.floor(performance.now()/110)%2===0);
    if(!blink){
      g.shadowColor='#ffd24a';g.shadowBlur=8;
      g.fillStyle='#ffd24a';g.textAlign='center';
      g.font=`${Math.round(H*0.04)}px serif`;
      g.fillText('★',cx-bw*0.5-H*0.03,y+bh*0.5+H*0.012);
      g.fillStyle='rgba(255,210,74,0.25)';g.fillRect(cx-bw*0.5,y,bw,bh);
      g.fillStyle='#ffd24a';g.fillRect(cx-bw*0.5,y,bw*Math.min(1,player.inv/INV_TIME),bh);
      g.font=`${Math.round(H*0.028)}px 'Share Tech Mono',monospace`;
      g.fillText(`${player.inv.toFixed(1)}s`,cx,y+bh+H*0.034);
    }
  }
  // エネルギータンクの残り時間: 緑の棒（星の棒の下）。効果が切れる2秒前から点滅
  if(player.energy>0){
    const cx=W*0.5, y=H*0.158+topPad, bw=W*0.20, bh=Math.max(4,H*0.012);
    const blink=player.energy<2&&(Math.floor(performance.now()/110)%2===0);
    if(!blink){
      g.shadowColor='#3dffa6';g.shadowBlur=8;
      g.fillStyle='#3dffa6';g.textAlign='center';
      g.font=`${Math.round(H*0.03)}px 'Share Tech Mono',monospace`;
      g.fillText('⚡',cx-bw*0.5-H*0.03,y+bh*0.5+H*0.010);
      g.fillStyle='rgba(61,255,166,0.25)';g.fillRect(cx-bw*0.5,y,bw,bh);
      g.fillStyle='#3dffa6';g.fillRect(cx-bw*0.5,y,bw*Math.min(1,player.energy/ENERGY_TIME),bh);
      g.font=`${Math.round(H*0.026)}px 'Share Tech Mono',monospace`;
      g.fillText(`+${ENERGY_VMAX_BONUS}km/h  ${player.energy.toFixed(1)}s`,cx,y+bh+H*0.030);
    }
  }
  g.shadowBlur=0;g.textAlign='left';
}
function drawDemoOverlay(g){
  g.font=`${Math.round(H*0.036)}px 'Share Tech Mono',monospace`;
  g.textAlign='center';g.fillStyle='rgba(93,240,200,0.50)';
  g.shadowColor='#5df0c8';g.shadowBlur=5;
  // タッチ端末: フルスクリーン中は画面タップで開始、埋め込み表示中は PLAY ボタンで開始
  const fsOn=!!(window.VfdFullscreen&&VfdFullscreen.isActive());
  g.fillText(IS_TOUCH_DEVICE?(fsOn?'TAP TO START':'PLAY TO START'):'SPACE / PLAY TO START',W*0.5,H*0.25);
  if(IS_TOUCH_DEVICE&&fsOn&&H>W){
    g.font=`${Math.round(W*0.034)}px 'Share Tech Mono',monospace`;
    g.fillStyle='rgba(93,240,200,0.38)';
    g.fillText('ROTATE TO LANDSCAPE FOR BEST VIEW',W*0.5,H*0.25+Math.round(W*0.06));
  }
  g.shadowBlur=0;g.textAlign='left';
  if(typeof Garage!=='undefined')Garage.drawPanel(g);          // ガレージ（閉じている時は「G: GARAGE」の案内だけ。開いた時だけパネルを出す）
}

function drawGameOver(){
  g.fillStyle='rgba(0,4,8,0.72)';g.fillRect(0,H*0.25,W,H*0.35);
  g.textAlign='center';
  g.fillStyle='#ff3050';g.shadowColor='#ff3050';g.shadowBlur=14;
  g.font=`bold ${Math.round(H*0.09)}px 'Share Tech Mono',monospace`;
  g.fillText('GAME OVER',W*0.5,H*0.42);
  g.fillStyle='#5df0c8';g.shadowColor='#5df0c8';g.shadowBlur=6;
  g.font=`${Math.round(H*0.040)}px 'Share Tech Mono',monospace`;
  g.fillText(`${(game.dist/1000).toFixed(2)} km`,W*0.5,H*0.515);
  g.shadowBlur=0;g.textAlign='left';
}
function drawLogs(g){
  const y0=H*0.77;
  g.strokeStyle='rgba(93,240,200,0.09)';g.lineWidth=1;
  g.beginPath();g.moveTo(W*0.03,y0-3);g.lineTo(W*0.97,y0-3);g.stroke();
  const lh=Math.round(H*0.036)*1.5,maxL=Math.floor((H-y0)/lh);
  g.font=`${Math.round(H*0.033)}px 'Share Tech Mono',monospace`;g.textAlign='left';
  logs.slice(0,maxL).forEach((l,i)=>{
    l.age++;
    const fi=Math.min(1,l.age/8),fo=Math.max(0,1-Math.max(0,l.age-l.life*0.7)/(l.life*0.3));
    g.fillStyle=i===0?`rgba(93,240,200,${fi*fo*0.92})`:`rgba(93,240,200,${fi*fo*0.35})`;
    g.shadowColor=i===0?'rgba(93,240,200,0.5)':'transparent';g.shadowBlur=i===0?4:0;
    g.fillText('> '+l.text,W*0.03,y0+lh*(i+1));
  });
  logs.splice(0,logs.length,...logs.filter(l=>l.age<l.life));
  g.shadowBlur=0;
}
function hexA(hex,a){
  const r=parseInt(hex.slice(1,3),16),gr=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
  return`rgba(${r},${gr},${b},${a})`;
}

// ════════════════════════════════════
// Auto Drone 連動
// ════════════════════════════════════
setInterval(()=>{
  if(!enabled)return;
  const el=document.getElementById('adSongCounter');if(!el)return;
  const txt=el.textContent;
  if(txt!==stat.lastSong&&txt!=='—'){
    stat.lastSong=txt;stat.songs++;
    if(mode===MODE.DEMO){buildCourse();buildEnv();buildMountains();}
    addLog(`SONG ${txt}  ${Math.round(getBpm())}BPM`);
    if(stat.songs%5===0)addLog(`UPTIME ${uptime()}`);
  }
},1200);
// トンネル暗転無効
setInterval(()=>{const el=document.getElementById('vfdUptimeDisplay');if(el)el.textContent=uptime();},1000);

const _rs=window.rhythmStart,_rt=window.rhythmStop;
window.rhythmStart=function(){(_rs||rhythmStart)();addLog('ENGINE START');};
window.rhythmStop =function(){(_rt||rhythmStop)(); addLog('ENGINE STOP');};

// トグルボタン
const tb=document.getElementById('vfdToggleBtn');
if(tb){tb.addEventListener('click',()=>{
  enabled=!enabled;
  if(enabled){
    tb.textContent='ON';tb.className='btn btn-grn';
    tb.style.cssText='font-size:8px;padding:0 8px;height:20px;';
    lastT=0;rafId=requestAnimationFrame(frame);addLog('DISPLAY ON');
  }else{
    tb.textContent='OFF';tb.className='btn';
    tb.style.cssText='font-size:8px;padding:0 8px;height:20px;';
    if(rafId)cancelAnimationFrame(rafId);
    g.fillStyle='#000408';g.fillRect(0,0,W,H);
  }
});}

// ゲームボタン
const gb=document.getElementById('vfdGameBtn');
if(gb){gb.addEventListener('click',()=>{
  initSound();
  if(mode===MODE.PLAY||mode===MODE.OVER){
    mode=MODE.DEMO;player.speed=0;player.x=0;player.xv=0;player.bank=0;traffic=[];
    gb.textContent='PLAY';gb.classList.add('btn-red');gb.classList.remove('btn');
  }else if(IS_TOUCH_DEVICE&&window.VfdTouch){VfdTouch.startMobilePlay();}  // スマホ: フルスクリーン + 開始 + Auto Drone
  else{startGame();}
});}

// ── フルスクリーン ──
// 実フルスクリーン(Fullscreen API)を優先し、使えない環境（iPhone の Safari は <div> の
// フルスクリーン非対応）では CSS の擬似フルスクリーン(.vfd-pfs)にフォールバックする。
// 状態は body.vfd-fs-active と document の 'vfd-fullscreenchange' イベントで他モジュール(16g)へ伝える。
window.VfdFullscreen=(function(){
  const fsBtn    = document.getElementById('vfdFullscreenBtn');
  const fsTarget = document.getElementById('vfdGameViewport');
  if(!fsBtn || !fsTarget) return null;
  let pseudo=false;

  function isNative(){
    return !!(document.fullscreenElement
           || document.webkitFullscreenElement
           || document.mozFullScreenElement
           || document.msFullscreenElement);
  }
  function isActive(){ return isNative() || pseudo; }

  function setPseudo(on){
    pseudo=on;
    fsTarget.classList.toggle('vfd-pfs', on);
    document.documentElement.classList.toggle('vfd-pfs-lock', on);
    sync();
  }
  function lockLandscape(){
    // Android など対応環境のみ。失敗しても支障なし（iPhone は縦のまま遊べる）
    if(IS_TOUCH_DEVICE && screen.orientation && screen.orientation.lock){
      screen.orientation.lock('landscape').catch(()=>{});
    }
  }
  function unlockOrientation(){
    if(screen.orientation && screen.orientation.unlock){ try{ screen.orientation.unlock(); }catch(_){} }
  }

  function enter(){
    if(isActive()) return;
    const req = fsTarget.requestFullscreen
              || fsTarget.webkitRequestFullscreen
              || fsTarget.mozRequestFullScreen
              || fsTarget.msRequestFullscreen;
    if(req){
      try{
        const r=req.call(fsTarget);
        if(r && r.catch) r.catch(()=>setPseudo(true));
      }catch(_){ setPseudo(true); }
    }else{
      setPseudo(true);
    }
    lockLandscape();
  }

  function exit(){
    if(pseudo) setPseudo(false);
    if(isNative()){
      const ex = document.exitFullscreen
               || document.webkitExitFullscreen
               || document.mozCancelFullScreen
               || document.msExitFullscreen;
      if(ex) ex.call(document).catch(()=>{});
    }
    unlockOrientation();
  }

  let lastActive=false;
  function sync(){
    const on=isActive();
    if(on){
      fsBtn.textContent = '✕';
      fsBtn.title = 'Exit Fullscreen';
      fsBtn.classList.add('btn-amb');
    } else {
      fsBtn.textContent = '⛶';
      fsBtn.title = 'Fullscreen';
      fsBtn.classList.remove('btn-amb');
    }
    document.body.classList.toggle('vfd-fs-active', on);
    // canvas リサイズ（レイアウト確定後に再取得）
    setTimeout(resize, 80);
    setTimeout(resize, 350);
    if(on!==lastActive){
      lastActive=on;
      document.dispatchEvent(new CustomEvent('vfd-fullscreenchange',{detail:{active:on}}));
    }
  }

  fsBtn.addEventListener('click', ()=>{ if(isActive()) exit(); else enter(); });

  ['fullscreenchange','webkitfullscreenchange','mozfullscreenchange','MSFullscreenChange']
    .forEach(ev => document.addEventListener(ev, ()=>{
      if(!isNative() && !pseudo) unlockOrientation();
      sync();
    }));
  window.addEventListener('orientationchange', ()=>{ setTimeout(resize, 250); });

  return { enter, exit, isActive };
})();
