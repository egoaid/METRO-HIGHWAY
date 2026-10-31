// ════════════════════════════════════════════════
// ── MANUAL MODAL (EN / 日本語) ──
// Pure DOM overlay. Never touches the AudioContext, sequencers or the
// racing loop, so playback continues while it is open. While open, a
// capture-phase keydown guard stops the PC-keyboard piano and the racing
// start key from firing behind the modal.
// ════════════════════════════════════════════════
(function() {

const MANUAL_EN = `
<h2>Metro Highway — User Manual</h2>
<p class="man-lede">A browser-based ambient drone synthesizer, rhythm machine and step sequencer with an embedded low-poly cyberpunk racing game. No installation or account needed, and it works offline after the first load.</p>

<h3>Tone / Oscillator</h3>
<p>Choose a waveform and shape it with the envelope (Attack / Decay / Sustain / Release), a low-pass filter (Brightness / Resonance), a speaker-size control and an LFO. The preset menu covers pianos, organs, strings, brass, woodwinds, mallets, synths, guitars, lo-fi textures, drones and nature sounds. Save your own sound with <b>User Preset</b>; it is stored only in your browser and appears in every tone menu. <b>PANIC</b> silences everything instantly, <b>RESET</b> returns to defaults and <b>RANDOM</b> generates a new tone.</p>

<h3>Humanize</h3>
<p>Adds small random offsets to timing, velocity and pitch, plus swing. Presets run from Tight to Jazz. <b>Drift</b> adds slow, smooth movement (groove, pitch, loop timing, velocity) that evolves over tens of seconds.</p>

<h3>Lo-Fi Character</h3>
<p>Bit crush, sample-rate reduction, jitter, clock drift, weak-battery saturation and noise floor. <b>Motion</b> makes all of them wander slowly and independently, like aging electronics.</p>

<h3>Chorus &amp; Space Echo</h3>
<p>A stereo chorus and a multi-head tape-style echo with bass/treble EQ in the feedback path and wow/flutter. Both are shared effects; how much each channel sends to them is set in the Mixer.</p>

<h3>Mixer</h3>
<p>Volume, Chorus send and Echo send for Keys, Sequencer A, Drone and Rhythm, plus master volume and mute buttons.</p>

<h3>Rhythm Machine</h3>
<p>A 16-step drum machine with a dozen patterns and several kit voicings. Click a pad to cycle off, on, accent. <b>RANDOM</b> makes a new pattern, <b>AUTO</b> re-randomizes every few loops, <b>POLY</b> gives each drum track its own loop length (1–16 steps), <b>CLR</b> clears the grid. Set tempo with the Tempo slider and press <b>START</b>.</p>

<h3>Sequencer A &amp; Slow Drone Sequencer</h3>
<p>Sequencer A is a 16-step melodic sequencer with note, velocity, gate and tie per step (click a step to cycle off, on, tie). Pick an octave and a scale; the scale is shared with the Slow Drone Sequencer, which plays slow two-note chords, advancing one step every 16 rhythm steps. Each has its own tone selector, RANDOM and CLR. Sequencers play while the Rhythm Machine is running.</p>

<h3>Keyboard</h3>
<p>Click or tap the keys. To play with the computer keyboard, switch <b>PC KEYS</b> ON (it starts OFF): the lower row (Z to /) and upper row (Q to ]) play two overlapping octaves. While PC KEYS is ON the racing game's shortcut keys (G, T, F, ?, - = [ ]) are disabled because they share keys with the piano; while it is OFF the shortcuts work and the letter keys do not play. Starting the game in full screen switches PC KEYS OFF automatically. Use the octave buttons to shift. <b>SNAP</b> quantizes what you play to the current scale.</p><p><b>MIDI</b>: the app does not ask for MIDI at start-up. Press the <b>MIDI</b> button (it starts OFF) and allow the browser's request; plugged-in keyboards are then used, and later plug-ins are picked up automatically. Press it again to disconnect. Web MIDI needs a browser that supports it (e.g. Chrome or Edge; not Safari/iOS).</p><p><b>Pitch and Mod wheels</b>: the PITCH and MOD sliders above the keys do the same as the wheels of a MIDI keyboard (the sliders follow your hardware wheels). PITCH springs back to the centre; MOD stays. They affect only the notes you play on this keyboard. What they do is set in the Tone panel under <b>Pitch / Mod Wheel</b>: <b>Pitch Range</b> (off, ±1, 2, 3, 5, 7, 12 or 24 semitones), and what the Mod wheel controls: <b>Vibrato</b> (LFO pitch depth in cents), <b>Filter</b> (how many octaves it opens) and <b>Tremolo</b> (volume wobble), at the <b>Mod Rate</b> you set. Every preset has its own wheel setup that suits the instrument, they are saved with User Presets, and RANDOM randomizes them too.</p>

<h3>Auto Drone</h3>
<p>Hands-free generative playback: it randomizes tone, rhythm, sequencers, humanize and effects for each song, fading between songs. Set the song length range, BPM range, number of songs (or infinite), fade time, gap and the maximum effect sends.</p>

<h3>Recording</h3>
<p>Press <b>REC</b> to capture what you hear as a 16-bit stereo WAV file; it downloads when you stop.</p>

<h3>VFD Racing</h3>
<p>A low-poly, display-styled driving game built into the synth. Press <b>PLAY</b> (or Space/Enter), then use the arrow keys: up to accelerate, down to brake, left/right to steer. Avoid traffic and the road edge; you have three hearts, and every collision costs one. Now and then a heart lies on the road (about one every 2 km): drive over it to win back half a heart, up to three. Rows of gold coins also lie on the road, and some rows lie in the oncoming lanes (orange coins, worth 2 each, but cars come at you): collect them to earn money, and spend it in the garage (press G on the title screen, or tap GARAGE): buy cars, upgrade them (lane-change speed, top speed, acceleration, braking, grip) and repaint them. Left/right arrows choose a car, T opens tuning, Space/PLAY starts. Energy tanks (green) now and then lie on the road: grab one for +70 km/h top speed and faster acceleration for a few seconds (the screen flashes, the car glows green and the engine roars) (the same length as the star). It is not invincibility, so crashes still cost hearts. Volume: - and = change the BGM, [ and ] change the game sounds (also while playing); the settings are saved. Keyboard: press ? at any time for the list of all shortcuts, and F to switch full screen on and off (Esc leaves it); the keys to press are also shown on the title screen. In full screen the mouse pointer stays visible and only hides while you drive without moving the mouse (move it and it comes back). On a phone the volume and garage buttons are large, and the garage opens as a full-screen sheet. Your cars, upgrades, colours and coins are saved and kept across app updates. Every car has its own lane-change speed, top speed, acceleration, braking, grip and weight, and no car is better at everything. Changing lanes quickly is what makes dodging traffic and grabbing coins and hearts easy. Curves push you outward more the faster you enter them, so brake before sharp ones. Outside of play it runs as an automatic demo synced to the tempo. The ⛶ button toggles fullscreen. On a phone, <b>PLAY</b> opens fullscreen with a single virtual joystick (touch anywhere and drag: up = accelerate, down = brake, left/right = steer); Auto Drone starts together with the game using its current settings. Tap ✕ at the top to leave. Street trees light up in your headlights, and traffic signals appear now and then. Everything outside the road — buildings, trees, street lamps and the mountains — is a hologram: it glitches every so often and the mountains change colour. Text on screen cannot be selected, so a long press never gets in the way. Traffic drives on the right: your lanes are the right half, oncoming cars use the left half — a few cars ignore the rule — and you may steer into the oncoming lane to get past. Cars that collide shake depending on where they were hit, how fast, and how heavy they are (a truck hit by your car hardly moves). From 3 km on, a 3D bonus star falls on the road about every 2 km: drive over one to glow and become invincible for 8 seconds (hearts do not drop, and cars you hit shake much harder). Starting a game also starts Auto Drone, on desktop and phone alike. Traffic signals are always green.</p>

<h3>Install as an app</h3>
<p>Most browsers offer “Install” or “Add to Home Screen” for this page. Once installed it opens in its own window and works offline. When a newer version is published, an update banner appears — tap <b>UPDATE</b> and the app clears its cache and reloads. On phones the screen stays awake while the app is open.</p>

<h3>Privacy</h3>
<p>All sound is generated in your browser. Nothing is uploaded, and presets are saved only on your device.</p>
`;

const MANUAL_JA = `
<h2>Metro Highway — 取扱説明書</h2>
<p class="man-lede">ブラウザで動くアンビエント・ドローン・シンセサイザー、リズムマシン、ステップシーケンサーに、ローポリのサイバーパンク風レーシングゲームを組み込んだアプリです。インストールやアカウント登録は不要で、初回読み込み後はオフラインでも動作します。</p>

<h3>Tone / Oscillator（音色）</h3>
<p>波形を選び、エンベロープ（Attack / Decay / Sustain / Release）、ローパスフィルター（Brightness / Resonance）、スピーカーサイズ、LFOで音を作ります。プリセットにはピアノ、オルガン、ストリングス、ブラス、木管、マレット、シンセ、ギター、ローファイ、ドローン、自然音などがあります。<b>User Preset</b>で自作の音を保存でき、ブラウザ内にのみ保存され、すべての音色メニューに表示されます。<b>PANIC</b>で全ての音を即停止、<b>RESET</b>で初期化、<b>RANDOM</b>で音色をランダム生成します。</p>

<h3>Humanize（人間味）</h3>
<p>タイミング・ベロシティ・ピッチに小さなランダムなズレを加え、スウィングも設定できます。プリセットはTightからJazzまで。<b>Drift</b>はグルーヴ・ピッチ・ループタイミング・ベロシティを数十秒かけてゆっくり滑らかに変化させます。</p>

<h3>Lo-Fi Character（ローファイ）</h3>
<p>ビットクラッシュ、サンプルレート低下、ジッター、クロックドリフト、電池切れ風サチュレーション、ノイズフロア。<b>Motion</b>をオンにすると、これらが経年劣化した機器のようにゆっくり独立して揺らぎます。</p>

<h3>Chorus / Space Echo</h3>
<p>ステレオコーラスと、フィードバック内にBass/Treble EQとワウ・フラッターを持つマルチヘッド式テープエコー。どちらも共有エフェクトで、各チャンネルからの送り量はMixerで設定します。</p>

<h3>Mixer</h3>
<p>Keys・Sequencer A・Drone・Rhythmの音量、Chorusセンド、Echoセンドと、マスター音量、ミュートボタンがあります。</p>

<h3>Rhythm Machine（リズムマシン）</h3>
<p>16ステップのドラムマシン。パターンは十数種類、キットは複数から選べます。パッドをクリックするとオフ、オン、アクセントの順に切り替わります。<b>RANDOM</b>で新パターン、<b>AUTO</b>で数ループごとに自動ランダム化、<b>POLY</b>で各ドラムトラックに独立したループ長（1〜16ステップ）を設定、<b>CLR</b>で全消去。Tempoスライダーでテンポを決め、<b>START</b>で再生します。</p>

<h3>Sequencer A / Slow Drone Sequencer</h3>
<p>Sequencer Aはステップごとにノート・ベロシティ・ゲート・タイを設定できる16ステップのメロディシーケンサーです（ステップをクリックでオフ、オン、タイの順に切替）。オクターブとスケールを選びます。スケールはSlow Drone Sequencerと共有され、こちらはゆっくりした2音のコードを、リズムの16ステップごとに1ステップ進めて演奏します。それぞれ専用の音色選択、RANDOM、CLRを持ちます。シーケンサーはRhythm Machineの再生中に動作します。</p>

<h3>Keyboard（鍵盤）</h3>
<p>鍵盤はクリックまたはタップで弾けます。パソコンのキーボードで弾くには<b>PC KEYS</b>をONにします（初期値はOFF）。下段（Z〜/）と上段（Q〜]）で重なる2オクターブを弾けます。PC KEYSがONの間は、ピアノとキーが重なるためレースゲームのショートカットキー（G、T、F、?、- = [ ]）は使えません。OFFの間はショートカットが使え、文字キーでは鳴りません。ゲームをフルスクリーンにすると、PC KEYSは自動でOFFになります。オクターブボタンで移調できます。<b>SNAP</b>は演奏した音を現在のスケールに合わせます。</p><p><b>MIDI</b>: アプリの起動時にはMIDIの許可を求めません。<b>MIDI</b>ボタン（初期値はOFF）を押して、ブラウザの確認で許可すると、接続中のキーボードが使えます（あとから接続したキーボードも自動で認識します）。もう一度押すと切断します。Web MIDIに対応したブラウザ（ChromeやEdgeなど。Safari/iOSは非対応）が必要です。</p><p><b>ピッチホイール / モジュレーションホイール</b>: 鍵盤の上のPITCH・MODスライダーは、MIDIキーボードのホイールと同じ働きをします（外部のホイールを動かすとスライダーも動きます）。PITCHは離すと中央に戻り、MODはそのまま残ります。このキーボードで弾いた音にだけ効きます。効き方はTone（音色）パネルの<b>Pitch / Mod Wheel</b>で決めます。<b>Pitch Range</b>（OFF、±1、2、3、5、7、12、24半音）と、Modホイールが何を動かすか: <b>Vibrato</b>（LFOによるピッチ変調の深さ。cent）、<b>Filter</b>（フィルターを何オクターブ開くか）、<b>Tremolo</b>（音量の揺れ）を、<b>Mod Rate</b>の速さで動かします。プリセットごとにその楽器に合った設定を持ち、User Presetにも保存され、RANDOMでもランダム化されます。</p>

<h3>Auto Drone（自動演奏）</h3>
<p>手放しで続く自動生成モード。曲ごとに音色・リズム・シーケンサー・Humanize・エフェクトをランダム化し、曲間をフェードでつなぎます。曲の長さ、BPMの範囲、曲数（無限も可）、フェード時間、曲間の無音、エフェクト送り量の上限を設定できます。</p>

<h3>Recording（録音）</h3>
<p><b>REC</b>を押すと聴こえている音を16bitステレオWAVで録音し、停止するとダウンロードされます。</p>

<h3>VFD Racing（ミニゲーム）</h3>
<p>シンセに内蔵された、ローポリの表示器風ドライビングゲームです。<b>PLAY</b>（またはSpace/Enter）で開始し、矢印キーで操作します（↑加速、↓ブレーキ、←→ステア）。他の車や道路の端を避けてください。ハートは3つで、ぶつかるたびに1つ減ります。道路にはときどきハートが落ちていて（約2kmに1個）、取るとハートが半分回復します（最大3つ）。道路には金色のコインの列も落ちています。ときどき対向車線にも落ちていて（橙色のコインは1枚で2枚分ですが、正面から車が来ます）。集めたコインはガレージで使えます（タイトル画面でGキー、またはGARAGEをタップ）。車の購入、強化（車線変更の速さ・最高速・加速・ブレーキ・グリップ）、塗装ができます。左右の矢印で車を選び、Tで強化、Space/PLAYで開始します。道路にはときどきエネルギータンク（緑）が落ちていて、取ると数秒間（星と同じ長さ）最高速が+70km/hになり加速も上がります（画面がフラッシュし、車が緑に光り、エンジンがうなります）。無敵ではないので、ぶつかればハートは減ります。音量は、-と=でBGM、[と]でゲーム音を変えられます（走行中も可。設定は保存されます）。キーボード: ?でいつでもショートカットの一覧を表示、Fでフルスクリーンの切り替え（Escで解除）。押すキーはタイトル画面にも表示されます。フルスクリーンでもマウスカーソルは見えたままで、走行中にマウスを動かさないときだけ消えます（動かすとすぐ戻ります）。スマホでは音量とガレージのボタンが大きくなり、ガレージは全画面のシートで開きます。車・強化・色・コインは保存され、アプリが更新されても引き継がれます。車ごとに車線変更の速さ・最高速・加速・ブレーキ・グリップ・重さが違い、全部が強い車はありません。車線変更が速いほど、車や障害物を避けながらコインやハートを取りやすくなります。カーブは速く入るほど外へ大きく流されるので、きついカーブの前ではブレーキを使ってください。プレイしていない間はテンポに同期した自動デモが動きます。⛶ボタンで全画面表示になります。スマホでは<b>PLAY</b>でフルスクリーンになり、バーチャルジョイスティック1本で操作します（画面のどこかに触れてドラッグ：上＝アクセル、下＝ブレーキ、左右＝ステア）。ゲームの開始と同時にAuto Droneが現在の設定で始まります。上部の✕でフルスクリーンを終了します。街路樹は車のヘッドライトで明るくなり、時々信号機も現れます。道路の外にある建物・木・街灯・遠景の山脈はホログラムで、時々グリッチ（信号ノイズ）が走り、山脈の色も変わります。画面上のテキストは選択できないので、長押ししてもゲームの邪魔になりません。他車は右側通行です（自車線は右半分、対向車は左半分。一部の車はルールを破ります）。自車は対向車線に入って追い越せます。車同士がぶつかると、当たった場所・速度・重さに応じて揺れます（自車がトラックに当たってもトラックはほとんど揺れません）。3kmを超えると、約2kmに1個、立体の星が道路に落ちます。取ると8秒間光って無敵になり（ハートが減らず、当てた車は大きく揺れます）、ゲームを始めるとデスクトップでもスマホでもAuto Droneが自動で始まります。信号機は常に青です。</p>

<h3>アプリとしてインストール</h3>
<p>多くのブラウザで「インストール」または「ホーム画面に追加」ができます。インストール後は専用ウィンドウで起動し、オフラインでも動作します。新しいバージョンが公開されると更新バナーが表示されます。<b>UPDATE</b>をタップするとキャッシュを削除して再読み込みし、最新版になります。スマホではアプリを開いている間、画面が自動でスリープしません。</p>

<h3>プライバシー</h3>
<p>音はすべてブラウザ内で生成されます。データは送信されず、プリセットはお使いの端末にのみ保存されます。</p>
`;

let modalEl = null;
let keyGuardActive = false;

function keyGuard(e) {
  if (!keyGuardActive) return;
  if (e.key === 'Escape') closeManual();
  e.stopImmediatePropagation();
  e.stopPropagation();
}

function buildModal() {
  const wrap = document.createElement('div');
  wrap.id = 'manualModal';
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-modal', 'true');
  wrap.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(4,5,7,0.78);display:flex;align-items:center;justify-content:center;padding:20px;';

  wrap.innerHTML = `
    <div style="background:var(--bg-1,#22252a);border:1px solid var(--bd-2,#3d444f);border-radius:8px;max-width:640px;width:100%;max-height:86vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 10px 60px rgba(0,0,0,0.6);font-family:'Share Tech Mono',monospace;color:var(--txt-0,#e8eaed);">
      <div style="display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid var(--bd-1,#2e333b);background:var(--bg-0,#1c1e22);flex-shrink:0;">
        <span style="font-size:10px;letter-spacing:2px;color:var(--sig-grn,#5df0c8);">MANUAL</span>
        <div style="display:flex;gap:4px;margin-left:6px;">
          <button type="button" data-lang="en" class="man-lang-btn">EN</button>
          <button type="button" data-lang="ja" class="man-lang-btn">日本語</button>
        </div>
        <div style="flex:1;"></div>
        <button type="button" id="manualCloseBtn" aria-label="Close" style="background:var(--bg-2,#2a2e35);border:1px solid var(--bd-2,#3d444f);color:var(--txt-1,#9aa0ab);border-radius:3px;width:24px;height:24px;font-size:13px;cursor:pointer;line-height:1;">✕</button>
      </div>
      <div id="manualBody" style="overflow-y:auto;padding:18px 22px 26px;font-size:12px;line-height:1.75;"></div>
    </div>
    <style>
      #manualBody h2{font-size:16px;letter-spacing:1px;color:#eafffa;margin-bottom:10px;}
      #manualBody h3{font-size:11px;letter-spacing:1.5px;color:var(--sig-grn,#5df0c8);text-transform:uppercase;margin:20px 0 6px;padding-top:12px;border-top:1px solid var(--bd-1,#2e333b);}
      #manualBody p{color:var(--txt-1,#9aa0ab);font-size:11.5px;}
      #manualBody .man-lede{color:var(--txt-0,#e8eaed);font-size:12px;}
      #manualBody b{color:var(--txt-0,#e8eaed);font-weight:600;}
      .man-lang-btn{background:var(--bg-2,#2a2e35);border:1px solid var(--bd-2,#3d444f);color:var(--txt-1,#9aa0ab);font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:1px;padding:4px 9px;border-radius:3px;cursor:pointer;}
      .man-lang-btn.active{background:var(--sig-grn-dk,#0a3d2e);color:var(--sig-grn,#5df0c8);}
      #manualLink:hover{opacity:1 !important;color:var(--sig-grn,#5df0c8) !important;}
    </style>
  `;
  document.body.appendChild(wrap);

  const body = wrap.querySelector('#manualBody');
  function setLang(lang) {
    body.innerHTML = lang === 'ja' ? MANUAL_JA : MANUAL_EN;
    wrap.querySelectorAll('.man-lang-btn').forEach(b => b.classList.toggle('active', b.dataset.lang === lang));
    body.scrollTop = 0;
    try { localStorage.setItem('metrohwy_manual_lang', lang); } catch(_) {}
  }
  wrap.querySelectorAll('.man-lang-btn').forEach(b => b.addEventListener('click', () => setLang(b.dataset.lang)));
  wrap.querySelector('#manualCloseBtn').addEventListener('click', closeManual);
  wrap.addEventListener('mousedown', e => { if (e.target === wrap) closeManual(); });

  let lang = (navigator.language || '').toLowerCase().startsWith('ja') ? 'ja' : 'en';
  try {
    const saved = localStorage.getItem('metrohwy_manual_lang');
    if (saved === 'ja' || saved === 'en') lang = saved;
  } catch(_) {}
  setLang(lang);
  return wrap;
}

function openManual() {
  if (!modalEl) modalEl = buildModal();
  modalEl.style.display = 'flex';
  keyGuardActive = true;
}

function closeManual() {
  if (!modalEl) return;
  modalEl.style.display = 'none';
  keyGuardActive = false;
}

window.addEventListener('keydown', keyGuard, true);

const link = document.getElementById('manualLink');
if (link) link.addEventListener('click', e => { e.preventDefault(); openManual(); });

})();
