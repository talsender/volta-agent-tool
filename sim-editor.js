// sim-editor.js — full-screen shading editor. Self-contained: injects its own
// CSS + an "open" button into the 3D dock, mounts a VoltaSim, and wires the
// controls (time slider, obstacle palette, height, rotate, live metric).
const SimEditor = (() => {
  'use strict';
  let sim = null, model = null, t = 0.5, playRAF = 0, selectedId = null;

  function roofCfg() { return (typeof RoofStore !== 'undefined') ? RoofStore.get() : { materials: [] }; }
  function $(id) { return document.getElementById(id); }
  function setText(id, v) { const e = $(id); if (e) e.textContent = v; }

  // ---------- styles ----------
  function injectCSS() {
    if (document.getElementById('se-style')) return;
    const css = `
    .se-overlay{position:fixed;inset:0;z-index:300;background:#04060e;display:flex;flex-direction:column;font-family:'Rubik','Heebo',sans-serif;color:#d6e8ff;direction:rtl}
    .se-top{display:flex;align-items:center;justify-content:space-between;padding:12px 18px;border-bottom:1px solid rgba(120,220,255,.18);background:linear-gradient(180deg,rgba(13,24,46,.9),rgba(8,14,28,.6))}
    .se-title{font-family:'JetBrains Mono',monospace;letter-spacing:.08em;color:#6ff8e7;font-size:14px}
    .se-x{background:none;border:1px solid rgba(120,220,255,.28);color:#90a8cc;border-radius:8px;cursor:pointer;padding:6px 12px;font-size:14px}
    .se-stage{position:relative;flex:1;overflow:hidden}
    .se-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;cursor:grab;touch-action:none}
    .se-metric{position:absolute;top:14px;right:14px;background:rgba(8,14,28,.82);border:1px solid rgba(120,220,255,.28);border-radius:12px;padding:12px 14px;min-width:180px;backdrop-filter:blur(6px)}
    .se-m-row{display:flex;justify-content:space-between;gap:14px;font-size:12px;color:#90a8cc;margin:3px 0}
    .se-m-row b{font-family:'JetBrains Mono',monospace;color:#6ff8e7}
    .se-total{margin-top:8px;text-align:center;font-weight:700;font-size:16px;padding:8px;border-radius:8px;border:1px solid transparent}
    .se-total.ok{background:rgba(61,240,138,.12);color:#3df08a;border-color:rgba(61,240,138,.4)}
    .se-total.warn{background:rgba(255,178,74,.12);color:#ffd16a;border-color:rgba(255,178,74,.4)}
    .se-total.bad{background:rgba(255,93,108,.12);color:#ff5d6c;border-color:rgba(255,93,108,.4)}
    .se-tools{position:absolute;top:14px;left:14px;display:flex;flex-direction:column;gap:8px;width:184px}
    .se-card{background:rgba(8,14,28,.82);border:1px solid rgba(120,220,255,.24);border-radius:12px;padding:12px;backdrop-filter:blur(6px)}
    .se-card h4{font-size:12px;color:#90a8cc;margin-bottom:8px;font-weight:600}
    .se-btn{display:block;width:100%;text-align:center;padding:9px;margin-bottom:6px;border:1px solid rgba(120,220,255,.28);border-radius:8px;background:rgba(8,14,28,.6);color:#d6e8ff;cursor:pointer;font-size:13px;font-family:inherit}
    .se-btn:hover{border-color:#36e6d4;color:#6ff8e7}
    .se-btn.warn{border-color:rgba(255,93,108,.4);color:#ff5d6c}
    .se-btn:last-child{margin-bottom:0}
    .se-field{font-size:11px;color:#90a8cc;margin-top:8px}
    .se-field input[type=range]{width:100%;accent-color:#36e6d4;margin-top:4px}
    .se-bottom{display:flex;align-items:center;gap:16px;padding:12px 18px;border-top:1px solid rgba(120,220,255,.18);background:rgba(8,14,28,.7);flex-wrap:wrap}
    .se-time{flex:1;min-width:200px;display:flex;align-items:center;gap:10px}
    .se-time input[type=range]{flex:1;accent-color:#ffd16a}
    .se-clock{font-family:'JetBrains Mono',monospace;color:#ffd16a;min-width:54px;text-align:center;font-size:15px}
    .se-play{background:none;border:1px solid rgba(120,220,255,.28);color:#6ff8e7;border-radius:8px;cursor:pointer;width:36px;height:32px;font-size:14px}
    .se-orient{display:flex;align-items:center;gap:8px;font-size:12px;color:#90a8cc;min-width:200px}
    .se-orient input[type=range]{width:120px;accent-color:#36e6d4}
    .se-hint{font-family:'JetBrains Mono',monospace;font-size:10px;color:#607699;letter-spacing:.05em}
    @media(max-width:640px){.se-tools{width:150px}.se-metric{min-width:140px}}
    `;
    const st = document.createElement('style'); st.id = 'se-style'; st.textContent = css;
    document.head.appendChild(st);
  }

  // ---------- overlay DOM ----------
  function buildOverlay() {
    const el = document.createElement('div');
    el.className = 'se-overlay'; el.id = 'se-overlay';
    el.innerHTML = `
      <div class="se-top">
        <span class="se-title">⛭ עורך הצללה · סימולציית שמש</span>
        <button class="se-x" onclick="SimEditor.close()">✕ סגור</button>
      </div>
      <div class="se-stage">
        <canvas id="se-canvas" class="se-canvas"></canvas>
        <div class="se-metric">
          <div class="se-m-row"><span>חשיפת שמש</span><b id="se-exposure">—</b></div>
          <div class="se-m-row"><span>תפוקת כיוון</span><b id="se-yield">—</b></div>
          <div class="se-total ok" id="se-total">—</div>
        </div>
        <div class="se-tools">
          <div class="se-card">
            <h4>הוסף מכשול</h4>
            <button class="se-btn" onclick="SimEditor.addObstacle('tree')">🌳 עץ</button>
            <button class="se-btn" onclick="SimEditor.addObstacle('building')">🏢 מבנה שכן</button>
          </div>
          <div class="se-card" id="se-sel" style="display:none">
            <h4 id="se-sel-title">אובייקט נבחר</h4>
            <div class="se-field" id="se-height-field">גובה: <span id="se-height-val"></span> מ'
              <input type="range" min="2" max="20" step="0.5" id="se-height" oninput="SimEditor.setSelectedHeight(this.value)">
            </div>
            <button class="se-btn warn" onclick="SimEditor.deleteSelected()">🗑 מחק</button>
          </div>
          <div class="se-card">
            <button class="se-btn" onclick="SimEditor.resetLayout()">↺ אפס מיקומים</button>
          </div>
        </div>
      </div>
      <div class="se-bottom">
        <div class="se-time">
          <button class="se-play" id="se-play" onclick="SimEditor.togglePlay()">▶</button>
          <span class="se-clock" id="se-time">12:00</span>
          <input type="range" min="0" max="1" step="0.01" value="0.5" id="se-time-range" oninput="SimEditor.setTime(this.value)">
        </div>
        <div class="se-orient">כיוון בית:
          <input type="range" min="0" max="359" step="1" id="se-orient-range" oninput="SimEditor.setOrientation(this.value)">
          <span id="se-orient">180°</span>
        </div>
        <span class="se-hint">לחיצה=בחירה · גרירת אובייקט=הזזה · גרירת רקע=סיבוב</span>
      </div>`;
    document.body.appendChild(el);
    return el;
  }

  // ---------- model ----------
  function wizardInputs() {
    return (typeof Wizard !== 'undefined' && Wizard.getSimInputs)
      ? Wizard.getSimInputs()
      : { materials: [], azimuth: 180, shading: 'none', propertyType: 'private' };
  }
  function freshModel() {
    const inputs = wizardInputs();
    const base = buildSimState(inputs, roofCfg());
    return {
      base: base,
      obstacles: base.obstacles.map(o => Object.assign({}, o)),
      orientationDeg: inputs.azimuth || 180,
      counter: 0,
    };
  }
  function buildState() {
    const s = Object.assign({}, model.base);
    s.obstacles = model.obstacles;
    s.house = Object.assign({}, model.base.house, { orientationRad: (180 - model.orientationDeg) * Math.PI / 180 });
    return s;
  }

  function render() {
    if (!sim) return;
    sim.update(buildState());
    sim.setSunTime(t);          // re-apply current time (update() resets the sun)
    if (selectedId && sim.select) sim.select(selectedId);
    refreshMetric();
  }

  function orientationYield(deg) {
    return (typeof RoofCompass !== 'undefined') ? RoofCompass.assess(deg).yield : 100;
  }
  function refreshMetric() {
    if (!sim) return;
    const exposure = sim.computeExposure();
    const ex = (exposure == null) ? 100 : exposure;
    const y = orientationYield(model.orientationDeg);
    const total = (typeof Shading !== 'undefined') ? Shading.combine(y, ex) : ex;
    setText('se-exposure', exposure == null ? '—' : ex + '%');
    setText('se-yield', y + '%');
    const r = (typeof Shading !== 'undefined') ? Shading.rate(total) : { label: '', cls: 'ok' };
    const el = $('se-total');
    if (el) { el.className = 'se-total ' + r.cls; el.textContent = total + '% · ' + r.label; }
  }

  // ---------- selection panel ----------
  function onSelect(key) {
    const obs = key && model.obstacles.find(o => o.id === key);
    selectedId = obs ? key : null;
    const card = $('se-sel');
    if (!card) return;
    if (obs) {
      card.style.display = 'block';
      setText('se-sel-title', obs.type === 'building' ? '🏢 מבנה שכן' : '🌳 עץ');
      const h = $('se-height'); if (h) h.value = obs.height || 4;
      setText('se-height-val', (obs.height || 4));
    } else {
      card.style.display = 'none';
    }
  }

  // ---------- time / play ----------
  function hourLabel(t01) {
    const hh = 6 + t01 * 12; const h = Math.floor(hh), m = Math.round((hh - h) * 60);
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }
  function setTime(v) {
    t = parseFloat(v);
    if (sim) sim.setSunTime(t);
    setText('se-time', hourLabel(t));
    const r = $('se-time-range'); if (r && r.value != t) r.value = t;
  }
  function togglePlay() {
    if (playRAF) { cancelAnimationFrame(playRAF); playRAF = 0; setText2('se-play', '▶'); return; }
    setText2('se-play', '⏸');
    let last = performance.now();
    const step = (now) => {
      const dt = (now - last) / 1000; last = now;
      let nt = t + dt * 0.12; if (nt > 1) nt = 0;
      setTime(nt);
      playRAF = requestAnimationFrame(step);
    };
    playRAF = requestAnimationFrame(step);
  }
  function setText2(id, v) { const e = $(id); if (e) e.textContent = v; }

  // ---------- obstacle / orientation editing ----------
  function addObstacle(type) {
    const id = 'usr' + (model.counter++);
    model.obstacles.push({ id: id, type: type, x: type === 'building' ? 9 : 6, z: 7, height: type === 'building' ? 9 : 4 });
    selectedId = id;
    render();
    onSelect(id);
  }
  function deleteSelected() {
    if (!selectedId) return;
    model.obstacles = model.obstacles.filter(o => o.id !== selectedId);
    selectedId = null;
    if (sim && sim.select) sim.select(null);
    onSelect(null);
    render();
  }
  function setSelectedHeight(v) {
    const o = model.obstacles.find(x => x.id === selectedId);
    if (!o) return;
    o.height = parseFloat(v);
    setText('se-height-val', o.height);
    render();
  }
  function setOrientation(v) {
    model.orientationDeg = parseInt(v);
    setText('se-orient', model.orientationDeg + '°');
    render();
  }
  function resetLayout() {
    if (sim && sim.resetLayout) sim.resetLayout();
    const inputs = wizardInputs();
    model.obstacles = model.base.obstacles.map(o => Object.assign({}, o));
    model.orientationDeg = inputs.azimuth || 180;
    selectedId = null;
    const orng = $('se-orient-range'); if (orng) orng.value = model.orientationDeg;
    setText('se-orient', model.orientationDeg + '°');
    onSelect(null);
    render();
  }

  // ---------- open / close ----------
  function open() {
    if (!window.VoltaSim || !VoltaSim.available()) { alert('מנוע התלת-ממד לא נטען — דרוש חיבור אינטרנט.'); return; }
    injectCSS();
    buildOverlay();
    model = freshModel();
    selectedId = null;
    const canvas = $('se-canvas');
    sim = VoltaSim.mount(canvas, { interactive: true, onSelect: onSelect, onChange: refreshMetric, onDragEnd: refreshMetric });
    const orng = $('se-orient-range'); if (orng) orng.value = model.orientationDeg;
    setText('se-orient', model.orientationDeg + '°');
    t = 0.5; const trng = $('se-time-range'); if (trng) trng.value = t;
    setText('se-time', hourLabel(t));
    render();
    setTimeout(() => { if (sim) sim.resize(); }, 40);
  }
  function close() {
    if (playRAF) { cancelAnimationFrame(playRAF); playRAF = 0; }
    if (sim) { sim.dispose(); sim = null; }
    const el = $('se-overlay'); if (el) el.remove();
    model = null; selectedId = null;
  }

  // ---------- dock open button ----------
  function injectOpenButton() {
    const head = document.querySelector('#sim-dock .dock-head');
    if (!head || document.getElementById('se-open-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'se-open-btn'; btn.className = 'dock-toggle'; btn.title = 'עורך הצללה (מסך מלא)';
    btn.textContent = '⛶';
    btn.onclick = open;
    const span = head.querySelector('span') || head;
    span.insertBefore(btn, span.firstChild);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectOpenButton);
  else setTimeout(injectOpenButton, 0);

  return {
    open, close, addObstacle, deleteSelected, setSelectedHeight,
    setOrientation, setTime, togglePlay, resetLayout,
  };
})();
if (typeof window !== 'undefined') window.SimEditor = SimEditor;
