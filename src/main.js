import * as THREE from 'three';
import { buildWorld } from './world.js';
import { Input } from './input.js';
import { Player } from './player.js';
import { HUD } from './hud.js';
import { ODM } from './odm.js';
import { TitanManager, TTUNE } from './titans.js';
import { KillCam } from './killcam.js';
import { initAudio, playSlashHit, setGas } from './audio.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(78, window.innerWidth / window.innerHeight, 0.1, 500);

scene.add(camera); // camera-attached FX (blade swipe) need the camera in-scene

const world = buildWorld(scene);
const input = new Input();
const player = new Player(camera, world);
const hud = new HUD();
const odm = new ODM(scene, camera, player, world, hud);
const titans = new TitanManager(scene, world, odm, hud);
const killcam = new KillCam(scene, camera, titans.steam);

let state = 'play'; // 'play' | 'dead' | 'won'
let respawnAt = 0;
let hurtUntil = 0;

input.onMouseDown((button) => {
  if (button === 0 && state === 'play') odm.slash();
});

odm.onSlash = () => {
  const result = titans.trySlash(camera, player, elapsed);
  if (result === 'kill') {
    hud.toast('TITAN SLAIN');
    killcam.trigger(titans.lastKill.pos); // the scripted kill moment
    playSlashHit();
  } else if (result === 'hit') {
    hud.toast(`ABNORMAL — ${titans.lastHit.remaining} MORE CUT${titans.lastHit.remaining > 1 ? 'S' : ''}`);
    playSlashHit();
  } else if (result === 'slow') hud.toast('TOO SLOW — CUT THE NAPE AT SPEED');
  else if (result === 'body') hud.toast('AIM FOR THE NAPE');
};

function onGrab(titan) {
  if (state !== 'play') return;
  player.health -= TTUNE.grabDamage;
  hurtUntil = elapsed + 0.6;
  // Flung away from the titan.
  const away = player.pos.clone().sub(titan.group.position).setY(0).normalize();
  player.vel.addScaledVector(away, 16);
  player.vel.y = Math.max(player.vel.y, 9);
  if (player.health <= 0) {
    player.health = 0;
    state = 'dead';
    respawnAt = elapsed + 2.5;
    odm.release(odm.left);
    odm.release(odm.right);
    hud.setOverlay('<h1>DEVOURED</h1><div class="sub">Respawning at the supply point…</div>');
  } else {
    hud.toast('GRABBED — GET CLEAR');
  }
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Pointer lock: click the overlay to play (or restart after a win).
hud.overlayEl.addEventListener('click', () => {
  initAudio(); // create/resume the AudioContext on this user gesture
  if (state === 'won') {
    window.location.reload();
    return;
  }
  renderer.domElement.requestPointerLock();
});
document.addEventListener('pointerlockchange', () => {
  input.locked = document.pointerLockElement === renderer.domElement;
  if (state !== 'play') return;
  if (input.locked) {
    hud.setOverlay(null);
  } else {
    hud.setOverlay('<h1>PAUSED</h1><div class="go">CLICK TO RESUME</div>');
  }
});

let lastTime = performance.now();
let elapsed = 0;

function frame() {
  const now = performance.now();
  const realDt = Math.min((now - lastTime) / 1000, 0.033);
  lastTime = now;

  // The kill-cam runs in real time and drives a global time scale
  // (hitstop = 0, slow-mo = 0.22) that every game system reads through `dt`.
  killcam.update(realDt);
  const dt = realDt * killcam.timeScale;
  elapsed += dt;

  if (input.locked) {
    const look = input.consumeLook();
    player.applyLook(look.dx, look.dy);
  }
  player.move(dt, input);
  odm.update(dt, input);
  setGas(odm.boosting && state === 'play'); // gas jet hiss while boosting
  player.syncCamera(dt);
  titans.update(dt, elapsed, player, onGrab);

  if (state === 'dead' && elapsed >= respawnAt) {
    state = 'play';
    player.pos.set(world.supply.pos.x + 3, 0.9, world.supply.pos.z + 3);
    player.vel.set(0, 0, 0);
    player.health = 100;
    player.gas = player.maxGas;
    player.blades = player.maxBlades;
    hud.setOverlay(input.locked ? null : '<h1>PAUSED</h1><div class="go">CLICK TO RESUME</div>');
  }

  if (state === 'play' && titans.remaining() === 0) {
    state = 'won';
    document.exitPointerLock();
    hud.setOverlay(
      '<h1>DISTRICT CLEARED</h1>' +
      '<div class="sub">All titans eliminated. Humanity holds the wall — today.</div>' +
      '<div class="go">CLICK TO PLAY AGAIN</div>'
    );
  }

  hud.setHurt(elapsed < hurtUntil);

  // Safety net: hooked over the wall and fell out of the world.
  if (player.pos.y < -30) {
    player.pos.set(world.supply.pos.x + 3, 0.9, world.supply.pos.z + 3);
    player.vel.set(0, 0, 0);
    odm.release(odm.left);
    odm.release(odm.right);
    hud.toast('RECOVERED BY THE GARRISON');
  }

  // Speed-scaled FOV kick sells the sense of velocity. The kill-cam owns the
  // FOV while it's active, so leave it alone then.
  const speed = player.vel.length();
  if (!killcam.active) {
    const targetFov = 78 + Math.min(14, speed * 0.24);
    if (Math.abs(camera.fov - targetFov) > 0.05) {
      camera.fov += (targetFov - camera.fov) * Math.min(1, realDt * 6);
      camera.updateProjectionMatrix();
    }
  }

  // Supply point: stand in the ring to resupply.
  const dSupply = Math.hypot(player.pos.x - world.supply.pos.x, player.pos.z - world.supply.pos.z);
  if (dSupply < world.supply.radius && player.pos.y < 4) {
    const before = player.gas;
    player.gas = Math.min(player.maxGas, player.gas + 110 * dt);
    player.health = Math.min(100, player.health + 25 * dt);
    if (player.blades < player.maxBlades) {
      player.blades = player.maxBlades;
      hud.toast('RESUPPLIED');
    } else if (before < player.maxGas - 0.1 && player.gas >= player.maxGas - 0.1) {
      hud.toast('GAS FULL');
    }
  }

  // Supply beacon idle animation; clouds drift.
  world.supply.ring.scale.setScalar(1 + 0.08 * Math.sin(elapsed * 2.5));
  for (const c of world.clouds) {
    c.position.x += dt * 1.2;
    if (c.position.x > 190) c.position.x = -190;
  }

  hud.setBars(player.health, player.gas, player.maxGas, player.blades, player.maxBlades);
  hud.setSpeed(speed);
  hud.setTitans(titans.remaining());

  // Hijack the camera last, after the FPS controller has written it.
  killcam.applyCamera(camera);

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();

// Exposed for automated testing from the dev console.
window.__game = {
  scene, camera, player, world, input, odm, titans, killcam, THREE,
  getState: () => state,
  now: () => elapsed,
  step: (dt) => { // manual frame step for automated testing
    elapsed += dt;
    player.move(dt, input);
    odm.update(dt, input);
    player.syncCamera(dt);
    titans.update(dt, elapsed, player, onGrab);
  },
};
