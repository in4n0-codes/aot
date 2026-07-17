import * as THREE from 'three';

// Allied scouts (AI wingmates on ODM gear) and fleeing civilians.
// Scouts harass titans and occasionally cut a nape; titans can catch and eat
// both. Killing a titan mid-bite RESCUES whoever is in its hand.

const _v = new THREE.Vector3();
const _goal = new THREE.Vector3();

// ---------- Civilians ----------
class Civilian {
  constructor(scene, x, z, rand) {
    this.alive = true;
    this.beingEaten = false;
    this.justFreed = false;
    this.panic = false;
    this.phase = rand() * 10;
    const g = new THREE.Group();
    this.group = g;
    const shirt = new THREE.MeshLambertMaterial({
      color: new THREE.Color().setHSL(rand(), 0.35 + rand() * 0.2, 0.4 + rand() * 0.25),
    });
    const pants = new THREE.MeshLambertMaterial({ color: 0x4a4038 });
    const skin = new THREE.MeshLambertMaterial({ color: 0xc9a184 });
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.3), pants);
    legs.position.y = 0.4;
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 0.35), shirt);
    body.position.y = 1.15;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 7), skin);
    head.position.y = 1.75;
    body.castShadow = legs.castShadow = true;
    g.add(legs, body, head);
    g.position.set(x, 0, z);
    scene.add(g);
  }

  update(dt, time, titans, colliders, panicFrom) {
    if (!this.alive || this.beingEaten) return;
    if (this.justFreed) { this.justFreed = false; this.group.position.y = 0; }
    const p = this.group.position;
    // Flee the nearest live titan; otherwise mill about slowly.
    let nearest = null, nd = Infinity;
    for (const t of titans) {
      if (!t.alive) continue;
      const d = Math.hypot(t.group.position.x - p.x, t.group.position.z - p.z);
      if (d < nd) { nd = d; nearest = t; }
    }
    this.panic = (nearest && nd < 42) || !!panicFrom;
    let dx = 0, dz = 0, speed = 0;
    if (nearest && nd < 42) {
      dx = p.x - nearest.group.position.x;
      dz = p.z - nearest.group.position.z;
      const l = Math.hypot(dx, dz) || 1;
      dx /= l; dz /= l;
      // Weave sideways when a titan is close so they aren't run down in a
      // straight line — this keeps them alive much longer.
      if (nd < 16) {
        const s = Math.sin(this.phase * 1.7) * 0.6;
        const tx = -dz, tz = dx;
        dx += tx * s; dz += tz * s;
        const ll = Math.hypot(dx, dz) || 1; dx /= ll; dz /= ll;
      }
      speed = 6.0; // sprint for their lives — outruns a normal titan up close
    } else if (panicFrom) {
      dx = p.x - panicFrom.x;
      dz = p.z - panicFrom.z;
      const l = Math.hypot(dx, dz) || 1;
      dx /= l; dz /= l;
      speed = 5.5;
    } else {
      dx = Math.sin(this.phase * 0.3);
      dz = Math.cos(this.phase * 0.3);
      speed = 0.6;
    }
    // Don't sprint blindly into a corner and get pinned there. Near the map
    // edge, bend the escape back toward open ground — otherwise every chase
    // ends at the same few corners, which made rescues feel like they always
    // happened in the same spots.
    if (speed > 1) {
      const EDGE = 74, span = 100 - EDGE;
      let bx = 0, bz = 0;
      if (p.x > EDGE) bx = -(p.x - EDGE) / span;
      else if (p.x < -EDGE) bx = (-p.x - EDGE) / span;
      if (p.z > EDGE) bz = -(p.z - EDGE) / span;
      else if (p.z < -EDGE) bz = (-p.z - EDGE) / span;
      if (bx || bz) {
        const w = Math.min(1, Math.hypot(bx, bz)) * 1.6;
        dx += bx * w; dz += bz * w;
        const ll = Math.hypot(dx, dz) || 1; dx /= ll; dz /= ll;
      }
    }
    const nx = p.x + dx * speed * dt, nz = p.z + dz * speed * dt;
    if (!this.blocked(nx, nz, 0.5, colliders)) { p.x = nx; p.z = nz; }
    else if (!this.blocked(nx, p.z, 0.5, colliders)) p.x = nx;
    else if (!this.blocked(p.x, nz, 0.5, colliders)) p.z = nz;
    p.x = Math.max(-100, Math.min(100, p.x));
    p.z = Math.max(-100, Math.min(100, p.z));
    this.group.rotation.y = Math.atan2(dx, dz);
    this.phase += dt * (this.panic ? 11 : 2);
    p.y = this.panic ? Math.abs(Math.sin(this.phase)) * 0.12 : 0;
  }

  blocked(x, z, r, colliders) {
    for (const b of colliders) {
      if (x + r > b.min.x && x - r < b.max.x && z + r > b.min.z && z - r < b.max.z) return true;
    }
    return false;
  }
}

// ---------- Scouts ----------
class Scout {
  constructor(scene, x, z, rand) {
    this.alive = true;
    this.beingEaten = false;
    this.justFreed = false;
    this.state = 'hunt'; // hunt | flee
    this.fleeUntil = 0;
    this.nextDiveAt = 0;
    this.target = null;
    this.recklessRolled = false; // has this engagement's reckless-dive coin been flipped?
    this.reckless = false;       // this engagement: press a dive despite the titan being healthy
    this.vel = new THREE.Vector3();
    this.phase = rand() * 10;
    this.anchor = null;      // real world point the cable is attached to
    this.anchorAge = 0;
    this.anchorTitan = null; // when diving, the cable is in the titan itself
    // A personal patrol point far from the others, re-rolled over time — this
    // keeps the scouts spread across the whole district instead of flocking.
    this.patrol = new THREE.Vector3((rand() * 2 - 1) * 90, 14, (rand() * 2 - 1) * 90);
    this.patrolAt = 0;
    const g = new THREE.Group();
    this.group = g;
    const jacket = new THREE.MeshLambertMaterial({ color: 0x8a6f4d });
    const cloakMat = new THREE.MeshLambertMaterial({ color: 0x3f5d43 });
    const skin = new THREE.MeshLambertMaterial({ color: 0xd4b096 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.75, 4, 8), jacket);
    body.position.y = 0.95;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 7), skin);
    head.position.y = 1.65;
    const cloak = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.0, 8), cloakMat);
    cloak.position.set(0, 1.0, -0.12);
    const gear = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.25),
      new THREE.MeshLambertMaterial({ color: 0x777d82 }));
    gear.position.set(0, 0.55, -0.2);
    body.castShadow = true;
    g.add(body, head, cloak, gear);
    // Faked cable while manoeuvring.
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    this.cable = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0x15161a }));
    this.cable.frustumCulled = false;
    scene.add(this.cable);
    g.position.set(x, 10, z);
    scene.add(g);
  }

  // Cables anchor to REAL geometry: a nearby rooftop in the direction of
  // travel, or the titan itself during an attack run.
  pickAnchor(world, time) {
    const p = this.group.position;
    let best = null, bestScore = Infinity;
    for (const b of world.buildings) {
      if (b.userData.wrecked) continue;
      const bx = b.position.x, bz = b.position.z;
      const d = Math.hypot(bx - p.x, bz - p.z);
      if (d < 6 || d > 48) continue;
      // prefer roofs ahead of us and above us
      const ahead = ((bx - p.x) * this.vel.x + (bz - p.z) * this.vel.z);
      const top = b.userData.ridgeY || b.userData.roofY;
      const score = d - (ahead > 0 ? 14 : 0) + (top < p.y ? 18 : 0);
      if (score < bestScore) { bestScore = score; best = b; }
    }
    if (best) {
      const w = best.scale.x / 2 * 0.85, dd = best.scale.z / 2 * 0.85;
      this.anchor = new THREE.Vector3(
        best.position.x + Math.max(-w, Math.min(w, p.x - best.position.x)),
        (best.userData.ridgeY || best.userData.roofY) - 0.4,
        best.position.z + Math.max(-dd, Math.min(dd, p.z - best.position.z))
      );
      this.anchorAge = time;
    } else {
      this.anchor = null;
    }
  }

  update(dt, time, titansMgr, hud, world, claimed) {
    if (!this.alive || this.beingEaten) { this.cable.visible = false; return; }
    if (this.justFreed) {
      this.justFreed = false;
      this.state = 'flee';
      this.fleeUntil = time + 3;
      this.vel.set((Math.random() - 0.5) * 10, 12, (Math.random() - 0.5) * 10);
    }
    const p = this.group.position;
    const titans = titansMgr.titans.filter((t) => t.alive && !t.entering);

    // Roll a fresh, well-separated patrol point now and then.
    if (time > this.patrolAt || p.distanceTo(this.patrol) < 18) {
      this.patrol.set((Math.random() * 2 - 1) * 92, 14 + Math.random() * 12, (Math.random() * 2 - 1) * 92);
      this.patrolAt = time + 6 + Math.random() * 5;
    }

    if (this.state === 'flee' || titans.length === 0) {
      _goal.copy(this.patrol); // patrol wide, not toward the centre
      if (time > this.fleeUntil && titans.length) this.state = 'hunt';
    } else {
      // Pick a titan NO other scout is already on (two-pass: unclaimed first),
      // biased toward one near this scout's patrol quarter so they fan out.
      const pick = (allowClaimed) => {
        let tg = null, best = Infinity;
        for (const t of titans) {
          if (!allowClaimed && claimed && claimed.has(t)) continue;
          const d = p.distanceTo(t.group.position);
          const toPatrol = t.group.position.distanceTo(this.patrol);
          const score = d + toPatrol * 0.4 + (t.eating ? -30 : 0) + (t.abnormal ? 8 : 0);
          if (score < best) { best = score; tg = t; }
        }
        return tg;
      };
      let target = pick(false) || pick(true);
      if (!target) { _goal.copy(this.patrol); this.cable.visible = false; return; }
      if (claimed) claimed.add(target);
      if (this.target !== target) { this.recklessRolled = false; this.reckless = false; }
      this.target = target;
      const open = target.eating || time < target.staggerUntil;
      // A veteran mostly waits for an opening — but once in a while (never
      // against an abnormal) they press a dive on a healthy titan anyway.
      // That's genuinely risky: without it, a titan never gets a real chance
      // to catch a scout, since a scout that only ever dives on an already-
      // distracted titan can never be caught off guard.
      if (!open && !target.abnormal && !this.recklessRolled) {
        this.recklessRolled = true;
        this.reckless = Math.random() < 0.15;
      }
      const committing = open || this.reckless;
      target.napeWorld(_goal);
      target.group.getWorldDirection(_v);
      if (!committing) {
        const orbit = 15 + Math.sin(time * 0.9 + this.phase) * 4;
        const ang = time * 0.7 + this.phase;
        _goal.set(
          target.group.position.x + Math.cos(ang) * orbit,
          target.h + 5,
          target.group.position.z + Math.sin(ang) * orbit
        );
      } else {
        _goal.addScaledVector(_v, -4).y += 1.5; // swoop behind the nape
      }
      const dNape = p.distanceTo(_goal);
      if (committing && dNape < 3.5 && time >= this.nextDiveAt) {
        this.nextDiveAt = time + 5 + Math.random() * 4;
        const wasReckless = this.reckless;
        this.recklessRolled = false;
        this.reckless = false;
        const res = titansMgr.scoutCut(target, this, time, wasReckless);
        if (res === 'kill' && hud) hud.toast('A SCOUT TOOK ONE DOWN');
        if (res === 'caught' && hud) hud.toast('A SCOUT IS CAUGHT — SAVE THEM!', 2600);
        this.state = 'flee';
        this.fleeUntil = time + 2.2 + Math.random();
      }
    }

    // Steer: smooth seek with a vertical swoop, ODM-flavoured.
    _v.copy(_goal).sub(p);
    const dist = _v.length() || 1;
    _v.divideScalar(dist);
    const desired = Math.min(16, 4 + dist * 1.5);
    this.vel.x += (_v.x * desired - this.vel.x) * Math.min(1, dt * 2.2);
    this.vel.y += (_v.y * desired + Math.sin(time * 2 + this.phase) * 2.2 - this.vel.y) * Math.min(1, dt * 2.2);
    this.vel.z += (_v.z * desired - this.vel.z) * Math.min(1, dt * 2.2);
    p.addScaledVector(this.vel, dt);
    if (p.y < 3.5) p.y = 3.5;
    if (p.y > 34) p.y = 34;
    p.x = Math.max(-104, Math.min(104, p.x));
    p.z = Math.max(-104, Math.min(112, p.z));
    this.phase += dt * 3;
    // Face travel, bank into turns.
    this.group.rotation.y = Math.atan2(this.vel.x, this.vel.z);
    this.group.rotation.z = Math.max(-0.5, Math.min(0.5, -this.vel.x * 0.02));

    // Cable management: on an attack run the hook is IN the titan; otherwise
    // it's on a real rooftop, re-fired as the old anchor falls behind.
    const diving = this.state === 'hunt' && this.target && this.target.alive &&
      p.distanceTo(this.target.group.position) < 16;
    if (diving) {
      this.target.napeWorld(_v);
      this.anchor = _v.clone();
      this.anchor.y += 1;
      this.anchorAge = time;
    } else if (world && (!this.anchor || time - this.anchorAge > 4 ||
        p.distanceTo(this.anchor) > 50 ||
        ((this.anchor.x - p.x) * this.vel.x + (this.anchor.z - p.z) * this.vel.z) < -12)) {
      this.pickAnchor(world, time);
    }
    if (this.anchor && this.vel.lengthSq() > 9) {
      // A gentle pull toward the anchor bends the flight into arcs.
      _v.copy(this.anchor).sub(p);
      const ad = _v.length() || 1;
      this.vel.addScaledVector(_v.divideScalar(ad), 2.5 * dt);
      const posAttr = this.cable.geometry.attributes.position;
      posAttr.setXYZ(0, p.x, p.y + 0.6, p.z);
      posAttr.setXYZ(1, this.anchor.x, this.anchor.y, this.anchor.z);
      posAttr.needsUpdate = true;
      this.cable.visible = true;
    } else {
      this.cable.visible = false;
    }
  }
}

export class NPCManager {
  constructor(scene, world, rand) {
    this.scene = scene;
    this.world = world;
    this.civilians = [];
    this.scouts = [];
    const rnd = rand || Math.random;

    this.panicUntil = 0;
    this.panicPoint = new THREE.Vector3();

    // Civilians scattered through the streets (never inside a building).
    let placed = 0, guard = 0;
    while (placed < 20 && guard++ < 400) {
      const x = (rnd() * 2 - 1) * 85;
      const z = (rnd() * 2 - 1) * 85;
      let inside = false;
      for (const b of world.colliders) {
        if (x > b.min.x - 1 && x < b.max.x + 1 && z > b.min.z - 1 && z < b.max.z + 1) { inside = true; break; }
      }
      if (inside) continue;
      this.civilians.push(new Civilian(scene, x, z, rnd));
      placed++;
    }

    // Seven scouts, spread wide so they rove the whole district and lure
    // titans away from the middle.
    for (const [x, z] of [[30, 30], [-30, 30], [30, -30], [-30, -30], [65, 0], [-65, 0], [0, -65]]) {
      this.scouts.push(new Scout(scene, x, z, rnd));
    }
    this.totalScouts = this.scouts.length;
    this.totalCivilians = this.civilians.length;
  }

  // Any NPC currently in a titan's grip and not yet chomped (for the rescue
  // compass) — nearest one to the given point.
  grabbedNPC(from) {
    let best = null, bestD = Infinity;
    for (const list of [this.scouts, this.civilians]) {
      for (const n of list) {
        if (n.beingEaten && n.grabbedBy && n.grabbedBy.eating && !n.grabbedBy.eating.chomped) {
          const p = n.grabbedBy.group.position;
          const d = from ? Math.hypot(p.x - from.x, p.z - from.z) : 0;
          if (d < bestD) { bestD = d; best = n; }
        }
      }
    }
    return best;
  }

  // The breach: everyone stampedes away from (x, z) until `until`.
  setPanic(x, z, until) {
    this.panicPoint.set(x, 0, z);
    this.panicUntil = until;
  }

  update(dt, time, titansMgr, hud) {
    const panic = time < this.panicUntil ? this.panicPoint : null;
    for (const c of this.civilians) c.update(dt, time, titansMgr.titans, this.world.colliders, panic);
    // One shared "claimed" set per frame → each scout picks a different titan.
    const claimed = new Set();
    for (const s of this.scouts) s.update(dt, time, titansMgr, hud, this.world, claimed);
  }

  scoutsAlive() {
    return this.scouts.filter((s) => s.alive).length;
  }

  civsAlive() {
    return this.civilians.filter((c) => c.alive).length;
  }

  // Called when a titan's chomp lands, or debris crushes someone.
  killNPC(ref) {
    if (!ref.alive) return;
    ref.alive = false;
    ref.beingEaten = false;
    this.scene.remove(ref.group);
    if (ref.cable) this.scene.remove(ref.cable);
  }

  // The breach kills a few unlucky civilians near the wall.
  crushNear(x, z, radius, gorePuff) {
    let killed = 0;
    for (const c of this.civilians) {
      if (!c.alive) continue;
      const p = c.group.position;
      if (Math.hypot(p.x - x, p.z - z) < radius) {
        gorePuff(p.clone().setY(1));
        this.killNPC(c);
        killed++;
        if (killed >= 2) break;
      }
    }
    return killed;
  }
}
