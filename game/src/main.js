// EMBERLINE — a round-based tactical FPS (5v5, Ember vs Frost) in the Foundry Yard.
// Boot, fixed 60 Hz simulation, round/match state, combat, Beacon objective,
// economy, buy phase, death-cam spectate, and ?shot=start|play|end staging.
import * as THREE from 'three';
import { createWorld, createTracers, BEACON, EMBER_SPAWN, FROST_SPAWN, MAP } from './world.js';
import { createBot, updateBot, alertBots } from './bots.js';
import { createGrenades } from './grenades.js';
import { createInput } from './input.js';
import { createHud } from './hud.js';
import { createSound } from './sound.js';
import { WEAPONS, ARMOR_PRICE, ARMOR_ABSORB, START_MONEY, KILL_REWARD, WIN_REWARD, LOSS_REWARD, ROUND_TIME, CAPTURE_TIME, WIN_ROUNDS, GRENADE_PRICE, GRENADE_MAX, GRENADE_DAMAGE, GRENADE_RADIUS, weaponState } from './weapons.js';
import { mulberry32, range, shuffle, chance } from './random.js';
import { stageShot } from './shots.js';
import { createViewmodel } from './viewmodel.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const rng = mulberry32(seed * 7919 + 13);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x14161a);
scene.fog = new THREE.Fog(0x14161a, 30, 95);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

scene.add(new THREE.HemisphereLight(0x9fb4c8, 0x2a2018, 1.5));
scene.add(new THREE.AmbientLight(0x404654, 0.7));
const sun = new THREE.DirectionalLight(0xffe0b3, 2.4);
sun.position.set(18, 30, 12);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -32; sun.shadow.camera.right = 32;
sun.shadow.camera.top = 32; sun.shadow.camera.bottom = -32;
scene.add(sun);

const world = createWorld(scene);
const tracers = createTracers(scene);
const grenades = createGrenades(scene, world);
const hud = createHud();
const sound = createSound();

// Saved preferences (local only): difficulty and mouse sensitivity persist
// between visits, so the title screen opens the way the player left it.
// Both functions only run after match and input exist (on a key press or a
// difficulty click), so referencing them here is safe.
function saveSettings() {
  try {
    window.localStorage.setItem('emberline-settings',
      JSON.stringify({ difficulty: match.difficulty, sensitivity: input.state.sensitivity }));
  } catch { /* private mode or storage off: preferences just do not persist */ }
}
function loadSettings() {
  try {
    const s = JSON.parse(window.localStorage.getItem('emberline-settings') ?? '{}');
    if (s.difficulty && DIFFICULTY[s.difficulty]) match.difficulty = s.difficulty;
    if (typeof s.sensitivity === 'number') input.state.sensitivity = Math.min(2, Math.max(0.4, s.sensitivity));
  } catch { /* corrupt or unavailable storage: keep the defaults */ }
}
const input = createInput(renderer.domElement, onLockChange, saveSettings);

// Viewmodel gun (box assembly with walk bob, fire kick and reload dip).
const viewmodel = createViewmodel(camera);

// ---- state ----
// Difficulty: picked on the title screen, applies to every bot for the match.
// Rookie bots aim worse, move slower and hit softer; Veteran bots the reverse.
const DIFFICULTY = {
  rookie: { label: 'Rookie', skill: 0.75, speed: 0.9, dmg: 0.8 },
  standard: { label: 'Standard', skill: 1, speed: 1, dmg: 1 },
  veteran: { label: 'Veteran', skill: 1.25, speed: 1.08, dmg: 1.15 },
};
const match = {
  phase: 'title', round: 1, emberWins: 0, frostWins: 0,
  money: START_MONEY, kills: 0, deaths: 0, shots: 0, hits: 0, earned: 0,
  roundTime: ROUND_TIME, buyTime: 15, beaconProgress: 0, beaconOwner: null,
  roundEndAt: 0, time: 0, streak: 0, frags: {}, history: [],
  difficulty: 'standard',
};
const player = {
  pos: new THREE.Vector3(EMBER_SPAWN.x, 0, EMBER_SPAWN.z),
  velX: 0, velZ: 0, velY: 0, yaw: 0, pitch: 0, hp: 100, armor: 0, alive: true,
  onGround: true, crouch: false, sprint: false,
  owned: new Set(['pistol']), current: 'pistol', grenades: 0,
  weapons: { pistol: weaponState(WEAPONS.pistol) },
  spectate: null, stepTimer: 0, spreadBloom: 0,
};
let bots = [];
let autopilot = false;
loadSettings(); // restores the saved difficulty before the first bots spawn
hud.setDifficulty(match.difficulty);
let autoStrafe = 0, autoStuckTimer = 0, autoStrafeTimer = 0;
let autoLastPos = { x: 0, z: 0 };
let paused = false;
let frozen = false; // shot mode freezes the frame once staged

function spawnPositions(team) {
  const base = team === 'ember' ? EMBER_SPAWN : FROST_SPAWN;
  const dir = team === 'ember' ? 1 : -1;
  return [
    { x: base.x, z: base.z },
    { x: base.x - 3.5, z: base.z - dir * 2 },
    { x: base.x + 3.5, z: base.z - dir * 2 },
    { x: base.x - 7, z: base.z + dir * 1 },
    { x: base.x + 7, z: base.z + dir * 1 },
  ];
}
function buildBots() {
  for (const b of bots) scene.remove(b.group);
  bots = [];
  // Fresh spawn-slot shuffle every rebuild, so the same bot does not always
  // start from the same spot in the yard.
  const e = shuffle(rng, spawnPositions('ember')), f = shuffle(rng, spawnPositions('frost'));
  const diff = DIFFICULTY[match.difficulty];
  for (let i = 0; i < 4; i++) bots.push(createBot(scene, world, { team: 'ember', index: i, x: e[i + 1].x, z: e[i + 1].z, rng, skillMult: diff.skill, speedMult: diff.speed }));
  for (let i = 0; i < 5; i++) bots.push(createBot(scene, world, { team: 'frost', index: i, x: f[i].x, z: f[i].z, rng, skillMult: diff.skill, speedMult: diff.speed }));
}
buildBots();

function aliveCount(team) {
  let n = team === 'ember' && player.alive ? 1 : 0;
  for (const b of bots) if (b.team === team && b.alive) n++;
  return n;
}
function curWeapon() { return player.weapons[player.current]; }

// ---- ray helpers ----
function raySphere(o, d, c, r) {
  const ox = c.x - o.x, oy = c.y - o.y, oz = c.z - o.z;
  const tca = ox * d.x + oy * d.y + oz * d.z;
  if (tca < 0) return null;
  const d2 = ox * ox + oy * oy + oz * oz - tca * tca;
  if (d2 > r * r) return null;
  return tca - Math.sqrt(r * r - d2);
}
// First hit among walls and bots from origin along dir.
function rayHit(origin, dir, maxDist, shooter) {
  const wallD = world.rayWall(origin, dir, maxDist);
  let best = wallD === Infinity ? null : { type: 'wall', dist: wallD };
  for (const b of bots) {
    if (!b.alive || b === shooter) continue;
    const head = raySphere(origin, dir, { x: b.pos.x, y: 1.62, z: b.pos.z }, 0.26);
    const body = raySphere(origin, dir, { x: b.pos.x, y: 1.0, z: b.pos.z }, 0.52);
    const t = head !== null ? { dist: head, headshot: true } : body !== null ? { dist: body, headshot: false } : null;
    if (t && t.dist < maxDist && (!best || t.dist < best.dist)) best = { type: 'bot', bot: b, ...t };
  }
  return best;
}
function pointAt(o, d, t) { return new THREE.Vector3(o.x + d.x * t, o.y + d.y * t, o.z + d.z * t); }

// ---- player combat ----
function playerShoot() {
  const w = curWeapon();
  if (w.reloading || w.cooldown > 0) return;
  if (w.mag <= 0) { sound.dryFire(); startReload(); return; }
  w.mag -= 1; w.cooldown = w.def.fireInterval;
  match.shots += 1;
  player.spreadBloom = Math.min(0.03, player.spreadBloom + w.def.recoil * 0.4);
  player.pitch += w.def.recoil * (0.5 + Math.random() * 0.5);
  sound.shoot(w.def.sound);
  const spread = w.def.spread * (player.aimMult ?? 1) + player.spreadBloom + (player.sprint ? 0.02 : 0);
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  dir.x += (Math.random() - 0.5) * 2 * spread;
  dir.y += (Math.random() - 0.5) * 2 * spread;
  dir.z += (Math.random() - 0.5) * 2 * spread;
  dir.normalize();
  const origin = camera.getWorldPosition(new THREE.Vector3());
  const hit = rayHit(origin, dir, w.def.range, null);
  const end = hit ? pointAt(origin, dir, hit.dist) : pointAt(origin, dir, w.def.range);
  tracers.add(origin.clone().addScaledVector(dir, 0.6), end, w.def.tracer);
  viewmodel.fire();
  if (hit && hit.type === 'bot') {
    match.hits += 1;
    const dmg = w.def.damage * (hit.headshot ? w.def.headshotMult : 1) * (hit.dist > 30 ? 0.8 : 1);
    hud.damageNumber(Math.round(dmg), hit.headshot);
    const killed = hit.bot.damage(dmg, hit.headshot);
    hud.hitmarker(killed);
    if (killed) onKill(hit.bot, 'You', w.def.name);
    else sound.hit();
  }
}
function startReload() {
  const w = curWeapon();
  if (w.reloading || w.mag === w.def.mag || w.reserve <= 0) return;
  w.reloading = true; w.reloadEnd = match.time + w.def.reloadTime;
  sound.reload();
}
function finishReload() {
  const w = curWeapon();
  const need = w.def.mag - w.mag;
  const take = Math.min(need, w.reserve);
  w.mag += take; w.reserve -= take; w.reloading = false;
}
function buyWeapon(id) {
  if (match.phase !== 'buy') return;
  if (id === 'grenade') {
    if (player.grenades >= GRENADE_MAX || match.money < GRENADE_PRICE) { sound.denied(); return; }
    match.money -= GRENADE_PRICE; player.grenades += 1;
    sound.buy(); hud.setMoney(match.money); hud.setGrenades(player.grenades); return;
  }
  if (id === 'armor') {
    if (player.armor >= 100 || match.money < ARMOR_PRICE) { sound.denied(); return; }
    match.money -= ARMOR_PRICE; player.armor = 100; sound.buy(); hud.setMoney(match.money); return;
  }
  const def = WEAPONS[id];
  if (!def || player.owned.has(id) || match.money < def.price) { sound.denied(); return; }
  match.money -= def.price;
  player.owned.add(id);
  player.weapons[id] = weaponState(def);
  player.current = id;
  sound.buy(); hud.setMoney(match.money);
  hud.setAmmo(curWeapon().mag, curWeapon().reserve, def.name);
}
function selectWeapon(id) {
  if (!player.owned.has(id) || !player.alive) return;
  player.current = id;
  const w = curWeapon();
  hud.setAmmo(w.mag, w.reserve, w.def.name);
}
function damagePlayer(amount, fromPos) {
  if (!player.alive || match.phase !== 'play') return;
  let remaining = amount;
  if (player.armor > 0) {
    const absorbed = Math.min(player.armor, amount * ARMOR_ABSORB);
    player.armor -= absorbed; remaining -= absorbed;
  }
  player.hp -= remaining;
  sound.hurt();
  if (fromPos) {
    const ang = Math.atan2(fromPos.x - player.pos.x, fromPos.z - player.pos.z) - player.yaw;
    hud.damageFrom((ang * 180) / Math.PI);
  }
  if (player.hp <= 0) {
    player.hp = 0; player.alive = false; match.deaths += 1; match.streak = 0;
    const friends = bots.filter((b) => b.team === 'ember' && b.alive);
    player.spectate = friends.length ? friends[Math.floor(Math.random() * friends.length)] : null;
    input.releaseLock();
    hud.feed('You were eliminated', false);
  }
  hud.setHealth(player.hp, player.armor);
}
function onKill(bot, killerName, weapon) {
  sound.kill();
  const withWeapon = weapon ? ` · ${weapon}` : '';
  hud.feed(`${killerName} ▸ ${bot.name} (${bot.team === 'frost' ? 'Frost' : 'Ember'}${withWeapon})`, bot.team === 'frost');
  match.frags[killerName] = (match.frags[killerName] ?? 0) + 1;
  if (bot.team === 'frost' && killerName === 'You') {
    match.kills += 1; match.money += KILL_REWARD; match.earned += KILL_REWARD;
    hud.setMoney(match.money);
    // Killstreak callouts: dying resets the streak, so each one is earned.
    match.streak += 1;
    if (match.streak === 2) hud.feed('Double kill — Ember is rolling', true);
    else if (match.streak === 3) hud.feed('Triple kill — unstoppable', true);
    else if (match.streak >= 4) hud.feed(`Rampage — ${match.streak} in a row without dying`, true);
  }
}

// ---- grenades ----
function throwGrenade() {
  if (!player.alive || match.phase !== 'play' || player.grenades <= 0) return;
  player.grenades -= 1;
  hud.setGrenades(player.grenades);
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const from = camera.getWorldPosition(new THREE.Vector3()).addScaledVector(dir, 0.5);
  from.y -= 0.1;
  grenades.throwGrenade(from, dir);
  sound.throwGrenade();
}
function detonateGrenade(pos) {
  const distToPlayer = Math.hypot(player.pos.x - pos.x, player.pos.z - pos.z);
  sound.explosion(distToPlayer);
  // Blast damage: full at the centre, ~40% at the edge, and only through
  // line of sight — cover still matters against a charge.
  const blastAt = (x, y, z) => {
    const d = Math.hypot(x - pos.x, y - pos.y, z - pos.z);
    if (d > GRENADE_RADIUS) return 0;
    if (!world.hasLOS({ x: pos.x, y: pos.y + 0.2, z: pos.z }, { x, y, z })) return 0;
    return GRENADE_DAMAGE * (1 - (d / GRENADE_RADIUS) * 0.6);
  };
  for (const b of bots) {
    if (!b.alive) continue;
    const dmg = blastAt(b.pos.x, 1.0, b.pos.z);
    if (dmg > 0) {
      const killed = b.damage(dmg, false);
      if (killed) onKill(b, 'You', 'Ember Charge');
      else hud.feed(`Ember Charge hit ${b.name} (${Math.round(dmg)})`, b.team === 'frost');
    }
  }
  // Standing on your own charge hurts, at half strength — throw it away.
  if (player.alive) {
    const selfDmg = blastAt(player.pos.x, 1.2, player.pos.z);
    if (selfDmg > 0) damagePlayer(selfDmg * 0.5, pos);
  }
  alertBots(bots, pos.x, pos.z, match.time);
}

// Bot fires at a target: probabilistic hit after wall check, with tracer.
function botFire(shooter, target, opts) {
  const muzzle = new THREE.Vector3(shooter.pos.x, 1.35, shooter.pos.z)
    .addScaledVector(new THREE.Vector3(Math.sin(shooter.yaw), 0, Math.cos(shooter.yaw)), 0.5);
  const tp = target.pos;
  const dx = tp.x - muzzle.x, dz = tp.z - muzzle.z;
  const dist = Math.hypot(dx, dz);
  const dir = new THREE.Vector3(dx / (dist || 1), (1.2 - 1.35) / (dist || 1), dz / (dist || 1));
  const wallD = world.rayWall(muzzle, dir, dist);
  let end = new THREE.Vector3(tp.x, 1.2, tp.z);
  if (wallD !== Infinity) { end = pointAt(muzzle, dir, wallD); tracers.add(muzzle, end, 0x9fd8ff); return; }
  tracers.add(muzzle, end, shooter.team === 'frost' ? 0x7fd4ff : 0xffb347);
  if (shooter.team === 'frost' || target.isPlayer) sound.enemyShoot(dist);
  const hitP = Math.max(0.08, Math.min(0.6, (0.5 - dist * 0.008 - opts.err * 0.22) * shooter.skill * 1.4));
  if (Math.random() > hitP) return;
  const headshot = Math.random() < 0.12;
  const dmg = shooter.shotDamage * (headshot ? 2 : 1) * DIFFICULTY[match.difficulty].dmg;
  if (target.isPlayer) damagePlayer(dmg, shooter.pos);
  else if (target.bot) {
    const killed = target.bot.damage(dmg, headshot);
    if (killed) onKill(target.bot, shooter.name, shooter.weaponName);
  }
}

// ---- rounds ----
function startBuyPhase() {
  match.phase = 'buy';
  match.buyTime = 15;
  match.roundTime = ROUND_TIME;
  match.beaconProgress = 0; match.beaconOwner = null;
  player.hp = 100; player.alive = true; player.spectate = null;
  player.pos.set(EMBER_SPAWN.x, 0, EMBER_SPAWN.z);
  player.yaw = 0; player.pitch = 0; player.velY = 0;
  // Fresh spawn-slot shuffle every round, so the same bot does not always
  // start from the same spot in the yard.
  const e = shuffle(rng, spawnPositions('ember')), f = shuffle(rng, spawnPositions('frost'));
  bots.forEach((b, i) => {
    const p = b.team === 'ember' ? e[i + 1] : f[i - 4];
    b.reset(p.x, p.z);
  });
  for (const id of Object.keys(player.weapons)) {
    const w = player.weapons[id]; w.mag = w.def.mag; w.reserve = w.def.reserve; w.reloading = false;
  }
  hud.setHealth(player.hp, player.armor);
  hud.setScores(match.emberWins, match.frostWins, match.round);
  hud.setTimer(ROUND_TIME);
  hud.setBeacon(0, null);
  hud.setMoney(match.money);
  hud.setGrenades(player.grenades);
  input.releaseLock();
  // The buy list is built from the weapon table, so names, prices and
  // descriptions live in exactly one place (weapons.js), not two.
  const buyItems = Object.values(WEAPONS).map((def) => ({
    key: String(def.slot), id: def.id, name: def.name,
    desc: `${def.mag} / ${def.reserve} · ${def.blurb}`, price: def.price,
  }));
  buyItems.push({ key: '5', id: 'armor', name: 'Plating', desc: 'absorbs 50% of damage', price: ARMOR_PRICE });
  buyItems.push({ key: '6', id: 'grenade', name: 'Ember Charge', desc: `frag grenade · blast radius ${GRENADE_RADIUS} m · G to throw (max ${GRENADE_MAX})`, price: GRENADE_PRICE });
  hud.buy(buyItems, match.money, [...player.owned, ...(player.armor > 0 ? ['armor'] : [])],
    buyWeapon, () => startRound(), 15);
}
function startRound() {
  // Never start a round with a team already wiped (e.g. a stray call after a
  // round ended): go back to the buy phase so both teams respawn fresh.
  if (aliveCount('frost') === 0 || aliveCount('ember') === 0) { startBuyPhase(); return; }
  match.phase = 'play';
  match.roundTime = ROUND_TIME;
  match.frags = {}; // round MVP is scored per round, not per match
  hud.hideBuy();
  hud.banner(`ROUND ${match.round}`, 'Eliminate Frost — or capture the Beacon', 2600);
  sound.roundStart();
  if (!shot) input.requestLock();
}
function endRound(winner, reason) {
  if (match.phase !== 'play') return;
  match.phase = 'roundEnd';
  match.roundEndAt = match.time + 3.5;
  if (winner === 'ember') { match.emberWins += 1; match.money += WIN_REWARD; match.earned += WIN_REWARD; }
  else if (winner === 'frost') { match.frostWins += 1; match.money += LOSS_REWARD; match.earned += LOSS_REWARD; }
  hud.setMoney(match.money);
  hud.setScores(match.emberWins, match.frostWins, match.round);
  const won = winner === 'ember';
  // Round history: a W/L dot per finished round under the score, so the
  // shape of the match is visible without opening any screen.
  let mvp = null, mvpKills = 0;
  for (const [name, n] of Object.entries(match.frags)) {
    if (n > mvpKills || (n === mvpKills && name === 'You')) { mvp = name; mvpKills = n; }
  }
  match.history.push(winner === 'ember' ? 'W' : winner === 'frost' ? 'L' : 'D');
  hud.setHistory(match.history);
  const mvpLine = mvp ? ` · MVP: ${mvp} (${mvpKills} kill${mvpKills === 1 ? '' : 's'})` : '';
  hud.banner(won ? 'ROUND WON' : winner === 'frost' ? 'ROUND LOST' : 'DRAW ROUND',
    reason + mvpLine, 3200);
  if (winner) (won ? sound.roundWin : sound.roundLose)();
  input.releaseLock();
}
function endMatch() {
  match.phase = 'matchEnd';
  const won = match.emberWins >= WIN_ROUNDS;
  const acc = match.shots ? Math.round((match.hits / match.shots) * 100) : 0;
  // Best match on this machine (local only, never leaves the browser): the
  // match screen shows it next to this match so a run can be beaten.
  let best = null, bestLine = '';
  try {
    best = JSON.parse(window.localStorage.getItem('emberline-best') ?? 'null');
    const score = (m) => (m.won ? 1000 : 0) + m.kills * 10 + m.acc;
    const mine = { won, kills: match.kills, acc };
    if (!best || score(mine) > score(best)) {
      window.localStorage.setItem('emberline-best', JSON.stringify(mine));
      best = mine; bestLine = ' · new best';
    }
  } catch { /* private mode or storage off: the match still ends fine */ }
  const stats = `<div class="stat-row"><span>Kills</span><b>${match.kills}</b></div>` +
    `<div class="stat-row"><span>Deaths</span><b>${match.deaths}</b></div>` +
    `<div class="stat-row"><span>Accuracy</span><b>${acc}%</b></div>` +
    `<div class="stat-row"><span>Rounds</span><b>${match.emberWins} – ${match.frostWins}</b></div>` +
    `<div class="stat-row"><span>Money earned</span><b>$${match.earned}</b></div>` +
    (best ? `<div class="stat-row"><span>Best match</span><b>${best.kills} kills · ${best.acc}%${best.won ? ' · won' : ''}${bestLine}</b></div>` : '');
  hud.matchEnd(won, stats);
  input.releaseLock();
}
function resetMatch() {
  match.round = 1; match.emberWins = 0; match.frostWins = 0;
  match.money = START_MONEY; match.kills = 0; match.deaths = 0; match.streak = 0; match.frags = {}; match.history = [];
  match.shots = 0; match.hits = 0; match.earned = 0;
  buildBots(); // rebuild so a difficulty picked on the title screen applies
  player.owned = new Set(['pistol']); player.current = 'pistol';
  player.weapons = { pistol: weaponState(WEAPONS.pistol) };
  player.armor = 0; player.grenades = 0; player.velX = 0; player.velZ = 0;
  grenades.clear();
  hud.setAmmo(12, 48, 'Sidearm');
  hud.setGrenades(0);
  startBuyPhase();
}

// ---- per-frame update ----
function step(dt) {
  match.time += dt;
  tracers.update(dt);
  grenades.update(dt, detonateGrenade);
  world.beaconRing.rotation.z += dt * 0.4;
  world.beaconCore.position.y = 2.0 + Math.sin(match.time * 1.8) * 0.15;
  if (match.phase === 'buy') {
    match.buyTime -= dt;
    const bt = document.getElementById('buy-timer');
    if (bt) bt.textContent = `Buy phase — ${Math.ceil(match.buyTime)}s (B to close)`;
    camera.position.set(player.pos.x, 1.62, player.pos.z);
    camera.rotation.set(0, 0, 0, 'YXZ');
    if (match.buyTime <= 0) startRound();
    return;
  }
  if (match.phase === 'roundEnd') {
    if (match.time >= match.roundEndAt) {
      if (match.emberWins >= WIN_ROUNDS || match.frostWins >= WIN_ROUNDS) endMatch();
      else { match.round += 1; startBuyPhase(); }
    }
    updateBotsOnly(dt);
    return;
  }
  if (match.phase !== 'play') return;

  // Round timer
  match.roundTime -= dt;
  hud.setTimer(match.roundTime);
  // Last-10-seconds ticks, one per second, so a close round is audible.
  const whole = Math.ceil(match.roundTime);
  if (whole <= 10 && whole >= 1 && whole !== match._lastTick) { match._lastTick = whole; sound.tick(); }
  // Footsteps of the nearest enemy: if a Frost bot is close, you hear it.
  match._stepTimer = (match._stepTimer ?? 0) - dt;
  if (match._stepTimer <= 0) {
    match._stepTimer = 0.5;
    let nearest = Infinity;
    for (const b of bots) if (b.team === 'frost' && b.alive) nearest = Math.min(nearest, Math.hypot(b.pos.x - player.pos.x, b.pos.z - player.pos.z));
    if (nearest < 10) sound.enemyStep(nearest);
  }
  if (match.roundTime <= 0) {
    const e = aliveCount('ember'), f = aliveCount('frost');
    endRound(e > f ? 'ember' : f > e ? 'frost' : null,
      e === f ? 'Time expired — even teams, no point' : `Time expired — ${e > f ? 'Ember' : 'Frost'} had more agents standing`);
    return;
  }

  // Player look + movement
  const look = input.consumeLook();
  player.yaw -= look.x * 0.0023;
  player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch - look.y * 0.0023));
  const keys = input.state.keys;
  player.crouch = keys.has('ControlLeft') || keys.has('ControlRight');
  player.sprint = (keys.has('ShiftLeft') || keys.has('ShiftRight')) && !player.crouch;
  if (autopilot) autopilotStep(dt);
  if (player.alive) {
    // Acceleration-based movement: stopping to aim pays, sprinting into a
    // fight does not — velocity builds up over ~0.15 s and bleeds off when
    // the keys lift, instead of snapping between 0 and full speed.
    const speed = (player.crouch ? 2.2 : player.sprint ? 7.2 : 4.6);
    let fx = 0, fz = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) fz += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) fz -= 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) fx -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) fx += 1;
    if (autopilot) { fz = 1; fx = autoStrafe; }
    const len = Math.hypot(fx, fz);
    const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw);
    const wantX = len > 0 ? ((fx * cos - fz * sin) / len) * speed : 0;
    const wantZ = len > 0 ? ((-fx * sin - fz * cos) / len) * speed : 0;
    const accel = len > 0 ? 42 : 30; // reach speed fast, stop a touch slower
    const dvx = wantX - player.velX, dvz = wantZ - player.velZ;
    const dvLen = Math.hypot(dvx, dvz);
    const stepV = Math.min(dvLen, accel * dt);
    if (dvLen > 0.001) { player.velX += (dvx / dvLen) * stepV; player.velZ += (dvz / dvLen) * stepV; }
    const nx = player.pos.x + player.velX * dt, nz = player.pos.z + player.velZ * dt;
    if (!world.blockedAt(nx, player.pos.z, 0.42)) player.pos.x = nx; else player.velX = 0;
    if (!world.blockedAt(player.pos.x, nz, 0.42)) player.pos.z = nz; else player.velZ = 0;
    const moving = Math.hypot(player.velX, player.velZ);
    if (moving > 0.5) {
      player.stepTimer -= dt * (player.sprint ? 1.6 : 1);
      if (player.stepTimer <= 0) { player.stepTimer = 0.38; sound.step(); }
    }
    if ((keys.has('Space')) && player.onGround) { player.velY = 5.2; player.onGround = false; }
    player.velY -= 14 * dt;
    player.pos.y += player.velY * dt;
    if (player.pos.y <= 0) { player.pos.y = 0; player.velY = 0; player.onGround = true; }
    // Weapon switching / reload / fire
    if (keys.has('Digit1')) selectWeapon('pistol');
    if (keys.has('Digit2')) selectWeapon('smg');
    if (keys.has('Digit3')) selectWeapon('rifle');
    if (keys.has('Digit4')) selectWeapon('sniper');
    if (keys.has('KeyR')) startReload();
    // Aim down sights (right mouse): zooms the view, steadies the spread
    // and slows the turn rate — holding an angle beats spraying from the hip.
    const aiming = input.state.aiming && player.alive;
    const targetFov = aiming ? 50 : 74;
    if (Math.abs(camera.fov - targetFov) > 0.1) {
      camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 10);
      camera.updateProjectionMatrix();
    }
    const aimSpreadMult = aiming ? 0.55 : 1;
    player.aimMult = aimSpreadMult;
    const w = curWeapon();
    w.cooldown = Math.max(0, w.cooldown - dt);
    if (w.reloading && match.time >= w.reloadEnd) finishReload();
    player.spreadBloom = Math.max(0, player.spreadBloom - dt * 0.05);
    const trigger = input.state.firing || autopilot;
    if (w.def.auto) { if (trigger) playerShoot(); }
    else if (trigger && !player._triggerHeld) playerShoot();
    player._triggerHeld = trigger;
  }

  // Bots
  updateBotsOnly(dt);

  // Beacon capture
  const inZone = (p) => Math.hypot(p.x - BEACON.x, p.z - BEACON.z) < BEACON.r;
  let eIn = player.alive && inZone(player.pos) ? 1 : 0, fIn = 0;
  for (const b of bots) if (b.alive && inZone(b.pos)) (b.team === 'ember' ? eIn++ : fIn++);
  if (eIn > 0 && fIn === 0) {
    if (match.beaconOwner !== 'ember') { match.beaconOwner = 'ember'; match.beaconProgress = 0; }
    match.beaconProgress += dt / CAPTURE_TIME;
    if (Math.floor(match.beaconProgress * 10) !== Math.floor((match.beaconProgress - dt / CAPTURE_TIME) * 10)) sound.captureTick();
    if (match.beaconProgress >= 1) { sound.captureDone(); endRound('ember', 'Ember captured the Beacon'); return; }
  } else if (fIn > 0 && eIn === 0) {
    if (match.beaconOwner !== 'frost') { match.beaconOwner = 'frost'; match.beaconProgress = 0; }
    match.beaconProgress += dt / CAPTURE_TIME;
    if (match.beaconProgress >= 1) { sound.captureDone(); endRound('frost', 'Frost captured the Beacon'); return; }
  } else {
    match.beaconOwner = eIn > 0 && fIn > 0 ? 'contested' : null;
    match.beaconProgress = Math.max(0, match.beaconProgress - dt * 0.2);
  }
  hud.setBeacon(match.beaconProgress, match.beaconOwner === 'contested' ? null : match.beaconOwner);

  // Elimination win check
  if (aliveCount('frost') === 0) { endRound('ember', 'Frost team eliminated'); return; }
  if (aliveCount('ember') === 0) { endRound('frost', 'Ember team eliminated'); return; }

  // Camera
  const eyeH = player.crouch ? 1.15 : 1.62;
  if (player.alive) {
    camera.position.set(player.pos.x, player.pos.y + eyeH, player.pos.z);
    camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
  } else if (player.spectate && player.spectate.alive) {
    const s = player.spectate;
    camera.position.set(s.pos.x - Math.sin(s.yaw) * 3.2, 2.6, s.pos.z - Math.cos(s.yaw) * 3.2);
    camera.lookAt(s.pos.x, 1.4, s.pos.z);
  }
  viewmodel.update(dt, Math.hypot(player.velX, player.velZ), curWeapon().reloading);
  const w = curWeapon();
  hud.setAmmo(w.mag, w.reserve, w.def.name);
  hud.setSpread((4 + player.spreadBloom * 600 + (player.sprint ? 6 : 0)) * (player.aimMult ?? 1));
}

let lastContactSound = -99;
function updateBotsOnly(dt) {
  const targets = bots.map((b) => ({ pos: b.pos, alive: b.alive, team: b.team, bot: b, eyeY: 1.3 }));
  targets.push({ pos: player.pos, alive: player.alive, team: 'ember', isPlayer: true, eyeY: 1.3 });
  for (const b of bots) updateBot(b, dt, world, targets, rng, botFire, match.time, (bot, target) => {
    // One callout sound at a time, so a whole squad spotting you is one bark.
    if (target.isPlayer && match.time - lastContactSound > 2) { lastContactSound = match.time; sound.contact(); }
  });
}

// Autopilot used by ?shot=play: walk to the Beacon, aim at the nearest visible Frost bot, fire.
// If it stops making progress (pressed against cover), it sidesteps to get around it.
function autopilotStep(dt) {
  autoStuckTimer += dt;
  if (autoStuckTimer >= 0.6) {
    const moved = Math.hypot(player.pos.x - autoLastPos.x, player.pos.z - autoLastPos.z);
    autoLastPos = { x: player.pos.x, z: player.pos.z };
    autoStuckTimer = 0;
    if (moved < 0.25 && autoStrafeTimer <= 0) { autoStrafe = chance(rng, 0.5) ? 1 : -1; autoStrafeTimer = 1.4; }
  }
  if (autoStrafeTimer > 0) { autoStrafeTimer -= dt; if (autoStrafeTimer <= 0) autoStrafe = 0; }
  let best = null, bestD = Infinity;
  for (const b of bots) {
    if (b.team !== 'frost' || !b.alive) continue;
    const d = Math.hypot(b.pos.x - player.pos.x, b.pos.z - player.pos.z);
    if (d < bestD && world.hasLOS({ x: player.pos.x, y: 1.5, z: player.pos.z }, { x: b.pos.x, y: 1.3, z: b.pos.z })) { best = b; bestD = d; }
  }
  const goal = best ?? { pos: { x: 0, z: 0 } };
  const dx = goal.pos.x - player.pos.x, dz = goal.pos.z - player.pos.z;
  const targetYaw = Math.atan2(-dx, -dz);
  let diff = targetYaw - player.yaw;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  player.yaw += diff * Math.min(1, dt * 4);
  player.pitch *= 0.9;
}

// ---- input / overlays ----
function onLockChange(locked) {
  if (shot) return;
  if (!locked && match.phase === 'play' && player.alive && !paused) {
    paused = true;
    hud.title();
    hud.showRestart();
    document.getElementById('overlay-title').textContent = 'PAUSED';
    document.getElementById('overlay-copy').innerHTML = 'Pointer released. Click below to jump back into the round.';
    document.getElementById('play').textContent = 'Resume';
  } else if (locked) paused = false;
}
hud.onPlay(() => {
  sound.unlock();
  if (match.phase === 'title') { resetMatch(); return; }
  if (match.phase === 'matchEnd') { resetMatch(); return; }
  if (paused) { paused = false; hud.hideOverlay(); input.requestLock(); return; }
  if (match.phase === 'play') input.requestLock();
});
hud.onDifficulty((id) => { if (DIFFICULTY[id]) { match.difficulty = id; saveSettings(); } });
hud.onRestart(() => { paused = false; hud.hideOverlay(); resetMatch(); });
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyB' && match.phase === 'buy') startRound();
  if (e.code === 'KeyM') sound.toggleMute();
  if (e.code === 'KeyG' && match.phase === 'play') throwGrenade();
  // Hold Tab for the scoreboard: your line, the round history, the match.
  if (e.code === 'Tab' && match.phase !== 'title' && match.phase !== 'matchEnd') {
    e.preventDefault();
    const acc = match.shots ? Math.round((match.hits / match.shots) * 100) : 0;
    hud.showScoreboard(
      `<div class="stat-row"><span>Kills / Deaths</span><b>${match.kills} / ${match.deaths}</b></div>` +
      `<div class="stat-row"><span>Accuracy</span><b>${acc}%</b></div>` +
      `<div class="stat-row"><span>Killstreak</span><b>${match.streak}</b></div>` +
      `<div class="stat-row"><span>Rounds</span><b>${match.emberWins} – ${match.frostWins}</b></div>` +
      `<div class="stat-row"><span>Round history</span><b>${match.history.join(' ') || '—'}</b></div>` +
      `<div class="stat-row"><span>Money earned</span><b>$${match.earned}</b></div>`);
  }
  if (match.phase === 'buy') {
    if (e.code === 'Digit1') buyWeapon('pistol');
    if (e.code === 'Digit2') buyWeapon('smg');
    if (e.code === 'Digit3') buyWeapon('rifle');
    if (e.code === 'Digit4') buyWeapon('sniper');
    if (e.code === 'Digit5') buyWeapon('armor');
    if (e.code === 'Digit6') buyWeapon('grenade');
  }
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Tab') hud.hideScoreboard();
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- main loop ----
let accumulator = 0, lastTime = performance.now();
let fpsFrames = 0, fpsLast = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  if (frozen) return;
  const dt = Math.min(0.1, (now - lastTime) / 1000);
  lastTime = now;
  accumulator += dt;
  while (accumulator >= FIXED_STEP) { step(FIXED_STEP); accumulator -= FIXED_STEP; }
  fpsFrames += 1;
  if (now - fpsLast >= 1000) { hud.setFps(fpsFrames); fpsFrames = 0; fpsLast = now; }
  renderer.render(scene, camera);
}

hud.title();
hud.setHealth(100, 0);
hud.setAmmo(12, 48, 'Sidearm');
hud.setMoney(START_MONEY);
hud.setGrenades(0);
hud.setScores(0, 0, 1);
hud.setTimer(ROUND_TIME);

// Test / screenshot hooks.
window.__game = {
  get phase() { return match.phase; },
  get hp() { return player.hp; },
  get money() { return match.money; },
  get emberWins() { return match.emberWins; },
  get frostWins() { return match.frostWins; },
  alive: () => ({ ember: aliveCount('ember'), frost: aliveCount('frost') }),
  start: () => { resetMatch(); },
  buy: buyWeapon,
  startRound,
  damagePlayer: (n) => damagePlayer(n, null),
  // Test hook (single-player, offline): lets an automated playtest force a round
  // outcome without aiming. Not used by the game itself.
  debug: {
    killFrost() { for (const b of bots) if (b.team === 'frost' && b.alive && b.damage(999)) onKill(b, 'You'); },
    killPlayer() { damagePlayer(999, null); },
    giveGrenades(n) { player.grenades = Math.min(GRENADE_MAX, n); hud.setGrenades(player.grenades); return player.grenades; },
    throwGrenade,
  },
  playerPos: () => ({ x: player.pos.x, z: player.pos.z }),
};

if (shot) {
  stageShot(shot, {
    startMatch: () => { resetMatch(); },
    startRound: () => { match.phase = 'play'; match.roundTime = ROUND_TIME; hud.hideBuy(); },
    buy: (id) => buyWeapon(id),
    throwGrenade,
    step: (dt, auto) => { autopilot = auto; step(dt); },
    setEnd: (ember, frost, kills) => {
      match.emberWins = ember; match.frostWins = frost; match.kills = kills;
      match.deaths = 2; match.shots = 84; match.hits = 41; match.earned = 2450;
      match.phase = 'matchEnd';
      hud.setAmmo(12, 48, 'Sidearm');
      const acc = Math.round((match.hits / match.shots) * 100);
      const stats = `<div class="stat-row"><span>Kills</span><b>${match.kills}</b></div>` +
        `<div class="stat-row"><span>Deaths</span><b>${match.deaths}</b></div>` +
        `<div class="stat-row"><span>Accuracy</span><b>${acc}%</b></div>` +
        `<div class="stat-row"><span>Rounds</span><b>${ember} – ${frost}</b></div>` +
        `<div class="stat-row"><span>Money earned</span><b>$${match.earned}</b></div>`;
      hud.matchEnd(true, stats);
    },
    render: () => renderer.render(scene, camera),
    freeze: () => { frozen = true; window.__shotReady = true; },
  });
} else {
  requestAnimationFrame(frame);
}
