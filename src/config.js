// ---------------------------------------------------------------------------
// Game-wide constants and balance tables.
// All speeds are in world units per second, all times in seconds.
// The track runs along -Z (forward), X is left/right.
// ---------------------------------------------------------------------------

export const TRACK = {
  HALF_WIDTH: 5,          // bridge deck half width
  SQUAD_X_LIMIT: 4.2,     // how far the squad centre may steer
  RUN_SPEED: 9,           // forward speed of the squad
  BOSS_GAP: 19,           // distance at which the squad stops in front of the boss
  SEGMENT: 30,            // spacing between generated track events
  START_Z: 0,
};

export const SQUAD = {
  START_COUNT: 4,
  MAX_VISIBLE: 120,       // instanced soldiers actually drawn
  SPACING: 0.34,          // phyllotaxis spacing of the formation
  SPREAD_X: 0.78,         // formation squash on X (keeps the crowd steerable)
  SPREAD_Z: 1.15,
  STEER_SHARPNESS: 12,    // exponential smoothing factor for X following
  KEY_STEER_SPEED: 11,    // units/s when steering with keyboard
  DRAG_SENSITIVITY: 13,   // world units per full screen width of drag
  MAX_BULLETS_PER_SEC: 110, // above this, bullets are merged (damage multiplied)
};

// Weapon evolution: the size of the squad decides the weapon of every soldier.
// rate   = shots per soldier per second
// pellets/spread = shotgun fan
export const WEAPON_TIERS = [
  {
    id: 'pistol', name: 'PISTOLS', min: 1,
    rate: 1.5, damage: 1, pellets: 1, spread: 0.02,
    speed: 42, range: 38, color: 0xffd34d, size: 0.9,
  },
  {
    id: 'rifle', name: 'ASSAULT RIFLES', min: 10,
    rate: 4.5, damage: 1.15, pellets: 1, spread: 0.035,
    speed: 52, range: 44, color: 0xff8a2a, size: 1.0,
  },
  {
    id: 'shotgun', name: 'SHOTGUNS', min: 25,
    rate: 1.25, damage: 1.25, pellets: 5, spread: 0.32,
    speed: 40, range: 30, color: 0xffe9a8, size: 0.85,
  },
  {
    id: 'plasma', name: 'PLASMA MINIGUNS', min: 50,
    rate: 10, damage: 1.35, pellets: 1, spread: 0.05,
    speed: 64, range: 50, color: 0x39f3ff, size: 1.35,
  },
];

export function tierForCount(count) {
  let tier = 0;
  for (let i = 0; i < WEAPON_TIERS.length; i++) if (count >= WEAPON_TIERS[i].min) tier = i;
  return tier;
}

export const ENEMY = {
  ACTIVATE_DIST: 58,      // enemies wake up when the squad is this close
  ZOMBIE_SPEED: 3.6,
  BRUTE_SPEED: 2.4,
  CONTACT_PAD: 0.55,
};

export const BARREL = {
  RADIUS: 0.6,
  BLAST_RADIUS: 4.2,
  BLAST_DAMAGE: 60,
  SQUAD_KILL_FRACTION: 0.6,  // share of soldiers inside the blast radius who die
};

export const POOLS = {
  BULLETS: 700,
  ENEMIES: 260,
  PARTICLES: 900,
  BOSS_SHOTS: 24,
};

// Difficulty scaling --------------------------------------------------------
export function levelParams(level) {
  const l = level - 1;
  return {
    length: 330 + l * 45,
    zombieHp: (p) => 2 + p * 7 + l * 1.6,
    waveSize: (p) => Math.round(3 + p * 17 + l * 2.5),
    bruteChance: (p) => (p > 0.35 ? 0.08 + p * 0.12 + l * 0.02 : 0),
    barrelHp: (p) => Math.round(8 + p * 30 + l * 6),
    gateBase: (p) => Math.round(5 + p * 22 + l * 2),
    bossHp: 8000 + l * 6000,
    bossAttackEvery: Math.max(1.35, 2.5 - l * 0.15),
  };
}
