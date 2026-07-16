import * as THREE from 'three';
import { SteamSystem } from './steam.js';

// Value-noise used by the death dissolve to eat the mesh away in organic
// speckles rather than a clean wipe.
const DISSOLVE_GLSL = `
float dHash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float dNoise(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(dHash(i+vec3(0,0,0)),dHash(i+vec3(1,0,0)),f.x),
                 mix(dHash(i+vec3(0,1,0)),dHash(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(dHash(i+vec3(0,0,1)),dHash(i+vec3(1,0,1)),f.x),
                 mix(dHash(i+vec3(0,1,1)),dHash(i+vec3(1,1,1)),f.x),f.y),f.z); }
`;

function patchDissolve(material, uDissolve) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uDissolve = uDissolve;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDisPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDisPos = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>',
        '#include <common>\nvarying vec3 vDisPos;\nuniform float uDissolve;\n' + DISSOLVE_GLSL)
      .replace('#include <clipping_planes_fragment>',
        'float dN = dNoise(vDisPos * 7.0);\n if (dN < uDissolve) discard;\n#include <clipping_planes_fragment>')
      .replace('#include <dithering_fragment>',
        '#include <dithering_fragment>\n if (uDissolve > 0.0) {\n' +
        '   float edge = smoothstep(uDissolve + 0.14, uDissolve, dN);\n' +
        '   gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0, 0.5, 0.15) * 2.4, edge);\n' +
        ' }');
  };
  material.needsUpdate = true;
}

export const TTUNE = {
  detectRange: 52,
  wanderSpeed: 2.2,     // roaming titans cover ground and spread out fast
  chaseSpeed: 1.6,
  travelMul: 2.8,       // far from its prey a titan strides; it slows up close
  travelFar: 42,        // distance at which travelMul is in full effect
  travelNear: 9,        // inside this it's back to a careful lumber
  maxMove: 15,          // hard cap — even a sprinting abnormal tops out here
  enterSpeed: 7.0,      // marching in through the breach
  reactionDelay: 2.6,
  turnRate: 0.1,        // base; each titan has its own turnMul
  grabRange: 3.8,
  grabDamage: 15,
  grabCooldown: 3.0,
  eatExposure: 3.0,     // linger near a titan this long and it grabs you
  slashRange: 11,
  slashSpeedReq: 9,
  napeCutRadius: 1.9,
  slashRearDot: 0.45,
  budget: 30,           // total titans that invade; kill them all to win
  maxActive: 14,        // concurrent cap — enough to fill the whole district
  waveInterval: 14,     // seconds between waves through the hole
  death: { still: 2, kneel: 2, prone: 2, steam: 5, evap: 10 },
};

const D = TTUNE.death;
const DEATH = {
  stillEnd: D.still,
  kneelEnd: D.still + D.kneel,
  proneEnd: D.still + D.kneel + D.prone,
  steamEnd: D.still + D.kneel + D.prone + D.steam,
  evapEnd: D.still + D.kneel + D.prone + D.steam + D.evap,
};
// Grab-and-eat timeline (seconds since grab)
// Player gets eaten fast. NPCs are held aloft, thrashing, for several seconds
// first — that's the window to fly over and cut the titan's nape to rescue.
const EAT = { reach: 0.8, lift: 1.7, chomp: 2.2, done: 3.0 };
const EAT_NPC = { reach: 1.4, lift: 4.5, chomp: 15.0, done: 16.0 };

function seg(x, a, b) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _toP = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _close = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _head = new THREE.Vector3();
const _hand = new THREE.Vector3();

let nextId = 1;

// Procedural face: wide unblinking eyes and a bare-toothed grin — an original
// stylized giant, creepy in the way oversized humans are.
function faceTexture(rand) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#b59376';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = 'rgba(90,60,45,0.25)';
  ctx.beginPath(); ctx.ellipse(30, 66, 14, 20, 0.3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(98, 66, 14, 20, -0.3, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#5a3c2a';
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(22, 38); ctx.lineTo(56, 34); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(72, 34); ctx.lineTo(106, 38); ctx.stroke();
  for (const ex of [40, 88]) {
    ctx.fillStyle = '#e8e2d4';
    ctx.beginPath(); ctx.ellipse(ex, 50, 13, 9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3a2c20';
    ctx.beginPath(); ctx.arc(ex + (rand() - 0.5) * 6, 50, 4.2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(70,45,30,0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(ex, 50, 13, 9, 0, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(90,60,45,0.55)';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(64, 54); ctx.lineTo(62, 74); ctx.stroke();
  ctx.fillStyle = '#3c2620';
  ctx.beginPath();
  ctx.moveTo(18, 88);
  ctx.quadraticCurveTo(64, 108, 110, 88);
  ctx.quadraticCurveTo(64, 118, 18, 88);
  ctx.fill();
  ctx.fillStyle = '#d8cfc0';
  for (let i = 0; i < 10; i++) {
    const t = i / 9;
    const x = 24 + t * 80;
    const y = 88 + Math.sin(t * Math.PI) * 12;
    ctx.fillRect(x, y - 4, 6.5, 9);
  }
  ctx.strokeStyle = 'rgba(40,25,20,0.8)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(18, 88);
  ctx.quadraticCurveTo(64, 108, 110, 88);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

class Titan {
  constructor(scene, x, z, height, rand, opts = {}) {
    this.id = nextId++;
    this.h = height;
    this.abnormal = !!opts.abnormal;
    this.girth = opts.girth || 1;
    this.napeHP = opts.napeHP || 1;
    this.speedMul = opts.speedMul || 1;
    this.turnMul = opts.turnMul || 1;   // per-titan turning personality
    this.staggerUntil = -1;
    this.eating = null;                  // { kind, ref, setPos, t }
    this.target = null;                  // { kind, ref } current chase target
    this.retargetAIAt = 0;
    this.stuckT = 0;                     // seconds it has failed to make progress
    this.lastStuckPos = new THREE.Vector3(x, 0, z);
    this.stuckCheckAt = 0;
    this.alive = true;
    this.dying = false;
    this.deadAt = -1;
    this.fallT = 0;
    this.attackReadyAt = 0;
    this.aggro = false;
    this.aggroReadyAt = 0;
    this.phase = rand() * 10;
    this.wanderTarget = new THREE.Vector3(x, 0, z);
    this.retargetAt = 0;
    this.parts = [];

    const hue = this.abnormal ? 0.04 + (rand() - 0.5) * 0.02 : 0.065 + (rand() - 0.5) * 0.035;
    const sat = this.abnormal ? 0.42 : 0.26 + rand() * 0.14;
    const light = (this.abnormal ? 0.5 : 0.55) + (rand() - 0.5) * 0.14;
    const skin = new THREE.MeshLambertMaterial({ color: new THREE.Color().setHSL(hue, sat, light) });
    const skinDark = new THREE.MeshLambertMaterial({ color: new THREE.Color().setHSL(hue, sat + 0.03, light - 0.12) });
    const hairMat = new THREE.MeshLambertMaterial({ color: new THREE.Color().setHSL(0.02 + rand() * 0.1, 0.3 + rand() * 0.3, 0.1 + rand() * 0.22) });
    const gir = this.girth;
    const headScale = 0.85 + rand() * 0.4;

    const g = new THREE.Group();
    this.group = g;
    g.position.set(x, 0, z);

    const tag = (mesh) => {
      mesh.userData.titanPart = true;
      mesh.userData.titanRoot = g;
      mesh.userData.titan = this;
      mesh.castShadow = true;
      this.parts.push(mesh);
      return mesh;
    };

    this.legs = [];
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.085, 0.5, 0);
      const thigh = tag(new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.42, 4, 8), skinDark));
      thigh.position.y = -0.25;
      pivot.add(thigh);
      const knee = tag(new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), skinDark));
      knee.position.y = -0.30;
      pivot.add(knee);
      g.add(pivot);
      this.legs.push(pivot);
    }

    const hips = tag(new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.14, 0.17), skinDark));
    hips.position.y = 0.53;
    g.add(hips);
    const torso = tag(new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.24, 4, 10), skin));
    torso.position.set(0, 0.72, -0.01);
    torso.rotation.x = 0.14;
    torso.scale.set(1.15, 1, 0.8);
    g.add(torso);
    const chest = tag(new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.16, 0.06), skin));
    chest.position.set(0, 0.80, 0.10);
    g.add(chest);

    this.arms = [];
    this.hands = [];
    for (const side of [-1, 1]) {
      const shoulder = tag(new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), skin));
      shoulder.position.set(side * 0.225, 0.86, 0);
      g.add(shoulder);
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.235, 0.85, 0);
      const arm = tag(new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.40, 4, 8), skin));
      arm.position.y = -0.24;
      pivot.add(arm);
      const hand = tag(new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), skinDark));
      hand.position.y = -0.47;
      pivot.add(hand);
      pivot.rotation.z = -side * 0.08;
      g.add(pivot);
      this.arms.push(pivot);
      this.hands.push(hand);
    }

    const neck = tag(new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.10, 8), skin));
    neck.position.set(0, 0.93, 0.01);
    g.add(neck);
    const faceMat = new THREE.MeshLambertMaterial({ map: faceTexture(rand) });
    const headMats = [skin, skin, skin, skin, faceMat, skin];
    const head = tag(new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.24, 0.21), headMats));
    head.position.set(0, 1.03, 0.02);
    head.scale.setScalar(headScale);
    g.add(head);
    this.head = head;
    const hair = tag(new THREE.Mesh(new THREE.BoxGeometry(0.225, 0.08, 0.225), hairMat));
    hair.position.set(0, 1.13 + 0.02 * headScale, 0.01);
    hair.scale.set(headScale, 1, headScale);
    g.add(hair);
    for (const side of [-1, 1]) {
      const ear = tag(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.06, 0.05), skin));
      ear.position.set(side * 0.115, 1.02, 0.02);
      g.add(ear);
    }

    this.napeMat = new THREE.MeshBasicMaterial({ color: 0xd44a3a });
    this.nape = tag(new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.14, 0.05), this.napeMat));
    this.nape.position.set(0, 0.92, -0.10);
    g.add(this.nape);

    this.uDissolve = { value: -1.0 };
    this.mats = [skin, skinDark, hairMat, faceMat, this.napeMat];
    for (const m of this.mats) patchDissolve(m, this.uDissolve);

    this.wispAccum = 0;
    this.columnAccum = 0;

    g.scale.set(height * gir, height, height * gir);
    scene.add(g);
    g.updateMatrixWorld(true);
  }

  napeWorld(out) {
    return this.nape.getWorldPosition(out);
  }

  handWorld(out, side = 1) {
    return this.hands[side].getWorldPosition(out);
  }

  // ---- Grab & eat: reach out, lift the victim to the mouth, chomp ----
  startEat(kind, ref, setPos) {
    if (this.eating || !this.alive) return false;
    const T = kind === 'player' ? EAT : EAT_NPC;
    this.eating = { kind, ref, setPos, t: 0, chomped: false, T };
    ref.beingEaten = true;
    ref.grabbedBy = this;
    ref.grabbedAt = performance.now() / 1000;
    return true;
  }

  updateEat(dt, time, steam, cbs) {
    const e = this.eating;
    const T = e.T;
    e.t += dt;
    // Arm reaches forward, then curls the hand up to the mouth.
    const reach = seg(e.t, 0, T.reach);
    const lift = seg(e.t, T.reach, T.lift);
    const arm = this.arms[1];
    arm.rotation.x = 1.5 * reach + 0.95 * lift; // forward, then up to the face
    arm.rotation.z = -0.08 - 0.45 * lift;       // curl inward toward the mouth
    this.head.rotation.x = 0.25 * lift;         // tilt down to meet the hand
    this.arms[0].rotation.x = 0.4 * reach;

    // The victim rides in the hand — thrashing if it's a helpless NPC.
    this.handWorld(_hand, 1);
    _hand.y -= 0.03 * this.h;
    if (!e.chomped && e.kind !== 'player') {
      _hand.x += Math.sin(time * 12) * 0.04 * this.h;
    }
    if (!e.chomped) e.setPos(_hand);

    if (!e.chomped && e.t >= T.chomp) {
      e.chomped = true;
      if (cbs && cbs.onEaten) cbs.onEaten(e.kind, e.ref, this, _hand.clone());
    }
    if (e.t >= T.done) {
      if (e.ref) e.ref.beingEaten = false;
      this.eating = null;
      this.head.rotation.x = 0;
      this.arms[1].rotation.z = -0.08;
      this.attackReadyAt = time + 1.2;
    }
  }

  // Pick who to lumber after. Each victim is CLAIMED by exactly one titan —
  // if someone is already being hunted, the others walk on past and find their
  // own prey, which is what spreads them across the district.
  pickTarget(time, player, npcs, mgr) {
    if (time < this.retargetAIAt) return;
    this.retargetAIAt = time + 0.6;
    // Keep an existing, still-valid claim rather than thrashing.
    if (this.target) {
      const r = this.target.ref;
      const stillOk = this.target.kind === 'player'
        ? true
        : (r.alive && !r.beingEaten);
      if (stillOk && mgr.claimOwner(r) === this) return;
    }
    const gp = this.group.position;
    let best = null, bestScore = Infinity;
    const consider = (kind, ref, pos, weight, maxR) => {
      if (!mgr.claimFree(ref, this)) return; // someone else already has them
      const d = Math.hypot(pos.x - gp.x, pos.z - gp.z);
      if (d > maxR) return;
      const s = d * weight;
      if (s < bestScore) { bestScore = s; best = { kind, ref }; }
    };
    consider('player', player, player.pos, 1.0, this.abnormal ? TTUNE.detectRange * 1.4 : TTUNE.detectRange);
    if (npcs) {
      for (const c of npcs.civilians) {
        if (c.alive && !c.beingEaten) consider('civ', c, c.group.position, 0.7, TTUNE.detectRange * 1.6);
      }
      for (const s of npcs.scouts) {
        if (s.alive && !s.beingEaten) consider('scout', s, s.group.position, 0.85, TTUNE.detectRange * 1.4);
      }
    }
    mgr.releaseClaimsOf(this);
    this.target = best;
    if (best) mgr.setClaim(best.ref, this);
  }

  update(dt, time, player, colliders, onGrab, hookedToMe, steam, npcs, cbs, mgr) {
    if (this.dying) {
      this.updateDeath(dt, time, steam);
      return;
    }
    if (steam) this.emitWisps(dt, steam);

    // Marching in through the breach — no targeting until it's inside.
    if (this.entering) {
      const gp = this.group.position;
      _n.set(this.enterTarget.x - gp.x, 0, this.enterTarget.z - gp.z);
      const d = _n.length();
      _n.divideScalar(d || 1);
      gp.addScaledVector(_n, Math.min(TTUNE.enterSpeed * this.speedMul, TTUNE.maxMove) * dt);
      const yaw = Math.atan2(_n.x, _n.z);
      let dy = yaw - this.group.rotation.y;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      this.group.rotation.y += dy * Math.min(1, dt * 2);
      this.phase += dt * 5;
      const sw = Math.sin(this.phase) * 0.4;
      this.legs[0].rotation.x = sw; this.legs[1].rotation.x = -sw;
      this.arms[0].rotation.x = -sw * 0.65; this.arms[1].rotation.x = sw * 0.65;
      gp.y = Math.abs(Math.sin(this.phase)) * 0.018 * this.h;
      // Done the moment it's through the gate (inside the district), or after
      // the deadline — it can never get stuck out at the wall.
      if (gp.z < 104 || time > this.enterDeadline) this.entering = false;
      return;
    }

    // Eating: rooted in place, nape wide open — the kill window.
    if (this.eating) {
      this.updateEat(dt, time, steam, cbs);
      return;
    }

    if (time < this.staggerUntil) {
      this.phase += dt * 8;
      this.group.rotation.z = Math.sin(this.phase) * 0.06;
      this.napeMat.color.setHSL(0.02, 0.9, 0.55 + 0.2 * Math.sin(time * 14));
      return;
    }
    this.group.rotation.z = 0;

    if (hookedToMe) {
      this.phase += dt * 5;
      const flail = Math.sin(this.phase) * 0.5;
      this.arms[0].rotation.x = flail;
      this.arms[1].rotation.x = -flail;
      this.napeMat.color.setHSL(0.02, 0.85, 0.5 + 0.2 * Math.sin(time * 9));
      return;
    }

    this.pickTarget(time, player, npcs, mgr);

    let speed;
    if (this.target) {
      const tp = this.target.kind === 'player' ? player.pos : this.target.ref.group.position;
      _toP.copy(tp).sub(this.group.position);
      const reaction = this.abnormal ? TTUNE.reactionDelay * 0.25 : TTUNE.reactionDelay;
      if (!this.aggro) {
        if (this.aggroReadyAt === 0) this.aggroReadyAt = time + reaction;
        if (time >= this.aggroReadyAt) this.aggro = true;
      }
      _n.set(_toP.x, 0, _toP.z).normalize();
      // Stride while crossing the district, lumber once on top of the prey.
      const far = Math.hypot(_toP.x, _toP.z);
      const k = Math.max(0, Math.min(1, (far - TTUNE.travelNear) / (TTUNE.travelFar - TTUNE.travelNear)));
      const travel = 1 + (TTUNE.travelMul - 1) * k;
      speed = (this.aggro ? TTUNE.chaseSpeed : 0) * this.speedMul * travel;

      // Snatch NPC prey with the hands when close enough.
      const dist = Math.hypot(_toP.x, _toP.z);
      const reach = TTUNE.grabRange + 0.06 * this.h;
      if (this.target.kind !== 'player' && dist < reach && time > this.attackReadyAt) {
        const ref = this.target.ref;
        if (ref.alive && !ref.beingEaten && ref.group.position.y < this.h * 0.95) {
          this.startEat(this.target.kind, ref, (v) => ref.group.position.copy(v));
          this.target = null;
          return;
        }
      }
      // Player brushes: the swipe (damage + fling) stays; the full grab-and-eat
      // is driven by the exposure timer in main.
      if (this.target && this.target.kind === 'player' &&
          dist < reach && player.pos.y < this.h * 0.55 && time > this.attackReadyAt) {
        this.attackReadyAt = time + TTUNE.grabCooldown;
        onGrab(this);
      }
    } else {
      this.aggro = false;
      this.aggroReadyAt = 0;
      if (time > this.retargetAt ||
          this.group.position.distanceTo(this.wanderTarget) < 3) {
        this.wanderTarget.set(
          (Math.random() - 0.5) * 180, 0, (Math.random() - 0.5) * 180
        );
        this.retargetAt = time + 14 + Math.random() * 12;
      }
      _n.copy(this.wanderTarget).sub(this.group.position).setY(0);
      const farW = _n.length();
      _n.normalize();
      // Stride toward distant wander goals too — this is what disperses them.
      const kw = Math.max(0, Math.min(1, (farW - TTUNE.travelNear) / (TTUNE.travelFar - TTUNE.travelNear)));
      speed = TTUNE.wanderSpeed * this.speedMul * (1 + (TTUNE.travelMul - 1) * kw);
    }

    // Step, but don't walk into buildings — try full move, then axis slides.
    speed = Math.min(speed, TTUNE.maxMove);
    const px = this.group.position.x + _n.x * speed * dt;
    const pz = this.group.position.z + _n.z * speed * dt;
    const r = 0.13 * this.h * this.girth;
    if (!this.blocked(px, pz, r, colliders)) {
      this.group.position.x = px;
      this.group.position.z = pz;
    } else if (!this.blocked(px, this.group.position.z, r, colliders)) {
      this.group.position.x = px;
      this.retargetAt = Math.min(this.retargetAt, time + 1);
    } else if (!this.blocked(this.group.position.x, pz, r, colliders)) {
      this.group.position.z = pz;
      this.retargetAt = Math.min(this.retargetAt, time + 1);
    } else {
      this.retargetAt = time;
    }
    this.group.position.x = Math.max(-105, Math.min(105, this.group.position.x));
    this.group.position.z = Math.max(-105, Math.min(104, this.group.position.z));

    // Anti-stuck: if it wants to move (speed>0) but has barely progressed for a
    // while, it's wedged — pick the clearest escape direction and shove out.
    if (time > this.stuckCheckAt) {
      const moved = this.group.position.distanceTo(this.lastStuckPos);
      if (speed > 0.5 && moved < 1.2) {
        this.stuckT += time - (this.stuckCheckAt - 0.5);
      } else {
        this.stuckT = 0;
      }
      this.lastStuckPos.copy(this.group.position);
      this.stuckCheckAt = time + 0.5;
      if (this.stuckT > 1.4) {
        this.escapeStuck(colliders);
        this.stuckT = 0;
        // Head somewhere open and far so it doesn't re-wedge instantly.
        this.wanderTarget.set((Math.random() - 0.5) * 170, 0, (Math.random() - 0.5) * 170);
        this.retargetAt = time + 8;
        this.target = null;
      }
    }

    // Ponderous turn (forward is +z), personality via turnMul.
    const targetYaw = Math.atan2(_n.x, _n.z);
    let dy = targetYaw - this.group.rotation.y;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.group.rotation.y += dy * Math.min(1, dt * TTUNE.turnRate * this.turnMul);

    this.phase += dt * Math.max(speed, 0.2) * 1.7;
    const swing = Math.sin(this.phase) * 0.38;
    this.legs[0].rotation.x = swing;
    this.legs[1].rotation.x = -swing;
    this.arms[0].rotation.x = -swing * 0.65;
    this.arms[1].rotation.x = swing * 0.65;
    this.group.position.y = Math.abs(Math.sin(this.phase)) * 0.018 * this.h;

    this.napeMat.color.setHSL(0.02, 0.75, 0.45 + 0.15 * Math.sin(time * 5 + this.id));
  }

  blocked(x, z, r, colliders) {
    for (const b of colliders) {
      if (x + r > b.min.x && x - r < b.max.x && z + r > b.min.z && z - r < b.max.z) return true;
    }
    return false;
  }

  // Wedged between buildings: probe 16 directions and slide out along the one
  // with the most open room, so no titan can ever stay stuck.
  escapeStuck(colliders) {
    const gp = this.group.position;
    const r = 0.13 * this.h * this.girth;
    let bestDir = null, bestClear = -1;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const dx = Math.sin(a), dz = Math.cos(a);
      let clear = 0;
      for (let s = 2; s <= 26; s += 2) {
        if (this.blocked(gp.x + dx * s, gp.z + dz * s, r, colliders)) break;
        clear = s;
      }
      if (clear > bestClear) { bestClear = clear; bestDir = [dx, dz]; }
    }
    if (bestDir && bestClear > 0) {
      const step = Math.min(bestClear, 5);
      gp.x += bestDir[0] * step;
      gp.z += bestDir[1] * step;
      gp.x = Math.max(-105, Math.min(105, gp.x));
      gp.z = Math.max(-105, Math.min(104, gp.z));
    }
  }

  emitWisps(dt, steam) {
    this.wispAccum += dt * 9;
    const gp = this.group.position, h = this.h;
    while (this.wispAccum >= 1) {
      this.wispAccum -= 1;
      const px = gp.x + (Math.random() - 0.5) * 0.34 * h;
      const pz = gp.z + (Math.random() - 0.5) * 0.34 * h;
      const py = gp.y + (0.35 + Math.random() * 0.62) * h;
      steam.emit(
        px, py, pz,
        (Math.random() - 0.5) * 1.2, 0.5 + Math.random() * 1.2, (Math.random() - 0.5) * 1.2,
        1.1 + Math.random() * 0.9,
        0.06 * h + Math.random() * 0.05 * h,
        0.05 * h, 0.7, 0.16,
        0.85, 0.86, 0.82
      );
    }
  }

  updateDeath(dt, time, steam) {
    const td = time - this.deadAt;
    const h = this.h;
    const pKneel = seg(td, DEATH.stillEnd, DEATH.kneelEnd);
    const pProne = seg(td, DEATH.kneelEnd, DEATH.proneEnd);
    let dyaw = this.fallYaw - this.startYaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    this.group.rotation.y = this.startYaw + dyaw * seg(td, 0, DEATH.kneelEnd);
    const pitch = 0.7 * pKneel + (Math.PI / 2 - 0.7) * pProne;
    this.group.rotation.x = pitch;
    this.group.rotation.z = this.fallRoll * pKneel;
    this.group.position.y = -0.08 * h * pKneel * (1 - pProne) + 0.17 * h * pProne;
    const legFold = 1.15 * pKneel * (1 - pProne);
    this.legs[0].rotation.x = legFold;
    this.legs[1].rotation.x = legFold * 0.85;
    for (const a of this.arms) a.rotation.x += (0.2 - a.rotation.x) * Math.min(1, dt * 4);

    this.uDissolve.value = Math.max(-1, Math.min(1.05,
      (td - DEATH.steamEnd) / (DEATH.evapEnd - DEATH.steamEnd)));

    if (steam) {
      const gp = this.group.position;
      if (td < DEATH.proneEnd) this.columnAccum += dt * 16;
      else this.columnAccum += dt * (td > DEATH.steamEnd ? 95 : 130);
      const prone = td >= DEATH.proneEnd;
      while (this.columnAccum >= 1) {
        this.columnAccum -= 1;
        const rad = Math.random() * 0.3 * h;
        const ang = Math.random() * Math.PI * 2;
        const spread = prone ? 0.5 * h : 0.2 * h;
        const bx = gp.x + (Math.random() - 0.5) * spread;
        const bz = gp.z + (Math.random() - 0.5) * spread;
        const by = gp.y + (prone ? 0.15 : Math.random() * 0.9) * h;
        const heavy = td >= DEATH.proneEnd;
        steam.emit(
          bx + Math.cos(ang) * rad * 0.3, by, bz + Math.sin(ang) * rad * 0.3,
          Math.cos(ang) * 1.2, (heavy ? 4 : 1.2) + Math.random() * (heavy ? 6 : 2), Math.sin(ang) * 1.2,
          1.4 + Math.random() * 1.3,
          (heavy ? 0.12 : 0.07) * h + Math.random() * 0.06 * h,
          0.13 * h,
          heavy ? 2.8 : 1.0,
          heavy ? 0.5 : 0.22,
          0.9, 0.91, 0.88
        );
      }
    }
  }

  kill(time, colliders) {
    this.alive = false;
    this.dying = true;
    this.deadAt = time;
    this.napeMat.color.set(0x2a2a2a);
    this.fallRoll = (Math.random() - 0.5) * 0.2;
    this.startYaw = this.group.rotation.y;
    this.fallYaw = colliders ? this.pickFallYaw(colliders) : this.startYaw;
    // Anyone in its hand is dropped — killing an eater RESCUES the victim.
    if (this.eating) {
      const e = this.eating;
      if (e.ref && !e.chomped) {
        e.ref.beingEaten = false;
        e.ref.justFreed = true;
      }
      this.eating = null;
    }
    this.head.rotation.x = 0;
  }

  pickFallYaw(colliders) {
    const base = this.group.position;
    const reach = this.h * 0.9;
    let bestYaw = this.group.rotation.y, best = -1;
    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2;
      const dx = Math.sin(ang), dz = Math.cos(ang);
      let clear = reach;
      for (let s = 2.5; s <= reach; s += 1.5) {
        if (this.blocked(base.x + dx * s, base.z + dz * s, 1.2, colliders)) { clear = s; break; }
      }
      if (clear > best) { best = clear; bestYaw = Math.atan2(dx, dz); }
    }
    return bestYaw;
  }
}

export class TitanManager {
  constructor(scene, world, odm, hud) {
    this.scene = scene;
    this.world = world;
    this.odm = odm;
    this.hud = hud;
    this.titans = [];
    this.steam = new SteamSystem(scene, 1600);
    this.kills = 0;
    this.spawned = 0;
    this.nextWaveAt = Infinity; // armed by the breach cinematic
    this.claims = new Map();    // victim ref -> the one titan hunting them
    world.titanBodies = [];

    // Roughly every 4th arrival is an ABNORMAL (≈10 of 40), alternating 2/3
    // nape cuts. Some of them run.
    this.abnormalOrder = new Set();
    for (let i = 2; i < TTUNE.budget; i += 4) this.abnormalOrder.add(i);
    this.abSeen = 0;

    let seed = 0x5eed1234;
    this.rand = () => {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    // A grid of home sectors covering the WHOLE district (never the plaza), so
    // each arrival strides off to a different quarter of Shiganshina.
    this.sectors = [];
    for (const sx of [-85, -55, -25, 25, 55, 85]) {
      for (const sz of [-85, -50, -15, 20, 55, 90]) {
        if (Math.abs(sx) < 30 && Math.abs(sz) < 30) continue; // keep the plaza clear
        this.sectors.push([sx, sz]);
      }
    }
    // Shuffle deterministically so consecutive spawns diverge.
    for (let i = this.sectors.length - 1; i > 0; i--) {
      const j = (this.rand() * (i + 1)) | 0;
      [this.sectors[i], this.sectors[j]] = [this.sectors[j], this.sectors[i]];
    }
    this.sectorPick = 0;
  }

  // The wall is breached — titans start pouring in.
  beginInvasion(time) {
    if (this.nextWaveAt === Infinity) this.nextWaveAt = time;
  }

  // ---- target claims: exactly one titan per victim ----
  claimOwner(ref) {
    const t = this.claims.get(ref);
    if (t && (!t.alive || t.dying)) { this.claims.delete(ref); return null; }
    return t || null;
  }

  claimFree(ref, titan) {
    const owner = this.claimOwner(ref);
    return !owner || owner === titan;
  }

  setClaim(ref, titan) { this.claims.set(ref, titan); }

  releaseClaimsOf(titan) {
    for (const [ref, t] of this.claims) if (t === titan) this.claims.delete(ref);
  }

  aliveCount() {
    return this.titans.filter((t) => t.alive).length;
  }

  remaining() {
    return TTUNE.budget - this.kills;
  }

  spawnWave(time) {
    const rand = this.rand;
    const count = Math.min(
      5 + ((rand() * 4) | 0),                 // 5-8 per wave
      TTUNE.budget - this.spawned,
      TTUNE.maxActive - this.aliveCount()
    );
    const hole = this.world.hole || { x: 0, z: 108 };
    for (let i = 0; i < count; i++) {
      const idx = this.spawned;
      const abnormal = this.abnormalOrder.has(idx);
      let opts, h;
      if (abnormal) {
        h = 12 + rand() * 4;
        // A few of them are near-sprinting runners.
        const runner = rand() < 0.45;
        opts = {
          abnormal: true,
          girth: 0.78 + rand() * 0.15,
          napeHP: 2 + (this.abSeen++ % 2),
          speedMul: runner ? 2.6 + rand() * 0.7 : 2.0 + rand() * 0.4,
          turnMul: 1.7 + rand() * 0.6,   // quicker, but nape still takeable
        };
      } else {
        h = 9 + rand() * 8;
        opts = {
          girth: 0.8 + rand() * 0.7,
          speedMul: 0.85 + rand() * 0.6, // every titan lumbers differently
          turnMul: 0.7 + rand() * 0.7,
        };
      }
      // Spawn just OUTSIDE the hole, lined up to walk straight through it, then
      // strike out for a UNIQUE home sector deep in the district.
      const lane = (i - (count - 1) / 2) * 3.2 + (rand() - 0.5) * 1.5; // stay within the ~24-wide hole
      const t = new Titan(this.scene, hole.x + lane, 117 + i * 3.5 + rand() * 3, h, rand, opts);
      t.group.rotation.y = Math.PI; // facing the city (-z)
      t.entering = true;
      t.enterDeadline = time + 9; // hard cap so nobody can get stuck at the gate
      t.enterTarget = new THREE.Vector3(hole.x + lane, 0, 100); // straight in
      const sector = this.sectors[this.sectorPick++ % this.sectors.length];
      t.homeSector = new THREE.Vector3(sector[0] + (rand() - 0.5) * 22, 0, sector[1] + (rand() - 0.5) * 22);
      t.wanderTarget.copy(t.homeSector);
      t.retargetAt = time + 30 + rand() * 20;
      t.group.updateMatrixWorld(true);
      this.titans.push(t);
      for (const m of t.parts) this.odm.addTarget(m);
      this.spawned++;
    }
    this.nextWaveAt = time + TTUNE.waveInterval;
    return count;
  }

  hookedGroups() {
    const groups = [];
    for (const hk of [this.odm.left, this.odm.right]) {
      if (hk.active && hk.followRoot) groups.push(hk.followRoot);
    }
    return groups;
  }

  update(dt, time, player, onGrab, npcs, cbs) {
    // Waves keep coming while the budget lasts.
    if (this.spawned < TTUNE.budget && time >= this.nextWaveAt &&
        this.aliveCount() < TTUNE.maxActive) {
      this.spawnWave(time);
    }

    const hooked = this.hookedGroups();
    const bodies = this.world.titanBodies;
    bodies.length = 0;
    for (const t of this.titans) {
      if (t.dying && time - t.deadAt > DEATH.evapEnd + 0.5) {
        this.scene.remove(t.group);
        t.dying = false;
        t.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
        for (const m of t.mats) m.dispose();
        continue;
      }
      if (t.alive || t.dying) {
        t.update(dt, time, player, this.world.colliders, onGrab,
          hooked.includes(t.group), this.steam, npcs, cbs, this);
      }
      if (t.alive && !t.entering) {
        bodies.push({ x: t.group.position.x, z: t.group.position.z, r: 0.17 * t.h * t.girth, top: t.h });
      }
    }

    // Titans never overlap: pairwise push-apart on the walkers.
    const live = this.titans.filter((t) => t.alive && !t.eating && !t.entering);
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const a = live[i].group.position, b = live[j].group.position;
        const ra = 0.15 * live[i].h * live[i].girth, rb = 0.15 * live[j].h * live[j].girth;
        const dx = b.x - a.x, dz = b.z - a.z;
        const d = Math.hypot(dx, dz), minD = ra + rb;
        if (d < minD && d > 0.001) {
          const push = (minD - d) / 2;
          const nx = dx / d, nz = dz / d;
          a.x -= nx * push; a.z -= nz * push;
          b.x += nx * push; b.z += nz * push;
        }
      }
    }

    // Titan bodies are solid against architecture: after every move (incl.
    // the push-apart above), shove any titan overlapping a building back out.
    for (const t of this.titans) {
      if (t.alive) this.resolveBuildings(t);
    }

    this.steam.update(dt);
  }

  // Circle-vs-AABB resolution so a titan's body can never sink into a house.
  resolveBuildings(t) {
    const p = t.group.position;
    const r = 0.16 * t.h * t.girth;
    for (const b of this.world.colliders) {
      if (b.max.y < 4 || b.min.y > 2) continue; // stones they step over; lintels overhead
      const cx = Math.max(b.min.x, Math.min(p.x, b.max.x));
      const cz = Math.max(b.min.z, Math.min(p.z, b.max.z));
      const dx = p.x - cx, dz = p.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 < 1e-6) {
        // Centre is inside the box: exit along the shallowest face.
        const exL = p.x - b.min.x, exR = b.max.x - p.x;
        const ezL = p.z - b.min.z, ezR = b.max.z - p.z;
        const m = Math.min(exL, exR, ezL, ezR);
        if (m === exL) p.x = b.min.x - r;
        else if (m === exR) p.x = b.max.x + r;
        else if (m === ezL) p.z = b.min.z - r;
        else p.z = b.max.z + r;
      } else {
        const d = Math.sqrt(d2);
        p.x = cx + (dx / d) * r;
        p.z = cz + (dz / d) * r;
      }
    }
  }

  // Nearest titan that could snatch the player right now (for the exposure timer).
  nearestGrabber(player, time) {
    const hooked = this.hookedGroups();
    let best = null, bestD = Infinity;
    for (const t of this.titans) {
      if (!t.alive || t.dying || t.eating) continue;
      if (time < t.staggerUntil) continue;
      if (hooked.includes(t.group)) continue;
      const d = Math.hypot(player.pos.x - t.group.position.x, player.pos.z - t.group.position.z);
      if (d < TTUNE.grabRange * 1.2 + 0.06 * t.h && player.pos.y < t.h * 0.8 && d < bestD) {
        bestD = d; best = t;
      }
    }
    return best;
  }

  startEatPlayer(t, player) {
    return t.startEat('player', player, (v) => {
      player.pos.copy(v);
      player.vel.set(0, 0, 0);
    });
  }

  finishKill(t, time) {
    t.kill(time, this.world.colliders);
    this.releaseClaimsOf(t); // its prey is free to be hunted by someone else
    this.kills++;
    for (const m of t.parts) this.odm.removeTarget(m);
    for (const hk of [this.odm.left, this.odm.right]) {
      if (hk.followRoot === t.group) this.odm.release(hk);
    }
  }

  // A scout dives the nape. Outcomes: cut/kill, miss, or CAUGHT.
  scoutCut(t, scout, time) {
    if (!t.alive) return 'miss';
    t.napeWorld(_n);
    const open = t.eating || time < t.staggerUntil;
    // Scouts are much weaker than the player: they mostly harass and only
    // finish an easy (distracted) titan. Cutting a healthy nape is rare.
    const cutChance = open ? 0.4 : (t.abnormal ? 0.02 : 0.045);
    const r = Math.random();
    if (r < cutChance) {
      this.napeBurst(_n);
      t.napeHP -= 1;
      if (t.napeHP <= 0) {
        this.finishKill(t, time);
        return 'kill';
      }
      t.staggerUntil = time + 0.7;
      return 'hit';
    }
    if (!open && Math.random() < 0.02 && !t.eating) {
      if (t.startEat('scout', scout, (v) => scout.group.position.copy(v))) return 'caught';
    }
    return 'miss';
  }

  // Returns 'kill' | 'hit' | 'slow' | 'body' | null.
  trySlash(camera, player, time) {
    _v.setFromMatrixPosition(camera.matrixWorld);
    const viewDir = camera.getWorldDirection(_dir);
    const hooked = this.hookedGroups();
    let bodyHit = false;
    for (const t of this.titans) {
      if (!t.alive) continue;
      const zipAttached = hooked.includes(t.group);
      const range = zipAttached ? TTUNE.slashRange * 1.3 : TTUNE.slashRange;
      t.napeWorld(_n);

      _toP.copy(_n).sub(_v);
      const along = _toP.dot(viewDir);
      if (along <= 0 || along > range) {
        if (_toP.length() < range * 1.15) bodyHit = true;
        continue;
      }
      _close.copy(_v).addScaledVector(viewDir, along);
      const perp = _n.distanceTo(_close);

      if (perp > TTUNE.napeCutRadius) {
        if (perp < TTUNE.napeCutRadius + 0.09 * t.h) bodyHit = true;
        continue;
      }
      t.head.getWorldPosition(_head);
      _toP.copy(_head).sub(_v);
      const headAlong = _toP.dot(viewDir);
      _close.copy(_v).addScaledVector(viewDir, headAlong);
      if (_head.distanceTo(_close) < perp) { bodyHit = true; continue; }

      // A distracted (eating) titan is fair game from any angle; otherwise
      // free slashes must come from behind/beside.
      if (!zipAttached && !t.eating) {
        t.group.getWorldDirection(_fwd);
        _toP.copy(_v).sub(_n).normalize();
        if (_toP.dot(_fwd) > TTUNE.slashRearDot) { bodyHit = true; continue; }
      }

      if (player.vel.length() < TTUNE.slashSpeedReq) return 'slow';
      this.napeBurst(_n);
      t.napeHP -= 1;
      if (t.napeHP > 0) {
        t.staggerUntil = time + 0.7;
        this.lastHit = { pos: _n.clone(), titan: t, remaining: t.napeHP };
        return 'hit';
      }
      // Killing a titan mid-bite (before the chomp) RESCUES the victim.
      const rescued = t.eating && !t.eating.chomped ? t.eating.kind : null;
      this.finishKill(t, time);
      this.lastKill = { pos: _n.clone(), titan: t, rescued };
      return 'kill';
    }
    return bodyHit ? 'body' : null;
  }

  napeBurst(at) {
    for (let i = 0; i < 46; i++) {
      const dir = new THREE.Vector3(
        (Math.random() - 0.5) * 2, Math.random() * 1.4 + 0.2, (Math.random() - 0.5) * 2
      ).normalize().multiplyScalar(5 + Math.random() * 11);
      const blood = i < 14;
      this.steam.emit(
        at.x, at.y, at.z,
        dir.x, dir.y, dir.z,
        blood ? 0.5 + Math.random() * 0.4 : 1.0 + Math.random() * 0.8,
        blood ? 0.7 : 1.4 + Math.random() * 1.0,
        blood ? 0.4 : 2.4,
        blood ? -1.5 : 2.5,
        blood ? 0.85 : 0.7,
        blood ? 0.5 : 0.92,
        blood ? 0.06 : 0.92,
        blood ? 0.05 : 0.88
      );
    }
  }

  // Red splash where someone was eaten or crushed.
  gorePuff(p) {
    for (let i = 0; i < 22; i++) {
      const d = new THREE.Vector3(
        (Math.random() - 0.5) * 2, Math.random(), (Math.random() - 0.5) * 2
      ).normalize().multiplyScalar(3 + Math.random() * 6);
      this.steam.emit(p.x, p.y, p.z, d.x, d.y, d.z,
        0.5 + Math.random() * 0.4, 0.6, 0.3, -2, 0.9, 0.55, 0.06, 0.05);
    }
  }
}
