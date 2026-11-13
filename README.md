# Crowd Shooter: Math Bridge

Browser 3D "Math Runner / Crowd Shooter" on plain HTML5 + ES modules + Three.js r160 (CDN, import map).
No build step, no external assets: every model is procedural.

## Run locally
```bash
python3 -m http.server 8080
```
Open http://localhost:8080 (add `?debug` for an FPS counter and `window.__game`).

## Rules
- Gates are **only `+N` / `−N`**. Risk rows offer a narrow 2-unit gate with a big bonus,
  flanked by minus gates and guarded by an explosive barrel.
- **Gates are shootable**: bullets hitting a gate push its number up one step at a time
  (`−20 → −19 → … → +1 → +2`). Gates react only when close (18 units), each step costs a bit more
  and the rate is capped, so shooting helps but cannot be farmed endlessly. Bullets that hit a gate
  are absorbed, so you trade firepower against zombies for better math.
- **No aim assist**: every soldier fires straight forward; shotguns fire a wall of parallel pellets.
  You aim by steering the squad.
- **Squad size picks the weapon**: 1–9 pistols · 10–24 assault rifles · 25–49 shotguns · 50+ plasma miniguns.
- **Mini-boss** (armoured crimson juggernaut, 2.4× size, own HP bar) marches straight down the bridge inside zombie waves; if it reaches the squad, 8 soldiers die.
- Zombies/mutant brutes rush the squad; barrels show HP on the lid and blow up nearby enemies (and your squad, if you run into one).
- At the end of the bridge, the Mecha-Zombie Tank: dodge lane slams (red zones) and cannon orbs (ground markers).

## Controls
Drag (mouse/touch) or `A`/`D`/arrows. Keys use `event.code`, so AZERTY and other layouts work.
The game starts on the first pointer move, tap or key press.

## Structure
| File | Purpose |
|---|---|
| `index.html` | HUD, styles, import map |
| `src/config.js` | Balance: weapon tiers, speeds, difficulty scaling |
| `src/models.js` | Procedural merged geometries (1 draw call per character type) |
| `src/level.js` | Seeded level generator (gates, waves, barrels) |
| `src/main.js` | Game loop, squad, shooting, enemies, boss, camera |
| `src/fx.js` | Instanced bullet / particle pools, shockwave rings |
| `src/input.js` | Drag + keyboard input |
| `src/hud.js` | DOM HUD |
| `src/cg-sdk.js` | CrazyGames SDK v3 wrapper (loaded only on CrazyGames domains) |

All simulation uses `THREE.Clock` delta time (clamped to 50 ms), so speed is the same at 60/144/165 Hz.
