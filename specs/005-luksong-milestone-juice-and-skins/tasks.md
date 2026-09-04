# Tasks: 005-luksong-milestone-juice-and-skins

## Asset
- [x] `public/sounds/milestone.wav` — mono, 22050 Hz, 16-bit, 0.67 s ascending E-major
      bell arpeggio (~29 KB, in line with `newbest`/`gameover`). Generator in scratchpad
      (`gen_milestone.py`), not committed.

## game.js — shared plumbing
- [x] `resetGameState()`: `hasShield`, `invulnFrames`, `pickups`, `stampTimer`,
      `lastStampScore`, `lastMilestoneIdx`, `shakeMag/Frames/FramesMax`, `flashAlpha`,
      `milestoneFlash`; also clears the canvas transform + hides `#game-hud-shield`.
- [x] sfx map: `milestone` (0.7) + `shield` (reuses `newbest.wav` @ 0.5); pooled/primed
      automatically (primeAllAudio iterates the pools).
- [x] `reducedMotionMQ` / `reducedMotion()`, `clamp01()`. (No `lerpColor` — night/overdrive
      are rgba overlays, no theme-colour parsing.)

## Part A — milestone callouts
- [x] `MILESTONES = [2000, 5000, 10000, 20000]`; `updateGame()` fires the highest newly
      crossed index once, advances `lastMilestoneIdx`.
- [x] `fireMilestone(v)`: `playSfx("milestone")` + `spawnCelebrationParticles({count:16,
      y:70, power:0.85})` + `milestoneFlash`.
- [x] `spawnCelebrationParticles(opts)` — count/x/y/power; existing new-best call unchanged.
- [x] `drawGame()`: rising/fading bold callout near the top; decayed in `updateGame()`.

## Part B — screen shake
- [x] `addShake(mag, frames)` (no-op under reduced motion; stronger overrides weaker).
- [x] `stepShake(dt)` from `gameLoop`; `runShakeOut()` self-rAF for the death shake after
      the loop stops. `.game-stage canvas { transform: scale(1.04); will-change }`.
- [x] Near-miss: min vertical clearance tracked in-lane; `≤ 14 px` on pass →
      `addShake(2.6, 8)` + `flashAlpha 0.42`.
- [x] `endGame()`: `addShake(9, 24)` before the final draw.
- [x] `drawGame()`: full-canvas white `flashAlpha`, decayed in `updateGame()` (both skip
      under reduced motion).

## Part C — overdrive
- [x] `overdrive = clamp01((speed - 14) / 7)`; warm `c.orange` wash (`0.12 * overdrive`)
      after the night pass; white speed-line streaks over the foreground (streaks skipped
      under reduced motion).

## Part D — day → night
- [x] `nightT = clamp01(gameScore / 30000)`; rgba night gradient over sky+skyline.
- [x] `STARS` (42, deterministic) + moon fade in above `nightT > 0.4`, parallax off
      `bgOffset`.

## Part E — approved-stamp shield
- [x] `spawnStamp()` at jump-apex height; spawn guards in `updateGame()` (`!hasShield`,
      `pickups.length === 0`, `gameScore > 1500`, ≥1200 since last, 50%).
- [x] Move/cull `pickups`; AABB collect → `hasShield`, `playSfx("shield")`, burst,
      `#game-hud-shield` shown.
- [x] Death branch: skipped while `invulnFrames > 0`; `hasShield` → consume
      (`invulnFrames = 35`, shake + flash + sfx), else `endGame()`.
- [x] `drawGame()`: stamp pickups + pulsing shield ring; `invulnFrames` decays in
      `updateGame()`.
- [x] `#game-hud-shield` span in index.html; `.game-hud-shield` style.

## Part F — skins
- [x] `SKINS` catalogue + `GAME_BADGE_TIER`; `SKIN_UNLOCK_KEY` / `SKIN_CHOICE_KEY`.
- [x] `getSelectedSkin` / `setSelectedSkin`; `unlockedSkinIds` Set seeded from the cache.
- [x] `effectiveSkin()` — stored choice iff unlocked, else `classic`.
- [x] `renderSkinPicker()` — swatches in `#game-skin-options`, locked ones `disabled` +
      requirement `title`; initial render on wiring.
- [x] `refreshUnlockedSkins(level, badge, serverSkin)` from `loadGameBestBadge()` /
      `applyScoreResult()`; re-caches, adopts the server choice.
- [x] `drawGame()`: `drawSkinOn(ctx2d, effectiveSkin(), badge box, isCrouching, distance)`.
- [x] index.html `.game-skin-row` in the Break Time panel; styles.css picker + dots.

## Part G — skin on the leaderboard (server)
- [x] worker.js: `GAME_BADGE_TIER`, `GAME_SKIN_RULES`, `gameSkinAllowed()`,
      `gameResolveSkin()`, `GAME_SKIN_EMOJI`.
- [x] `POST /api/game/score`: accept `body.skin`, resolve + store on the entry, return it.
- [x] `POST /api/game/skin`: validate + persist a skin change with no run (no row for a
      never-played player picking `classic`; 403 for an unearned skin).
- [x] `/api/game/score/me` + `/api/game/leaderboard`: return `skin` (re-resolved).
- [x] `runLuksongLeaderboardMonitor`: append skin emoji to each Discord line.
- [x] api-client.js: `submitGameScore(score, token, skin)`, new `setGameSkin(skin)`, export.
- [x] game.js: `roundRectPath()` extracted; `drawSkin` → `drawSkinOn(g, …, phase)` (theme-
      independent colours) so it renders on an offscreen ctx too.
- [x] game.js: `skinThumbDataUrl(id)` (cached 48px badge+skin), `leaderboardAvatar()`,
      logo-load cache bust.
- [x] game.js: `leaderboardRow()` + overlay top-5 render the avatar; `RARE_SKINS` glow.
- [x] game.js: submit passes `effectiveSkin()`; picker click fires `setGameSkin` (f&f).
- [x] styles.css: `.game-lb-avatar` + `[data-rare]` glows, `.game-lb-name`.

## Verify
- [x] `node --check` (game.js, api-client.js, worker.js).
- [ ] `npx wrangler deploy --dry-run`.
- [ ] Manual (deployed): SC-1..SC-7 from spec.
- [ ] `graphify update .` after code changes.

## Follow-up (not in this feature)
- [ ] 35k / 50k milestone callouts.
- [ ] Near-miss scoring combo / multiplier.
- [ ] Partial-patch `/api/game/skin` (avoid the full-row rewrite race).
