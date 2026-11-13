// ---------------------------------------------------------------------------
// Input: horizontal drag (mouse / touch / pen) + keyboard by physical key code
// (event.code works the same on QWERTY, AZERTY, ЙЦУКЕН, ...).
// ---------------------------------------------------------------------------

const LEFT_CODES = new Set(['KeyA', 'ArrowLeft']);
const RIGHT_CODES = new Set(['KeyD', 'ArrowRight']);
const PREVENT = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space']);

export class Input {
  constructor(target) {
    this.target = target;
    this.dragging = false;
    this.pointerId = null;
    this.lastX = 0;
    this.dragDelta = 0;      // accumulated horizontal drag in screen fractions (consumed each frame)
    this.left = false;
    this.right = false;
    this.listeners = { first: [], action: [] };
    this._firstFired = false;

    target.addEventListener('pointerdown', this._down);
    target.addEventListener('pointermove', this._move);
    target.addEventListener('pointerup', this._up);
    target.addEventListener('pointercancel', this._up);
    target.addEventListener('lostpointercapture', this._up);
    window.addEventListener('keydown', this._key);
    window.addEventListener('keyup', this._keyUp);
    window.addEventListener('blur', () => { this.left = this.right = false; this.dragging = false; });
    target.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  on(type, fn) { this.listeners[type].push(fn); }
  _emit(type) { for (const fn of this.listeners[type]) fn(); }
  _first() {
    if (this._firstFired) return;
    this._firstFired = true;
    this._emit('first');
  }

  _down = (e) => {
    this.dragging = true;
    this.pointerId = e.pointerId;
    this.lastX = e.clientX;
    try { this.target.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    this._first();
    this._emit('action');
  };

  _move = (e) => {
    this._first();
    if (!this.dragging || e.pointerId !== this.pointerId) return;
    const dx = e.clientX - this.lastX;
    this.lastX = e.clientX;
    // normalise by the smaller screen side so phones in portrait feel the same as desktops
    this.dragDelta += dx / Math.min(window.innerWidth, window.innerHeight * 1.2);
  };

  _up = (e) => {
    if (e.pointerId !== undefined && this.pointerId !== null && e.pointerId !== this.pointerId) return;
    this.dragging = false;
    this.pointerId = null;
  };

  _key = (e) => {
    if (PREVENT.has(e.code)) e.preventDefault();
    if (LEFT_CODES.has(e.code)) this.left = true;
    else if (RIGHT_CODES.has(e.code)) this.right = true;
    if (!e.repeat) { this._first(); this._emit('action'); }
  };

  _keyUp = (e) => {
    if (LEFT_CODES.has(e.code)) this.left = false;
    else if (RIGHT_CODES.has(e.code)) this.right = false;
  };

  /** Keyboard axis: -1 .. 1 */
  get axis() { return (this.right ? 1 : 0) - (this.left ? 1 : 0); }

  consumeDrag() {
    const d = this.dragDelta;
    this.dragDelta = 0;
    return d;
  }
}
