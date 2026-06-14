// ============================================================
// VOLTA ORBITAL — recon globe + HUD telemetry
// Pure-canvas point-cloud Earth, orbiting satellites, ground pings.
// Decorative only; does not touch app state.
// ============================================================
(() => {
  'use strict';

  const COL = {
    dot:    'rgba(120, 215, 255, ',   // base sphere points (alpha appended)
    land:   'rgba(86, 247, 214, ',    // "landmass" highlight points
    amber:  'rgba(255, 196, 90, ',    // solar/ground-station accents
    ring:   'rgba(86, 247, 214, ',    // orbit ring
    sat:    'rgba(255, 209, 106, ',   // satellites
  };

  // ---- Fibonacci sphere point cloud -------------------------
  function buildSphere(n) {
    const pts = [];
    const gold = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < n; i++) {
      const y = 1 - (i / (n - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const t = gold * i;
      // pseudo-landmass: clump highlight points via noise on lon/lat
      const lon = t, lat = Math.asin(y);
      const land = (Math.sin(lon * 1.7) * Math.cos(lat * 2.3) +
                    Math.sin(lon * 0.7 + 2.0) * 0.6) > 0.45;
      pts.push({ x: Math.cos(t) * r, y, z: Math.sin(t) * r, land });
    }
    return pts;
  }

  function initGlobe() {
    const canvas = document.getElementById('globe');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0, H = 0, R = 0, cx = 0, cy = 0;

    const pts = buildSphere(900);

    // Fixed ground site (Israel sector) + target-lock state ----
    const site = (() => {
      const lat = 0.55, lon = -0.7;           // ~31.5°N facing the viewer side
      return { x: Math.cos(lat) * Math.cos(lon), y: Math.sin(lat), z: Math.cos(lat) * Math.sin(lon) };
    })();
    let target = null;        // { name, status, t }
    let deploy = null;        // { t } satellite-launch animation
    let desiredSpin = null;   // spin angle that brings the site to front

    // Simplified Israel outline, projected onto the sphere at the site -----
    const israel = (() => {
      const DEG = Math.PI / 180;
      // [lon, lat] — recognizable silhouette (north → Eilat → Arava → north)
      const raw = [
        [35.57,33.28],[35.10,33.08],[34.95,32.82],[34.77,32.08],
        [34.57,31.67],[34.30,31.35],[34.45,30.95],[34.92,29.55],
        [35.40,31.30],[35.55,32.40],[35.68,32.90],[35.57,33.28],
      ];
      const lon0 = 35.0 * DEG, lat0 = 31.8 * DEG;
      const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
      const norm = v => { const m = Math.hypot(v[0],v[1],v[2])||1; return [v[0]/m,v[1]/m,v[2]/m]; };
      const P = [site.x, site.y, site.z];
      const east = norm(cross([0,1,0], P));
      const north = cross(P, east);                 // toward +y (north)
      const f = 2.0, asp = Math.cos(lat0);          // keep Israel's narrow aspect
      return raw.map(([lon, lat]) => {
        const du = (lon*DEG - lon0) * asp * f;
        const dv = (lat*DEG - lat0) * f;
        const v = norm([
          P[0] + east[0]*du + north[0]*dv,
          P[1] + east[1]*du + north[1]*dv,
          P[2] + east[2]*du + north[2]*dv,
        ]);
        return { x: v[0], y: v[1], z: v[2] };
      });
    })();

    const STATUS_COL = {
      yes:     'rgba(61,240,138,',
      no:      'rgba(255,93,108,',
      check:   'rgba(255,178,74,',
      unknown: 'rgba(150,180,215,',
    };
    const elHud = document.getElementById('target-hud');
    const elName = document.getElementById('th-name');
    const elCap = document.getElementById('globe-caption');

    // Ground-station pings (lat/lon-ish positions on the sphere)
    const pings = Array.from({ length: 5 }, () => ({
      a: Math.random() * Math.PI * 2,
      b: (Math.random() - 0.5) * Math.PI * 0.9,
      t: Math.random() * Math.PI * 2,
    }));

    // Orbiting satellites on tilted rings
    const sats = [
      { rad: 1.42, tilt: 0.55, speed: 0.55, phase: 0 },
      { rad: 1.62, tilt: -0.32, speed: -0.38, phase: 2.1 },
      { rad: 1.30, tilt: 0.95, speed: 0.72, phase: 4.0 },
    ];

    function resize() {
      const rect = canvas.getBoundingClientRect();
      W = Math.max(1, rect.width); H = Math.max(1, rect.height);
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cx = W / 2; cy = H / 2;
      R = Math.min(W, H) * 0.33;
    }
    resize();
    window.addEventListener('resize', resize);

    const TILT = -0.38; // fixed axial tilt (x-axis)
    function rot(p, ay) {
      // rotate around Y (spin) then X (tilt)
      const cosY = Math.cos(ay), sinY = Math.sin(ay);
      let x = p.x * cosY - p.z * sinY;
      let z = p.x * sinY + p.z * cosY;
      let y = p.y;
      const cosX = Math.cos(TILT), sinX = Math.sin(TILT);
      const y2 = y * cosX - z * sinX;
      const z2 = y * sinX + z * cosX;
      return { x, y: y2, z: z2 };
    }

    let spin = 0, last = performance.now();
    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;

      // --- spin: free-rotate, or ease the site to front when locked/deploying ---
      if (desiredSpin !== null) {
        let diff = desiredSpin - spin;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));   // wrap to [-π,π]
        spin += diff * Math.min(1, dt * 2.6);
      } else {
        spin += dt * 0.22;
      }
      if (target) target.t += dt;
      ctx.clearRect(0, 0, W, H);

      // --- atmospheric halo ---
      const halo = ctx.createRadialGradient(cx, cy, R * 0.6, cx, cy, R * 1.9);
      halo.addColorStop(0, 'rgba(70,180,220,0.10)');
      halo.addColorStop(0.55, 'rgba(60,150,210,0.05)');
      halo.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = halo;
      ctx.beginPath(); ctx.arc(cx, cy, R * 1.9, 0, Math.PI * 2); ctx.fill();

      // --- back orbit rings (behind globe) ---
      drawOrbits(sats, spin, true);

      // --- sphere point cloud ---
      for (const p of pts) {
        const r = rot(p, spin);
        const depth = (r.z + 1) / 2;            // 0 back .. 1 front
        const sx = cx + r.x * R;
        const sy = cy - r.y * R;
        const a = 0.12 + depth * depth * 0.85;
        const size = 0.5 + depth * 1.5;
        const base = p.land ? COL.land : COL.dot;
        ctx.fillStyle = base + (a).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(sx, sy, size, 0, Math.PI * 2); ctx.fill();
      }

      // --- fixed ground site marker (Israel sector) ---
      const sr = rot(site, spin);
      const siteFront = sr.z > -0.05;
      const ssx = cx + sr.x * R, ssy = cy - sr.y * R;

      // Israel coastline outline projected on the surface
      if (siteFront) {
        const colP = target ? (STATUS_COL[target.status] || STATUS_COL.unknown)
                            : 'rgba(86,247,214,';
        const depth = (sr.z + 1) / 2;
        ctx.beginPath();
        let started = false;
        for (const v of israel) {
          const r = rot(v, spin);
          const x = cx + r.x * R, y = cy - r.y * R;
          if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fillStyle = colP + (0.10 * depth).toFixed(3) + ')';
        ctx.fill();
        ctx.strokeStyle = colP + (0.55 * depth + 0.25).toFixed(3) + ')';
        ctx.lineWidth = 1.4;
        ctx.shadowColor = colP + '0.6)'; ctx.shadowBlur = 6;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      if (siteFront) {
        const pulse = (Math.sin(now / 500) + 1) / 2;
        ctx.fillStyle = 'rgba(255,196,90,0.95)';
        ctx.beginPath(); ctx.arc(ssx, ssy, 2.4, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(255,196,90,' + (0.55 * (1 - pulse)).toFixed(3) + ')';
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(ssx, ssy, 2.4 + pulse * 7, 0, Math.PI * 2); ctx.stroke();
      }

      // --- scanning latitude sweep ---
      const sweepY = Math.sin(now / 1400);
      ctx.strokeStyle = 'rgba(86,247,214,0.22)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(cx, cy - sweepY * R * 0.92, R * Math.sqrt(Math.max(0.0001, 1 - sweepY * sweepY)),
                  R * 0.16 * Math.max(0.25, Math.abs(sweepY)), 0, 0, Math.PI * 2);
      ctx.stroke();

      // --- ground-station pings ---
      for (const pg of pings) {
        pg.t += dt * 1.6;
        const base = { x: Math.cos(pg.b) * Math.cos(pg.a), y: Math.sin(pg.b), z: Math.cos(pg.b) * Math.sin(pg.a) };
        const r = rot(base, spin);
        if (r.z < -0.1) continue; // hidden behind globe
        const sx = cx + r.x * R, sy = cy - r.y * R;
        const pulse = (Math.sin(pg.t) + 1) / 2;
        ctx.fillStyle = COL.amber + (0.9).toFixed(2) + ')';
        ctx.beginPath(); ctx.arc(sx, sy, 1.8, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = COL.amber + (0.5 * (1 - pulse)).toFixed(3) + ')';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(sx, sy, 1.8 + pulse * 9, 0, Math.PI * 2); ctx.stroke();
      }

      // --- front orbit rings + satellites ---
      drawOrbits(sats, spin, false);

      // --- target-lock reticle over the ground site ---
      if (target) drawReticle(ssx, ssy, target);

      // --- satellite deployment launch ---
      if (deploy) {
        deploy.t += dt;
        drawDeploy(ssx, ssy, deploy.t);
        if (deploy.t > 2.8) {
          deploy = null;
          if (!target) { desiredSpin = null; if (elCap) elCap.textContent = 'GROUND-STATION SCAN · ISR SECTOR'; }
        }
      }

      requestAnimationFrame(frame);
    }

    function drawDeploy(sx, sy, t) {
      const col = 'rgba(61,240,138,';
      const dirx = sx - cx, diry = sy - cy;
      const len = Math.hypot(dirx, diry) || 1;
      const nx = dirx / len, ny = diry / len;
      const k = easeOut(Math.min(1, t / 1.3));
      const headD = len + k * R * 1.25;
      const hx = cx + nx * headD, hy = cy + ny * headD;

      // ascent trail
      const grad = ctx.createLinearGradient(sx, sy, hx, hy);
      grad.addColorStop(0, col + '0)');
      grad.addColorStop(1, col + (0.9 * (1 - Math.max(0, (t - 1.3) / 1.5))).toFixed(3) + ')');
      ctx.strokeStyle = grad; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(hx, hy); ctx.stroke();

      // satellite head
      if (t < 1.6) {
        ctx.fillStyle = col + '1)';
        ctx.shadowColor = col + '0.95)'; ctx.shadowBlur = 12;
        ctx.beginPath(); ctx.arc(hx, hy, 2.6, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
      }

      // ground confirmation ring
      if (t > 0.8) {
        const pp = Math.min(1, (t - 0.8) / 1.8);
        ctx.strokeStyle = col + (0.5 * (1 - pp)).toFixed(3) + ')';
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(sx, sy, pp * 46, 0, Math.PI * 2); ctx.stroke();
      }
    }

    function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

    function drawReticle(sx, sy, tg) {
      const col = STATUS_COL[tg.status] || STATUS_COL.unknown;
      const p = Math.min(1, tg.t / 0.7);          // 0→1 lock-on
      const e = easeOut(p);
      const ringR = (R * 1.25) * (1 - e) + 24 * e; // contracts onto the site
      const rot2 = tg.t * 1.4;                     // slow bracket rotation
      ctx.save();
      ctx.translate(sx, sy);

      // contracting/rotating corner brackets
      ctx.strokeStyle = col + (0.85).toFixed(2) + ')';
      ctx.lineWidth = 1.6;
      for (let i = 0; i < 4; i++) {
        const a = rot2 + i * Math.PI / 2;
        ctx.save(); ctx.rotate(a);
        ctx.beginPath();
        ctx.arc(0, 0, ringR, -0.32, 0.32);
        ctx.stroke();
        // little tick at bracket center
        ctx.beginPath();
        ctx.moveTo(ringR, 0); ctx.lineTo(ringR + 5, 0); ctx.stroke();
        ctx.restore();
      }

      // crosshair with center gap
      const reach = ringR + 12, gap = 7;
      ctx.strokeStyle = col + (0.5).toFixed(2) + ')';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(gap, 0); ctx.lineTo(reach, 0);
      ctx.moveTo(-gap, 0); ctx.lineTo(-reach, 0);
      ctx.moveTo(0, gap); ctx.lineTo(0, reach);
      ctx.moveTo(0, -gap); ctx.lineTo(0, -reach);
      ctx.stroke();

      // center lock dot
      const dotPulse = 2.6 + Math.sin(tg.t * 6) * 1.1;
      ctx.fillStyle = col + '1)';
      ctx.shadowColor = col + '0.9)'; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(0, 0, dotPulse, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;

      // post-lock expanding confirmation ping
      if (p >= 1) {
        const pp = (tg.t * 0.8) % 1;
        ctx.strokeStyle = col + (0.4 * (1 - pp)).toFixed(3) + ')';
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(0, 0, 24 + pp * 26, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    }

    // ---- public API: wire the globe to the app's settlement search ----
    window.VoltaGlobe = {
      lockTarget(name, status) {
        target = { name: name || '', status: status || 'unknown', t: 0 };
        desiredSpin = Math.PI / 2 - Math.atan2(site.z, site.x); // bring site to front
        if (elHud) { elHud.classList.add('active'); elHud.dataset.status = target.status; }
        if (elName) elName.textContent = name || '—';
        if (elCap) elCap.textContent = 'TARGET ACQUIRED · LOCKING';
      },
      release() {
        target = null;
        if (!deploy) {
          desiredSpin = null;
          if (elCap) elCap.textContent = 'GROUND-STATION SCAN · ISR SECTOR';
        }
        if (elHud) elHud.classList.remove('active');
      },
      deploy() {
        deploy = { t: 0 };
        desiredSpin = Math.PI / 2 - Math.atan2(site.z, site.x); // face the site
        if (elCap) elCap.textContent = 'SATELLITE DEPLOYED · UPLINK OK';
      },
    };

    function drawOrbits(sats, spin, back) {
      for (const s of sats) {
        s.phase += 0;
      }
      // draw ring paths once per sat
      for (const s of sats) {
        ctx.strokeStyle = COL.ring + '0.10)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i <= 64; i++) {
          const ang = (i / 64) * Math.PI * 2;
          const p = orbitPoint(s, ang, spin);
          if (back ? p.z <= 0 : p.z > 0) {
            const sx = cx + p.x * R, sy = cy - p.y * R;
            ctx.lineTo(sx, sy);
          } else { ctx.stroke(); ctx.beginPath(); }
        }
        ctx.stroke();
      }
      // satellites
      const t = performance.now() / 1000;
      for (const s of sats) {
        const ang = s.phase + t * s.speed;
        const p = orbitPoint(s, ang, spin);
        if (back ? p.z <= 0 : p.z > 0) {
          const sx = cx + p.x * R, sy = cy - p.y * R;
          const depth = (p.z + 1) / 2;
          ctx.fillStyle = COL.sat + (0.5 + depth * 0.5).toFixed(2) + ')';
          ctx.shadowColor = 'rgba(255,209,106,0.9)'; ctx.shadowBlur = 8;
          ctx.beginPath(); ctx.arc(sx, sy, 2.2, 0, Math.PI * 2); ctx.fill();
          ctx.shadowBlur = 0;
          // downlink beam to globe center-ish
          ctx.strokeStyle = COL.sat + (0.12 * depth).toFixed(3) + ')';
          ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(cx, cy); ctx.stroke();
        }
      }
    }

    function orbitPoint(s, ang, spin) {
      // circle in orbit plane, tilted, then spun a touch with globe for parallax
      let x = Math.cos(ang) * s.rad;
      let z = Math.sin(ang) * s.rad;
      let y = 0;
      // tilt around X
      const cT = Math.cos(s.tilt), sT = Math.sin(s.tilt);
      let y2 = y * cT - z * sT;
      let z2 = y * sT + z * cT;
      // global axial tilt
      const cX = Math.cos(TILT), sX = Math.sin(TILT);
      const fy = y2 * cX - z2 * sX;
      const fz = y2 * sX + z2 * cX;
      return { x, y: fy, z: fz };
    }

    requestAnimationFrame(frame);
  }

  // ---- Starfield --------------------------------------------
  function initStars() {
    const c = document.getElementById('starfield');
    if (!c) return;
    const ctx = c.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let stars = [];
    function resize() {
      c.width = window.innerWidth * dpr; c.height = window.innerHeight * dpr;
      c.style.width = window.innerWidth + 'px'; c.style.height = window.innerHeight + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round((window.innerWidth * window.innerHeight) / 9000);
      stars = Array.from({ length: n }, () => ({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        r: Math.random() * 1.2 + 0.2,
        tw: Math.random() * Math.PI * 2,
        sp: Math.random() * 1.5 + 0.4,
      }));
    }
    resize();
    window.addEventListener('resize', resize);
    function frame(now) {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      for (const s of stars) {
        const a = 0.25 + (Math.sin(now / 1000 * s.sp + s.tw) + 1) / 2 * 0.6;
        ctx.fillStyle = 'rgba(180,220,255,' + a.toFixed(2) + ')';
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  // ---- HUD telemetry ----------------------------------------
  function initHud() {
    const timeEl = document.getElementById('sys-time');
    const seqEl = document.getElementById('foot-seq');
    const fluxEl = document.getElementById('r-flux');
    let seq = 0;
    setInterval(() => {
      if (timeEl) {
        const d = new Date();
        timeEl.textContent = d.toISOString().substr(11, 8);
      }
      if (seqEl) {
        seq = (seq + 7 + Math.floor(Math.random() * 5)) & 0xffff;
        seqEl.textContent = 'SEQ 0x' + seq.toString(16).toUpperCase().padStart(4, '0');
      }
      if (fluxEl) {
        const f = 1361 + Math.round((Math.random() - 0.5) * 6);
        fluxEl.textContent = f + ' W/m²';
      }
    }, 1000);
  }

  function boot() { initStars(); initGlobe(); initHud(); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else { boot(); }
})();
