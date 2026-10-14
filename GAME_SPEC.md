# BALLPARK game spec (for game builders)

BALLPARK is a static game hub (GitHub Pages: https://marcrsfeir-commits.github.io/ballpark/, local: http://localhost:8813 — that server is ALREADY RUNNING, never start or stop it). Each game lives in its own folder `games/<id>/` and is completely self-contained.

## Hard rules
- Work ONLY inside `D:\Claude Work\ballpark\games\<id>\`. Never edit the hub (`index.html`, `hub.js`), `shared/`, or other games.
- Static files only (`index.html` + optional `style.css`, `game.js`, data `.js`). Relative paths only (it is served from a sub-path). No CDN, no network requests, no web fonts (system fonts), no external images — use emoji, CSS, SVG or canvas for art.
- Include `<script src="../../shared/bp.js"></script>` (read `D:\Claude Work\ballpark\shared\bp.js`). It adds a "◂ BALLPARK" back pill (move it with `<body data-bp-pos="br|tl|tr">` if it covers your UI) and gives you:
  `Ballpark.store('<id>')` (namespaced localStorage get/set), `Ballpark.report('<id>', { score, max, label })` (call whenever the player finishes a run — the hub shows `label` as today's result), `Ballpark.today()`, `Ballpark.rng(seed)`, `Ballpark.deviceSeed()`.
- Original names, wording and content only — never copy text/assets from the site that inspired it.
- Must feel polished: clear title + one-line instructions, satisfying feedback/animation, a results/share moment (copy-to-clipboard), works at 375 px wide, keyboard-friendly, respects prefers-reduced-motion. Small synthesized Web Audio sounds are welcome (start audio only after a user gesture, include a mute toggle).
- Every CSS rule that sets `display` on an element you toggle with the `hidden` attribute needs `[hidden]{display:none!important}` in your CSS.

## Verify (required before you finish)
Use puppeteer-core (already installed) with a small script in `C:\Users\ralph\AppData\Local\Temp\claude\D--Claude-Work\28346699-2077-4d64-a36d-f3e19f589e28\scratchpad\vendor-npm\` (run `node <script>.mjs` from that folder; launch with `executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new'`). Load `http://localhost:8813/games/<id>/`, play through the core loop programmatically, collect `pageerror`/console errors, and take screenshots (then Read the PNGs and fix what looks wrong). Do NOT use the Claude_Browser tools.
Reply with: files created, how the game works, what you verified (with screenshot paths), known limitations — briefly.
