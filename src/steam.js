import * as THREE from 'three';

// A single pooled point-sprite system that drives every steam effect:
// ambient wisps off living titans, the nape burst on a cut, and the big
// eruption column on death. One draw call, soft round sprites, per-particle
// colour/size/alpha so steam (pale) and blood (dark red) share the pool.
export class SteamSystem {
  constructor(scene, max = 1200) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.aSize = new Float32Array(max);
    this.aAlpha = new Float32Array(max);
    this.vel = [];
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.grow = new Float32Array(max);
    this.buoy = new Float32Array(max);
    this.peak = new Float32Array(max);
    for (let i = 0; i < max; i++) this.vel.push(new THREE.Vector3());
    this.cursor = 0;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.aSize, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.aAlpha, 1).setUsage(THREE.DynamicDrawUsage));

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      vertexShader: `
        attribute float aSize;
        attribute float aAlpha;
        attribute vec3 aColor;
        varying float vAlpha;
        varying vec3 vColor;
        void main() {
          vAlpha = aAlpha;
          vColor = aColor;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (520.0 / max(-mv.z, 0.1));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying float vAlpha;
        varying vec3 vColor;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float r = length(d);
          if (r > 0.5) discard;
          float a = smoothstep(0.5, 0.05, r) * vAlpha;
          gl_FragColor = vec4(vColor, a);
        }`,
    });

    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
    scene.add(this.points);
    this.geo = geo;
  }

  emit(px, py, pz, vx, vy, vz, life, size, grow, buoy, peak, r, g, b) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    const i3 = i * 3;
    this.pos[i3] = px; this.pos[i3 + 1] = py; this.pos[i3 + 2] = pz;
    this.col[i3] = r; this.col[i3 + 1] = g; this.col[i3 + 2] = b;
    this.vel[i].set(vx, vy, vz);
    this.life[i] = life; this.maxLife[i] = life;
    this.aSize[i] = size; this.grow[i] = grow;
    this.buoy[i] = buoy; this.peak[i] = peak;
    this.aAlpha[i] = 0;
  }

  update(dt) {
    const drag = 1 / (1 + dt * 1.1);
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const i3 = i * 3;
      if (this.life[i] <= 0) { this.aAlpha[i] = 0; continue; }
      const v = this.vel[i];
      v.y += this.buoy[i] * dt;
      v.multiplyScalar(drag);
      this.pos[i3] += v.x * dt;
      this.pos[i3 + 1] += v.y * dt;
      this.pos[i3 + 2] += v.z * dt;
      this.aSize[i] += this.grow[i] * dt;
      // Fade in fast, out slow over the particle's life.
      const t = this.life[i] / this.maxLife[i]; // 1 -> 0
      const fadeIn = Math.min(1, (1 - t) * 6);
      this.aAlpha[i] = this.peak[i] * t * fadeIn;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
  }
}
