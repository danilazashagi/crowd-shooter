// ---------------------------------------------------------------------------
// Thin CrazyGames HTML5 SDK v3 wrapper.
// The SDK is only loaded when the game runs on a CrazyGames domain, so local
// development stays offline-friendly with a clean console. All calls are safe
// no-ops when the SDK is unavailable.
// ---------------------------------------------------------------------------

const SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';

function onCrazyGames() {
  try {
    const host = location.hostname + ' ' + (document.referrer || '');
    return /crazygames\./i.test(host) || new URLSearchParams(location.search).has('useLocalSdk');
  } catch { return false; }
}

class CrazySdk {
  constructor() { this.sdk = null; this.inGameplay = false; }

  async init() {
    if (!onCrazyGames()) return;
    try {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = SDK_URL;
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
      });
      await window.CrazyGames.SDK.init();
      this.sdk = window.CrazyGames.SDK;
    } catch {
      this.sdk = null;
    }
  }

  _call(fn) { try { if (this.sdk) fn(this.sdk); } catch { /* never let the SDK break the game */ } }
  loadingStart() { this._call((s) => s.game.loadingStart()); }
  loadingStop() { this._call((s) => s.game.loadingStop()); }
  gameplayStart() { if (this.inGameplay) return; this.inGameplay = true; this._call((s) => s.game.gameplayStart()); }
  gameplayStop() { if (!this.inGameplay) return; this.inGameplay = false; this._call((s) => s.game.gameplayStop()); }
  happytime() { this._call((s) => s.game.happytime()); }
}

export const crazy = new CrazySdk();
