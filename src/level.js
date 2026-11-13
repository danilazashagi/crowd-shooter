// ---------------------------------------------------------------------------
// Deterministic level layout generator.
// Produces plain data; main.js turns it into scene objects.
// ---------------------------------------------------------------------------
import { TRACK, levelParams } from './config.js';

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
 *  gates:   [{ z, x, width, value }]  (gates sharing the same z form one row)
 *  rows:    [{ z, gateIdx: [...] }]
 *  enemies: [{ x, z, hp, brute, mini }]
 *  barrels: [{ x, z, hp }]
 *  bossZ, length
 */
export function generateLevel(level) {
  const P = levelParams(level);
  const rnd = mulberry32(level * 7919 + 13);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const W = TRACK.HALF_WIDTH;

  const out = { gates: [], rows: [], enemies: [], barrels: [], length: P.length, bossZ: -P.length - TRACK.BOSS_GAP };
  let z = -32;
  let lastWasGate = false;
  let step = 0;

  const addRow = (defs) => {
    const row = { z, gateIdx: [] };
    for (const d of defs) {
      row.gateIdx.push(out.gates.length);
      out.gates.push({ z, x: d.x, width: d.width, value: d.value, row: out.rows.length });
    }
    out.rows.push(row);
  };

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
      if (p > 0.15 && rnd() < 0.4) {
        // RISK ROW: a narrow (2u) big bonus, flanked by minus gates and guarded by an
        // explosive barrel right in front of it. Its position varies so idling never pays.
        const big = base * 2 + Math.round(rnd() * base);
        const side = Math.max(2, Math.round(base * (0.4 + rnd() * 0.5)));
        const narrow = 2.0;
        const cx = pick([-2.9, 0, 2.9]);
        const leftW = cx - narrow / 2 + W, rightW = W - (cx + narrow / 2);
        addRow([
          { x: -W + leftW / 2, width: leftW, value: -side },
          { x: cx, width: narrow, value: big },
          { x: W - rightW / 2, width: rightW, value: -(side + Math.round(rnd() * 3)) },
        ]);
        out.barrels.push({ x: cx, z: z + 9, hp: P.barrelHp(p) });
      } else {
        // CHOICE ROW: two halves.
        // the first two rows are a gentle tutorial: both options are positive
        const variant = out.rows.length < 2 ? 'plusplus' : pick(['plusplus', 'plusminus', 'plusminus', 'minusminus']);
        let a, b;
        if (variant === 'plusplus') {
          a = base + Math.round(rnd() * base);
          b = Math.max(1, Math.round(base * (0.3 + rnd() * 0.5)));
        } else if (variant === 'plusminus') {
          a = base + Math.round(rnd() * base * 0.8);
          b = -Math.max(1, Math.round(base * (p < 0.25 ? 0.25 + rnd() * 0.25 : 0.4 + rnd() * 0.6)));
        } else {
          // "lesser evil" – only when the player should already have a decent squad
          if (p < 0.3) { a = base; b = -Math.max(1, Math.round(base * 0.5)); }
          else { a = -Math.max(1, Math.round(base * 0.25)); b = -Math.max(2, Math.round(base * 0.8)); }
        }
        if (rnd() < 0.5) [a, b] = [b, a];
        addRow([
          { x: -W / 2, width: W, value: a },
          { x: W / 2, width: W, value: b },
        ]);
      }
      lastWasGate = true;
    } else {
      // COMBAT: zombie wave, sometimes barrels in the middle of it.
      const cx = (rnd() * 2 - 1) * 1.5;
      addWave(p, cx);
      // guarantee one mini-boss around mid-level, random extra ones later
      if ((minis === 0 && p > 0.45) || rnd() < P.miniChance(p) * (minis ? 0.5 : 1)) {
        addMini(p, Math.max(-2.5, Math.min(2.5, cx)));
      }
      if (rnd() < 0.55) {
        const count = 1 + Math.floor(rnd() * 2);
        for (let i = 0; i < count; i++) {
          out.barrels.push({ x: (rnd() * 2 - 1) * (W - 1.2), z: z - 2 - rnd() * 6, hp: P.barrelHp(p) });
        }
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
