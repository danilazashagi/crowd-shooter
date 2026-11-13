# Crowd Shooter: Math Bridge

Browser 3D "Math Runner / Crowd Shooter" on plain HTML5 + ES modules + Three.js r160 (CDN, import map).
No build step, no external assets: every model is procedural.

## Run locally
```bash
python3 -m http.server 8080
```
Open http://localhost:8080 (add `?debug` for an FPS counter and `window.__game`).

## Rules
- Gates are **only `+N` / `−N`** with gentle values (+2 … +10; narrow risk bonuses up to +20).
- **Tug-of-war pairs**: two gates stand edge to edge across the bridge and share one glowing wall
  (`dividerX`). Hitboxes follow the live wall position. Every point scored on a gate gives it +1 and
  pushes the wall toward the neighbour. Shooting a **plus** gate also drags a **minus** neighbour
  toward zero (`−20 → −19 …`); when it reaches 0 (or is squeezed flat) it is crushed off the bridge
  and the plus gate takes the full width. Shooting a minus gate shrinks its minus (then turns it
  plus) and pushes the wall back. Risk rows start with a narrow +bonus squeezed against a wide
  minus, guarded by two armoured mutants.
- **Full-width walls**: a single red gate spanning the bridge (−10 … −25 by level/progress). It
  can't be avoided — shoot it down from afar, enough fire turns it positive.
- Gates react from up to 40 units away; points get pricier and are rate-limited. The wall, widths
  and labels move with `THREE.MathUtils.lerp` on delta time, plus a springy hit pop and white flash.
  Bullets that hit a gate are absorbed: firepower vs. better math.
- **No aim assist**: every soldier fires straight forward; shotguns fire a wall of parallel pellets.
  You aim by steering the squad.
- **Squad size picks the weapon**: 1–9 pistols · 10–24 assault rifles · 25–49 shotguns · 50+ plasma miniguns.
- **Mini-bosses** (armoured crimson juggernauts, 2.4× size) march straight down the bridge inside zombie waves, at least 2 per level. Each shows an exact `HP: 524 / 534` readout; the final boss bar shows `HP: 5939 / 8000`.
- Zombies are fast (5.6 u/s), home in on the squad and sprint in the last 9 units — you have to shoot waves down, walking around them doesn't work.
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
