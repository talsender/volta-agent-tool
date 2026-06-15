// sim.js — VoltaSim: 3D house simulation (Three.js global build).
// Decoupled from the wizard: consumes a simState from buildSimState().
const VoltaSim = (() => {
  'use strict';

  function available() { return typeof THREE !== 'undefined'; }

  const MAT_COLOR = {
    flat: 0x3b4d63, pitched: 0x8a3b2e, pergola: 0x7a5a30,
    insulated: 0x53627a, corrugated: 0x566274, light: 0xff5d6c,
  };
  const PANEL_OK = new Set(['flat', 'insulated', 'corrugated', 'pergola']);

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

    // roof slabs laid along X, widths proportional to areaShare, total = side
    const slabThick = 0.35;
    const parts = s.parts.length ? s.parts : [{ geometry: 'flat', areaShare: 1, id: '_', size: 0 }];
    let x = -side / 2;
    parts.forEach(part => {
      const w = side * (part.areaShare || (1 / parts.length));
      const color = MAT_COLOR[part.geometry] || MAT_COLOR.flat;
      const slabMat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.7, metalness: 0.15 });
      const slab = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.4, w - 0.1), slabThick, depth), slabMat);
      slab.position.set(x + w / 2, wallH + slabThick / 2, 0);
      slab.castShadow = true; slab.receiveShadow = true;
      group.add(slab);

      if (PANEL_OK.has(part.geometry)) addPanels(group, x + w / 2, wallH + slabThick, w, depth, part.size);
      x += w;
    });
  }

  function addPanels(group, cx, topY, w, depth, area) {
    const cols = Math.max(1, Math.round(w / 1.1));
    const rows = Math.max(1, Math.round(depth / 1.4));
    const pw = (w * 0.82) / cols, pd = (depth * 0.82) / rows;
    const mat = new THREE.MeshStandardMaterial({ color: 0x1b3a8a, emissive: 0x16306e, emissiveIntensity: 0.5, roughness: 0.35, metalness: 0.6 });
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const panel = new THREE.Mesh(new THREE.BoxGeometry(pw * 0.92, 0.08, pd * 0.92), mat);
        panel.position.set(cx - w * 0.41 + pw * (i + 0.5), topY + 0.06, -depth * 0.41 + pd * (j + 0.5));
        panel.castShadow = true;
        group.add(panel);
      }
    }
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
