// Escape the Audit — hidden mini-game easter egg (User Settings > Play Game).
// Deliberately wrapped in a closure: score, obstacles, and the run loop are not
// reachable from the devtools console, so tampering has to go through the
// server API — which is the only thing that actually decides what gets saved
// (see the game-session-token check in src/worker.js).
(function () {
  "use strict";

  const GAME_BADGE_ICON = { Bronze: "🥉", Silver: "🥈", Gold: "🥇", Platinum: "💎" };
  const GAME_BADGE_TIER = { Bronze: 1, Silver: 2, Gold: 3, Platinum: 4 };

  function gameBadgeForScore(score) {
    if (score >= 500) return "Platinum";
    if (score >= 300) return "Gold";
    if (score >= 150) return "Silver";
    if (score >= 50) return "Bronze";
    return null;
  }

  // ---------------------------------------------------------------------
  // Audio — everything below is synthesized with the Web Audio API so the
  // game needs no external sound files.
  // ---------------------------------------------------------------------
  let audioCtx = null;
  let soundEnabled = true;
  try { soundEnabled = JSON.parse(localStorage.getItem("medlane-game-sound") ?? "true"); } catch { soundEnabled = true; }

  function ensureAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }

  function playTone({ freq, duration = 0.12, type = "square", volume = 0.11, sweepTo = null, delay = 0 }) {
    if (!soundEnabled) return;
    try {
      const ctx = ensureAudioCtx();
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
  function sfxStart() { playTone({ freq: 440, sweepTo: 900, duration: 0.18, type: "triangle", volume: 0.11 }); }
  function sfxGameOver() { playTone({ freq: 300, sweepTo: 70, duration: 0.55, type: "sawtooth", volume: 0.12 }); }
  function sfxClick() { playTone({ freq: 600, duration: 0.05, type: "sine", volume: 0.06 }); }
  function sfxNewBest() {
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => playTone({ freq, duration: 0.17, type: "triangle", volume: 0.12, delay: i * 0.1 }));
  }

  let musicTimer = null;
  let musicStep = 0;
  function startMusic() {
    stopMusic();
    if (!soundEnabled) return;
    const bass = [110, 110, 98, 87.31];
    const lead = [440, 523.25, 659.25, 523.25, 440, 349.23, 440, 523.25];
    const stepSeconds = 0.165;
    musicStep = 0;
    musicTimer = setInterval(() => {
      if (!soundEnabled || !gameRunning) return;
      playTone({ freq: lead[musicStep % lead.length], duration: stepSeconds * 0.85, type: "sine", volume: 0.028 });
      if (musicStep % 2 === 0) playTone({ freq: bass[(musicStep / 2) % bass.length], duration: stepSeconds * 1.8, type: "triangle", volume: 0.04 });
      musicStep++;
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

  let gameCanvas = null;
  let ctx2d = null;
  let gameRunning = false;
  let gameAnimationFrame = null;
  let gameLastTime = 0;
  let gameSessionToken = null;

  let playerY = 0;
  let playerVY = 0;
  let onGround = true;
  let obstacles = [];
  let distance = 0;
  let dodged = 0;
  let gameScore = 0;
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
    obstacles = [];
    particles = [];
    distance = 0;
    dodged = 0;
    gameScore = 0;
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
    sfxJump();
  }

  function spawnObstacle() {
    const w = 22 + Math.round(Math.random() * 20);
    const h = 30 + Math.round(Math.random() * 20);
    obstacles.push({ x: GAME_W + 20, w, h, passed: false });
  }

  function updateGame(dt) {
    distance += speed * dt;
    speed = Math.min(6.2 + (distance / 3600), 14.5);

    playerVY += GRAVITY * dt;
    playerY += playerVY * dt;
    if (playerY >= GROUND_Y - PLAYER_H) {
      playerY = GROUND_Y - PLAYER_H;
      playerVY = 0;
      onGround = true;
    }

    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnObstacle();
      const difficulty = Math.min(distance / 5000, 1);
      spawnTimer = (62 - difficulty * 22) + Math.random() * 30;
    }

    const playerBox = { x: PLAYER_X + 5, y: playerY + 4, w: PLAYER_W - 10, h: PLAYER_H - 6 };
    for (const obstacle of obstacles) {
      obstacle.x -= speed * dt;
      if (!obstacle.passed && obstacle.x + obstacle.w < PLAYER_X) {
        obstacle.passed = true;
        dodged++;
        sfxDodge();
      }
      const obstacleBox = { x: obstacle.x + 3, y: GROUND_Y - obstacle.h, w: obstacle.w - 6, h: obstacle.h };
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
    const scoreEl = document.getElementById("game-score");
    if (scoreEl) scoreEl.textContent = String(gameScore);
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

    // Obstacles — stacked "audit" folders
    for (const obstacle of obstacles) {
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

    // Player
    const legPhase = onGround ? Math.sin(distance / 5.2) : 0;
    const px = PLAYER_X, py = playerY;
    ctx2d.fillStyle = c.orange;
    ctx2d.fillRect(px + 6, py + PLAYER_H - 8 + (onGround ? Math.max(legPhase, 0) * 5 : -3), 6, 10);
    ctx2d.fillRect(px + PLAYER_W - 12, py + PLAYER_H - 8 + (onGround ? Math.max(-legPhase, 0) * 5 : -3), 6, 10);
    ctx2d.fillStyle = c.blue;
    drawRoundedRect(px, py + 10, PLAYER_W, PLAYER_H - 16, 7);
    ctx2d.fill();
    ctx2d.fillStyle = c.blueDark;
    ctx2d.beginPath();
    ctx2d.arc(px + PLAYER_W / 2, py + 7, 9, 0, Math.PI * 2);
    ctx2d.fill();
    ctx2d.fillStyle = c.green;
    ctx2d.fillRect(px + PLAYER_W - 4, py + 16, 9, 13);

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

  function showOverlay({ icon, title, message, buttonLabel }) {
    const overlay = document.getElementById("game-overlay");
    const iconEl = document.getElementById("game-overlay-icon");
    const titleEl = document.getElementById("game-overlay-title");
    const msgEl = document.getElementById("game-overlay-message");
    const btn = document.getElementById("game-start-button");
    if (iconEl) iconEl.textContent = icon;
    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.innerHTML = message;
    if (btn) btn.textContent = buttonLabel;
    if (overlay) overlay.hidden = false;
  }

  function hideOverlay() {
    const overlay = document.getElementById("game-overlay");
    if (overlay) overlay.hidden = true;
  }

  async function startRun() {
    sfxStart();
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
    showOverlay({ icon: "⏳", title: "Saving your run…", message: `You scored <strong>${finalScore}</strong>.`, buttonLabel: "Play Again" });
    try {
      const result = await MedlaneAPI.submitGameScore(finalScore, token);
      const bestEl = document.getElementById("game-best");
      if (bestEl) bestEl.textContent = String(result.best);
      const badgeChip = document.getElementById("game-hud-badge");
      if (badgeChip && result.badge) {
        badgeChip.hidden = false;
        badgeChip.textContent = `${GAME_BADGE_ICON[result.badge] || "🏆"} ${result.badge}`;
      }
      updateSettingsBadgeChip(result.best, result.badge);
      if (result.isNewBest) {
        spawnCelebrationParticles();
        drawGame();
        sfxNewBest();
        toast(finalScore === result.best ? `New personal best: ${finalScore}!` : "New personal best!");
        showOverlay({
          icon: "🏆",
          title: "New Personal Best!",
          message: `You scored <strong>${finalScore}</strong>${result.badge ? ` and earned the <strong>${GAME_BADGE_ICON[result.badge]} ${result.badge}</strong> badge` : ""}.`,
          buttonLabel: "Play Again",
        });
      } else {
        showOverlay({
          icon: "💥",
          title: "Caught by the Audit!",
          message: `You scored <strong>${finalScore}</strong>. Your best is <strong>${result.best}</strong>.`,
          buttonLabel: "Play Again",
        });
      }
    } catch (error) {
      showOverlay({ icon: "⚠️", title: "Score not saved", message: escapeHtml(error.message || "Something went wrong."), buttonLabel: "Play Again" });
    }
  }

  // ---------------------------------------------------------------------
  // Settings badge chip + leaderboard modal
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

  async function loadGameBestBadge() {
    if (typeof MedlaneAPI === "undefined" || !MedlaneAPI.session()) return;
    try {
      const result = await MedlaneAPI.myGameScore();
      const bestEl = document.getElementById("game-best");
      if (bestEl) bestEl.textContent = String(result.best || 0);
      updateSettingsBadgeChip(result.best || 0, result.badge);
    } catch { /* quiet — this is a background nicety, not core functionality */ }
  }

  function leaderboardRankLabel(index) {
    if (index === 0) return "🥇";
    if (index === 1) return "🥈";
    if (index === 2) return "🥉";
    return `#${index + 1}`;
  }

  const LEADERBOARD_HEADERS = ["Rank", "Name", "Highscore", "Badge", "Date"];

  async function openLeaderboard() {
    sfxClick();
    const modal = document.getElementById("game-leaderboard-modal");
    tableSkeleton("#game-leaderboard-table", LEADERBOARD_HEADERS, 6);
    modal?.showModal();
    try {
      const { entries } = await MedlaneAPI.listGameLeaderboard();
      const rows = entries.length
        ? entries.map((entry, index) => ({
            cells: [
              leaderboardRankLabel(index),
              escapeHtml(entry.name || "Player"),
              `<strong>${Number(entry.score || 0)}</strong>`,
              entry.badge ? `<span class="game-badge-chip" data-tier="${GAME_BADGE_TIER[entry.badge] || 0}"><span>${GAME_BADGE_ICON[entry.badge]}</span><span>${escapeHtml(entry.badge)}</span></span>` : "—",
              escapeHtml(entry.date || ""),
            ],
            attrs: index < 3 ? { class: "game-leaderboard-top" } : {},
          }))
        : [["—", "No runs yet — be the first on the board.", "-", "-", "-"]];
      table("#game-leaderboard-table", LEADERBOARD_HEADERS, rows);
    } catch (error) {
      table("#game-leaderboard-table", LEADERBOARD_HEADERS, [["-", escapeHtml(error.message || "Could not load the leaderboard."), "-", "-", "-"]]);
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
    showOverlay({ icon: "🏃", title: "Escape the Audit", message: `Press <kbd>Space</kbd>, click, or tap to jump over incoming audit stamps. Survive as long as you can.`, buttonLabel: "Start Game" });
    modal?.showModal();
    setupCanvasDPR();
    drawGame();
    loadGameBestBadge();
  });

  function closeGameModal() {
    gameRunning = false;
    if (gameAnimationFrame) cancelAnimationFrame(gameAnimationFrame);
    stopMusic();
    document.getElementById("game-modal")?.close();
  }
  document.getElementById("game-modal-close")?.addEventListener("click", closeGameModal);
  document.getElementById("game-modal")?.addEventListener("click", (event) => { if (event.target.id === "game-modal") closeGameModal(); });
  document.getElementById("game-modal")?.addEventListener("cancel", (event) => { event.preventDefault(); closeGameModal(); });

  document.getElementById("game-start-button")?.addEventListener("click", startRun);
  document.getElementById("game-canvas")?.addEventListener("click", () => { if (gameRunning) doJump(); });
  document.addEventListener("keydown", (event) => {
    if (event.code !== "Space" || !document.getElementById("game-modal")?.open) return;
    event.preventDefault();
    if (gameRunning) doJump();
  });
  gameCanvas?.addEventListener("touchstart", (event) => { if (gameRunning) { event.preventDefault(); doJump(); } }, { passive: false });

  document.getElementById("open-game-leaderboard")?.addEventListener("click", openLeaderboard);
  document.getElementById("game-leaderboard-close")?.addEventListener("click", () => document.getElementById("game-leaderboard-modal")?.close());
  document.getElementById("game-leaderboard-cancel")?.addEventListener("click", () => document.getElementById("game-leaderboard-modal")?.close());
  document.getElementById("game-leaderboard-modal")?.addEventListener("click", (event) => { if (event.target.id === "game-leaderboard-modal") document.getElementById("game-leaderboard-modal").close(); });

  window.addEventListener("resize", () => { if (document.getElementById("game-modal")?.open) { setupCanvasDPR(); drawGame(); } });

  // The only piece of this file anything outside needs to reach — hooked
  // from showSection() in modules.js when the User Settings tab is opened.
  window.loadGameBestBadge = loadGameBestBadge;
})();
