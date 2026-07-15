import * as THREE from 'three';

// A bright cross-slash flash sprite drawn once, reused for every kill.
function flashTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 2, 64, 64, 62);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,238,205,0.65)');
  g.addColorStop(1, 'rgba(255,220,180,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  x.strokeStyle = 'rgba(255,255,255,0.95)';
  x.lineWidth = 6; x.lineCap = 'round';
  x.beginPath(); x.moveTo(18, 44); x.quadraticCurveTo(64, 58, 112, 92); x.stroke();
  x.beginPath(); x.moveTo(30, 100); x.quadraticCurveTo(64, 62, 104, 30); x.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// The scripted "kill moment": hitstop → slow-mo → snap-zoom onto the nape →
// slash flash + gore + shake → ease back to normal FPS control. It never
// leaves first person — it just hijacks the camera for ~0.6s real-time.
export class KillCam {
  constructor(scene, camera, steam) {
    this.scene = scene;
    this.camera = camera;
    this.steam = steam;
    this.active = false;
    this.elapsed = 0;   // real seconds since trigger
    this.timeScale = 1; // read by the main loop to scale game dt
    this.napePos = new THREE.Vector3();
    this.baseFov = 78;
    this.zoomFov = 48;

    this.flash = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: flashTexture(), transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
      })
    );
    this.flash.renderOrder = 20;
    this.flash.visible = false;
    scene.add(this.flash);

    this._q0 = new THREE.Quaternion();
    this._qLook = new THREE.Quaternion();
    this._m = new THREE.Matrix4();
    this._up = new THREE.Vector3(0, 1, 0);
    this._toN = new THREE.Vector3();
  }

  trigger(napePos) {
    if (this.active) return;
    this.active = true;
    this.elapsed = 0;
    this.napePos.copy(napePos);
    this.baseFov = this.camera.fov;
    this.flash.position.copy(napePos);
    this.flash.visible = true;
    this.flash.material.opacity = 0;
    if (this.steam) this._gore(napePos);
  }

  // Chunky dark-red flecks that spray from the cut and fall.
  _gore(p) {
    for (let i = 0; i < 26; i++) {
      const d = new THREE.Vector3(
        (Math.random() - 0.5) * 2, Math.random() * 1.2 + 0.1, (Math.random() - 0.5) * 2
      ).normalize().multiplyScalar(6 + Math.random() * 11);
      this.steam.emit(
        p.x, p.y, p.z, d.x, d.y, d.z,
        0.5 + Math.random() * 0.5, 0.7 + Math.random() * 0.5, 0.3, -2.2,
        0.9, 0.55, 0.06, 0.05
      );
    }
  }

  // Advance the timeline in REAL time (unaffected by the slow-mo it drives).
  update(realDt) {
    if (!this.active) return;
    this.elapsed += realDt;
    const s = this.elapsed;
    if (s < 0.05) this.timeScale = 0;                 // hitstop (freeze frame)
    else if (s < 0.5) this.timeScale = 0.22;          // slow-mo
    else if (s < 0.62) this.timeScale = 0.22 + ((s - 0.5) / 0.12) * 0.78; // ramp back
    else this.timeScale = 1;
    if (s >= 0.62) {
      this.active = false;
      this.timeScale = 1;
      this.flash.visible = false;
    }
  }

  // Called AFTER the FPS controller writes the camera, to override it.
  applyCamera(camera) {
    if (!this.active) return;
    const s = this.elapsed;
    // Zoom envelope: snap in, hold, ease out.
    let e;
    if (s < 0.05) e = 0;
    else if (s < 0.17) e = (s - 0.05) / 0.12;
    else if (s < 0.48) e = 1;
    else e = Math.max(0, 1 - (s - 0.48) / 0.14);
    e = Math.max(0, Math.min(1, e));
    const ease = e * e * (3 - 2 * e);

    const eye = camera.position;
    // Rotate toward the nape (mostly, not fully — keeps it grounded in FPS).
    this._q0.copy(camera.quaternion);
    this._m.lookAt(eye, this.napePos, this._up);
    this._qLook.setFromRotationMatrix(this._m);
    camera.quaternion.slerpQuaternions(this._q0, this._qLook, ease * 0.85);
    // Subtle dolly-in toward the nape, never closer than ~3.5 units.
    this._toN.copy(this.napePos).sub(eye);
    const dist = this._toN.length();
    const dolly = Math.min(dist * 0.3, Math.max(0, dist - 5.5)); // keep it framed, not a blur
    camera.position.addScaledVector(this._toN.normalize(), dolly * ease);
    // FOV punch-in.
    camera.fov = this.baseFov + (this.zoomFov - this.baseFov) * ease;
    // Impact shake, decaying over the first ~0.22s.
    const shake = Math.max(0, 1 - s / 0.22) * 0.22;
    if (shake > 0) {
      camera.position.x += (Math.random() - 0.5) * shake;
      camera.position.y += (Math.random() - 0.5) * shake;
    }
    camera.updateProjectionMatrix();

    // Flash: appears on connect, scales up and fades, always facing the camera.
    const fl = Math.max(0, 1 - (s - 0.05) / 0.24);
    this.flash.material.opacity = fl * 0.95;
    this.flash.scale.setScalar(3 + (1 - fl) * 6);
    this.flash.quaternion.copy(camera.quaternion);
  }
}
