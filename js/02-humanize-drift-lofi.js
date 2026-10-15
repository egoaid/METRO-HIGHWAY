// ════════════════════════════════════════════════
// ── HUMANIZE ENGINE v1.0 ──
//
// Central gateway for all performance randomization.
// No Math.random() call for musical timing/velocity/pitch
// should exist outside this module.
//
// Event schema — all generators pass this object:
//   time      {number}  AudioContext scheduled time (s)
//   velocity  {number}  0.0–1.0 amplitude scale
//   freq      {number}  Hz  (0 = unpitched drum)
//   duration  {number}  seconds (0 = one-shot)
//   source    {string}  'rhythm' | 'seqA' | 'seqB' | 'keyboard'
//   track     {string|null}  drum track id or null
//   step      {number}  sequencer step index, or -1
//
// Expansion roadmap:
//   Phase 1 (NOW)  — timing randomization, rhythm only
//   Phase 2        — velocity ±, SEQ-A integration
//   Phase 3        — pitch ± cents, SEQ-B integration
//   Phase 4        — swing/groove engine, full UI panel
// ════════════════════════════════════════════════

// ── Preset library ──
// Each entry defines the *maximum* deviation per dimension.
// Units: timing=ms, velocity=0–1 ratio, pitch=cents, swing=0.5–0.75
const HUMAN_PRESETS = {
  off: {
    timing:   0,
    velocity: 0,
    pitch:    0,
    swing:    0.5,  // 0.5 = straight (no swing)
  },
  tight: {
    timing:   2,
    velocity: 0.04,
    pitch:    0,
    swing:    0.5,   // straight — no swing
  },
  natural: {
    timing:   8,
    velocity: 0.10,
    pitch:    3,
    swing:    0.5,   // straight
  },
  loose: {
    timing:   14,
    velocity: 0.16,
    pitch:    8,
    swing:    0.58,  // light shuffle feel
  },
  lazy: {
    timing:   20,
    velocity: 0.20,
    pitch:    12,
    swing:    0.62,  // medium swing
  },
  jazz: {
    timing:   18,
    velocity: 0.18,
    pitch:    6,
    swing:    0.667, // classic jazz triplet swing (2:1)
  },
};

// ── Active humanize state ──
// Single source of truth. Phase 1: only 'enabled' and 'timing' are live.
// All other fields are reserved and will be activated per phase.
const humanize = {
  enabled:  true,
  preset:   'tight',

  // Live values — mirror HUMAN_PRESETS.tight by default.
  // Can be overridden individually once the UI is built.
  timing:   HUMAN_PRESETS.tight.timing,
  velocity: HUMAN_PRESETS.tight.velocity,
  pitch:    HUMAN_PRESETS.tight.pitch,
  swing:    HUMAN_PRESETS.tight.swing,
};

// ── Preset loader ──
// Called by future UI. Safe to call during playback — affects next event only.
function setHumanizePreset(name) {
  const p = HUMAN_PRESETS[name];
  if (!p) { console.warn(`[Humanize] Unknown preset: "${name}"`); return; }
  humanize.preset   = name;
  humanize.timing   = p.timing;
  humanize.velocity = p.velocity;
  humanize.pitch    = p.pitch;
  humanize.swing    = p.swing;
}

// ── applyHumanize(event) — central gateway ──
//
// Mutates the event object in place and returns it.
// Callers need no conditional guards — if humanize is off,
// the event passes through unmodified.
//
// Scheduler safety rules enforced here:
//   1. event.time is never pushed before ctx.currentTime + 1ms
//   2. Offsets are per-event and stateless — no drift accumulation
//   3. Maximum safe timing offset: 40ms (above LOOK_AHEAD/2 risks
//      pushing an event outside the next schedule window)
//
function applyHumanize(event) {
  if (!humanize.enabled) return event;

  // ── PHASE 1: TIMING (random jitter + groove drift + loop drift) ──
  if (humanize.timing > 0 || drift.grooveMs !== 0 || drift.loopMs !== 0) {
    const jitterMs    = humanize.timing > 0 ? (Math.random() * 2 - 1) * humanize.timing : 0;
    const totalMs     = jitterMs + drift.grooveMs + drift.loopMs;
    const minSafeTime = ctx.currentTime + 0.001;
    event.time = Math.max(minSafeTime, event.time + totalMs / 1000);
  }

  // ── PHASE 2: VELOCITY (random ± velocity drift swell) ──
  if ((humanize.velocity > 0 || drift.velocityScale !== 0) && event.source !== 'rhythm') {
    const randScale  = humanize.velocity > 0 ? 1 + (Math.random() * 2 - 1) * humanize.velocity : 1;
    const driftScale = 1 + drift.velocityScale;
    event.velocity = Math.max(0.05, Math.min(1.0, event.velocity * randScale * driftScale));
  }

  // ── PHASE 3: PITCH (random jitter + slow pitch drift) ──
  // seqA: random jitter + drift both applied
  // seqB: drift only — long drone notes need stable center but can breathe slowly
  if (event.freq > 0) {
    let totalCents = 0;
    if (humanize.pitch > 0 && event.source === 'seqA') {
      totalCents += (Math.random() * 2 - 1) * humanize.pitch;
    }
    if (drift.pitchCents !== 0 && (event.source === 'seqA' || event.source === 'seqB')) {
      totalCents += drift.pitchCents;
    }
    if (totalCents !== 0) {
      event.freq = event.freq * Math.pow(2, totalCents / 1200);
    }
  }

  // ── PHASE 4: SWING ──
  if (humanize.swing > 0.5 && event.step >= 0 && event.stepDur > 0
      && (event.source === 'rhythm' || event.source === 'seqA' || event.source === 'seqB')) {
    if (event.step % 2 === 1) {
      const swingPush = (humanize.swing - 0.5) * event.stepDur;
      event.time += swingPush;
    }
  }

  return event;
}

// ════════════════════════════════════════════════
// ── DRIFT ENGINE ──
//
// Slow, continuous, organic movement for all generators.
// NOT randomization — smooth sinusoidal drift via LFO-style
// accumulators updated at low frequency (200ms tick).
//
// Six drift dimensions:
//   grooveDrift   — global timing breathe (ms offset, bipolar)
//   pitchDrift    — slow pitch wander in cents (seqA + seqB)
//   loopDrift     — timing offset updated once per pattern loop
//   velocityDrift — slow overall note level movement
//   [driftSpeed]  — controls LFO rate across all dimensions
//   [correlation] — single shared phase (ON) vs independent (OFF)
//
// CPU cost: one setInterval/200ms + 6 float multiplications per tick.
// ════════════════════════════════════════════════

// ── Drift state ──
const drift = {
  // User-facing parameters (set by UI sliders)
  grooveDrift:   0,      // max timing wander ±ms
  pitchDrift:    0,      // max pitch wander ±cents
  loopDrift:     0,      // max loop-locked timing offset ±ms
  velocityDrift: 0,      // max velocity wander ±ratio
  driftSpeed:    0.3,    // LFO rate multiplier (0.05–2.0)
  correlation:   1,      // 1 = shared phase, 0 = independent

  // Internal LFO phases (radians, advanced each tick)
  _phaseGroove:   0,
  _phasePitch:    0,
  _phaseLoop:     0,
  _phaseVelocity: 0,

  // Smoothed output values (exponential moving average)
  // These are what applyHumanize actually reads.
  grooveMs:     0,    // current groove timing offset in ms
  pitchCents:   0,    // current pitch drift in cents
  loopMs:       0,    // current loop-locked timing offset in ms
  velocityScale:0,    // current velocity drift (additive, ±ratio)

  // Loop-drift target — only updated once per pattern loop
  _loopDriftTarget: 0,
};

// ── Phase increments per tick (200ms interval) ──
// driftSpeed=1.0 → base periods roughly:
//   groove:   ~20s full cycle  (0.314 rad/tick × speed)
//   pitch:    ~28s full cycle
//   velocity: ~35s full cycle
//   loop:     updated externally (pattern loop event)
const DRIFT_TICK_MS  = 200;
const _DRIFT_BASE = {
  groove:   0.063,   // rad per tick at speed=1
  pitch:    0.044,
  velocity: 0.036,
};

let _driftTickTimer = null;

function _driftTick() {
  if (!humanize.enabled) return;

  const spd = Math.max(0.02, Math.min(4.0, drift.driftSpeed));

  // ── Advance LFO phases ──
  const dGroove = _DRIFT_BASE.groove * spd;
  drift._phaseGroove += dGroove;

  if (drift.correlation >= 0.5) {
    drift._phasePitch    = drift._phaseGroove * 0.97;
    drift._phaseVelocity = drift._phaseGroove * 0.94;
  } else {
    drift._phasePitch    += _DRIFT_BASE.pitch    * spd;
    drift._phaseVelocity += _DRIFT_BASE.velocity * spd;
  }

  // ── Compute sinusoidal targets ──
  const targetGrooveMs      = Math.sin(drift._phaseGroove)   * drift.grooveDrift;
  const targetPitchCents    = Math.sin(drift._phasePitch)    * drift.pitchDrift;
  const targetVelocityScale = Math.sin(drift._phaseVelocity) * drift.velocityDrift;

  // ── Speed-adaptive EMA smoothing ──
  // At slow speeds the LFO moves very little per tick, so a fixed alpha
  // would make the output lag far behind the target — producing silence.
  // alpha scales with speed: fast drift tracks quickly, slow drift
  // still resolves within a few ticks of target movement.
  // Clamp: min 0.04 (very smooth) / max 0.35 (responsive at fast speeds).
  const alpha = Math.max(0.04, Math.min(0.35, spd * 0.18));

  drift.grooveMs      += (targetGrooveMs      - drift.grooveMs)      * alpha;
  drift.pitchCents    += (targetPitchCents    - drift.pitchCents)    * alpha;
  drift.velocityScale += (targetVelocityScale - drift.velocityScale) * alpha;
}

// Called from onRhythmLoopComplete — loop drift updates once per pattern cycle.
function driftOnLoopComplete() {
  if (!humanize.enabled || drift.loopDrift === 0) return;
  // New random target each loop cycle (slow random walk, not LFO)
  drift._loopDriftTarget = (Math.random() * 2 - 1) * drift.loopDrift;
  // Smooth toward it over several ticks
  const smoothLoop = () => {
    const remaining = drift._loopDriftTarget - drift.loopMs;
    if (Math.abs(remaining) < 0.01) { drift.loopMs = drift._loopDriftTarget; return; }
    drift.loopMs += remaining * 0.12;
    setTimeout(smoothLoop, DRIFT_TICK_MS);
  };
  smoothLoop();
}

// Start / stop drift tick with rhythm machine
function driftStart() {
  if (_driftTickTimer) return;
  _driftTickTimer = setInterval(_driftTick, DRIFT_TICK_MS);
}
function driftStop() {
  clearInterval(_driftTickTimer);
  _driftTickTimer = null;
  // Decay all drift outputs toward zero on stop
  drift.grooveMs = 0; drift.pitchCents = 0;
  drift.velocityScale = 0; drift.loopMs = 0;
}
// ════════════════════════════════════════════════
// ── END HUMANIZE ENGINE ──
// ════════════════════════════════════════════════

// ════════════════════════════════════════════════
// ── LO-FI MOTION ENGINE ──
//
// Makes the Lo-Fi Character section evolve organically
// over time — like unstable tape, aging electronics,
// drifting radio reception.
//
// Architecture:
//   Each of the 6 Lo-Fi parameters has an independent
//   LFO with its own phase offset, rate multiplier, and
//   depth scaling. The LFOs are never in sync, so the
//   result sounds like natural analog instability rather
//   than obvious modulation.
//
//   The "base value" is always what the UI slider shows.
//   Motion adds a smooth bipolar offset on top.
//   The UI sliders are never moved — motion is invisible
//   to the user controls but audible in the output.
//
// Two user controls:
//   lofiMotionDepth  — how much each param can move (0–1)
//   lofiMotionSpeed  — LFO rate multiplier (0.02–2.0)
//
// CPU: setInterval/250ms + 6×sin() per tick.
// ════════════════════════════════════════════════

const lofiMotion = {
  enabled: false,
  depth:   0.0,    // 0–1 master depth scale
  speed:   0.2,    // LFO rate multiplier

  // Internal LFO phases (radians) — staggered so no two params move together
  _ph: [0, 1.05, 2.09, 3.14, 4.19, 5.24],  // 0, π/3, 2π/3, π, 4π/3, 5π/3

  // Current motion offsets — read by getLofiParam()
  // Each is a normalized offset in [-1, +1] × depth
  bitDepthOffset:    0,  // subtracted from 16 (lower = more crush)
  sampleRateOffset:  0,  // subtracted from 1.0 (lower = more reduction)
  jitterOffset:      0,  // added to jitter base
  clockDriftOffset:  0,  // added to drift base
  batteryOffset:     0,  // added to battery base
  noiseOffset:       0,  // added to noise base
};

// Per-param config: [base LFO rate multiplier, max deviation at depth=1]
// Rates are intentionally non-integer-related so they never lock in phase.
const _LOFI_MOTION_PARAMS = [
  { key: 'bitDepthOffset',   rate: 1.000, maxDev: 7.5   },  // ±7.5 bits
  { key: 'sampleRateOffset', rate: 0.713, maxDev: 0.65  },  // ±0.65 (sample rate 1→0.35)
  { key: 'jitterOffset',     rate: 1.317, maxDev: 14.0  },  // ±14 jitter units
  { key: 'clockDriftOffset', rate: 0.879, maxDev: 12.0  },  // ±12 drift units
  { key: 'batteryOffset',    rate: 0.541, maxDev: 40.0  },  // ±40 battery units
  { key: 'noiseOffset',      rate: 1.173, maxDev: 32.0  },  // ±32 noise units
];

// Base phase increment per tick (250ms) at speed=1.0
// Chosen so speed=1.0 → ~30s full cycle on the slowest param
const _LOFI_MOTION_BASE_RATE = 0.052; // rad/tick

let _lofiMotionTimer = null;

function _lofiMotionTick() {
  if (!lofiMotion.enabled || lofiMotion.depth <= 0) return;
  const spd = Math.max(0.02, Math.min(4.0, lofiMotion.speed));

  _LOFI_MOTION_PARAMS.forEach((p, i) => {
    // Advance this param's phase independently
    lofiMotion._ph[i] += _LOFI_MOTION_BASE_RATE * spd * p.rate;

    // Smooth sinusoidal target
    const target = Math.sin(lofiMotion._ph[i]) * p.maxDev * lofiMotion.depth;

    // Light EMA smoothing — each param settles at its own pace
    // (different smoothing coefficients add extra organic variety)
    const alpha = 0.08 + (i * 0.016);  // 0.08 → 0.16 across 6 params
    lofiMotion[p.key] += (target - lofiMotion[p.key]) * alpha;
  });

  // Push updated values into the master Lo-Fi ScriptProcessor
  // so bit-crush and sample-rate changes are heard immediately.
  _applyLofiMotionToMaster();
}

// Read a Lo-Fi param value with motion offset applied.
// Called by noteOn() for per-voice params (jitter, drift, battery, noise).
function getLofiParam(id) {
  const el = document.getElementById(id);
  if (!el) return 0;
  const base = parseFloat(el.value);
  if (!lofiMotion.enabled || lofiMotion.depth <= 0) return base;

  switch (id) {
    case 'bitDepth':
      // Crush increases as bitDepth decreases; clamp to [2, 16]
      return Math.max(2, Math.min(16, base - Math.abs(lofiMotion.bitDepthOffset)));
    case 'sampleRate':
      // Reduction increases as value decreases; clamp to [0.02, 1.0]
      return Math.max(0.02, Math.min(1.0, base - Math.abs(lofiMotion.sampleRateOffset)));
    case 'jitter':
      return Math.max(0, Math.min(30, base + lofiMotion.jitterOffset));
    case 'drift':
      return Math.max(0, Math.min(30, base + lofiMotion.clockDriftOffset));
    case 'battery':
      return Math.max(0, Math.min(100, base + Math.abs(lofiMotion.batteryOffset)));
    case 'noise':
      return Math.max(0, Math.min(100, base + Math.abs(lofiMotion.noiseOffset)));
    default:
      return base;
  }
}

// Apply motion to master Lo-Fi ScriptProcessor (bit-crush + sample-rate).
// Called each tick and also when motion is toggled on/off.
function _applyLofiMotionToMaster() {
  const bd = Math.max(2, Math.min(16,
    parseFloat(document.getElementById('bitDepth').value)
    - Math.abs(lofiMotion.bitDepthOffset)
  ));
  const sr = Math.max(0.02, Math.min(1.0,
    parseFloat(document.getElementById('sampleRate').value)
    - Math.abs(lofiMotion.sampleRateOffset)
  ));
  _mlfStep   = bd < 16 ? Math.pow(0.5, bd) : 1.0;
  _mlfReduce = sr;
  if(masterLoFiWorkletNode) {
    masterLoFiWorkletNode.port.postMessage({
      type: 'params',
      step: _mlfStep,
      reduce: _mlfReduce,
    });
  }
}

function lofiMotionStart() {
  if (_lofiMotionTimer) return;
  _lofiMotionTimer = setInterval(_lofiMotionTick, 250);
}

function lofiMotionStop() {
  clearInterval(_lofiMotionTimer);
  _lofiMotionTimer = null;
  // Reset all offsets to zero and restore clean master Lo-Fi state
  _LOFI_MOTION_PARAMS.forEach(p => { lofiMotion[p.key] = 0; });
  updateMasterLoFi();
}
// ════════════════════════════════════════════════
// ── END LO-FI MOTION ENGINE ──
// ════════════════════════════════════════════════
