const { useState, useRef, useEffect } = React;
const { A, DIRS, clamp, dirFromVec } = window.TELLAK;

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

  // config mirror for the rAF loop (avoids stale closures)
  const cfg = useRef({ speed });
  cfg.current = { speed };

  // arena state
  const arena = useRef({
    x: 0, y: 0, facing: 'S', keys: new Set(),
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
    const W0 = () => worldRef.current ? worldRef.current.clientWidth : 800;
    const H0 = () => worldRef.current ? worldRef.current.clientHeight : 540;
    // init arena pos
    arena.current.x = W0() / 2; arena.current.y = H0() * 0.62;

    let last = performance.now();
    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const c = cfg.current;
      runArena(now, dt, c);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line
  }, []);

  // ---------- arena controller ----------
  function runArena(now, dt, c) {
    const a = arena.current;
    const W = worldRef.current.clientWidth, H = worldRef.current.clientHeight;
    // active action?
    if (a.action) {
      const meta = A[a.action.key];
      const e = (now - a.action.start) / 1000 * c.speed;
      let p = Math.min(1, e / meta.dur);
      if (p >= 1 && a.action.hold) p = 1;          // stay (death/sit) until move
      else if (p >= 1 && !a.action.hold) { a.action = null; }
      if (a.action) { applyPose(a.action.key, p, a.facing); setNP(a.action.key); return; }
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
      a.x = clamp(a.x + mx * spd * dt, 70, W - 70);
      a.y = clamp(a.y + my * spd * dt, 120, H - 36);
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
        if (key === ' ') { trigger('punch', false); return; }
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
      if (ACT[key]) { trigger(ACT[key][0], ACT[key][1]); }
    }
    function up(e) { a.keys.delete(e.key.toLowerCase()); }
    function trigger(k, hold) {
      a.keys.clear();
      a.action = { key: k, start: performance.now(), dur: A[k].dur, hold };
    }
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); a.keys.clear(); a.action = null; };
  }, []);

  return (
    <React.Fragment>
      <div className="stagewrap">
        <div className="stage arena" ref={stageRef}>
          <div className="world" ref={worldRef}>
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
        </div>
      </div>
    </React.Fragment>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
