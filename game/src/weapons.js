// Emberline — weapon definitions. All original names, balanced for a 5v5 round game.
export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'Sidearm', slot: 1, price: 0, blurb: 'reliable',
    damage: 26, headshotMult: 2.0, fireInterval: 0.22, auto: false,
    mag: 12, reserve: 48, reloadTime: 1.1, spread: 0.011, range: 60,
    recoil: 0.011, tracer: 0xffd27a, sound: 'pistol',
  },
  smg: {
    id: 'smg', name: 'Hornet SMG', slot: 2, price: 600, blurb: 'fast, close range',
    damage: 19, headshotMult: 1.8, fireInterval: 0.085, auto: true,
    mag: 28, reserve: 112, reloadTime: 1.6, spread: 0.021, range: 45,
    recoil: 0.007, tracer: 0xffb347, sound: 'smg',
  },
  rifle: {
    id: 'rifle', name: 'Longshot Rifle', slot: 3, price: 1200, blurb: 'the all-rounder',
    damage: 34, headshotMult: 2.0, fireInterval: 0.13, auto: true,
    mag: 30, reserve: 90, reloadTime: 2.0, spread: 0.013, range: 80,
    recoil: 0.013, tracer: 0xff8c3a, sound: 'rifle',
  },
  sniper: {
    id: 'sniper', name: 'Deadeye', slot: 4, price: 2000, blurb: 'one-shot headshots',
    damage: 88, headshotMult: 2.2, fireInterval: 1.15, auto: false,
    mag: 5, reserve: 15, reloadTime: 2.8, spread: 0.0015, range: 120,
    recoil: 0.05, tracer: 0x9fd8ff, sound: 'sniper',
  },
};

export const ARMOR_PRICE = 400;
export const ARMOR_ABSORB = 0.5; // armor absorbs half of incoming damage
export const START_MONEY = 800;
export const KILL_REWARD = 300;
export const WIN_REWARD = 325;
export const LOSS_REWARD = 200;
export const ROUND_TIME = 100;
export const CAPTURE_TIME = 5;
export const WIN_ROUNDS = 5;

// Ember Charge (frag grenade): bought in the buy menu, thrown with G.
// Arcs under gravity, detonates on its fuse, and hurts anything in the blast
// radius that the blast can see — bots, and you, if you stand too close.
export const GRENADE_PRICE = 300;
export const GRENADE_MAX = 2; // carried at most
export const GRENADE_DAMAGE = 95; // at the centre; falls off to ~40% at the edge
export const GRENADE_RADIUS = 4.5;
export const GRENADE_FUSE = 1.4; // seconds from throw to detonation
export const GRENADE_THROW_SPEED = 14;

export function weaponState(def) {
  return { def, mag: def.mag, reserve: def.reserve, reloading: false, reloadEnd: 0, cooldown: 0 };
}
