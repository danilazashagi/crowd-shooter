// ---------------------------------------------------------------------------
// Deterministic level layout generator.
// Produces plain data; main.js turns it into scene objects.
// ---------------------------------------------------------------------------
import { TRACK, GATE, levelParams } from './config.js';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Layout:
 *  gates:   [{ z, value, row }]  (gates sharing the same z form one row)
 *  rows:    [{ z, type: 'pair' | 'wall', divider, gateIdx: [...] }]
 *           pair = left & right gate sharing one movable wall at X = divider
 *           wall = one gate spanning the whole bridge (cannot be walked around)
 *  enemies: [{ x, z, hp, brute, mini }]
 *  bossZ, length
 */
export function generateLevel(level) {
  const P = levelParams(level);
  const rnd = mulberry32(level * 7919 + 13);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const W = TRACK.HALF_WIDTH;

  const out = { gates: [], rows: [], enemies: [], length: P.length, bossZ: -P.length - TRACK.BOSS_GAP };
  let z = -32;
  let lastWasGate = false;
  let step = 0;

  const addRow = (type, values, divider = 0) => {
    const row = { z, type, divider, gateIdx: [] };
    for (const v of values) {
      row.gateIdx.push(out.gates.length);
      out.gates.push({ z, value: Math.min(GATE.MAX_PLUS, v), row: out.rows.length });
    }
    out.rows.push(row);
  };
  let walls = 0;

  const addWave = (p, centerX = 0, spreadX = W - 0.8) => {
    const n = P.waveSize(p);
    const hp = P.zombieHp(p);
    for (let i = 0; i < n; i++) {
      const brute = rnd() < P.bruteChance(p);
      out.enemies.push({
        x: Math.max(-W + 0.6, Math.min(W - 0.6, centerX + (rnd() * 2 - 1) * spreadX)),
        z: z - 4 - rnd() * 12,
        hp: brute ? hp * 6 : hp,
        brute,
        mini: false,
      });
    }
  };

  // Mini-boss: marches inside a wave, behind the first zombies.
  let minis = 0;
  const addMini = (p, x) => {
    minis++;
    out.enemies.push({ x, z: z - 10, hp: P.miniHp(p), brute: false, mini: true });
  };

  while (-z < P.length - 20) {
    const p = Math.min(1, -z / P.length);
    const base = P.gateBase(p);
    step++;

    // Alternate gates with combat, with some variety.
    const r = rnd();
    if (!lastWasGate || r < 0.25) {
      const lastRow = out.rows[out.rows.length - 1];
      const wallOk = p > 0.2 && walls < P.maxWalls && !(lastRow && lastRow.type === 'wall');
      const wantWall = wallOk && (rnd() < 0.3 || (walls === 0 && p > 0.45));
      if (wantWall) {
        // FULL-WIDTH WALL: one red gate across the whole bridge. Shoot it down from afar.
        walls++;
        addRow('wall', [-P.wallValue(p)]);
      } else if (p > 0.15 && rnd() < 0.4) {
        // RISK PAIR: a narrow (2.5u) big bonus squeezed against a wide minus gate,
        // guarded by two armoured mutants. Shooting the bonus pushes the wall open.
        const big = Math.min(GATE.MAX_PLUS, base * 2 + Math.round(rnd() * base * 0.5));
        const minus = -Math.max(2, Math.round(base * (0.6 + rnd() * 0.6)));
        const plusLeft = rnd() < 0.5;
        const divider = plusLeft ? -W + 2.5 : W - 2.5;
        addRow('pair', plusLeft ? [big, minus] : [minus, big], divider);
        const cx = plusLeft ? -W + 1.25 : W - 1.25;
        const hp = P.zombieHp(p) * 6;
        for (const dx of [-0.5, 0.5]) {
          out.enemies.push({ x: cx + dx, z: z + 7, hp, brute: true, mini: false });
        }
      } else {
        // CHOICE PAIR: two halves sharing the movable wall in the middle.
        // the first two rows are a gentle tutorial: both options are positive
        const variant = out.rows.length < 2 ? 'plusplus' : pick(['plusplus', 'plusminus', 'plusminus', 'minusminus']);
        let a, b;
        if (variant === 'plusplus') {
          a = base + Math.round(rnd() * base * 0.5);
          b = Math.max(1, Math.round(base * (0.3 + rnd() * 0.4)));
        } else if (variant === 'plusminus') {
          a = base + Math.round(rnd() * base * 0.6);
          b = -Math.max(1, Math.round(base * (p < 0.25 ? 0.3 + rnd() * 0.3 : 0.5 + rnd() * 0.7)));
        } else {
          // "lesser evil" – only when the player should already have a decent squad
          if (p < 0.3) { a = base; b = -Math.max(1, Math.round(base * 0.5)); }
          else { a = -Math.max(1, Math.round(base * 0.25)); b = -Math.max(2, Math.round(base * 0.8)); }
        }
        if (rnd() < 0.5) [a, b] = [b, a];
        addRow('pair', [a, b], 0);
      }
      lastWasGate = true;
    } else {
      // COMBAT: zombie wave (sometimes led by a mini-boss).
      const cx = (rnd() * 2 - 1) * 1.5;
      addWave(p, cx);
      // frequent mini-bosses: guarantee at least P.minMinis per level, spread over the track
      const owed = minis < Math.ceil(p * P.minMinis);
      if (p > 0.2 && (owed || rnd() < P.miniChance(p))) {
        addMini(p, Math.max(-2.5, Math.min(2.5, cx)));
      }
      lastWasGate = false;
    }
    z -= TRACK.SEGMENT * (0.85 + rnd() * 0.3);
  }
  // last stand before the boss
  z = -P.length + 6;
  addWave(0.85);
  return out;
}
