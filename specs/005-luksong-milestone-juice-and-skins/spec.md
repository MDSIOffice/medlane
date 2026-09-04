# Feature Specification: Luksong Medlane — Milestone Juice + Cosmetic Skins

**Feature Branch**: `005-luksong-milestone-juice-and-skins`

**Created**: 2026-09-04

**Status**: Draft

**Input**: User: "Milestone juice. Score callouts at 2k/5k/10k/20k with a chime + mini
fireworks, screen shake on near-miss and death, speed lines + subtle background hue shift
past a speed threshold, day→night over a long run. Cheap, big feel improvement. '✅ approved
stamp' = one-hit shield. Risk/reward placement. Player skins unlocked by level or badge
(hard hat, cape, logo variants), picked in Settings — pure cosmetic, no balance impact."

## Context

`public/scripts/game.js` is a self-contained closure — an endless runner (jump ground
stacks, duck flying "AUDIT" banners). Score = `floor(distance / 8) + dodged * 10`; `speed`
ramps `6.2 → 21` with score; badges (Bronze/Silver/Gold/Platinum) and quadratic-curve
levels are decided server-side (`gameBadgeForScore` / `gameLevelForXp` in `src/worker.js`).
The client already receives `{ best, badge, level, totalXp, xpToNextLevel }` from
`/api/game/score/me` and `/api/game/score`.

Parts A–F are **client + one audio asset**. Part G (added after the draft) adds skin
persistence + validation to `src/worker.js` and one new endpoint. Score generation rate
is unchanged, so the server's `maxPlausibleScore` guard is untouched.

## Part A — Milestone callouts

- **FR-A1**: When the live score first crosses **2,000 / 5,000 / 10,000 / 20,000** in a run,
  the game MUST: play a chime (`sounds/milestone.wav`), spawn a short particle burst (reuse
  the celebration-particle system, smaller/faster than the new-best burst), and show a
  canvas-drawn floating callout (`"5,000!"`) that rises and fades over ~0.9 s.
- **FR-A2**: Each threshold fires **at most once per run**; a run that starts at 0 and never
  reaches a threshold fires nothing. Crossing several in one frame (large dodge bonus) fires
  only the highest crossed, once.
- **FR-A3**: Milestone feedback MUST NOT block input, pause the loop, or use the app-level
  `toast()` (too heavy mid-run) — it is entirely in-canvas + audio.
- **FR-A4**: Respects the existing sound toggle (`soundEnabled`); particles/callout still
  show when muted.

## Part B — Screen shake

- **FR-B1**: A shake impulse `addShake(magnitude, frames)` decays linearly to zero.
- **FR-B2**: **Near-miss** (an obstacle is marked `passed` with a vertical clearance gap
  ≤ 14 px between the player box and the obstacle box): small shake (`~2.5, 8`) + a one-frame
  white flash. No score effect (a scoring combo is explicitly out of scope).
- **FR-B3**: **Death**: larger shake (`~9, 24`) applied in `endGame()` before the final
  draw.
- **FR-B4**: Shake is applied as a CSS `transform` on the `<canvas>` (a small always-on
  `scale(1.04)` so the shake translate never reveals a stage edge). The DOM HUD overlay is
  unaffected. `prefers-reduced-motion` MUST disable shake and the flash (particles/hue/night
  still run).

## Part C — Overdrive (speed lines + hue wash)

- **FR-C1**: `overdrive = clamp((speed - 14) / (21 - 14), 0, 1)`.
- **FR-C2**: When `overdrive > 0`: draw a few horizontal speed-line streaks per frame at
  random Y, opacity scaled by `overdrive`; lay a translucent warm wash
  (`c.orange`, alpha ≤ `0.12 * overdrive`) over the scene.
- **FR-C3**: Purely visual; no effect on physics, spawn rate, or score.
- **FR-C4**: Disabled under `prefers-reduced-motion` (speed lines only; the static hue wash
  may stay as it does not move).

## Part D — Day → night

- **FR-D1**: `nightT = clamp(gameScore / 30000, 0, 1)` — full night on a strong (~30k) run.
- **FR-D2**: The sky gradient stops and the parallax skyline colour are lerped toward fixed
  night RGB (`#0b1830` top / `#15294a` horizon) by `nightT`, independent of the app light/
  dark theme.
- **FR-D3**: Above `nightT > 0.4`, a sparse star field fades in (drawn with slight parallax
  off `bgOffset`); a small moon fades in with it.
- **FR-D4**: Resets with every run (it is score-derived, so `resetGameState()` covers it).

## Part E — "Approved stamp" one-hit shield

- **FR-E1**: A `pickups` array (separate from `obstacles`, so the death-collision loop stays
  simple). A `stamp` pickup is a small "✅ APPROVED" rubber-stamp card.
- **FR-E2**: **Spawn** — only when the player has no shield and no stamp is already on
  screen; low probability per spawn tick, not before score ~1,500, min gap ~1,200 score
  between stamps. Placed for **risk/reward**: either at jump-apex height (must jump to grab,
  even with no obstacle there) or in the duck lane just under banner height (grabbing it
  commits you to a crouch). Never placed where it is physically impossible to reach or
  unavoidable to touch.
- **FR-E3**: **Collect** (AABB player vs stamp): `hasShield = true`, distinct sfx (reuse
  `newbest.wav` at low volume), a HUD chip `🛡 Shield`, and a glowing ring around the player
  badge.
- **FR-E4**: **Consume** — on what would be a fatal collision, if `hasShield`: clear it,
  grant ~35 frames of invulnerability (hit checks skipped), big shake + white flash + a
  "shield break" sfx; the run continues. Death only happens with no shield and no active
  invulnerability.
- **FR-E5**: Never stacks (max one shield; no second stamp spawns while `hasShield`). Adds
  no score — only extends play time, which the elapsed-time score cap already accounts for.

## Part F — Player skins (cosmetic)

- **FR-F1**: Skins are drawn **procedurally** over the existing logo badge in `drawGame()` —
  no new image assets. Catalogue:

  | id         | label           | unlock                        | look |
  |------------|-----------------|-------------------------------|------|
  | `classic`  | Classic         | always                        | logo badge (current) |
  | `hardhat`  | Hard Hat        | Level 3                       | + yellow hard hat |
  | `shades`   | Cool Shades     | Level 6                       | + sunglasses bar |
  | `cape`     | Caped Auditor   | Silver badge (tier ≥ 2)       | + cape that waves off `distance` |
  | `gold`     | Gold Standard   | Gold badge (tier ≥ 3)         | gold badge border + small crown |
  | `platinum` | Platinum Aura   | Platinum badge (tier 4)       | diamond tint + sparkle particles |

- **FR-F2**: Picker lives in the **Break Time** panel in User Settings (below the Play/
  Leaderboard row). Locked skins render disabled with their requirement as tooltip text.
- **FR-F3**: Selection persists to `localStorage["medlane-game-skin"]`; the set of unlocked
  ids is cached to `localStorage["medlane-game-unlocked-skins"]` on each successful
  `/api/game/score/me`, so the picker still reflects reality if a later fetch fails.
- **FR-F4**: `loadGameBestBadge()` (already run on modal open and on the Settings tab)
  refreshes the picker's lock state from the response's `level` and `badge`.
- **FR-F5**: At draw time, `effectiveSkin()` returns the stored choice only if it is
  currently unlocked, else `classic` — a stale/locked stored value never wipes the pref but
  never renders either.
- **FR-F6**: Purely cosmetic — no change to hitbox, physics, score, or XP.

## Part G — Skin on the leaderboard (server-persisted "flex")

Added after the initial draft (user: "show in the leaderboard each user's avatar custom
design as well as a flex"). This is the one part that touches `src/worker.js`.

- **FR-G1**: The chosen skin is persisted server-side on the `game-scores` record
  (`data.skin`), so it can be shown to *other* players on the leaderboard. Written on
  every score submit (`POST /api/game/score` gains a `skin` field) and via a new
  `POST /api/game/skin` for a change made without playing.
- **FR-G2**: The server is the authority — `gameSkinAllowed(id, level, badgeTier)`
  mirrors the client `SKINS` unlock table. A submit/skin-set naming a skin the player
  has not earned is **not stored**; the stored value falls back to the previous valid
  skin, else `classic`. `gameResolveSkin()` re-validates on every read
  (`/api/game/score/me`, `/api/game/leaderboard`, the Discord board) so a since-revoked
  value (not possible today — unlocks are monotonic) would still never render.
- **FR-G3**: `POST /api/game/skin` creates no row for a never-played player choosing
  `classic` (nothing to persist); any other skin requires the unlock and 403s otherwise.
- **FR-G4**: `/api/game/leaderboard` and `/api/game/score/me` return `skin` per entry.
  The client renders a **48 px procedurally-drawn avatar** (logo badge + the same
  `drawSkinOn()` used for the runner, cached per skin id) beside each name in both the
  full leaderboard modal and the end-of-run overlay top-5.
- **FR-G5**: Rare skins (`cape` / `gold` / `platinum`) get a coloured glow on their
  leaderboard avatar — the "flex". The Discord leaderboard line appends a skin emoji.
- **FR-G6**: Cross-device — `/api/game/score/me` returns the stored `skin`; the client
  adopts it as the local selection when it is currently unlocked, so the picker matches
  on a new device.

## Success Criteria

- **SC-1**: A run passing 5,000 shows the floating "5,000!", plays the chime once, and pops
  a particle burst; re-crossing 5,000 in the same run does nothing.
- **SC-2**: Barely clearing a stack shakes the screen briefly; dying shakes it harder. With
  OS "reduce motion" on, neither shake nor flash occurs.
- **SC-3**: A long run visibly speeds into a warm, streak-lined "overdrive" look and the sky
  darkens to night with stars past ~12k.
- **SC-4**: Grabbing an "approved stamp" shows the 🛡 chip; the next hit is survived with a
  flash instead of ending the run; the one after that is fatal.
- **SC-5**: A Level-1 player sees only Classic selectable; a Silver-badge / Level-5 player
  can select the cape; the choice persists across reloads and shows on the runner.
- **SC-6**: `node --check public/scripts/game.js`; the game still records scores, badges,
  levels, and the leaderboard exactly as before.
- **SC-7**: Selecting the cape in Settings shows it on the runner *and* on this player's
  leaderboard row (with a red glow) for everyone; a direct `POST /api/game/score` or
  `/api/game/skin` naming `platinum` from a Bronze account does not change the stored
  skin. Opening the game on a second device shows the cape pre-selected.

## Assumptions / Out of scope

- No scoring combo / near-miss bonus (juice only — a multiplier is a separate feature).
- Milestone thresholds stop at 20k as specified; 35k/50k callouts are a trivial follow-up
  (extend the array).
- Skin unlocks are re-derived from the API on Settings/modal open and cached; the chosen
  skin is synced server-side (Part G).
- The picker swatches are coloured dots + label, not full drawn thumbnails (the drawn
  thumbnail is used on the leaderboard).
- `POST /api/game/skin` writes the whole `game-scores` row (name/score/date/xp/level +
  skin) rather than a partial patch — matches how the score endpoint already writes it;
  a concurrent score submit and skin set could race, last-write-wins, self-healing on
  the next submit. Acceptable for a cosmetic field.
- `milestone.wav` is a new ~11 KB mono 22.05 kHz asset generated to match the existing
  pre-rendered-WAV approach (the codebase deliberately avoids Web Audio synthesis — see the
  audio comment block in `game.js`).
