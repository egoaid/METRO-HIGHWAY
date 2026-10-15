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
  g.shadowColor='#5df0c8';g.shadowBlur=4;
  // HP ハート
  for(let i=0;i<game.maxHp;i++){
    g.fillStyle=i<game.hp?'#ff3050':'rgba(255,48,80,0.22)';
    g.font=`${Math.round(H*0.048)}px serif`;
    g.fillText('♥',W*0.03+i*(H*0.055),H*0.252);
  }
  g.font=`${fs}px 'Share Tech Mono',monospace`;
  g.fillStyle='#5df0c8';g.textAlign='right';
  g.fillText(`${(game.dist/1000).toFixed(2)}km`,W-W*0.03,H*0.215);
  g.fillStyle='rgba(93,240,200,0.42)';
  g.fillText(`BEST ${(game.best/1000).toFixed(2)}km`,W-W*0.03,H*0.252);
  g.shadowBlur=0;g.textAlign='left';
}
function drawDemoOverlay(g){
  g.font=`${Math.round(H*0.036)}px 'Share Tech Mono',monospace`;
  g.textAlign='center';g.fillStyle='rgba(93,240,200,0.50)';
  g.shadowColor='#5df0c8';g.shadowBlur=5;
  g.fillText('SPACE / PLAY TO START',W*0.5,H*0.25);
  g.shadowBlur=0;g.textAlign='left';
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
    g.shadowColor=i===0?'rgba(93,240,200,0.5)':'none';g.shadowBlur=i===0?4:0;
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
  }else{startGame();}
});}

// ── フルスクリーンボタン ──
(function(){
  const fsBtn  = document.getElementById('vfdFullscreenBtn');
  const fsTarget = document.getElementById('vfdGameViewport');
  if(!fsBtn || !fsTarget) return;

  function isFullscreen(){
    return !!(document.fullscreenElement
           || document.webkitFullscreenElement
           || document.mozFullScreenElement
           || document.msFullscreenElement);
  }

  function enterFS(){
    const req = fsTarget.requestFullscreen
              || fsTarget.webkitRequestFullscreen
              || fsTarget.mozRequestFullScreen
              || fsTarget.msRequestFullscreen;
    if(req) req.call(fsTarget).catch(()=>{});
  }

  function exitFS(){
    const ex = document.exitFullscreen
             || document.webkitExitFullscreen
             || document.mozCancelFullScreen
             || document.msExitFullscreen;
    if(ex) ex.call(document).catch(()=>{});
  }

  function syncBtn(){
    if(isFullscreen()){
      fsBtn.textContent = '✕';
      fsBtn.title = 'Exit Fullscreen';
      fsBtn.classList.add('btn-amb');
    } else {
      fsBtn.textContent = '⛶';
      fsBtn.title = 'Fullscreen';
      fsBtn.classList.remove('btn-amb');
    }
    // canvas リサイズを即時トリガー
    setTimeout(resize, 80);
  }

  fsBtn.addEventListener('click', ()=>{
    if(isFullscreen()) exitFS(); else enterFS();
  });

  ['fullscreenchange','webkitfullscreenchange','mozfullscreenchange','MSFullscreenChange']
    .forEach(ev => document.addEventListener(ev, syncBtn));
})();
