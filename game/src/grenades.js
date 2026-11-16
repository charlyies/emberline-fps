// Ember Charge — the thrown grenade. One module, one job: simulate the
// projectile (gravity arc, one ground bounce, fuse), draw the blast, and tell
// main.js where it went off so the damage and the AI reaction live there.
import * as THREE from 'three';
import { GRENADE_FUSE, GRENADE_RADIUS, GRENADE_THROW_SPEED } from './weapons.js';

const GRAVITY = 14;
const BOUNCE_KEEP = 0.45; // velocity kept after the one ground bounce
const BLAST_LIFE = 0.45; // seconds the expanding blast shell is visible

export function createGrenades(scene, world) {
  const live = []; // {mesh, vel, fuse, bounced}
  const blasts = []; // {mesh, light, life}
  const bodyGeo = new THREE.SphereGeometry(0.09, 10, 8);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.35, metalness: 0.8, emissive: 0xff7a1a, emissiveIntensity: 0.6 });
  const shellGeo = new THREE.SphereGeometry(1, 20, 14);

  function throwGrenade(from, dir) {
    const mesh = new THREE.Mesh(bodyGeo, bodyMat);
    mesh.position.copy(from);
    mesh.castShadow = true;
    scene.add(mesh);
    // Up-biased launch so the charge lobs over mid cover instead of skimming it.
    const vel = new THREE.Vector3(dir.x, dir.y + 0.45, dir.z)
      .normalize()
      .multiplyScalar(GRENADE_THROW_SPEED);
    live.push({ mesh, vel, fuse: GRENADE_FUSE, bounced: false });
  }

  function detonate(g, onDetonate) {
    scene.remove(g.mesh);
    const pos = g.mesh.position.clone();
    // Expanding orange shell + a short point-light flash.
    const mat = new THREE.MeshBasicMaterial({ color: 0xffa347, transparent: true, opacity: 0.9 });
    const shell = new THREE.Mesh(shellGeo, mat);
    shell.position.copy(pos);
    shell.scale.setScalar(0.2);
    scene.add(shell);
    const light = new THREE.PointLight(0xff8c3a, 120, 18, 1.8);
    light.position.copy(pos).y += 0.5;
    scene.add(light);
    blasts.push({ mesh: shell, light, life: BLAST_LIFE });
    onDetonate(pos);
  }

  // Step the simulation. `onDetonate(pos)` runs once per blast, in main.js.
  function update(dt, onDetonate) {
    for (let i = live.length - 1; i >= 0; i--) {
      const g = live[i];
      g.fuse -= dt;
      g.vel.y -= GRAVITY * dt;
      g.mesh.position.addScaledVector(g.vel, dt);
      const p = g.mesh.position;
      if (p.y <= 0.09) {
        if (!g.bounced && Math.abs(g.vel.y) > 2) {
          // One bounce, then it rolls: kill the vertical speed, keep sliding.
          g.vel.y = -g.vel.y * BOUNCE_KEEP;
          g.vel.x *= 0.7; g.vel.z *= 0.7;
          p.y = 0.09;
          g.bounced = true;
        } else {
          p.y = 0.09;
          g.vel.y = 0; g.vel.x *= 0.86; g.vel.z *= 0.86;
        }
      }
      if (world.blockedAt(p.x, p.z, 0.1)) {
        // Clipped a wall mid-flight: stop dead and cook the rest of the fuse.
        g.vel.multiplyScalar(0.1);
      }
      if (g.fuse <= 0) { live.splice(i, 1); detonate(g, onDetonate); }
    }
    for (let i = blasts.length - 1; i >= 0; i--) {
      const b = blasts[i];
      b.life -= dt;
      const k = Math.max(0, b.life / BLAST_LIFE);
      b.mesh.scale.setScalar(0.2 + (1 - k) * GRENADE_RADIUS);
      b.mesh.material.opacity = k * 0.9;
      b.light.intensity = 120 * k;
      if (b.life <= 0) {
        scene.remove(b.mesh); scene.remove(b.light);
        b.mesh.material.dispose();
        blasts.splice(i, 1);
      }
    }
  }

  function clear() {
    for (const g of live) scene.remove(g.mesh);
    for (const b of blasts) { scene.remove(b.mesh); scene.remove(b.light); b.mesh.material.dispose(); }
    live.length = 0; blasts.length = 0;
  }

  return { throwGrenade, update, clear, get active() { return live.length; } };
}
