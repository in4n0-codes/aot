import * as THREE from 'three';
import { buildWorld } from './world.js';
import { Input } from './input.js';
import { Player } from './player.js';
import { HUD } from './hud.js';
import { ODM } from './odm.js';
import { TitanManager, TTUNE } from './titans.js';
import { NPCManager } from './npcs.js';
import { Cinematic } from './colossal.js';
import { KillCam } from './killcam.js';
import { initAudio, playSlashHit, setGas, playRumble, playImpact, playThunder } from './audio.js';
import { initMusic, startMusic, toggleMusic, nextTrack, getMusicStatus } from './music.js';

// powerPreference: 'high-performance' tells the browser to route the WebGL
// context to the discrete GPU (e.g. an NVIDIA card) instead of the integrated
// one on laptops with switchable graphics — the single biggest lever a web
// page has over which GPU actually does the rendering. See README for the
// OS/browser-level settings needed alongside this to guarantee it.
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: 'high-performance',
});
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
const npcs = new NPCManager(scene, world);
const killcam = new KillCam(scene, camera, titans.steam);

let state = 'start'; // start | cinematic | play | grabbed | dead | won
let respawnAt = 0;
let hurtUntil = 0;
let exposure = 0; // seconds spent in a titan's grab zone
let rescues = 0;  // NPCs saved by cutting a titan mid-bite
const milestones = new Set(); // titan-count callouts already fired

let lastTime = performance.now();
let elapsed = 0;

const cine = new Cinematic({
  scene, world, odm, titans, npcs, hud, camera, player,
  now: () => elapsed,
  audio: { playRumble, playImpact, playThunder },
});

// A titan's chomp landed on someone.
function onEaten(kind, ref, titan, at) {
  titans.gorePuff(at);
  if (kind === 'player') {
    player.health = 0;
    state = 'dead';
    respawnAt = elapsed + 3;
    hud.setOverlay('<h1>DEVOURED</h1><div class="sub">A titan got you. Respawning at the supply point…</div>');
  } else {
    npcs.killNPC(ref);
    if (kind === 'scout') hud.toast('A SCOUT WAS EATEN', 2600);
  }
}

input.onMouseDown((button) => {
  if (button === 0 && state === 'play') odm.slash();
});

// Milestone callouts in the spirit of the show as the death toll climbs.
const MILESTONES = {
  1: 'FIRST BLOOD — FOR HUMANITY',
  10: '10 TITANS DOWN — TATAKAE!',
  20: '20 SLAIN — WE ARE HUMANITY’S LAST HOPE',
  30: 'THE DISTRICT IS CLEAR — GIVE YOUR HEARTS',
};
function checkMilestones() {
  const k = titans.kills;
  for (const n in MILESTONES) {
    if (k >= +n && !milestones.has(+n)) {
      milestones.add(+n);
      if (+n < TTUNE.budget) hud.toast(MILESTONES[n], 2800);
    }
  }
}

odm.onSlash = () => {
  const result = titans.trySlash(camera, player, elapsed);
  if (result === 'kill') {
    if (titans.lastKill.rescued) {
      rescues++;
      hud.toast(titans.lastKill.rescued === 'scout' ? 'SCOUT SAVED!' : 'CIVILIAN SAVED!', 2200);
    } else {
      hud.toast('TITAN SLAIN');
    }
    killcam.trigger(titans.lastKill.pos);
    playSlashHit();
    checkMilestones();
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
    hud.toast('SWIPED — GET CLEAR');
  }
}

function respawn() {
  state = 'play';
  player.pos.set(world.supply.pos.x + 3, 0.9, world.supply.pos.z + 3);
  player.vel.set(0, 0, 0);
  player.health = 100;
  player.gas = player.maxGas;
  player.blades = player.maxBlades;
  exposure = 0;
  hud.setOverlay(input.locked ? null : '<h1>PAUSED</h1><div class="go">CLICK TO RESUME</div>');
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Click to deploy: locks the pointer, starts the audio context, and — on the
// first click — rolls the breach cinematic.
hud.overlayEl.addEventListener('click', () => {
  initAudio();
  initMusic().then(startMusic); // wait for playlist.json before starting playback
  if (state === 'won') {
    window.location.reload();
    return;
  }
  renderer.domElement.requestPointerLock();
  if (state === 'start') {
    state = 'cinematic';
    hud.setOverlay(null);
    cine.start();
  }
});
document.addEventListener('pointerlockchange', () => {
  input.locked = document.pointerLockElement === renderer.domElement;
  if (state !== 'play') return;
  if (input.locked) hud.setOverlay(null);
  else hud.setOverlay('<h1>PAUSED</h1><div class="go">CLICK TO RESUME</div>');
});
document.addEventListener('keydown', (e) => {
  if (e.code === 'Enter' && state === 'cinematic') cine.skip();
  if (e.code === 'KeyM') toggleMusic();
  if (e.code === 'KeyN') nextTrack();
});

// Rating blends mid-bite rescues (the headline stat) with how many scouts and
// civilians survived overall.
function starCount() {
  const scoutsSurv = npcs.scoutsAlive();
  const civsSurv = npcs.civsAlive();
  const score = rescues + Math.floor(scoutsSurv / 2) + Math.floor(civsSurv / 6);
  return score >= 7 ? 3 : score >= 4 ? 2 : score >= 1 ? 1 : 0;
}
function starGlyphs(n) {
  return '★'.repeat(n) + '☆'.repeat(3 - n);
}

function frame() {
  const now = performance.now();
  const realDt = Math.min((now - lastTime) / 1000, 0.033);
  lastTime = now;

  killcam.update(realDt);
  const dt = realDt * killcam.timeScale;
  elapsed += dt;

  const playing = state === 'play';

  if (playing && input.locked) {
    const look = input.consumeLook();
    player.applyLook(look.dx, look.dy);
  } else {
    input.consumeLook(); // drop mouse deltas while not in control
  }

  if (playing) {
    player.move(dt, input);
    odm.update(dt, input);
    setGas(odm.boosting);
  } else {
    setGas(false);
  }
  if (state !== 'cinematic' && state !== 'grabbed') player.syncCamera(dt);
  if (state === 'grabbed') {
    // The titan's hand is carrying us — just point the camera.
    player.syncCamera(dt);
    camera.position.x += (Math.random() - 0.5) * 0.06;
    camera.position.y += (Math.random() - 0.5) * 0.06;
  }

  titans.update(dt, elapsed, player, onGrab, npcs, { onEaten });
  npcs.update(dt, elapsed, titans, hud);

  // Linger in a titan's grab zone too long and it plucks you off the ground.
  if (playing) {
    const grabber = titans.nearestGrabber(player, elapsed);
    if (grabber) {
      exposure += dt;
      if (exposure > TTUNE.eatExposure - 1 && exposure < TTUNE.eatExposure) {
        hud.setHurt(true); // red edges: it's reaching for you
      }
      if (exposure >= TTUNE.eatExposure) {
        exposure = 0;
        odm.release(odm.left);
        odm.release(odm.right);
        if (titans.startEatPlayer(grabber, player)) state = 'grabbed';
      }
    } else {
      exposure = Math.max(0, exposure - dt * 2);
    }
  }

  if (state === 'dead' && elapsed >= respawnAt) respawn();

  if ((playing || state === 'grabbed' || state === 'dead') && titans.kills >= TTUNE.budget) {
    state = 'won';
    document.exitPointerLock();
    setGas(false);
    hud.setRescue(false);
    const sa = npcs.scoutsAlive(), ca = npcs.civsAlive();
    hud.setOverlay(
      '<h1>WALL MARIA SECURED</h1>' +
      `<div class="stars">${starGlyphs(starCount())}</div>` +
      `<div class="sub">All ${TTUNE.budget} titans eliminated. Humanity lives to see another day.<br/>` +
      `Rescues: ${rescues} &nbsp;·&nbsp; Scouts ${sa}/${npcs.totalScouts} &nbsp;·&nbsp; Civilians ${ca}/${npcs.totalCivilians}</div>` +
      '<div class="go">CLICK TO PLAY AGAIN</div>'
    );
  }

  hud.setHurt(elapsed < hurtUntil || (playing && exposure > TTUNE.eatExposure - 1));

  if (player.pos.y < -30) {
    player.pos.set(world.supply.pos.x + 3, 0.9, world.supply.pos.z + 3);
    player.vel.set(0, 0, 0);
    odm.release(odm.left);
    odm.release(odm.right);
    hud.toast('RECOVERED BY THE GARRISON');
  }

  const speed = player.vel.length();
  if (!killcam.active && state !== 'cinematic') {
    const targetFov = 78 + Math.min(14, speed * 0.24);
    if (Math.abs(camera.fov - targetFov) > 0.05) {
      camera.fov += (targetFov - camera.fov) * Math.min(1, realDt * 6);
      camera.updateProjectionMatrix();
    }
  }

  const dSupply = Math.hypot(player.pos.x - world.supply.pos.x, player.pos.z - world.supply.pos.z);
  if (playing && dSupply < world.supply.radius && player.pos.y < 4) {
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

  world.supply.ring.scale.setScalar(1 + 0.08 * Math.sin(elapsed * 2.5));
  for (const c of world.clouds) {
    c.position.x += dt * 1.2;
    if (c.position.x > 190) c.position.x = -190;
  }

  hud.setBars(player.health, player.gas, player.maxGas, player.blades, player.maxBlades);
  hud.setSpeed(speed);
  hud.setCounts(titans.kills, TTUNE.budget, npcs.scoutsAlive(), npcs.totalScouts,
    npcs.civsAlive(), npcs.totalCivilians, rescues);
  hud.drawMap(player, titans.titans, npcs);

  // Rescue compass: point the player toward the nearest victim in a titan's
  // grip, with a live countdown to the chomp.
  if (playing) {
    const victim = npcs.grabbedNPC(player.pos);
    if (victim) {
      const eat = victim.grabbedBy.eating;
      const secsLeft = Math.max(0, eat.T.chomp - eat.t);
      hud.setRescue(true, victim.grabbedBy.group.position, player, secsLeft,
        npcs.scouts.includes(victim));
    } else {
      hud.setRescue(false);
    }
  } else {
    hud.setRescue(false);
  }

  // Camera owners, in priority order: cinematic > killcam > FPS controller.
  if (state === 'cinematic') {
    cine.update(realDt);
    if (cine.done) {
      state = 'play';
      hud.toast('TITANS HAVE BREACHED THE WALL — DEFEND THE DISTRICT', 3200);
    }
  } else {
    killcam.applyCamera(camera);
  }

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();

// Exposed for automated testing from the dev console.
window.__game = {
  scene, camera, player, world, input, odm, titans, npcs, cine, killcam, THREE,
  getState: () => state,
  setState: (s) => { state = s; },
  getExposure: () => exposure,
  now: () => elapsed,
  getMusicStatus,
  step: (dt) => { // manual frame step for automated testing
    elapsed += dt;
    player.move(dt, input);
    odm.update(dt, input);
    player.syncCamera(dt);
    titans.update(dt, elapsed, player, onGrab, npcs, { onEaten });
    npcs.update(dt, elapsed, titans, hud);
  },
};
