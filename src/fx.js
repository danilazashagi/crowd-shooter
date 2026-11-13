// ---------------------------------------------------------------------------
// Pooled, instanced effects: bullets, particles, shockwave rings.
// Everything is struct-of-arrays + swap-remove, updated with deltaTime.
// ---------------------------------------------------------------------------
import * as THREE from 'three';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _up = new THREE.Vector3(0, 1, 0);

export class BulletPool {
  constructor(scene, capacity) {
    this.cap = capacity;
    const geo = new THREE.BoxGeometry(0.11, 0.11, 0.7);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, _c.set(0xffffff));
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);

    this.n = 0;
    this.x = new Float32Array(capacity); this.y = new Float32Array(capacity); this.z = new Float32Array(capacity);
    this.vx = new Float32Array(capacity); this.vz = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.dmg = new Float32Array(capacity);
    this.size = new Float32Array(capacity);
    this.color = new Uint32Array(capacity);
  }

  spawn(x, y, z, vx, vz, life, dmg, color, size) {
    if (this.n >= this.cap) return;
    const i = this.n++;
    this.x[i] = x; this.y[i] = y; this.z[i] = z;
    this.vx[i] = vx; this.vz[i] = vz;
    this.life[i] = life; this.dmg[i] = dmg;
    this.color[i] = color; this.size[i] = size;
  }

  kill(i) {
    const j = --this.n;
    if (i === j) return;
    this.x[i] = this.x[j]; this.y[i] = this.y[j]; this.z[i] = this.z[j];
    this.vx[i] = this.vx[j]; this.vz[i] = this.vz[j];
    this.life[i] = this.life[j]; this.dmg[i] = this.dmg[j];
    this.color[i] = this.color[j]; this.size[i] = this.size[j];
  }

  /** Moves bullets; `hit(i)` returns true when bullet i must be removed. */
  update(dt, hit) {
    for (let i = this.n - 1; i >= 0; i--) {
      this.life[i] -= dt;
      this.x[i] += this.vx[i] * dt;
      this.z[i] += this.vz[i] * dt;
      if (this.life[i] <= 0 || hit(i)) this.kill(i);
    }
  }

  render() {
    for (let i = 0; i < this.n; i++) {
      const s = this.size[i];
      _v.set(this.x[i], this.y[i], this.z[i]);
      // orient along velocity (yaw only)
      _q.setFromAxisAngle(_up, Math.atan2(this.vx[i], this.vz[i]));
      _s.set(s, s, s);
      _m.compose(_v, _q, _s);
      this.mesh.setMatrixAt(i, _m);
      this.mesh.setColorAt(i, _c.setHex(this.color[i]));
    }
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  clear() { this.n = 0; this.mesh.count = 0; }
}

export class ParticlePool {
  constructor(scene, capacity) {
    this.cap = capacity;
    const geo = new THREE.BoxGeometry(0.18, 0.18, 0.18);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, _c.set(0xffffff));
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.n = 0;
    const f = () => new Float32Array(capacity);
    this.x = f(); this.y = f(); this.z = f();
    this.vx = f(); this.vy = f(); this.vz = f();
    this.life = f(); this.max = f(); this.size = f(); this.rot = f();
    this.color = new Uint32Array(capacity);
  }

  burst(x, y, z, count, color, speed = 5, size = 1, life = 0.7) {
    for (let k = 0; k < count; k++) {
      if (this.n >= this.cap) return;
      const i = this.n++;
      const a = Math.random() * Math.PI * 2;
      const up = 0.4 + Math.random() * 0.9;
      const sp = speed * (0.4 + Math.random() * 0.8);
      this.x[i] = x; this.y[i] = y; this.z[i] = z;
      this.vx[i] = Math.cos(a) * sp; this.vz[i] = Math.sin(a) * sp; this.vy[i] = up * speed;
      this.life[i] = this.max[i] = life * (0.6 + Math.random() * 0.6);
      this.size[i] = size * (0.6 + Math.random() * 0.8);
      this.rot[i] = Math.random() * 6;
      this.color[i] = Array.isArray(color) ? color[(Math.random() * color.length) | 0] : color;
    }
  }

  update(dt) {
    for (let i = this.n - 1; i >= 0; i--) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        const j = --this.n;
        this.x[i] = this.x[j]; this.y[i] = this.y[j]; this.z[i] = this.z[j];
        this.vx[i] = this.vx[j]; this.vy[i] = this.vy[j]; this.vz[i] = this.vz[j];
        this.life[i] = this.life[j]; this.max[i] = this.max[j]; this.size[i] = this.size[j];
        this.rot[i] = this.rot[j]; this.color[i] = this.color[j];
        continue;
      }
      this.vy[i] -= 18 * dt;
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      this.z[i] += this.vz[i] * dt;
      if (this.y[i] < 0.05) { this.y[i] = 0.05; this.vy[i] *= -0.35; this.vx[i] *= 0.7; this.vz[i] *= 0.7; }
      this.rot[i] += dt * 8;
    }
  }

  render() {
    for (let i = 0; i < this.n; i++) {
      const s = this.size[i] * (this.life[i] / this.max[i]);
      _v.set(this.x[i], this.y[i], this.z[i]);
      _q.setFromAxisAngle(_up, this.rot[i]);
      _s.set(s, s, s);
      _m.compose(_v, _q, _s);
      this.mesh.setMatrixAt(i, _m);
      this.mesh.setColorAt(i, _c.setHex(this.color[i]));
    }
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  clear() { this.n = 0; this.mesh.count = 0; }
}

export class RingPool {
  constructor(scene, count = 10) {
    this.items = [];
    const geo = new THREE.RingGeometry(0.85, 1, 32);
    geo.rotateX(-Math.PI / 2);
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffaa33, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      scene.add(mesh);
      this.items.push({ mesh, t: 0, dur: 1, radius: 1 });
    }
  }

  spawn(x, z, radius, color = 0xffaa33, dur = 0.45) {
    const r = this.items.find((it) => !it.mesh.visible) || this.items[0];
    r.mesh.visible = true;
    r.mesh.position.set(x, 0.12, z);
    r.mesh.material.color.setHex(color);
    r.t = 0; r.dur = dur; r.radius = radius;
  }

  update(dt) {
    for (const r of this.items) {
      if (!r.mesh.visible) continue;
      r.t += dt;
      const k = r.t / r.dur;
      if (k >= 1) { r.mesh.visible = false; continue; }
      const s = 0.2 + k * r.radius;
      r.mesh.scale.set(s, 1, s);
      r.mesh.material.opacity = 1 - k;
    }
  }

  clear() { for (const r of this.items) r.mesh.visible = false; }
}
