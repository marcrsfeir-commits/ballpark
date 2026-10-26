# ⚾ BALLPARK

**▶ Play it here: https://marcrsfeir-commits.github.io/ballpark/**

Thirteen free browser games in one place. No ads, no accounts, no paywalls — everything runs in your browser and saves on your device. Daily puzzles are picked per device, so friends get different sets.

| Game | What you do | Inspired by |
|---|---|---|
| **KRILLDIVE** | Name the rarest answer you can — obvious answers float, rare ones sink you to the 7,000 m trench. 20 themed packs, 420 prompts, endless mode, archive. | Krillion |
| **JARFUL** | Objects pour into a 3D jar (real physics). Guess how many in 15 seconds. Daily, Over/Under, Fill To and Practice. | Amountle |
| **NAPKIN** | Three huge estimates a day ("how many tennis balls fill an Olympic pool?"), scored by ratio. Calculator + archive. | Fermi.gg |
| **ODD HUE** | Six blocks, one is a shade off. Classic, 60-second Rush and Daily. | HSL Color Game |
| **TO SCALE** | Stretch a silhouette to its real-world size next to a reference. | Size It Up |
| **FUSE** | Start with Water, Fire, Wind and Earth and combine your way to thousands of things. | Infinite Craft |
| **GOING ONCE** | Guess what famous real auction lots sold for — ruby slippers, a T. rex, Lennon's tooth. | Auction Game (neal.fun) |
| **CIRCLE UP** | Draw a perfect circle around the dot, freehand. | neal.fun |
| **BIG SPENDER** | You just inherited $100 billion. Spend every cent. | neal.fun |
| **PASSWORD PANIC** | Pick a password that satisfies ever more ridiculous rules. | neal.fun |
| **BEEN THERE** | A 200-item life checklist — how much have you done? | neal.fun |
| **TROLLEY TROUBLE** | 28 absurd trolley dilemmas and your ethics profile. | neal.fun |
| **NOT A ROBOT** | A captcha that gets more and more suspicious of you. | neal.fun |

These are fan remakes — go play the originals too. All prompts, questions, answer lists and art here are original.

## Run locally

```
node serve.js        # http://localhost:8813
```

No build step. three.js (r170) and cannon-es are vendored in `vendor/` (MIT), so it works fully offline.
Running locally also unlocks two extras that use a local [Ollama](https://ollama.com) model: FUSE invents combinations that aren't in the pre-made recipe book (`/api/fuse`), and the standalone KRILLDIVE can judge answers missing from its lists.

## Offline

After one visit the whole site works with no internet (PC, iPad, phone — also as an installed home-screen app). `sw.js` precaches every file; regenerate it before each push with `node tools/build-sw.mjs` (the cache version is a content hash).

## Layout

- `index.html` / `hub.js` — the hub (today's results, streak, scorecard)
- `shared/bp.js` — back-to-hub button, daily numbering, per-device seeds, storage helpers
- `games/<game>/` — each game is a self-contained static page
- `tools/sync-krilldive.mjs` — copies KRILLDIVE in from its own project and bundles its packs
- `tools/gen-fuse.mjs` — generates FUSE recipes with a local LLM (resumable)
