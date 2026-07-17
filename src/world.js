import * as THREE from 'three';

// Deterministic RNG so the district layout is stable between reloads.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- procedural canvas textures ----------

function makeTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function drawWindow(ctx, x, y, w, h, opts = {}) {
  // shutters
  ctx.fillStyle = opts.shutter || '#7a5138';
  ctx.fillRect(x - w * 0.42, y, w * 0.36, h);
  ctx.fillRect(x + w * 1.06, y, w * 0.36, h);
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(x - w * 0.42, y + (h * i) / 4); ctx.lineTo(x - w * 0.06, y + (h * i) / 4);
    ctx.moveTo(x + w * 1.06, y + (h * i) / 4); ctx.lineTo(x + w * 1.42, y + (h * i) / 4);
    ctx.stroke();
  }
  // frame + glass
  ctx.fillStyle = opts.frame || '#4c3a29';
  ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  ctx.fillStyle = '#20272e';
  ctx.fillRect(x, y, w, h);
  // mullions + glint
  ctx.strokeStyle = opts.frame || '#4c3a29';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2, y + h);
  ctx.moveTo(x, y + h / 2); ctx.lineTo(x + w, y + h / 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(180,200,215,0.20)';
  ctx.fillRect(x + 2, y + 2, w / 2 - 4, h / 2 - 4);
  // sill
  ctx.fillStyle = opts.frame || '#4c3a29';
  ctx.fillRect(x - 4, y + h + 2, w + 8, 3);
}

// One story of facade; tiles vertically per floor.
function facadeTexture(style) {
  return makeTexture(256, 128, (ctx, w, h) => {
    const palettes = [
      { bg: '#cfc3a6', beam: '#55412d' },  // plaster + heavy timber
      { bg: '#a8a195', beam: '#6e675c' },  // grey stone
    ];
    const p = style === 1 ? palettes[1] : palettes[0];
    if (style === 2) p.bg = '#c2a284';
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, w, h);
    // weathering noise
    for (let i = 0; i < 160; i++) {
      ctx.fillStyle = `rgba(${30 + Math.random() * 40 | 0},${25 + Math.random() * 35 | 0},${20 + Math.random() * 30 | 0},${0.03 + Math.random() * 0.05})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 10, 2 + Math.random() * 6);
    }
    if (style === 1) {
      // stone block courses
      ctx.strokeStyle = 'rgba(60,55,48,0.35)';
      ctx.lineWidth = 2;
      for (let y = 0; y <= h; y += 26) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
        const off = (y / 26) % 2 ? 32 : 0;
        for (let x = off; x <= w; x += 64) {
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 26); ctx.stroke();
        }
      }
    } else {
      // half-timber framing
      ctx.fillStyle = p.beam;
      ctx.fillRect(0, 0, w, 7);
      ctx.fillRect(0, h - 7, w, 7);
      ctx.fillRect(0, 0, 6, h);
      ctx.fillRect(w - 6, 0, 6, h);
      ctx.fillRect(w / 2 - 3, 0, 6, h);
      // diagonal brace
      ctx.save();
      ctx.strokeStyle = p.beam;
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(8, h - 8); ctx.lineTo(w / 2 - 6, 8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(w - 8, h - 8); ctx.lineTo(w / 2 + 6, 8); ctx.stroke();
      ctx.restore();
    }
    // two windows per story tile
    drawWindow(ctx, w * 0.20, h * 0.24, w * 0.14, h * 0.44);
    drawWindow(ctx, w * 0.66, h * 0.24, w * 0.14, h * 0.44);
  });
}

function roofTexture() {
  return makeTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#82493a';
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) {
      ctx.fillStyle = '#5e332a';
      ctx.fillRect(0, y + 14, w, 2);
      const off = (y / 16) % 2 ? 8 : 0;
      ctx.fillStyle = 'rgba(50,25,20,0.5)';
      for (let x = off; x < w; x += 16) ctx.fillRect(x, y, 1.5, 16);
      for (let x = off; x < w; x += 16) {
        ctx.fillStyle = `rgba(${120 + Math.random() * 50 | 0},${60 + Math.random() * 25 | 0},${45 + Math.random() * 20 | 0},0.25)`;
        ctx.fillRect(x + 1, y + 1, 14, 13);
      }
    }
  });
}

function cobbleTexture() {
  return makeTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#66625a';
    ctx.fillRect(0, 0, w, h);
    for (let gy = 0; gy < 8; gy++) {
      for (let gx = 0; gx < 8; gx++) {
        const cx = gx * 32 + 16 + (Math.random() - 0.5) * 6;
        const cy = gy * 32 + 16 + (Math.random() - 0.5) * 6;
        const g = 95 + Math.random() * 35;
        ctx.fillStyle = `rgb(${g | 0},${g * 0.97 | 0},${g * 0.9 | 0})`;
        ctx.beginPath();
        ctx.ellipse(cx, cy, 13 + Math.random() * 3, 11 + Math.random() * 3, Math.random(), 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(40,38,34,0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    // moss flecks
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = `rgba(90,110,60,${0.10 + Math.random() * 0.15})`;
      ctx.beginPath();
      ctx.arc(Math.random() * w, Math.random() * h, 2 + Math.random() * 4, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function wallTexture() {
  return makeTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#a29c91';
    ctx.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 42) {
      ctx.fillStyle = 'rgba(70,66,60,0.45)';
      ctx.fillRect(x, 0, 4, h);
    }
    for (let y = 0; y < h; y += 86) {
      ctx.fillStyle = 'rgba(70,66,60,0.30)';
      ctx.fillRect(0, y, w, 3);
    }
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `rgba(50,48,44,${0.04 + Math.random() * 0.07})`;
      const x = Math.random() * w;
      ctx.fillRect(x, Math.random() * h * 0.4, 3 + Math.random() * 6, 40 + Math.random() * 120);
    }
  });
}

function grassTexture() {
  return makeTexture(64, 64, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const greens = ['#5a7a3a', '#6b8a45', '#4e6c34', '#77914e'];
    for (let i = 0; i < 11; i++) {
      const x0 = 12 + Math.random() * 40;
      const x1 = x0 + (Math.random() - 0.5) * 26;
      const y1 = 6 + Math.random() * 18;
      ctx.strokeStyle = greens[(Math.random() * greens.length) | 0];
      ctx.lineWidth = 2.5 + Math.random() * 1.5;
      ctx.beginPath();
      ctx.moveTo(x0, h);
      ctx.quadraticCurveTo(x0 + (x1 - x0) * 0.3, h * 0.5, x1, y1);
      ctx.stroke();
    }
  });
}

function cloudTexture() {
  return makeTexture(128, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    for (const [cx, cy, r] of [[64, 64, 52], [40, 70, 34], [90, 72, 30], [64, 48, 36]]) {
      const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, r);
      g.addColorStop(0, 'rgba(255,255,255,0.85)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    }
  });
}

// ---------- world ----------

export function buildWorld(scene) {
  const rand = mulberry32(20250708);
  const colliders = [];
  const anchorMeshes = [];
  const roofs = [];     // pitched roof surfaces the player can stand/walk on
  const buildings = []; // building box meshes (wreckable)
  const chimsRef = {};  // instanced chimneys; filled once they're built

  // Overcast-blue sky, distance fog like the show's establishing shots.
  scene.background = new THREE.Color(0x9db6ca);
  scene.fog = new THREE.Fog(0xa6bac7, 90, 340);

  const hemi = new THREE.HemisphereLight(0xd3dbe2, 0x6d6858, 1.35);
  const sun = new THREE.DirectionalLight(0xf3e8cf, 2.0);
  sun.position.set(90, 150, 55);
  sun.castShadow = true;
  // The shadow frustum TRACKS THE PLAYER (see updateSunShadow) instead of
  // spanning the whole 280-unit district. Two big wins: three can frustum-cull
  // far-away casters out of the shadow pass entirely (it was re-rendering every
  // building and every titan limb each frame), and the same 2048 map now covers
  // ~85 units instead of 280 — roughly 3x sharper shadows for less work.
  const SHADOW_EXTENT = 85;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -SHADOW_EXTENT; sun.shadow.camera.right = SHADOW_EXTENT;
  sun.shadow.camera.top = SHADOW_EXTENT; sun.shadow.camera.bottom = -SHADOW_EXTENT;
  sun.shadow.camera.near = 20; sun.shadow.camera.far = 420;
  sun.shadow.bias = -0.0006;
  scene.add(hemi, sun, sun.target);

  // Slide the sun + its target so the lit region stays centred on the player,
  // keeping the light DIRECTION identical (offset is constant).
  const SUN_OFFSET = new THREE.Vector3(90, 150, 55);
  function updateSunShadow(px, pz) {
    sun.position.set(px + SUN_OFFSET.x, SUN_OFFSET.y, pz + SUN_OFFSET.z);
    sun.target.position.set(px, 0, pz);
    sun.target.updateMatrixWorld();
  }

  // Cobbled ground
  const cobble = cobbleTexture();
  cobble.repeat.set(44, 44);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(280, 280),
    new THREE.MeshLambertMaterial({ map: cobble })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Building materials (cached per style + size class so textures tile right)
  const facades = [facadeTexture(0), facadeTexture(1), facadeTexture(2)];
  const roofTex = roofTexture();
  const box = new THREE.BoxGeometry(1, 1, 1);
  const matCache = new Map();
  function buildingMats(style, w, h, d) {
    const rx = Math.max(1, Math.round(w / 6.5));
    const ry = Math.max(2, Math.round(h / 4.2));
    const rr = Math.max(2, Math.round(Math.max(w, d) / 4));
    const key = `${style}|${rx}|${ry}|${rr}`;
    if (matCache.has(key)) return matCache.get(key);
    const ft = facades[style].clone();
    ft.needsUpdate = true;
    ft.repeat.set(rx, ry);
    const side = new THREE.MeshLambertMaterial({ map: ft });
    const rt = roofTex.clone();
    rt.needsUpdate = true;
    rt.repeat.set(rr, rr);
    const top = new THREE.MeshLambertMaterial({ map: rt });
    const mats = [side, side, top, top, side, side];
    matCache.set(key, mats);
    return mats;
  }

  // Gabled (pitched) roofs — the show's steep terracotta rooflines. Built as
  // two sloped faces (tiled roof texture) plus two triangular gable ends
  // (plaster). The player can stand and walk on the slope (see player.collide).
  const roofFaceMat = new THREE.MeshLambertMaterial({ map: roofTex, side: THREE.DoubleSide });
  const gableMats = [0xcabfa2, 0xa8a195, 0xc2a284].map(
    (c) => new THREE.MeshLambertMaterial({ color: c, side: THREE.DoubleSide })
  );
  const V = THREE.Vector3;
  function pushTri(pos, uv, a, b, c, ua, ub, uc) {
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    uv.push(ua[0], ua[1], ub[0], ub[1], uc[0], uc[1]);
  }
  function addGableRoof(cx, cz, w, d, eaveY, style) {
    const ridgeAlongX = w >= d;
    const hwWall = (ridgeAlongX ? w : d) / 2;
    const hacWall = (ridgeAlongX ? d : w) / 2;
    const over = 0.5;
    const hw = hwWall + over, hac = hacWall + over;
    const ridgeH = Math.min(hacWall * 0.95, 6.5);
    const ridgeY = eaveY + ridgeH;
    const rd = ridgeAlongX ? new V(1, 0, 0) : new V(0, 0, 1); // ridge direction
    const ac = ridgeAlongX ? new V(0, 0, 1) : new V(1, 0, 0); // across direction
    // Vertices are built LOCAL to the building (pivot at cx/eaveY/cz, eave at
    // y=0, ridge at y=ridgeH) and the mesh's own .position carries the world
    // offset. This keeps rotation/position edits (e.g. wreck damage) sane —
    // baking absolute world coords into the vertices instead made any later
    // rotation swing the roof around the world origin, flinging it into the sky.
    const base = new V(0, 0, 0);
    const corner = (sr, sa, y) => base.clone()
      .addScaledVector(rd, sr * hw).addScaledVector(ac, sa * hac).setY(y);
    const R0 = corner(-1, 0, ridgeH), R1 = corner(1, 0, ridgeH);
    const A0 = corner(-1, -1, 0), A1 = corner(1, -1, 0);
    const B0 = corner(-1, 1, 0), B1 = corner(1, 1, 0);

    const slant = Math.hypot(hac, ridgeH);
    const uMax = (2 * hw) / 3, vMax = slant / 3;

    // Two sloped roof faces.
    const rp = [], ruv = [];
    pushTri(rp, ruv, R0, R1, B1, [0, 0], [uMax, 0], [uMax, vMax]);
    pushTri(rp, ruv, R0, B1, B0, [0, 0], [uMax, vMax], [0, vMax]);
    pushTri(rp, ruv, R1, R0, A0, [0, 0], [uMax, 0], [uMax, vMax]);
    pushTri(rp, ruv, R1, A0, A1, [0, 0], [uMax, vMax], [0, vMax]);
    const roofGeo = new THREE.BufferGeometry();
    roofGeo.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));
    roofGeo.setAttribute('uv', new THREE.Float32BufferAttribute(ruv, 2));
    roofGeo.computeVertexNormals();
    const roofMesh = new THREE.Mesh(roofGeo, roofFaceMat);
    roofMesh.position.set(cx, eaveY, cz);
    roofMesh.castShadow = true;
    roofMesh.receiveShadow = true;
    roofMesh.userData.hookable = true;
    roofMesh.userData.roofY = eaveY;
    roofMesh.userData.ridgeY = ridgeY;
    roofMesh.userData.centerX = cx;
    roofMesh.userData.centerZ = cz;
    scene.add(roofMesh);
    anchorMeshes.push(roofMesh);

    // Two triangular gable ends.
    const gp = [], guv = [];
    pushTri(gp, guv, A0, B0, R0, [0, 0], [1, 0], [0.5, 1]);
    pushTri(gp, guv, B1, A1, R1, [0, 0], [1, 0], [0.5, 1]);
    const gableGeo = new THREE.BufferGeometry();
    gableGeo.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3));
    gableGeo.setAttribute('uv', new THREE.Float32BufferAttribute(guv, 2));
    gableGeo.computeVertexNormals();
    const gableMesh = new THREE.Mesh(gableGeo, gableMats[style]);
    gableMesh.position.set(cx, eaveY, cz);
    gableMesh.castShadow = true;
    gableMesh.receiveShadow = true;
    scene.add(gableMesh);

    const record = { cx, cz, hw: hwWall, hac: hacWall, eaveY, ridgeH, ridgeAlongX };
    roofs.push(record);
    return { ridgeY, roofMesh, gableMesh, record };
  }

  // District layout: 26u grid with wider lanes between houses, height TIERS
  // (taller toward the center) so same-tier roofs chain into runs and taller
  // tiers are one hook-vault away.
  const doorSpots = [];
  const chimneySpots = [];
  for (let gx = -91; gx <= 91; gx += 26) {
    for (let gz = -91; gz <= 91; gz += 26) {
      if (Math.abs(gx) < 26 && Math.abs(gz) < 26) continue; // plaza
      if (rand() < 0.10) continue; // occasional courtyard gap
      const w = 12 + rand() * 3;
      const d = 12 + rand() * 3;
      const ring = Math.max(Math.abs(gx), Math.abs(gz));
      const tiers = ring > 78 ? [10, 13] : ring > 52 ? [13, 16] : [16, 20];
      const h = tiers[(rand() * tiers.length) | 0] + rand() * 1.0;
      const x = gx + (rand() - 0.5) * 4;
      const z = gz + (rand() - 0.5) * 4;
      const style = rand() < 0.62 ? 0 : rand() < 0.75 ? 2 : 1;
      const mesh = new THREE.Mesh(box, buildingMats(style, w, h, d));
      mesh.scale.set(w, h, d);
      mesh.position.set(x, h / 2, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.hookable = true;
      mesh.userData.roofY = h; // eave line (top of the walls)
      mesh.userData.centerX = x;
      mesh.userData.centerZ = z;
      scene.add(mesh);
      mesh.updateMatrixWorld();
      anchorMeshes.push(mesh);
      const bCollider = new THREE.Box3(
        new THREE.Vector3(x - w / 2, 0, z - d / 2),
        new THREE.Vector3(x + w / 2, h, z + d / 2)
      );
      colliders.push(bCollider);
      const roofBits = addGableRoof(x, z, w, d, h, style);
      const ridgeY = roofBits.ridgeY;
      mesh.userData.ridgeY = ridgeY;
      mesh.userData.collider = bCollider;
      mesh.userData.roofBits = roofBits; // for wrecking
      buildings.push(mesh);
      // door on the street side facing the plaza-ish
      const side = Math.abs(x) > Math.abs(z) ? (x > 0 ? 3 : 1) : (z > 0 ? 2 : 0);
      const dx = [0, -1, 0, 1][side], dz = [-1, 0, 1, 0][side];
      doorSpots.push({
        x: x + dx * (w / 2 + 0.07) + (rand() - 0.5) * w * 0.3 * Math.abs(dz),
        z: z + dz * (d / 2 + 0.07) + (rand() - 0.5) * d * 0.3 * Math.abs(dx),
        ry: side * Math.PI / 2,
      });
      if (rand() < 0.5) {
        // Chimney rises through the roof, near the ridge line.
        const alongRidge = w >= d;
        mesh.userData.chimneyIdx = chimneySpots.length; // so wrecks can drop it
        chimneySpots.push({
          x: x + (alongRidge ? (rand() - 0.5) * w * 0.55 : 0),
          y: ridgeY - 0.3,
          z: z + (alongRidge ? 0 : (rand() - 0.5) * d * 0.55),
        });
      }
    }
  }

  // Doors (instanced)
  const doorGeo = new THREE.BoxGeometry(1.5, 2.6, 0.14);
  const doorMat = new THREE.MeshLambertMaterial({ color: 0x4a3626 });
  const doors = new THREE.InstancedMesh(doorGeo, doorMat, doorSpots.length);
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1);
  const _e = new THREE.Euler();
  doorSpots.forEach((dsp, i) => {
    _q.setFromEuler(_e.set(0, dsp.ry, 0));
    _m.compose(new THREE.Vector3(dsp.x, 1.3, dsp.z), _q, _s);
    doors.setMatrixAt(i, _m);
  });
  scene.add(doors);

  // Chimneys (instanced)
  const chimGeo = new THREE.BoxGeometry(0.9, 1.7, 0.9);
  const chimMat = new THREE.MeshLambertMaterial({ color: 0x7d7468 });
  const chims = new THREE.InstancedMesh(chimGeo, chimMat, chimneySpots.length);
  chimneySpots.forEach((c, i) => {
    _q.identity();
    _m.compose(new THREE.Vector3(c.x, c.y, c.z), _q, _s);
    chims.setMatrixAt(i, _m);
  });
  chims.castShadow = true;
  scene.add(chims);
  chimsRef.inst = chims; // wrecks drop their chimney with the roof

  // Perimeter wall — Wall Maria scale, hookable. The SOUTH wall (z=+113) is
  // breakable: the opening cinematic kicks a hole through it.
  const wallTex = wallTexture();
  function buildWallSeg(x, z, w, d, h = 55, y0 = 0) {
    const wt = wallTex.clone(); wt.needsUpdate = true;
    wt.repeat.set(Math.max(w, d) / 14, h / 14);
    const mesh = new THREE.Mesh(box, new THREE.MeshLambertMaterial({ map: wt }));
    mesh.scale.set(w, h, d);
    mesh.position.set(x, y0 + h / 2, z);
    mesh.userData.hookable = true;
    mesh.userData.roofY = y0 + h;
    mesh.userData.centerX = x;
    mesh.userData.centerZ = z;
    mesh.receiveShadow = true;
    scene.add(mesh);
    mesh.updateMatrixWorld();
    anchorMeshes.push(mesh);
    const collider = new THREE.Box3(
      new THREE.Vector3(x - w / 2, y0, z - d / 2),
      new THREE.Vector3(x + w / 2, y0 + h, z + d / 2)
    );
    colliders.push(collider);
    return { mesh, collider };
  }
  for (const [x, z, w, d] of [[0, -113, 232, 7], [-113, 0, 7, 232], [113, 0, 7, 232]]) {
    buildWallSeg(x, z, w, d);
  }
  const southWall = buildWallSeg(0, 113, 232, 7);
  const worldRef = {}; // filled at return; breakWall closes over everything

  // ---- Instanced rubble pool ----
  // A breach + wrecked houses scatter 150+ stones and shards. As individual
  // meshes that's 150+ draw calls (doubled in the shadow pass) for identical
  // boxes; pooling them into ONE InstancedMesh makes it a single call.
  const rubbleMatShared = new THREE.MeshLambertMaterial({ color: 0x8d877c });
  const RUBBLE_MAX = 400;
  const rubbleMesh = new THREE.InstancedMesh(box, rubbleMatShared, RUBBLE_MAX);
  rubbleMesh.castShadow = true;
  rubbleMesh.receiveShadow = true;
  rubbleMesh.count = 0;
  rubbleMesh.frustumCulled = false; // spread across the whole district
  scene.add(rubbleMesh);
  const _rm = new THREE.Matrix4(), _rq = new THREE.Quaternion();
  const _rp = new THREE.Vector3(), _rsc = new THREE.Vector3(), _rot = new THREE.Euler();
  function addRubble(px, py, pz, sx, sy, sz, rx, ry, rz) {
    if (rubbleMesh.count >= RUBBLE_MAX) return;
    const i = rubbleMesh.count++;
    _rq.setFromEuler(_rot.set(rx, ry, rz));
    _rm.compose(_rp.set(px, py, pz), _rq, _rsc.set(sx, sy, sz));
    rubbleMesh.setMatrixAt(i, _rm);
    rubbleMesh.instanceMatrix.needsUpdate = true;
  }

  // Solid stone chunk: instanced visual + a real collider so nobody walks through.
  function addStone(x, y, z, s, solid = true) {
    const py = Math.max(y, s * 0.35);
    addRubble(x, py, z, s, s * 0.7, s,
      Math.random() * 0.4, Math.random() * Math.PI, Math.random() * 0.4);
    if (solid && s >= 1.1) {
      colliders.push(new THREE.Box3(
        new THREE.Vector3(x - s / 2, 0, z - s / 2),
        new THREE.Vector3(x + s / 2, py + s * 0.35, z + s / 2)
      ));
    }
  }

  // Kick a HOLE through the south wall — not a missing wall. Two flanking
  // segments plus a heavy lintel spanning the top of the gap, so the breach
  // reads as a ragged archway (~24 wide × 26 high).
  function breakWall(odm) {
    if (worldRef.hole && worldRef.hole.open) return;
    scene.remove(southWall.mesh);
    const ai = anchorMeshes.indexOf(southWall.mesh);
    if (ai !== -1) anchorMeshes.splice(ai, 1);
    if (odm) odm.removeTarget(southWall.mesh);
    const ci = colliders.indexOf(southWall.collider);
    if (ci !== -1) colliders.splice(ci, 1);
    const gapHalf = 12, holeH = 26, h = 55;
    const segW = (232 - gapHalf * 2) / 2;
    for (const sx of [-1, 1]) {
      const seg = buildWallSeg(sx * (gapHalf + segW / 2), 113, segW, 7);
      if (odm) odm.addTarget(seg.mesh);
    }
    // Lintel: the wall above the hole survives.
    const lw = gapHalf * 2 + 2;
    const wt = wallTex.clone(); wt.needsUpdate = true;
    wt.repeat.set(lw / 14, (h - holeH) / 14);
    const lintel = new THREE.Mesh(box, new THREE.MeshLambertMaterial({ map: wt }));
    lintel.scale.set(lw, h - holeH, 7);
    lintel.position.set(0, holeH + (h - holeH) / 2, 113);
    lintel.userData.hookable = true;
    lintel.userData.roofY = h;
    lintel.userData.centerX = 0;
    lintel.userData.centerZ = 113;
    lintel.castShadow = true;
    scene.add(lintel);
    lintel.updateMatrixWorld();
    anchorMeshes.push(lintel);
    colliders.push(new THREE.Box3(
      new THREE.Vector3(-lw / 2, holeH, 113 - 3.5),
      new THREE.Vector3(lw / 2, h, 113 + 3.5)
    ));
    if (odm) odm.addTarget(lintel);
    // Ragged jamb shards at the hole's edges.
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const s = 1.5 + Math.random() * 2;
        addRubble(
          sx * (gapHalf - 0.5), 2 + i * 7 + Math.random() * 3, 113 + (Math.random() - 0.5) * 3,
          s * 0.7, 3 + Math.random() * 7, s * 0.7,
          0, 0, sx * (0.1 + Math.random() * 0.25)
        );
      }
    }
    // Rubble heaped at the breach — SOLID stones.
    for (let i = 0; i < 9; i++) {
      addStone((Math.random() - 0.5) * 22, 0, 104 + Math.random() * 9, 1 + Math.random() * 2.6);
    }
    worldRef.hole.open = true;
  }

  // A stone strike wrecks a house — each one differently. Three ruin styles:
  //  'slump'  — roof gone, walls collapsed low and tilted
  //  'shear'  — one whole side torn away, the rest standing tall and cracked
  //  'gutted' — roof half-collapsed into the shell, jagged shard skyline
  function dropChimney(mesh) {
    const idx = mesh.userData.chimneyIdx;
    if (idx === undefined || !chimsRef.inst) return;
    const zero = new THREE.Matrix4().makeScale(0.0001, 0.0001, 0.0001);
    chimsRef.inst.setMatrixAt(idx, zero);
    chimsRef.inst.instanceMatrix.needsUpdate = true;
  }
  function shardRing(mesh, topY, n) {
    // Jagged broken-masonry shards along the ruin's skyline.
    const w = mesh.scale.x, d = mesh.scale.z;
    for (let i = 0; i < n; i++) {
      const sw = 0.8 + Math.random() * 1.6;
      const sh = 1.5 + Math.random() * 3.5;
      const edge = Math.random() < 0.5;
      addRubble(
        mesh.position.x + (edge ? (Math.random() - 0.5) * w : (Math.random() < 0.5 ? -1 : 1) * w * 0.45),
        topY + sh * 0.2,
        mesh.position.z + (edge ? (Math.random() < 0.5 ? -1 : 1) * d * 0.45 : (Math.random() - 0.5) * d),
        sw, sh, sw,
        (Math.random() - 0.5) * 0.5, Math.random() * Math.PI, (Math.random() - 0.5) * 0.5
      );
    }
  }
  function wreckBuilding(mesh, odm) {
    if (!mesh || mesh.userData.wrecked) return;
    mesh.userData.wrecked = true;
    const bits = mesh.userData.roofBits;
    const style = ['slump', 'shear', 'gutted'][(Math.random() * 3) | 0];
    const c = mesh.userData.collider;
    const origH = mesh.scale.y;
    // Decide the new wall height up front so the roof (if it's kept for the
    // 'gutted' look) can settle onto it by a RELATIVE amount, not an absolute
    // position overwrite — the roof mesh's position is its real world anchor
    // now (see addGableRoof), so rotating/moving it stays local to the house.
    const newHFor = {
      slump: origH * (0.4 + Math.random() * 0.2),
      shear: origH * (0.8 + Math.random() * 0.15),
      gutted: origH * (0.62 + Math.random() * 0.12),
    };
    const newH = newHFor[style];

    // The roof is torn off (or caves in) in every style.
    if (bits) {
      const ri = roofs.indexOf(bits.record);
      if (ri !== -1) roofs.splice(ri, 1); // never a phantom surface
      const ai = anchorMeshes.indexOf(bits.roofMesh);
      if (ai !== -1) anchorMeshes.splice(ai, 1);
      if (odm) odm.removeTarget(bits.roofMesh);
      if (style === 'gutted') {
        // Half the roof stays, sunk down onto the shorter walls and caved in
        // at an angle — tilts/rotates about the roof's own base now, so it
        // settles onto the house instead of flinging off into the sky.
        bits.gableMesh && scene.remove(bits.gableMesh);
        bits.roofMesh.position.y -= (origH - newH);
        bits.roofMesh.rotation.x = (Math.random() - 0.5) * 0.25;
        bits.roofMesh.rotation.z = 0.35 + Math.random() * 0.25;
        bits.roofMesh.scale.set(0.55, 1, 0.9);
      } else {
        scene.remove(bits.roofMesh);
        scene.remove(bits.gableMesh);
      }
    }
    dropChimney(mesh);

    if (style === 'slump') {
      mesh.scale.y = newH;
      mesh.position.y = newH / 2;
      mesh.rotation.z = (Math.random() - 0.5) * 0.3;
      mesh.rotation.x = (Math.random() - 0.5) * 0.18;
      mesh.userData.roofY = newH;
      mesh.userData.ridgeY = newH;
      if (c) c.max.y = newH;
      shardRing(mesh, newH, 5);
    } else if (style === 'shear') {
      // Tear one whole side away: the box narrows and shifts so a flank is gone.
      const axis = Math.random() < 0.5 ? 'x' : 'z';
      const side = Math.random() < 0.5 ? -1 : 1;
      const keep = 0.55 + Math.random() * 0.15;
      const old = mesh.scale[axis];
      mesh.scale[axis] = old * keep;
      mesh.position[axis] += side * old * (1 - keep) * 0.5;
      mesh.scale.y = newH;
      mesh.position.y = newH / 2;
      mesh.rotation.z = (Math.random() - 0.5) * 0.1;
      mesh.userData.roofY = newH;
      mesh.userData.ridgeY = newH;
      if (c) {
        c.max.y = newH;
        const half = mesh.scale[axis] / 2;
        c.min[axis === 'x' ? 'x' : 'z'] = mesh.position[axis] - half;
        c.max[axis === 'x' ? 'x' : 'z'] = mesh.position[axis] + half;
      }
      // Debris where the torn side used to stand.
      const spillAt = mesh.position[axis] - side * (mesh.scale[axis] / 2 + 2);
      for (let i = 0; i < 5; i++) {
        const px = axis === 'x' ? spillAt + (Math.random() - 0.5) * 4 : mesh.position.x + (Math.random() - 0.5) * mesh.scale.x;
        const pz = axis === 'z' ? spillAt + (Math.random() - 0.5) * 4 : mesh.position.z + (Math.random() - 0.5) * mesh.scale.z;
        addStone(px, 0, pz, 1 + Math.random() * 2.2);
      }
      shardRing(mesh, newH, 4);
    } else { // gutted
      mesh.scale.y = newH;
      mesh.position.y = newH / 2;
      mesh.rotation.x = (Math.random() - 0.5) * 0.08;
      mesh.userData.roofY = newH;
      mesh.userData.ridgeY = newH;
      if (c) c.max.y = newH;
      shardRing(mesh, newH, 6);
    }
    // Rubble spilling into the street — SOLID stones you can't walk through.
    for (let i = 0; i < 6; i++) {
      addStone(
        mesh.position.x + (Math.random() - 0.5) * (mesh.scale.x + 9),
        0,
        mesh.position.z + (Math.random() - 0.5) * (mesh.scale.z + 9),
        0.9 + Math.random() * 2.2
      );
    }
  }

  // Grass tufts (instanced) sprinkled along streets, plaza edge, wall base.
  const grassGeo = new THREE.PlaneGeometry(1.1, 0.9);
  grassGeo.translate(0, 0.45, 0);
  const grassMat = new THREE.MeshLambertMaterial({
    map: grassTexture(), alphaTest: 0.35, side: THREE.DoubleSide,
  });
  const spots = [];
  for (let i = 0; i < 520 && spots.length < 420; i++) {
    let px, pz;
    if (rand() < 0.3) { // wall-base band
      const along = (rand() * 2 - 1) * 104;
      const edge = 100 + rand() * 7;
      if (rand() < 0.5) { px = along; pz = rand() < 0.5 ? edge : -edge; }
      else { px = rand() < 0.5 ? edge : -edge; pz = along; }
    } else {
      px = (rand() * 2 - 1) * 100;
      pz = (rand() * 2 - 1) * 100;
    }
    if (Math.hypot(px, pz) < 9) continue; // keep beacon clear
    let inside = false;
    for (const b of colliders) {
      if (px > b.min.x - 0.4 && px < b.max.x + 0.4 && pz > b.min.z - 0.4 && pz < b.max.z + 0.4) { inside = true; break; }
    }
    if (!inside) spots.push({ px, pz, s: 0.7 + rand() * 0.8, r: rand() * Math.PI });
  }
  const grass = new THREE.InstancedMesh(grassGeo, grassMat, spots.length * 2);
  spots.forEach((sp, i) => {
    for (let k = 0; k < 2; k++) {
      _q.setFromEuler(_e.set(0, sp.r + k * Math.PI / 2, 0));
      _m.compose(new THREE.Vector3(sp.px, 0, sp.pz), _q, _s.set(sp.s, sp.s, sp.s));
      grass.setMatrixAt(i * 2 + k, _m);
    }
  });
  _s.set(1, 1, 1);
  scene.add(grass);

  // A few trees around the plaza and streets.
  const treeSpots = [[-30, -30], [30, -31], [-31, 30], [31, 31], [0, -36], [37, 0], [-70, 8], [8, 72]];
  const trunkGeo = new THREE.CylinderGeometry(0.28, 0.42, 3.6, 7);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5d4630 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeSpots.length);
  const canopyGeo = new THREE.SphereGeometry(1, 10, 8);
  const canopyMat = new THREE.MeshLambertMaterial({ color: 0x4f6b3a });
  const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, treeSpots.length * 2);
  treeSpots.forEach(([tx, tz], i) => {
    _q.identity();
    _m.compose(new THREE.Vector3(tx, 1.8, tz), _q, _s.set(1, 1, 1));
    trunks.setMatrixAt(i, _m);
    _m.compose(new THREE.Vector3(tx, 4.2, tz), _q, _s.set(1.9, 1.6, 1.9));
    canopies.setMatrixAt(i * 2, _m);
    _m.compose(new THREE.Vector3(tx + 0.8, 3.4, tz - 0.4), _q, _s.set(1.3, 1.1, 1.3));
    canopies.setMatrixAt(i * 2 + 1, _m);
  });
  _s.set(1, 1, 1);
  trunks.castShadow = true;
  canopies.castShadow = true;
  scene.add(trunks, canopies);

  // Drifting clouds.
  const cloudTex = cloudTexture();
  const clouds = [];
  for (let i = 0; i < 9; i++) {
    const cm = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: cloudTex, transparent: true, opacity: 0.5 + rand() * 0.25,
        depthWrite: false, fog: false,
      })
    );
    const sc = 45 + rand() * 55;
    cm.scale.set(sc, sc * 0.6, 1);
    cm.rotation.x = -Math.PI / 2;
    cm.position.set((rand() * 2 - 1) * 160, 95 + rand() * 45, (rand() * 2 - 1) * 160);
    cm.renderOrder = 5;
    scene.add(cm);
    clouds.push(cm);
  }

  // Supply point: glowing beacon in the plaza.
  const supplyPos = new THREE.Vector3(0, 0, 0);
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(0.6, 0.8, 7, 10),
    new THREE.MeshLambertMaterial({ color: 0x2e4034, emissive: 0x5fe08a, emissiveIntensity: 0.9 })
  );
  beacon.position.set(supplyPos.x, 3.5, supplyPos.z);
  scene.add(beacon);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(3.4, 4.6, 40),
    new THREE.MeshBasicMaterial({ color: 0x5fe08a, transparent: true, opacity: 0.4, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(supplyPos.x, 0.06, supplyPos.z);
  scene.add(ring);
  const glow = new THREE.PointLight(0x5fe08a, 14, 26);
  glow.position.set(supplyPos.x, 4, supplyPos.z);
  scene.add(glow);

  const world = {
    colliders,
    roofs,
    buildings,
    anchorMeshes,
    clouds,
    supply: { pos: supplyPos, radius: 5, beacon, ring },
    hole: { x: 0, z: 108, halfWidth: 12, open: false },
    breakWall,
    wreckBuilding,
    addStone,
    updateSunShadow,
  };
  worldRef.hole = world.hole;
  return world;
}
