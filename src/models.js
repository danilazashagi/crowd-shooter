// ---------------------------------------------------------------------------
// Procedural low-poly models. Every character is merged into ONE
// BufferGeometry with vertex colours so it can be drawn with a single
// InstancedMesh draw call.
// ---------------------------------------------------------------------------
import * as THREE from 'three';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

/**
 * part(geometry, color, [x,y,z], [rx,ry,rz], [sx,sy,sz])
 * Returns a non-indexed geometry with baked transform and vertex colour.
 */
function part(geo, color, pos = [0, 0, 0], rot = [0, 0, 0], scl = [1, 1, 1]) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  _e.set(rot[0], rot[1], rot[2]);
  _q.setFromEuler(_e);
  _p.set(pos[0], pos[1], pos[2]);
  _s.set(scl[0], scl[1], scl[2]);
  _m.compose(_p, _q, _s);
  g.applyMatrix4(_m);
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('uv');
  return g;
}

function merge(parts) {
  let total = 0;
  for (const p of parts) total += p.attributes.position.count;
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  let off = 0;
  for (const p of parts) {
    pos.set(p.attributes.position.array, off * 3);
    nor.set(p.attributes.normal.array, off * 3);
    col.set(p.attributes.color.array, off * 3);
    off += p.attributes.position.count;
    p.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, s = 8) => new THREE.CylinderGeometry(rt, rb, h, s);
const sph = (r, w = 8, h = 6) => new THREE.SphereGeometry(r, w, h);

// --- Player soldier (cyber-agent), faces -Z -------------------------------
export function makeSoldierGeometry() {
  const blue = 0x2f7bff, dark = 0x1a3a8a, visor = 0x7ff6ff, skin = 0xf0c8a0;
  return merge([
    part(box(0.22, 0.42, 0.18), dark, [-0.12, 0.21, 0]),   // legs
    part(box(0.22, 0.42, 0.18), dark, [0.12, 0.21, 0]),
    part(box(0.56, 0.5, 0.32), blue, [0, 0.66, 0]),        // torso
    part(box(0.6, 0.12, 0.34), dark, [0, 0.46, 0]),        // belt
    part(sph(0.2), skin, [0, 1.06, 0]),                    // head
    part(box(0.44, 0.16, 0.12), blue, [0, 1.15, 0.02]),    // helmet band
    part(box(0.34, 0.08, 0.06), visor, [0, 1.08, -0.18]),  // visor
    part(box(0.14, 0.4, 0.14), blue, [-0.34, 0.66, -0.08], [-0.6, 0, 0]), // arms forward
    part(box(0.14, 0.4, 0.14), blue, [0.34, 0.66, -0.08], [-0.6, 0, 0]),
  ]);
}

// --- Weapon variants (one per tier) – positioned in the soldier's hands ----
export function makeGunGeometries() {
  const metal = 0x30343c, accent = 0xffc23a;
  const pistol = merge([
    part(box(0.08, 0.1, 0.26), metal, [0.16, 0.74, -0.42]),
    part(box(0.06, 0.12, 0.08), accent, [0.16, 0.66, -0.34]),
  ]);
  const rifle = merge([
    part(box(0.09, 0.12, 0.7), metal, [0.12, 0.76, -0.45]),
    part(box(0.07, 0.16, 0.08), 0x6a4a2a, [0.12, 0.66, -0.4]),
    part(box(0.05, 0.05, 0.25), 0xff8a2a, [0.12, 0.84, -0.4]),
  ]);
  const shotgun = merge([
    part(cyl(0.06, 0.06, 0.8, 6), metal, [0.1, 0.76, -0.5], [Math.PI / 2, 0, 0]),
    part(box(0.12, 0.12, 0.3), 0x8a5a2a, [0.1, 0.72, -0.2]),
    part(box(0.13, 0.08, 0.16), 0xffe9a8, [0.1, 0.7, -0.62]),
  ]);
  const plasma = merge([
    part(cyl(0.13, 0.13, 0.55, 8), 0x1d2240, [0.12, 0.76, -0.4], [Math.PI / 2, 0, 0]),
    part(cyl(0.05, 0.05, 0.4, 6), 0x39f3ff, [0.12, 0.76, -0.82], [Math.PI / 2, 0, 0]),
    part(box(0.2, 0.22, 0.2), 0x39f3ff, [0.12, 0.78, -0.12]),
  ]);
  return [pistol, rifle, shotgun, plasma];
}

// --- Zombie / mutant, faces +Z (towards the player) ------------------------
export function makeZombieGeometry() {
  const skin = 0x7fbf4a, cloth = 0x4a3f36, vest = 0x2e3a2a, eye = 0xff2020;
  return merge([
    part(box(0.24, 0.48, 0.2), cloth, [-0.14, 0.24, 0]),
    part(box(0.24, 0.48, 0.2), cloth, [0.14, 0.24, 0]),
    part(box(0.62, 0.56, 0.36), vest, [0, 0.76, 0.04], [0.25, 0, 0]),   // hunched torso
    part(sph(0.24), skin, [0, 1.18, 0.18]),
    part(box(0.08, 0.06, 0.04), eye, [-0.09, 1.2, 0.4]),
    part(box(0.08, 0.06, 0.04), eye, [0.09, 1.2, 0.4]),
    part(box(0.14, 0.56, 0.14), skin, [-0.38, 0.86, 0.3], [-1.25, 0, 0]),  // arms reaching
    part(box(0.14, 0.56, 0.14), skin, [0.38, 0.86, 0.3], [-1.25, 0, 0]),
    part(box(0.2, 0.08, 0.3), 0x9a2a2a, [0.18, 0.95, -0.1]),             // gore strap
  ]);
}

// --- Mini-boss: armoured crimson mutant juggernaut (faces +Z, drawn at ENEMY.MINI_SCALE)
export function makeMiniBossGeometry() {
  const skin = 0xc2373a, steel = 0x59616e, dark = 0x23262d, gold = 0xffc23a, glow = 0xfff04a;
  return merge([
    part(box(0.3, 0.5, 0.26), dark, [-0.17, 0.25, 0]),                       // legs
    part(box(0.3, 0.5, 0.26), dark, [0.17, 0.25, 0]),
    part(box(0.34, 0.14, 0.34), steel, [-0.17, 0.42, 0.02]),                 // knee guards
    part(box(0.34, 0.14, 0.34), steel, [0.17, 0.42, 0.02]),
    part(box(0.76, 0.62, 0.44), skin, [0, 0.84, 0.04], [0.2, 0, 0]),         // torso
    part(box(0.68, 0.46, 0.08), steel, [0, 0.86, 0.28], [0.2, 0, 0]),        // chest plate
    part(box(0.16, 0.16, 0.06), glow, [0, 0.9, 0.34], [0.2, 0, 0]),          // glowing core
    part(box(0.36, 0.22, 0.42), steel, [-0.5, 1.14, 0.04]),                  // shoulder pads
    part(box(0.36, 0.22, 0.42), steel, [0.5, 1.14, 0.04]),
    part(box(0.08, 0.26, 0.08), gold, [-0.56, 1.34, 0.04], [0, 0, 0.3]),     // shoulder spikes
    part(box(0.08, 0.26, 0.08), gold, [0.56, 1.34, 0.04], [0, 0, -0.3]),
    part(sph(0.24), skin, [0, 1.36, 0.14]),                                  // head
    part(box(0.46, 0.22, 0.4), steel, [0, 1.46, 0.12]),                      // helmet
    part(box(0.36, 0.06, 0.04), glow, [0, 1.38, 0.38]),                      // visor slit
    part(box(0.2, 0.56, 0.2), skin, [-0.5, 0.86, 0.26], [-1.0, 0, 0]),       // arms
    part(box(0.2, 0.56, 0.2), skin, [0.5, 0.86, 0.26], [-1.0, 0, 0]),
    part(box(0.3, 0.3, 0.3), steel, [-0.5, 0.7, 0.5]),                       // armoured fists
    part(box(0.3, 0.3, 0.3), steel, [0.5, 0.7, 0.5]),
  ]);
}

// --- Explosive barrel --------------------------------------------------------
export function makeBarrelGeometry() {
  return merge([
    part(cyl(0.55, 0.55, 1.2, 12), 0xd23b2b, [0, 0.6, 0]),
    part(cyl(0.57, 0.57, 0.1, 12), 0x2b2b2b, [0, 0.3, 0]),
    part(cyl(0.57, 0.57, 0.1, 12), 0x2b2b2b, [0, 0.9, 0]),
    part(cyl(0.5, 0.5, 0.04, 12), 0xffd23a, [0, 1.21, 0]),
    part(box(0.5, 0.3, 0.02), 0xffd23a, [0, 0.62, 0.56]),
  ]);
}

// --- Boss: Armored Mecha-Zombie Tank (faces +Z) ------------------------------
export function makeBoss() {
  const g = new THREE.Group();
  const armor = new THREE.MeshLambertMaterial({ vertexColors: true });
  const body = new THREE.Mesh(merge([
    part(box(5.2, 1.4, 4.2), 0x3a3f46, [0, 0.9, 0]),                 // tracks base
    part(box(1.0, 1.2, 4.6), 0x1b1d22, [-2.7, 0.7, 0]),
    part(box(1.0, 1.2, 4.6), 0x1b1d22, [2.7, 0.7, 0]),
    part(box(4.0, 2.4, 3.2), 0x5b6a3a, [0, 2.8, -0.2]),             // hulk torso
    part(box(4.4, 0.5, 3.4), 0x8a8f96, [0, 4.1, -0.2]),             // shoulder armour
    part(sph(1.0, 10, 8), 0x7fbf4a, [0, 4.9, 0.5]),                 // mutant head
    part(box(1.3, 0.35, 0.3), 0x8a8f96, [0, 4.95, 1.4]),            // jaw plate
    part(box(0.25, 0.18, 0.1), 0xff1a1a, [-0.35, 5.15, 1.42]),
    part(box(0.25, 0.18, 0.1), 0xff1a1a, [0.35, 5.15, 1.42]),
    part(box(0.6, 0.6, 2.2), 0x2a2d33, [-2.6, 3.6, 0.8]),           // cannons
    part(box(0.6, 0.6, 2.2), 0x2a2d33, [2.6, 3.6, 0.8]),
    part(cyl(0.22, 0.22, 0.5, 8), 0xff5a1a, [-2.6, 3.6, 2.0], [Math.PI / 2, 0, 0]),
    part(cyl(0.22, 0.22, 0.5, 8), 0xff5a1a, [2.6, 3.6, 2.0], [Math.PI / 2, 0, 0]),
    part(box(0.3, 1.2, 0.3), 0xffc23a, [-1.2, 5.0, -1.2], [0.3, 0, 0]), // spikes
    part(box(0.3, 1.2, 0.3), 0xffc23a, [1.2, 5.0, -1.2], [0.3, 0, 0]),
  ]), armor);
  g.add(body);
  // giant fists that slam the ground
  const fistGeo = merge([part(box(1.4, 1.2, 1.4), 0x8a8f96), part(box(1.0, 0.5, 1.6), 0x5b6a3a, [0, 0.7, -0.2])]);
  const fistL = new THREE.Mesh(fistGeo, armor);
  const fistR = new THREE.Mesh(fistGeo, armor);
  fistL.position.set(-3.6, 2.4, 1.6);
  fistR.position.set(3.6, 2.4, 1.6);
  g.add(fistL, fistR);
  g.userData = { body, fistL, fistR };
  return g;
}

// --- Gate panel label: redrawn in place whenever bullets change its value ----
export class GateLabel {
  constructor(value) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 256; this.canvas.height = 128;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.value = null;
    this.set(value);
  }
  set(value) {
    if (value === this.value) return;
    this.value = value;
    const { ctx } = this;
    const positive = value >= 0;
    ctx.clearRect(0, 0, 256, 128);
    const grd = ctx.createLinearGradient(0, 0, 0, 128);
    grd.addColorStop(0, positive ? 'rgba(40,140,255,0.85)' : 'rgba(255,50,60,0.85)');
    grd.addColorStop(1, positive ? 'rgba(10,70,200,0.55)' : 'rgba(160,10,20,0.55)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 256, 128);
    ctx.fillStyle = '#fff';
    const label = (positive ? '+' : '−') + Math.abs(value);
    ctx.font = `bold ${label.length > 3 ? 60 : 76}px Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.strokeText(label, 128, 68);
    ctx.fillText(label, 128, 68);
    this.texture.needsUpdate = true;
  }
  dispose() { this.texture.dispose(); }
}

// --- Small number label (barrel HP) -----------------------------------------
export class NumberSprite {
  constructor(color = '#fff', bg = 'rgba(0,0,0,0.6)') {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 128; this.canvas.height = 64;
    this.ctx = this.canvas.getContext('2d');
    this.color = color; this.bg = bg;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.texture, depthWrite: false }));
    this.sprite.scale.set(1.3, 0.65, 1);
    this.value = null;
  }
  set(v) {
    if (v === this.value) return;
    this.value = v;
    const { ctx } = this;
    ctx.clearRect(0, 0, 128, 64);
    ctx.fillStyle = this.bg;
    ctx.beginPath();
    ctx.roundRect(4, 4, 120, 56, 14);
    ctx.fill();
    ctx.fillStyle = this.color;
    ctx.font = 'bold 40px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(v), 64, 34);
    this.texture.needsUpdate = true;
  }
  dispose() {
    this.texture.dispose();
    this.sprite.material.dispose();
  }
}
