// ---------------------------------------------------------------------------
// Crowd Shooter: Math Bridge — game core.
// State machine: ready → running → boss → (win | lose)
// Every simulation step receives dt from THREE.Clock (clamped), so the game
// runs at identical speed on 60 / 144 / 165 Hz displays.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import {
  TRACK, SQUAD, WEAPON_TIERS, tierForCount, ENEMY, GATE, POOLS, levelParams,
} from './config.js';
import {
  makeSoldierGeometry, makeGunGeometries, makeZombieGeometry, makeMiniBossGeometry,
  makeBoss, GateLabel, HpLabel,
} from './models.js';
import { generateLevel } from './level.js';
import { Input } from './input.js';
import { BulletPool, ParticlePool, RingPool } from './fx.js';
import { Hud } from './hud.js';
import { crazy } from './cg-sdk.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _e = new THREE.Euler();
const WHITE = new THREE.Color(1, 1, 1);
const FLASH = new THREE.Color(2.6, 2.6, 2.6);
const BRUTE_TINT = new THREE.Color(0.95, 0.6, 1.25);

/** Frame-rate independent exponential smoothing factor. */
const damp = (k, dt) => 1 - Math.exp(-k * dt);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rand = (a, b) => a + Math.random() * (b - a);

const LANES = [-TRACK.HALF_WIDTH * 2 / 3, 0, TRACK.HALF_WIDTH * 2 / 3];
const LANE_W = (TRACK.HALF_WIDTH * 2) / 3;

class Game {
  constructor(container) {
    const params = new URLSearchParams(location.search);
    this.debug = params.has('debug');
    if (this.debug) { document.body.classList.add('debug'); window.__game = this; }
    this.timeScale = 1;

    // --- renderer / scene / camera ---------------------------------------
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x8ccaff);
    this.scene.fog = new THREE.Fog(0x8ccaff, 45, 150);

    this.camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 260);
    this.camPos = new THREE.Vector3(0, 10, 12);
    this.camLook = new THREE.Vector3(0, 0, -10);
    this.shake = 0;

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x5a6a80, 1.6));
    this.sun = new THREE.DirectionalLight(0xffffff, 2.2);
    this.sun.position.set(-6, 14, 8);
    this.scene.add(this.sun, this.sun.target);

    this._buildStaticWorld();
    this._buildActors();

    this.bullets = new BulletPool(this.scene, POOLS.BULLETS);
    this.particles = new ParticlePool(this.scene, POOLS.PARTICLES);
    this.rings = new RingPool(this.scene, 12);

    this.hud = new Hud();
    this.input = new Input(this.renderer.domElement);
    this.input.on('first', () => { if (this.state === 'ready') this.startRun(); });
    this.input.on('action', () => this.onAction());

    this.clock = new THREE.Clock();
    this.time = 0;
    this.fpsFrames = 0; this.fpsTime = 0;

    window.addEventListener('resize', () => this.onResize());
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.clock.getDelta(); });
    this.onResize();

    this.level = 1;
    this.loadLevel(this.level);
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // =========================================================================
  // World construction
  // =========================================================================
  _buildStaticWorld() {
    // Water
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 400),
      new THREE.MeshLambertMaterial({ color: 0x2f8fe0 }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = -7;
    this.scene.add(water);
    this.water = water;

    // Bridge deck texture (lanes + edge stripes), repeated along Z
    const c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#5d6470'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#666e7b'; for (let i = 0; i < 40; i++) g.fillRect(Math.random() * 128, Math.random() * 128, 3, 3);
    g.fillStyle = '#e8e8e8'; g.fillRect(41, 0, 3, 64); g.fillRect(84, 0, 3, 64);
    g.fillStyle = '#ffcc33'; g.fillRect(0, 0, 6, 128); g.fillRect(122, 0, 6, 128);
    this.deckTex = new THREE.CanvasTexture(c);
    this.deckTex.wrapS = THREE.RepeatWrapping;
    this.deckTex.wrapT = THREE.RepeatWrapping;
    this.deckTex.colorSpace = THREE.SRGBColorSpace;
    this.deckTex.anisotropy = 4;
    this.deckMat = new THREE.MeshLambertMaterial({ map: this.deckTex });
    this.railMat = new THREE.MeshLambertMaterial({ color: 0xd8dde6 });
    this.pylonMat = new THREE.MeshLambertMaterial({ color: 0xc8463a });

    this.levelRoot = new THREE.Group();
    this.scene.add(this.levelRoot);

    // Gate shared parts
    this.gatePostGeo = new THREE.BoxGeometry(0.2, 2.9, 0.2);
    this.gatePostGeo.translate(0, 1.45, 0);
    this.gatePanelGeo = new THREE.PlaneGeometry(1, 2.2);   // scaled to the gate width each frame
    this.gatePanelGeo.translate(0, 1.25, 0);
    this.gateLabelGeo = new THREE.PlaneGeometry(1, 0.5);   // fixed 2:1 aspect for the number

    // Boss telegraph helpers
    const tGeo = new THREE.PlaneGeometry(1, 1);
    tGeo.rotateX(-Math.PI / 2);
    this.telegraphs = [];
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(tGeo, new THREE.MeshBasicMaterial({ color: 0xff2030, transparent: true, opacity: 0, depthWrite: false }));
      m.visible = false;
      m.renderOrder = 1;
      this.scene.add(m);
      this.telegraphs.push({ mesh: m, t: 0, dur: 1, active: false, x0: 0, x1: 0 });
    }
    const markGeo = new THREE.CircleGeometry(1, 24);
    markGeo.rotateX(-Math.PI / 2);
    const orbGeo = new THREE.SphereGeometry(0.45, 10, 8);
    this.orbs = [];
    for (let i = 0; i < 8; i++) {
      const marker = new THREE.Mesh(markGeo, new THREE.MeshBasicMaterial({ color: 0xff3020, transparent: true, opacity: 0.4, depthWrite: false }));
      const orb = new THREE.Mesh(orbGeo, new THREE.MeshBasicMaterial({ color: 0xff7a1a, toneMapped: false }));
      marker.visible = orb.visible = false;
      this.scene.add(marker, orb);
      this.orbs.push({ marker, orb, active: false, t: 0, dur: 1, sx: 0, sz: 0, tx: 0, tz: 0 });
    }
  }

  _buildActors() {
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.actorMat = mat;
    // Squad
    this.soldierMesh = new THREE.InstancedMesh(makeSoldierGeometry(), mat, SQUAD.MAX_VISIBLE);
    this.gunGeos = makeGunGeometries();
    this.gunMesh = new THREE.InstancedMesh(this.gunGeos[0], mat, SQUAD.MAX_VISIBLE);
    for (const m of [this.soldierMesh, this.gunMesh]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.count = 0;
      this.scene.add(m);
    }
    // Formation: phyllotaxis (sunflower) offsets, squashed on X
    const N = SQUAD.MAX_VISIBLE;
    this.formX = new Float32Array(N); this.formZ = new Float32Array(N);
    this.sx = new Float32Array(N); this.sz = new Float32Array(N);  // current local offsets (smoothed)
    for (let i = 0; i < N; i++) {
      const r = SQUAD.SPACING * Math.sqrt(i + (i ? 0.5 : 0));
      const a = i * 2.39996323;
      this.formX[i] = Math.cos(a) * r * SQUAD.SPREAD_X;
      this.formZ[i] = Math.sin(a) * r * SQUAD.SPREAD_Z;
    }

    // Zombies (one InstancedMesh; brutes are scaled + tinted instances)
    this.zombieMesh = new THREE.InstancedMesh(makeZombieGeometry(), mat, POOLS.ENEMIES);
    this.zombieMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.zombieMesh.setColorAt(0, WHITE);
    this.zombieMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.zombieMesh.frustumCulled = false;
    this.zombieMesh.count = 0;
    this.scene.add(this.zombieMesh);

    // Mini-bosses: own armoured skin, drawn larger
    this.miniMesh = new THREE.InstancedMesh(makeMiniBossGeometry(), mat, 8);
    this.miniMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.miniMesh.setColorAt(0, WHITE);
    this.miniMesh.frustumCulled = false;
    this.miniMesh.count = 0;
    this.scene.add(this.miniMesh);

    // Floating HP bars for mini-bosses (camera-facing billboards)
    const barBg = new THREE.PlaneGeometry(2.4, 0.3);
    const barFill = new THREE.PlaneGeometry(1, 0.2);
    barFill.translate(0.5, 0, 0);   // anchored at its left edge
    this.hpBars = [];
    for (let i = 0; i < 4; i++) {
      const g = new THREE.Group();
      const bg = new THREE.Mesh(barBg, new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.75, depthTest: false }));
      const fill = new THREE.Mesh(barFill, new THREE.MeshBasicMaterial({ color: 0xff3040, transparent: true, depthTest: false, toneMapped: false }));
      fill.position.set(-1.15, 0, 0.001);
      bg.renderOrder = 10; fill.renderOrder = 11;
      g.add(bg, fill);
      const hpText = new HpLabel();
      hpText.sprite.position.set(0, 0.55, 0);
      g.add(hpText.sprite);
      g.visible = false;
      g.userData.fill = fill;
      g.userData.hpText = hpText;
      this.scene.add(g);
      this.hpBars.push(g);
    }

    // Boss
    this.bossObj = makeBoss();
    this.bossObj.traverse((o) => { if (o.isMesh) o.material = o.material.clone(); });
    this.bossMats = [];
    this.bossObj.traverse((o) => { if (o.isMesh) this.bossMats.push(o.material); });
    this.scene.add(this.bossObj);
  }

  _disposeLevel() {
    for (const d of this.levelDisposables || []) d.dispose();
    this.levelDisposables = [];
    this.levelRoot.clear();
  }

  loadLevel(level) {
    this._disposeLevel();
    const L = generateLevel(level);
    this.layout = L;
    this.params = levelParams(level);
    const len = L.length + TRACK.BOSS_GAP + 40;

    // Deck
    const deckGeo = new THREE.BoxGeometry(TRACK.HALF_WIDTH * 2 + 0.4, 0.6, len + 40);
    this.levelDisposables.push(deckGeo);
    const tex = this.deckTex;
    tex.repeat.set(1, (len + 40) / 6);
    const deck = new THREE.Mesh(deckGeo, this.deckMat);
    deck.position.set(0, -0.3, -len / 2 + 20);
    this.levelRoot.add(deck);
    // Rails
    const railGeo = new THREE.BoxGeometry(0.25, 0.7, len + 40);
    this.levelDisposables.push(railGeo);
    for (const sx of [-1, 1]) {
      const rail = new THREE.Mesh(railGeo, this.railMat);
      rail.position.set(sx * (TRACK.HALF_WIDTH + 0.3), 0.35, -len / 2 + 20);
      this.levelRoot.add(rail);
    }
    // Pylons (instanced) every 45 units
    const pylonGeo = new THREE.BoxGeometry(0.9, 14, 0.9);
    this.levelDisposables.push(pylonGeo);
    const pylonCount = Math.ceil(len / 45) * 2;
    const pylons = new THREE.InstancedMesh(pylonGeo, this.pylonMat, pylonCount);
    this.levelDisposables.push(pylons);
    for (let i = 0; i < pylonCount; i++) {
      const side = i % 2 ? 1 : -1;
      _m.makeTranslation(side * (TRACK.HALF_WIDTH + 1.4), 0, -((i >> 1) * 45) - 10);
      pylons.setMatrixAt(i, _m);
    }
    this.levelRoot.add(pylons);

    // Gates. PAIR rows: two gates edge to edge sharing one movable wall (dividerX).
    // WALL rows: a single gate across the whole bridge. Every gate = translucent panel + label;
    // posts belong to the row (left edge, right edge, shared divider).
    const W = TRACK.HALF_WIDTH;
    this.rows = L.rows.map((r) => {
      const row = {
        z: r.z, type: r.type, done: false, gates: [], group: new THREE.Group(),
        dividerX: r.type === 'pair' ? r.divider : W, dividerTarget: r.type === 'pair' ? r.divider : W,
      };
      const mk = () => {
        const m = new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true });
        this.levelDisposables.push(m);
        const mesh = new THREE.Mesh(this.gatePostGeo, m);
        mesh.position.z = r.z;
        row.group.add(mesh);
        return mesh;
      };
      row.postL = mk(); row.postR = mk();
      row.postL.position.x = -W + 0.06; row.postR.position.x = W - 0.06;
      if (r.type === 'pair') {
        row.postMid = mk();
        row.postMid.material.color.setHex(0xeaf6ff);   // the shared wall glows white
        row.postMid.scale.x = 1.4;
      }
      return row;
    });
    for (const gd of L.gates) {
      const row = this.rows[gd.row];
      const label = new GateLabel(gd.value);
      const panelMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false });
      const labelMat = new THREE.MeshBasicMaterial({ map: label.texture, transparent: true, depthWrite: false });
      this.levelDisposables.push(label, panelMat, labelMat);
      const panel = new THREE.Mesh(this.gatePanelGeo, panelMat);
      const text = new THREE.Mesh(this.gateLabelGeo, labelMat);
      text.renderOrder = 2;
      panel.position.z = gd.z;
      row.group.add(panel, text);
      const g = {
        value: gd.value, alive: true, fade: 1, side: row.gates.length,   // side 0 = left, 1 = right
        x0: 0, x1: 0, x: 0, width: 0, vx0: 0, vx1: 0,                    // hitbox / visual ranges
        charge: 0, gained: 0, cd: 0, spring: 0, springV: 0, flash: 0, sign: 0,
        panel, text, label, panelMat, labelMat,
      };
      this._paintGate(g);
      row.gates.push(g);
    }
    for (const row of this.rows) {
      this.levelRoot.add(row.group);
      this._updateRowRanges(row);
      this._placeRow(row);
    }

    // Enemies
    this.enemies = L.enemies.map((e) => ({
      x: e.x, z: e.z, hp: e.hp, maxHp: e.hp, brute: e.brute, mini: e.mini, alive: true, active: false,
      flash: 0, phase: Math.random() * 6.28, yaw: 0,
    }));

    // Boss
    this.boss = {
      hp: this.params.bossHp, maxHp: this.params.bossHp, x: 0, z: L.bossZ, alive: true,
      attackTimer: 2.2, enraged: false, flash: 0, slamAnim: 0, deathT: 0,
    };
    this.bossObj.position.set(0, 0, L.bossZ);
    this.bossObj.rotation.set(0, 0, 0);
    this.bossObj.scale.setScalar(1);
    this.bossObj.visible = true;
    for (const t of this.telegraphs) { t.active = false; t.mesh.visible = false; }
    for (const o of this.orbs) { o.active = false; o.orb.visible = o.marker.visible = false; }

    // Squad
    this.count = SQUAD.START_COUNT;
    this.squadX = 0; this.targetX = 0; this.squadZ = TRACK.START_Z;
    this.tier = tierForCount(this.count);
    this.gunMesh.geometry = this.gunGeos[this.tier];
    this.shotAcc = 0;
    this.visible = 0;
    this._syncVisible(true);

    this.bullets.clear(); this.particles.clear(); this.rings.clear();
    this.state = this.state === undefined ? 'ready' : this.state;
    this.hud.setLevel(level);
    this.hud.showBoss(false);
    this.hud.setBoss(this.boss.hp, this.boss.maxHp);
    this.hud.overlay(false);
    this.camPos.set(0, 10.5, this.squadZ + 11.5);
    this.camLook.set(0, 0, this.squadZ - 10);
  }

  // =========================================================================
  // Flow
  // =========================================================================
  startRun() {
    this.state = 'running';
    this.hud.hint(false);
    this.announceLevel();
    crazy.gameplayStart();
  }

  onAction() {
    if ((this.state === 'win' || this.state === 'lose') && this.overlayDelay <= 0) {
      if (this.state === 'win') this.level++;
      this.loadLevel(this.level);
      this.announceLevel();
      this.state = 'running';
      crazy.gameplayStart();
    }
  }

  /** From level 2 on, tell the player how much tougher the horde got. */
  announceLevel() {
    if (this.level < 2) return;
    const P = this.params;
    const speed = Math.round((P.enemySpeedMul - 1) * 100);
    const armor = Math.round(P.enemyArmor * 100);
    this.hud.toast(`LEVEL ${this.level}: HORDE +${speed}% SPEED · ${armor}% ARMOR`, 'bad');
  }

  win() {
    this.state = 'win';
    this.overlayDelay = 0.9;
    crazy.gameplayStop();
    crazy.happytime();
    this.hud.showBoss(false);
    this.hud.overlay(true, 'LEVEL COMPLETE!', `Boss destroyed with ${this.count} soldiers left`, 'Tap / press any key to continue', 'win');
  }

  lose(reason) {
    if (this.state === 'lose') return;
    this.state = 'lose';
    this.count = 0;
    this.overlayDelay = 0.9;
    crazy.gameplayStop();
    this.hud.showBoss(false);
    this.hud.overlay(true, 'SQUAD LOST', reason, 'Tap / press any key to retry', 'lose');
  }

  // =========================================================================
  // Main loop
  // =========================================================================
  frame() {
    const raw = Math.min(this.clock.getDelta(), 0.05);
    const dt = raw * this.timeScale;
    this.time += dt;

    if (this.debug) {
      this.fpsFrames++; this.fpsTime += raw;
      if (this.fpsTime >= 0.5) { this.fps = Math.round(this.fpsFrames / this.fpsTime); this.hud.setFps(this.fps); this.fpsFrames = 0; this.fpsTime = 0; }
    }

    if (this.state === 'running' || this.state === 'boss') this.updateSteering(dt);
    if (this.state === 'running') this.updateRun(dt);
    this.updateGates(dt);
    if (this.state === 'running' || this.state === 'boss') {
      this.updateShooting(dt);
      this.updateEnemies(dt);
    }
    if (this.state === 'boss') this.updateBoss(dt);
    if (this.state === 'win' || this.state === 'lose') this.overlayDelay -= raw;
    this.updateBossVisual(dt);
    this.updateBossProjectiles(dt);

    this.bullets.update(dt, (i) => this.bulletHit(i, dt));
    this.particles.update(dt);
    this.rings.update(dt);
    this.hud.update(raw);

    this.renderSquad(dt);
    this.renderEnemies();
    this.bullets.render();
    this.particles.render();
    this.updateCamera(dt);
    this.updateHud();
    this.renderer.render(this.scene, this.camera);
  }

  // =========================================================================
  // Squad
  // =========================================================================
  get radiusX() { return SQUAD.SPACING * Math.sqrt(this.visible) * SQUAD.SPREAD_X + 0.3; }
  get radiusZ() { return SQUAD.SPACING * Math.sqrt(this.visible) * SQUAD.SPREAD_Z + 0.3; }

  updateSteering(dt) {
    const drag = this.input.consumeDrag();
    this.targetX += drag * SQUAD.DRAG_SENSITIVITY;
    this.targetX += this.input.axis * SQUAD.KEY_STEER_SPEED * dt;
    this.targetX = clamp(this.targetX, -TRACK.SQUAD_X_LIMIT, TRACK.SQUAD_X_LIMIT);
    this.squadX += (this.targetX - this.squadX) * damp(SQUAD.STEER_SHARPNESS, dt);
  }

  updateRun(dt) {
    const prevZ = this.squadZ;
    this.squadZ -= TRACK.RUN_SPEED * dt;
    // Gates
    for (const row of this.rows) {
      if (row.done || !(prevZ > row.z && this.squadZ <= row.z)) continue;
      row.done = true;
      // the squad centre decides: which living gate's range contains it (ranges follow dividerX)
      let best = null;
      for (const g of row.gates) if (g.alive && this.squadX >= g.x0 && this.squadX <= g.x1) best = g;
      if (!best) best = row.gates.find((g) => g.alive);
      this.applyGate(best, row);
    }
    // Arrive at the boss arena
    if (this.squadZ <= -this.layout.length) {
      this.squadZ = -this.layout.length;
      this.state = 'boss';
      this.hud.showBoss(true, 'MECHA-ZOMBIE TANK');
      this.hud.toast('BOSS FIGHT!', 'bad');
    }
  }

  /** Colour a gate by sign: blue panel for plus, red for minus. */
  _paintGate(g) {
    const sign = g.value >= 0 ? 1 : -1;
    if (sign === g.sign) return;
    g.sign = sign;
    g.baseColor = new THREE.Color(sign > 0 ? 0x1e7bff : 0xff2448);
    g.panelMat.color.copy(g.baseColor);
  }

  /** The other (living) gate of a pair row, or null. */
  _neighbour(row, g) {
    if (row.type !== 'pair') return null;
    const o = row.gates[1 - g.side];
    return o && o.alive ? o : null;
  }

  /**
   * Hitbox ranges from the LIVE dividerX: left [-W, dividerX), right [dividerX, W].
   * A crushed neighbour hands its space over immediately.
   */
  _updateRowRanges(row) {
    const W = TRACK.HALF_WIDTH;
    for (const g of row.gates) {
      if (row.type === 'wall') { g.x0 = -W; g.x1 = W; continue; }
      const other = row.gates[1 - g.side];
      const full = !other.alive;
      if (g.side === 0) { g.x0 = -W; g.x1 = full ? W : row.dividerX; }
      else { g.x0 = full ? -W : row.dividerX; g.x1 = W; }
      g.x = (g.x0 + g.x1) / 2;
      g.width = g.x1 - g.x0;
    }
    if (row.type === 'wall') { const g = row.gates[0]; g.x = 0; g.width = 2 * W; }
  }

  /** Lay out meshes: panels span [vx0, vx1] (smoothed), labels centred in each half. */
  _placeRow(row) {
    const W = TRACK.HALF_WIDTH;
    const [a, b] = row.gates;
    for (const g of row.gates) {
      // visual edges follow the smoothed divider; a dying gate collapses toward its edge
      if (row.type === 'wall') { g.vx0 = -W; g.vx1 = W; }
      else if (g.side === 0) { g.vx0 = -W; g.vx1 = row.dividerX; }
      else { g.vx0 = row.dividerX; g.vx1 = W; }
      // HEIGHT IS FIXED: only the width follows the wall; the hit impulse is a horizontal squash
      const w = Math.max(0, g.vx1 - g.vx0);
      g.panel.visible = g.text.visible = g.fade > 0.02 && w > 0.05;
      g.panel.position.x = (g.vx0 + g.vx1) / 2;
      g.panel.scale.set(Math.max(0.01, (w - 0.14) * (1 + g.spring * GATE.PULSE_X)), 1, 1);
      // label stays inside the fixed-height panel (max 1.9 tall, centred at 1.35 → top ≤ 2.3)
      const lw = Math.min(Math.min(w * 0.96, 3.8) * (1 + g.spring * 0.15), 3.8);
      g.text.position.set(g.panel.position.x, 1.35, row.z + 0.03);
      g.text.scale.set(Math.max(0.01, lw), Math.max(0.01, lw), 1);
      g.labelMat.opacity = g.fade;
    }
    // posts: edges take the colour of the gate touching them, the shared wall sits at dividerX
    const left = row.type === 'wall' || a.alive || !b ? a : b;
    const right = row.type === 'wall' ? a : (b && b.alive ? b : a);
    const neon = (g) => (g.value >= 0 ? 0x5ff4ff : 0xff4fd8);
    row.postL.material.color.setHex(neon(left));
    row.postR.material.color.setHex(neon(right));
    if (row.postMid) {
      const show = a.alive && b.alive ? 1 : Math.min(a.fade, b.fade);
      row.postMid.visible = show > 0.02;
      row.postMid.material.opacity = show;
      row.postMid.position.x = row.dividerX;
    }
  }

  /**
   * Per-frame, dt-driven gate animation:
   *  - dividerX lerps toward dividerTarget (THREE.MathUtils.lerp, exponential factor),
   *  - gate HEIGHT never changes; a damped spring adds a small horizontal "boing" on hits,
   *  - flashes fade, crushed gates fade out.
   */
  updateGates(dt) {
    const kDiv = 1 - Math.exp(-GATE.DIVIDER_SHARPNESS * dt);
    const kFade = 1 - Math.exp(-GATE.FADE_SHARPNESS * dt);
    const steps = Math.max(1, Math.ceil(dt / 0.016));
    const h = dt / steps;
    for (const row of this.rows) {
      if (row.z > this.squadZ + 15 || row.z < this.squadZ - 120) continue;
      row.dividerX = THREE.MathUtils.lerp(row.dividerX, row.dividerTarget, kDiv);
      for (const g of row.gates) {
        if (g.cd > 0) g.cd -= dt;
        if (g.flash > 0) g.flash = Math.max(0, g.flash - dt);
        g.fade = THREE.MathUtils.lerp(g.fade, g.alive ? 1 : 0, kFade);
        for (let i = 0; i < steps; i++) {
          g.springV += (-GATE.SPRING_K * g.spring - GATE.SPRING_DAMP * g.springV) * h;
          g.spring += g.springV * h;
        }
        const f = g.flash / GATE.FLASH_TIME;
        g.panelMat.color.copy(g.baseColor).lerp(WHITE, f * 0.85);
        g.panelMat.opacity = ((row.done ? (g.chosen ? 0.12 : 0.3) : 0.6) + f * 0.3) * g.fade;
      }
      this._updateRowRanges(row);
      this._placeRow(row);
    }
  }

  applyGate(gate, row) {
    const before = this.count;
    this.count = Math.max(0, this.count + gate.value);
    gate.chosen = true;
    const color = gate.value >= 0 ? [0x4ad2ff, 0xffffff, 0x2f7bff] : [0xff3b4a, 0xffffff];
    this.particles.burst(gate.x, 1.4, row.z, 26, color, 6, 1, 0.7);
    _v.set(this.squadX, 2.5, this.squadZ).project(this.camera);
    this.hud.popup((gate.value >= 0 ? '+' : '−') + Math.abs(gate.value), (_v.x * 0.5 + 0.5) * innerWidth, (-_v.y * 0.5 + 0.5) * innerHeight - 30, gate.value >= 0);
    if (this.count <= 0) { this._syncVisible(); this.lose('The gate math went negative…'); return; }
    if (gate.value < 0) this._killVisual(before);
    this.onCountChanged();
  }

  /** Remove `n` soldiers. `zoneFn(worldX, worldZ)` (optional) limits death particles to a zone. */
  loseSoldiers(n, reason = 'Your squad was overrun!') {
    if (n <= 0 || this.state === 'lose' || this.state === 'win') return;
    const before = this.count;
    this.count = Math.max(0, this.count - n);
    this._killVisual(before);
    if (this.count <= 0) { this.lose(reason); return; }
    this.onCountChanged();
  }

  _killVisual(before) {
    const oldVis = Math.min(before, SQUAD.MAX_VISIBLE);
    const newVis = Math.min(this.count, SQUAD.MAX_VISIBLE);
    let k = 0;
    for (let i = newVis; i < oldVis && k < 30; i++, k++) {
      const x = clamp(this.squadX + this.sx[i], -TRACK.HALF_WIDTH + 0.3, TRACK.HALF_WIDTH - 0.3);
      this.particles.burst(x, 0.7, this.squadZ + this.sz[i], 4, [0x2f7bff, 0x1a3a8a, 0xff3030], 4, 0.9, 0.6);
    }
    this._syncVisible();
  }

  onCountChanged() {
    this._syncVisible();
    const t = tierForCount(this.count);
    if (t !== this.tier) {
      const up = t > this.tier;
      this.tier = t;
      this.gunMesh.geometry = this.gunGeos[t];
      const W = WEAPON_TIERS[t];
      this.hud.toast(up ? W.name + '!' : 'DOWNGRADE: ' + W.name, up ? 't' + t : 'bad');
      if (up) {
        this.particles.burst(this.squadX, 1, this.squadZ, 40, [W.color, 0xffffff], 7, 1.1, 0.9);
        this.rings.spawn(this.squadX, this.squadZ, 6, W.color, 0.6);
      }
    }
  }

  _syncVisible(reset = false) {
    const vis = Math.min(this.count, SQUAD.MAX_VISIBLE);
    for (let i = this.visible; i < vis; i++) {
      // new recruits run in from behind
      this.sx[i] = reset ? this.formX[i] : this.formX[i] * 0.3;
      this.sz[i] = reset ? this.formZ[i] : this.formZ[i] + 3;
    }
    this.visible = vis;
  }

  /** Fraction of visible soldiers whose world position satisfies `test`. */
  fractionWhere(test) {
    if (!this.visible) return 0;
    let n = 0;
    for (let i = 0; i < this.visible; i++) {
      const x = clamp(this.squadX + this.sx[i], -TRACK.HALF_WIDTH + 0.3, TRACK.HALF_WIDTH - 0.3);
      if (test(x, this.squadZ + this.sz[i])) n++;
    }
    return n / this.visible;
  }

  renderSquad(dt) {
    const k = damp(9, dt);
    const running = this.state === 'running';
    const lim = TRACK.HALF_WIDTH - 0.3;
    for (let i = 0; i < this.visible; i++) {
      this.sx[i] += (this.formX[i] - this.sx[i]) * k;
      this.sz[i] += (this.formZ[i] - this.sz[i]) * k;
      const x = clamp(this.squadX + this.sx[i], -lim, lim);
      const ph = this.time * (running ? 14 : 6) + i * 1.7;
      const bob = running ? Math.abs(Math.sin(ph)) * 0.1 : 0;
      _v.set(x, bob, this.squadZ + this.sz[i]);
      _e.set(running ? -0.12 : 0, (this.squadX - this.targetX) * 0.08, running ? Math.sin(ph) * 0.06 : 0);
      _q.setFromEuler(_e);
      _s.set(1, 1, 1);
      _m.compose(_v, _q, _s);
      this.soldierMesh.setMatrixAt(i, _m);
      this.gunMesh.setMatrixAt(i, _m);
    }
    this.soldierMesh.count = this.gunMesh.count = this.visible;
    this.soldierMesh.instanceMatrix.needsUpdate = true;
    this.gunMesh.instanceMatrix.needsUpdate = true;
  }

  // =========================================================================
  // Shooting
  // =========================================================================
  /** Every soldier fires STRAIGHT forward: no aim assist, no curving. */
  updateShooting(dt) {
    if (this.count <= 0 || this.visible === 0) return;
    const W = WEAPON_TIERS[this.tier];
    const shotsPerSec = this.count * W.rate;
    const maxShots = SQUAD.MAX_BULLETS_PER_SEC / W.pellets;
    const emitRate = Math.min(shotsPerSec, maxShots);
    const dmgMul = shotsPerSec / emitRate;   // merged bullets carry the damage of several shots
    this.shotAcc += emitRate * dt;
    let shots = Math.floor(this.shotAcc);
    this.shotAcc -= shots;
    if (!shots) return;
    const life = W.range / W.speed;
    const lim = TRACK.HALF_WIDTH - 0.3;
    while (shots-- > 0) {
      const i = (Math.random() * this.visible) | 0;
      const x = clamp(this.squadX + this.sx[i], -lim, lim) + 0.14;
      const z = this.squadZ + this.sz[i] - 0.9;
      for (let p = 0; p < W.pellets; p++) {
        // shotgun: a wall of parallel pellets side by side
        const off = W.pellets > 1 ? (p / (W.pellets - 1) - 0.5) * W.width : 0;
        this.bullets.spawn(x + off, 0.78, z, 0, -W.speed,
          life * (W.pellets > 1 ? rand(0.8, 1) : 1), W.damage * dmgMul, W.color, W.size);
      }
    }
  }

  /**
   * Swept hit test: the bullet moved from (ax,az) to (bx,bz) this frame, so fast
   * bullets cannot tunnel through targets even at low frame rates.
   */
  bulletHit(i, dt) {
    const B = this.bullets;
    const bx = B.x[i], bz = B.z[i], dmg = B.dmg[i];
    const ax = bx - B.vx[i] * dt, az = bz - B.vz[i] * dt;
    const sdx = bx - ax, sdz = bz - az;
    const len2 = sdx * sdx + sdz * sdz || 1e-6;
    const dist2 = (px, pz) => {
      let t = ((px - ax) * sdx + (pz - az) * sdz) / len2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = ax + sdx * t - px, qz = az + sdz * t - pz;
      return qx * qx + qz * qz;
    };
    // Boss (big box: front face crossing is enough)
    const boss = this.boss;
    if (boss.alive && bz < boss.z + 2.6 && az > boss.z - 2.5 && Math.abs(bx - boss.x) < 3.4) {
      this.damageBoss(dmg, bx, boss.z + 2.4);
      return true;
    }
    // Gates: the bullet must cross the gate's Z plane this frame, and its X at the crossing
    // must lie inside that gate's own slot [x0, x1). Only that one gate is affected.
    for (const row of this.rows) {
      if (row.done || !(az >= row.z && bz < row.z) || this.squadZ - row.z > GATE.ACTIVE_DIST) continue;
      const t = (az - row.z) / (az - bz || 1e-6);          // fraction of the step at the plane
      const cx = ax + (bx - ax) * t;
      for (const g of row.gates) {
        if (g.alive && cx >= g.x0 && cx < g.x1) { this.hitGate(row, g, dmg, cx); return true; }
      }
    }
    // Enemies
    for (const e of this.enemies) {
      if (!e.alive || Math.abs(e.z - bz) > 4) continue;
      const r = e.mini ? 1.25 : e.brute ? 0.85 : 0.55;
      if (dist2(e.x, e.z) < r * r) {
        this.damageEnemy(e, dmg);
        return true;
      }
    }
    return false;
  }

  /** Step a gate's number by +1 and give it visual feedback. */
  _bumpGate(g, impulse) {
    g.value += 1;
    g.gained++;
    g.label.set(g.value);
    this._paintGate(g);
    g.flash = GATE.FLASH_TIME;
    g.springV += impulse * (g.value === 0 ? 1.6 : 1);   // extra boing when − flips to +
  }

  /**
   * A bullet hit gate `g` (inside its live hitbox). Damage charges the gate; each point:
   *  - g +1 and widens: the shared wall is pushed toward the neighbour;
   *  - if g was PLUS and the neighbour is MINUS, the neighbour also moves +1 toward zero,
   *    and is crushed (vanishes) once it reaches 0 or is squeezed to MIN_WIDTH.
   */
  hitGate(row, g, dmg, bx) {
    g.flash = Math.max(g.flash, GATE.FLASH_TIME * 0.6);
    g.springV += GATE.HIT_IMPULSE;
    const wall = row.type === 'wall';
    const cost = GATE.POINT_COST + g.gained * (wall ? GATE.WALL_POINT_GROWTH : GATE.POINT_GROWTH);
    g.charge = Math.min(g.charge + dmg, cost * 2);
    if (g.cd > 0 || g.charge < cost) return;
    g.charge -= cost;
    g.cd = 1 / (wall ? GATE.WALL_POINTS_PER_SEC : GATE.MAX_POINTS_PER_SEC);
    const wasPlus = g.value > 0;
    this._bumpGate(g, GATE.POINT_IMPULSE);
    this.particles.burst(bx, 1.4, row.z, 3, g.value >= 0 ? [0x8ff0ff, 0xffffff] : [0xff9ad8, 0xffffff], 3, 0.5, 0.35);

    const other = this._neighbour(row, g);
    if (!other) return;
    // push the shared wall toward the neighbour
    const W = TRACK.HALF_WIDTH;
    const dir = g.side === 0 ? 1 : -1;
    const lo = -W + GATE.MIN_WIDTH, hi = W - GATE.MIN_WIDTH;
    row.dividerTarget = clamp(row.dividerTarget + dir * GATE.DIVIDER_STEP, lo, hi);
    if (wasPlus && other.value < 0) {
      this._bumpGate(other, GATE.POINT_IMPULSE * 0.6);
      const squeezed = dir > 0 ? row.dividerTarget >= hi : row.dividerTarget <= lo;
      if (other.value >= 0 || squeezed) this._crushGate(row, g, other);
    }
  }

  /** The neighbour minus gate is pushed off the bridge: winner takes the full width. */
  _crushGate(row, winner, loser) {
    loser.alive = false;
    row.dividerTarget = winner.side === 0 ? TRACK.HALF_WIDTH : -TRACK.HALF_WIDTH;
    winner.springV += GATE.POINT_IMPULSE * 1.5;
    this.particles.burst(loser.x, 1.4, row.z, 24, [0xff4fd8, 0xff2448, 0xffffff], 6, 0.9, 0.6);
    this.rings.spawn(loser.x, row.z, 3, 0xff4fd8, 0.4);
  }

  damageEnemy(e, dmg) {
    e.hp -= dmg * (1 - this.params.enemyArmor);   // armour grows every level
    e.flash = 0.07;
    e.active = true;
    if (e.hp <= 0) {
      e.alive = false;
      if (e.mini) {
        for (let k = 0; k < 3; k++) this.particles.burst(e.x + rand(-0.8, 0.8), rand(0.8, 2.5), e.z, 18, [0xc2373a, 0x59616e, 0xffc23a, 0xfff04a], 7, 1.4, 0.9);
        this.rings.spawn(e.x, e.z, 5, 0xffc23a, 0.5);
        this.shake = Math.max(this.shake, 0.5);
        return;
      }
      this.particles.burst(e.x, 0.8, e.z, e.brute ? 14 : 6, [0x7fbf4a, 0x9a2a2a, 0x4a3f36], e.brute ? 6 : 4.5, e.brute ? 1.3 : 0.9, 0.6);
    }
  }

  // =========================================================================
  // Enemies
  // =========================================================================
  /**
   * Enemy movement rules:
   *  - everyone only ever moves FORWARD along +Z (toward the squad / camera), never turns back;
   *  - while an enemy is IN FRONT of the squad it steers sideways toward the squad centre
   *    (mini-bosses aggressively, to block the lane and force a fight);
   *  - contact is frontal: crossing the squad's front line inside its width costs soldiers at once
   *    (swept check, so fast enemies can't skip through on a slow frame);
   *  - anything that slips past the squad's back line keeps running past the camera and despawns.
   */
  updateEnemies(dt) {
    const sx = this.squadX, sz = this.squadZ;
    const rx = this.radiusX + ENEMY.CONTACT_PAD, rz = this.radiusZ;
    const front = sz - rz - ENEMY.CONTACT_PAD;          // squad front line (enemies come from −Z)
    const back = sz + rz;                               // squad back line
    const P = this.params;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (e.flash > 0) e.flash -= dt;
      if (!e.active) {
        if (e.z > sz - ENEMY.ACTIVATE_DIST) e.active = true;
        else continue;
      }
      const prevZ = e.z;
      const ahead = e.z < back;                        // still in front of / inside the squad
      const dx = sx - e.x, dz = sz - e.z;
      if (e.mini) {
        e.z += ENEMY.MINI_SPEED * P.enemySpeedMul * dt;
        if (ahead) {
          // block the squad's path: track where the player is steering, fast sideways step
          const aim = (this.targetX + sx) * 0.5 - e.x;
          e.x += clamp(aim * 3, -1, 1) * ENEMY.MINI_LATERAL * P.enemySpeedMul * dt;
        }
      } else {
        const lunge = ahead && dz < ENEMY.LUNGE_DIST ? ENEMY.LUNGE_MUL : 1;   // final sprint
        const sp = (e.brute ? ENEMY.BRUTE_SPEED : ENEMY.ZOMBIE_SPEED) * P.enemySpeedMul * lunge;
        e.z += sp * dt;                                  // always forward, never back
        if (ahead) e.x += clamp(dx * 2, -1, 1) * sp * ENEMY.LATERAL_CHASE * dt;
      }
      e.x = clamp(e.x, -TRACK.HALF_WIDTH + 0.4, TRACK.HALF_WIDTH - 0.4);
      e.yaw = ahead ? Math.atan2(dx, Math.max(dz, 1)) : 0;

      // frontal contact: the enemy reached the squad (crossed the front line this frame or is
      // inside the crowd's footprint) within the squad's width
      const pad = e.mini ? 0.9 : 0;
      const inWidth = Math.abs(e.x - sx) < rx + pad;
      const reached = e.z >= front - pad && prevZ < back;
      if (inWidth && reached) {
        e.alive = false;
        this.particles.burst(e.x, 0.8, e.z, e.mini ? 30 : 8, [0x7fbf4a, 0x9a2a2a, 0xc2373a], 4, 1, 0.5);
        if (e.mini) this.shake = Math.max(this.shake, 0.6);
        this.loseSoldiers(e.mini ? P.miniKills : e.brute ? P.bruteKills : P.zombieKills,
          e.mini ? 'The mini-boss trampled your squad.' : 'The zombie horde broke through.');
        if (this.state === 'lose') return;
        continue;
      }
      // slipped past the squad: no U-turn, run on past the camera and despawn
      if (e.z > sz + ENEMY.DESPAWN_BEHIND) e.alive = false;
    }
  }

  renderEnemies() {
    const mesh = this.zombieMesh, miniMesh = this.miniMesh;
    let n = 0, m = 0, bars = 0;
    const near = this.squadZ + 12, far = this.squadZ - 110;
    for (const e of this.enemies) {
      if (!e.alive || e.z > near || e.z < far) continue;
      const ph = this.time * (e.active ? (e.mini ? 7 : 13) : 3) + e.phase;
      const sc = e.mini ? ENEMY.MINI_SCALE : e.brute ? 1.65 : 1;
      const yaw = e.yaw;
      _v.set(e.x, e.active ? Math.abs(Math.sin(ph)) * (e.mini ? 0.18 : 0.12) : 0, e.z);
      _e.set(e.active ? 0.1 : 0, e.active ? yaw : Math.sin(ph * 0.5) * 0.3, Math.sin(ph) * (e.active ? (e.mini ? 0.06 : 0.12) : 0.05));
      _q.setFromEuler(_e);
      _s.set(sc, sc, sc);
      _m.compose(_v, _q, _s);
      if (e.mini) {
        if (m >= 8) continue;
        miniMesh.setMatrixAt(m, _m);
        miniMesh.setColorAt(m, e.flash > 0 ? FLASH : WHITE);
        m++;
        if (bars < this.hpBars.length) {
          const bar = this.hpBars[bars++];
          bar.visible = true;
          bar.position.set(e.x, 4.3, e.z);
          bar.quaternion.copy(this.camera.quaternion);
          bar.userData.fill.scale.x = 2.3 * Math.max(0, e.hp / e.maxHp);
          bar.userData.hpText.set(e.hp, e.maxHp);
        }
        continue;
      }
      if (n >= POOLS.ENEMIES) continue;
      mesh.setMatrixAt(n, _m);
      mesh.setColorAt(n, e.flash > 0 ? FLASH : e.brute ? BRUTE_TINT : WHITE);
      n++;
    }
    for (let i = bars; i < this.hpBars.length; i++) this.hpBars[i].visible = false;
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    miniMesh.count = m;
    miniMesh.instanceMatrix.needsUpdate = true;
    miniMesh.instanceColor.needsUpdate = true;
  }

  // =========================================================================
  // Boss
  // =========================================================================
  damageBoss(dmg, bx, bz) {
    const boss = this.boss;
    boss.hp -= dmg;
    boss.flash = 0.06;
    if (Math.random() < 0.25) this.particles.burst(bx, rand(1, 4), bz + 2.2, 2, [0xffd34d, 0xffffff], 4, 0.6, 0.3);
    if (!boss.enraged && boss.hp < boss.maxHp * 0.5) {
      boss.enraged = true;
      this.hud.toast('BOSS ENRAGED!', 'bad');
      this.shake = 0.4;
    }
    if (boss.hp <= 0) {
      boss.hp = 0;
      boss.alive = false;
      boss.deathT = 0;
      for (let k = 0; k < 6; k++) {
        this.particles.burst(boss.x + rand(-3, 3), rand(1, 5), boss.z + rand(-2, 2), 30, [0xffb020, 0xff5a1a, 0x7fbf4a, 0x555555], 10, 1.8, 1.2);
      }
      this.rings.spawn(boss.x, boss.z, 12, 0xffa020, 0.8);
      this.shake = 1;
      for (const t of this.telegraphs) { t.active = false; t.mesh.visible = false; }
      for (const o of this.orbs) { o.active = false; o.orb.visible = o.marker.visible = false; }
      if (this.state === 'boss') setTimeout(() => { if (this.state === 'boss') this.win(); }, 1400);
    }
  }

  updateBoss(dt) {
    const boss = this.boss;
    if (!boss.alive) return;
    boss.x = Math.sin(this.time * 0.6) * 1.3;
    boss.attackTimer -= dt;
    if (boss.attackTimer <= 0) {
      const every = this.params.bossAttackEvery * (boss.enraged ? 0.7 : 1);
      boss.attackTimer = every + rand(-0.2, 0.3);
      if (Math.random() < 0.5) this.bossSlam(); else this.bossVolley();
    }
    // Telegraphs → impact
    for (const t of this.telegraphs) {
      if (!t.active) continue;
      t.t += dt;
      const k = t.t / t.dur;
      t.mesh.material.opacity = 0.18 + 0.32 * (0.5 + 0.5 * Math.sin(t.t * 22)) * Math.min(1, k * 2);
      if (k >= 1) {
        t.active = false;
        t.mesh.visible = false;
        boss.slamAnim = 0.35;
        this.shake = Math.max(this.shake, 0.6);
        const cx = (t.x0 + t.x1) / 2;
        for (let j = 0; j < 4; j++) this.particles.burst(cx + rand(-1.2, 1.2), 0.3, this.squadZ + rand(-3, 3), 10, [0xff4020, 0xffb020, 0x555555], 7, 1.2, 0.6);
        this.rings.spawn(cx, this.squadZ, 3.5, 0xff3020, 0.4);
        const frac = this.fractionWhere((x) => x > t.x0 && x < t.x1);
        if (frac > 0) this.loseSoldiers(Math.max(1, Math.round(this.count * frac * 0.3)), 'Crushed by the Mecha-Zombie Tank.');
      }
    }
  }

  bossSlam() {
    const laneOf = (x) => (x < -LANE_W / 2 ? 0 : x > LANE_W / 2 ? 2 : 1);
    const lanes = [laneOf(this.squadX)];
    if (this.boss.enraged) {
      const others = [0, 1, 2].filter((l) => l !== lanes[0]);
      lanes.push(others[(Math.random() * 2) | 0]);   // always leaves one safe lane
    }
    const dur = this.boss.enraged ? 0.85 : 1.1;
    for (const lane of lanes) {
      const t = this.telegraphs.find((tt) => !tt.active);
      if (!t) break;
      t.active = true; t.t = 0; t.dur = dur;
      t.x0 = LANES[lane] - LANE_W / 2; t.x1 = LANES[lane] + LANE_W / 2;
      t.mesh.visible = true;
      t.mesh.position.set(LANES[lane], 0.06, this.squadZ - 1);
      t.mesh.scale.set(LANE_W - 0.1, 1, 9);
    }
  }

  bossVolley() {
    const n = this.boss.enraged ? 5 : 3;
    for (let k = 0; k < n; k++) {
      const o = this.orbs.find((oo) => !oo.active);
      if (!o) break;
      o.active = true; o.t = -k * 0.12; o.dur = 1.25;
      o.sx = this.boss.x + (k % 2 ? 2.6 : -2.6); o.sz = this.boss.z + 2;
      o.tx = clamp(this.squadX + rand(-2.6, 2.6), -TRACK.HALF_WIDTH + 1, TRACK.HALF_WIDTH - 1);
      o.tz = this.squadZ + rand(-1.5, 1.5);
      o.marker.position.set(o.tx, 0.07, o.tz);
      o.marker.scale.setScalar(1.5);
      o.marker.visible = true;
      o.orb.visible = false;
    }
  }

  updateBossProjectiles(dt) {
    for (const o of this.orbs) {
      if (!o.active) continue;
      o.t += dt;
      if (o.t < 0) continue;
      const k = o.t / o.dur;
      o.orb.visible = true;
      o.orb.position.set(o.sx + (o.tx - o.sx) * k, 3.6 + Math.sin(k * Math.PI) * 6 - k * 3.4, o.sz + (o.tz - o.sz) * k);
      o.marker.material.opacity = 0.25 + 0.35 * k;
      if (k >= 1) {
        o.active = false;
        o.orb.visible = o.marker.visible = false;
        this.particles.burst(o.tx, 0.4, o.tz, 18, [0xff7a1a, 0xffd34d, 0x444444], 6, 1.1, 0.6);
        this.rings.spawn(o.tx, o.tz, 2, 0xff5a1a, 0.35);
        this.shake = Math.max(this.shake, 0.3);
        if (this.state !== 'boss') continue;
        const frac = this.fractionWhere((x, z) => (x - o.tx) ** 2 + (z - o.tz) ** 2 < 1.5 * 1.5);
        if (frac > 0) this.loseSoldiers(Math.max(1, Math.round(this.count * frac * 0.35)), 'Blasted by the boss cannons.');
      }
    }
  }

  updateBossVisual(dt) {
    const boss = this.boss, obj = this.bossObj;
    const { fistL, fistR, body } = obj.userData;
    obj.position.x = boss.x;
    if (boss.flash > 0) boss.flash -= dt;
    // subtle warm hit flash that pulses (continuous fire must not wash the model out)
    const flash = boss.flash > 0 ? 0.18 + 0.12 * Math.sin(this.time * 40) : 0;
    for (const m of this.bossMats) m.emissive.setRGB(flash, flash * 0.45, flash * 0.2);
    if (boss.alive) {
      body.position.y = Math.sin(this.time * 2) * 0.12;
      const charging = this.telegraphs.some((t) => t.active);
      boss.slamAnim = Math.max(0, boss.slamAnim - dt);
      const lift = charging ? 2.4 : boss.slamAnim > 0 ? -0.8 : 0;
      const target = 2.4 + lift;
      fistL.position.y += (target - fistL.position.y) * damp(charging ? 4 : 18, dt);
      fistR.position.y = fistL.position.y;
    } else {
      boss.deathT += dt;
      obj.position.y = -boss.deathT * 3;
      obj.rotation.z = boss.deathT * 0.4;
      if (boss.deathT > 2.5) obj.visible = false;
    }
  }

  // =========================================================================
  // Camera & HUD
  // =========================================================================
  updateCamera(dt) {
    const bossMode = this.state === 'boss' || (this.state === 'win' && this.squadZ <= -this.layout.length);
    const tx = this.squadX * (bossMode ? 0.35 : 0.55);
    if (bossMode) {
      this.camPos.lerp(_v.set(tx, 13, this.squadZ + 13), damp(2.5, dt));
      this.camLook.lerp(_v.set(this.squadX * 0.2, 1.5, this.squadZ - 11), damp(2.5, dt));
    } else {
      this.camPos.lerp(_v.set(tx, 10.5, this.squadZ + 11.5), damp(6, dt));
      this.camLook.lerp(_v.set(this.squadX * 0.35, 0, this.squadZ - 10), damp(6, dt));
    }
    this.shake *= Math.exp(-6 * dt);
    const sh = this.shake;
    this.camera.position.set(this.camPos.x + (Math.random() - 0.5) * sh, this.camPos.y + (Math.random() - 0.5) * sh, this.camPos.z);
    this.camera.lookAt(this.camLook);
    this.water.position.z = this.camPos.z - 60;
  }

  updateHud() {
    this.hud.setProgress(-this.squadZ / this.layout.length);
    this.hud.setWeapon(this.tier, this.count);
    if (this.state === 'boss') this.hud.setBoss(this.boss.hp, this.boss.maxHp);
    _v.set(this.squadX, 1.6 + this.radiusZ * 0.15, this.squadZ - this.radiusZ - 0.3).project(this.camera);
    this.hud.setSquad(this.count, (_v.x * 0.5 + 0.5) * innerWidth, (-_v.y * 0.5 + 0.5) * innerHeight, this.count > 0 && this.state !== 'win');
  }

  onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    // keep the full bridge width visible on portrait phones
    this.camera.fov = w / h < 0.75 ? 78 : w / h < 1.2 ? 66 : 58;
    this.camera.updateProjectionMatrix();
  }
}

// ---------------------------------------------------------------------------
crazy.init().finally(() => {
  crazy.loadingStart();
  const game = new Game(document.getElementById('game'));
  crazy.loadingStop();
  game.hud.hint(true);
});
