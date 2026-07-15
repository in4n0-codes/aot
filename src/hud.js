export class HUD {
  constructor() {
    this.healthFill = document.querySelector('#health .fill');
    this.gasFill = document.querySelector('#gas .fill');
    this.bladesEl = document.getElementById('blades');
    this.titansEl = document.getElementById('titans');
    this.speedEl = document.getElementById('speed');
    this.reticleEl = document.getElementById('reticle');
    this.toastEl = document.getElementById('toast');
    this.overlayEl = document.getElementById('overlay');
    this.vignetteEl = document.getElementById('vignette');
    this._toastTimer = null;
    this._pips = [];
  }

  setBars(health, gas, maxGas, blades, maxBlades) {
    this.healthFill.style.transform = `scaleX(${Math.max(0, health) / 100})`;
    this.gasFill.style.transform = `scaleX(${Math.max(0, gas) / maxGas})`;
    if (this._pips.length !== maxBlades) {
      this.bladesEl.innerHTML = '';
      this._pips = [];
      for (let i = 0; i < maxBlades; i++) {
        const pip = document.createElement('div');
        pip.className = 'pip';
        this.bladesEl.appendChild(pip);
        this._pips.push(pip);
      }
    }
    this._pips.forEach((pip, i) => pip.classList.toggle('on', i < blades));
  }

  setTitans(n) {
    this.titansEl.textContent = n > 0 ? `TITANS ${n}` : 'DISTRICT CLEAR';
  }

  setSpeed(v) {
    this.speedEl.textContent = `${v.toFixed(0)} m/s`;
  }

  // x/y in pixels; on=false hides it.
  setReticle(on, x, y, hot) {
    this.reticleEl.style.display = on ? 'block' : 'none';
    if (on) {
      this.reticleEl.style.left = `${x}px`;
      this.reticleEl.style.top = `${y}px`;
      this.reticleEl.style.borderColor = hot ? '#e8c14b' : '#7fd47f';
    }
  }

  toast(msg, ms = 1800) {
    this.toastEl.textContent = msg;
    this.toastEl.style.opacity = '1';
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => (this.toastEl.style.opacity = '0'), ms);
  }

  setOverlay(html) {
    if (html === null) {
      this.overlayEl.style.display = 'none';
    } else {
      this.overlayEl.innerHTML = html;
      this.overlayEl.style.display = 'flex';
    }
  }

  setHurt(on) {
    this.vignetteEl.style.opacity = on ? '1' : '0';
  }
}
