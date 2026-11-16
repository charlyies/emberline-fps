// EMBERLINE — a threejs-fps-02 entry (Node 22, standard library only): the game is this
// directory's game/ folder, plain static files the browser loads as ES modules with
// three.js 0.187.0 from an import map, and the program hands it in. It copies game/ and
// screenshots/ from beside this file to /output and writes /output/dossier.json, the
// summary the judge reads, with the vendored make.fun library.
//
// Emberline: a round-based tactical FPS, 5v5 Ember vs Frost bots in the Foundry Yard.
// Win rounds by eliminating the enemy team or capturing the Beacon at mid; first to 5
// rounds takes the match. Kills and round wins earn cash for the between-round buy menu
// (Hornet SMG, Longshot Rifle, Deadeye sniper, plating, Ember Charge grenades).
// Acceleration-based movement, bot roles with burst fire, Beacon holds and noise
// investigation. Synthesised WebAudio sound, deterministic screenshot scenes via
// ?shot=start|play|end.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
