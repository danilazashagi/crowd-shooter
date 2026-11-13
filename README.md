# Crowd Shooter: Math Bridge

Browser 3D "Math Runner / Crowd Shooter" on plain HTML5 + ES modules + Three.js r160 (CDN, import map).
No build step, no external assets: every model is procedural.

## Run locally
```bash
python3 -m http.server 8080
```
Open http://localhost:8080 (add `?debug` for an FPS counter and `window.__game`).

## Rules
- Gates are **only `+N` / `−N`** with gentle values (+2 … +10; narrow risk gates up to +20).
  Risk rows offer a narrow 2-unit gate flanked by minus gates and guarded by two armoured mutants.
- **Gate rows are shootable**: bullets hitting any gate of a row push every gate of that row up one
  step at a time (`+8/−5 → +9/−4 → … → +14/+1`), from up to 40 units away. The struck panel flashes white,
  numbers pop, and the borders slide: a gate's width follows the size of its number, so a −N being
  shot toward zero narrows while its neighbour widens. Steps get pricier and are capped at 2.5/s.
  Bullets that hit a gate are absorbed, so you trade firepower against zombies for better math.
- **No aim assist**: every soldier fires straight forward; shotguns fire a wall of parallel pellets.
  You aim by steering the squad.
- **Squad size picks the weapon**: 1–9 pistols · 10–24 assault rifles · 25–49 shotguns · 50+ plasma miniguns.
- **Mini-bosses** (armoured crimson juggernauts, 2.4× size) march straight down the bridge inside zombie waves, at least 2 per level. Each shows an exact `HP: 524 / 534` readout; the final boss bar shows `HP: 5939 / 8000`.
- Zombies/mutant brutes rush the squad.
- **Difficulty curve**: level 2 only adds a little HP and wave size; from level 3 on the horde also gets +10% speed, +7% armour and more soldiers lost per contact each level.
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
| `src/level.js` | Seeded level generator (gates, waves, mini-bosses) |
| `src/main.js` | Game loop, squad, shooting, enemies, boss, camera |
| `src/fx.js` | Instanced bullet / particle pools, shockwave rings |
| `src/input.js` | Drag + keyboard input |
| `src/hud.js` | DOM HUD |
| `src/cg-sdk.js` | CrazyGames SDK v3 wrapper (loaded only on CrazyGames domains) |

All simulation uses `THREE.Clock` delta time (clamped to 50 ms), so speed is the same at 60/144/165 Hz.
