# BALLPARK daily log

One verified improvement per run (scheduled task `ballpark-daily`). Sundays = a new original game.

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

## Ideas backlog
- Going Once: only 52 lots, runs out fast; more lots need verified prices + free-licence photos (Wikimedia) with credits.
- Trolley Trouble: a few new levels use loose photos (the "bed" photo is a whole old bedroom); swap for better Wikimedia shots if any turn up.
- Circle Up / Odd Hue: check phone feel and a daily leaderboard-ish streak in the hub.
- Hub: a short "what changed" line per game (e.g. a `notes` map in version.json set by the daily run) shown as the UPDATED pill's tooltip / under the blurb.
- Big Spender / Been There: content counts — check if they run out fast.
- Performance pass on DOWNHILL / SKYLANE with CPU throttle 6.
