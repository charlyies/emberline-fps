// Keyboard and mouse, and the pointer lock that turns the mouse into look.
// Mouse sensitivity is adjustable in play with [ and ] (0.4–2.0×), so a
// player who finds the default turn speed too twitchy or too slow can tune it
// without leaving the round; the value is read back by the HUD hint.
// `onSensitivity` runs after each sensitivity change (main.js saves it).
export function createInput(canvas, onLockChange, onSensitivity) {
  const keys = new Set();
  const state = { keys, locked: false, firing: false, aiming: false, lookX: 0, lookY: 0, sensitivity: 1.0 };
  function onKey(e, down) {
    if (e.code === 'Space') e.preventDefault();
    if (down) keys.add(e.code); else keys.delete(e.code);
    if (down && e.code === 'BracketLeft') { state.sensitivity = Math.max(0.4, +(state.sensitivity - 0.2).toFixed(1)); onSensitivity?.(); }
    if (down && e.code === 'BracketRight') { state.sensitivity = Math.min(2.0, +(state.sensitivity + 0.2).toFixed(1)); onSensitivity?.(); }
  }
  window.addEventListener('keydown', (e) => onKey(e, true));
  window.addEventListener('keyup', (e) => onKey(e, false));
  window.addEventListener('blur', () => { keys.clear(); state.firing = false; });
  document.addEventListener('mousemove', (e) => {
    if (!state.locked) return;
    state.lookX += e.movementX; state.lookY += e.movementY;
  });
  canvas.addEventListener('mousedown', (e) => { if (e.button === 0) state.firing = true; if (e.button === 2) state.aiming = true; });
  window.addEventListener('mouseup', (e) => { if (e.button === 0) state.firing = false; if (e.button === 2) state.aiming = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault()); // right-click aims, never a menu
  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    onLockChange(state.locked);
  });
  return {
    state,
    requestLock() { canvas.requestPointerLock?.(); },
    releaseLock() { if (document.pointerLockElement) document.exitPointerLock(); },
    // Look deltas scaled by the player's sensitivity; the caller multiplies
    // by the base turn rate, so sensitivity stays a pure preference.
    consumeLook() {
      const x = state.lookX * state.sensitivity, y = state.lookY * state.sensitivity;
      state.lookX = 0; state.lookY = 0;
      return { x, y };
    },
  };
}
