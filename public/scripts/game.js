// Luksong Medlane — hidden mini-game easter egg (User Settings > Play Game).
// Deliberately wrapped in a closure: score, obstacles, and the run loop are not
// reachable from the devtools console, so tampering has to go through the
// server API — which is the only thing that actually decides what gets saved
// (see the game-session-token check in src/worker.js).
(function () {
  "use strict";

  const GAME_BADGE_ICON = { Bronze: "🥉", Silver: "🥈", Gold: "🥇", Platinum: "💎" };
  const GAME_BADGE_TIER = { Bronze: 1, Silver: 2, Gold: 3, Platinum: 4 };

  // Score points at which a run fires a one-time celebratory callout (chime + burst +
  // rising in-canvas text). Only the highest crossed in a given frame fires.
  const MILESTONES = [2000, 5000, 10000, 20000];

  // Cached, not re-read every frame — matchMedia.matches is a live property but
  // drawGame()/the loop hit these ~60×/s.
  const reducedMotionMQ = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reducedMotionOn = reducedMotionMQ.matches;
  const onReducedMotionChange = (e) => { reducedMotionOn = e.matches; };
  if (reducedMotionMQ.addEventListener) reducedMotionMQ.addEventListener("change", onReducedMotionChange);
  else if (reducedMotionMQ.addListener) reducedMotionMQ.addListener(onReducedMotionChange);
  function reducedMotion() { return reducedMotionOn; }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  // "Lite mode" kill-switch for the added visual layer (day/night, overdrive wash +
  // speed lines, screen shake, impact flash). Milestones, skins and the shield still
  // work. Toggle from the console: localStorage.setItem("medlane-game-lite","1") (or "0").
  let liteMode = false;
  try { liteMode = localStorage.getItem("medlane-game-lite") === "1"; } catch { /* ignore */ }

  // Cosmetic runner skins — drawn procedurally over the logo badge in drawGame(), no
  // image assets. Unlocks are monotonic (badge = best score, level = cumulative XP;
  // neither ever decreases), so the unlocked set only grows and is safe to cache.
  const SKINS = [
    { id: "classic", label: "Classic", req: null, test: () => true },
    { id: "hardhat", label: "Hard Hat", req: "Level 3", test: (lv) => lv >= 3 },
    { id: "shades", label: "Cool Shades", req: "Level 6", test: (lv) => lv >= 6 },
    { id: "cape", label: "Caped Auditor", req: "Silver badge", test: (lv, tier) => tier >= 2 },
    { id: "gold", label: "Gold Standard", req: "Gold badge", test: (lv, tier) => tier >= 3 },
    { id: "platinum", label: "Platinum Aura", req: "Platinum badge", test: (lv, tier) => tier >= 4 },
  ];
  const SKIN_UNLOCK_KEY = "medlane-game-unlocked-skins";
  const SKIN_CHOICE_KEY = "medlane-game-skin";
  let unlockedSkinIds = new Set(["classic"]);
  try {
    const cached = JSON.parse(localStorage.getItem(SKIN_UNLOCK_KEY) || "[]");
    if (Array.isArray(cached)) cached.forEach((id) => { if (SKINS.some((s) => s.id === id)) unlockedSkinIds.add(id); });
  } catch { /* ignore */ }

  // ---------------------------------------------------------------------
  // Audio — plain <audio> elements playing pre-rendered WAV files, not live
  // Web Audio synthesis. Safari (desktop and iOS) has repeatedly proven
  // unreliable at unlocking raw AudioContext/oscillator output even from a
  // real click — even with the site's Auto-Play permission set to Allow —
  // whereas <audio>.play() from a genuine user gesture is the one audio
  // mechanism every browser is guaranteed to allow with no extra permission.
  // ---------------------------------------------------------------------
  let soundEnabled = true;
  try { soundEnabled = JSON.parse(localStorage.getItem("medlane-game-sound") ?? "true"); } catch { soundEnabled = true; }

  // preload stays "none" so none of this ~220KB downloads on every page load
  // for every visitor — it's fetched only once someone actually opens the
  // game (see primeAllAudio(), called from the "Play Game" click).
  function sound(file, volume = 1) {
    const audio = new Audio(`sounds/${file}`);
    audio.volume = volume;
    audio.preload = "none";
    return audio;
  }

  const sfxAudio = {
    jump: sound("jump.wav", 0.8),
    dodge: sound("dodge.wav", 0.55),
    gameover: sound("gameover.wav", 0.85),
    click: sound("click.wav", 0.5),
    newbest: sound("newbest.wav", 0.85),
    milestone: sound("milestone.wav", 0.7),
    countdownBeep: sound("countdown-beep.wav", 0.8),
    countdownGo: sound("countdown-go.wav", 0.9),
  };
  const musicAudio = sound("music-loop.wav", 0.45);
  musicAudio.loop = true;

  // A shared <audio> element can't overlap itself — starting play() while it's
  // already playing just restarts it, cutting the previous sound short. Only jump and
  // dodge fire fast enough to overlap, so only those get a round-robin pool; every other
  // cue is a one-shot that always finishes before it's asked again. Each pooled node is
  // an independent media element that must be fetched + decoded on its own, and priming
  // ~40 of them on the Play click was contending badly enough to hitch the first jumps —
  // this keeps the total near a dozen. Pools are built eagerly so primeAllAudio() can
  // unlock every node from the same gesture (Safari ties playback permission to the element).
  const SFX_POOL_SIZES = { jump: 3, dodge: 3 };
  const sfxPools = {};
  for (const [key, audio] of Object.entries(sfxAudio)) {
    const size = SFX_POOL_SIZES[key] || 1;
    sfxPools[key] = { nodes: size === 1 ? [audio] : Array.from({ length: size }, () => audio.cloneNode()), next: 0 };
  }
  function playSfx(key) {
    if (!soundEnabled) return;
    try {
      const pool = sfxPools[key];
      const node = pool.nodes[pool.next];
      pool.next = (pool.next + 1) % pool.nodes.length;
      node.volume = sfxAudio[key].volume;
      // play() on an ended element restarts it on its own; only force a rewind to cut off a
      // sound that's still playing, and only when the element can seek without blocking —
      // a currentTime write on a not-ready element was hitching every jump.
      if (!node.ended && node.currentTime > 0.02 && node.readyState >= 3) node.currentTime = 0;
      node.play().catch(() => { /* blocked outside a gesture — silently skip */ });
    } catch (error) { console.error("[Luksong Medlane] playSfx failed:", error); }
  }

  function sfxJump() { playSfx("jump"); }
  function sfxDodge() { playSfx("dodge"); }
  function sfxGameOver() { playSfx("gameover"); }
  function sfxClick() { playSfx("click"); }
  function sfxNewBest() { playSfx("newbest"); }

  // Played (and immediately paused) directly inside the "Play Game" click —
  // the one guaranteed user gesture — so every element's very first play()
  // is gesture-backed. Once "unlocked" this way, later calls (including the
  // music starting after the async countdown, and non-gesture SFX like
  // sfxDodge firing from inside the game loop) keep working for the rest of
  // the session without needing a fresh gesture each time.
  function primeAllAudio() {
    const pooledNodes = Object.values(sfxPools).flatMap((pool) => pool.nodes);
    [...pooledNodes, musicAudio].forEach((audio) => {
      // .load() makes the fetch start unambiguous rather than relying on every
      // browser to trigger it purely from play() on a preload="none" element.
      if (audio.readyState === 0) audio.load();
      const wasMuted = audio.muted;
      audio.muted = true; // silence the priming play so it isn't heard as a blip
      audio.play().then(() => {
        audio.pause();
        audio.currentTime = 0;
        audio.muted = wasMuted;
      }).catch(() => { audio.muted = wasMuted; });
    });
  }

  function startMusic() {
    if (!soundEnabled) return;
    // No `currentTime = 0` here — primeAllAudio() already rewinds the loop on the Play
    // click, and setting currentTime on an element that isn't fully ready can block the
    // main thread synchronously (this was the freeze right after "Talon!"). Starting a
    // loop track a fraction of a second in is imperceptible anyway.
    if (!musicAudio.paused) return;
    musicAudio.play().catch((error) => {
      console.error("[Luksong Medlane] music play failed:", error);
      // Two common causes when a run starts "immediately": the loop file wasn't buffered enough
      // yet, or the gesture-based unlock from primeAllAudio() hadn't resolved. Retry once it can
      // play through, and again on the very next input (a jump/duck is gesture-backed) — as long
      // as the run is still going and sound is still on.
      const retry = () => {
        cleanup();
        if (soundEnabled && gameRunning && musicAudio.paused) musicAudio.play().catch(() => {});
      };
      const cleanup = () => {
        musicAudio.removeEventListener("canplaythrough", retry);
        window.removeEventListener("pointerdown", retry, true);
        window.removeEventListener("keydown", retry, true);
      };
      musicAudio.addEventListener("canplaythrough", retry, { once: true });
      window.addEventListener("pointerdown", retry, { once: true, capture: true });
      window.addEventListener("keydown", retry, { once: true, capture: true });
    });
  }
  function stopMusic() {
    musicAudio.pause();
  }

  function setSoundEnabled(next) {
    soundEnabled = next;
    try { localStorage.setItem("medlane-game-sound", JSON.stringify(soundEnabled)); } catch { /* ignore */ }
    const btn = document.getElementById("game-sound-toggle");
    if (btn) { btn.textContent = soundEnabled ? "🔊" : "🔇"; btn.title = soundEnabled ? "Mute sound" : "Unmute sound"; }
    if (!soundEnabled) stopMusic();
    else if (gameRunning) startMusic();
  }

  // ---------------------------------------------------------------------
  // Game engine — everything here lives in closure scope, never on window.
  // ---------------------------------------------------------------------
  const GRAVITY = 0.62;
  const JUMP_VELOCITY = -11.6;
  const GAME_W = 760;
  const GAME_H = 320;
  const GROUND_Y = 262;
  const PLAYER_X = 78;
  const PLAYER_W = 30;
  const PLAYER_H = 42;
  const CROUCH_H = 20;
  const FLYING_TOP = 40;
  const FLYING_GAP = 24; // clearance above ground a crouching player fits under

  // Deterministic star field for the day->night effect (positions fixed; a slight
  // horizontal parallax is applied at draw time off bgOffset).
  const STARS = Array.from({ length: 42 }, (_, i) => ({
    x: (i * 137.5) % GAME_W,
    y: 12 + ((i * 53) % 150),
    r: 0.6 + (i % 3) * 0.5,
  }));

  const playerLogoImg = new Image();
  playerLogoImg.src = "medlane.jpg";

  let gameCanvas = null;
  let ctx2d = null;
  let gameRunning = false;
  let gameAnimationFrame = null;
  let gameLastTime = 0;
  let gameSessionToken = null;
  let gameRunGeneration = 0; // bumped whenever the modal closes, to cancel a pending countdown

  let playerY = 0;
  let playerVY = 0;
  let onGround = true;
  let crouching = false;
  let obstacles = [];
  let distance = 0;
  let dodged = 0;
  let gameScore = 0;
  let displayedScore = 0;
  let speed = 6.2;
  let spawnTimer = 0;
  let bgOffset = 0;
  let particles = [];

  // Juice + shield state — all reset per run in resetGameState().
  let hasShield = false;
  let invulnFrames = 0;   // hit checks skipped while > 0 (after a shield break)
  let pickups = [];        // 0 or 1 "approved stamp" at a time (see spawn guard)
  let stampTimer = 0;
  let lastStampScore = 0;
  let lastMilestoneIdx = -1;
  let shakeMag = 0;
  let shakeFrames = 0;
  let shakeFramesMax = 1;
  let flashAlpha = 0;      // full-canvas white flash, decays fast
  let milestoneFlash = null; // { text, life, maxLife } rising callout

  // getComputedStyle() forces a style recalculation — cheap once, but drawGame()
  // calls this on every animation frame (~60/sec), so a naive per-call read
  // costs more the longer a run goes. The theme only actually changes when
  // <html data-theme> flips, so cache the result and recompute solely on that.
  let cachedThemeColors = null;
  let cachedSkyGradient = null; // invalidated with cachedThemeColors on theme flip
  // Per-frame effects quantise their intensity into buckets and memoise the rgba
  // strings — building `rgba(… ${x.toFixed(3)})` 60×/s was GC-churning enough to stutter.
  const fxStyle = { nightBucket: -1, nightWash: "", stars: "", moonShade: "", odBucket: -1, speedLine: "", flashBucket: -1, flash: "" };
  function computeThemeColors() {
    const styles = getComputedStyle(document.documentElement);
    const get = (name, fallback) => (styles.getPropertyValue(name) || "").trim() || fallback;
    return {
      skyTop: get("--bg", "#edf5fb"),
      panel: get("--panel-solid", "#ffffff"),
      ink: get("--ink", "#10213d"),
      muted: get("--muted", "#60748d"),
      line: get("--line", "#d7e4f0"),
      blue: get("--blue", "#006eb6"),
      blueDark: get("--blue-dark", "#014f86"),
      green: get("--green", "#0f9f7a"),
      orange: get("--orange", "#f59e0b"),
      red: get("--red", "#d71920"),
    };
  }
  function themeColors() {
    if (!cachedThemeColors) cachedThemeColors = computeThemeColors();
    return cachedThemeColors;
  }
  new MutationObserver(() => { cachedThemeColors = null; cachedSkyGradient = null; })
    .observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  function resetGameState() {
    playerY = GROUND_Y - PLAYER_H;
    playerVY = 0;
    onGround = true;
    crouching = false;
    obstacles = [];
    particles = [];
    distance = 0;
    dodged = 0;
    gameScore = 0;
    displayedScore = 0;
    speed = 6.2;
    spawnTimer = 40;
    bgOffset = 0;
    hasShield = false;
    invulnFrames = 0;
    pickups = [];
    stampTimer = 320;
    lastStampScore = 0;
    lastMilestoneIdx = -1;
    shakeMag = 0;
    shakeFrames = 0;
    flashAlpha = 0;
    milestoneFlash = null;
    const shieldChip = document.getElementById("game-hud-shield");
    if (shieldChip) shieldChip.hidden = true;
  }

  function setupCanvasDPR() {
    if (!gameCanvas) return;
    // Only the drawing-buffer resolution is set here — the CSS width:100%/height:auto
    // on .game-stage canvas (styles.css) is what keeps the game responsive on narrow
    // screens, so an inline pixel size must never be forced here.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    gameCanvas.width = GAME_W * dpr;
    gameCanvas.height = GAME_H * dpr;
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function doJump() {
    if (!gameRunning || !onGround) return;
    playerVY = JUMP_VELOCITY;
    onGround = false;
    crouching = false;
    sfxJump();
  }

  function setCrouching(next) {
    crouching = next;
  }

  function spawnObstacle() {
    // Flying obstacles (must be dodged by crouching, not jumping) only start
    // appearing once the player has cleared a few ground obstacles, so the
    // jump mechanic is taught before crouch is required.
    const canFly = gameScore > 400;
    const type = canFly && Math.random() < 0.4 ? "flying" : "ground";
    if (type === "flying") {
      const w = 36 + Math.round(Math.random() * 16);
      obstacles.push({ type, x: GAME_W + 20, w, passed: false });
    } else {
      const w = 22 + Math.round(Math.random() * 20);
      const h = 30 + Math.round(Math.random() * 20);
      obstacles.push({ type, x: GAME_W + 20, w, h, passed: false });
    }
  }

  // A collectible "approved stamp" — grabbing it grants a one-hit shield. Spawned at
  // jump-apex height with nothing else there, so the risk is breaking rhythm / a jump
  // you didn't need and landing badly. Only one at a time, none while already shielded.
  function spawnStamp() {
    pickups.push({ type: "stamp", x: GAME_W + 30, y: GROUND_Y - PLAYER_H - 52, w: 32, h: 24, bob: Math.random() * Math.PI * 2, taken: false });
  }

  function fireMilestone(value) {
    playSfx("milestone");
    spawnCelebrationParticles({ count: 16, y: 70, power: 0.85 });
    milestoneFlash = { text: value.toLocaleString(), life: 56, maxLife: 56 };
  }

  // Impulse-style shake: a stronger hit overrides a weaker one still in progress. The
  // offset is applied inside drawGame() via ctx.translate (the canvas is already fully
  // repainted every frame, so this is free — no CSS transform / compositor layer).
  function addShake(mag, frames) {
    if (reducedMotion() || liteMode) return;
    if (shakeFrames > 0 && mag <= shakeMag) return;
    shakeMag = mag;
    shakeFrames = frames;
    shakeFramesMax = frames;
  }

  // The loop stops the instant a run ends, so the death shake gets its own short rAF
  // that keeps re-drawing while the offset decays.
  function runShakeOut() {
    if (reducedMotion() || shakeFrames <= 0) return;
    const tick = () => {
      shakeFrames -= 1;
      drawGame();
      if (shakeFrames > 0) requestAnimationFrame(tick);
      else { shakeMag = 0; shakeFrames = 0; }
    };
    requestAnimationFrame(tick);
  }

  function updateGame(dt) {
    distance += speed * dt;
    // Difficulty is tied to score (not just survival time), so a run that racks
    // up dodge bonuses ramps up faster too — and the spawn-gap tightening below
    // keeps making runs harder well past the point speed itself caps out.
    speed = Math.min(6.2 + gameScore / 900, 21);

    const isCrouchingNow = onGround && crouching;
    const playerH = isCrouchingNow ? CROUCH_H : PLAYER_H;

    playerVY += GRAVITY * dt;
    playerY += playerVY * dt;
    if (playerY >= GROUND_Y - PLAYER_H) {
      playerY = GROUND_Y - PLAYER_H;
      playerVY = 0;
      onGround = true;
    }
    if (onGround && crouching) playerY = GROUND_Y - CROUCH_H;

    if (invulnFrames > 0) invulnFrames -= dt;
    if (shakeFrames > 0) shakeFrames -= dt;

    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnObstacle();
      const difficulty = Math.min(gameScore / 25000, 1);
      spawnTimer = (58 - difficulty * 34) + Math.random() * (28 - difficulty * 12);
    }

    // Approved-stamp shield pickup — rare, never before ~1,500, spaced out, and only
    // when it can actually matter (no shield held, none already on screen).
    stampTimer -= dt;
    if (stampTimer <= 0) {
      stampTimer = 90 + Math.random() * 70;
      if (!hasShield && pickups.length === 0 && gameScore > 1500 && gameScore - lastStampScore > 1200 && Math.random() < 0.5) {
        spawnStamp();
        lastStampScore = gameScore;
      }
    }

    const playerBox = { x: PLAYER_X + 5, y: playerY + playerH * 0.1, w: PLAYER_W - 10, h: playerH * 0.85 };
    for (const obstacle of obstacles) {
      obstacle.x -= speed * dt;
      const obstacleBox = obstacle.type === "flying"
        ? { x: obstacle.x + 3, y: FLYING_TOP, w: obstacle.w - 6, h: (GROUND_Y - FLYING_GAP) - FLYING_TOP }
        : { x: obstacle.x + 3, y: GROUND_Y - obstacle.h, w: obstacle.w - 6, h: obstacle.h };

      // Track the tightest vertical clearance while the obstacle is in the player's
      // lane — a small positive gap on pass is a "near-miss" (shake + flash, no score).
      if (!obstacle.passed && obstacle.x < PLAYER_X + PLAYER_W && obstacle.x + obstacle.w > PLAYER_X - 4) {
        const gap = obstacle.type === "flying"
          ? playerBox.y - (obstacleBox.y + obstacleBox.h)
          : obstacleBox.y - (playerBox.y + playerBox.h);
        if (gap >= 0) obstacle.minGap = Math.min(obstacle.minGap ?? Infinity, gap);
      }

      if (!obstacle.passed && obstacle.x + obstacle.w < PLAYER_X) {
        obstacle.passed = true;
        dodged++;
        sfxDodge();
        if ((obstacle.minGap ?? Infinity) <= 14) { addShake(2.6, 8); flashAlpha = Math.max(flashAlpha, 0.42); }
      }

      const hit = playerBox.x < obstacleBox.x + obstacleBox.w && playerBox.x + playerBox.w > obstacleBox.x && playerBox.y < obstacleBox.y + obstacleBox.h && playerBox.y + playerBox.h > obstacleBox.y;
      if (hit && invulnFrames <= 0) {
        if (hasShield) {
          hasShield = false;
          invulnFrames = 35;
          obstacle.passed = true;
          playSfx("newbest");
          addShake(8, 20);
          flashAlpha = Math.max(flashAlpha, 0.7);
          const chip = document.getElementById("game-hud-shield");
          if (chip) chip.hidden = true;
        } else {
          endGame();
          return;
        }
      }
    }
    obstacles = obstacles.filter((obstacle) => obstacle.x + obstacle.w > -10);

    for (const pickup of pickups) {
      pickup.x -= speed * dt;
      const py = pickup.y + Math.sin((distance + pickup.bob) / 14) * 4;
      const grabbed = !pickup.taken
        && playerBox.x < pickup.x + pickup.w && playerBox.x + playerBox.w > pickup.x
        && playerBox.y < py + pickup.h && playerBox.y + playerBox.h > py;
      if (grabbed) {
        pickup.taken = true;
        hasShield = true;
        playSfx("newbest");
        spawnCelebrationParticles({ count: 8, x: pickup.x + pickup.w / 2, y: py, power: 0.55 });
        const chip = document.getElementById("game-hud-shield");
        if (chip) chip.hidden = false;
      }
    }
    pickups = pickups.filter((pickup) => !pickup.taken && pickup.x + pickup.w > -10);

    for (const particle of particles) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 0.25 * dt;
      particle.life -= dt;
    }
    particles = particles.filter((particle) => particle.life > 0);

    bgOffset -= speed * dt * 0.35;

    gameScore = Math.floor(distance / 8) + dodged * 10;

    // Milestone callout — fire only the highest threshold newly crossed this frame.
    for (let i = MILESTONES.length - 1; i > lastMilestoneIdx; i--) {
      if (gameScore >= MILESTONES[i]) { lastMilestoneIdx = i; fireMilestone(MILESTONES[i]); break; }
    }
    if (flashAlpha > 0) flashAlpha = Math.max(0, flashAlpha - 0.06 * dt);
    if (milestoneFlash) { milestoneFlash.life -= dt; if (milestoneFlash.life <= 0) milestoneFlash = null; }

    // The on-screen counter climbs toward the real score in small steps instead of
    // snapping straight to it — a sudden +10 dodge bonus used to look like the
    // number jumping around; this keeps it reading as a smooth, controlled climb.
    // gameScore itself (used for badges/leveling/submission) is never touched here.
    if (displayedScore < gameScore) displayedScore = Math.min(displayedScore + Math.max(1, Math.ceil(dt * 3)), gameScore);
    else displayedScore = gameScore;
    const scoreEl = document.getElementById("game-score");
    if (scoreEl) scoreEl.textContent = String(Math.floor(displayedScore));
  }

  function roundRectPath(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function drawRoundedRect(x, y, w, h, r) { roundRectPath(ctx2d, x, y, w, h, r); }

  function drawGame() {
    const c = themeColors();
    ctx2d.clearRect(0, 0, GAME_W, GAME_H);

    // Screen-shake offset, applied in canvas space (free — the canvas is fully
    // repainted every frame anyway). Restored at the end of the function.
    let shaking = false;
    if (shakeFrames > 0 && shakeMag > 0) {
      const p = Math.max(shakeFrames / shakeFramesMax, 0);
      const amt = shakeMag * p;
      ctx2d.save();
      ctx2d.translate((Math.random() * 2 - 1) * amt, (Math.random() * 2 - 1) * amt);
      shaking = true;
    }

    if (!cachedSkyGradient) {
      cachedSkyGradient = ctx2d.createLinearGradient(0, 0, 0, GROUND_Y + 20);
      cachedSkyGradient.addColorStop(0, c.skyTop);
      cachedSkyGradient.addColorStop(1, c.panel);
    }
    ctx2d.fillStyle = cachedSkyGradient;
    // Oversized so a shake translate never bares an edge.
    ctx2d.fillRect(-14, -14, GAME_W + 28, GAME_H + 28);

    // Distant office skyline (parallax)
    ctx2d.fillStyle = c.line;
    ctx2d.globalAlpha = 0.55;
    const buildingW = 64;
    const startX = (bgOffset % buildingW) - buildingW;
    for (let x = startX, i = 0; x < GAME_W + buildingW; x += buildingW, i++) {
      const h = 46 + ((i * 37) % 60);
      drawRoundedRect(x + 8, GROUND_Y - h, 38, h, 4);
      ctx2d.fill();
    }
    ctx2d.globalAlpha = 1;

    // Day -> night: a blue wash that deepens with score, then stars + a moon fade in on
    // a strong run. Painted over the sky/skyline but under the foreground so obstacles
    // and the runner stay readable. Independent of the app light/dark theme.
    const nightT = liteMode ? 0 : clamp01(gameScore / 30000);
    if (nightT > 0.02) {
      const b = Math.round(nightT * 16);
      if (fxStyle.nightBucket !== b) {
        fxStyle.nightBucket = b;
        const nt = b / 16;
        fxStyle.nightWash = `rgba(6,14,32,${(nt * 0.7).toFixed(3)})`;
        const sa = clamp01((nt - 0.4) / 0.35);
        fxStyle.stars = `rgba(255,255,255,${(sa * 0.9).toFixed(3)})`;
        fxStyle.moonShade = `rgba(10,22,46,${(0.5 * nt).toFixed(3)})`;
      }
      ctx2d.fillStyle = fxStyle.nightWash; // one flat wash, no per-frame gradient/string
      ctx2d.fillRect(-14, -14, GAME_W + 28, GROUND_Y + 34);
    }
    if (nightT > 0.4) {
      const starA = clamp01((nightT - 0.4) / 0.35);
      ctx2d.fillStyle = fxStyle.stars; // all stars in one path / one fill
      ctx2d.beginPath();
      for (const star of STARS) {
        let sx = (star.x + bgOffset * 0.12) % GAME_W;
        if (sx < 0) sx += GAME_W;
        ctx2d.moveTo(sx + star.r, star.y);
        ctx2d.arc(sx, star.y, star.r, 0, Math.PI * 2);
      }
      ctx2d.fill();
      ctx2d.globalAlpha = starA;
      ctx2d.fillStyle = "rgba(240, 244, 255, 0.95)";
      ctx2d.beginPath();
      ctx2d.arc(GAME_W - 86, 56, 15, 0, Math.PI * 2);
      ctx2d.fill();
      ctx2d.fillStyle = fxStyle.moonShade;
      ctx2d.beginPath();
      ctx2d.arc(GAME_W - 80, 52, 13, 0, Math.PI * 2);
      ctx2d.fill();
      ctx2d.globalAlpha = 1;
    }

    // Overdrive — a warm wash once the run is really moving (speed lines are added over
    // the foreground later, near the end of the frame).
    const overdrive = liteMode ? 0 : clamp01((speed - 14) / 7);
    if (overdrive > 0) {
      ctx2d.fillStyle = c.orange;
      ctx2d.globalAlpha = 0.12 * overdrive;
      ctx2d.fillRect(-14, -14, GAME_W + 28, GROUND_Y + 34);
      ctx2d.globalAlpha = 1;
    }

    // Ground (drawn a bit past both edges so a shake translate never opens a gap)
    ctx2d.strokeStyle = c.muted;
    ctx2d.lineWidth = 2;
    ctx2d.beginPath();
    ctx2d.moveTo(-14, GROUND_Y + 1);
    ctx2d.lineTo(GAME_W + 14, GROUND_Y + 1);
    ctx2d.stroke();
    ctx2d.strokeStyle = c.line;
    ctx2d.lineWidth = 3;
    ctx2d.setLineDash([16, 14]);
    const dashOffset = -(distance % 30);
    ctx2d.lineDashOffset = dashOffset;
    ctx2d.beginPath();
    ctx2d.moveTo(-14, GROUND_Y + 10);
    ctx2d.lineTo(GAME_W + 14, GROUND_Y + 10);
    ctx2d.stroke();
    ctx2d.setLineDash([]);

    // Obstacles — stacked "audit" folders on the ground, or a hanging "audit
    // notice" banner that must be ducked under instead of jumped.
    for (const obstacle of obstacles) {
      if (obstacle.type === "flying") {
        const ox = obstacle.x, ow = obstacle.w, bottom = GROUND_Y - FLYING_GAP;
        ctx2d.fillStyle = c.red;
        ctx2d.globalAlpha = 0.16;
        ctx2d.fillRect(ox, FLYING_TOP, ow, bottom - FLYING_TOP);
        ctx2d.globalAlpha = 1;
        ctx2d.fillStyle = c.panel;
        drawRoundedRect(ox, bottom - 34, ow, 34, 5);
        ctx2d.fill();
        ctx2d.strokeStyle = c.red;
        ctx2d.lineWidth = 2.5;
        drawRoundedRect(ox, bottom - 34, ow, 34, 5);
        ctx2d.stroke();
        ctx2d.fillStyle = c.red;
        ctx2d.font = "bold 9px 'Segoe UI', system-ui, sans-serif";
        ctx2d.textAlign = "center";
        ctx2d.textBaseline = "middle";
        ctx2d.fillText("AUDIT", ox + ow / 2, bottom - 17);
        ctx2d.strokeStyle = c.red;
        ctx2d.lineWidth = 2;
        [0.22, 0.78].forEach((frac) => {
          ctx2d.beginPath();
          ctx2d.moveTo(ox + ow * frac, FLYING_TOP - 6);
          ctx2d.lineTo(ox + ow * frac, bottom - 34);
          ctx2d.stroke();
        });
        continue;
      }
      const ox = obstacle.x, oy = GROUND_Y - obstacle.h, ow = obstacle.w, oh = obstacle.h;
      ctx2d.fillStyle = c.panel;
      drawRoundedRect(ox, oy, ow, oh, 4);
      ctx2d.fill();
      ctx2d.strokeStyle = c.red;
      ctx2d.lineWidth = 2.5;
      drawRoundedRect(ox, oy, ow, oh, 4);
      ctx2d.stroke();
      ctx2d.fillStyle = c.red;
      ctx2d.fillRect(ox + 4, oy + 5, ow - 8, 3);
      ctx2d.globalAlpha = 0.55;
      ctx2d.fillRect(ox + 4, oy + 12, ow - 8, 2.4);
      ctx2d.fillRect(ox + 4, oy + 18, ow - 12, 2.4);
      ctx2d.globalAlpha = 1;
      ctx2d.beginPath();
      ctx2d.arc(ox + ow - 8, oy - 8, 7, 0, Math.PI * 2);
      ctx2d.fillStyle = c.red;
      ctx2d.fill();
      ctx2d.fillStyle = "#fff";
      ctx2d.font = "bold 10px 'Segoe UI', system-ui, sans-serif";
      ctx2d.textAlign = "center";
      ctx2d.textBaseline = "middle";
      ctx2d.fillText("!", ox + ow - 8, oy - 7.5);
    }

    // Approved-stamp shield pickups (0 or 1 on screen).
    for (const pickup of pickups) {
      const py = pickup.y + Math.sin((distance + pickup.bob) / 14) * 4;
      ctx2d.save();
      ctx2d.globalAlpha = 0.25 + 0.15 * Math.sin(distance / 8);
      ctx2d.strokeStyle = c.green;
      ctx2d.lineWidth = 4;
      drawRoundedRect(pickup.x - 3, py - 3, pickup.w + 6, pickup.h + 6, 8);
      ctx2d.stroke();
      ctx2d.globalAlpha = 1;
      ctx2d.fillStyle = c.panel;
      drawRoundedRect(pickup.x, py, pickup.w, pickup.h, 5);
      ctx2d.fill();
      ctx2d.strokeStyle = c.green;
      ctx2d.lineWidth = 2.5;
      drawRoundedRect(pickup.x, py, pickup.w, pickup.h, 5);
      ctx2d.stroke();
      ctx2d.fillStyle = c.green;
      ctx2d.font = "bold 15px 'Segoe UI', system-ui, sans-serif";
      ctx2d.textAlign = "center";
      ctx2d.textBaseline = "middle";
      ctx2d.fillText("✓", pickup.x + pickup.w / 2, py + pickup.h / 2 + 1);
      ctx2d.restore();
    }

    // Player — the Medlane logo as a running "avatar" badge, with two small
    // legs underneath so the run/jump/crouch animation still reads clearly.
    const isCrouchingNow = onGround && crouching;
    const playerH = isCrouchingNow ? CROUCH_H : PLAYER_H;
    const legPhase = onGround ? Math.sin(distance / 5.2) : 0;
    const px = PLAYER_X, py = playerY;
    ctx2d.fillStyle = c.orange;
    ctx2d.fillRect(px + 6, py + playerH - 8 + (onGround && !isCrouchingNow ? Math.max(legPhase, 0) * 5 : -3), 6, isCrouchingNow ? 6 : 10);
    ctx2d.fillRect(px + PLAYER_W - 12, py + playerH - 8 + (onGround && !isCrouchingNow ? Math.max(-legPhase, 0) * 5 : -3), 6, isCrouchingNow ? 6 : 10);
    const badgeX = px - 3, badgeY = py, badgeW = PLAYER_W + 6, badgeH = Math.max(playerH - 12, 14);
    if (playerLogoImg.complete && playerLogoImg.naturalWidth) {
      ctx2d.save();
      drawRoundedRect(badgeX, badgeY, badgeW, badgeH, 8);
      ctx2d.fillStyle = "#ffffff";
      ctx2d.fill();
      ctx2d.clip();
      ctx2d.drawImage(playerLogoImg, badgeX, badgeY, badgeW, badgeH);
      ctx2d.restore();
      ctx2d.strokeStyle = c.blue;
      ctx2d.lineWidth = 2;
      drawRoundedRect(badgeX, badgeY, badgeW, badgeH, 8);
      ctx2d.stroke();
    } else {
      ctx2d.fillStyle = c.blue;
      drawRoundedRect(badgeX, badgeY, badgeW, badgeH, 8);
      ctx2d.fill();
    }

    // Cosmetic skin overlay (never affects the hitbox) + the shield ring.
    drawSkinOn(ctx2d, effectiveSkin(), badgeX, badgeY, badgeW, badgeH, isCrouchingNow, distance);
    if (hasShield || invulnFrames > 0) {
      const ringA = invulnFrames > 0
        ? 0.3 + 0.45 * Math.abs(Math.sin(distance / 4))
        : 0.45 + 0.3 * Math.sin(distance / 10);
      ctx2d.globalAlpha = clamp01(ringA);
      ctx2d.strokeStyle = c.blue;
      ctx2d.lineWidth = 2.5;
      ctx2d.beginPath();
      ctx2d.ellipse(px + PLAYER_W / 2, badgeY + badgeH / 2, badgeW * 0.9, badgeH * 0.95, 0, 0, Math.PI * 2);
      ctx2d.stroke();
      ctx2d.globalAlpha = 1;
    }

    // Particles (new-best / milestone celebration)
    for (const particle of particles) {
      ctx2d.globalAlpha = Math.max(particle.life / particle.maxLife, 0);
      ctx2d.fillStyle = particle.color;
      ctx2d.beginPath();
      ctx2d.arc(particle.x, particle.y, particle.r, 0, Math.PI * 2);
      ctx2d.fill();
    }
    ctx2d.globalAlpha = 1;

    // Overdrive speed lines — motion streaks over the foreground (skipped for reduced
    // motion). All strokes in one path.
    if (overdrive > 0 && !reducedMotion()) {
      const ob = Math.round(overdrive * 10);
      if (fxStyle.odBucket !== ob) {
        fxStyle.odBucket = ob;
        fxStyle.speedLine = `rgba(255,255,255,${(0.26 * (ob / 10)).toFixed(3)})`;
      }
      ctx2d.strokeStyle = fxStyle.speedLine;
      ctx2d.lineWidth = 2;
      const lineCount = 3 + Math.round(overdrive * 4);
      ctx2d.beginPath();
      for (let i = 0; i < lineCount; i++) {
        const ly = Math.random() * (GROUND_Y - 20) + 10;
        const lx = Math.random() * GAME_W;
        const ll = 40 + Math.random() * 80 * overdrive;
        ctx2d.moveTo(lx, ly);
        ctx2d.lineTo(lx - ll, ly);
      }
      ctx2d.stroke();
    }

    // Milestone callout — bold number rising and fading near the top of the stage.
    if (milestoneFlash) {
      const p = milestoneFlash.life / milestoneFlash.maxLife;
      ctx2d.save();
      ctx2d.globalAlpha = clamp01(p < 0.25 ? p / 0.25 : (p > 0.85 ? (1 - p) / 0.15 : 1));
      ctx2d.fillStyle = c.orange;
      ctx2d.font = "900 42px 'Segoe UI', system-ui, sans-serif";
      ctx2d.textAlign = "center";
      ctx2d.textBaseline = "middle";
      const fy = 118 - (1 - p) * 44;
      ctx2d.lineWidth = 3;
      ctx2d.strokeStyle = "rgba(255, 255, 255, 0.65)";
      ctx2d.strokeText(milestoneFlash.text, GAME_W / 2, fy);
      ctx2d.fillText(milestoneFlash.text, GAME_W / 2, fy);
      ctx2d.restore();
    }

    // Impact flash (near-miss / shield break) — full-canvas white, decays fast.
    if (flashAlpha > 0.01 && !reducedMotion() && !liteMode) {
      const fb = Math.round(flashAlpha * 20);
      if (fxStyle.flashBucket !== fb) { fxStyle.flashBucket = fb; fxStyle.flash = `rgba(255,255,255,${(fb / 20).toFixed(3)})`; }
      ctx2d.fillStyle = fxStyle.flash;
      ctx2d.fillRect(-14, -14, GAME_W + 28, GAME_H + 28);
    }

    if (shaking) ctx2d.restore();
  }

  // Procedural cosmetic overlay on the logo badge — no image assets, no gameplay
  // effect. Sized off the badge box (bw/bh) so the same routine renders both the live
  // runner (ctx2d, phase = distance) and the leaderboard thumbnails (offscreen ctx,
  // phase = 0). `phase` drives the cape/platinum animation.
  function drawSkinOn(g, id, bx, by, bw, bh, crouch, phase) {
    if (!id || id === "classic") return;
    const cx = bx + bw / 2;
    g.save();
    if (id === "hardhat") {
      g.fillStyle = "#f4b400";
      g.beginPath();
      g.ellipse(cx, by, bw * 0.52, Math.max(bh * 0.24, 6), 0, Math.PI, Math.PI * 2);
      g.fill();
      g.fillRect(cx - bw * 0.62, by - 2, bw * 1.24, 3);
      g.fillRect(cx - 2, by - Math.max(bh * 0.22, 7), 4, Math.max(bh * 0.22, 7));
    } else if (id === "shades") {
      const gy = by + bh * (crouch ? 0.52 : 0.4);
      const gh = Math.max(bh * 0.16, 5);
      g.fillStyle = "rgba(10, 12, 20, 0.92)";
      g.fillRect(cx - bw * 0.44, gy, bw * 0.36, gh);
      g.fillRect(cx + bw * 0.08, gy, bw * 0.36, gh);
      g.fillRect(cx - bw * 0.08, gy + 1.5, bw * 0.16, 2);
    } else if (id === "cape") {
      const wave = Math.sin(phase / 8) * (bw * 0.12);
      g.fillStyle = "#d71920";
      g.beginPath();
      g.moveTo(bx + 2, by + 2);
      g.lineTo(bx - bw * 0.42 - wave, by + bh + bh * 0.24);
      g.lineTo(bx + bw * 0.24, by + bh);
      g.closePath();
      g.fill();
    } else if (id === "gold") {
      g.strokeStyle = "#e8b923";
      g.lineWidth = 3;
      roundRectPath(g, bx - 1.5, by - 1.5, bw + 3, bh + 3, 9);
      g.stroke();
      g.fillStyle = "#e8b923";
      const s = bw * 0.14;
      g.beginPath();
      g.moveTo(cx - s * 2.2, by - 2);
      g.lineTo(cx - s * 1.1, by - s * 2);
      g.lineTo(cx, by - 2);
      g.lineTo(cx + s * 1.1, by - s * 2);
      g.lineTo(cx + s * 2.2, by - 2);
      g.closePath();
      g.fill();
    } else if (id === "platinum") {
      g.globalAlpha = 0.45 + 0.3 * Math.sin(phase / 6);
      g.strokeStyle = "#bfe3ff";
      g.lineWidth = 2;
      roundRectPath(g, bx - 2.5, by - 2.5, bw + 5, bh + 5, 10);
      g.stroke();
      g.globalAlpha = 1;
      for (let i = 0; i < 3; i++) {
        const a = phase / 20 + i * 2.1;
        g.fillStyle = "rgba(205, 235, 255, 0.9)";
        g.beginPath();
        g.arc(cx + Math.cos(a) * bw * 0.72, by + bh / 2 + Math.sin(a) * bh * 0.72, Math.max(bw * 0.05, 1.5), 0, Math.PI * 2);
        g.fill();
      }
    }
    g.restore();
  }

  // A small badge+skin avatar for the leaderboard ("show off your custom design").
  // Computed once per skin id and cached — at most six ever exist.
  const skinThumbCache = {};
  function skinThumbDataUrl(id) {
    const key = SKINS.some((s) => s.id === id) ? id : "classic";
    if (skinThumbCache[key]) return skinThumbCache[key];
    const size = 48, pad = 5, bw = size - pad * 2, bh = size - pad * 2, bx = pad, by = pad;
    const cv = document.createElement("canvas");
    cv.width = size; cv.height = size;
    const g = cv.getContext("2d");
    roundRectPath(g, bx, by, bw, bh, 10);
    g.fillStyle = "#ffffff"; g.fill();
    if (playerLogoImg.complete && playerLogoImg.naturalWidth) {
      g.save();
      roundRectPath(g, bx, by, bw, bh, 10);
      g.clip();
      g.drawImage(playerLogoImg, bx, by, bw, bh);
      g.restore();
    }
    g.strokeStyle = "#006eb6"; g.lineWidth = 2;
    roundRectPath(g, bx, by, bw, bh, 10); g.stroke();
    drawSkinOn(g, key, bx, by, bw, bh, false, 0);
    const url = cv.toDataURL();
    skinThumbCache[key] = url;
    return url;
  }
  // The logo often isn't decoded yet on first paint — drop the (logoless) cache once
  // it loads so thumbnails regenerate with the badge image.
  playerLogoImg.addEventListener("load", () => { for (const k of Object.keys(skinThumbCache)) delete skinThumbCache[k]; }, { once: true });

  const RARE_SKINS = new Set(["cape", "gold", "platinum"]);
  function leaderboardAvatar(skin, size) {
    const id = SKINS.some((s) => s.id === skin) ? skin : "classic";
    const rare = RARE_SKINS.has(id) ? ` data-rare="${id}"` : "";
    return `<img class="game-lb-avatar" src="${skinThumbDataUrl(id)}" alt="" width="${size}" height="${size}"${rare}>`;
  }

  function spawnCelebrationParticles(opts) {
    const { count = 26, x = GAME_W / 2, y = 90, power = 1 } = opts || {};
    const c = themeColors();
    const colors = [c.blue, c.orange, c.green, c.red];
    for (let i = 0; i < count; i++) {
      particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 9 * power,
        vy: (-Math.random() * 6 - 2) * power,
        r: 2 + Math.random() * 2.5,
        life: 50 + Math.random() * 20,
        maxLife: 70,
        color: colors[i % colors.length],
      });
    }
  }

  function gameLoop(timestamp) {
    if (!gameRunning) return;
    const dt = Math.min((timestamp - gameLastTime) / 16.6667, 2.5);
    gameLastTime = timestamp;
    updateGame(dt);
    if (gameRunning) {
      drawGame();
      gameAnimationFrame = requestAnimationFrame(gameLoop);
    }
  }

  // `busy` disables the button and shows "Saving…" instead of the passed label — used
  // while a score submit is actually in flight, so a click can't fire off a new run (or a
  // second retry) on top of one still saving. Every other showOverlay call omits it, which
  // re-enables the button as soon as the save resolves either way.
  function showOverlay({ tone = "neutral", title, message, buttonLabel, busy = false }) {
    const overlay = document.getElementById("game-overlay");
    const iconEl = document.getElementById("game-overlay-icon");
    const titleEl = document.getElementById("game-overlay-title");
    const msgEl = document.getElementById("game-overlay-message");
    const btn = document.getElementById("game-start-button");
    if (iconEl) iconEl.dataset.tone = tone;
    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.innerHTML = message;
    if (btn) { btn.textContent = busy ? "Saving…" : buttonLabel; btn.disabled = busy; }
    if (overlay) overlay.hidden = false;
    hideOverlayLeaderboard();
  }

  function hideOverlay() {
    const overlay = document.getElementById("game-overlay");
    if (overlay) overlay.hidden = true;
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // "Talon" is Filipino for "jump" — matches the Luksong Medlane name. Returns
  // false if the modal was closed mid-countdown (checked via the generation
  // counter) so the caller knows not to actually start the run.
  async function runCountdown(myGeneration) {
    const el = document.getElementById("game-countdown");
    if (!el) return true;
    el.hidden = false;
    const steps = ["3", "2", "1", "Talon!"];
    for (const label of steps) {
      if (myGeneration !== gameRunGeneration) return false;
      el.textContent = label;
      el.classList.remove("pop");
      void el.offsetWidth; // restart the pop animation on every step
      el.classList.add("pop");
      playSfx(label === "Talon!" ? "countdownGo" : "countdownBeep");
      await wait(label === "Talon!" ? 480 : 620);
    }
    if (myGeneration !== gameRunGeneration) return false;
    el.hidden = true;
    return true;
  }

  async function startRun() {
    const startButton = document.getElementById("game-start-button");
    if (startButton) delete startButton.dataset.retryScore;
    // Best-effort: get any still-unsaved previous run in before this one starts.
    flushPendingScoreQuietly();
    if (startButton) startButton.disabled = true;
    try {
      const session = await MedlaneAPI.startGameSession();
      gameSessionToken = session.token;
    } catch (error) {
      if (startButton) startButton.disabled = false;
      toast(error.message || "Could not start the game. Try again.");
      return;
    }
    if (startButton) startButton.disabled = false;
    resetGameState();
    setupCanvasDPR();
    hideOverlay();
    const badgeChip = document.getElementById("game-hud-badge");
    if (badgeChip) badgeChip.hidden = true;
    drawGame();
    const myGeneration = gameRunGeneration;
    // Keep repainting the (static) scene every frame through the countdown so the GPU
    // allocates and warms the canvas's compositor layer NOW — otherwise that ~190ms
    // texture/layer setup lands as a one-off hitch the instant gameplay starts ("it
    // freezes right after Talon"). drawGame at score 0 is ~0.03ms, negligible over 2 s.
    let warming = true;
    const warmLoop = () => {
      if (!warming || myGeneration !== gameRunGeneration) return;
      drawGame();
      requestAnimationFrame(warmLoop);
    };
    requestAnimationFrame(warmLoop);
    const ok = await runCountdown(myGeneration);
    warming = false;
    if (!ok) return;
    gameRunning = true;
    gameLastTime = performance.now();
    startMusic();
    gameAnimationFrame = requestAnimationFrame(gameLoop);
  }

  function endGame() {
    if (!gameRunning) return;
    gameRunning = false;
    if (gameAnimationFrame) cancelAnimationFrame(gameAnimationFrame);
    stopMusic();
    sfxGameOver();
    addShake(9, 24);
    drawGame();
    runShakeOut(); // the loop has stopped — animate the death shake on its own rAF
    submitScoreAndShowResult();
  }

  // A finished run is written to localStorage BEFORE the network call, so a failed or lost
  // submit (the usual reason a genuine high score "didn't save") survives — it can be retried
  // from the result card, or silently on the next game open. Cleared the moment the server
  // confirms (or replays) it.
  const PENDING_SCORE_KEY = "medlane-game-pending-score";
  let pendingScoreRetry = null;
  let scoreSubmitInFlight = false;
  function readPendingScore() {
    try { return JSON.parse(localStorage.getItem(PENDING_SCORE_KEY) || "null"); } catch { return null; }
  }
  function writePendingScore(value) {
    try {
      if (value) localStorage.setItem(PENDING_SCORE_KEY, JSON.stringify(value));
      else localStorage.removeItem(PENDING_SCORE_KEY);
    } catch { /* storage unavailable — retry-in-memory still works for this session */ }
  }

  async function submitScoreAndShowResult() {
    const finalScore = gameScore;
    const token = gameSessionToken;
    gameSessionToken = null;
    pendingScoreRetry = { score: finalScore, token };
    writePendingScore({ score: finalScore, token, at: Date.now() });
    showOverlay({ tone: "neutral", title: "Saving your run…", message: `You scored <strong>${finalScore}</strong>.`, buttonLabel: "Play Again", busy: true });
    await attemptScoreSubmit(finalScore, token, { announce: true });
  }

  async function attemptScoreSubmit(finalScore, token, { announce } = {}) {
    // Background flushes yield to anything already submitting; the announce=true path (the
    // result card / Retry Save button) always runs so its overlay never gets stuck.
    if (scoreSubmitInFlight && !announce) return false;
    scoreSubmitInFlight = true;
    const startBtn = document.getElementById("game-start-button");
    try {
      const result = await MedlaneAPI.submitGameScore(finalScore, token, effectiveSkin());
      writePendingScore(null);
      pendingScoreRetry = null;
      if (startBtn) delete startBtn.dataset.retryScore;
      applyScoreResult(finalScore, result, { announce });
      return true;
    } catch (error) {
      pendingScoreRetry = { score: finalScore, token };
      if (announce) {
        showOverlay({
          tone: "error",
          title: "Score not saved yet",
          message: `${escapeHtml(error.message || "Network problem.")}<br>Your run of <strong>${finalScore}</strong> is safe — press <strong>Retry Save</strong>.`,
          buttonLabel: "Retry Save",
        });
        if (startBtn) startBtn.dataset.retryScore = "1";
        renderOverlayLeaderboard();
      }
      return false;
    } finally {
      scoreSubmitInFlight = false;
    }
  }

  // Try to push a still-unsaved run without interrupting whatever's on screen (used on game
  // open). The server is idempotent per token, so this is safe even if the run did save.
  async function flushPendingScoreQuietly() {
    const pending = pendingScoreRetry || readPendingScore();
    if (!pending || !pending.token) return;
    if (pending.at && Date.now() - pending.at > 35 * 60 * 1000) { writePendingScore(null); pendingScoreRetry = null; return; }
    await attemptScoreSubmit(pending.score, pending.token, { announce: false });
  }

  function applyScoreResult(finalScore, result, { announce } = {}) {
    const bestEl = document.getElementById("game-best");
    if (bestEl) bestEl.textContent = String(result.best);
    const levelEl = document.getElementById("game-level");
    if (levelEl) levelEl.textContent = String(result.level);
    updateSettingsBadgeChip(result.best, result.badge);
    updateLevelChip(result.level);
    refreshUnlockedSkins(result.level, result.badge, result.skin);
    if (!announce) return;
    const badgeChip = document.getElementById("game-hud-badge");
    if (badgeChip && result.badge) {
      badgeChip.hidden = false;
      badgeChip.textContent = `${GAME_BADGE_ICON[result.badge] || "🏆"} ${result.badge}`;
    }
    if (result.leveledUp) sfxNewBest();
    if (result.isNewBest || result.leveledUp) spawnCelebrationParticles();
    if (result.isNewBest || result.leveledUp) drawGame();
    if (result.leveledUp) {
      toast(`Level up! You're now Level ${result.level}.`);
      showOverlay({
        tone: "win",
        title: `Level Up! You're Level ${result.level}`,
        message: `You scored <strong>${finalScore}</strong>${result.isNewBest ? " — a new personal best!" : ""} ${result.xpToNextLevel} XP to Level ${result.level + 1}.`,
        buttonLabel: "Play Again",
      });
    } else if (result.isNewBest) {
      sfxNewBest();
      toast(finalScore === result.best ? `New personal best: ${finalScore}!` : "New personal best!");
      showOverlay({
        tone: "win",
        title: "New Personal Best!",
        message: `You scored <strong>${finalScore}</strong>${result.badge ? ` and earned the <strong>${GAME_BADGE_ICON[result.badge]} ${result.badge}</strong> badge` : ""}.`,
        buttonLabel: "Play Again",
      });
    } else {
      showOverlay({
        tone: "lose",
        title: "Caught by the Audit!",
        message: `You scored <strong>${finalScore}</strong>. Your best is <strong>${result.best}</strong> — Level ${result.level}, ${result.xpToNextLevel} XP to next level.`,
        buttonLabel: "Play Again",
      });
    }
    // Every finished run shows how it stacks up — no extra click needed.
    renderOverlayLeaderboard();
  }

  function hideOverlayLeaderboard() {
    const panel = document.getElementById("game-overlay-leaderboard");
    if (panel) panel.hidden = true;
  }

  // Shown automatically beside the result card at the end of every run — no
  // extra click into the (still-there) hidden Leaderboard button needed.
  async function renderOverlayLeaderboard() {
    const panel = document.getElementById("game-overlay-leaderboard");
    const list = document.getElementById("game-overlay-leaderboard-list");
    if (!panel || !list) return;
    panel.hidden = false;
    list.innerHTML = `<li>Loading…</li>`;
    try {
      const { entries } = await MedlaneAPI.listGameLeaderboard("score");
      if (!entries.length) { list.innerHTML = `<li>No runs yet — be the first!</li>`; return; }
      const myName = typeof currentUser !== "undefined" ? currentUser?.name : null;
      list.innerHTML = entries.slice(0, 5).map((entry, index) => {
        const isMe = myName && entry.name === myName;
        return `<li class="${isMe ? "is-me" : ""}">${leaderboardAvatar(entry.skin || "classic", 22)}<span>${leaderboardRankLabel(index)} ${escapeHtml(entry.name || "Player")}</span><strong>${Number(entry.score || 0)}</strong></li>`;
      }).join("");
    } catch {
      list.innerHTML = `<li>Could not load leaderboard.</li>`;
    }
  }

  // ---------------------------------------------------------------------
  // Settings badges + leaderboard modal
  // ---------------------------------------------------------------------
  function updateSettingsBadgeChip(best, badge) {
    const chip = document.getElementById("game-best-badge-chip");
    const icon = document.getElementById("game-best-badge-icon");
    const text = document.getElementById("game-best-badge-text");
    if (!chip) return;
    if (!badge) { chip.hidden = true; return; }
    chip.hidden = false;
    chip.dataset.tier = String(GAME_BADGE_TIER[badge] || 0);
    if (icon) icon.textContent = GAME_BADGE_ICON[badge] || "🏆";
    if (text) text.textContent = `${badge} · Best ${best}`;
  }

  function updateLevelChip(level) {
    const chip = document.getElementById("game-level-chip");
    const text = document.getElementById("game-level-chip-text");
    if (!chip) return;
    if (!level || level < 1) { chip.hidden = true; return; }
    chip.hidden = false;
    if (text) text.textContent = `Lv. ${level}`;
  }

  // ---------------------------------------------------------------------
  // Cosmetic runner skins (picked in User Settings > Break Time)
  // ---------------------------------------------------------------------
  // Read from localStorage exactly once at load, then kept in memory — drawGame() calls
  // effectiveSkin() every frame and localStorage.getItem() is a synchronous, jank-prone
  // call to hit ~60×/s.
  let selectedSkin = "classic";
  try { selectedSkin = localStorage.getItem(SKIN_CHOICE_KEY) || "classic"; } catch { /* ignore */ }
  function getSelectedSkin() { return selectedSkin; }
  function setSelectedSkin(id) {
    selectedSkin = id;
    recomputeResolvedSkin();
    try { localStorage.setItem(SKIN_CHOICE_KEY, id); } catch { /* ignore */ }
  }
  // The stored choice is honoured only while it is actually unlocked — a stale/locked
  // value is never wiped but never rendered either. Resolved once per skin change, not
  // per frame.
  let resolvedSkin = "classic";
  function recomputeResolvedSkin() { resolvedSkin = unlockedSkinIds.has(selectedSkin) ? selectedSkin : "classic"; }
  function effectiveSkin() { return resolvedSkin; }
  recomputeResolvedSkin();
  function refreshUnlockedSkins(level, badge, serverSkin) {
    const tier = GAME_BADGE_TIER[badge] || 0;
    for (const skin of SKINS) if (skin.test(level || 1, tier)) unlockedSkinIds.add(skin.id);
    // The server is the cross-device source of truth for the current choice — adopt it
    // when it's set and actually unlocked here.
    if (serverSkin && unlockedSkinIds.has(serverSkin) && getSelectedSkin() !== serverSkin) setSelectedSkin(serverSkin);
    recomputeResolvedSkin(); // a newly-unlocked skin may make the stored choice valid
    try { localStorage.setItem(SKIN_UNLOCK_KEY, JSON.stringify([...unlockedSkinIds])); } catch { /* ignore */ }
    renderSkinPicker();
  }
  function renderSkinPicker() {
    const wrap = document.getElementById("game-skin-options");
    if (!wrap) return;
    const selected = effectiveSkin();
    wrap.innerHTML = SKINS.map((skin) => {
      const unlocked = unlockedSkinIds.has(skin.id);
      const title = unlocked ? skin.label : `${skin.label} — unlock at ${skin.req}`;
      return `<button type="button" class="game-skin-swatch${skin.id === selected ? " selected" : ""}${unlocked ? "" : " locked"}" data-skin="${skin.id}" ${unlocked ? "" : "disabled"} title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}"><span class="game-skin-dot" data-skin-dot="${skin.id}"></span><span>${unlocked ? escapeHtml(skin.label) : `🔒 ${escapeHtml(skin.label)}`}</span></button>`;
    }).join("");
    wrap.querySelectorAll(".game-skin-swatch:not([disabled])").forEach((btn) => {
      btn.addEventListener("click", () => {
        setSelectedSkin(btn.dataset.skin);
        sfxClick();
        renderSkinPicker();
        // Persist so it shows on the leaderboard — fire-and-forget; only unlocked
        // swatches are clickable, and the server re-checks the unlock anyway.
        if (typeof MedlaneAPI !== "undefined" && MedlaneAPI.session()) {
          MedlaneAPI.setGameSkin(btn.dataset.skin).catch(() => {});
        }
      });
    });
  }

  async function loadGameBestBadge() {
    if (typeof MedlaneAPI === "undefined" || !MedlaneAPI.session()) return;
    flushPendingScoreQuietly();
    try {
      const result = await MedlaneAPI.myGameScore();
      const bestEl = document.getElementById("game-best");
      if (bestEl) bestEl.textContent = String(result.best || 0);
      const levelEl = document.getElementById("game-level");
      if (levelEl) levelEl.textContent = String(result.level || 1);
      updateSettingsBadgeChip(result.best || 0, result.badge);
      updateLevelChip(result.level || 1);
      refreshUnlockedSkins(result.level || 1, result.badge, result.skin);
    } catch { /* quiet — this is a background nicety, not core functionality */ }
  }

  function leaderboardRankLabel(index) {
    if (index === 0) return "🥇";
    if (index === 1) return "🥈";
    if (index === 2) return "🥉";
    return `#${index + 1}`;
  }

  const LEADERBOARD_HEADERS = { score: ["Rank", "Name", "Highscore", "Badge", "Date"], level: ["Rank", "Name", "Level", "Total XP", "Badge"] };
  let leaderboardTab = "score";

  function leaderboardRow(entry, index) {
    const nameCell = `<span class="game-lb-name">${leaderboardAvatar(entry.skin || "classic", 28)}<span>${escapeHtml(entry.name || "Player")}</span></span>`;
    const badgeCell = entry.badge
      ? `<span class="game-badge-chip" data-tier="${GAME_BADGE_TIER[entry.badge] || 0}"><span>${GAME_BADGE_ICON[entry.badge]}</span><span>${escapeHtml(entry.badge)}</span></span>`
      : "—";
    const cells = leaderboardTab === "level"
      ? [
          leaderboardRankLabel(index),
          nameCell,
          `<strong>${Number(entry.level || 1)}</strong>`,
          Number(entry.totalXp || 0).toLocaleString(),
          badgeCell,
        ]
      : [
          leaderboardRankLabel(index),
          nameCell,
          `<strong>${Number(entry.score || 0)}</strong>`,
          badgeCell,
          escapeHtml(entry.date || ""),
        ];
    return { cells, attrs: index < 3 ? { class: "game-leaderboard-top" } : {} };
  }

  async function openLeaderboard(tab) {
    if (tab) leaderboardTab = tab;
    sfxClick();
    const modal = document.getElementById("game-leaderboard-modal");
    const headers = LEADERBOARD_HEADERS[leaderboardTab];
    qsa("#game-leaderboard-tabs .tab").forEach((btn) => btn.classList.toggle("active", btn.dataset.leaderboardTab === leaderboardTab));
    tableSkeleton("#game-leaderboard-table", headers, 6);
    modal?.showModal();
    try {
      const { entries } = await MedlaneAPI.listGameLeaderboard(leaderboardTab);
      const rows = entries.length
        ? entries.map((entry, index) => leaderboardRow(entry, index))
        : [["—", "No runs yet — be the first on the board.", "-", "-", "-"]];
      table("#game-leaderboard-table", headers, rows);
    } catch (error) {
      table("#game-leaderboard-table", headers, [["-", escapeHtml(error.message || "Could not load the leaderboard."), "-", "-", "-"]]);
    }
  }

  // ---------------------------------------------------------------------
  // Wiring — script tag loads at the bottom of the body, so these elements
  // already exist in the DOM.
  // ---------------------------------------------------------------------
  gameCanvas = document.getElementById("game-canvas");
  ctx2d = gameCanvas ? gameCanvas.getContext("2d") : null;

  const soundToggleBtn = document.getElementById("game-sound-toggle");
  if (soundToggleBtn) {
    soundToggleBtn.textContent = soundEnabled ? "🔊" : "🔇";
    soundToggleBtn.title = soundEnabled ? "Mute sound" : "Unmute sound";
    soundToggleBtn.addEventListener("click", () => setSoundEnabled(!soundEnabled));
  }

  // Render the skin picker immediately from the cached unlock set; loadGameBestBadge()
  // refreshes its lock state against the live API on modal / Settings open.
  renderSkinPicker();

  document.getElementById("open-game-modal")?.addEventListener("click", () => {
    primeAllAudio();
    // Give the music loop a head start on downloading now (the Play Game click is a user
    // gesture) so it's buffered by the time the countdown ends and startMusic() fires —
    // "played immediately" was catching it mid-download.
    musicAudio.preload = "auto";
    if (musicAudio.readyState === 0) musicAudio.load();
    const modal = document.getElementById("game-modal");
    resetGameState();
    showOverlay({ tone: "neutral", title: "Luksong Medlane", message: `<kbd>Space</kbd> or tap the top to jump ground stacks. Hold <kbd>&#8595;</kbd>/<kbd>S</kbd> or tap-hold the bottom to duck under audit banners. It gets faster the higher you score.`, buttonLabel: "Start Game" });
    modal?.showModal();
    setupCanvasDPR();
    drawGame();
    loadGameBestBadge();
  });

  function closeGameModal() {
    gameRunning = false;
    gameRunGeneration++; // cancels any in-flight countdown
    if (gameAnimationFrame) cancelAnimationFrame(gameAnimationFrame);
    stopMusic();
    shakeFrames = 0; shakeMag = 0;
    const countdownEl = document.getElementById("game-countdown");
    if (countdownEl) countdownEl.hidden = true;
    document.getElementById("game-modal")?.close();
  }
  document.getElementById("game-modal-close")?.addEventListener("click", closeGameModal);
  // Deliberately no backdrop-click-to-close and no Escape-to-close here — a
  // misclick or stray Escape used to kill an in-progress run. Only the X
  // button closes this modal. (Every other dialog in the app keeps its
  // normal backdrop/Escape close behavior; this restriction is game-only.)
  document.getElementById("game-modal")?.addEventListener("cancel", (event) => event.preventDefault());

  document.getElementById("game-start-button")?.addEventListener("click", () => {
    primeAllAudio();
    const btn = document.getElementById("game-start-button");
    // "Retry Save" state — this click resubmits the kept run instead of starting a new one.
    if (btn?.dataset.retryScore && pendingScoreRetry) {
      delete btn.dataset.retryScore;
      showOverlay({ tone: "neutral", title: "Saving your run…", message: `Retrying…`, buttonLabel: "Play Again", busy: true });
      attemptScoreSubmit(pendingScoreRetry.score, pendingScoreRetry.token, { announce: true });
      return;
    }
    startRun();
  });
  document.getElementById("game-canvas")?.addEventListener("click", () => { if (gameRunning) doJump(); });
  const CROUCH_KEYS = new Set(["ArrowDown", "KeyS"]);
  document.addEventListener("keydown", (event) => {
    if (!document.getElementById("game-modal")?.open) return;
    if (event.code === "Space") {
      event.preventDefault();
      if (gameRunning) doJump();
    } else if (CROUCH_KEYS.has(event.code)) {
      event.preventDefault();
      if (gameRunning) setCrouching(true);
    }
  });
  document.addEventListener("keyup", (event) => {
    if (CROUCH_KEYS.has(event.code)) setCrouching(false);
  });
  // Touch: the top of the stage jumps, the bottom (where a crouch is
  // needed) ducks for as long as the finger stays down.
  gameCanvas?.addEventListener("touchstart", (event) => {
    if (!gameRunning) return;
    event.preventDefault();
    const touch = event.touches[0];
    const rect = gameCanvas.getBoundingClientRect();
    const relY = (touch.clientY - rect.top) / rect.height;
    if (relY > 0.55) setCrouching(true);
    else doJump();
  }, { passive: false });
  gameCanvas?.addEventListener("touchend", () => setCrouching(false));
  gameCanvas?.addEventListener("touchcancel", () => setCrouching(false));

  document.getElementById("open-game-leaderboard")?.addEventListener("click", () => openLeaderboard("score"));
  qsa("#game-leaderboard-tabs .tab").forEach((btn) => btn.addEventListener("click", () => openLeaderboard(btn.dataset.leaderboardTab)));
  document.getElementById("game-leaderboard-close")?.addEventListener("click", () => document.getElementById("game-leaderboard-modal")?.close());
  document.getElementById("game-leaderboard-cancel")?.addEventListener("click", () => document.getElementById("game-leaderboard-modal")?.close());
  document.getElementById("game-leaderboard-modal")?.addEventListener("click", (event) => { if (event.target.id === "game-leaderboard-modal") document.getElementById("game-leaderboard-modal").close(); });

  window.addEventListener("resize", () => { if (document.getElementById("game-modal")?.open) { setupCanvasDPR(); drawGame(); } });

  // The only piece of this file anything outside needs to reach — hooked
  // from showSection() in modules.js when the User Settings tab is opened.
  window.loadGameBestBadge = loadGameBestBadge;
})();
