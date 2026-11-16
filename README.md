# emberline

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/charlyies/emberline-fps/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/charlyies/emberline-fps/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

**Emberline** — a round-based tactical FPS built with three.js. You lead **Ember**
(orange) against the **Frost** bots (blue) in the Foundry Yard, 5v5. Win a round by
eliminating the enemy team or by capturing **the Beacon** at mid — stand in the ring
for 5 seconds. First to **5 rounds** takes the match.

Kills (+$300) and round wins (+$325) earn cash for the between-round buy menu:
**Sidearm** (free), **Hornet SMG** ($600), **Longshot Rifle** ($1200),
**Deadeye** sniper ($2000), **plating** ($400, absorbs 50% of damage) and the
**Ember Charge** frag grenade ($300, max 2 — throw with **G**; it lobs over
cover, bounces once, and detonates after 1.4 s, hurting anything in its 4.5 m
blast radius that the blast can see, including you at half strength — and the
bang pulls nearby bots over to investigate). Each weapon has its own damage,
fire rate, magazine, spread and recoil, and movement is acceleration-based:
velocity builds up and bleeds off, so stopping to aim pays.

## Run it

```sh
node serve.ts
# then open http://localhost:8080
```

## How to play

- **Move:** WASD · **Sprint:** Shift · **Jump:** Space · **Crouch:** Ctrl
- **Look / fire:** mouse (click to lock the pointer), click to shoot · **Aim down sights:** right mouse (zooms, steadies spread)
- **Reload:** R · **Weapons:** 1–4 · **Throw Ember Charge:** G · **Buy menu:** B (between rounds) · **Mute:** M
- **Mouse sensitivity:** `[` / `]` · **Difficulty:** Rookie / Standard / Veteran on the title screen
- **Objective:** clear the Frost team, or hold the Beacon ring until it captures.
  If the 100-second timer expires, the team with more agents standing wins the round.

## The map

The Foundry Yard is an original industrial arena: a central Beacon platform, a mid
lane, two flank routes, crate stacks, pipe columns and sightline-breaking walls —
dark steel with ember-orange and frost-blue accents, fog, shadows and furnace glow.

## Bots

Nine bots fight beside and against you. They patrol waypoints, push the Beacon,
take cover, strafe while firing in bursts, and hunt you by line of sight. Each
bot has a role — SMG rushers, riflemen, and one sniper per team that posts up
far back — and a bot that reaches the Beacon ring holds it and defends the
lanes, while a grenade blast pulls nearby bots over to investigate the noise.
Friendly bots wear orange chevrons, enemies blue ones. On death you spectate a
friendly bot until the round ends.

## Tech

- Pure three.js 0.187.0 (vendored) + vanilla ES modules — no build step, no network
  requests, no external models or audio files. All bot models are boxes and
  capsules; all sound is synthesised with WebAudio.
- Fixed 1/60 s simulation, seeded RNG: `?seed=N` replays the same bot behaviour,
  and `?shot=start|play|end` stages deterministic screenshot scenes.

## License

MIT — see [LICENSE](LICENSE).

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards</sub>
