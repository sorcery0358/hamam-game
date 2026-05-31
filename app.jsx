const { useState, useRef, useEffect } = React;
const { A, DIRS, clamp, dirFromVec } = window.TELLAK;

const MAP_W = 2754;
const MAP_H = 1536;
const PLAYER_START_X = MAP_W * 0.76;
const PLAYER_START_Y = MAP_H * 0.62;
const ZONE_GREEN = [126, 196, 0];
const ZONE_PINK = [207, 18, 120];
const ZONE_TOL = 70;

const PLAYER_MAX_HP = 10;
const ENEMY_MAX_HP = 5;

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
  const zoneMask = useRef({ ready: false, w: MAP_W, h: MAP_H, cells: null });
  // gameplay refs/state
  const playerHPRef = useRef(PLAYER_MAX_HP);
  const [uiHP, setUiHP] = useState(PLAYER_MAX_HP);
  const killCountRef = useRef(0);
  const [uiKills, setUiKills] = useState(0);
  const cooldownsRef = useRef({ punch: 0, kick: 0, slap: 0, drink: 0 });
  const enemiesRef = useRef([]);
  const enemyId = useRef(1);
  const lastSpawnAt = useRef(0);
  const [tick, setTick] = useState(0); // forces HUD updates

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
        <img src="sprites/tellak_front.png" />
        <img class="hide" src="sprites/tellak_back.png" />
        <div class="hitFlash"></div>
      </div>`;
    world.appendChild(el);
    const enemy = {
      id,
      x: x || (PLAYER_START_X + (Math.random() - 0.5) * 300),
      y: y || (PLAYER_START_Y + (Math.random() - 0.5) * 300),
      hp: ENEMY_MAX_HP,
      el,
      nextAttack: 0,
      speed: 120 + Math.random() * 40,
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

  function damageEnemy(enemy, amount) {
    if (!enemy) return false;
    enemy.hp -= amount;
    if (enemy.hp <= 0) {
      // death
      removeEnemy(enemy);
      killCountRef.current += 1;
      setUiKills(killCountRef.current);
      return true;
    }
    return false;
  }

  function damagePlayer(amount) {
    playerHPRef.current = Math.max(0, playerHPRef.current - amount);
    setUiHP(playerHPRef.current);
    if (playerHPRef.current <= 0) {
      // death: trigger death action
      arena.current.action = { key: 'death', start: performance.now(), dur: A.death.dur, hold: true };
    }
  }

  function healPlayerFull() {
    playerHPRef.current = PLAYER_MAX_HP;
    setUiHP(playerHPRef.current);
  }

  function processActionHit(key) {
    const now = performance.now();
    if (key === 'drink') {
      // heal and cooldown 60s
      if (!isOffCooldown('drink')) return;
      healPlayerFull();
      setCooldown('drink', 60 * 1000);
      return;
    }
    // attack types
    const ranges = { punch: 120, kick: 140, slap: 160 };
    const damages = { punch: 1, kick: 2, slap: 3 };
    const cds = { punch: 1000, kick: 2000, slap: 10000 };
    if (!isOffCooldown(key)) return;
    // find nearest enemy in range
    let target = null;
    let bestDist = 1e9;
    for (const e of enemiesRef.current) {
      const dx = e.x - arena.current.x, dy = e.y - arena.current.y;
      const d = Math.hypot(dx, dy);
      if (d <= ranges[key] && d < bestDist) { bestDist = d; target = e; }
    }
    if (!target) {
      setCooldown(key, cds[key]);
      return;
    }
    // slap has 25% instant kill
    if (key === 'slap') {
      if (Math.random() < 0.25) {
        damageEnemy(target, 999);
      } else damageEnemy(target, damages[key]);
    } else {
      damageEnemy(target, damages[key]);
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

  function setFX(ref, v, x, y, txf, maxOp = 1) {
    if (!ref.current) return;
    v = v || 0;
    ref.current.style.opacity = Math.min(v, maxOp);
    ref.current.style.left = x + 'px';
    ref.current.style.top = y + 'px';
    if (txf) ref.current.style.transform = txf(v);
  }

  // ---------- main rAF loop ----------
  useEffect(() => {
    let raf;
    const onResize = () => updateWorldLayout();
    updateWorldLayout();
    loadZoneMask();
    if (arena.current.x === 0 && arena.current.y === 0) {
      arena.current.x = PLAYER_START_X;
      arena.current.y = PLAYER_START_Y;
    }

    let last = performance.now();
    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const c = cfg.current;
      runArena(now, dt, c);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    // initial enemy spawn and HUD tick
    try { spawnEnemyAt(); lastSpawnAt.current = performance.now(); } catch (e) { }
    const tickInterval = setInterval(() => setTick(t => t + 1), 400);
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(tickInterval);
      window.removeEventListener('resize', onResize);
    };
    // eslint-disable-next-line
  }, []);

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
      if (!en || en.hp <= 0) continue;
      const dx = arena.current.x - en.x;
      const dy = arena.current.y - en.y;
      const dist = Math.hypot(dx, dy);
      // move towards player if not too close
      if (dist > 80) {
        const nx = en.x + (dx / dist) * en.speed * dt;
        const ny = en.y + (dy / dist) * en.speed * dt;
        // keep on allowed zones if possible
        if (canStandAt(nx, ny)) { en.x = nx; en.y = ny; }
      } else {
        // in range to attack
        if (performance.now() >= (en.nextAttack || 0)) {
          en.nextAttack = performance.now() + 2000; // 2s enemy attack cd
          damagePlayer(1);
        }
      }
      // update enemy DOM
      if (en.el) {
        const elScale = en.el.querySelector('.charScale');
        if (elScale) elScale.style.transform = `translate(-50%,-100%) scale(1,1)`;
        en.el.style.transform = `translate3d(${en.x}px,${en.y}px,0)`;
      }
    }

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

  // ---------- arena keyboard ----------
  useEffect(() => {
    const a = arena.current;
    const ACT = { j: ['punch', false], k: ['kick', false], l: ['slap', false], b: ['drink', false], x: ['death', true] };
    function down(e) {
      const key = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) {
        e.preventDefault();
        if (key === ' ') { if (isOffCooldown('punch')) trigger('punch', false); return; }
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
  }, []);

  const nowPerf = performance.now();
  const remSec = (k) => Math.max(0, Math.ceil(((cooldownsRef.current[k] || 0) - nowPerf) / 1000));
  const punchRem = remSec('punch'), kickRem = remSec('kick'), slapRem = remSec('slap'), drinkRem = remSec('drink');

  return (
    <React.Fragment>
      <div className="stagewrap">
        <div className="stage" ref={stageRef}>
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
            </div>
          </div>
          <div className="hud">
            <div className="row"><div className="label">HP</div><div className="val">{uiHP}/{PLAYER_MAX_HP}</div></div>
            <div className="row"><div className="label">Kills</div><div className="val">{uiKills}</div></div>
            <div style={{ height: 6 }} />
            <div className="row"><div className="label">Punch</div><div className="val">{punchRem}s</div></div>
            <div className="row"><div className="label">Kick</div><div className="val">{kickRem}s</div></div>
            <div className="row"><div className="label">Slap</div><div className="val">{slapRem}s</div></div>
            <div className="row"><div className="label">Drink</div><div className="val">{drinkRem}s</div></div>
          </div>
        </div>
      </div>
    </React.Fragment>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
