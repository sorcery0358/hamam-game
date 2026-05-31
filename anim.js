/* ============================================================
   TELLAK ANIMATION ENGINE
   Procedural, frame-based sprite animation for a top-down brawler.
   Each animation is a pure function of phase p (0..1) + a direction
   descriptor. It returns a POSE describing how to transform the
   sprite this frame plus which arcade FX are firing.
   ============================================================ */
(function () {
  // ---- easing helpers ----
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const easeIn = t => t * t * t;
  const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  // map a value t in [a,b] -> [0,1], clamped
  const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
  const PI = Math.PI;

  // default pose
  function pose() {
    return {
      dx: 0, dy: 0, rot: 0, sx: 1, sy: 1,
      sprite: null, flip: null, // null => use direction default
      fx: {}                    // spark, streak, dust, stars, glass, foam, slap, shake, ko, sweat
    };
  }

  /* ------------------------------------------------------------
     DIRECTION TABLE  (top-down 8-way)
     vec is screen-space [x,y] (y down). sprite/flip chosen so the
     character reads as facing that way using only front/back art.
     ------------------------------------------------------------ */
  const DIRS = {
    S: { vec: [0, 1], sprite: 'front', flip: false, label: '↓' },
    SE: { vec: [0.7, 0.7], sprite: 'front', flip: false, label: '↘' },
    E: { vec: [1, 0], sprite: 'front', flip: false, label: '→' },
    NE: { vec: [0.7, -0.7], sprite: 'back', flip: false, label: '↗' },
    N: { vec: [0, -1], sprite: 'back', flip: false, label: '↑' },
    NW: { vec: [-0.7, -0.7], sprite: 'back', flip: true, label: '↖' },
    W: { vec: [-1, 0], sprite: 'front', flip: true, label: '←' },
    SW: { vec: [-0.7, 0.7], sprite: 'front', flip: true, label: '↙' },
  };
  function dirFromVec(vx, vy) {
    if (vx === 0 && vy === 0) return 'S';
    const ang = Math.atan2(vy, vx); // 0 = east, +down
    const deg = (ang * 180 / PI + 360) % 360;
    const names = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
    const idx = Math.round(deg / 45) % 8;
    return names[idx];
  }

  /* ------------------------------------------------------------
     ANIMATIONS
     fn(p, d) where d = DIRS entry. Returns a pose.
     ------------------------------------------------------------ */
  const A = {};

  // IDLE — heavy breathing, subtle weight shift
  A.idle = {
    dur: 2.4, loop: true, oneShot: false, dirable: false, forceSprite: 'front',
    fn(p) {
      const o = pose();
      const b = Math.sin(p * 2 * PI);
      o.sy = 1 + 0.018 * b;          // chest rise
      o.sx = 1 - 0.012 * b;
      o.dy = -2 - 1.5 * (b * 0.5 + 0.5);
      o.rot = 0.6 * Math.sin(p * 2 * PI + 0.6);
      return o;
    }
  };

  // WALK — 3-frame feel: contact / passing / contact, with body bob
  A.walk = {
    dur: 0.62, loop: true, oneShot: false, dirable: true,
    fn(p, d) {
      const o = pose();
      const step = Math.sin(p * 2 * PI);       // sway
      const bob = Math.abs(Math.sin(p * 2 * PI)); // two footfalls / cycle
      o.dy = -10 * bob;                         // up-down bob
      o.rot = 3.2 * step;                       // shoulder sway
      o.sx = 1 + 0.03 * (1 - bob);              // squash on contact
      o.sy = 1 - 0.05 * (1 - bob) + 0.04 * bob;
      // tiny lateral shift opposite to lead foot
      o.dx = 4 * step * (d.flip ? -1 : 1);
      o.fx = { dust: bob < 0.12 ? 0.5 : 0 };    // little kick of dust at contact
      return o;
    }
  };

  // PUNCH — wind-up, extend, recover. Lunge along facing vector.
  A.punch = {
    dur: 0.46, loop: false, oneShot: true, dirable: true,
    fn(p, d) {
      const o = pose(); const [vx, vy] = d.vec;
      if (p < 0.30) { // wind up
        const t = easeOut(seg(p, 0, 0.30));
        o.dx = -vx * 16 * t; o.dy = -vy * 10 * t;
        o.rot = (d.flip ? 6 : -6) * t;
        o.sx = 1 + 0.06 * t; o.sy = 1 - 0.04 * t;
      } else if (p < 0.52) { // strike
        const t = easeOut(seg(p, 0.30, 0.52));
        o.dx = vx * 30 * t; o.dy = vy * 18 * t - 4 * Math.sin(t * PI);
        o.rot = (d.flip ? -8 : 8) * t;
        o.sx = 1 + 0.10 * t; o.sy = 1 - 0.06 * t;
        o.fx = { spark: Math.sin(seg(p, 0.30, 0.52) * PI), streak: t * 0.8, shake: t * 0.5 };
      } else { // recover
        const t = easeInOut(seg(p, 0.52, 1));
        o.dx = lerp(vx * 30, 0, t); o.dy = lerp(vy * 18, 0, t);
        o.rot = lerp(d.flip ? -8 : 8, 0, t);
        o.sx = lerp(1.10, 1, t); o.sy = lerp(0.94, 1, t);
      }
      return o;
    }
  };

  // KICK — bigger lean-back load then thrust. Lower impact point.
  A.kick = {
    dur: 0.56, loop: false, oneShot: true, dirable: true,
    fn(p, d) {
      const o = pose(); const [vx, vy] = d.vec;
      if (p < 0.34) { // cock back
        const t = easeOut(seg(p, 0, 0.34));
        o.dx = -vx * 14 * t; o.dy = -vy * 8 * t - 6 * t;
        o.rot = (d.flip ? 10 : -10) * t;
        o.sy = 1 + 0.06 * t; o.sx = 1 - 0.03 * t;
      } else if (p < 0.56) { // thrust
        const t = easeOut(seg(p, 0.34, 0.56));
        o.dx = vx * 40 * t; o.dy = vy * 22 * t + 2;
        o.rot = (d.flip ? -14 : 14) * t;
        o.sx = 1 + 0.14 * t; o.sy = 1 - 0.10 * t;
        o.fx = { spark: Math.sin(seg(p, 0.34, 0.56) * PI), streak: t, shake: t * 0.7, low: 1 };
      } else { // recover
        const t = easeInOut(seg(p, 0.56, 1));
        o.dx = lerp(vx * 40, 0, t); o.dy = lerp(vy * 22 + 2, 0, t);
        o.rot = lerp(d.flip ? -14 : 14, 0, t);
        o.sx = lerp(1.14, 1, t); o.sy = lerp(0.90, 1, t);
      }
      return o;
    }
  };

  // OTTOMAN SLAP — huge anticipation, sweeping arc, massive impact + shake
  A.slap = {
    dur: 0.78, loop: false, oneShot: true, dirable: true,
    fn(p, d) {
      const o = pose(); const [vx, vy] = d.vec;
      if (p < 0.42) { // coil like a spring, hand way back
        const t = easeOut(seg(p, 0, 0.42));
        o.dx = -vx * 20 * t; o.dy = -vy * 12 * t - 4 * t;
        o.rot = (d.flip ? 16 : -16) * t;
        o.sx = 1 - 0.05 * t; o.sy = 1 + 0.07 * t;
        o.fx = { sweat: t };
      } else if (p < 0.60) { // wide forward swing
        const t = easeOut(seg(p, 0.42, 0.60));
        o.dx = lerp(-vx * 20, vx * 34, t); o.dy = lerp(-vy * 12, vy * 20, t);
        o.rot = lerp(d.flip ? 16 : -16, d.flip ? -22 : 22, t);
        o.sx = 1 + 0.16 * t; o.sy = 1 - 0.10 * t;
        o.fx = { slap: t * 0.9, streak: t };
      } else if (p < 0.72) { // full impact
        const t = seg(p, 0.60, 0.72);
        o.dx = vx * 34; o.dy = vy * 20;
        o.rot = (d.flip ? -22 : 22) * (1 - 0.1 * t);
        o.sx = 1.16; o.sy = 0.90;
        o.fx = { slap: 1, spark: Math.sin(t * PI), shake: 1, burst: Math.sin(t * PI) };
      } else { // recover
        const t = easeInOut(seg(p, 0.72, 1));
        o.dx = lerp(vx * 34, 0, t); o.dy = lerp(vy * 20, 0, t);
        o.rot = lerp(d.flip ? -22 : 22, 0, t);
        o.sx = lerp(1.16, 1, t); o.sy = lerp(0.90, 1, t);
      }
      return o;
    }
  };

  // DRINK — front view, raise glass, tilt head back, lower with foam
  A.drink = {
    dur: 1.8, loop: false, oneShot: true, dirable: false, forceSprite: 'front', forceFlip: false,
    fn(p) {
      const o = pose();
      // glass.y: 0 = hand low, 1 = at lips ; glass.tilt drinking
      let gy = 0, tilt = 0, fill = 1, head = 0;
      if (p < 0.25) { gy = easeOut(seg(p, 0, 0.25)); }
      else if (p < 0.68) { gy = 1; tilt = Math.sin(seg(p, 0.25, 0.68) * PI); head = Math.sin(seg(p, 0.25, 0.68) * PI); fill = 1 - seg(p, 0.28, 0.66); }
      else { gy = 1 - easeIn(seg(p, 0.68, 1)); fill = 0.05; }
      o.rot = -3 * head;            // lean head/torso back while drinking
      o.dy = -3 * head;
      o.sy = 1 + 0.02 * head;
      o.fx = { glass: { y: gy, tilt, fill }, foam: p > 0.7 ? clamp((p - 0.7) / 0.15, 0, 1) : 0 };
      return o;
    }
  };

  // DEATH — stagger, collapse backward, lie flat with stars
  A.death = {
    dur: 1.5, loop: false, oneShot: true, dirable: false, forceSprite: 'front', forceFlip: false,
    fn(p) {
      const o = pose();
      if (p < 0.22) { // hit reaction, head snaps back, stagger
        const t = seg(p, 0, 0.22);
        o.rot = -10 * Math.sin(t * PI);
        o.dx = -10 * t; o.dy = -6 * Math.sin(t * PI);
        o.sx = 1 + 0.05 * Math.sin(t * PI);
        o.fx = { hit: Math.sin(t * PI), shake: 0.8 * (1 - t), stars: 0 };
      } else if (p < 0.6) { // collapse backward
        const t = easeIn(seg(p, 0.22, 0.6));
        o.rot = lerp(-10, -78, t);
        o.dy = lerp(-2, 46, easeIn(t));      // fall to ground
        o.dx = lerp(-10, -26, t);
        o.sx = lerp(1.05, 1.1, t); o.sy = lerp(1, 0.9, t);
      } else { // lie flat, motionless, stars
        const t = seg(p, 0.6, 1);
        o.rot = -82; o.dx = -26; o.dy = 46;
        o.sx = 1.12; o.sy = 0.86;
        o.fx = { dust: t < 0.25 ? (1 - t / 0.25) : 0, stars: clamp((t - 0.1) / 0.3, 0, 1), ko: 1 };
      }
      return o;
    }
  };

  // SIT — shared collapse-to-seated; variant picks sprite + a lean
  function makeSit(forceSprite, forceFlip, leanRot) {
    return {
      dur: 1.0, loop: false, oneShot: true, dirable: false, forceSprite, forceFlip,
      fn(p) {
        const o = pose();
        let down;
        if (p < 0.4) down = easeInOut(seg(p, 0, 0.4)) * 0.55;       // bend knees
        else if (p < 0.7) down = lerp(0.55, 1, easeOut(seg(p, 0.4, 0.7))); // settle
        else down = 1 - 0.03 * Math.sin(seg(p, 0.7, 1) * PI * 2);   // relaxed idle
        o.dy = 40 * down;                  // lower body
        o.sy = 1 - 0.20 * down;            // compress (legs fold)
        o.sx = 1 + 0.08 * down;            // widen base
        o.rot = leanRot * down;
        o.dx = (leanRot ? Math.sign(leanRot) * -6 : 0) * down;
        return o;
      }
    };
  }
  A.sitFront = makeSit('front', false, 0);
  A.sitRight = makeSit('front', false, 8);
  A.sitLeft = makeSit('front', true, -8);

  window.TELLAK = { A, DIRS, dirFromVec, clamp, lerp };
})();
