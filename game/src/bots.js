// Bots: box-built humanoids with team-coloured chevrons, waypoint navigation,
// line-of-sight engagement, strafing and burst fire. No external models.
import * as THREE from 'three';
import { WAYPOINTS } from './world.js';
import { range } from './random.js';

const TEAM_COLOR = { ember: 0xff7a1a, frost: 0x37b6ff };
const EMBER_NAMES = ['Ash', 'Cinder', 'Flint', 'Sable'];
const FROST_NAMES = ['Glacier', 'Rime', 'Blizzard', 'Hail', 'Sleet'];

function buildModel(team) {
  const color = TEAM_COLOR[team];
  const g = new THREE.Group();
  const suit = new THREE.MeshStandardMaterial({ color: team === 'ember' ? 0x5a3a22 : 0x22384a, roughness: 0.8, metalness: 0.2 });
  const trim = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.9, roughness: 0.5 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc9a586, roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.85, 0.34), suit);
  body.position.y = 1.0; body.castShadow = true; g.add(body);
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.2, 0.36), trim);
  vest.position.y = 1.25; g.add(vest);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), skin);
  head.position.y = 1.62; head.castShadow = true; g.add(head);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.1, 0.05), trim);
  visor.position.set(0, 1.64, 0.18); g.add(visor);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.72), new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.4, metalness: 0.7 }));
  gun.position.set(0.28, 1.15, 0.3); gun.castShadow = true; g.add(gun);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.55, 0.22), suit);
  legL.position.set(-0.15, 0.28, 0); g.add(legL);
  const legR = legL.clone(); legR.position.x = 0.15; g.add(legR);
  // Floating team chevron (down-pointing cone) above the head.
  const chev = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.34, 4),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.6, transparent: true, opacity: 0.95 }));
  chev.rotation.x = Math.PI; chev.position.y = 2.25; g.add(chev);
  return { group: g, body, head, gun, legL, legR, chev, suitMat: suit };
}

// One role per bot, so a round is not nine identical rifles: SMG bots push
// close and spray, riflemen hold mid-range, and one sniper per team posts up
// far back and punishes anyone crossing a sightline.
const ROLES = ['rifle', 'rifle', 'smg', 'sniper', 'rifle'];
const ROLE_STATS = {
  smg: { shotDamage: 10, fireInterval: [0.3, 0.42], burst: [3, 5] },
  rifle: { shotDamage: 13, fireInterval: [0.42, 0.6], burst: [2, 4] },
  sniper: { shotDamage: 24, fireInterval: [1.0, 1.3], burst: [1, 1] },
};
const ROLE_NAMES = { smg: 'Hornet SMG', rifle: 'Longshot Rifle', sniper: 'Deadeye' };

export function createBot(scene, world, opts) {
  const { team, index, x, z, rng } = opts;
  const name = team === 'ember' ? EMBER_NAMES[index % EMBER_NAMES.length] : FROST_NAMES[index % FROST_NAMES.length];
  const model = buildModel(team);
  model.group.position.set(x, 0, z);
  scene.add(model.group);
  const skill = team === 'frost' ? range(rng, 0.55, 0.8) : range(rng, 0.6, 0.85); // aim skill 0..1
  const role = ROLES[index % ROLES.length];
  const roleStats = ROLE_STATS[role];
  const skillMult = opts.skillMult ?? 1;
  const speedMult = opts.speedMult ?? 1;
  const bot = {
    team, name, isBot: true, alive: true, health: 100, armor: 0, role,
    weaponName: ROLE_NAMES[role],
    pos: model.group.position, yaw: team === 'ember' ? Math.PI : 0,
    speed: range(rng, 3.4, 4.2) * speedMult, skill: Math.min(1, skill * skillMult),
    shotDamage: roleStats.shotDamage,
    fireInterval: range(rng, roleStats.fireInterval[0], roleStats.fireInterval[1]),
    burstLeft: 0, burstTimer: range(rng, 0.5, 2), cooldown: 0,
    waypoint: null, strafeDir: 1, strafeTimer: 0, walkPhase: 0,
    lastSeen: null, lastSeenAt: -99, flash: 0, model, group: model.group,
    spawn: { x, z },
    // Noise investigation: a loud bang nearby pulls bots off their route.
    investigate: null, investigateUntil: 0,
    // Beacon hold: a bot that reaches the ring posts up and defends it.
    holdUntil: 0,
    spottedAt: -99, // last time this bot called out a contact
    reset(nx, nz) {
      this.alive = true; this.health = 100; this.armor = 0;
      this.pos.set(nx, 0, nz); this.yaw = team === 'ember' ? Math.PI : 0;
      this.waypoint = null; this.lastSeen = null; this.burstLeft = 0;
      this.investigate = null; this.investigateUntil = 0; this.holdUntil = 0;
      this.group.visible = true; this.flash = 0;
      this.model.suitMat.emissive.setHex(0x000000);
    },
    damage(amount, headshot) {
      if (!this.alive) return false;
      this.health -= amount;
      this.flash = 0.12;
      this.model.suitMat.emissive.setHex(0xff2222);
      if (this.health <= 0) { this.alive = false; this.group.visible = false; return true; }
      return false;
    },
  };
  return bot;
}

// One AI tick. `targets` = [{pos:Vector3, alive, isPlayer, bot, eyeY}].
// `fire` = (shooter, targetPos, opts) called when the bot pulls the trigger.
// `onSpot` = (bot, target) called when the bot first calls out a contact.
export function updateBot(bot, dt, world, targets, rng, fire, time, onSpot) {
  if (!bot.alive) return;
  const eye = { x: bot.pos.x, y: 1.5, z: bot.pos.z };
  // Find nearest visible enemy.
  let best = null, bestD = Infinity;
  for (const t of targets) {
    if (!t.alive || t.team === bot.team) continue;
    const d = Math.hypot(t.pos.x - bot.pos.x, t.pos.z - bot.pos.z);
    if (d > 42) continue;
    if (d < bestD && world.hasLOS(eye, { x: t.pos.x, y: t.eyeY ?? 1.3, z: t.pos.z })) { best = t; bestD = d; }
  }
  let moveX = 0, moveZ = 0;
  if (best) {
    // Contact callout, at most once every 8 s per bot: the player hears
    // that they have been seen before the first burst arrives.
    if (time - bot.spottedAt > 8) { bot.spottedAt = time; if (onSpot) onSpot(bot, best); }
    bot.lastSeen = { x: best.pos.x, z: best.pos.z }; bot.lastSeenAt = time;
    const dx = best.pos.x - bot.pos.x, dz = best.pos.z - bot.pos.z;
    const dist = Math.hypot(dx, dz) || 1;
    bot.yaw = Math.atan2(dx, dz);
    // Strafe while engaging; close in if far, hold ground mid-range.
    bot.strafeTimer -= dt;
    if (bot.strafeTimer <= 0) { bot.strafeDir *= -1; bot.strafeTimer = range(rng, 0.7, 1.6); }
    const px = -dz / dist * bot.strafeDir, pz = dx / dist * bot.strafeDir;
    const approach = dist > 16 ? 0.8 : dist < 6 ? -0.5 : 0;
    moveX = px * 0.9 + (dx / dist) * approach;
    moveZ = pz * 0.9 + (dz / dist) * approach;
    // Burst fire with skill-based inaccuracy.
    bot.cooldown -= dt;
    if (bot.burstLeft > 0) {
      if (bot.cooldown <= 0) {
        bot.cooldown = bot.fireInterval * 0.55;
        bot.burstLeft -= 1;
        const err = (1 - bot.skill) * 1.6 + 0.25;
        fire(bot, best, { err, dist });
      }
    } else {
      bot.burstTimer -= dt;
      if (bot.burstTimer <= 0 && dist < 38) {
        const [lo, hi] = ROLE_STATS[bot.role].burst;
        bot.burstLeft = lo + Math.floor(rng() * (hi - lo + 1));
        bot.burstTimer = range(rng, 0.9, 2.2);
      }
    }
  } else {
    // No contact: investigate a recent bang, hold the Beacon if standing on
    // it, else push the Beacon via waypoints, or the last-seen spot.
    if (bot.investigate && time < bot.investigateUntil) {
      const dx = bot.investigate.x - bot.pos.x, dz = bot.investigate.z - bot.pos.z;
      const dist = Math.hypot(dx, dz) || 1;
      if (dist < 1.5) bot.investigate = null;
      else { moveX = dx / dist; moveZ = dz / dist; bot.yaw = Math.atan2(dx, dz); }
      bot.cooldown -= dt;
    } else if (time < bot.holdUntil) {
      // Posted up on the Beacon: shuffle side to side, watch the lanes.
      bot.strafeTimer -= dt;
      if (bot.strafeTimer <= 0) { bot.strafeDir *= -1; bot.strafeTimer = range(rng, 0.8, 1.5); }
      const yaw = bot.yaw;
      moveX = Math.cos(yaw) * 0.35 * bot.strafeDir;
      moveZ = -Math.sin(yaw) * 0.35 * bot.strafeDir;
      bot.cooldown -= dt;
    } else if (Math.hypot(bot.pos.x, bot.pos.z) < 3.0) {
      // Just walked onto the Beacon ring with nobody in sight: hold it.
      bot.holdUntil = time + range(rng, 3, 5);
      bot.waypoint = null;
      bot.cooldown -= dt;
    } else {
      let goal = bot.lastSeen && time - bot.lastSeenAt < 6 ? bot.lastSeen : { x: 0, z: 0 };
      if (!bot.waypoint || Math.hypot(bot.waypoint.x - bot.pos.x, bot.waypoint.z - bot.pos.z) < 1.5) {
        // Pick the waypoint closest to the goal that we can walk toward.
        let wp = WAYPOINTS[0], wd = Infinity;
        for (const w of WAYPOINTS) {
          const d = Math.hypot(w.x - goal.x, w.z - goal.z) + Math.hypot(w.x - bot.pos.x, w.z - bot.pos.z) * 0.15;
          if (d < wd) { wd = d; wp = w; }
        }
        bot.waypoint = wp;
      }
      const dx = bot.waypoint.x - bot.pos.x, dz = bot.waypoint.z - bot.pos.z;
      const dist = Math.hypot(dx, dz) || 1;
      moveX = dx / dist; moveZ = dz / dist;
      bot.yaw = Math.atan2(dx, dz);
      bot.cooldown -= dt;
    }
  }
  // Move axis-separated against colliders.
  const len = Math.hypot(moveX, moveZ);
  if (len > 0.01) {
    const nx = bot.pos.x + (moveX / len) * bot.speed * dt;
    if (!world.blockedAt(nx, bot.pos.z, 0.42)) bot.pos.x = nx;
    const nz = bot.pos.z + (moveZ / len) * bot.speed * dt;
    if (!world.blockedAt(bot.pos.x, nz, 0.42)) bot.pos.z = nz;
    bot.walkPhase += dt * 9;
  }
  bot.group.rotation.y = bot.yaw;
  bot.model.legL.rotation.x = len > 0.01 ? Math.sin(bot.walkPhase) * 0.55 : 0;
  bot.model.legR.rotation.x = len > 0.01 ? -Math.sin(bot.walkPhase) * 0.55 : 0;
  bot.model.chev.position.y = 2.25 + Math.sin(time * 2.4 + bot.pos.x) * 0.07;
  bot.model.chev.rotation.y += dt * 1.5;
  if (bot.flash > 0) {
    bot.flash -= dt;
    if (bot.flash <= 0) bot.model.suitMat.emissive.setHex(0x000000);
  }
}

// A loud bang (a grenade detonation) pulls nearby bots off their routes to
// investigate the blast site for a few seconds — the sound betrays the thrower.
export function alertBots(bots, x, z, time, radius = 22) {
  for (const b of bots) {
    if (!b.alive) continue;
    const d = Math.hypot(b.pos.x - x, b.pos.z - z);
    if (d < radius) { b.investigate = { x, z }; b.investigateUntil = time + 5; b.holdUntil = 0; }
  }
}
