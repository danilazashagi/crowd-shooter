// ---------------------------------------------------------------------------
// DOM HUD. Writes to the DOM only when values actually change.
// ---------------------------------------------------------------------------
import { WEAPON_TIERS } from './config.js';

const $ = (id) => document.getElementById(id);
const ICONS = ['🔫', '🎯', '💥', '⚡'];

export class Hud {
  constructor() {
    this.el = {
      level: $('level'), progress: $('progress-fill'), squad: $('squad-label'),
      weapon: $('weapon'), weaponName: $('weapon-name'), weaponIcon: $('weapon-icon'), weaponNext: $('weapon-next'),
      bossWrap: $('boss'), bossFill: $('boss-fill'), bossName: $('boss-name'),
      toast: $('toast'), hint: $('start-hint'), overlay: $('overlay'), overlayTitle: $('overlay-title'),
      overlaySub: $('overlay-sub'), overlayPrompt: $('overlay-prompt'), popups: $('popups'), fps: $('fps'),
    };
    this.cache = {};
    this.toastTimer = 0;
  }

  _set(key, el, prop, value) {
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    if (prop === 'text') el.textContent = value;
    else if (prop === 'width') el.style.width = value;
    else if (prop === 'display') el.style.display = value;
  }

  setLevel(n) { this._set('level', this.el.level, 'text', 'LEVEL ' + n); }
  setProgress(k) { this._set('prog', this.el.progress, 'width', (Math.max(0, Math.min(1, k)) * 100).toFixed(1) + '%'); }

  setWeapon(tierIdx, count) {
    const t = WEAPON_TIERS[tierIdx];
    this._set('wname', this.el.weaponName, 'text', t.name);
    this._set('wicon', this.el.weaponIcon, 'text', ICONS[tierIdx]);
    const next = WEAPON_TIERS[tierIdx + 1];
    const txt = next ? `${Math.max(0, next.min - count)} more → ${next.name}` : 'MAX POWER';
    this._set('wnext', this.el.weaponNext, 'text', txt);
    if (this.cache.wtier !== tierIdx) {
      this.cache.wtier = tierIdx;
      this.el.weapon.dataset.tier = String(tierIdx);
    }
  }

  /** Squad counter that floats above the crowd (screen coords). */
  setSquad(count, sx, sy, visible) {
    this._set('scount', this.el.squad, 'text', String(count));
    const s = this.el.squad.style;
    if (!visible) { this._set('sdisp', this.el.squad, 'display', 'none'); return; }
    this._set('sdisp', this.el.squad, 'display', 'block');
    s.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -100%)`;
  }

  showBoss(show, name = '') {
    this._set('bossShow', this.el.bossWrap, 'display', show ? 'block' : 'none');
    if (name) this._set('bossName', this.el.bossName, 'text', name);
  }
  setBoss(k) { this._set('bossHp', this.el.bossFill, 'width', (Math.max(0, k) * 100).toFixed(1) + '%'); }

  toast(text, cls = '') {
    const t = this.el.toast;
    t.textContent = text;
    t.className = 'ui show ' + cls;
    this.toastTimer = 1.6;
  }

  popup(text, sx, sy, positive) {
    const d = document.createElement('div');
    d.className = 'popup ' + (positive ? 'pos' : 'neg');
    d.textContent = text;
    d.style.left = sx + 'px';
    d.style.top = sy + 'px';
    this.el.popups.appendChild(d);
    setTimeout(() => d.remove(), 900);
  }

  hint(show) { this._set('hint', this.el.hint, 'display', show ? 'flex' : 'none'); }

  overlay(show, title = '', sub = '', prompt = '', cls = '') {
    this.el.overlay.style.display = show ? 'flex' : 'none';
    if (!show) return;
    this.el.overlay.className = 'ui ' + cls;
    this.el.overlayTitle.textContent = title;
    this.el.overlaySub.textContent = sub;
    this.el.overlayPrompt.textContent = prompt;
  }

  setFps(v) { if (this.el.fps) this._set('fps', this.el.fps, 'text', v + ' FPS'); }

  update(dt) {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.el.toast.className = 'ui';
    }
  }
}
