// Screenshot scenes behind ?shot=start|play|end. Each stages a real game state
// (buy phase, a live mid-round firefight driven by the autopilot, a finished match)
// then renders it once and freezes, setting window.__shotReady.
const STEP = 1 / 60;

export function stageShot(name, ctx) {
  ctx.startMatch();
  if (name === 'play') {
    // Buy the Hornet SMG ($600 of the $800 start cash) so the scene shows a
    // bought weapon in hand; the Ember Charge ($300) is not affordable in
    // round 1, so the grenade is not staged here.
    ctx.buy('smg');
    ctx.startRound();
    // ~6 s of live play: the autopilot walks to the Beacon and fires at Frost bots.
    for (let i = 0; i < 6 / STEP; i++) ctx.step(STEP, true);
    // Let the fight develop so the frame shows the Beacon under contest.
    for (let i = 0; i < 1.5 / STEP; i++) ctx.step(STEP, true);
    ctx.step(0.2, true); // keep the fight moving right up to the frame
    ctx.shoot(); // if the mag is empty this dry-fires and starts the reload
    for (let i = 0; i < 1.8 / STEP; i++) ctx.step(STEP, true); // reload (SMG 1.6 s) + fight
    ctx.shoot(); // live tracer + muzzle flash toward the aimed enemy
    ctx.render();
    ctx.freeze();
    return;
  }
  if (name === 'end') {
    // A few buy-phase frames so the camera sits in the yard, then the match screen.
    for (let i = 0; i < 30; i++) ctx.step(STEP, false);
    ctx.setEnd(5, 2, 14);
    ctx.render();
    ctx.freeze();
    return;
  }
  if (name === 'buy') {
    // The between-round buy menu over the Foundry Yard, with Plating and an
    // Ember Charge already bought ($400 + $300 of the $800 start cash), so
    // the panel shows owned items and the remaining $100 — distinct from the
    // plain start view.
    ctx.buy('grenade');
    ctx.buy('armor');
    for (let i = 0; i < 30; i++) ctx.step(STEP, false);
    ctx.render();
    ctx.freeze();
    return;
  }
  // start: the buy-phase title view over the Foundry Yard.
  for (let i = 0; i < 30; i++) ctx.step(STEP, false);
  ctx.render();
  ctx.freeze();
}
