# Grilling: 005-luksong-milestone-juice-and-skins

**Q1. Shield lets a run survive longer → can a player farm a higher score than the
`maxPlausibleScore` cap allows?**
A. No. Score accrues from `distance` (≈ speed × time) plus `dodged * 10`. The cap is
`ceil(elapsedSeconds * 230) + 30` — it scales with how long the run lasted. A shield only
buys more seconds, and those seconds raise the cap in lockstep with the score they produce.
Shield grants zero direct points. `src/worker.js` is untouched.

**Q2. `spawnCelebrationParticles()` is called by the existing new-best path. Changing its
signature to take options — does that break the current call?**
A. The change is additive: `spawnCelebrationParticles(opts = {})` with the current values as
defaults. The one existing caller (`applyScoreResult`) keeps calling it with no args and
gets identical behaviour. Covered by SC-6 (game still records scores/badges as before).

**Q3. Milestone "fire only the highest crossed this frame" — a +10 dodge bonus at score
1,995 jumps to 2,005. Fine. But what about a run that legitimately sits between 5,000 and
10,000 for a while — does the 10,000 callout fire the instant it ticks over, not before?**
A. `lastMilestoneIdx` starts at −1 and only advances. Each frame we scan `MILESTONES` for
the highest index `i` where `gameScore >= MILESTONES[i]` and `i > lastMilestoneIdx`. It
fires exactly when the score first reaches that value and never re-fires (index only moves
forward, and `resetGameState()` puts it back to −1 for the next run).

**Q4. CSS `scale(1.04)` always-on the canvas — does that blur the pixel art or misalign the
DOM HUD / touch hit-testing?**
A. The HUD is a sibling `absolute` overlay positioned against `.game-stage`, not the canvas,
so it does not move. Touch handlers already map `clientY` through
`getBoundingClientRect()` of the canvas — `getBoundingClientRect` returns the *post-
transform* box, so the top/bottom split still lands correctly. 4% upscale of a canvas that
is already CSS-scaled to container width is not visibly softer (it was never 1:1 pixels).
`.game-stage` keeps `overflow: hidden` so the 2%/side overhang is clipped. If QA dislikes
the zoom we fall back to expanding the in-canvas background fills by ±MAX_SHAKE instead.

**Q5. `prefers-reduced-motion` — you disable shake, flash, speed-line streaks. Isn't day→
night and the particle burst also "motion"?**
A. Reduced-motion targets vestibular triggers: camera shake, full-screen flashes, fast
translational streaks. A slow colour fade and a small confetti pop at a milestone are low-
risk and are the *reward* signal, so they stay. This matches how the rest of the app treats
the setting (decorative fades kept, parallax/auto-motion cut — see `app-motion.js`).

**Q6. Stamp placed "at jump-apex height with no obstacle there" — the player is cruising on
the ground, sees a stamp mid-air, jumps for it, and lands into an obstacle that spawned
meanwhile. Cheap death?**
A. That is the intended risk/reward — but bounded: the stamp shares the normal
`spawnObstacle` cadence lane, and we only offset its X into a gap that is currently clear
for at least the jump arc (~35 frames). It is never spawned overlapping an existing
obstacle's approach window. Worst case the player declines it (it scrolls off harmlessly) —
grabbing it is always optional.

**Q7. What if the stamp spawns, the player already has a shield by the time it arrives
(grabbed an earlier one)? Or two stamps on screen?**
A. Spawn guard is `!hasShield && pickups.length === 0 && cooldown elapsed`. A shield can
only be gained by collecting, which immediately makes the guard false, and collecting
removes the pickup. So: at most one stamp on screen, and none while shielded.

**Q8. Invulnerability frames after a shield break — during those 35 frames can the player
walk through a wall of obstacles and effectively get a much longer free ride?**
A. 35 frames ≈ 0.58 s at 60 fps — enough to clear the obstacle that just hit them and not
instantly re-die, not enough to bank a meaningful score advantage (~6 px/frame movement).
It is the standard i-frame window. No score is granted during it.

**Q9. Skins gated on `badge` tier — badge comes from *best* score, which never decreases, and
`level` from cumulative XP, which never decreases. So unlocks are monotonic. Confirmed?**
A. Yes. `gameBadgeForScore(best)` and `gameLevelForXp(totalXp)` are both monotonic in
inputs that only grow. Once `platinum` is unlocked it stays unlocked. The
`medlane-game-unlocked-skins` cache is therefore safe to treat as append-only; a failed API
call just means "no *new* unlocks this session".

**Q10. `effectiveSkin()` falls back to `classic` when the stored skin is not in
`unlockedSkinIds`. On a fresh device before any API call, `unlockedSkinIds` is just
`["classic"]` — a Platinum player briefly renders as Classic until the fetch resolves?**
A. Yes, for the sub-second until `loadGameBestBadge()` resolves (it is called in the
`open-game-modal` handler, before the run can start). We also seed `unlockedSkinIds` from
the `medlane-game-unlocked-skins` cache on load, so a returning player on the same device
never sees the fallback flash. A brand-new device for one frame is acceptable.

**Q11. Adding `pickups` to `updateGame`/`drawGame` — perf on a long high-speed run where the
existing comment notes per-frame cost already matters (theme colour caching, sfx pooling)?**
A. `pickups` holds 0 or 1 element by design (Q7). The milestone scan is a ≤4-iteration
array check. Speed lines are ~4 `fillRect`s. Star field is capped (~40 dots, only above
`nightT > 0.4`) with precomputed positions. `lerpColor` runs a handful of times per frame on
the sky/skyline only. Net additional work is small and constant — it does not grow with run
length the way an un-pooled `cloneNode()` or per-frame `getComputedStyle()` would.

**Q12. `milestone.wav` — you are generating it. How is it verified / does it match house
style (volume, format)?**
A. Rendered mono / 22050 Hz / 16-bit to match every existing file (verified with
`wave.getparams`), ~0.5 s, peak-normalised to ≈ −3 dBFS then set to `volume: 0.7` in the
sfx map (between `dodge` 0.55 and `jump`/`newbest` 0.8–0.85). Primed and pooled through the
exact same path as the other cues, so the Safari unlock behaviour is unchanged. The
generator script stays in scratchpad; only the `.wav` is committed.

**Q13. Verification with no local dev env.**
A. `node --check public/scripts/game.js` pre-commit. Post-deploy manual pass of SC-1..SC-6:
one run pushed past 20k for milestones + overdrive + night, a deliberate barely-clear for
near-miss shake, a stamp grab + two hits for the shield, and the Settings picker checked at
two different account levels. `graphify update .` after.

**Q14. Scope creep risk — six sub-features in one branch. If Part E (shield) turns out
contentious, is the rest shippable without it?**
A. Yes. A/B/C/D/F are independent draw-layer / cosmetic changes touching disjoint parts of
`drawGame` and Settings. Part E is the only one that changes the death path. Tasks are
ordered so E can be dropped or split to `006` without reworking the others.

---

*Part G (server-persisted skin on the leaderboard) added after the draft.*

**Q15. `POST /api/game/skin` — a user hits it directly with `{"skin":"platinum"}` from the
console. Do they get the platinum avatar on everyone's leaderboard?**
A. No. The endpoint recomputes `level`/`badge` from that user's stored `game-scores` row
and runs `gameSkinAllowed()` — the same table the client uses. An unearned skin returns
403 and nothing is written. `POST /api/game/score` does the same via `gameResolveSkin()`
(unearned → keep previous valid skin → `classic`). And every *read*
(`/score/me`, `/leaderboard`, Discord) re-runs `gameResolveSkin()` on the stored value, so
even a row somehow written with a bad skin renders as `classic`.

**Q16. `/api/game/skin` rewrites the whole `game-scores` row. Race with a concurrent score
submit?**
A. Both endpoints do a read-modify-write of the same single row (`record_key = user id`).
Two in flight at once is last-write-wins on the JSON blob. The only field `skin` can clobber
is a `best`/`totalXp` that a score submit bumped microseconds earlier — and the next score
submit (which reads fresh and always runs) heals it. The window is a human double-clicking
a swatch while a run's result is posting. Documented as a follow-up (partial patch). Not
worth a lock for a cosmetic field.

**Q17. Never-played user opens Settings and clicks a swatch — a junk `game-scores` row with
score 0 on the leaderboard?**
A. The only clickable swatch for them is `classic` (everything else is `disabled` until
unlocked, and the server 403s it anyway). `POST /api/game/skin` short-circuits
`!existing && wanted === "classic"` with no write. No row is created until they actually
play.

**Q18. `skinThumbDataUrl()` builds a canvas and calls `toDataURL()` per skin. Cost on the
leaderboard render?**
A. Six possible skins, memoised in `skinThumbCache` after first draw — so ≤6 `toDataURL()`
calls for the life of the page, each a 48×48 canvas. The leaderboard renders ≤20 rows
reusing those strings as `<img src>`. The logo image is often undecoded on the very first
call, so a one-time `load` listener clears the cache once, and the next render regenerates
the (now logo-bearing) thumbnails. Negligible.

**Q19. `drawSkinOn` lost its `themeColors()` dependency — do the skins still read in dark
mode?**
A. The skin colours were already almost all literals (`#f4b400` hard-hat, etc.); only the
cape used `c.red`, now `#d71920`. They're drawn over a white logo badge with a blue border
in both themes, so fixed colours are correct — and required, since the offscreen thumbnail
has no theme context.

**Q20. Leaderboard avatar `<img src="data:...">` — CSP / injection concern?**
A. The data URL is produced locally by our own canvas; `entry.skin` is coerced to a known
id (`SKINS.some(...) ? skin : "classic"`) before it selects a cached string, so a leaderboard
payload can't inject an arbitrary `src`. `entry.name` is still `escapeHtml`'d as before.

**Q21. Cross-device skin adoption — device A picks gold, device B still shows cape. B opens
the game: does B silently overwrite A's gold?**
A. `/api/game/score/me` returns the server's stored skin (gold). `refreshUnlockedSkins`
adopts it as B's local choice only when it's unlocked on B (it is — unlocks are per-account,
not per-device). B now shows gold too. B overwrites A only if the user actively picks a
different skin on B, which is the intended "last choice wins".
