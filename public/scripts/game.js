// Luksong Medlane — hidden mini-game easter egg (User Settings > Play Game).
// Deliberately wrapped in a closure: score, obstacles, and the run loop are not
// reachable from the devtools console, so tampering has to go through the
// server API — which is the only thing that actually decides what gets saved
// (see the game-session-token check in src/worker.js).
(function () {
  "use strict";

  const GAME_BADGE_ICON = { Bronze: "🥉", Silver: "🥈", Gold: "🥇", Platinum: "💎" };
  const GAME_BADGE_TIER = { Bronze: 1, Silver: 2, Gold: 3, Platinum: 4 };

  // ---------------------------------------------------------------------
  // Audio — everything below is synthesized with the Web Audio API so the
  // game needs no external sound files.
  // ---------------------------------------------------------------------
  let audioCtx = null;
  let soundEnabled = true;
  try { soundEnabled = JSON.parse(localStorage.getItem("medlane-game-sound") ?? "true"); } catch { soundEnabled = true; }

  function ensureAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
  }

  // Browsers only allow an AudioContext to actually start inside a user-gesture
  // call stack. Called (and awaited) at the very top of startRun(), before any
  // other await, so every sound in the run — including the music loop — is
  // guaranteed to have a running context rather than racing a fire-and-forget
  // resume().
  async function unlockAudio() {
    try {
      const ctx = ensureAudioCtx();
      if (ctx.state === "suspended") await ctx.resume();
    } catch { /* ignore */ }
  }

  function playTone({ freq, duration = 0.12, type = "square", volume = 0.11, sweepTo = null, delay = 0 }) {
    if (!soundEnabled) return;
    try {
      const ctx = ensureAudioCtx();
      if (ctx.state === "suspended") ctx.resume();
      const start = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, start);
      if (sweepTo) osc.frequency.exponentialRampToValueAtTime(Math.max(sweepTo, 1), start + duration);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(volume, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + duration + 0.03);
    } catch { /* audio is a nice-to-have; never let it break the game */ }
  }

  function sfxJump() { playTone({ freq: 320, sweepTo: 700, duration: 0.13, type: "square", volume: 0.09 }); }
  function sfxDodge() { playTone({ freq: 920, duration: 0.06, type: "sine", volume: 0.05 }); }
  function sfxGameOver() { playTone({ freq: 300, sweepTo: 70, duration: 0.55, type: "sawtooth", volume: 0.12 }); }
  function sfxClick() { playTone({ freq: 600, duration: 0.05, type: "sine", volume: 0.06 }); }
  function sfxNewBest() {
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => playTone({ freq, duration: 0.17, type: "triangle", volume: 0.12, delay: i * 0.1 }));
  }

  let musicTimer = null;
  let musicStep = 0;
  function playMusicStep(bass, lead, stepSeconds) {
    playTone({ freq: lead[musicStep % lead.length], duration: stepSeconds * 0.95, type: "square", volume: 0.055 });
    if (musicStep % 2 === 0) playTone({ freq: bass[(musicStep / 2) % bass.length], duration: stepSeconds * 1.9, type: "triangle", volume: 0.075 });
    if (musicStep % 4 === 2) playTone({ freq: 3800, duration: 0.02, type: "square", volume: 0.02 });
    musicStep++;
  }
  function startMusic() {
    stopMusic();
    if (!soundEnabled) return;
    const bass = [110, 110, 98, 87.31, 110, 110, 123.47, 110];
    const lead = [440, 523.25, 659.25, 523.25, 440, 523.25, 349.23, 440, 440, 523.25, 659.25, 783.99, 659.25, 523.25, 440, 392];
    const stepSeconds = 0.18;
    musicStep = 0;
    // Play the first beat immediately — waiting for the first setInterval tick
    // leaves a silent gap right as the run starts, which reads as "no music".
    playMusicStep(bass, lead, stepSeconds);
    musicTimer = setInterval(() => {
      if (!soundEnabled || !gameRunning) return;
      playMusicStep(bass, lead, stepSeconds);
    }, stepSeconds * 1000);
  }
  function stopMusic() {
    if (musicTimer) clearInterval(musicTimer);
    musicTimer = null;
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

  function themeColors() {
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

    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnObstacle();
      const difficulty = Math.min(gameScore / 25000, 1);
      spawnTimer = (58 - difficulty * 34) + Math.random() * (28 - difficulty * 12);
    }

    const playerBox = { x: PLAYER_X + 5, y: playerY + playerH * 0.1, w: PLAYER_W - 10, h: playerH * 0.85 };
    for (const obstacle of obstacles) {
      obstacle.x -= speed * dt;
      if (!obstacle.passed && obstacle.x + obstacle.w < PLAYER_X) {
        obstacle.passed = true;
        dodged++;
        sfxDodge();
      }
      const obstacleBox = obstacle.type === "flying"
        ? { x: obstacle.x + 3, y: FLYING_TOP, w: obstacle.w - 6, h: (GROUND_Y - FLYING_GAP) - FLYING_TOP }
        : { x: obstacle.x + 3, y: GROUND_Y - obstacle.h, w: obstacle.w - 6, h: obstacle.h };
      const hit = playerBox.x < obstacleBox.x + obstacleBox.w && playerBox.x + playerBox.w > obstacleBox.x && playerBox.y < obstacleBox.y + obstacleBox.h && playerBox.y + playerBox.h > obstacleBox.y;
      if (hit) { endGame(); return; }
    }
    obstacles = obstacles.filter((obstacle) => obstacle.x + obstacle.w > -10);

    for (const particle of particles) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 0.25 * dt;
      particle.life -= dt;
    }
    particles = particles.filter((particle) => particle.life > 0);

    bgOffset -= speed * dt * 0.35;

    gameScore = Math.floor(distance / 8) + dodged * 10;
    // The on-screen counter climbs toward the real score in small steps instead of
    // snapping straight to it — a sudden +10 dodge bonus used to look like the
    // number jumping around; this keeps it reading as a smooth, controlled climb.
    // gameScore itself (used for badges/leveling/submission) is never touched here.
    if (displayedScore < gameScore) displayedScore = Math.min(displayedScore + Math.max(1, Math.ceil(dt * 3)), gameScore);
    else displayedScore = gameScore;
    const scoreEl = document.getElementById("game-score");
    if (scoreEl) scoreEl.textContent = String(Math.floor(displayedScore));
  }

  function drawRoundedRect(x, y, w, h, r) {
    ctx2d.beginPath();
    ctx2d.moveTo(x + r, y);
    ctx2d.arcTo(x + w, y, x + w, y + h, r);
    ctx2d.arcTo(x + w, y + h, x, y + h, r);
    ctx2d.arcTo(x, y + h, x, y, r);
    ctx2d.arcTo(x, y, x + w, y, r);
    ctx2d.closePath();
  }

  function drawGame() {
    const c = themeColors();
    ctx2d.clearRect(0, 0, GAME_W, GAME_H);

    const sky = ctx2d.createLinearGradient(0, 0, 0, GROUND_Y + 20);
    sky.addColorStop(0, c.skyTop);
    sky.addColorStop(1, c.panel);
    ctx2d.fillStyle = sky;
    ctx2d.fillRect(0, 0, GAME_W, GAME_H);

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

    // Ground
    ctx2d.strokeStyle = c.muted;
    ctx2d.lineWidth = 2;
    ctx2d.beginPath();
    ctx2d.moveTo(0, GROUND_Y + 1);
    ctx2d.lineTo(GAME_W, GROUND_Y + 1);
    ctx2d.stroke();
    ctx2d.strokeStyle = c.line;
    ctx2d.lineWidth = 3;
    ctx2d.setLineDash([16, 14]);
    const dashOffset = -(distance % 30);
    ctx2d.lineDashOffset = dashOffset;
    ctx2d.beginPath();
    ctx2d.moveTo(0, GROUND_Y + 10);
    ctx2d.lineTo(GAME_W, GROUND_Y + 10);
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

    // Particles (new-best celebration)
    for (const particle of particles) {
      ctx2d.globalAlpha = Math.max(particle.life / particle.maxLife, 0);
      ctx2d.fillStyle = particle.color;
      ctx2d.beginPath();
      ctx2d.arc(particle.x, particle.y, particle.r, 0, Math.PI * 2);
      ctx2d.fill();
    }
    ctx2d.globalAlpha = 1;
  }

  function spawnCelebrationParticles() {
    const c = themeColors();
    const colors = [c.blue, c.orange, c.green, c.red];
    for (let i = 0; i < 26; i++) {
      particles.push({
        x: GAME_W / 2, y: 90,
        vx: (Math.random() - 0.5) * 9,
        vy: -Math.random() * 6 - 2,
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

  function showOverlay({ tone = "neutral", title, message, buttonLabel }) {
    const overlay = document.getElementById("game-overlay");
    const iconEl = document.getElementById("game-overlay-icon");
    const titleEl = document.getElementById("game-overlay-title");
    const msgEl = document.getElementById("game-overlay-message");
    const btn = document.getElementById("game-start-button");
    if (iconEl) iconEl.dataset.tone = tone;
    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.innerHTML = message;
    if (btn) btn.textContent = buttonLabel;
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
    const steps = [
      { label: "3", freq: 520 },
      { label: "2", freq: 520 },
      { label: "1", freq: 520 },
      { label: "Talon!", freq: 880 },
    ];
    for (const step of steps) {
      if (myGeneration !== gameRunGeneration) return false;
      el.textContent = step.label;
      el.classList.remove("pop");
      void el.offsetWidth; // restart the pop animation on every step
      el.classList.add("pop");
      playTone({ freq: step.freq, sweepTo: step.label === "Talon!" ? 1300 : null, duration: step.label === "Talon!" ? 0.3 : 0.14, type: step.label === "Talon!" ? "triangle" : "square", volume: 0.13 });
      await wait(step.label === "Talon!" ? 480 : 620);
    }
    if (myGeneration !== gameRunGeneration) return false;
    el.hidden = true;
    return true;
  }

  async function startRun() {
    await unlockAudio();
    const startButton = document.getElementById("game-start-button");
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
    const ok = await runCountdown(myGeneration);
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
    drawGame();
    submitScoreAndShowResult();
  }

  async function submitScoreAndShowResult() {
    const finalScore = gameScore;
    const token = gameSessionToken;
    gameSessionToken = null;
    showOverlay({ tone: "neutral", title: "Saving your run…", message: `You scored <strong>${finalScore}</strong>.`, buttonLabel: "Play Again" });
    try {
      const result = await MedlaneAPI.submitGameScore(finalScore, token);
      const bestEl = document.getElementById("game-best");
      if (bestEl) bestEl.textContent = String(result.best);
      const levelEl = document.getElementById("game-level");
      if (levelEl) levelEl.textContent = String(result.level);
      const badgeChip = document.getElementById("game-hud-badge");
      if (badgeChip && result.badge) {
        badgeChip.hidden = false;
        badgeChip.textContent = `${GAME_BADGE_ICON[result.badge] || "🏆"} ${result.badge}`;
      }
      updateSettingsBadgeChip(result.best, result.badge);
      updateLevelChip(result.level);
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
    } catch (error) {
      showOverlay({ tone: "error", title: "Score not saved", message: escapeHtml(error.message || "Something went wrong."), buttonLabel: "Play Again" });
    }
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
        return `<li class="${isMe ? "is-me" : ""}"><span>${leaderboardRankLabel(index)} ${escapeHtml(entry.name || "Player")}</span><strong>${Number(entry.score || 0)}</strong></li>`;
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

  async function loadGameBestBadge() {
    if (typeof MedlaneAPI === "undefined" || !MedlaneAPI.session()) return;
    try {
      const result = await MedlaneAPI.myGameScore();
      const bestEl = document.getElementById("game-best");
      if (bestEl) bestEl.textContent = String(result.best || 0);
      const levelEl = document.getElementById("game-level");
      if (levelEl) levelEl.textContent = String(result.level || 1);
      updateSettingsBadgeChip(result.best || 0, result.badge);
      updateLevelChip(result.level || 1);
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
    const cells = leaderboardTab === "level"
      ? [
          leaderboardRankLabel(index),
          escapeHtml(entry.name || "Player"),
          `<strong>${Number(entry.level || 1)}</strong>`,
          Number(entry.totalXp || 0).toLocaleString(),
          entry.badge ? `<span class="game-badge-chip" data-tier="${GAME_BADGE_TIER[entry.badge] || 0}"><span>${GAME_BADGE_ICON[entry.badge]}</span><span>${escapeHtml(entry.badge)}</span></span>` : "—",
        ]
      : [
          leaderboardRankLabel(index),
          escapeHtml(entry.name || "Player"),
          `<strong>${Number(entry.score || 0)}</strong>`,
          entry.badge ? `<span class="game-badge-chip" data-tier="${GAME_BADGE_TIER[entry.badge] || 0}"><span>${GAME_BADGE_ICON[entry.badge]}</span><span>${escapeHtml(entry.badge)}</span></span>` : "—",
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

  document.getElementById("open-game-modal")?.addEventListener("click", () => {
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

  document.getElementById("game-start-button")?.addEventListener("click", startRun);
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
