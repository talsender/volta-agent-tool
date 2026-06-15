// sim.js — VoltaSim: 3D house simulation (Three.js global build).
// Decoupled from the wizard: consumes a simState from buildSimState().
const VoltaSim = (() => {
  'use strict';

  function available() { return typeof THREE !== 'undefined'; }

  const MAT_COLOR = {
    flat: 0x3b4d63, pitched: 0x8a3b2e, pergola: 0x7a5a30,
    insulated: 0x53627a, corrugated: 0x566274, light: 0xff5d6c,
  };

  function mount(canvas, opts) {
    if (!available()) return null;
    opts = opts || {};
    const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
    camera.position.set(15, 13, 17);

    const ambient = new THREE.AmbientLight(0x2a3e58, 1.15);
    scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xfff1d4, 1.6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 120;
    sun.shadow.camera.left = -30; sun.shadow.camera.right = 30;
    sun.shadow.camera.top = 30; sun.shadow.camera.bottom = -30;
    scene.add(sun); scene.add(sun.target);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(44, 48),
      new THREE.MeshStandardMaterial({ color: 0x09121f, roughness: 1, metalness: 0 })
    );
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
    scene.add(ground);
    const grid = new THREE.GridHelper(70, 35, 0x2f6d8b, 0x14304a);
    grid.material.opacity = 0.22; grid.material.transparent = true;
    scene.add(grid);

    let dynamic = new THREE.Group(); scene.add(dynamic);

    let controls = null;
    if (opts.interactive && THREE.OrbitControls) {
      controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.target.set(0, 2.5, 0);
      controls.minDistance = 9; controls.maxDistance = 46;
      controls.maxPolarAngle = Math.PI * 0.49;
    } else {
      camera.lookAt(0, 2.5, 0);
    }

    function resize() {
      const w = canvas.clientWidth || 300, h = canvas.clientHeight || 300;
      renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();
    }
    resize();
    const ro = (typeof ResizeObserver !== 'undefined') ? new ResizeObserver(resize) : null;
    if (ro) ro.observe(canvas);

    let raf = 0, spin = 0, active = true;
    function loop() {
      if (!active) { raf = 0; return; }
      if (controls) controls.update();
      else { spin += 0.0032; camera.position.set(Math.sin(spin) * 22, 13, Math.cos(spin) * 22); camera.lookAt(0, 2.5, 0); }
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);

    // Pause/resume the render loop (so a hidden mini-preview costs no GPU).
    function setActive(on) {
      if (on) { if (!active) { active = true; if (!raf) raf = requestAnimationFrame(loop); } }
      else { active = false; }
    }

    function clearDynamic() {
      scene.remove(dynamic);
      dynamic.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) { Array.isArray(o.material) ? o.material.forEach(m => m.dispose()) : o.material.dispose(); }
      });
      dynamic = new THREE.Group(); scene.add(dynamic);
    }

    function update(simState) {
      clearDynamic();
      if (!simState) return;
      buildHouse(dynamic, simState);
      buildObstacles(dynamic, simState);
      const d = simState.sun.dir;
      sun.position.set(d.x * 40, Math.max(8, d.y * 40), d.z * 40);
      sun.target.position.set(0, 0, 0);
      sun.target.updateMatrixWorld();
    }

    function dispose() {
      cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
      if (controls) controls.dispose();
      clearDynamic();
      renderer.dispose();
    }

    return { update: update, dispose: dispose, resize: resize, setActive: setActive };
  }

  // ---- geometry builders (module-private) ----
  function buildHouse(group, s) {
    const side = s.house.footprint;       // width (x)
    const depth = side * 0.7;             // z
    const storyH = 3;
    const wallH = storyH * s.house.stories;

    const wallMat = new THREE.MeshStandardMaterial({ color: 0x223247, roughness: 0.9, metalness: 0.05 });
    const walls = new THREE.Mesh(new THREE.BoxGeometry(side, wallH, depth), wallMat);
    walls.position.y = wallH / 2;
    walls.castShadow = true; walls.receiveShadow = true;
    group.add(walls);

    // roof parts laid along X, widths proportional to areaShare, total = side
    const parts = s.parts.length ? s.parts : [{ geometry: 'flat', areaShare: 1, id: '_', size: 0 }];
    let x = -side / 2;
    parts.forEach(part => {
      const w = side * (part.areaShare || (1 / parts.length));
      makeRoofPart(group, part.geometry, x + w / 2, Math.max(0.5, w - 0.1), depth, wallH);
      x += w;
    });
  }

  // dispatch per material geometry
  function makeRoofPart(group, geometry, cx, w, depth, baseY) {
    if (geometry === 'pitched') return makePitched(group, cx, w, depth, baseY);
    if (geometry === 'pergola') return makePergola(group, cx, w, depth, baseY);
    if (geometry === 'corrugated') return makeCorrugated(group, cx, w, depth, baseY);
    if (geometry === 'light') return makeSlab(group, cx, w, depth, baseY, MAT_COLOR.light, false);
    // flat (concrete) and insulated → metallic slab with panels
    const metal = geometry === 'insulated' ? 0.55 : 0.15;
    return makeSlab(group, cx, w, depth, baseY, MAT_COLOR[geometry] || MAT_COLOR.flat, true, metal);
  }

  function makeSlab(group, cx, w, depth, baseY, color, panels, metalness) {
    const t = 0.35;
    const mat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.7, metalness: (metalness == null ? 0.15 : metalness) });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(w, t, depth), mat);
    slab.position.set(cx, baseY + t / 2, 0);
    slab.castShadow = true; slab.receiveShadow = true;
    group.add(slab);
    if (panels) { const g = panelGrid(w, depth); g.position.set(cx, baseY + t + 0.06, 0); group.add(g); }
  }

  // gabled tiled roof: two slopes meeting at a ridge running along z
  function makePitched(group, cx, w, depth, baseY) {
    const rh = Math.min(w, depth) * 0.42;            // ridge height
    const ang = Math.atan2(rh, w / 2);
    const slopeLen = Math.hypot(w / 2, rh);
    const mat = new THREE.MeshStandardMaterial({ color: MAT_COLOR.pitched, roughness: 0.85, metalness: 0.05 });
    [-1, 1].forEach(sgn => {
      const slope = new THREE.Mesh(new THREE.BoxGeometry(slopeLen, 0.18, depth), mat);
      slope.position.set(cx + sgn * w / 4, baseY + rh / 2, 0);
      slope.rotation.z = -sgn * ang;
      slope.castShadow = true; slope.receiveShadow = true;
      group.add(slope);
      // panels lying on the slope
      const g = panelGrid(slopeLen * 0.86, depth * 0.86);
      g.rotation.z = -sgn * ang;
      g.position.set(cx + sgn * w / 4 - sgn * Math.sin(ang) * 0.12, baseY + rh / 2 + Math.cos(ang) * 0.14, 0);
      group.add(g);
    });
    // gable end triangles (thin) for a closed look
    const triShape = new THREE.Shape();
    triShape.moveTo(-w / 2, 0); triShape.lineTo(w / 2, 0); triShape.lineTo(0, rh); triShape.closePath();
    const tri = new THREE.Mesh(new THREE.ExtrudeGeometry(triShape, { depth: 0.1, bevelEnabled: false }),
      new THREE.MeshStandardMaterial({ color: 0x2a2440, roughness: 1 }));
    tri.position.set(cx, baseY, -depth / 2); tri.castShadow = true; group.add(tri);
    const tri2 = tri.clone(); tri2.position.set(cx, baseY, depth / 2); group.add(tri2);
  }

  // open pergola: corner posts + perimeter beams + slats (alt. PV slats)
  function makePergola(group, cx, w, depth, baseY) {
    const wood = new THREE.MeshStandardMaterial({ color: MAT_COLOR.pergola, roughness: 0.9 });
    const top = baseY + 0.4;
    const post = (px, pz) => {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.4, 0.18), wood);
      p.position.set(px, baseY + 0.2, pz); p.castShadow = true; group.add(p);
    };
    post(cx - w / 2 + 0.2, -depth / 2 + 0.2); post(cx + w / 2 - 0.2, -depth / 2 + 0.2);
    post(cx - w / 2 + 0.2, depth / 2 - 0.2); post(cx + w / 2 - 0.2, depth / 2 - 0.2);
    // two beams along z
    [-1, 1].forEach(sgn => {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, depth), wood);
      beam.position.set(cx + sgn * (w / 2 - 0.2), top, 0); beam.castShadow = true; group.add(beam);
    });
    // slats across x; every other slat is a PV slat
    const pv = new THREE.MeshStandardMaterial({ color: 0x1b3a8a, emissive: 0x16306e, emissiveIntensity: 0.5, roughness: 0.35, metalness: 0.6 });
    const n = Math.max(4, Math.round(depth / 0.7));
    for (let i = 0; i < n; i++) {
      const z = -depth / 2 + 0.3 + (depth - 0.6) * (i / (n - 1));
      const slat = new THREE.Mesh(new THREE.BoxGeometry(w - 0.3, 0.07, 0.22), i % 2 ? pv : wood);
      slat.position.set(cx, top + 0.05, z); slat.castShadow = true; group.add(slat);
    }
  }

  // corrugated metal sheet: thin base + ribs running along z
  function makeCorrugated(group, cx, w, depth, baseY) {
    const mat = new THREE.MeshStandardMaterial({ color: MAT_COLOR.corrugated, roughness: 0.5, metalness: 0.7 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, depth), mat);
    base.position.set(cx, baseY + 0.06, 0); base.castShadow = true; base.receiveShadow = true; group.add(base);
    const ribs = Math.max(4, Math.round(w / 0.5));
    for (let i = 0; i < ribs; i++) {
      const rx = cx - w / 2 + (w) * ((i + 0.5) / ribs);
      const rib = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, depth, 6), mat);
      rib.rotation.x = Math.PI / 2;
      rib.position.set(rx, baseY + 0.16, 0); rib.castShadow = true; group.add(rib);
    }
    const g = panelGrid(w * 0.7, depth * 0.7); g.position.set(cx, baseY + 0.24, 0); group.add(g);
  }

  // a flat grid of PV panels centered at origin in the xz-plane (y=0)
  function panelGrid(w, depth) {
    const grp = new THREE.Group();
    const cols = Math.max(1, Math.round(w / 1.1));
    const rows = Math.max(1, Math.round(depth / 1.4));
    const pw = (w * 0.9) / cols, pd = (depth * 0.9) / rows;
    const mat = new THREE.MeshStandardMaterial({ color: 0x1b3a8a, emissive: 0x16306e, emissiveIntensity: 0.5, roughness: 0.35, metalness: 0.6 });
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const panel = new THREE.Mesh(new THREE.BoxGeometry(pw * 0.9, 0.08, pd * 0.9), mat);
        panel.position.set(-w * 0.45 + pw * (i + 0.5), 0, -depth * 0.45 + pd * (j + 0.5));
        panel.castShadow = true;
        grp.add(panel);
      }
    }
    return grp;
  }

  function buildObstacles(group, s) {
    s.obstacles.forEach(o => {
      if (o.type === 'tree') {
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 2.4, 8),
          new THREE.MeshStandardMaterial({ color: 0x3a2a18, roughness: 1 }));
        trunk.position.set(o.x, 1.2, o.z); trunk.castShadow = true; group.add(trunk);
        const crown = new THREE.Mesh(new THREE.SphereGeometry(1.8, 12, 12),
          new THREE.MeshStandardMaterial({ color: 0x1f5a30, roughness: 1 }));
        crown.position.set(o.x, 3.4, o.z); crown.castShadow = true; group.add(crown);
      } else {
        const b = new THREE.Mesh(new THREE.BoxGeometry(4, 8, 4),
          new THREE.MeshStandardMaterial({ color: 0x1a2636, roughness: 0.9 }));
        b.position.set(o.x, 4, o.z); b.castShadow = true; b.receiveShadow = true; group.add(b);
      }
    });
  }

  return { available: available, mount: mount };
})();

if (typeof window !== 'undefined') window.VoltaSim = VoltaSim;
