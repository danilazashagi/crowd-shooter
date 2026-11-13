// ---------------------------------------------------------------------------
// Game-wide constants and balance tables.
// All speeds are in world units per second, all times in seconds.
// The track runs along -Z (forward), X is left/right.
// ---------------------------------------------------------------------------

export const TRACK = {
  HALF_WIDTH: 5,          // bridge deck half width
  SQUAD_X_LIMIT: 4.2,     // how far the squad centre may steer
  RUN_SPEED: 7.5,         // forward speed of the squad (-17% for comfortable steering)
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
// Bullets always fly STRAIGHT forward (no aim assist).
// pellets/width = parallel pellets spread sideways over `width` units (shotgun wall)
export const WEAPON_TIERS = [
  {
    id: 'pistol', name: 'PISTOLS', min: 1,
    rate: 1.5, damage: 1, pellets: 1, width: 0,
    speed: 42, range: 38, color: 0xffd34d, size: 0.9,
  },
  {
    id: 'rifle', name: 'ASSAULT RIFLES', min: 10,
    rate: 4.5, damage: 1.15, pellets: 1, width: 0,
    speed: 52, range: 44, color: 0xff8a2a, size: 1.0,
  },
  {
    id: 'shotgun', name: 'SHOTGUNS', min: 25,
    rate: 1.25, damage: 1.25, pellets: 5, width: 1.3,
    speed: 40, range: 30, color: 0xffe9a8, size: 0.85,
  },
  {
    id: 'plasma', name: 'PLASMA MINIGUNS', min: 50,
    rate: 10, damage: 1.35, pellets: 1, width: 0,
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
  MINI_SPEED: 2.0,        // mini-boss marches straight down the bridge
  MINI_SCALE: 2.4,
  LATERAL_CHASE: 0.55,    // share of sideways homing (bullets fly straight, so zombies must be dodgeable)
  CONTACT_PAD: 0.55,
};

// Shootable gate rows: bullets that hit ANY gate of a row add +1 to EVERY gate of that row
// (+17/−25 → +18/−24 → …). Each next step costs more damage (POINT_COST + gained * POINT_GROWTH)
// and is capped at MAX_POINTS_PER_SEC, so a huge squad cannot farm unlimited soldiers.
// Borders slide: a gate's width follows the MAGNITUDE of its number, so as a −N gate is shot
// toward zero it narrows and its neighbour widens (and it regrows once it turns positive).
export const GATE = {
  POINT_COST: 1.5,
  POINT_GROWTH: 0.6,
  MAX_POINTS_PER_SEC: 2.5,
  ACTIVE_DIST: 40,        // bullets change gates from far away, so the effect is visible early
  MAX_PLUS: 20,           // no gate is generated above +20
  WEIGHT_BIAS: 6,         // width weight = baseWidth * (WEIGHT_BIAS + |value|)
  MIN_WIDTH: 1.3,         // no gate gets narrower than this (world units)
  LAYOUT_SHARPNESS: 7,    // smoothing of the sliding borders
  FLASH_TIME: 0.12,       // white flash on hit
  POP_TIME: 0.16,         // vertical "pop" when the number changes
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
  // Level 2 stays gentle: content grows only a little, threat multipliers start at level 3.
  const g = l <= 1 ? l * 0.4 : l - 0.6;   // growth of HP / wave size
  const t = Math.max(0, l - 1);           // growth of speed / armour / contact damage
  return {
    length: 330 + l * 45,
    zombieHp: (p) => 2 + p * 6 + g * 3,
    waveSize: (p) => Math.round(3 + p * 13 + g * 4),
    miniHp: (p) => Math.round(250 + p * 800 + g * 1000),
    miniChance: (p) => (p > 0.2 ? 0.6 + l * 0.05 : 0),   // mini-bosses are frequent
    minMinis: 2 + Math.min(2, l),
    bruteChance: (p) => (p > 0.35 ? 0.08 + p * 0.12 + l * 0.02 : 0),
    // gentle growth: +2 … +10 on normal gates, risky narrow gates up to GATE.MAX_PLUS
    gateBase: (p) => Math.round(2 + p * 7 + l * 0.6),
    // --- per-level threat scaling ---------------------------------------
    enemySpeedMul: Math.min(1.6, 1 + t * 0.1),     // zombies & mini-bosses move faster
    enemyArmor: Math.min(0.45, t * 0.07),          // share of bullet damage absorbed
    zombieKills: 1 + Math.floor(t / 2),            // soldiers lost per zombie contact
    bruteKills: 3 + t,
    miniKills: 8 + t * 3,
    bossHp: Math.round(8000 + g * 11000),
    bossAttackEvery: Math.max(1.35, 2.5 - g * 0.15),
  };
}
