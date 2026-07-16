import * as THREE from 'three';

// The opening breach, staged like the classic scene: a storm gathers, a
// lightning strike — and a colossal skinless giant is suddenly THERE, taller
// than the wall, steam pouring off its sinew. It kicks the gate through,
// debris rakes the district, titans pour in, and it vanishes into steam.
// All geometry and textures are procedural originals.

function muscleTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#7e2a20';
  x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 60; i++) {
    const sx = Math.random() * 256;
    x.strokeStyle = Math.random() < 0.5 ? 'rgba(168,67,53,0.7)' : 'rgba(95,26,18,0.75)';
    x.lineWidth = 3 + Math.random() * 6;
    x.beginPath();
    x.moveTo(sx, -10);
    x.bezierCurveTo(sx + (Math.random() - 0.5) * 40, 80, sx + (Math.random() - 0.5) * 40, 170, sx + (Math.random() - 0.5) * 30, 270);
    x.stroke();
  }
  for (let i = 0; i < 30; i++) {
    x.strokeStyle = 'rgba(212,110,90,0.5)';
    x.lineWidth = 1.5;
    const sx = Math.random() * 256;
    x.beginPath(); x.moveTo(sx, Math.random() * 256); x.lineTo(sx + (Math.random() - 0.5) * 8, Math.random() * 256); x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function colossalFace() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#8a3a2c';
  x.fillRect(0, 0, 128, 128);
  x.fillStyle = 'rgba(120,45,32,0.8)';
  for (let i = 0; i < 14; i++) x.fillRect(Math.random() * 128, 0, 3, 128);
  // sunken lidless eyes
  for (const ex of [40, 88]) {
    x.fillStyle = '#20100a';
    x.beginPath(); x.ellipse(ex, 44, 16, 12, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#e8e0d0';
    x.beginPath(); x.arc(ex, 44, 5.5, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#120806';
    x.beginPath(); x.arc(ex, 44, 2.6, 0, Math.PI * 2); x.fill();
  }
  // nose cavity
  x.fillStyle = 'rgba(40,16,10,0.9)';
  x.beginPath(); x.ellipse(64, 66, 6, 9, 0, 0, Math.PI * 2); x.fill();
  // lipless teeth band, gritted
  x.fillStyle = '#ded3c0';
  x.fillRect(18, 80, 92, 30);
  x.strokeStyle = '#5a3428';
  x.lineWidth = 2;
  for (let i = 0; i <= 11; i++) {
    x.beginPath(); x.moveTo(18 + i * 8.4, 80); x.lineTo(18 + i * 8.4, 110); x.stroke();
  }
  x.strokeStyle = '#40201a';
  x.strokeRect(18, 80, 92, 30);
  x.beginPath(); x.moveTo(18, 95); x.lineTo(110, 95); x.stroke();
  // cheek sinew over the jaw
  x.strokeStyle = 'rgba(95,26,18,0.8)';
  x.lineWidth = 4;
  for (const sx of [14, 114]) {
    x.beginPath(); x.moveTo(sx, 60); x.lineTo(sx + (sx < 64 ? 10 : -10), 112); x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildColossal() {
  const g = new THREE.Group();
  const tex = muscleTexture();
  const muscle = new THREE.MeshLambertMaterial({ map: tex, transparent: true });
  const muscleDark = new THREE.MeshLambertMaterial({ color: 0x5f1c12, transparent: true });
  const faceMat = new THREE.MeshLambertMaterial({ map: colossalFace(), transparent: true });
  const boneMat = new THREE.MeshLambertMaterial({ color: 0xd8cbb4, transparent: true });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xfff2d8, transparent: true });
  const mats = [muscle, muscleDark, faceMat, boneMat, glowMat];

  const add = (mesh) => { mesh.castShadow = true; g.add(mesh); return mesh; };
  // Legs & calves
  for (const s of [-1, 1]) {
    const leg = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.42, 4, 10), muscle));
    leg.position.set(s * 0.11, 0.27, 0);
    const calf = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.16, 4, 8), muscleDark));
    calf.position.set(s * 0.115, 0.17, -0.035);
  }
  const pelvis = add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.18), muscleDark));
  pelvis.position.y = 0.5;
  // Torso: broad chest, tapered waist
  const torso = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.3, 4, 12), muscle));
  torso.position.y = 0.72;
  torso.scale.set(1.4, 1, 0.78);
  // Abdominal plates (2 × 3 grid)
  for (let r = 0; r < 3; r++) {
    for (const s of [-1, 1]) {
      const ab = add(new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.055, 0.045), muscle));
      ab.position.set(s * 0.048, 0.685 - r * 0.062, 0.125);
    }
  }
  // Pectoral slabs
  for (const s of [-1, 1]) {
    const pec = add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.11, 0.06), muscle));
    pec.position.set(s * 0.09, 0.85, 0.12);
    pec.rotation.x = 0.15;
  }
  // Trapezius mass rising to the neck
  const traps = add(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.16), muscleDark));
  traps.position.set(0, 0.945, -0.01);
  traps.rotation.x = -0.15;
  // Shoulders, arms, forearms, hands
  for (const s of [-1, 1]) {
    const shoulder = add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), muscle));
    shoulder.position.set(s * 0.29, 0.9, 0);
    const arm = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.24, 4, 10), muscle));
    arm.position.set(s * 0.32, 0.72, 0);
    const fore = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.2, 4, 10), muscleDark));
    fore.position.set(s * 0.335, 0.52, 0.01);
    const hand = add(new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 7), muscleDark));
    hand.position.set(s * 0.34, 0.4, 0.02);
  }
  // Neck sinew
  const neck = add(new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.105, 0.12, 10), muscleDark));
  neck.position.y = 1.0;
  // Head with the painted face, lipless jaw
  const headMats = [muscle, muscle, muscle, muscle, faceMat, muscle];
  const head = add(new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.2, 0.18), headMats));
  head.position.set(0, 1.13, 0.01);
  const jaw = add(new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.05, 0.11), boneMat));
  jaw.position.set(0, 1.04, 0.055);
  // Glowing eyes (visible from the city far below)
  for (const s of [-1, 1]) {
    const eye = add(new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 6), glowMat));
    eye.position.set(s * 0.032, 1.145, 0.1);
  }
  g.scale.setScalar(78);
  return { group: g, mats };
}

export class Cinematic {
  // deps: { scene, world, odm, titans, npcs, hud, camera, player, now, audio }
  constructor(deps) {
    this.d = deps;
    this.active = false;
    this.t = 0;
    this.done = false;
    this.fired = {};
    this.debris = null;
    this.shake = 0;
    this.steamAccum = 0;
  }

  start() {
    const { scene, world } = this.d;
    this.active = true;
    this.t = 0;
    this.done = false;
    const built = buildColossal();
    this.colossal = built.group;
    this.colMats = built.mats;
    this.colossal.position.set(0, 0, 138);
    this.colossal.rotation.y = Math.PI; // facing the city
    this.colossal.visible = false;      // appears in the lightning strike
    scene.add(this.colossal);
    this.d.hud.setCinematic(true);
    this.d.hud.setSubtitle('');
    if (this.d.audio && this.d.audio.playRumble) this.d.audio.playRumble();
    // Houses to be smashed, spread from the wall deep into the district.
    const cands = world.buildings
      .filter((m) => m.position.z > -10 && Math.abs(m.position.x) < 70)
      .sort((a, b) => b.position.z - a.position.z);
    const picks = [];
    for (const band of [[80, 100], [50, 80], [25, 50], [0, 25], [-10, 25]]) {
      const inBand = cands.filter((m) => m.position.z >= band[0] && m.position.z < band[1] &&
        !picks.includes(m));
      if (inBand.length) picks.push(inBand[(Math.random() * inBand.length) | 0]);
    }
    this.crushTargets = picks;
  }

  fireOnce(key, fn) {
    if (!this.fired[key]) { this.fired[key] = true; fn(); }
  }

  appear() {
    // The lightning strike: flash, thunder, and the giant is simply THERE.
    this.colossal.visible = true;
    this.d.hud.flash();
    if (this.d.audio && this.d.audio.playThunder) this.d.audio.playThunder();
    this.shake = 0.8;
    // A jagged bolt of lightning strikes down where the giant appears.
    const pts = [];
    let bx = 0, by = 120, bz = 132;
    pts.push(new THREE.Vector3(bx, by, bz));
    while (by > 6) {
      by -= 8 + Math.random() * 8;
      bx += (Math.random() - 0.5) * 16;
      bz += (Math.random() - 0.5) * 6;
      pts.push(new THREE.Vector3(bx, by, bz));
    }
    const boltGeo = new THREE.BufferGeometry().setFromPoints(pts);
    this.bolt = new THREE.Line(boltGeo, new THREE.LineBasicMaterial({
      color: 0xfaf6ff, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthTest: false,
    }));
    this.bolt.renderOrder = 30;
    this.d.scene.add(this.bolt);
    this.boltT = 0;
    // A blast of hot vapour around the newly-formed body.
    for (let i = 0; i < 160; i++) {
      this.d.titans.steam.emit(
        (Math.random() - 0.5) * 44, 10 + Math.random() * 70, 130 + (Math.random() - 0.5) * 24,
        (Math.random() - 0.5) * 10, 2 + Math.random() * 9, (Math.random() - 0.5) * 10,
        2 + Math.random() * 2, 4 + Math.random() * 5, 4, 2, 0.6,
        0.95, 0.93, 0.9
      );
    }
  }

  breach() {
    const { scene, world, odm, titans, npcs } = this.d;
    world.breakWall(odm);
    if (this.d.audio && this.d.audio.playImpact) this.d.audio.playImpact();
    this.shake = 1.2;
    // Civilians stampede away from the gate.
    npcs.setPanic(0, 108, this.d.now() + 24);
    // Debris blasted deep into the city; the aimed chunks get a real
    // ballistic solution so they truly strike their houses.
    const count = 70;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshLambertMaterial({ color: 0x9a948a });
    const inst = new THREE.InstancedMesh(geo, mat, count);
    inst.castShadow = true;
    inst.frustumCulled = false;
    scene.add(inst);
    const G = 22;
    const chunks = [];
    for (let i = 0; i < count; i++) {
      const target = this.crushTargets[i] || null;
      const p = new THREE.Vector3((Math.random() - 0.5) * 20, 6 + Math.random() * 24, 108);
      let v;
      if (target) {
        const flight = 1.5 + Math.random() * 0.7;
        const aimY = target.userData.roofY + 1;
        v = new THREE.Vector3(
          (target.position.x - p.x) / flight,
          (aimY - p.y) / flight + 0.5 * G * flight,
          (target.position.z - p.z) / flight
        );
      } else {
        const reach = 25 + Math.random() * 95;
        const flight = 1.6 + Math.random() * 1.2;
        v = new THREE.Vector3(
          (Math.random() - 0.5) * 40,
          (12 - p.y) / flight + 0.5 * G * flight,
          -reach / flight
        );
      }
      chunks.push({ p, v, s: 0.7 + Math.random() * 2.4, target, landed: false, spin: (Math.random() - 0.5) * 6, rot: 0 });
    }
    this.debris = { inst, chunks, G };
    // Dust wall boiling out of the hole.
    for (let i = 0; i < 130; i++) {
      titans.steam.emit(
        (Math.random() - 0.5) * 28, Math.random() * 27, 108,
        (Math.random() - 0.5) * 8, 2 + Math.random() * 6, -(4 + Math.random() * 12),
        2 + Math.random() * 2, 3 + Math.random() * 3, 3.5, 1.5, 0.5,
        0.62, 0.58, 0.52
      );
    }
    npcs.crushNear(0, 90, 40, (p) => titans.gorePuff(p));
  }

  crushBuilding(mesh) {
    const { titans, world, odm, npcs } = this.d;
    const roofY = mesh.userData.roofY;
    world.wreckBuilding(mesh, odm); // real, varied, persistent damage
    if (this.d.audio && this.d.audio.playImpact) this.d.audio.playImpact();
    this.shake = Math.max(this.shake, 0.7);
    for (let i = 0; i < 70; i++) {
      titans.steam.emit(
        mesh.position.x + (Math.random() - 0.5) * (mesh.scale.x + 6),
        Math.random() * roofY,
        mesh.position.z + (Math.random() - 0.5) * (mesh.scale.z + 6),
        (Math.random() - 0.5) * 10, 2 + Math.random() * 7, (Math.random() - 0.5) * 10,
        1.8 + Math.random() * 1.8, 2.5 + Math.random() * 2.5, 3, 1.2, 0.6,
        0.6, 0.56, 0.5
      );
    }
    npcs.crushNear(mesh.position.x, mesh.position.z, 18, (p) => titans.gorePuff(p));
  }

  // Steam constantly pours off the giant's body while it stands there.
  emitBodySteam(realDt) {
    if (!this.colossal.visible) return;
    this.steamAccum += realDt * 26;
    while (this.steamAccum >= 1) {
      this.steamAccum -= 1;
      const up = 30 + Math.random() * 55; // upper body heights
      this.d.titans.steam.emit(
        (Math.random() - 0.5) * 34, up, 132 + (Math.random() - 0.5) * 18,
        (Math.random() - 0.5) * 2, 2.5 + Math.random() * 3.5, (Math.random() - 0.5) * 2,
        1.8 + Math.random() * 1.6, 3 + Math.random() * 3.4, 2.6, 1.6, 0.34,
        0.93, 0.92, 0.9
      );
    }
  }

  update(realDt) {
    if (!this.active) return;
    const { camera, hud, titans, player } = this.d;
    this.t += realDt;
    const t = this.t;
    this.shake = Math.max(0, this.shake - realDt * 1.3);
    this.emitBodySteam(realDt);

    // Lightning bolt flickers out over ~0.4s.
    if (this.bolt) {
      this.boltT += realDt;
      const f = Math.max(0, 1 - this.boltT / 0.4);
      this.bolt.material.opacity = f * (0.5 + 0.5 * Math.sin(this.boltT * 90));
      if (f <= 0) { this.d.scene.remove(this.bolt); this.bolt = null; }
    }

    // ---- staging ----
    if (t > 0.25) this.fireOnce('sub0', () => hud.setSubtitle('YEAR 845 — SHIGANSHINA DISTRICT'));
    if (t >= 1.1) this.fireOnce('appear', () => { this.appear(); hud.setSubtitle('THE COLOSSAL TITAN HAS APPEARED'); });
    if (t >= 3.4) this.fireOnce('kick', () => { this.breach(); hud.setSubtitle('WALL MARIA HAS BEEN BREACHED'); });
    if (t >= 5.4) this.fireOnce('enter', () => hud.setSubtitle('THE TITANS ARE ENTERING SHIGANSHINA'));
    if (t >= 6.6) this.fireOnce('invasion', () => { titans.beginInvasion(this.d.now()); hud.setSubtitle('GIVE YOUR HEARTS — SAVE THE CIVILIANS'); });
    if (t >= 8.8) {
      this.fireOnce('vanishSteam', () => {
        for (let i = 0; i < 280; i++) {
          titans.steam.emit(
            (Math.random() - 0.5) * 44, 15 + Math.random() * 70, 130 + (Math.random() - 0.5) * 20,
            (Math.random() - 0.5) * 6, 3 + Math.random() * 8, (Math.random() - 0.5) * 6,
            2.5 + Math.random() * 2, 5 + Math.random() * 5, 5, 2, 0.6,
            0.92, 0.92, 0.9
          );
        }
        hud.setSubtitle('');
      });
      const fade = Math.max(0, 1 - (t - 8.8) / 2.2);
      for (const m of this.colMats) m.opacity = fade;
      if (fade <= 0) this.fireOnce('gone', () => this.d.scene.remove(this.colossal));
    }

    // ---- debris physics: fly, strike, then ALWAYS come to rest on something ----
    if (this.debris) {
      const { inst, chunks, G } = this.debris;
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
      const cols = this.d.world.colliders;
      chunks.forEach((c, i) => {
        if (!c.landed) {
          c.v.y -= G * realDt;
          c.p.addScaledVector(c.v, realDt);
          c.rot += c.spin * realDt;
          // Aimed strike: wreck the house, shed speed, keep falling.
          if (c.target && !c.target.userData.wrecked) {
            const b = c.target;
            if (Math.abs(c.p.x - b.position.x) < b.scale.x / 2 + 1.5 &&
                Math.abs(c.p.z - b.position.z) < b.scale.z / 2 + 1.5 &&
                c.p.y < b.userData.roofY + 1.5) {
              this.crushBuilding(b);
              c.v.multiplyScalar(0.3);
            }
          }
          // Rest on whatever is underneath: a wreck's stump or the street.
          if (c.v.y < 0) {
            for (const col of cols) {
              if (c.p.x > col.min.x && c.p.x < col.max.x &&
                  c.p.z > col.min.z && c.p.z < col.max.z &&
                  c.p.y - c.s * 0.35 <= col.max.y && c.p.y > col.max.y - 3) {
                c.p.y = col.max.y + c.s * 0.35;
                c.landed = true;
                break;
              }
            }
          }
          if (!c.landed && c.p.y <= c.s / 2) {
            c.p.y = c.s / 2;
            c.landed = true;
            // Big street stones become solid obstacles.
            if (c.s >= 1.3) {
              cols.push(new THREE.Box3(
                new THREE.Vector3(c.p.x - c.s / 2, 0, c.p.z - c.s / 2),
                new THREE.Vector3(c.p.x + c.s / 2, c.s, c.p.z + c.s / 2)
              ));
            }
          }
        }
        q.setFromEuler(new THREE.Euler(c.rot, c.rot * 0.7, c.rot * 0.4));
        m.compose(c.p, q, s.set(c.s, c.s, c.s));
        inst.setMatrixAt(i, m);
      });
      inst.instanceMatrix.needsUpdate = true;
    }

    // ---- camera ----
    if (t < 8.8) {
      const cx = Math.sin(t * 0.12) * 3;
      camera.position.set(cx, 6.5 + t * 0.55, 52 - t * 0.6);
      const lookY = t < 1.1 ? 42 : 56 + Math.min(10, (t - 1.1) * 4);
      camera.lookAt(0, t < 3.4 ? lookY : 30, 116);
    } else {
      const k = Math.min(1, (t - 8.8) / 3.4);
      const e = k * k * (3 - 2 * k);
      const px = player.pos.x, py = player.pos.y + 0.7, pz = player.pos.z;
      camera.position.set(
        (1 - e) * Math.sin(t * 0.12) * 3 + e * px,
        (1 - e) * (6.5 + 8.8 * 0.55) + e * py,
        (1 - e) * (52 - 8.8 * 0.6) + e * pz
      );
      camera.lookAt((1 - e) * 0 + e * px, (1 - e) * 30 + e * py, (1 - e) * 116 + e * (pz - 4));
    }
    if (this.shake > 0) {
      camera.position.x += (Math.random() - 0.5) * this.shake * 1.6;
      camera.position.y += (Math.random() - 0.5) * this.shake * 1.6;
    }

    if (t >= 12.4) this.finish();
  }

  skip() {
    if (!this.active) return;
    this.fireOnce('appear', () => {});
    this.fireOnce('kick', () => this.breach());
    this.fireOnce('invasion', () => this.d.titans.beginInvasion(this.d.now()));
    this.fireOnce('gone', () => this.d.scene.remove(this.colossal));
    if (this.debris) {
      for (const c of this.debris.chunks) {
        if (c.target && !c.target.userData.wrecked) this.crushBuilding(c.target);
        if (!c.landed) { c.p.y = c.s / 2; c.landed = true; }
      }
    }
    this.finish();
  }

  finish() {
    this.active = false;
    this.done = true;
    this.d.hud.setCinematic(false);
    this.d.hud.setSubtitle('');
    // Final settle: a stone that was resting on a roof that later collapsed
    // must drop with it — nothing may hang in the air.
    if (this.debris) {
      const { inst, chunks } = this.debris;
      const cols = this.d.world.colliders;
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
      chunks.forEach((c, i) => {
        let rest = c.s / 2; // the street
        for (const col of cols) {
          if (c.p.x > col.min.x && c.p.x < col.max.x &&
              c.p.z > col.min.z && c.p.z < col.max.z &&
              col.max.y + c.s * 0.35 <= c.p.y + 0.8) {
            rest = Math.max(rest, col.max.y + c.s * 0.35);
          }
        }
        c.p.y = rest;
        c.landed = true;
        q.setFromEuler(new THREE.Euler(c.rot, c.rot * 0.7, c.rot * 0.4));
        m.compose(c.p, q, s.set(c.s, c.s, c.s));
        inst.setMatrixAt(i, m);
      });
      inst.instanceMatrix.needsUpdate = true;
    }
  }
}
