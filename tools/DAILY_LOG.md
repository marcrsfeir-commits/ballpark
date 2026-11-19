# BALLPARK daily log

One verified improvement per run (scheduled task `ballpark-daily`). Sundays = a new original game.

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
- Hub: "NEW" badge on games that changed since the player's last visit (compare version.json per game).
- Big Spender / Been There: content counts — check if they run out fast.
- Performance pass on DOWNHILL / SKYLANE with CPU throttle 6.
