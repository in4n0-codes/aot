import * as THREE from 'three';
import { TUNE } from './player.js';

export const OTUNE = {
  hookRange: 95,
  minRope: 3,
  reelSpeed: 13,    // W-reel: shorten the cable to climb / tighten the arc
  letOutSpeed: 9,
  titanZip: 0,      // no free auto-reel — you must reel/swing in yourself
  titanPull: 9,     // only a gentle assist toward the nape; skill still required
  titanMinRope: 2.5,
  boostAccel: 13,   // gentle gas thrust along the aim direction
  gasBoost: 9,      // drain per second while boosting (lasts longer)
  gasHookHold: 0.5, // drain per second per attached hook
  gasFire: 1.0,     // drain per hook shot
  gasReel: 2.0,     // drain per second while reeling in
  fireRetry: 0.18,  // holding fire re-attempts this often
  hookSpreadDeg: 5, // left/right hooks aim slightly outward
  vaultNearDist: 4,   // reel this close to a roof-edge anchor → auto-vault up
  vaultSpaceDist: 24, // ...or press Space within this range to vault early
  vaultEdgeBand: 4,   // anchor counts as "roof edge" within this of the top
};

const _a = new THREE.Vector3();
const _out = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _up = new THREE.Vector3();
const _hand = new THREE.Vector3();
const _right = new THREE.Vector3();
const _proj = new THREE.Vector3();

class Hook {
  constructor(scene, side) {
    this.side = side; // -1 left, +1 right
    this.active = false;
    this.anchor = new THREE.Vector3(); // world point (static) or local point (titan)
    this.follow = null; // Object3D the anchor rides on (titans), null for buildings
    this.ropeLen = 0;
    this.retryAt = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(8 * 3), 3));
    this.line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x15161a }));
    this.line.frustumCulled = false;
    this.line.visible = false;
    scene.add(this.line);
    this.tip = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0x2b2d33 })
    );
    this.tip.visible = false;
    scene.add(this.tip);
  }

  anchorWorld(out) {
    if (this.follow) return out.copy(this.anchor).applyMatrix4(this.follow.matrixWorld);
    return out.copy(this.anchor);
  }
}

export class ODM {
  constructor(scene, camera, player, world, hud) {
    this.scene = scene;
    this.camera = camera;
    this.player = player;
    this.world = world;
    this.hud = hud;
    this.left = new Hook(scene, -1);
    this.right = new Hook(scene, 1);
    this.targets = world.anchorMeshes.slice();
    this.ray = new THREE.Raycaster();
    this.ray.far = OTUNE.hookRange;
    this.time = 0;
    this.onSlash = null; // combat hook, set by main
    this.slashUntil = -1;
    this.slashCooldown = 0;

    // Blade swipe: an additive white streak that flicks across the camera.
    this.slashMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.7, 0.16),
      new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthTest: false,
      })
    );
    this.slashMesh.position.set(0.25, -0.1, -1.3);
    this.slashMesh.renderOrder = 10;
    camera.add(this.slashMesh);
  }

  addTarget(mesh) {
    this.targets.push(mesh);
  }

  removeTarget(mesh) {
    const i = this.targets.indexOf(mesh);
    if (i !== -1) this.targets.splice(i, 1);
    for (const hook of [this.left, this.right]) {
      if (hook.active && hook.follow && (hook.follow === mesh || hook.followRoot === mesh)) {
        this.release(hook);
      }
    }
  }

  aimRay(side) {
    // side 0 = dead center (reticle), else spread the hooks slightly outward.
    this.camera.getWorldDirection(_dir);
    if (side !== 0) {
      _up.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
      _dir.applyAxisAngle(_up, -side * OTUNE.hookSpreadDeg * (Math.PI / 180));
    }
    this.ray.set(this.camera.getWorldPosition(_hand), _dir.clone());
    return this.ray.intersectObjects(this.targets, false)[0] || null;
  }

  fire(hook) {
    if (this.player.gas <= 0) return;
    // Titan flesh uses exact centre targeting; architecture allows the per-side
    // spread so dual hooks form a stable V.
    const center = this.aimRay(0);
    const hit = center && center.object.userData.titanPart
      ? center
      : this.aimRay(hook.side) || center;
    if (!hit) return;
    hook.active = true;
    if (hit.object.userData.titanPart) {
      // Hooking ANY part of a titan latches onto the nape via the rigid group
      // transform — so you always zip to the nape (not a flailing limb whose
      // animated matrix would send the anchor drifting).
      const titan = hit.object.userData.titan;
      hook.follow = titan.group;
      hook.followRoot = titan.group;
      hook.anchor.copy(titan.nape.position); // nape's group-local position
      hook.roofY = null;
      hook.ridgeY = null;
    } else {
      hook.follow = null;
      hook.followRoot = null;
      hook.anchor.copy(hit.point);
      // Remember the roof this anchor belongs to so we can vault onto it.
      hook.roofY = hit.object.userData.roofY ?? null;
      hook.ridgeY = hit.object.userData.ridgeY ?? hook.roofY;
      hook.roofCenter = hit.object.userData.centerX !== undefined
        ? { x: hit.object.userData.centerX, z: hit.object.userData.centerZ }
        : null;
    }
    hook.ropeLen = Math.max(OTUNE.minRope, hit.distance * 0.99);
    hook.line.visible = true;
    hook.tip.visible = true;
    this.player.gas = Math.max(0, this.player.gas - OTUNE.gasFire);
    // Firing from the ground kicks you airborne so the swing can start.
    if (this.player.onGround) {
      this.player.vel.y = Math.max(this.player.vel.y, 7);
      this.player.onGround = false;
    }
  }

  release(hook) {
    hook.active = false;
    hook.follow = null;
    hook.followRoot = null;
    hook.roofY = null;
    hook.ridgeY = null;
    hook.line.visible = false;
    hook.tip.visible = false;
  }

  // Fly up and over the roof edge the hook is anchored near, landing on top.
  // Returns true if a vault happened.
  tryVault(maxDist) {
    const player = this.player;
    for (const hook of [this.left, this.right]) {
      if (!hook.active || hook.follow || hook.roofY === null) continue;
      if (hook.anchor.y < hook.roofY - OTUNE.vaultEdgeBand) continue;
      const dist = player.pos.distanceTo(hook.anchor);
      if (dist > maxDist) continue;
      // Loft over the ridge so you clear the pitch and settle onto the slope,
      // pulling inward toward the roof's centre line.
      const topY = (hook.ridgeY ?? hook.roofY) + 0.8;
      const land = new THREE.Vector3(hook.anchor.x, topY, hook.anchor.z);
      if (hook.roofCenter) {
        _dir.set(hook.roofCenter.x - hook.anchor.x, 0, hook.roofCenter.z - hook.anchor.z);
        if (_dir.lengthSq() > 0.01) land.addScaledVector(_dir.normalize(), 3.0);
      }
      const rise = Math.max(0, land.y - player.pos.y) + 1.0;
      const vy = Math.sqrt(2 * TUNE.gravity * rise) + 1.5;
      _dir.set(land.x - player.pos.x, 0, land.z - player.pos.z);
      const dh = _dir.length();
      const vh = Math.min(11, Math.max(5, dh * 1.6));
      if (dh > 0.01) _dir.divideScalar(dh);
      player.vel.set(_dir.x * vh, vy, _dir.z * vh);
      player.gas = Math.max(0, player.gas - 2);
      const t = this.time;
      this.release(this.left);
      this.release(this.right);
      this.left.retryAt = t + 0.5;  // don't instantly re-fire while held
      this.right.retryAt = t + 0.5;
      return true;
    }
    return false;
  }

  slash() {
    if (this.player.blades <= 0 || this.time < this.slashCooldown) return;
    this.slashCooldown = this.time + 0.35;
    this.player.blades -= 1;
    this.slashUntil = this.time + 0.15;
    if (this.onSlash) this.onSlash();
    if (this.player.blades <= 0) this.hud.toast('BLADES SPENT — RESUPPLY', 2200);
  }

  update(dt, input) {
    this.time += dt;
    const player = this.player;
    this.boosting = false; // set true the frames the gas thrust actually fires

    // Right mouse = right hook, Q = left hook (independent). Holding keeps
    // retrying so a hook catches the moment a surface swings into range.
    const wants = [
      [this.right, input.mouse.right],
      [this.left, input.down('KeyQ')],
    ];
    for (const [hook, want] of wants) {
      if (want && !hook.active && this.time >= hook.retryAt && input.locked) {
        hook.retryAt = this.time + OTUNE.fireRetry;
        this.fire(hook);
      } else if (!want && hook.active) {
        this.release(hook);
      }
    }

    const swinging = this.left.active || this.right.active;
    player.swinging = swinging;

    // Reel in / let out with W/S while hooked.
    if (swinging) {
      // The cable is a fixed-length line by default — gravity does the
      // swinging. W reels in (climb / tighten the arc), S pays out slack.
      const reeling = input.down('KeyW') && player.gas > 0;
      for (const hook of [this.left, this.right]) {
        if (!hook.active) continue;
        // A cable in a titan auto-reels you straight to the nape — no W needed.
        const zip = hook.follow ? OTUNE.titanZip : 0;
        const minRope = hook.follow ? OTUNE.titanMinRope : OTUNE.minRope;
        const winch = zip + (reeling ? OTUNE.reelSpeed : 0);
        if (winch > 0) hook.ropeLen = Math.max(minRope, hook.ropeLen - winch * dt);
        if (input.down('KeyS') && !hook.follow) {
          hook.ropeLen = Math.min(OTUNE.hookRange * 1.2, hook.ropeLen + OTUNE.letOutSpeed * dt);
        }
        player.gas -= OTUNE.gasHookHold * dt;
      }
      if (reeling) player.gas -= OTUNE.gasReel * dt;

      // Space: vault onto the roof if the hook is at an edge, else gas boost.
      if (input.down('Space') && player.gas > 0) {
        if (!this.tryVault(OTUNE.vaultSpaceDist)) {
          this.camera.getWorldDirection(_dir);
          player.vel.addScaledVector(_dir, OTUNE.boostAccel * dt);
          player.gas -= OTUNE.gasBoost * dt;
          this.boosting = true;
        }
      }
    }

    // Pure pendulum constraint. A cable can pull but never push: only when
    // you reach the end of the rope (dist > ropeLen) does it clamp you back to
    // the sphere and cancel the OUTWARD radial velocity. Tangential velocity
    // survives, and gravity (applied in player.move) drives the arc — so you
    // start slow near the top and accelerate through the bottom, tracing the
    // curved fall-then-swing path. Inside the radius the rope is slack and you
    // free-fall until it snaps taut again.
    for (const hook of [this.left, this.right]) {
      if (!hook.active) continue;
      hook.anchorWorld(_a);
      _out.copy(player.pos).sub(_a);
      const dist = _out.length();
      // Titan hook: actively yank the player in along the cable so a hook to
      // the nape flies you right onto it, ready to slice.
      if (hook.follow && dist > 0.001) {
        player.vel.addScaledVector(_dir.copy(_out).divideScalar(dist), -OTUNE.titanPull * dt);
      }
      if (dist > hook.ropeLen && dist > 0.001) {
        _out.divideScalar(dist);
        player.pos.copy(_a).addScaledVector(_out, hook.ropeLen);
        const outSpeed = player.vel.dot(_out);
        if (outSpeed > 0) player.vel.addScaledVector(_out, -outSpeed);
      }
    }
    if (swinging) player.collide(); // constraint may have pushed us into a wall

    // Reeled all the way up to a roof edge? Flip up onto the rooftop.
    if (swinging) this.tryVault(OTUNE.vaultNearDist);

    if (player.gas <= 0) {
      player.gas = 0;
      if (swinging) {
        this.release(this.left);
        this.release(this.right);
        player.swinging = false;
        this.hud.toast('OUT OF GAS', 2000);
      }
    }

    this.updateVisuals(dt, input);
  }

  updateVisuals(dt, input) {
    // Cables run from hip-height hand offsets to their anchors.
    _right.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
    for (const hook of [this.left, this.right]) {
      if (!hook.active) continue;
      hook.anchorWorld(_a);
      _hand.copy(this.player.pos)
        .addScaledVector(_right, hook.side * 0.45)
        .add(_up.set(0, 0.1, 0));
      // Slight catenary sag so the cable reads as a real steel line.
      const posAttr = hook.line.geometry.attributes.position;
      const dist = _hand.distanceTo(_a);
      const sag = Math.min(1.0, dist * 0.02);
      for (let i = 0; i < 8; i++) {
        const t = i / 7;
        const sx = _hand.x + (_a.x - _hand.x) * t;
        const sy = _hand.y + (_a.y - _hand.y) * t - sag * 4 * t * (1 - t);
        const sz = _hand.z + (_a.z - _hand.z) * t;
        posAttr.setXYZ(i, sx, sy, sz);
      }
      posAttr.needsUpdate = true;
      hook.tip.position.copy(_a);
    }

    // Reticle: project the current center-aim hit to screen space.
    let reticleOn = false;
    if (input.locked) {
      const hit = this.aimRay(0);
      if (hit) {
        _proj.copy(hit.point).project(this.camera);
        if (_proj.z < 1) {
          reticleOn = true;
          this.hud.setReticle(
            true,
            (_proj.x * 0.5 + 0.5) * window.innerWidth,
            (-_proj.y * 0.5 + 0.5) * window.innerHeight,
            !!hit.object.userData.titanPart // red on titan flesh
          );
        }
      }
    }
    if (!reticleOn) this.hud.setReticle(false);

    // Blade swipe animation.
    const mat = this.slashMesh.material;
    if (this.time < this.slashUntil) {
      const t = 1 - (this.slashUntil - this.time) / 0.15;
      mat.opacity = 0.85 * (1 - t);
      this.slashMesh.rotation.z = 0.9 - 1.8 * t;
    } else {
      mat.opacity = 0;
    }
  }
}
