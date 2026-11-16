// Foundry Yard — an original industrial arena built only from three.js primitives.
// Dark steel floor, ember-orange accents, frost-blue trim, a central Beacon platform,
// two spawn yards, a mid lane and two flank routes. All cover is an AABB collider.
import * as THREE from 'three';

export const MAP = { half: 26, wallH: 5 };
export const BEACON = { x: 0, z: 0, r: 3.2 };
export const EMBER_SPAWN = { x: 0, z: 21 };
export const FROST_SPAWN = { x: 0, z: -21 };

// Waypoints: mid lane + west flank + east flank, used by bot navigation.
export const WAYPOINTS = [
  { x: 0, z: 14 }, { x: 0, z: 6 }, { x: 0, z: -6 }, { x: 0, z: -14 },
  { x: -12, z: 16 }, { x: -16, z: 6 }, { x: -16, z: -6 }, { x: -12, z: -16 },
  { x: 12, z: 16 }, { x: 16, z: 6 }, { x: 16, z: -6 }, { x: 12, z: -16 },
  { x: -7, z: 0 }, { x: 7, z: 0 }, { x: 0, z: 0 },
];

const STEEL = 0x39404a, STEEL_DARK = 0x272b31, FLOOR = 0x2f333a;
const EMBER = 0xff7a1a, FROST = 0x37b6ff, CRATE = 0x4a3b28, PIPE = 0x5a6068;

export function createWorld(scene) {
  const colliders = []; // {minX,maxX,minZ,maxZ,top}
  const group = new THREE.Group();
  scene.add(group);

  const mat = (c, rough = 0.9, metal = 0.25) =>
    new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal });

  function box(x, z, w, h, d, color, opts = {}) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, opts.rough ?? 0.9, opts.metal ?? 0.25));
    m.position.set(x, h / 2 + (opts.y ?? 0), z);
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
    if (!opts.noCollide) {
      colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, top: h + (opts.y ?? 0) });
    }
    return m;
  }
  function cyl(x, z, r, h, color, opts = {}) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 20), mat(color, 0.7, 0.5));
    m.position.set(x, h / 2, z);
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
    if (!opts.noCollide) {
      colliders.push({ minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r, top: h });
    }
    return m;
  }

  // Floor + perimeter walls
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(MAP.half * 2 + 8, MAP.half * 2 + 8), mat(FLOOR, 1, 0.1));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; group.add(floor);
  const H = MAP.half;
  box(0, -H - 1, H * 2 + 4, MAP.wallH, 2, STEEL_DARK);
  box(0, H + 1, H * 2 + 4, MAP.wallH, 2, STEEL_DARK);
  box(-H - 1, 0, 2, MAP.wallH, H * 2 + 4, STEEL_DARK);
  box(H + 1, 0, 2, MAP.wallH, H * 2 + 4, STEEL_DARK);

  // Central Beacon platform + glowing core and ring
  const platform = new THREE.Mesh(new THREE.CylinderGeometry(BEACON.r + 0.8, BEACON.r + 1.1, 0.35, 32),
    new THREE.MeshStandardMaterial({ color: 0x33383f, roughness: 0.6, metalness: 0.6 }));
  platform.position.set(0, 0.175, 0); platform.receiveShadow = true; group.add(platform);
  const beaconRing = new THREE.Mesh(new THREE.TorusGeometry(BEACON.r, 0.12, 10, 48),
    new THREE.MeshStandardMaterial({ color: EMBER, emissive: EMBER, emissiveIntensity: 1.4 }));
  beaconRing.rotation.x = Math.PI / 2; beaconRing.position.set(0, 0.42, 0); group.add(beaconRing);
  const beaconCore = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 3.4, 12),
    new THREE.MeshStandardMaterial({ color: 0xffc27a, emissive: 0xff7a1a, emissiveIntensity: 2.2, transparent: true, opacity: 0.85 }));
  beaconCore.position.set(0, 2.0, 0); group.add(beaconCore);
  const beaconLight = new THREE.PointLight(0xff8c3a, 30, 22, 1.6);
  beaconLight.position.set(0, 3.2, 0); group.add(beaconLight);

  // Mid-lane cover: staggered blocks either side of the Beacon
  box(-4.5, 7, 3.4, 1.5, 1.2, CRATE);
  box(4.5, -7, 3.4, 1.5, 1.2, CRATE);
  box(0, 10.5, 2.2, 2.4, 2.2, STEEL);
  box(0, -10.5, 2.2, 2.4, 2.2, STEEL);

  // Flank routes: crate stacks + pipe columns
  for (const [x, z] of [[-16, 10], [-16, -10], [16, 10], [16, -10]]) {
    box(x, z, 3, 1.4, 3, CRATE);
    box(x, z, 2, 1.2, 2, 0x5a4630, { y: 1.4 });
  }
  for (const [x, z] of [[-20, 0], [20, 0], [-9, 18], [9, -18], [-9, -18], [9, 18]]) cyl(x, z, 0.9, 3.6, PIPE);
  // Long side walls mid-flank (sightline breakers)
  box(-13, 0, 1.2, 2.8, 7, STEEL);
  box(13, 0, 1.2, 2.8, 7, STEEL);
  // Low flank walls: cover to bank an Ember Charge around, on each side.
  box(-13, 8, 1.2, 1.5, 4, STEEL);
  box(13, -8, 1.2, 1.5, 4, STEEL);
  // Gantry beam over the Beacon (visual landmark, high enough to walk under).
  box(0, 0, 10, 0.6, 0.8, PIPE, { y: 4.2, noCollide: true });
  // Spawn-yard cover
  box(-7, 19, 4, 1.3, 1.4, CRATE);
  box(7, 19, 4, 1.3, 1.4, CRATE);
  box(-7, -19, 4, 1.3, 1.4, CRATE);
  box(7, -19, 4, 1.3, 1.4, CRATE);

  // Team-coloured floor strips marking each spawn yard
  function strip(z, color) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.2),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.7 }));
    s.rotation.x = -Math.PI / 2; s.position.set(0, 0.02, z); group.add(s);
  }
  strip(24.5, EMBER); strip(-24.5, FROST);
  // Pale guide strips down the mid lane edges, so the route to the Beacon
  // reads at a glance even in the fog.
  function laneStrip(x) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 22),
      new THREE.MeshStandardMaterial({ color: 0x8a7a5a, emissive: 0x8a7a5a, emissiveIntensity: 0.35 }));
    s.rotation.x = -Math.PI / 2; s.position.set(x, 0.02, 0); group.add(s);
  }
  laneStrip(-5.5); laneStrip(5.5);

  // Furnace glow at the Ember end, coolant glow at the Frost end (visual landmarks)
  const emberGlow = new THREE.PointLight(0xff6a00, 40, 26, 1.5); emberGlow.position.set(0, 4, 25); group.add(emberGlow);
  const frostGlow = new THREE.PointLight(0x2f9dff, 40, 26, 1.5); frostGlow.position.set(0, 4, -25); group.add(frostGlow);

  // ---- collision + ray helpers (AABB slabs) ----
  function blockedAt(x, z, radius) {
    if (Math.abs(x) > H - radius || Math.abs(z) > H - radius) return true;
    for (const c of colliders) {
      if (x + radius > c.minX && x - radius < c.maxX && z + radius > c.minZ && z - radius < c.maxZ) return true;
    }
    return false;
  }
  // Ray vs AABBs: distance to first blocking wall, or Infinity.
  function rayWall(origin, dir, maxDist) {
    let best = Infinity;
    for (const c of colliders) {
      if (c.top < 0.3) continue;
      const t = rayAABB(origin, dir, c.minX, 0, c.minZ, c.maxX, c.top, c.maxZ);
      if (t !== null && t < best && t <= maxDist) best = t;
    }
    return best;
  }
  function hasLOS(a, b) {
    const dx = b.x - a.x, dy = (b.y ?? 1.4) - (a.y ?? 1.4), dz = b.z - a.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.01) return true;
    const dir = { x: dx / len, y: dy / len, z: dz / len };
    return rayWall(a, dir, len - 0.4) === Infinity;
  }
  return { colliders, blockedAt, rayWall, hasLOS, beaconRing, beaconCore, beaconLight, group };
}

function rayAABB(o, d, minX, minY, minZ, maxX, maxY, maxZ) {
  let tmin = 0, tmax = Infinity;
  const axes = [['x', minX, maxX], ['y', minY, maxY], ['z', minZ, maxZ]];
  for (const [ax, mn, mx] of axes) {
    const od = o[ax], dd = d[ax];
    if (Math.abs(dd) < 1e-9) { if (od < mn || od > mx) return null; }
    else {
      let t1 = (mn - od) / dd, t2 = (mx - od) / dd;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmin;
}

// Short-lived tracer lines for shots.
export function createTracers(scene) {
  const list = [];
  return {
    add(from, to, color) {
      const g = new THREE.BufferGeometry().setFromPoints([from, to]);
      const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
      scene.add(line);
      list.push({ line, life: 0.09 });
    },
    update(dt) {
      for (let i = list.length - 1; i >= 0; i--) {
        list[i].life -= dt;
        list[i].line.material.opacity = Math.max(0, list[i].life / 0.09) * 0.9;
        if (list[i].life <= 0) { scene.remove(list[i].line); list[i].line.geometry.dispose(); list.splice(i, 1); }
      }
    },
  };
}
