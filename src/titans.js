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

// Give a material a dissolve driven by a shared uniform (0 = intact, ~1 = gone),
// with a glowing orange edge at the dissolving boundary.
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
  detectRange: 40,
  wanderSpeed: 0.55,
  chaseSpeed: 0.95,   // a slow, heavy lumber — easy to outpace on foot
  reactionDelay: 3.2, // long stare before it commits to the chase
  turnRate: 0.1,      // extremely slow turn — time to locate, hook & slice the nape
  grabRange: 3.8,
  grabDamage: 15,
  grabCooldown: 3.0,
  slashRange: 11,       // reach at which the blade can connect with the nape
  slashSpeedReq: 9,     // you need real momentum for the cut to land
  napeCutRadius: 1.9,   // crosshair must pass this close to the nape point
  slashRearDot: 0.45,   // free (uncabled) slashes must come from behind/beside
  // Staged death timeline (seconds since the nape is cut). Each is a duration;
  // the phases run back to back: still → knees → prone → steam → evaporate.
  death: { still: 2, kneel: 2, prone: 2, steam: 5, evap: 10 },
};

// Phase boundaries derived from the durations above.
const D = TTUNE.death;
const DEATH = {
  stillEnd: D.still,
  kneelEnd: D.still + D.kneel,
  proneEnd: D.still + D.kneel + D.prone,
  steamEnd: D.still + D.kneel + D.prone + D.steam,
  evapEnd: D.still + D.kneel + D.prone + D.steam + D.evap,
};
// smoothstep progress of `x` across [a,b]
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

let nextId = 1;

// Procedural face: wide unblinking eyes and a bare-toothed grin — an original
// stylized giant, creepy in the way oversized humans are.
function faceTexture(rand) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#b59376';
  ctx.fillRect(0, 0, 128, 128);
  // cheek/brow shading
  ctx.fillStyle = 'rgba(90,60,45,0.25)';
  ctx.beginPath(); ctx.ellipse(30, 66, 14, 20, 0.3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(98, 66, 14, 20, -0.3, 0, Math.PI * 2); ctx.fill();
  // heavy brow
  ctx.strokeStyle = '#5a3c2a';
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(22, 38); ctx.lineTo(56, 34); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(72, 34); ctx.lineTo(106, 38); ctx.stroke();
  // eyes: wide whites, small dark iris (the vacant stare)
  for (const ex of [40, 88]) {
    ctx.fillStyle = '#e8e2d4';
    ctx.beginPath(); ctx.ellipse(ex, 50, 13, 9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3a2c20';
    ctx.beginPath(); ctx.arc(ex + (rand() - 0.5) * 6, 50, 4.2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(70,45,30,0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(ex, 50, 13, 9, 0, 0, Math.PI * 2); ctx.stroke();
  }
  // nose shadow
  ctx.strokeStyle = 'rgba(90,60,45,0.55)';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(64, 54); ctx.lineTo(62, 74); ctx.stroke();
  // grin: wide dark mouth with a row of flat teeth
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
    this.girth = opts.girth || 1;           // <1 lean, >1 fat
    this.napeHP = opts.napeHP || 1;         // abnormals take 2-3 nape cuts
    this.speedMul = opts.speedMul || 1;     // abnormals move faster
    this.staggerUntil = -1;                 // brief flinch after a non-lethal cut
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
    this.parts = []; // every mesh is a valid ODM anchor

    // Per-titan appearance: skin tone, build, head/hair — every titan differs.
    // Abnormals read ruddier and gaunt.
    const hue = this.abnormal ? 0.04 + (rand() - 0.5) * 0.02 : 0.065 + (rand() - 0.5) * 0.035;
    const sat = this.abnormal ? 0.42 : 0.26 + rand() * 0.14;
    const light = (this.abnormal ? 0.5 : 0.55) + (rand() - 0.5) * 0.14;
    const skin = new THREE.MeshLambertMaterial({ color: new THREE.Color().setHSL(hue, sat, light) });
    const skinDark = new THREE.MeshLambertMaterial({ color: new THREE.Color().setHSL(hue, sat + 0.03, light - 0.12) });
    const hairMat = new THREE.MeshLambertMaterial({ color: new THREE.Color().setHSL(0.02 + rand() * 0.1, 0.3 + rand() * 0.3, 0.1 + rand() * 0.22) });
    const gir = this.girth;      // body-width multiplier for this titan
    const headScale = 0.85 + rand() * 0.4; // some big-headed, some small

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

    // Built at unit height (feet y=0, crown ~y=1.05), scaled by h.
    // Long limbs, hunched back, oversized head — giant proportions.
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

    // hips + hunched torso
    const hips = tag(new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.14, 0.17), skinDark));
    hips.position.y = 0.53;
    g.add(hips);
    const torso = tag(new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.24, 4, 10), skin));
    torso.position.set(0, 0.72, -0.01);
    torso.rotation.x = 0.14; // hunch
    torso.scale.set(1.15, 1, 0.8);
    g.add(torso);
    // rib shading hint
    const chest = tag(new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.16, 0.06), skin));
    chest.position.set(0, 0.80, 0.10);
    g.add(chest);

    // shoulders + long arms with hands
    this.arms = [];
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
    }

    // neck + oversized head with the face
    const neck = tag(new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.10, 8), skin));
    neck.position.set(0, 0.93, 0.01);
    g.add(neck);
    const faceMat = new THREE.MeshLambertMaterial({ map: faceTexture(rand) });
    const headMats = [skin, skin, skin, skin, faceMat, skin]; // +z face forward
    const head = tag(new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.24, 0.21), headMats));
    head.position.set(0, 1.03, 0.02);
    head.scale.setScalar(headScale);
    g.add(head);
    this.head = head;
    const hair = tag(new THREE.Mesh(new THREE.BoxGeometry(0.225, 0.08, 0.225), hairMat));
    hair.position.set(0, 1.13 + 0.02 * headScale, 0.01);
    hair.scale.set(headScale, 1, headScale);
    g.add(hair);
    for (const side of [-1, 1]) { // ears
      const ear = tag(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.06, 0.05), skin));
      ear.position.set(side * 0.115, 1.02, 0.02);
      g.add(ear);
    }

    // THE NAPE — big, glowing, unmistakable, and a hook anchor.
    this.napeMat = new THREE.MeshBasicMaterial({ color: 0xd44a3a });
    this.nape = tag(new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.14, 0.05), this.napeMat));
    this.nape.position.set(0, 0.92, -0.10);
    g.add(this.nape);

    // Death dissolve: one shared uniform drives every material of this titan.
    this.uDissolve = { value: -1.0 }; // < 0 while alive: nothing dissolves
    this.mats = [skin, skinDark, hairMat, faceMat, this.napeMat];
    for (const m of this.mats) patchDissolve(m, this.uDissolve);

    this.wispAccum = 0;   // ambient steam emission accumulator
    this.columnAccum = 0; // death-column emission accumulator

    // Girth widens the build without changing height (fat vs lean titans).
    g.scale.set(height * gir, height, height * gir);
    scene.add(g);
    g.updateMatrixWorld(true);
  }

  napeWorld(out) {
    return this.nape.getWorldPosition(out);
  }

  update(dt, time, player, colliders, onGrab, hookedToMe, steam) {
    if (this.dying) {
      this.updateDeath(dt, time, steam);
      return;
    }

    // Ambient steam constantly wisps off a living titan's body.
    if (steam) this.emitWisps(dt, steam);

    // Flinch after a non-lethal nape cut: it reels in place, nape flaring.
    if (time < this.staggerUntil) {
      this.phase += dt * 8;
      this.group.rotation.z = Math.sin(this.phase) * 0.06;
      this.napeMat.color.setHSL(0.02, 0.9, 0.55 + 0.2 * Math.sin(time * 14));
      return;
    }
    this.group.rotation.z = 0;

    // A titan with a cable in it staggers in place — it can't track you,
    // which is the whole window for the zip-past nape kill.
    if (hookedToMe) {
      this.phase += dt * 5;
      const flail = Math.sin(this.phase) * 0.5;
      this.arms[0].rotation.x = flail;
      this.arms[1].rotation.x = -flail;
      this.napeMat.color.setHSL(0.02, 0.85, 0.5 + 0.2 * Math.sin(time * 9));
      return;
    }

    _toP.copy(player.pos).sub(this.group.position);
    const distToPlayer = Math.hypot(_toP.x, _toP.z);

    // Abnormals spot you from further, barely pause, and charge fast.
    const detect = this.abnormal ? TTUNE.detectRange * 1.4 : TTUNE.detectRange;
    const reaction = this.abnormal ? TTUNE.reactionDelay * 0.25 : TTUNE.reactionDelay;
    let speed;
    if (distToPlayer < detect) {
      // Notice beat: it stops and stares before committing (brief for abnormals).
      if (!this.aggro) {
        if (this.aggroReadyAt === 0) this.aggroReadyAt = time + reaction;
        if (time >= this.aggroReadyAt) this.aggro = true;
      }
      _n.set(_toP.x, 0, _toP.z).normalize();
      speed = (this.aggro ? TTUNE.chaseSpeed : 0) * this.speedMul;
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
      _n.copy(this.wanderTarget).sub(this.group.position).setY(0).normalize();
      speed = TTUNE.wanderSpeed * this.speedMul;
    }

    // Step, but don't walk into buildings — try full move, then axis slides.
    const px = this.group.position.x + _n.x * speed * dt;
    const pz = this.group.position.z + _n.z * speed * dt;
    const r = 0.13 * this.h;
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
      this.retargetAt = time; // fully stuck: pick a new destination
    }
    this.group.position.x = Math.max(-105, Math.min(105, this.group.position.x));
    this.group.position.z = Math.max(-105, Math.min(105, this.group.position.z));

    // Ponderous turn (forward is +z) — abnormals wheel around much quicker.
    const targetYaw = Math.atan2(_n.x, _n.z);
    let dy = targetYaw - this.group.rotation.y;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    const turn = TTUNE.turnRate * (this.abnormal ? 3.5 : 1);
    this.group.rotation.y += dy * Math.min(1, dt * turn);

    // Lumbering gait.
    this.phase += dt * Math.max(speed, 0.2) * 1.7;
    const swing = Math.sin(this.phase) * 0.38;
    this.legs[0].rotation.x = swing;
    this.legs[1].rotation.x = -swing;
    this.arms[0].rotation.x = -swing * 0.65;
    this.arms[1].rotation.x = swing * 0.65;
    this.group.position.y = Math.abs(Math.sin(this.phase)) * 0.018 * this.h;

    // Nape pulse so it reads as the weak point.
    this.napeMat.color.setHSL(0.02, 0.75, 0.45 + 0.15 * Math.sin(time * 5 + this.id));

    // Grab: only if you're low — rooftops and cables are safe.
    if (distToPlayer < TTUNE.grabRange + 0.06 * this.h &&
        player.pos.y < this.h * 0.55 &&
        time > this.attackReadyAt) {
      this.attackReadyAt = time + TTUNE.grabCooldown;
      onGrab(this);
    }
  }

  blocked(x, z, r, colliders) {
    for (const b of colliders) {
      if (x + r > b.min.x && x - r < b.max.x && z + r > b.min.z && z - r < b.max.z) return true;
    }
    return false;
  }

  // Faint wisps rising off the body — the signature idle VFX.
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
        1.1 + Math.random() * 0.9,          // life
        0.06 * h + Math.random() * 0.05 * h, // size
        0.05 * h,                            // grow
        0.7,                                 // buoyancy
        0.16,                                // peak alpha (faint)
        0.85, 0.86, 0.82
      );
    }
  }

  // Long staged death (td = seconds since the nape was cut):
  //   still (stand) → knees → face-down → steam release → slow evaporation.
  updateDeath(dt, time, steam) {
    const td = time - this.deadAt;
    const h = this.h;

    // --- Pose through the phases ---
    const pKneel = seg(td, DEATH.stillEnd, DEATH.kneelEnd); // 0..1 buckling
    const pProne = seg(td, DEATH.kneelEnd, DEATH.proneEnd); // 0..1 tipping flat
    // Turn to topple toward open ground (chosen on death), so the body doesn't
    // fall through a house.
    let dyaw = this.fallYaw - this.startYaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    this.group.rotation.y = this.startYaw + dyaw * seg(td, 0, DEATH.kneelEnd);
    // Pitch forward: upright → ~40° on the knees → ~90° face-down.
    const pitch = 0.7 * pKneel + (Math.PI / 2 - 0.7) * pProne;
    this.group.rotation.x = pitch;
    this.group.rotation.z = this.fallRoll * pKneel;
    // Sink onto the knees, then lift so the prone body rests ON the road
    // rather than sinking half into it (torso radius ≈ 0.16h).
    this.group.position.y = -0.08 * h * pKneel * (1 - pProne) + 0.17 * h * pProne;
    // Legs fold under while kneeling, then splay straight when prone.
    const legFold = 1.15 * pKneel * (1 - pProne);
    this.legs[0].rotation.x = legFold;
    this.legs[1].rotation.x = legFold * 0.85;
    // Arms hang limp throughout.
    for (const a of this.arms) a.rotation.x += (0.2 - a.rotation.x) * Math.min(1, dt * 4);

    // --- Dissolve: only during the final evaporation window ---
    this.uDissolve.value = Math.max(-1, Math.min(1.05,
      (td - DEATH.steamEnd) / (DEATH.evapEnd - DEATH.steamEnd)));

    // --- Steam ---
    if (steam) {
      const gp = this.group.position;
      if (td < DEATH.proneEnd) {
        // Faint cooling wisps while it collapses.
        this.columnAccum += dt * 16;
      } else {
        // Big release once it's down, sustained through the evaporation.
        const evap = td > DEATH.steamEnd;
        this.columnAccum += dt * (evap ? 95 : 130);
      }
      // Emit along the body — a vertical-ish plume from the fallen mass.
      const prone = td >= DEATH.proneEnd;
      while (this.columnAccum >= 1) {
        this.columnAccum -= 1;
        const rad = Math.random() * 0.3 * h;
        const ang = Math.random() * Math.PI * 2;
        // When prone the body lies forward (+ its facing), so spread along it.
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
    this.fallRoll = (Math.random() - 0.5) * 0.2; // slight lean as it goes down
    this.startYaw = this.group.rotation.y;
    this.fallYaw = colliders ? this.pickFallYaw(colliders) : this.startYaw;
  }

  // Choose the clearest horizontal direction to topple into, so the prone
  // body lands in an open lane instead of clipping through a building.
  pickFallYaw(colliders) {
    const base = this.group.position;
    const reach = this.h * 0.9; // how far the fallen body reaches
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
    this.steam = new SteamSystem(scene);
    this.kills = 0;
    world.titanBodies = []; // living-titan cylinders, refreshed each frame

    // mulberry32 — a plain Lehmer LCG showed lattice correlation at the fixed
    // per-titan draw stride, which made every titan the same height.
    let seed = 0x5eed1234;
    const rand = () => {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    // 10 titans spread around the district. 4 are ABNORMALS (faster, tougher —
    // 2-3 nape cuts — and quicker to turn); the other 6 are all different:
    // varied height, girth, skin tone and head size.
    const spots = [
      [52, 6], [-52, -6], [6, -52], [-6, 52],
      [78, 26], [-78, -26], [26, 78], [-26, -78],
      [52, -52], [-52, 52],
    ];
    // Which indices are abnormal (spread them out).
    const abnormalIdx = new Set([0, 3, 5, 8]);
    let abSeen = 0;
    for (let i = 0; i < spots.length; i++) {
      const [x, z] = spots[i];
      const abnormal = abnormalIdx.has(i);
      let opts, h;
      if (abnormal) {
        h = 12 + rand() * 4;                 // 12-16
        opts = {
          abnormal: true,
          girth: 0.8 + rand() * 0.15,        // gaunt
          napeHP: 2 + (abSeen++ % 2),        // alternate 2 and 3 cuts
          speedMul: 1.7 + rand() * 0.5,      // clearly faster
        };
      } else {
        h = 9 + rand() * 8;                  // 9-17: big variety
        opts = { girth: 0.8 + rand() * 0.7 };// lean to fat
      }
      const t = new Titan(scene, x, z, h, rand, opts);
      // Safety: if a jittered building landed on the spot, nudge outward.
      let guard = 0;
      while (t.blocked(t.group.position.x, t.group.position.z, 0.2 * h * t.girth, world.colliders) && guard++ < 30) {
        t.group.position.x *= 1.07;
        t.group.position.z *= 1.07;
      }
      t.group.updateMatrixWorld(true);
      this.titans.push(t);
      for (const m of t.parts) odm.addTarget(m); // hook anywhere on the body
    }
  }

  remaining() {
    return this.titans.filter((t) => t.alive).length;
  }

  hookedGroups() {
    const groups = [];
    for (const hk of [this.odm.left, this.odm.right]) {
      if (hk.active && hk.followRoot) groups.push(hk.followRoot);
    }
    return groups;
  }

  update(dt, time, player, onGrab) {
    const hooked = this.hookedGroups();
    const bodies = this.world.titanBodies;
    bodies.length = 0;
    for (const t of this.titans) {
      if (t.dying && time - t.deadAt > DEATH.evapEnd + 0.5) {
        // Fully evaporated — remove and free its resources.
        this.scene.remove(t.group);
        t.dying = false;
        t.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
        for (const m of t.mats) m.dispose();
        continue;
      }
      if (t.alive || t.dying) {
        t.update(dt, time, player, this.world.colliders, onGrab, hooked.includes(t.group), this.steam);
      }
      // Only living titans are solid bodies the player can't pass through.
      if (t.alive) {
        bodies.push({ x: t.group.position.x, z: t.group.position.z, r: 0.17 * t.h * t.girth, top: t.h });
      }
    }
    this.steam.update(dt);
  }

  // Steam-and-blood burst at the nape the instant the blade connects.
  napeBurst(at) {
    for (let i = 0; i < 46; i++) {
      const dir = new THREE.Vector3(
        (Math.random() - 0.5) * 2, Math.random() * 1.4 + 0.2, (Math.random() - 0.5) * 2
      ).normalize().multiplyScalar(5 + Math.random() * 11);
      const blood = i < 14; // a few dark-red flecks amid the steam
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

  // Returns 'kill' | 'slow' | null. Call when the player slashes.
  // Returns 'kill' | 'slow' | 'body' | null.
  // The blade only kills when the crosshair ray actually passes through the
  // nape — hitting the torso, limbs, or head does nothing.
  trySlash(camera, player, time) {
    _v.setFromMatrixPosition(camera.matrixWorld);
    const viewDir = camera.getWorldDirection(_dir);
    const hooked = this.hookedGroups();
    let bodyHit = false; // aimed at a titan but missed the nape
    for (const t of this.titans) {
      if (!t.alive) continue;
      const zipAttached = hooked.includes(t.group);
      const range = zipAttached ? TTUNE.slashRange * 1.3 : TTUNE.slashRange;
      t.napeWorld(_n);

      // Ray vs. nape: how close does the crosshair line pass to the nape point?
      _toP.copy(_n).sub(_v);
      const along = _toP.dot(viewDir); // distance to nape projected onto aim ray
      if (along <= 0 || along > range) {
        if (_toP.length() < range * 1.15) bodyHit = true; // nape behind/too far
        continue;
      }
      _close.copy(_v).addScaledVector(viewDir, along); // closest point on ray
      const perp = _n.distanceTo(_close);              // miss distance to nape

      if (perp > TTUNE.napeCutRadius) {
        // Crosshair is on the titan somewhere, just not the nape.
        if (perp < TTUNE.napeCutRadius + 0.09 * t.h) bodyHit = true;
        continue;
      }
      // The nape must be the part you're actually pointing at — if the head
      // (right above it) is nearer the crosshair line, that's a head hit.
      t.head.getWorldPosition(_head);
      _toP.copy(_head).sub(_v);
      const headAlong = _toP.dot(viewDir);
      _close.copy(_v).addScaledVector(viewDir, headAlong);
      if (_head.distanceTo(_close) < perp) { bodyHit = true; continue; }

      // Free (uncabled) slashes must come from behind/beside so the blade
      // doesn't reach the nape straight through the face. A cabled fly-past
      // may connect from any angle — the titan is pinned and staggering.
      if (!zipAttached) {
        t.group.getWorldDirection(_fwd);
        _toP.copy(_v).sub(_n).normalize();
        if (_toP.dot(_fwd) > TTUNE.slashRearDot) { bodyHit = true; continue; }
      }

      if (player.vel.length() < TTUNE.slashSpeedReq) return 'slow';
      this.napeBurst(_n);
      t.napeHP -= 1;
      if (t.napeHP > 0) {
        // Abnormal took the hit but isn't dead — it flinches, cut again.
        t.staggerUntil = time + 0.7;
        this.lastHit = { pos: _n.clone(), titan: t, remaining: t.napeHP };
        return 'hit';
      }
      t.kill(time, this.world.colliders);
      this.kills++;
      for (const m of t.parts) this.odm.removeTarget(m);
      // Release any cable still latched to this titan (it follows the group now).
      for (const hk of [this.odm.left, this.odm.right]) {
        if (hk.followRoot === t.group) this.odm.release(hk);
      }
      this.lastKill = { pos: _n.clone(), titan: t };
      return 'kill';
    }
    return bodyHit ? 'body' : null;
  }

}
