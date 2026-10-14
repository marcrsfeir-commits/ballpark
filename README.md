# ⚾ BALLPARK

**▶ Play it here: https://marcrsfeir-commits.github.io/ballpark/**

Five free daily guessing games in one place. No ads, no accounts, no paywalls — everything runs in your browser and saves on your device.

| Game | What you do | Inspired by |
|---|---|---|
| **KRILLDIVE** | Name the rarest answer you can — obvious answers float, rare ones sink you toward the 7,000 m trench. 13 themed packs, endless mode, archive. | Krillion |
| **JARFUL** | Objects pour into a 3D jar (real physics). Guess how many in 15 seconds. Daily, Over/Under, Fill To and Practice modes. | Amountle |
| **NAPKIN** | Three huge estimates a day ("how many tennis balls fill an Olympic pool?"). Scored by how close your ratio is. Built-in calculator + archive. | Fermi.gg |
| **ODD HUE** | Six blocks, one is a shade off. Find it — they get closer every round. Classic, 60-second Rush and Daily. | HSL Color Game |
| **TO SCALE** | Stretch a silhouette to its real-world size next to a reference (is a toucan bigger than a tennis racket?). | Size It Up |

These are fan remakes of the games played in Joe Bart's video *"The Game Of Niche Ball Knowledge"* — go play the originals too. All prompts, questions, answer lists and art here are original.

## Run locally

```
node serve.js        # http://localhost:8813
```

No build step. three.js (r170) and cannon-es are vendored in `vendor/` (MIT licensed), so it works fully offline.

## Layout

- `index.html` / `hub.js` — the hub (today's scores, streak, scorecard)
- `shared/bp.js` — back-to-hub button, daily numbering, seeded RNG, storage helpers
- `games/<game>/` — each game is a self-contained static page
- `tools/sync-krilldive.mjs` — copies KRILLDIVE in from its own project and bundles its packs
