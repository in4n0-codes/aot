import * as THREE from 'three';

export const TUNE = {
  gravity: 20,        // gentler fall — graceful, readable pendulum arcs
  walkSpeed: 6,
  sprintSpeed: 10,
  groundLerp: 9,      // smoother start/stop
  airAccel: 7,        // gentle air steering — jumps arc predictably
  airDrag: 0.05,
  jumpVel: 8,         // modest hop — roof gaps need a running start
  maxSpeed: 27,       // cap top speed so swings never run away from you
  eyeHeight: 0.7,     // above body center
  lookSens: 0.0014,   // calmer mouse
};

const _wish = new THREE.Vector3();
const _step = new THREE.Vector3();

export class Player {
  constructor(camera, world) {
    this.camera = camera;
    this.world = world;
    this.pos = new THREE.Vector3(0, 0.9, 10); // body center
    this.vel = new THREE.Vector3();
    this.half = new THREE.Vector3(0.4, 0.9, 0.4);
    this.yaw = 0; // face the plaza (spawn is at +Z looking toward -Z)
    this.pitch = 0;
    this.onGround = false;
    this.health = 100;
    this.maxGas = 260;   // big tank — recharge trips are rare
    this.gas = this.maxGas;
    this.blades = 20;
    this.maxBlades = 20;
    this.swinging = false; // set by ODM each frame
    this.roll = 0;
    camera.rotation.order = 'YXZ';
  }

  applyLook(dx, dy) {
    this.yaw -= dx * TUNE.lookSens;
    this.pitch -= dy * TUNE.lookSens;
    this.pitch = Math.max(-1.52, Math.min(1.52, this.pitch));
  }

  move(dt, input) {
    _wish.set(0, 0, 0);
    // While swinging, W/S are reserved for reeling (handled by ODM).
    if (!this.swinging) {
      if (input.down('KeyW')) _wish.z -= 1;
      if (input.down('KeyS')) _wish.z += 1;
    }
    if (input.down('KeyA')) _wish.x -= 1;
    if (input.down('KeyD')) _wish.x += 1;
    if (_wish.lengthSq() > 0) {
      _wish.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    }

    if (this.onGround && !this.swinging) {
      const speed = input.down('ShiftLeft') || input.down('ShiftRight')
        ? TUNE.sprintSpeed : TUNE.walkSpeed;
      // Landing hot? Skid instead of braking — momentum should survive touchdown.
      const hSpeed = Math.hypot(this.vel.x, this.vel.z);
      const lerp = hSpeed > 9 ? 2.2 : TUNE.groundLerp;
      const t = Math.min(1, dt * lerp);
      this.vel.x += (_wish.x * speed - this.vel.x) * t;
      this.vel.z += (_wish.z * speed - this.vel.z) * t;
      if (input.down('Space') && !this.swinging) {
        this.vel.y = TUNE.jumpVel;
        this.onGround = false;
      }
    } else {
      this.vel.x += _wish.x * TUNE.airAccel * dt;
      this.vel.z += _wish.z * TUNE.airAccel * dt;
      const drag = 1 / (1 + dt * TUNE.airDrag);
      this.vel.multiplyScalar(drag);
    }

    this.vel.y -= TUNE.gravity * dt;

    const sp = this.vel.length();
    if (sp > TUNE.maxSpeed) this.vel.multiplyScalar(TUNE.maxSpeed / sp);

    // Substep integration so a fast swing can NEVER tunnel through a wall:
    // keep each step under 0.3 units (walls/titan bodies are far thicker).
    const moveDist = sp * dt;
    const steps = Math.min(24, Math.max(1, Math.ceil(moveDist / 0.3)));
    for (let i = 0; i < steps; i++) {
      _step.copy(this.vel).multiplyScalar(dt / steps);
      this.pos.add(_step);
      this.collide();
    }
  }

  syncCamera(dt = 0.016) {
    this.camera.position.set(this.pos.x, this.pos.y + TUNE.eyeHeight, this.pos.z);
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
    // Bank into lateral velocity while airborne — sells the swing arc.
    let target = 0;
    if (!this.onGround) {
      const lateral = this.vel.x * Math.cos(this.yaw) - this.vel.z * Math.sin(this.yaw);
      target = Math.max(-0.11, Math.min(0.11, -lateral * 0.0045));
    }
    this.roll += (target - this.roll) * Math.min(1, dt * 5);
    this.camera.rotation.z = this.roll;
  }

  collide() {
    this.onGround = false;
    if (this.pos.y - this.half.y <= 0) {
      this.pos.y = this.half.y;
      if (this.vel.y < 0) this.vel.y = 0;
      this.onGround = true;
    }
    const p = this.pos, h = this.half;
    for (const b of this.world.colliders) {
      const ox = Math.min(p.x + h.x, b.max.x) - Math.max(p.x - h.x, b.min.x);
      if (ox <= 0) continue;
      const oz = Math.min(p.z + h.z, b.max.z) - Math.max(p.z - h.z, b.min.z);
      if (oz <= 0) continue;
      const oy = Math.min(p.y + h.y, b.max.y) - Math.max(p.y - h.y, b.min.y);
      if (oy <= 0) continue;
      // Push out along the axis of least penetration.
      if (oy <= ox && oy <= oz) {
        if (p.y >= (b.min.y + b.max.y) / 2) {
          p.y += oy;
          if (this.vel.y < 0) this.vel.y = 0;
          this.onGround = true;
        } else {
          p.y -= oy;
          if (this.vel.y > 0) this.vel.y = 0;
        }
      } else if (ox <= oz) {
        const s = p.x >= (b.min.x + b.max.x) / 2 ? 1 : -1;
        p.x += s * ox;
        if (Math.sign(this.vel.x) === -s) this.vel.x = 0;
      } else {
        const s = p.z >= (b.min.z + b.max.z) / 2 ? 1 : -1;
        p.z += s * oz;
        if (Math.sign(this.vel.z) === -s) this.vel.z = 0;
      }
    }

    // Pitched roofs: stand and walk on the sloped surface. The building box
    // handles the walls up to the eave; here we ride the gable above it.
    const roofs = this.world.roofs;
    if (roofs) {
      for (const r of roofs) {
        // Include the eave overhang (~0.7) so there's no gap between the wall
        // and the roof for a climber to slip through.
        const along = r.ridgeAlongX ? Math.abs(p.x - r.cx) : Math.abs(p.z - r.cz);
        const across = r.ridgeAlongX ? Math.abs(p.z - r.cz) : Math.abs(p.x - r.cx);
        if (along > r.hw + 0.7 || across > r.hac + 0.7) continue;
        const acrossC = Math.min(across, r.hac);
        const surf = r.eaveY + r.ridgeH * (1 - acrossC / r.hac);
        const feet = p.y - h.y;
        // The roof is SOLID: any time you're within the footprint at or below
        // the sloped surface (and not deep inside the walls) you sit on top of
        // it — so a fast climb can never punch through the roof.
        if (feet <= surf + 0.05 && feet >= r.eaveY - 3) {
          p.y = surf + h.y;
          if (this.vel.y < 0) this.vel.y = 0;
          this.onGround = true;
        }
      }
    }

    // Living titans are solid: a vertical cylinder around the torso pushes the
    // player out so you can't fly through the body. You still reach the nape
    // because it sits at the cylinder's surface — you stop right on it.
    const bodies = this.world.titanBodies;
    if (bodies) {
      for (const t of bodies) {
        if (p.y - h.y > t.top) continue; // above the head
        const dx = p.x - t.x, dz = p.z - t.z;
        const d = Math.hypot(dx, dz);
        const r = t.r + h.x;
        if (d < r && d > 0.0001) {
          const push = r - d;
          p.x += (dx / d) * push;
          p.z += (dz / d) * push;
          const vn = (this.vel.x * dx + this.vel.z * dz) / d; // inward speed
          if (vn < 0) { this.vel.x -= (dx / d) * vn; this.vel.z -= (dz / d) * vn; }
        }
      }
    }
  }
}
