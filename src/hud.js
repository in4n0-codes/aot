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
    // Minimap
    this.mapCanvas = document.getElementById('minimap');
    this.mapCtx = this.mapCanvas ? this.mapCanvas.getContext('2d') : null;
    this.cTitans = document.getElementById('cTitans');
    this.cScouts = document.getElementById('cScouts');
    this.cCivs = document.getElementById('cCivs');
    this.cSaved = document.getElementById('cSaved');
    this.rescueEl = document.getElementById('rescue');
    this.rescueMsg = document.getElementById('rescueMsg');
    this.rescueArrow = document.getElementById('rescueArrow');
    this.rescueTimer = document.getElementById('rescueTimer');
    this.mapRange = 118; // world units from centre shown to the map edge
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

  // Text counters beneath the minimap.
  setCounts(kills, budget, scoutsAlive, scoutsTotal, civsAlive, civsTotal, saved) {
    if (this.cTitans) this.cTitans.textContent = `TITANS ${kills}/${budget} SLAIN`;
    if (this.cScouts) this.cScouts.textContent = `SCOUTS ${scoutsAlive}/${scoutsTotal}`;
    if (this.cCivs) this.cCivs.textContent = `CIVILIANS ${civsAlive}/${civsTotal}`;
    if (this.cSaved) this.cSaved.textContent = `RESCUES ${saved}`;
  }

  // Draw the round radar: player-centred, north-up. Red = titans, green =
  // civilians, blue = scouts, gold ring = a victim in a titan's grip.
  drawMap(player, titans, npcs) {
    const ctx = this.mapCtx;
    if (!ctx) return;
    const S = 176, R = S / 2, range = this.mapRange;
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath(); ctx.arc(R, R, R - 1, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = 'rgba(30,34,32,0.55)'; ctx.fillRect(0, 0, S, S);
    // wall ring hint
    ctx.strokeStyle = 'rgba(150,150,150,0.25)'; ctx.lineWidth = 1;
    ctx.strokeRect(R - (113 / range) * R + 0, R - (113 / range) * R, (226 / range) * R, (226 / range) * R);
    const px = player.pos.x, pz = player.pos.z;
    const plot = (wx, wz) => [R + ((wx - px) / range) * R, R + ((wz - pz) / range) * R];
    const dot = (wx, wz, col, rad) => {
      const [mx, my] = plot(wx, wz);
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(mx, my, rad, 0, Math.PI * 2); ctx.fill();
    };
    for (const c of npcs.civilians) if (c.alive && !c.beingEaten) dot(c.group.position.x, c.group.position.z, '#5fd05f', 2);
    for (const t of titans) if (t.alive) dot(t.group.position.x, t.group.position.z, t.abnormal ? '#ff5a3a' : '#e0503f', t.eating ? 4 : 3);
    for (const s of npcs.scouts) if (s.alive && !s.beingEaten) dot(s.group.position.x, s.group.position.z, '#5aa8ff', 2.5);
    // grabbed victims flash a gold ring
    for (const list of [npcs.scouts, npcs.civilians]) {
      for (const n of list) {
        if (n.beingEaten && n.grabbedBy && n.grabbedBy.eating && !n.grabbedBy.eating.chomped) {
          const [mx, my] = plot(n.grabbedBy.group.position.x, n.grabbedBy.group.position.z);
          ctx.strokeStyle = '#ffcf4a'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(mx, my, 6, 0, Math.PI * 2); ctx.stroke();
        }
      }
    }
    ctx.restore();
    // player arrow (centre), pointing where they face
    ctx.save();
    ctx.translate(R, R); ctx.rotate(player.yaw);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(4, 5); ctx.lineTo(0, 2); ctx.lineTo(-4, 5); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // On-screen compass toward a victim to be rescued, with the countdown.
  setRescue(active, worldPos, player, secsLeft, isScout) {
    if (!this.rescueEl) return;
    if (!active) { this.rescueEl.style.display = 'none'; return; }
    this.rescueEl.style.display = 'block';
    this.rescueMsg.textContent = (isScout ? 'A SCOUT' : 'A CIVILIAN') + ' IS BEING EATEN — SAVE THEM';
    this.rescueTimer.textContent = Math.ceil(secsLeft) + 's';
    const dx = worldPos.x - player.pos.x, dz = worldPos.z - player.pos.z;
    const bearing = Math.atan2(dx, dz) - player.yaw; // relative to facing
    this.rescueArrow.style.transform = `rotate(${bearing}rad)`;
  }

  setCinematic(on) {
    const top = document.getElementById('cine-top');
    const bot = document.getElementById('cine-bottom');
    const skip = document.getElementById('cine-skip');
    if (top) top.style.transform = on ? 'scaleY(1)' : 'scaleY(0)';
    if (bot) bot.style.transform = on ? 'scaleY(1)' : 'scaleY(0)';
    if (skip) skip.style.opacity = on ? '1' : '0';
  }

  setSubtitle(text) {
    const el = document.getElementById('subtitle');
    if (el) el.textContent = text || '';
  }

  // Lightning strike: instant white-out, half-second fade.
  flash() {
    const el = document.getElementById('flash');
    if (!el) return;
    el.style.transition = 'none';
    el.style.opacity = '1';
    requestAnimationFrame(() => {
      el.style.transition = 'opacity 0.55s ease-out';
      el.style.opacity = '0';
    });
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
