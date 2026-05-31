const { useState, useRef, useEffect } = React;
const { A, DIRS, clamp, dirFromVec } = window.TELLAK;

const MAP_W = 2754;
const MAP_H = 1536;
// Entrance door spawn (fixed)
const PLAYER_START_X = Math.round(MAP_W * 0.40);
const PLAYER_START_Y = Math.round(MAP_H * 0.50);
const ZONE_GREEN = [126, 196, 0];
const ZONE_PINK = [207, 18, 120];
const ZONE_TOL = 70;

const PLAYER_MAX_HP = 10;
const ENEMY_MAX_HP = 5;
const NAV_CELL_SIZE = 18;

// body metrics relative to feet point (px, up = negative)
const CHEST = -152, HEAD = -202, MOUTH = -184, HAND = -116;

// ---------- FX sub-elements (static markup, driven by refs) ----------
function FXLayer({ fxRefs }) {



  return (
    <div className="fxLayer" ref={fxRefs.layer}>
      <div className="streak" ref={fxRefs.streak}>
        {[0, 1, 2, 3].map(i => (
          <i key={i} style={{
            width: 30 + i * 10 + 'px', top: (i * 7 - 10) + 'px', left: 0,
            transform: 'rotate(180deg)', opacity: 1 - i * 0.18
          }} />
        ))}
      </div>
      <div className="slaparc" ref={fxRefs.slap}><div className="arc" /></div>
      <div className="spark" ref={fxRefs.spark}><div className="star" /><div className="core" /></div>
      <div className="burst" ref={fxRefs.burst}>
        <div className="ring" /><div className="ring" style={{ inset: '18%', borderColor: '#fff' }} />
      </div>
      <div className="dust" ref={fxRefs.dust}>
        {[[-26, 4, 16], [-10, -6, 13], [10, -2, 15], [26, 6, 14], [0, 8, 18]].map((p, i) => (
          <b key={i} style={{
            left: p[0] + 'px', top: p[1] + 'px', width: p[2] + 'px', height: p[2] + 'px',
            marginLeft: -p[2] / 2, marginTop: -p[2] / 2
          }} />
        ))}
      </div>
      <div className="kostars" ref={fxRefs.stars}>
        {[0, 1, 2, 3].map(i => {
          const a = (i / 4) * Math.PI * 2;
          return <i key={i} style={{ left: Math.cos(a) * 34 + 'px', top: Math.sin(a) * 14 + 'px' }}>✦</i>;
        })}
      </div>
      <div className="glass" ref={fxRefs.glass}>
        <div className="cup"><div className="liquid" ref={fxRefs.liquid} style={{ height: '90%' }} /></div>
      </div>
      <div className="foam" ref={fxRefs.foam} />
      <div className="sweat" ref={fxRefs.sweat} />
    </div>
  );
}

function App() {
  const [speed, setSpeed] = useState(1);
  const [musicVol, setMusicVol] = useState(0.6);
  const [sfxVol, setSfxVol] = useState(0.9);
  const [gameStarted, setGameStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [showPauseMenu, setShowPauseMenu] = useState(false);
  const [resumingCount, setResumingCount] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const resumingCountRef = useRef(resumingCount);
  useEffect(() => { resumingCountRef.current = resumingCount; }, [resumingCount]);
  const musicVolRef = useRef(musicVol);
  const sfxVolRef = useRef(sfxVol);
  const lastPauseToggleRef = useRef(0);

  const stageRef = useRef(null);
  const worldRef = useRef(null);
  const anchorRef = useRef(null);
  const scaleRef = useRef(null);
  const frontRef = useRef(null);
  const backRef = useRef(null);
  const shadowRef = useRef(null);
  const flashRef = useRef(null);
  const fxRefs = {
    layer: useRef(), spark: useRef(), streak: useRef(), dust: useRef(), stars: useRef(),
    glass: useRef(), liquid: useRef(), foam: useRef(), sweat: useRef(), slap: useRef(), burst: useRef(),
  };
  // mobile controls refs/state
  const [showMobileControls, setShowMobileControls] = useState(false);
  const joystickRef = useRef(null);
  const joystickKnobRef = useRef(null);
  const joystickPointerId = useRef(null);
  const joystickCenter = useRef({ x: 0, y: 0 });
  const joystickDeadzone = 0.2;
  const joystickActiveRef = useRef(false);

  function updateJoystickFromPoint(clientX, clientY) {
    const jc = joystickCenter.current;
    const dx = clientX - jc.x;
    const dy = clientY - jc.y;
    const r = Math.max(48, 64); // nominal joystick radius in px
    const nx = Math.max(-1, Math.min(1, dx / r));
    const ny = Math.max(-1, Math.min(1, dy / r));
    // map to arena keys (ny: -1 up, +1 down)
    try { arena.current.keys.clear(); } catch (e) { arena.current.keys = new Set(); }
    if (nx < -joystickDeadzone) arena.current.keys.add('a');
    else if (nx > joystickDeadzone) arena.current.keys.add('d');
    if (ny < -joystickDeadzone) arena.current.keys.add('w');
    else if (ny > joystickDeadzone) arena.current.keys.add('s');
    // visual knob movement
    try {
      if (joystickKnobRef.current) {
        const kx = Math.max(-r, Math.min(r, dx));
        const ky = Math.max(-r, Math.min(r, dy));
        joystickKnobRef.current.style.transform = `translate(${kx}px, ${ky}px)`;
      }
    } catch (e) { }
  }

  function onJoystickPointerDown(e) {
    if (!joystickRef.current) return;
    joystickPointerId.current = e.pointerId;
    try { joystickRef.current.setPointerCapture(e.pointerId); } catch (ex) { }
    const rect = joystickRef.current.getBoundingClientRect();
    joystickCenter.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    joystickActiveRef.current = true;
    updateJoystickFromPoint(e.clientX, e.clientY);
    e.preventDefault(); e.stopPropagation();
  }

  function onJoystickPointerMove(e) {
    if (!joystickActiveRef.current) return;
    if (joystickPointerId.current != null && e.pointerId !== joystickPointerId.current) return;
    updateJoystickFromPoint(e.clientX, e.clientY);
    e.preventDefault(); e.stopPropagation();
  }

  function onJoystickPointerUp(e) {
    if (joystickPointerId.current != null && e.pointerId !== joystickPointerId.current) return;
    joystickPointerId.current = null;
    joystickActiveRef.current = false;
    try { arena.current.keys.clear(); } catch (ex) { arena.current.keys = new Set(); }
    try { if (joystickKnobRef.current) joystickKnobRef.current.style.transform = `translate(0px, 0px)`; } catch (ex) { }
    try { if (joystickRef.current) joystickRef.current.releasePointerCapture && joystickRef.current.releasePointerCapture(e.pointerId); } catch (ex) { }
    e.preventDefault(); e.stopPropagation();
  }

  function mobileAction(actionKey) {
    if (!isOffCooldown(actionKey)) return;
    if (actionKey === 'drink') {
      const a = arena.current;
      if (!a || !canDrinkAt(a.x, a.y)) return;
    }
    startAction(actionKey, false);
  }
  const sounds = useRef({});
  const zoneMask = useRef({ ready: false, w: MAP_W, h: MAP_H, cells: null });
  const navGrid = useRef({ ready: false, w: 0, h: 0, cellSize: NAV_CELL_SIZE, cells: null });
  // gameplay refs/state
  const playerHPRef = useRef(PLAYER_MAX_HP);
  const [uiHP, setUiHP] = useState(PLAYER_MAX_HP);
  const killCountRef = useRef(0);
  const totalDamageDealtRef = useRef(0);
  const totalDamageTakenRef = useRef(0);
  const musicLockedOffRef = useRef(false);
  const [uiKills, setUiKills] = useState(0);
  const cooldownsRef = useRef({ punch: 0, kick: 0, slap: 0, drink: 0 });
  const enemiesRef = useRef([]);
  const enemyId = useRef(1);
  const lastSpawnAt = useRef(0);
  const [tick, setTick] = useState(0); // forces HUD updates

  function syncAudioVolumes(nextMusicVol = musicVol, nextSfxVol = sfxVol) {
    musicVolRef.current = nextMusicVol;
    sfxVolRef.current = nextSfxVol;
    const s = sounds.current;
    if (s.background) s.background.volume = nextMusicVol;
    if (s.endOfGame) s.endOfGame.volume = nextMusicVol;
    ['enemyDeath', 'damageTaken', 'damageGiven', 'drinking'].forEach(key => {
      if (s[key]) s[key].volume = nextSfxVol;
    });
  }

  function playBackgroundMusic() {
    const bg = sounds.current.background;
    if (!bg || musicLockedOffRef.current) return;
    try { bg.volume = musicVolRef.current; if (!bg.paused) return; bg.play().catch(() => { }); } catch (e) { }
  }

  function stopBackgroundMusic() {
    const bg = sounds.current.background;
    if (!bg) return;
    try { bg.pause(); bg.currentTime = 0; } catch (e) { }
  }

  // background music removed — no ensureBackgroundMusic/stopBackgroundMusic

  function updateWorldLayout() {
    const stage = stageRef.current;
    const world = worldRef.current;
    if (!stage || !world) return;

    const stageW = stage.clientWidth || window.innerWidth;
    const stageH = stage.clientHeight || window.innerHeight;
    const scale = Math.min(stageW / MAP_W, stageH / MAP_H);
    const drawW = MAP_W * scale;
    const drawH = MAP_H * scale;
    const offsetX = (stageW - drawW) / 2;
    const offsetY = (stageH - drawH) / 2;

    world.style.width = MAP_W + 'px';
    world.style.height = MAP_H + 'px';
    world.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
  }

  function zoneAt(x, y) {
    const mask = zoneMask.current;
    if (!mask.ready || !mask.cells) return 1;
    const xi = Math.round(x);
    const yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= mask.w || yi >= mask.h) return 0;
    return mask.cells[yi * mask.w + xi];
  }

  function canStandAt(x, y) {
    const zone = zoneAt(x, y);
    return zone === 1 || zone === 2;
  }

  function canEnemySpawnAt(x, y) {
    return canStandAt(x, y);
  }

  function buildNavGrid() {
    const mask = zoneMask.current;
    if (!mask.ready || !mask.cells) return;

    const cellSize = NAV_CELL_SIZE;
    const w = Math.ceil(mask.w / cellSize);
    const h = Math.ceil(mask.h / cellSize);
    const cells = new Uint8Array(w * h);

    for (let cy = 0; cy < h; cy++) {
      for (let cx = 0; cx < w; cx++) {
        const px = clamp(Math.round(cx * cellSize + cellSize / 2), 0, mask.w - 1);
        const py = clamp(Math.round(cy * cellSize + cellSize / 2), 0, mask.h - 1);
        cells[cy * w + cx] = canStandAt(px, py) ? 1 : 0;
      }
    }

    navGrid.current = { ready: true, w, h, cellSize, cells };
  }

  function navCellFromPoint(x, y) {
    const grid = navGrid.current;
    if (!grid.ready || !grid.cells) return null;
    return {
      x: clamp(Math.floor(x / grid.cellSize), 0, grid.w - 1),
      y: clamp(Math.floor(y / grid.cellSize), 0, grid.h - 1),
    };
  }

  function navPointFromCell(cx, cy) {
    const grid = navGrid.current;
    return {
      x: clamp(Math.round(cx * grid.cellSize + grid.cellSize / 2), 0, MAP_W - 1),
      y: clamp(Math.round(cy * grid.cellSize + grid.cellSize / 2), 0, MAP_H - 1),
    };
  }

  function navCellWalkable(cx, cy) {
    const grid = navGrid.current;
    if (!grid.ready || !grid.cells) return false;
    if (cx < 0 || cy < 0 || cx >= grid.w || cy >= grid.h) return false;
    return grid.cells[cy * grid.w + cx] === 1;
  }

  function findNearestWalkableNavCell(cx, cy, maxRadius = 14) {
    if (navCellWalkable(cx, cy)) return { x: cx, y: cy };
    for (let radius = 1; radius <= maxRadius; radius++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const dy = radius - Math.abs(dx);
        const candidates = dy === 0 ? [[cx + dx, cy]] : [[cx + dx, cy + dy], [cx + dx, cy - dy]];
        for (const [nx, ny] of candidates) {
          if (navCellWalkable(nx, ny)) return { x: nx, y: ny };
        }
      }
    }
    return null;
  }

  function findNavPath(startX, startY, targetX, targetY) {
    const grid = navGrid.current;
    if (!grid.ready || !grid.cells) return null;

    const start = navCellFromPoint(startX, startY);
    const target = navCellFromPoint(targetX, targetY);
    if (!start || !target) return null;

    const startCell = findNearestWalkableNavCell(start.x, start.y);
    const targetCell = findNearestWalkableNavCell(target.x, target.y);
    if (!startCell || !targetCell) return null;

    const w = grid.w;
    const h = grid.h;
    const size = w * h;
    const parents = new Int32Array(size);
    parents.fill(-1);
    const queue = new Int32Array(size);
    let head = 0;
    let tail = 0;
    const startIndex = startCell.y * w + startCell.x;
    const targetIndex = targetCell.y * w + targetCell.x;
    queue[tail++] = startIndex;
    parents[startIndex] = startIndex;

    const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    let found = false;

    while (head < tail) {
      const current = queue[head++];
      if (current === targetIndex) {
        found = true;
        break;
      }

      const cx = current % w;
      const cy = Math.floor(current / w);
      for (const [dx, dy] of neighbors) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (!navCellWalkable(nx, ny)) continue;
        const nextIndex = ny * w + nx;
        if (parents[nextIndex] !== -1) continue;
        parents[nextIndex] = current;
        queue[tail++] = nextIndex;
      }
    }

    if (!found) return null;

    const path = [];
    let current = targetIndex;
    while (current !== startIndex) {
      const cx = current % w;
      const cy = Math.floor(current / w);
      path.push(navPointFromCell(cx, cy));
      current = parents[current];
      if (current === -1) return null;
    }

    path.reverse();
    return path;
  }

  function getEnemyPath(enemy, targetX, targetY, now) {
    const targetCell = navCellFromPoint(targetX, targetY);
    if (!targetCell) return null;
    const targetKey = `${targetCell.x},${targetCell.y}`;
    if (enemy.path && enemy.pathTargetKey === targetKey && enemy.pathRecalcAt > now && enemy.path.length) {
      return enemy.path;
    }

    const path = findNavPath(enemy.x, enemy.y, targetX, targetY) || [];
    enemy.path = path;
    enemy.pathTargetKey = targetKey;
    enemy.pathRecalcAt = now + 350;
    return path;
  }

  function pickEnemyChaseStep(enemy, targetX, targetY, dt) {
    const maxStep = enemy.speed * dt;
    const dx = targetX - enemy.x;
    const dy = targetY - enemy.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= 0.001) return null;

    const baseAngle = Math.atan2(dy, dx);
    const angleOffsets = [0, 18, -18, 36, -36, 54, -54, 72, -72, 90, -90, 108, -108, 135, -135];
    const steps = Math.min(maxStep, dist);
    const candidates = [];

    for (const offset of angleOffsets) {
      const ang = baseAngle + (offset * Math.PI) / 180;
      const nx = enemy.x + Math.cos(ang) * steps;
      const ny = enemy.y + Math.sin(ang) * steps;
      if (!canStandAt(nx, ny)) continue;

      const nextDist = Math.hypot(targetX - nx, targetY - ny);
      const zonePenalty = zoneAt(nx, ny) === 1 ? 0 : 8;
      const stuckPenalty = (enemy.stuckFrames || 0) * 0.25;
      const anglePenalty = Math.abs(offset) * 0.08;
      candidates.push({ x: nx, y: ny, score: nextDist + zonePenalty + stuckPenalty + anglePenalty });
    }

    if (candidates.length) {
      candidates.sort((a, b) => a.score - b.score);
      return candidates[0];
    }

    const fallbackOffsets = [
      [Math.sign(dx), 0],
      [0, Math.sign(dy)],
      [Math.sign(dx), Math.sign(dy)],
      [Math.sign(dx), -Math.sign(dy)],
      [-Math.sign(dx), Math.sign(dy)],
    ];

    for (const [fx, fy] of fallbackOffsets) {
      const nx = enemy.x + fx * steps;
      const ny = enemy.y + fy * steps;
      if (canStandAt(nx, ny)) return { x: nx, y: ny, score: Math.hypot(targetX - nx, targetY - ny) };
    }

    return null;
  }

  function canDrinkAt(x, y) {
    return zoneAt(x, y) === 2;
  }

  function snapPlayerToAllowedZone() {
    if (!zoneMask.current.ready) return;
    if (canStandAt(arena.current.x, arena.current.y)) return;

    const startX = Math.round(PLAYER_START_X);
    const startY = Math.round(PLAYER_START_Y);
    const maxRadius = 720;
    const step = 6;

    for (let radius = 0; radius <= maxRadius; radius += step) {
      for (let dx = -radius; dx <= radius; dx += step) {
        const dy = radius - Math.abs(dx);
        const candidates = dy === 0
          ? [[startX + dx, startY]]
          : [[startX + dx, startY + dy], [startX + dx, startY - dy]];

        for (const [x, y] of candidates) {
          if (canStandAt(x, y)) {
            arena.current.x = x;
            arena.current.y = y;
            return;
          }
        }
      }
    }
  }

  function spawnEnemyAt(x, y) {
    const world = worldRef.current;
    if (!world) return null;
    const id = enemyId.current++;
    const el = document.createElement('div');
    el.className = 'charAnchor enemy';
    el.style.position = 'absolute';
    el.style.left = '0'; el.style.top = '0';
    el.innerHTML = `
      <div class="charScale">
        <img class="front" src="sprites/enemy_front.png" />
        <img class="back hide" src="sprites/enemy_back.png" />
        <div class="hitFlash"></div>
      </div>`;
    world.appendChild(el);
    // determine spawn coords: prefer provided coordinates, otherwise find a nearby allowed point
    function findSpawn(px, py) {
      if (typeof px === 'number' && typeof py === 'number' && canEnemySpawnAt(px, py)) return [px, py];
      // try sampling random positions across the map, but keep a minimum distance from player
      const MIN_SPAWN_DIST = 450;
      for (let attempt = 0; attempt < 500; attempt++) {
        const sx = Math.floor(Math.random() * MAP_W);
        const sy = Math.floor(Math.random() * MAP_H);
        if (Math.hypot(sx - PLAYER_START_X, sy - PLAYER_START_Y) < MIN_SPAWN_DIST) continue;
        if (sx >= 0 && sy >= 0 && sx < MAP_W && sy < MAP_H && canEnemySpawnAt(sx, sy)) return [sx, sy];
      }
      // fallback: random scan across the map
      for (let attempt = 0; attempt < 1000; attempt++) {
        const sx = Math.floor(Math.random() * MAP_W);
        const sy = Math.floor(Math.random() * MAP_H);
        if (Math.hypot(sx - PLAYER_START_X, sy - PLAYER_START_Y) < 350) continue;
        if (canEnemySpawnAt(sx, sy)) return [sx, sy];
      }
      return [PLAYER_START_X, PLAYER_START_Y];
    }
    const [spawnX, spawnY] = findSpawn(x, y);
    const enemy = {
      id,
      x: spawnX,
      y: spawnY,
      hp: ENEMY_MAX_HP,
      el,
      nextAttack: 0,
      speed: 120 + Math.random() * 40,
      scale: 1.5,
      // hitbox radius in pixels (in arena space)
      hitbox: 60,
      stuckFrames: 0,
      path: [],
      pathTargetKey: '',
      pathRecalcAt: 0,
    };
    enemiesRef.current.push(enemy);
    return enemy;
  }

  function removeEnemy(enemy) {
    try { if (enemy.el && enemy.el.parentNode) enemy.el.parentNode.removeChild(enemy.el); } catch (e) { }
    enemiesRef.current = enemiesRef.current.filter(e => e !== enemy);
  }

  function isOffCooldown(action) {
    return (cooldownsRef.current[action] || 0) <= performance.now();
  }

  function setCooldown(action, ms) {
    cooldownsRef.current[action] = performance.now() + ms;
  }

  function showFloatingHitText(x, y, text, className) {
    const world = worldRef.current;
    if (!world) return;
    const el = document.createElement('div');
    el.className = className;
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    world.appendChild(el);
    window.setTimeout(() => {
      try { if (el.parentNode) el.parentNode.removeChild(el); } catch (e) { }
    }, 800);
  }

  function showEnemyHitText(enemy, text, critical = false) {
    if (!enemy) return;
    showFloatingHitText(enemy.x, enemy.y - 220, text, `enemyHitText${critical ? ' critical' : ''}`);
  }

  function showPlayerHitText(text) {
    showFloatingHitText(arena.current.x, arena.current.y - 230, text, 'playerHitText');
  }

  function damageEnemy(enemy, amount, feedback = {}) {
    if (!enemy) return false;
    const critical = !!feedback.critical;
    const label = feedback.label || (critical ? 'critical hit!' : (amount >= 3 ? `hit! x${amount}` : amount >= 2 ? `hit! x${amount}` : 'hit!'));
    showEnemyHitText(enemy, label, critical);
    totalDamageDealtRef.current += amount;
    enemy.hp -= amount;
    if (enemy.hp <= 0) {
      // already dying
      if (enemy.action && enemy.action.key === 'death') return true;
      // death: trigger enemy death action so animation plays, then remove
      try { if (sounds.current.enemyDeath) { sounds.current.enemyDeath.volume = sfxVolRef.current; sounds.current.enemyDeath.currentTime = 0; sounds.current.enemyDeath.play(); } } catch (e) { }
      const deathDur = (A.death && A.death.dur) || 1.5;
      enemy.hp = 0;
      enemy.action = { key: 'death', start: performance.now(), dur: deathDur, hold: true };
      // schedule DOM removal after animation finishes
      setTimeout(() => {
        try { removeEnemy(enemy); } catch (e) { }
        killCountRef.current += 1;
        setUiKills(killCountRef.current);
      }, Math.max(0, deathDur * 1000));
      return true;
    }
    return false;
  }

  function damagePlayer(amount) {
    showPlayerHitText('hit!');
    totalDamageTakenRef.current += amount;
    playerHPRef.current = Math.max(0, playerHPRef.current - amount);
    setUiHP(playerHPRef.current);
    // play damage taken SFX
    try { if (sounds.current.damageTaken) { sounds.current.damageTaken.volume = sfxVolRef.current; sounds.current.damageTaken.currentTime = 0; sounds.current.damageTaken.play(); } } catch (e) { }
    if (playerHPRef.current <= 0) {
      // death: trigger death action
      musicLockedOffRef.current = true;
      arena.current.dead = true;
      try { arena.current.keys.clear(); } catch (e) { arena.current.keys = new Set(); }
      // start death action and let the game loop run so the death animation can play
      const deathDur = (A.death && A.death.dur) || 2;
      arena.current.action = { key: 'death', start: performance.now(), dur: deathDur, hold: true };
      // hide pause UI and any resume countdown, but DO NOT set gameOver or paused yet;
      // allow runArena to continue so the death animation is applied.
      setShowPauseMenu(false);
      setResumingCount(0);
      // after the death animation finishes, mark game over and stop music / play end music
      setTimeout(() => {
        try { stopBackgroundMusic(); } catch (e) { }
        try { if (sounds.current.endOfGame) { sounds.current.endOfGame.volume = musicVolRef.current; sounds.current.endOfGame.currentTime = 0; sounds.current.endOfGame.play(); } } catch (e) { }
        // freeze the game loop by pausing and show Game Over
        setPaused(true);
        setGameOver(true);
      }, Math.max(0, deathDur * 1000));
    }
  }

  function healPlayerFull() {
    playerHPRef.current = PLAYER_MAX_HP;
    setUiHP(playerHPRef.current);
  }

  function restartGame() {
    try {
      // stop sounds
      Object.values(sounds.current).forEach(s => { try { if (s && typeof s.pause === 'function') { s.pause(); s.currentTime = 0; } } catch (e) { } });

      // remove enemies and their DOM
      for (const e of enemiesRef.current.slice()) {
        try { removeEnemy(e); } catch (err) { }
      }
      enemiesRef.current = [];

      // reset counters and refs
      enemyId.current = 1;
      killCountRef.current = 0;
      setUiKills(0);
      totalDamageDealtRef.current = 0;
      totalDamageTakenRef.current = 0;
      cooldownsRef.current = {};
      lastSpawnAt.current = performance.now();
      musicLockedOffRef.current = false;

      // reset player
      playerHPRef.current = PLAYER_MAX_HP;
      setUiHP(playerHPRef.current);

      // reset arena state
      arena.current.x = PLAYER_START_X;
      arena.current.y = PLAYER_START_Y;
      arena.current.facing = 'S';
      arena.current.action = null;
      arena.current.walkStart = performance.now();
      arena.current.moving = false;
      arena.current.dead = false;
      try { arena.current.keys.clear(); } catch (e) { arena.current.keys = new Set(); }

      // reset nav/path caches on enemies
      // (they will recalc when needed)

      // give a tick to UI
      setTick(t => t + 1);

      // ensure volumes are synced
      syncAudioVolumes(musicVolRef.current, sfxVolRef.current);

      // resume game loop
      setPaused(false);
      setGameOver(false);
      setShowPauseMenu(false);
      setResumingCount(0);
      setGameStarted(true);
    } catch (e) { console.warn('restartGame failed', e); }
  }

  function initiateResume() {
    // hide pause menu but keep paused true until countdown finishes
    setShowPauseMenu(false);
    setResumingCount(3);
  }

  function cancelResumeCountdown() {
    setResumingCount(0);
    setShowPauseMenu(true);
    setPaused(true);
  }

  // countdown effect for resuming
  useEffect(() => {
    if (!resumingCount || resumingCount <= 0) return;
    const id = setInterval(() => {
      setResumingCount(n => {
        if (n <= 1) {
          // finish countdown: unpause
          setPaused(false);
          clearInterval(id);
          return 0;
        }
        return n - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [resumingCount]);

  function processActionHit(key) {
    const now = performance.now();
    if (key === 'drink') {
      // heal and cooldown 30s
      if (!isOffCooldown('drink')) return;
      healPlayerFull();
      setCooldown('drink', 30 * 1000);
      try { if (sounds.current.drinking) { sounds.current.drinking.volume = sfxVolRef.current; sounds.current.drinking.currentTime = 0; sounds.current.drinking.play(); } } catch (e) { }
      return;
    }
    // attack types
    const ranges = { punch: 120, kick: 140, slap: 160 };
    const damages = { punch: 1, kick: 2, slap: 3 };
    const cds = { punch: 1000, kick: 2000, slap: 10000 };
    if (!isOffCooldown(key)) return;
    // find enemies in range
    const hits = [];
    for (const e of enemiesRef.current) {
      const dx = e.x - arena.current.x, dy = e.y - arena.current.y;
      const d = Math.hypot(dx, dy);
      const effRange = ranges[key] + (e.hitbox || 0);
      if (d <= effRange) hits.push(e);
    }
    if (!hits.length) {
      setCooldown(key, cds[key]);
      return;
    }
    // slap has 25% instant kill and hits all enemies in range
    if (key === 'slap') {
      let played = false;
      for (const target of hits) {
        if (Math.random() < 0.25) damageEnemy(target, target.hp, { critical: true, label: 'critical hit!' });
        else damageEnemy(target, damages[key], { label: 'hit! x3' });
        played = true;
      }
      if (played) {
        try { if (sounds.current.damageGiven) { sounds.current.damageGiven.volume = sfxVolRef.current; sounds.current.damageGiven.currentTime = 0; sounds.current.damageGiven.play(); } } catch (e) { }
      }
    } else {
      if (key === 'kick') damageEnemy(hits[0], damages[key], { label: 'hit! x2' });
      else damageEnemy(hits[0], damages[key], { label: 'hit!' });
      try { if (sounds.current.damageGiven) { sounds.current.damageGiven.volume = sfxVolRef.current; sounds.current.damageGiven.currentTime = 0; sounds.current.damageGiven.play(); } } catch (e) { }
    }
    setCooldown(key, cds[key]);
  }

  function loadZoneMask() {
    const img = new Image();
    img.src = 'sprites/movinganddrinkingspaces.png';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const cells = new Uint8Array(canvas.width * canvas.height);

      for (let i = 0, p = 0; i < data.length; i += 4, p++) {
        if (data[i + 3] === 0) continue;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const greenDist = Math.abs(r - ZONE_GREEN[0]) + Math.abs(g - ZONE_GREEN[1]) + Math.abs(b - ZONE_GREEN[2]);
        const pinkDist = Math.abs(r - ZONE_PINK[0]) + Math.abs(g - ZONE_PINK[1]) + Math.abs(b - ZONE_PINK[2]);
        if (greenDist <= ZONE_TOL && greenDist <= pinkDist) cells[p] = 1;
        else if (pinkDist <= ZONE_TOL) cells[p] = 2;
      }

      zoneMask.current = { ready: true, w: canvas.width, h: canvas.height, cells };
      buildNavGrid();
      snapPlayerToAllowedZone();
    };
  }

  // config mirror for the rAF loop (avoids stale closures)
  const cfg = useRef({ speed });
  cfg.current = { speed };

  // arena state
  const arena = useRef({
    x: PLAYER_START_X, y: PLAYER_START_Y, facing: 'S', keys: new Set(),
    action: null, // {key, start, dur, hold}
    walkStart: performance.now(), moving: false,
  });

  // ---------- apply a computed pose to the DOM ----------
  function applyPose(key, p, dirName) {
    const meta = A[key];
    let d;
    if (meta.dirable) d = DIRS[dirName];
    else d = { vec: [0, 1], sprite: meta.forceSprite || 'front', flip: meta.forceFlip || false };
    const pose = meta.fn(p, d);
    const sprite = pose.sprite || meta.forceSprite || d.sprite;
    const flip = pose.flip != null ? pose.flip : (meta.forceFlip != null ? meta.forceFlip : d.flip);
    const fx = pose.fx || {};

    // sprite swap
    if (frontRef.current && backRef.current) {
      frontRef.current.classList.toggle('hide', sprite !== 'front');
      backRef.current.classList.toggle('hide', sprite !== 'back');
    }
    // body transform
    const sgnX = flip ? -1 : 1;
    if (scaleRef.current)
      scaleRef.current.style.transform =
        `translate(-50%,-100%) rotate(${pose.rot.toFixed(2)}deg) scale(${(pose.sx * sgnX).toFixed(3)},${pose.sy.toFixed(3)})`;

    // position in arena space
    const baseX = arena.current.x;
    const groundY = arena.current.y;
    const px = baseX + pose.dx, py = groundY + pose.dy;
    if (anchorRef.current) anchorRef.current.style.transform = `translate3d(${px}px,${py}px,0)`;

    // shadow: on ground, shrinks as body rises (pose.dy negative)
    if (shadowRef.current) {
      const lift = Math.max(0, -pose.dy);
      const s = clamp(1 - lift / 220, 0.5, 1.15) * (pose.sx);
      const grounded = key === 'death' || key.startsWith('sit') ? 1.15 : 1;
      shadowRef.current.style.transform = `translate3d(${baseX}px,${groundY + 4}px,0) scale(${(s * grounded).toFixed(3)},${(s).toFixed(3)})`;
      shadowRef.current.style.opacity = clamp(0.55 - lift / 400, 0.2, 0.6);
    }

    // hit flash on body
    if (flashRef.current) flashRef.current.style.opacity = (fx.hit || 0) * 0.85;

    // ----- FX -----
    const dv = d.vec;
    // impact point
    const reach = key === 'kick' ? 134 : key === 'slap' ? 150 : 120;
    const baseY = fx.low ? -86 : CHEST;
    const ix = dv[0] * reach, iy = baseY + dv[1] * reach;

    setFX(fxRefs.spark, fx.spark, ix, iy, s => `translate(-50%,-50%) rotate(${(performance.now() / 4) % 360}deg) scale(${0.45 + s * 0.85})`);
    setFX(fxRefs.burst, fx.burst, ix, iy, s => `translate(-50%,-50%) scale(${0.4 + s * 1.8})`);

    // streak: at chest, pointing along facing (bars trail behind)
    if (fxRefs.streak.current) {
      const ang = Math.atan2(dv[1], dv[0]) * 180 / Math.PI;
      fxRefs.streak.current.style.opacity = fx.streak || 0;
      fxRefs.streak.current.style.transform = `translate(${dv[0] * 60}px,${CHEST + dv[1] * 40}px) rotate(${ang}deg)`;
    }
    // slap arc sweeping in front
    if (fxRefs.slap.current) {
      const ang = Math.atan2(dv[1], dv[0]) * 180 / Math.PI;
      fxRefs.slap.current.style.opacity = (fx.slap || 0) * 0.9;
      fxRefs.slap.current.style.transform =
        `translate(${dv[0] * 70}px,${CHEST + dv[1] * 50}px) rotate(${ang + (flip ? 40 : -40) + (fx.slap || 0) * 80}deg) scale(${0.7 + (fx.slap || 0) * 0.6})`;
    }
    // dust at feet
    setFX(fxRefs.dust, fx.dust, 0, -6, s => `translate(-50%,-50%) scale(${0.6 + s * 1.5})`, 0.9);
    // ko stars above head
    if (fxRefs.stars.current) {
      fxRefs.stars.current.style.opacity = fx.stars || 0;
      const cx = key === 'death' ? -26 : 0;
      fxRefs.stars.current.style.transform = `translate(${cx}px,${HEAD + 6}px) rotate(${(performance.now() / 12) % 360}deg)`;
    }
    // sweat near head (slap windup)
    if (fxRefs.sweat.current) {
      fxRefs.sweat.current.style.opacity = (fx.sweat || 0);
      fxRefs.sweat.current.style.transform = `translate(${HEAD ? 18 : 0}px,${HEAD}px) scale(${0.7 + (fx.sweat || 0) * 0.4})`;
    }
    // drink glass + foam
    if (fxRefs.glass.current) {
      if (fx.glass) {
        const g = fx.glass;
        const gx = 30 - g.y * 18;                 // hand -> mouth (slightly inward)
        const gy = HAND + (MOUTH - HAND) * g.y;    // rise to mouth
        fxRefs.glass.current.style.opacity = 1;
        fxRefs.glass.current.style.transform = `translate(${gx}px,${gy}px) rotate(${g.tilt * -42}deg)`;
        if (fxRefs.liquid.current) fxRefs.liquid.current.style.height = (g.fill * 90).toFixed(0) + '%';
      } else fxRefs.glass.current.style.opacity = 0;
    }
    if (fxRefs.foam.current) {
      fxRefs.foam.current.style.opacity = fx.foam || 0;
      fxRefs.foam.current.style.transform = `translate(0px,${MOUTH + 6}px) scale(0.8)`;
    }

    // screen shake
    if (stageRef.current) {
      const sh = fx.shake || 0;
      if (sh > 0) {
        const a = sh * 7;
        stageRef.current.style.transform = `translate(${(Math.random() - .5) * a}px,${(Math.random() - .5) * a}px)`;
      } else stageRef.current.style.transform = '';
    }
  }

  // apply a pose to an enemy DOM element (doesn't use refs)
  function applyPoseToEnemy(enemy, key, p, dirName) {
    const meta = A[key];
    let d;
    if (meta.dirable) d = DIRS[dirName];
    else d = { vec: [0, 1], sprite: meta.forceSprite || 'front', flip: meta.forceFlip || false };
    const pose = meta.fn(p, d);
    const sprite = pose.sprite || meta.forceSprite || d.sprite;
    const flip = pose.flip != null ? pose.flip : (meta.forceFlip != null ? meta.forceFlip : d.flip);

    const el = enemy.el;
    if (!el) return;
    const front = el.querySelector('img.front');
    const back = el.querySelector('img.back');
    const scaleEl = el.querySelector('.charScale');
    const flash = el.querySelector('.hitFlash');

    if (front && back) {
      front.classList.toggle('hide', sprite !== 'front');
      back.classList.toggle('hide', sprite !== 'back');
    }
    if (scaleEl) {
      const sgnX = flip ? -1 : 1;
      scaleEl.style.transform = `translate(-50%,-100%) rotate(${pose.rot.toFixed(2)}deg) scale(${(pose.sx * sgnX).toFixed(3)},${pose.sy.toFixed(3)})`;
    }
    // position including pose offsets
    const baseX = enemy.x;
    const baseY = enemy.y;
    const px = baseX + (pose.dx || 0);
    const py = baseY + (pose.dy || 0);
    el.style.transform = `translate3d(${px}px,${py}px,0)`;

    if (flash) flash.style.opacity = (pose.fx && pose.fx.hit) ? 0.85 : 0;
  }

  function setFX(ref, v, x, y, txf, maxOp = 1) {
    if (!ref.current) return;
    v = v || 0;
    ref.current.style.opacity = Math.min(v, maxOp);
    ref.current.style.left = x + 'px';
    ref.current.style.top = y + 'px';
    if (txf) ref.current.style.transform = txf(v);
  }

  // ---------- main rAF loop ----------
  // initialize zone mask and sounds once on mount
  useEffect(() => {
    try {
      updateWorldLayout();
      loadZoneMask();
    } catch (e) { }
    try {
      if (!sounds.current._inited) {
        sounds.current.background = new Audio('sounds/background/background_sound.mp3');
        sounds.current.background.loop = true;
        sounds.current.background.volume = musicVolRef.current;
        sounds.current.endOfGame = new Audio('sounds/endofgame/gameover.mp3');
        sounds.current.enemyDeath = new Audio('sounds/enemydeath/enemykilled.mp3');
        sounds.current.damageTaken = new Audio('sounds/damagetaken/damagetaken_soundeffect.mp3');
        sounds.current.damageGiven = new Audio('sounds/damagegiven/damagegiven_soundeffect.mp3');
        sounds.current.drinking = new Audio('sounds/drinkingayran/drinking_soundeffect.mp3');
        // set initial volumes
        if (sounds.current.background) sounds.current.background.volume = musicVolRef.current;
        if (sounds.current.endOfGame) sounds.current.endOfGame.volume = musicVolRef.current;
        sounds.current._inited = true;
        try { window.__tellak_sounds = sounds.current; window.__tellak_musicLockedRef = musicLockedOffRef; } catch (e) { }
      }
    } catch (e) { console.warn('Audio init failed', e); }
    // eslint-disable-next-line
  }, []);

  // detect touch-capable device to show mobile controls
  useEffect(() => {
    // TEMPORARY: force mobile controls visible for testing on desktop
    setShowMobileControls(true);
    // original detection (commented out):
    // const touchy = (typeof window !== 'undefined') && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
    // setShowMobileControls(!!touchy);
  }, []);
  useEffect(() => {
    let raf;
    const onResize = () => updateWorldLayout();
    updateWorldLayout();
    if (gameStarted && !paused && !gameOver) {
      try { playBackgroundMusic(); } catch (e) { }
    }
    if (paused && !gameOver) {
      try {
        // pause background + any playing SFX
        Object.values(sounds.current).forEach(s => { try { if (s && typeof s.pause === 'function') s.pause(); } catch (e) { } });
      } catch (e) { }
    }
    if (arena.current.x === 0 && arena.current.y === 0) {
      arena.current.x = PLAYER_START_X;
      arena.current.y = PLAYER_START_Y;
    }

    let last = performance.now();
    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (gameStarted && !paused && !gameOver) {
        const c = cfg.current;
        runArena(now, dt, c);
        if (musicLockedOffRef.current) stopBackgroundMusic();
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    const tickInterval = setInterval(() => setTick(t => t + 1), 400);
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(tickInterval);
      window.removeEventListener('resize', onResize);
    };
    // eslint-disable-next-line
  }, [gameStarted, paused, resumingCount]);

  useEffect(() => {
    syncAudioVolumes(musicVol, sfxVol);
  }, [musicVol, sfxVol]);

  useEffect(() => {
    if (!gameStarted) return;
    try { spawnEnemyAt(); lastSpawnAt.current = performance.now(); } catch (e) { }
  }, [gameStarted]);

  // ---------- arena controller ----------
  function runArena(now, dt, c) {
    const a = arena.current;
    const W = MAP_W, H = MAP_H;
    // active action?
    if (a.action) {
      const meta = A[a.action.key];
      const e = (now - a.action.start) / 1000 * c.speed;
      let p = Math.min(1, e / meta.dur);
      if (p >= 1 && a.action.hold) p = 1;          // stay (death/sit) until move
      else if (p >= 1 && !a.action.hold) { a.action = null; }
      if (a.action) {
        applyPose(a.action.key, p, a.facing);
        setNP(a.action.key);
        // trigger action hit once at mid animation
        const hitTime = 0.45;
        if (!a.action.hitApplied && p >= hitTime) {
          a.action.hitApplied = true;
          processActionHit(a.action.key);
        }
        return;
      }
    }
    // movement
    const k = a.keys;
    let mx = 0, my = 0;
    if (k.has('w') || k.has('arrowup')) my -= 1;
    if (k.has('s') || k.has('arrowdown')) my += 1;
    if (k.has('a') || k.has('arrowleft')) mx -= 1;
    if (k.has('d') || k.has('arrowright')) mx += 1;
    if (mx || my) {
      const len = Math.hypot(mx, my); mx /= len; my /= len;
      const spd = 190 * c.speed;
      const prevX = a.x;
      const prevY = a.y;
      const nextX = clamp(a.x + mx * spd * dt, 0, W - 1);
      const nextY = clamp(a.y + my * spd * dt, 0, H - 1);
      if (canStandAt(nextX, nextY)) {
        a.x = nextX;
        a.y = nextY;
      } else {
        if (canStandAt(nextX, prevY)) a.x = nextX;
        if (canStandAt(prevX, nextY)) a.y = nextY;
      }
      a.facing = dirFromVec(mx, my);
      if (!a.moving) { a.moving = true; a.walkStart = now; }
      const e = (now - a.walkStart) / 1000 * c.speed;
      applyPose('walk', (e / A.walk.dur) % 1, a.facing);
      setNP('walk');
    } else {
      a.moving = false;
      const e = (now / 1000) % A.idle.dur;
      applyPose('idle', e / A.idle.dur, a.facing);
      setNP('idle');
    }

    // ----- enemy AI + spawn -----
    const enemies = enemiesRef.current;
    for (const en of enemies.slice()) {
      if (!en) continue;
      // allow enemies with a death action to continue processing so their
      // death animation can play; otherwise skip dead ones
      if (en.hp <= 0 && !(en.action && en.action.key === 'death')) continue;
      const dx = arena.current.x - en.x;
      const dy = arena.current.y - en.y;
      const dist = Math.hypot(dx, dy);
      const dirName = dist > 0 ? dirFromVec(dx, dy) : a.facing;

      // if enemy has an action (attack pose), process it
      if (en.action) {
        const meta = A[en.action.key];
        const e = (now - en.action.start) / 1000;
        let p = Math.min(1, e / meta.dur);
        if (p >= 1 && en.action.hold) p = 1;
        else if (p >= 1 && !en.action.hold) en.action = null;
        if (en.action) {
          applyPoseToEnemy(en, en.action.key, p, dirName);
          const hitTime = 0.45;
          if (!en.action.hitApplied && p >= hitTime) {
            en.action.hitApplied = true;
            // enemy attack deals 1 damage
            damagePlayer(1);
          }
          continue;
        }
      }

      // move towards player if not too close
      const closeThreshold = 80 + (en.hitbox || 0);
      if (dist > closeThreshold) {
        const path = getEnemyPath(en, arena.current.x, arena.current.y, now);
        let moved = false;

        if (path && path.length) {
          const waypoint = path[0];
          const moveDx = waypoint.x - en.x;
          const moveDy = waypoint.y - en.y;
          const moveDist = Math.hypot(moveDx, moveDy);
          const step = en.speed * dt;
          const moveDirName = moveDist > 0 ? dirFromVec(moveDx, moveDy) : dirName;

          if (moveDist <= Math.max(4, step)) {
            en.x = waypoint.x;
            en.y = waypoint.y;
            path.shift();
            en.stuckFrames = 0;
            moved = true;
          } else {
            const nx = en.x + (moveDx / moveDist) * step;
            const ny = en.y + (moveDy / moveDist) * step;
            if (canStandAt(nx, ny)) {
              en.x = nx;
              en.y = ny;
              en.stuckFrames = 0;
              moved = true;
            } else {
              en.path = [];
              en.pathRecalcAt = now;
              en.stuckFrames = Math.min((en.stuckFrames || 0) + 1, 120);
            }
          }

          if (moved) {
            const e = ((now + en.id * 97) / 1000) % A.walk.dur;
            applyPoseToEnemy(en, 'walk', (e / A.walk.dur) % 1, moveDirName);
          }
        }

        if (!moved) {
          const step = pickEnemyChaseStep(en, arena.current.x, arena.current.y, dt);
          if (step) {
            en.x = step.x;
            en.y = step.y;
            en.stuckFrames = 0;
            const e = ((now + en.id * 97) / 1000) % A.walk.dur;
            applyPoseToEnemy(en, 'walk', (e / A.walk.dur) % 1, dirName);
          } else {
            en.stuckFrames = Math.min((en.stuckFrames || 0) + 1, 120);
            const e = ((now + en.id * 53) / 1000) % A.idle.dur;
            applyPoseToEnemy(en, 'idle', e / A.idle.dur, dirName);
          }
        }
      } else {
        // in range to attack: queue attack action
        if (performance.now() >= (en.nextAttack || 0)) {
          en.nextAttack = performance.now() + 2000; // 2s enemy attack cd
          en.action = { key: 'punch', start: performance.now(), dur: A.punch.dur, hold: false, hitApplied: false };
          // pose will be applied by action handling next loop
        } else {
          // idle pose while waiting
          const e = ((now + en.id * 53) / 1000) % A.idle.dur;
          applyPoseToEnemy(en, 'idle', e / A.idle.dur, dirName);
        }
      }

      // update enemy DOM position if no pose moved it
      if (en.el && (!en.action)) {
        // applyPoseToEnemy already set transform including pose offsets
        // ensure base transform if not applied
        en.el.style.transform = en.el.style.transform || `translate3d(${en.x}px,${en.y}px,0)`;
      }
    }

    // layering: ensure characters render in front/back order by Y (lower y -> on top)
    try {
      const pz = Math.round(a.y || 0);
      if (anchorRef.current) anchorRef.current.style.zIndex = pz;
      for (const en of enemies) {
        if (en && en.el) en.el.style.zIndex = Math.round(en.y || 0);
      }
    } catch (e) { }

    // spawn control: increase max enemies with kills
    const target = 1 + Math.floor(killCountRef.current / 3);
    if (enemies.length < target && performance.now() - lastSpawnAt.current > 1500) {
      // find random allowed point near player
      let tries = 0;
      while (tries++ < 200) {
        const rx = Math.floor(Math.random() * MAP_W);
        const ry = Math.floor(Math.random() * MAP_H);
        if (canStandAt(rx, ry)) { spawnEnemyAt(rx, ry); lastSpawnAt.current = performance.now(); break; }
      }
    }
  }
  const npRef = useRef('');
  function setNP(key) {
    npRef.current = key;
  }

  // Menu focus/navigation (for gamepad)
  const [activeMenu, setActiveMenu] = useState(null); // 'start' | 'pause' | 'gameover' | null
  const [menuFocusIndex, setMenuFocusIndex] = useState(0);
  const menuFocusIndexRef = useRef(menuFocusIndex);
  const activeMenuRef = useRef(null);
  useEffect(() => { activeMenuRef.current = activeMenu; }, [activeMenu]);
  useEffect(() => { menuFocusIndexRef.current = menuFocusIndex; }, [menuFocusIndex]);
  const startBtnRef = useRef(null);
  const pauseResumeRef = useRef(null);
  const pauseRestartRef = useRef(null);
  const gameOverRestartRef = useRef(null);
  const startMusicRef = useRef(null);
  const startSfxRef = useRef(null);
  const pauseMusicRef = useRef(null);
  const pauseSfxRef = useRef(null);


  useEffect(() => {
    if (!gameStarted) setActiveMenu('start');
    else if (gameOver) setActiveMenu('gameover');
    else if (paused && showPauseMenu) setActiveMenu('pause');
    else setActiveMenu(null);
    setMenuFocusIndex(0);
    menuFocusIndexRef.current = 0;
  }, [gameStarted, gameOver, paused, showPauseMenu]);

  // Focus the appropriate button using browser default focus handling
  useEffect(() => {
    if (!activeMenu) return;
    if (activeMenu === 'start') {
      // focus first control in start menu: music slider then sfx then start
      if (menuFocusIndex === 0 && startMusicRef.current && typeof startMusicRef.current.focus === 'function') startMusicRef.current.focus();
      if (menuFocusIndex === 1 && startSfxRef.current && typeof startSfxRef.current.focus === 'function') startSfxRef.current.focus();
      if (menuFocusIndex === 2 && startBtnRef.current && typeof startBtnRef.current.focus === 'function') startBtnRef.current.focus();
    } else if (activeMenu === 'pause') {
      // focus order in pause: music, sfx, resume, restart
      if (menuFocusIndex === 0 && pauseMusicRef.current && typeof pauseMusicRef.current.focus === 'function') pauseMusicRef.current.focus();
      if (menuFocusIndex === 1 && pauseSfxRef.current && typeof pauseSfxRef.current.focus === 'function') pauseSfxRef.current.focus();
      if (menuFocusIndex === 2 && pauseResumeRef.current && typeof pauseResumeRef.current.focus === 'function') pauseResumeRef.current.focus();
      if (menuFocusIndex === 3 && pauseRestartRef.current && typeof pauseRestartRef.current.focus === 'function') pauseRestartRef.current.focus();
    } else if (activeMenu === 'gameover') {
      if (gameOverRestartRef.current && typeof gameOverRestartRef.current.focus === 'function') gameOverRestartRef.current.focus();
    }
  }, [activeMenu, menuFocusIndex]);

  // start an action on the player (used by keyboard and gamepad)
  function startAction(name, hold = false) {
    try { arena.current.keys.clear(); } catch (e) { arena.current.keys = new Set(); }
    arena.current.action = { key: name, start: performance.now(), dur: (A[name] && A[name].dur) || 1, hold, hitApplied: false };
  }

  function handlePauseRequest() {
    const now = performance.now();
    // ignore rapid toggles (debounce Start/Select bounces)
    if (now - (lastPauseToggleRef.current || 0) < 220) return;
    lastPauseToggleRef.current = now;
    if (resumingCountRef.current > 0) {
      // cancel countdown and ensure pause menu is visible
      cancelResumeCountdown();
      setShowPauseMenu(true);
      setPaused(true);
      return;
    }
    // If currently paused, start resume countdown but keep `paused` true
    // until the countdown finishes. If currently running, pause and show menu.
    setPaused(prev => {
      if (prev) {
        // paused -> request resume: start countdown, keep paused true
        initiateResume();
        return true;
      } else {
        // running -> pause and show menu
        try { arena.current.keys.clear(); } catch (e) { }
        setShowPauseMenu(true);
        return true;
      }
    });
  }

  // ---------- arena keyboard ----------
  useEffect(() => {
    const a = arena.current;
    const ACT = { j: ['punch', false], k: ['kick', false], l: ['slap', false], b: ['drink', false], x: ['death', true] };
    function down(e) {
      if (!gameStarted) return;
      if (a.dead) return;
      const key = e.key.toLowerCase();
      // allow toggling pause with 'p' even when paused
      if (key === 'p') {
        handlePauseRequest();
        return;
      }
      if (paused) return;
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        e.preventDefault();
        // moving releases a held action (revive / stand up)
        if (a.action && a.action.hold) a.action = null;
        a.keys.add(key);
        return;
      }
      if (key === 'c') { // sit, variant by facing
        const v = a.facing === 'W' || a.facing === 'NW' || a.facing === 'SW' ? 'sitLeft'
          : a.facing === 'E' || a.facing === 'NE' || a.facing === 'SE' ? 'sitRight' : 'sitFront';
        trigger(v, true); return;
      }
      if (key === 'b') {
        if (canDrinkAt(a.x, a.y) && isOffCooldown('drink')) trigger('drink', false);
        return;
      }
      if (ACT[key]) {
        const act = ACT[key][0];
        if (isOffCooldown(act)) trigger(act, ACT[key][1]);
      }
    }
    function up(e) { a.keys.delete(e.key.toLowerCase()); }
    function trigger(k, hold) {
      a.keys.clear();
      a.action = { key: k, start: performance.now(), dur: A[k].dur, hold, hitApplied: false };
    }
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); a.keys.clear(); a.action = null; };
  }, [gameStarted, paused]);

  // ---------- gamepad support ----------
  useEffect(() => {
    let rafId = 0;
    let prevButtons = [];
    let prevDpad = { up: false, down: false, left: false, right: false };
    const deadzone = 0.25;
    const volRate = 0.6; // volume change per second when held

    function poll(now) {
      const gps = navigator.getGamepads ? navigator.getGamepads() : [];
      const gp = gps[0];
      if (gp) {
        // axes: 0 = LS X (-1 left, +1 right), 1 = LS Y (-1 up, +1 down)
        const ax = gp.axes[0] || 0;
        const ay = gp.axes[1] || 0;
        // handle UI navigation when a menu is active
        const menuActive = activeMenuRef.current;
        // D-pad booleans (consider analog stick as well)
        const upBtn = !!(gp.buttons[12] && gp.buttons[12].pressed) || (ay < -deadzone);
        const downBtn = !!(gp.buttons[13] && gp.buttons[13].pressed) || (ay > deadzone);
        const leftBtn = !!(gp.buttons[14] && gp.buttons[14].pressed) || (ax < -deadzone);
        const rightBtn = !!(gp.buttons[15] && gp.buttons[15].pressed) || (ax > deadzone);

        if (menuActive) {
          // navigate menu focus on edge press
          const upEdge = upBtn && !prevDpad.up;
          const downEdge = downBtn && !prevDpad.down;
          const leftEdge = leftBtn && !prevDpad.left;
          const rightEdge = rightBtn && !prevDpad.right;
          prevDpad = { up: upBtn, down: downBtn, left: leftBtn, right: rightBtn };
          // menu lengths: start -> music,sfx,start (3); pause -> music,sfx,resume,restart (4); gameover -> restart (1)
          const len = menuActive === 'pause' ? 4 : (menuActive === 'start' ? 3 : 1);
          // Navigate focus only with up/down edges (including D-pad up/down and stick Y); ignore left/right for focus
          if (upEdge) {
            const cur = (typeof menuFocusIndexRef.current === 'number') ? menuFocusIndexRef.current : 0;
            const next = (cur - 1 + len) % len;
            setMenuFocusIndex(next);
            menuFocusIndexRef.current = next;
          }
          if (downEdge) {
            const cur = (typeof menuFocusIndexRef.current === 'number') ? menuFocusIndexRef.current : 0;
            const next = (cur + 1) % len;
            setMenuFocusIndex(next);
            menuFocusIndexRef.current = next;
          }
          // if focused element is a slider, allow continuous left/right or stick X to adjust value
          const focusedIdx = (typeof menuFocusIndexRef.current === 'number') ? menuFocusIndexRef.current : 0;
          const focusedIsStartMusic = menuActive === 'start' && focusedIdx === 0;
          const focusedIsStartSfx = menuActive === 'start' && focusedIdx === 1;
          const focusedIsPauseMusic = menuActive === 'pause' && focusedIdx === 0;
          const focusedIsPauseSfx = menuActive === 'pause' && focusedIdx === 1;
          // adjust slider by volRate per second; use frame approx 1/60s
          const frameDelta = 1 / 60;
          if (focusedIsStartMusic || focusedIsPauseMusic) {
            // right increases, left decreases; also map stick X
            const delta = (rightBtn ? 1 : 0) - (leftBtn ? 1 : 0);
            let change = 0;
            if (Math.abs(ax) > deadzone) {
              const stick = Math.max(-1, Math.min(1, ax));
              const adj = Math.abs(stick) > deadzone ? stick : 0;
              change = (delta || adj) * volRate * frameDelta;
            } else if (delta !== 0) {
              change = delta * volRate * frameDelta;
            }
            if (change !== 0) {
              const next = Math.max(0, Math.min(1, (musicVolRef.current || 0) + change));
              setMusicVol(next);
              syncAudioVolumes(next, sfxVolRef.current);
            }
          }
          if (focusedIsStartSfx || focusedIsPauseSfx) {
            const delta = (rightBtn ? 1 : 0) - (leftBtn ? 1 : 0);
            let change = 0;
            if (Math.abs(ax) > deadzone) {
              const stick = Math.max(-1, Math.min(1, ax));
              const adj = Math.abs(stick) > deadzone ? stick : 0;
              change = (delta || adj) * volRate * frameDelta;
            } else if (delta !== 0) {
              change = delta * volRate * frameDelta;
            }
            if (change !== 0) {
              const next = Math.max(0, Math.min(1, (sfxVolRef.current || 0) + change));
              setSfxVol(next);
              syncAudioVolumes(musicVolRef.current, next);
            }
          }
        } else {
          // map to WASD for gameplay when no menu active
          try { arena.current.keys.clear(); } catch (e) { arena.current.keys = new Set(); }
          if (Math.abs(ax) > deadzone) {
            if (ax < -deadzone) arena.current.keys.add('a');
            else if (ax > deadzone) arena.current.keys.add('d');
          }
          if (Math.abs(ay) > deadzone) {
            if (ay < -deadzone) arena.current.keys.add('w');
            else if (ay > deadzone) arena.current.keys.add('s');
          }
          // D-pad also maps to movement when no menu active
          if (gp.buttons[12] && gp.buttons[12].pressed) arena.current.keys.add('w');
          if (gp.buttons[13] && gp.buttons[13].pressed) arena.current.keys.add('s');
          if (gp.buttons[14] && gp.buttons[14].pressed) arena.current.keys.add('a');
          if (gp.buttons[15] && gp.buttons[15].pressed) arena.current.keys.add('d');
        }

        // button mapping (standard gamepad)
        // 0=A,1=B,2=X,3=Y,4=LB,5=RB,6=LT,7=RT,8=Back,9=Start
        const buttons = gp.buttons.map(b => (b ? (b.pressed ? 1 : 0) : 0));

        // detect button down events
        for (let i = 0; i < buttons.length; i++) {
          const prev = prevButtons[i] || 0;
          const cur = buttons[i];
          if (!prev && cur) {
            // button down
            // if a menu is active, map A/B to confirm/back
            const menuActiveNow = activeMenuRef.current;
            if (menuActiveNow) {
              if (i === 0) { // A = confirm
                const idx = (typeof menuFocusIndexRef.current === 'number') ? menuFocusIndexRef.current : 0;
                // perform action based on focused control (buttons) — sliders are adjusted by stick/dpad so A acts only on buttons
                if (menuActiveNow === 'start') {
                  if (idx === 2 && startBtnRef.current) startBtnRef.current.click();
                } else if (menuActiveNow === 'pause') {
                  if (idx === 2 && pauseResumeRef.current) pauseResumeRef.current.click();
                  if (idx === 3 && pauseRestartRef.current) pauseRestartRef.current.click();
                } else if (menuActiveNow === 'gameover') {
                  if (gameOverRestartRef.current) gameOverRestartRef.current.click();
                }
                // consume this event
                continue;
              } else if (i === 1) { // B = back / act as Resume in menus
                if (menuActiveNow === 'pause') {
                  // behave exactly like Resume: start the resume countdown
                  if (typeof initiateResume === 'function') initiateResume();
                }
                continue;
              }
            }
            switch (i) {
              case 0: // A -> punch (j)
                if (!paused && isOffCooldown('punch')) startAction('punch', false);
                break;
              case 2: // X -> kick (k)
                if (!paused && isOffCooldown('kick')) startAction('kick', false);
                break;
              case 3: // Y -> slap (l)
                if (!paused && isOffCooldown('slap')) startAction('slap', false);
                break;
              case 1: // B -> drink (b)
                if (!paused) {
                  try {
                    const a = arena.current;
                    if (a && canDrinkAt(a.x, a.y) && isOffCooldown('drink')) startAction('drink', false);
                  } catch (e) { }
                }
                break;
              case 9: // Start -> pause
                handlePauseRequest();
                break;
              case 8: // Back -> pause as well
                handlePauseRequest();
                break;
            }
          }
        }

        // volume adjustments while held
        const nowSec = performance.now() / 1000;
        // LB (4) increases music, LT (6) decreases music
        if (gp.buttons[4] && gp.buttons[4].pressed) {
          const next = Math.max(0, Math.min(1, (musicVolRef.current || 0) + volRate * (1 / 60)));
          setMusicVol(next); syncAudioVolumes(next, sfxVolRef.current);
        }
        if (gp.buttons[6] && gp.buttons[6].value > 0.2) {
          const next = Math.max(0, Math.min(1, (musicVolRef.current || 0) - volRate * gp.buttons[6].value * (1 / 60)));
          setMusicVol(next); syncAudioVolumes(next, sfxVolRef.current);
        }
        // RB (5) increases sfx, RT (7) decreases sfx
        if (gp.buttons[5] && gp.buttons[5].pressed) {
          const next = Math.max(0, Math.min(1, (sfxVolRef.current || 0) + volRate * (1 / 60)));
          setSfxVol(next); syncAudioVolumes(musicVolRef.current, next);
        }
        if (gp.buttons[7] && gp.buttons[7].value > 0.2) {
          const next = Math.max(0, Math.min(1, (sfxVolRef.current || 0) - volRate * gp.buttons[7].value * (1 / 60)));
          setSfxVol(next); syncAudioVolumes(musicVolRef.current, next);
        }

        prevButtons = buttons;
      }
      rafId = requestAnimationFrame(poll);
    }
    rafId = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(rafId);
  }, [paused]);

  const nowPerf = performance.now();
  const remSec = (k) => Math.max(0, Math.ceil(((cooldownsRef.current[k] || 0) - nowPerf) / 1000));
  const punchRem = remSec('punch'), kickRem = remSec('kick'), slapRem = remSec('slap'), drinkRem = remSec('drink');

  return (
    <React.Fragment>
      <div className="stagewrap">
        <div className={`stage${gameStarted ? '' : ' menuOpen'}`} ref={stageRef}>
          <div className="world" ref={worldRef}>
            <img className="map" src="sprites/map.png" alt="hamam map" draggable="false" />
            <div className="shadow" ref={shadowRef} />
            <div className="charAnchor" ref={anchorRef}>
              <div className="charScale" ref={scaleRef}>
                <img ref={frontRef} src="sprites/tellak_front.png" alt="tellak front" />
                <img ref={backRef} className="hide" src="sprites/tellak_back.png" alt="tellak back" />
                <div className="hitFlash" ref={flashRef} />
              </div>
              <FXLayer fxRefs={fxRefs} />
              {canDrinkAt(arena.current.x, arena.current.y) && isOffCooldown('drink') && !arena.current.dead && !(arena.current.action && arena.current.action.key === 'drinking') && (
                <div style={{
                  position: 'absolute', left: '50%', top: (MOUTH - 46) + 'px', transform: 'translateX(-50%)',
                  padding: '8px 12px', borderRadius: 8, background: 'rgba(0,0,0,0.78)', color: '#fff', fontWeight: 900, fontSize: 16,
                  pointerEvents: 'none', textShadow: '0 1px 3px rgba(0,0,0,0.85)'
                }}>drink to heal.</div>
              )}
            </div>
          </div>
          <div className="hud">
            <div className="row"><div className="label">Music</div>
              <div className="val"><input type="range" min="0" max="1" step="0.01" value={musicVol} onInput={e => { const v = parseFloat(e.target.value); setMusicVol(v); syncAudioVolumes(v, sfxVolRef.current); }} onChange={e => { const v = parseFloat(e.target.value); setMusicVol(v); syncAudioVolumes(v, sfxVolRef.current); }} /></div>
            </div>
            <div className="row"><div className="label">SFX</div>
              <div className="val"><input type="range" min="0" max="1" step="0.01" value={sfxVol} onInput={e => { const v = parseFloat(e.target.value); setSfxVol(v); syncAudioVolumes(musicVolRef.current, v); }} onChange={e => { const v = parseFloat(e.target.value); setSfxVol(v); syncAudioVolumes(musicVolRef.current, v); }} /></div>
            </div>
            {/* Punch and Kick cooldowns hidden from HUD */}
            <div className="row"><div className="label">Ottoman Slap</div><div className="val">{slapRem}s</div></div>
            <div className="row"><div className="label">Sodalı Ayran</div><div className="val">{drinkRem}s</div></div>
            <div style={{ height: 6 }} />
            <div className="row"><div className="label">Kills</div><div className="val">{uiKills}</div></div>
            <div className="row" style={{ alignItems: 'center' }}>
              <div className="label">HP</div>
              <div className="val" style={{ flex: 1 }}>
                <div style={{
                  position: 'relative',
                  height: 12,
                  borderRadius: 999,
                  overflow: 'hidden',
                  background: 'rgba(255,255,255,0.12)',
                  border: '1px solid rgba(255,255,255,0.15)'
                }}>
                  <div style={{
                    height: '100%',
                    width: `${Math.max(0, Math.min(100, (uiHP / PLAYER_MAX_HP) * 100))}%`,
                    borderRadius: 999,
                    background: uiHP > 3 ? 'linear-gradient(90deg, #38d66b, #d5ff74)' : 'linear-gradient(90deg, #ff5f5f, #ffb347)',
                    transition: 'width 120ms linear'
                  }} />
                  <div style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    color: uiHP === 5 ? 'transparent' : (uiHP > 4 ? '#111' : '#fff'),
                    background: uiHP === 5 ? 'linear-gradient(90deg, #111 0 50%, #fff 50% 100%)' : 'none',
                    WebkitBackgroundClip: uiHP === 5 ? 'text' : 'initial',
                    backgroundClip: uiHP === 5 ? 'text' : 'initial',
                    WebkitTextFillColor: uiHP === 5 ? 'transparent' : 'initial',
                    textShadow: '0 1px 2px rgba(0,0,0,0.7)'
                  }}>{uiHP}/{PLAYER_MAX_HP}</div>
                </div>
              </div>
            </div>
            <div className="row" style={{ marginTop: 6, justifyContent: 'flex-start' }}>
              <button
                className="hudPauseButton"
                onClick={handlePauseRequest}
              >
                Pause
              </button>
            </div>
            {resumingCount > 0 && (
              <div style={{ textAlign: 'left', marginTop: 6, fontSize: 13, opacity: 0.95 }}>
                Resuming..{resumingCount}
              </div>
            )}
          </div>
          {gameStarted && gameOver && (
            <div className="mainMenu">
              <div className="menuCard">
                <h1>GAME OVER!</h1>
                <div className="menuDesc">Your run has ended.</div>
                <div className="menuStats" style={{ margin: '18px 0 20px', textAlign: 'center', fontSize: 14, lineHeight: 1.7 }}>
                  <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>Kills: {uiKills}</div>
                  <div><strong>Total Damage Dealt:</strong> {totalDamageDealtRef.current}</div>
                  <div><strong>Total Damage Taken:</strong> {totalDamageTakenRef.current}</div>
                </div>
                <button
                  className="startButton restartButton"
                  ref={gameOverRestartRef}
                  onPointerDown={e => e.stopPropagation()}
                  onClick={e => {
                    e.stopPropagation();
                    restartGame();
                  }}
                >
                  Restart
                </button>
              </div>
            </div>
          )}
          {gameStarted && !gameOver && paused && showPauseMenu && (
            <div className="mainMenu">
              <div className="menuCard">
                <h1>Game Paused</h1>
                <div className="menuControls">
                  <div className="menuRow">
                    <span>Music</span>
                    <input ref={pauseMusicRef} type="range" min="0" max="1" step="0.01" value={musicVol} onInput={e => { const v = parseFloat(e.target.value); setMusicVol(v); syncAudioVolumes(v, sfxVolRef.current); }} onChange={e => { const v = parseFloat(e.target.value); setMusicVol(v); syncAudioVolumes(v, sfxVolRef.current); }} />
                  </div>
                  <div className="menuRow">
                    <span>SFX</span>
                    <input ref={pauseSfxRef} type="range" min="0" max="1" step="0.01" value={sfxVol} onInput={e => { const v = parseFloat(e.target.value); setSfxVol(v); syncAudioVolumes(musicVolRef.current, v); }} onChange={e => { const v = parseFloat(e.target.value); setSfxVol(v); syncAudioVolumes(musicVolRef.current, v); }} />
                  </div>
                </div>
                <div className="menuHelp">
                  <div><strong>WASD</strong> - Move</div>
                  <div><strong>J</strong> - Punch</div>
                  <div><strong>K</strong> - Kick</div>
                  <div><strong>L</strong> - Ottoman Slap</div>
                  <div><strong>B</strong> - Drink Sodalı Ayran</div>
                  <div><strong>P</strong> - Pause</div>
                </div>
                <div className="menuDesc">Game paused. Resume to continue your run.</div>
                <button
                  className="startButton"
                  onPointerDown={e => e.stopPropagation()}
                  ref={pauseResumeRef}
                  onClick={e => {
                    e.stopPropagation();
                    // start the resume countdown
                    initiateResume();
                  }}
                >
                  Resume
                </button>
                <button
                  className="startButton restartButton"
                  ref={pauseRestartRef}
                  onPointerDown={e => e.stopPropagation()}
                  onClick={e => {
                    e.stopPropagation();
                    restartGame();
                  }}
                >
                  Restart
                </button>
              </div>
            </div>
          )}
          {!gameStarted && (
            <div className="mainMenu">
              <div className="menuCard">
                <h1>TELLAK<br />Hamam Brawler</h1>
                <div className="menuControls">
                  <div className="menuRow">
                    <span>Music</span>
                    <input ref={startMusicRef} type="range" min="0" max="1" step="0.01" value={musicVol} onInput={e => { const v = parseFloat(e.target.value); setMusicVol(v); syncAudioVolumes(v, sfxVolRef.current); }} onChange={e => { const v = parseFloat(e.target.value); setMusicVol(v); syncAudioVolumes(v, sfxVolRef.current); }} />
                  </div>
                  <div className="menuRow">
                    <span>SFX</span>
                    <input ref={startSfxRef} type="range" min="0" max="1" step="0.01" value={sfxVol} onInput={e => { const v = parseFloat(e.target.value); setSfxVol(v); syncAudioVolumes(musicVolRef.current, v); }} onChange={e => { const v = parseFloat(e.target.value); setSfxVol(v); syncAudioVolumes(musicVolRef.current, v); }} />
                  </div>
                </div>
                <div className="menuHelp">
                  <div><strong>WASD</strong> - Move</div>
                  <div><strong>J</strong> - Punch</div>
                  <div><strong>K</strong> - Kick</div>
                  <div><strong>L</strong> - Ottoman Slap</div>
                  <div><strong>B</strong> - Drink Sodalı Ayran</div>
                  <div><strong>P</strong> - Pause</div>
                </div>
                <div className="menuDesc">Punch deals 1 damage with a 1s cooldown. Kick deals 2 damage with a 2s cooldown. Ottoman Slap deals 3 damage with a 10s cooldown, hits all enemies in range, and has a 25% chance to instantly kill. Drinking Sodalı Ayran fully restores HP and has a 30s cooldown.</div>
                <button
                  className="startButton"
                  onPointerDown={e => e.stopPropagation()}
                  ref={startBtnRef}
                  onClick={e => {
                    e.stopPropagation();
                    setGameStarted(true);
                    setPaused(false);
                  }}
                >
                  Start Game
                </button>
              </div>
            </div>
          )}
          {/* Mobile controls (visible only on touch devices) */}
          {showMobileControls && gameStarted && !paused && !gameOver && (
            <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none' }}>
              <div
                ref={joystickRef}
                onPointerDown={onJoystickPointerDown}
                onPointerMove={onJoystickPointerMove}
                onPointerUp={onJoystickPointerUp}
                onPointerCancel={onJoystickPointerUp}
                style={{
                  position: 'absolute', left: 18, bottom: 18,
                  width: 128, height: 128, borderRadius: 999, background: 'rgba(0,0,0,0.36)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'auto', touchAction: 'none', boxShadow: '0 6px 18px rgba(0,0,0,0.4)'
                }}
              >
                <div ref={joystickKnobRef} style={{ width: 64, height: 64, borderRadius: 999, background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.12)', boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.25)' }} />
              </div>
              <div style={{ position: 'absolute', right: 18, bottom: 18, width: 220, height: 220, pointerEvents: 'auto' }}>
                <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                  {/* Top - Slap (Y) */}
                  <button onPointerDown={e => { e.stopPropagation(); e.preventDefault(); mobileAction('slap'); }} style={{ position: 'absolute', left: '50%', top: 12, transform: 'translateX(-50%)', width: 72, height: 72, borderRadius: 999, background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(0,0,0,0.12)', fontWeight: 700 }}>Slap</button>
                  {/* Left - Kick (X) */}
                  <button onPointerDown={e => { e.stopPropagation(); e.preventDefault(); mobileAction('kick'); }} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 72, height: 72, borderRadius: 999, background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(0,0,0,0.12)', fontWeight: 700 }}>Kick</button>
                  {/* Right - Drink (B) */}
                  <button onPointerDown={e => { e.stopPropagation(); e.preventDefault(); mobileAction('drink'); }} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', width: 72, height: 72, borderRadius: 999, background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(0,0,0,0.12)', fontWeight: 700 }}>Drink</button>
                  {/* Bottom - Punch (A) */}
                  <button onPointerDown={e => { e.stopPropagation(); e.preventDefault(); mobileAction('punch'); }} style={{ position: 'absolute', left: '50%', bottom: 12, transform: 'translateX(-50%)', width: 72, height: 72, borderRadius: 999, background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(0,0,0,0.12)', fontWeight: 700 }}>Punch</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </React.Fragment>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
