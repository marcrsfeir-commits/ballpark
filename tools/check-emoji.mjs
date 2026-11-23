// Scans all text files in games/ and shared/ for emoji characters.
// Fails with an error message if any are found (runs as part of build-sw.mjs before generating sw.js).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// Unicode ranges for emoji: a simple but effective pattern.
// Covers most emoji ranges including:
// - Basic emoji (U+1F300–U+1F9FF)
// - Emoticons (U+1F600–U+1F64F)
// - Symbols (U+2600–U+27BF, U+1F900–U+1F9FF)
// - Misc extended (U+1F680–U+1F6FF)
// Also catches combining characters, variation selectors, and zero-width joiners used in emoji sequences.
const EMOJI_PATTERN = /[\u{1F000}-\u{1F9FF}\u{2600}-\u{27BF}\u{1F300}-\u{1F6FF}\u{200B}-\u{200D}\u{FE0F}\u{FE0E}]/gu;

const TEXT_EXTS = new Set(['.html', '.js', '.mjs', '.css', '.json']);
const errors = [];

function walkDir(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === '.git' || e.name === 'node_modules') continue;
      walkDir(p);
    } else if (TEXT_EXTS.has(path.extname(e.name))) {
      checkFile(p);
    }
  }
}

function checkFile(filepath) {
  try {
    const content = fs.readFileSync(filepath, 'utf8');
    const matches = content.match(EMOJI_PATTERN);
    if (matches) {
      // Build a report with line numbers where emoji appear
      const lines = content.split('\n');
      const lineNums = [];
      let pos = 0;
      lines.forEach((line, i) => {
        const nextPos = pos + line.length + 1; // +1 for newline
        if (line.match(EMOJI_PATTERN)) lineNums.push(i + 1);
        pos = nextPos;
      });
      const rel = path.relative(root, filepath).split(path.sep).join('/');
      errors.push(`${rel}: found emoji on lines ${lineNums.join(', ')}`);
    }
  } catch (err) {
    console.warn(`Warning: could not read ${filepath}: ${err.message}`);
  }
}

// Check only games/ and shared/
walkDir(path.join(root, 'games'));
walkDir(path.join(root, 'shared'));

if (errors.length > 0) {
  console.error(`\nEmoji found (BALLPARK rule: no emoji):\n${errors.join('\n')}\n`);
  process.exit(1);
}

console.log('✓ No emoji found in text files.');
