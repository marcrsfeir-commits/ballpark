# BALLPARK daily log

One verified improvement per run (scheduled task `ballpark-daily`). Sundays = a new original game.

## 2026-11-22 (Sun) — NEW GAME: FAIR SHARE (17 games)
- `games/fairshare/` (index.html, style.css, game.js). One straight swipe across a treat on a plate; split it into exactly the share asked. Daily = 5 treats seeded by date (same for everyone, no shape twice): half, half, half, one third, one quarter. Score 100 − 9 × points off per treat, /500. Practice = endless, random targets, running average.
- 9 procedural shapes (blob cookie, bitten cookie, star cake, heart, toast, cheese wedge, brownie tetromino slabs, croissant crescent, cream-puff cloud) × flavours with drawn toppings (chips, sprinkles, berries, cheese holes, drizzle, crumbs). Cut = half-plane polygon clip (exact area, concave shapes fine); pieces slide apart with their %, the perfect parallel cut is drawn dashed. Too-short drags and misses don't count.
- Results card: per-treat mini SVG with your cut, grade pips, copy text ("Half ±0.42 | ..."), countdown to tomorrow; daily progress saved per cut (`ballpark.fairshare.daily`, `.stats`, `.muted`), so reloads resume and can't reroll. Keyboard: arrows aim (Shift = fine), Enter cuts. Reduced motion respected. `window.__fair` test hooks (`show(kind, seed)`, `cut`, `fracOn`).
- Hub: card + drawn cookie icon, "seventeen" games, 0 / 17.
- Verified (puppeteer, SW bypassed, desktop 1280×860 + phone 375×812): 360 generated treats all valid; full daily with real mouse drags (perfect cuts scored 100, sloppy ones 44–51), results 395/500, share text, hub card shows "TODAY · 396/500", reload shows "See today's result", practice + keyboard cut, miss doesn't count; 0 console errors, no horizontal scroll, no emoji. Screenshots of every shape looked right (made the croissant chunkier, moved the score pop off the treat, no repeated shapes in a day after the first pass showed two bitten pancakes).
- Version: 77bf127.

## 2026-11-21 (Sat) — DOWNHILL: drawn icons replace every emoji
- Swept all 16 games in headless Chrome (desktop + phone): 0 console errors, 0 horizontal scroll on load. A repo-wide grep found DOWNHILL was the only game still breaking the no-emoji rule (25 spots).
- `games/downhill/game.js`: new `ICON` map of 16 stroke SVGs (currentColor, 24-unit grid) + `icon(name)`; HTML placeholders use `data-ico="..."` and are filled at boot. Covers the mute/unmute and pause buttons, SKINS/GOALS/quality tabs (pink/gold/cyan glow), all 13 goal icons (check when done), level-up and goal notes on the results card, the "Skins" button. Goal toast and share text are plain text now ("DOWNHILL: 712 pts · 249 m · 10 gems (level 3)").
- Also "1 gem" instead of "1 gems" in the results breakdown and share text.
- Verified (puppeteer, SW bypassed, desktop 1280×860 + phone 375×812): 6 icons on the menu, mute toggles icon + aria-label, 13 goal icons, pause button shows during play, full runs to WIPEOUT with seeded save (level-up + "Play 15 runs" goal notes both show their icons), share text copied, 0 console errors, no horizontal scroll, no emoji in page text. Screenshots looked right. `git grep` for emoji ranges outside vendor/: 0 hits.
- Version: d011888.

## 2026-11-20 (Fri) — Hub: NEW / UPDATED badges on game cards
- `tools/build-sw.mjs` now writes `games: {id: {h, d}}` into version.json: a content hash of each `games/<id>/` folder and the day it last changed (kept from the previous version.json while the hash is unchanged; first run seeded from each game's last git commit date).
- `hub.js`: the player's last-seen hashes live in `ballpark.seen`. First visit on a device marks everything seen (no wall of badges). A changed game shows an "UPDATED 19 NOV" pill next to its name, a game the device has never seen shows "NEW"; clicking the card clears it. Pill uses the card accent, gentle pulse (off under reduced motion).
- Header/meta said "fifteen" games and the static count said "0 / 13": now sixteen / 16.
- `.claude/` (local launch.json) is git-ignored; it slipped into the first commit and was untracked again.
- Verified (puppeteer, SW bypassed, desktop 1280×860 + phone 375×812): first visit 0 badges + 16 seen entries; after faking stale hashes, KRILLDIVE "UPDATED 16 NOV", TROLLEY "UPDATED 19 NOV", NAPKIN "NEW"; opening Trolley then returning clears only its badge; 0 console errors, no horizontal scroll. Screenshots looked right (pill wraps cleanly under long names on phone).
- Version: d7c06b8.
- Note: shared/ changes (photos, bp.js) don't flag games; only files inside games/<id>/ count.

## 2026-11-19 (Thu) — Trolley Trouble: 14 new dilemmas (28 → 42)
- Added 14 original levels before the finale ("The Results Button" stays last): Snail Grand Prix, Snooze Button, Sandcastle Kingdom, Snowman Family Reunion, Name on the Box, The Poet Robot, Bee Business, Checkmate in One, Milk First, Just One More Photo, The Overdue Book, Science Fair Panic, Kite Day, The Bat Choir. All items use existing `shared/photos` keys (checked: 0 missing).
- Saves are now keyed by level id (`ballpark.trolley.ids`); old saves without it are read with the original 28-id order (`LEGACY_IDS` in game.js). A player who finished the old 28 gets "Continue (level 28)" and plays the new ones, then the finale again.
- Share grid now has ceil(N/7) rows; "28" text in index.html / hub blurb updated to 42.
- Verified (puppeteer, SW bypassed, desktop 1280×860 + phone 375×812): legacy save → "Continue (level 28)", played all 15 remaining levels, end grid 42 cells, share text 6 rows, reload keeps "See my ethics profile", 0 console errors, no horizontal scroll. Screenshots looked right.
- Version: b2a64f0.

## 2026-11-23 (Mon) — TOOLING: Emoji regression check
- Created `tools/check-emoji.mjs`: scans all text files in games/ and shared/, detects emoji characters using Unicode ranges, fails fast with line numbers if any are found.
- Integrated into `tools/build-sw.mjs`: runs before sw.js generation, so the no-emoji rule can't regress without a build failure.
- Verified (puppeteer, desktop 1280×860 + phone 375×812): hub loads cleanly, all 17 games visible, 0 console errors, no horizontal scroll. Spot-checked phone layout on Circle Up + Odd Hue (375×812): both fit cleanly, no overflow.
- Version: 3546df7.

## Ideas backlog
- Going Once: only 52 lots, runs out fast; more lots need verified prices + free-licence photos (Wikimedia) with credits.
- Trolley Trouble: a few new levels use loose photos (the "bed" photo is a whole old bedroom); swap for better Wikimedia shots if any turn up.
- Circle Up / Odd Hue: check phone feel and a daily leaderboard-ish streak in the hub.
- Hub: a short "what changed" line per game (e.g. a `notes` map in version.json set by the daily run) shown as the UPDATED pill's tooltip / under the blurb.
- Big Spender / Been There: content counts — check if they run out fast.
- Performance pass on DOWNHILL / SKYLANE with CPU throttle 6. (Both already auto-drop quality below 32 fps, so check measured fps first.)
- FAIR SHARE: more shapes (donut with a hole needs polygon-with-holes clipping; pizza with toppings), a "two cuts into thirds" round, a weekly hard mode.
- A tiny `tools/check-emoji.mjs` (or a check inside build-sw) that fails on emoji in text files, so the rule can't regress.
