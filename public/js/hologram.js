'use strict';
// Hologram: a light column rising from the centre of the background image, a projection ring
// on the "floor" and a rotating eight-point rosette. It runs once per page load, shows the
// instruction text, then fades out and removes itself from the home screen.
(function () {
  const TOTAL = 8.2;      // seconds until the fade-out starts
  const TEXT_AT = 2.2;    // when the instruction text appears
  const FADE_MS = 1100;   // must match the CSS transition on .holo

  function play({ root, canvas, textEl, text, onDone }) {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ctx = canvas.getContext('2d');
    let w = 0, h = 0, dpr = 1, raf = 0, start = performance.now(), finished = false;

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);

    textEl.textContent = text;

    function finish() {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      root.classList.add('is-leaving');
      textEl.classList.remove('show');
      setTimeout(() => { root.remove(); onDone && onDone(); }, reduced ? 0 : FADE_MS);
    }

    if (reduced) { // static glyph, no motion
      textEl.classList.add('show');
      drawFrame(TOTAL * 0.5, 1, true);
      setTimeout(finish, 3000);
      return { skip: finish };
    }

    const easeOut = (x) => 1 - Math.pow(1 - x, 3);
    const clamp = (x) => Math.max(0, Math.min(1, x));

    function rosette(cx, cy, r, rot, tilt, alpha) {
      // eight-point star built from two squares + inner ring, flattened by `tilt` for a 3D feel
      ctx.save();
      ctx.translate(cx, cy); ctx.scale(1, tilt);
      ctx.strokeStyle = `rgba(127,227,214,${alpha})`;
      ctx.lineWidth = 1.6;
      for (let k = 0; k < 2; k++) {
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
          const a = rot + k * Math.PI / 4 + i * Math.PI / 2;
          const x = Math.cos(a) * r, y = Math.sin(a) * r;
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.closePath(); ctx.stroke();
      }
      for (const f of [1, .62, .3]) { ctx.beginPath(); ctx.arc(0, 0, r * f, 0, Math.PI * 2); ctx.stroke(); }
      ctx.restore();
    }

    function drawFrame(t, env, still) {
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2, cy = h * 0.5;
      const R = Math.min(w, h) * 0.2;
      const grow = still ? 1 : easeOut(clamp(t / 1.6));
      const flicker = still ? 1 : 0.9 + 0.1 * Math.sin(t * 31) * Math.sin(t * 7.3);
      const a = env * flicker;

      // floor projection rings
      for (let i = 0; i < 3; i++) {
        const rr = R * (0.55 + i * 0.32) * grow;
        ctx.strokeStyle = `rgba(127,227,214,${0.55 * a - i * 0.12})`;
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.ellipse(cx, cy + R * 0.9, rr * 1.5, rr * 0.38, 0, 0, Math.PI * 2); ctx.stroke();
      }

      // light column
      const colH = R * 3 * grow;
      const g = ctx.createLinearGradient(0, cy + R * 0.9, 0, cy + R * 0.9 - colH);
      g.addColorStop(0, `rgba(127,227,214,${0.34 * a})`);
      g.addColorStop(1, 'rgba(127,227,214,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(cx - R * 0.8, cy + R * 0.9); ctx.lineTo(cx + R * 0.8, cy + R * 0.9);
      ctx.lineTo(cx + R * 1.5, cy + R * 0.9 - colH); ctx.lineTo(cx - R * 1.5, cy + R * 0.9 - colH);
      ctx.closePath(); ctx.fill();

      // rosette floating in the column
      const bob = still ? 0 : Math.sin(t * 1.4) * R * 0.06;
      const rot = still ? 0.2 : t * 0.55;
      const tilt = 0.62 + (still ? 0 : 0.2 * Math.sin(t * 0.7));
      const rs = R * (0.2 + 0.8 * grow);
      ctx.shadowColor = 'rgba(127,227,214,.9)'; ctx.shadowBlur = 18;
      rosette(cx, cy - R * 0.1 + bob, rs, rot, tilt, 0.95 * a);
      rosette(cx, cy - R * 0.1 + bob, rs * 0.55, -rot * 1.6, tilt, 0.7 * a);
      ctx.shadowBlur = 0;

      // scan lines, drifting upward
      ctx.fillStyle = `rgba(127,227,214,${0.06 * a})`;
      const off = still ? 0 : (t * 26) % 5;
      for (let y = off; y < h; y += 5) ctx.fillRect(cx - R * 1.6, y, R * 3.2, 1);

      // particles
      if (!still) {
        for (let i = 0; i < 26; i++) {
          const seed = i * 97.13;
          const px = cx + Math.sin(seed) * R * 1.1 * grow;
          const py = cy + R * 0.9 - ((t * (22 + (i % 5) * 9) + seed * 13) % (R * 2.8)) * grow;
          ctx.fillStyle = `rgba(217,255,249,${0.55 * a})`;
          ctx.fillRect(px, py, 1.6, 1.6);
        }
      }
    }

    function frame(now) {
      const t = (now - start) / 1000;
      if (t > TEXT_AT) textEl.classList.add('show');
      const env = clamp(t / 0.8) * (1 - clamp((t - (TOTAL - 1)) / 1));
      drawFrame(t, env, false);
      if (t >= TOTAL) return finish();
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return { skip: finish };
  }

  window.Hologram = { play };
})();
