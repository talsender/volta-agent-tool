function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ============================================================
// TAB SWITCHING
// ============================================================
function initTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const targetId = 'tab-' + tab.dataset.tab;
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => {
        c.classList.add('hidden');
        c.classList.remove('active');
      });
      tab.classList.add('active');
      const target = document.getElementById(targetId);
      target.classList.remove('hidden');
      target.classList.add('active');
    });
  });
}

// ============================================================
// SETTLEMENT TAB
// ============================================================
let _suggestionCache = [];

function renderSuggestions(results) {
  const el = document.getElementById('suggestions');
  if (!results.length) { el.classList.add('hidden'); _suggestionCache = []; return; }
  _suggestionCache = results;
  const cls_fn = Settlements.statusClass;
  const badges = { yes: '✅ מתקינים', no: '❌ לא מתקינים', check: '⚠️ לבדוק', unknown: '❓ לא זוהה' };
  el.innerHTML = results.map((s, i) => {
    const cls = cls_fn(s.status);
    return `<div class="suggestion-item" onclick="selectSettlement(_suggestionCache[${i}])">
      <div>
        <div class="sug-name">${escHtml(s.name)}</div>
        ${s.type ? `<div class="sug-type">${escHtml(s.type)}</div>` : ''}
      </div>
      <span class="sug-badge ${cls}">${badges[cls]}</span>
    </div>`;
  }).join('');
  el.classList.remove('hidden');
}

function renderSettlementResult(settlement) {
  const r = Settlements.getResult(settlement);
  document.getElementById('suggestions').classList.add('hidden');
  if (window.VoltaGlobe) window.VoltaGlobe.lockTarget(settlement.name, r.cls);
  let installBadge = '';
  if (r.installCount > 0) {
    const lastTxt = r.lastInstall ? ` · אחרונה: ${escHtml(r.lastInstall)}` : '';
    installBadge = `<div class="install-badge">📍 ${r.installCount} פרויקטים הושלמו אצלנו ביישוב זה${lastTxt}</div>`;
  }
  document.getElementById('settlement-result').innerHTML = `
    <div class="result-card ${r.cls}">
      <div class="result-icon">${r.icon}</div>
      <div>
        <div class="result-settlement">${escHtml(r.settlement)}</div>
        <div class="result-title">${escHtml(r.title)}</div>
        ${installBadge}
        ${r.note ? `<div class="result-note">${escHtml(r.note)}</div>` : ''}
        ${r.showWizardBtn ? `<button class="result-action-btn" onclick="switchToWizard()">המשך לבדיקת כשירות גג ←</button>` : ''}
      </div>
    </div>`;
}

function selectSettlement(settlement) {
  document.getElementById('settlement-input').value = settlement.name;
  renderSettlementResult(settlement);
}

function switchToWizard() {
  document.querySelector('.tab[data-tab="wizard"]').click();
}

function initSettlementTab() {
  const input = document.getElementById('settlement-input');
  let debounceTimer;
  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    document.getElementById('settlement-result').innerHTML = '';
    if (window.VoltaGlobe) window.VoltaGlobe.release();
    debounceTimer = setTimeout(() => {
      const results = Settlements.search(input.value);
      renderSuggestions(results);
    }, 150);
  });
  // Hide suggestions when clicking outside
  document.addEventListener('click', e => {
    if (!e.target.closest('#tab-settlement')) {
      document.getElementById('suggestions').classList.add('hidden');
    }
  });
}

// ============================================================
// WIZARD RENDERING
// ============================================================
function renderWizard() {
  const container = document.getElementById('wizard-container');
  const s = Wizard.getState();
  const q = Wizard.currentQuestion();

  if (s.outcome) {
    container.innerHTML = renderWizardResult();
    if (window.VoltaGlobe && (s.outcome === 'go' || s.outcome === 'go-notes')) {
      window.VoltaGlobe.deploy();
    }
    return;
  }

  const flow = Wizard.currentFlow();
  const total = flow.length;
  const current = s.step + 1;
  const pct = Math.round((s.step / total) * 100);

  let html = `
    <div class="progress-area">
      <div class="progress-label"><span>שאלה ${current} מתוך ${total}</span><span>${pct}%</span></div>
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
    </div>`;

  // Previous answers
  if (s.answers.length > 0) {
    html += '<div class="prev-answers">';
    s.answers.forEach(a => {
      const cls = a.flagClass === 'warn' ? ' warn' : '';
      html += `<div class="prev-row"><span class="prev-q">${labelForId(a.questionId)}</span><span class="prev-a${cls}">${a.label}</span></div>`;
    });
    html += '</div>';
  }

  // Current question
  html += `<div class="question-card">
    <div class="q-step">שאלה ${current} מתוך ${total}</div>
    <div class="q-text">${q.text}</div>
    ${q.hint ? `<div class="q-hint">${q.hint}</div>` : ''}
    ${renderQuestionInput(q)}
  </div>`;

  html += `<div class="btn-row">
    <button class="btn reset" onclick="resetWizard()">🔄 התחל מחדש</button>
  </div>`;

  container.innerHTML = html;
  if (q && q.type === 'compass') {
    setTimeout(() => initRoofCompass(180), 0);
  }
  if (q && q.type === 'material-sizes') {
    setTimeout(() => updateMaterialSizes(), 0);
  }
  if (q && ROOF_STEPS.has(q.id)) {
    setTimeout(() => updateMiniSim(q.id === 'material-sizes' ? readMaterialSizes() : null), 0);
  } else {
    hideMiniSim();
  }
}

// ============================================================
// HOUSE SIM (side-panel mini preview)
// ============================================================
let _miniSim = null;
const ROOF_STEPS = new Set(['roof-type', 'tiles-age', 'material-sizes', 'roof-orientation', 'shading']);

function ensureMiniSim() {
  if (!window.VoltaSim || !VoltaSim.available()) return null;
  const stage = document.querySelector('.globe-stage');
  if (!stage) return null;
  let canvas = document.getElementById('sim-canvas');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'sim-canvas';
    canvas.className = 'sim-canvas';
    stage.appendChild(canvas);
  }
  stage.classList.add('sim-on');
  if (!_miniSim) _miniSim = VoltaSim.mount(canvas, { interactive: false });
  return _miniSim;
}

function hideMiniSim() {
  const stage = document.querySelector('.globe-stage');
  if (stage) stage.classList.remove('sim-on');
}

function updateMiniSim(liveSizes) {
  const sim = ensureMiniSim();
  if (!sim) return;
  sim.update(Wizard.getSimInputs(liveSizes));
}

// ============================================================
// ROOF ORIENTATION COMPASS
// ============================================================
let _roofCompass = null;

function initRoofCompass(initialAz) {
  const canvas = document.getElementById('roof-compass');
  if (!canvas || !window.RoofCompass) return;
  _roofCompass = window.RoofCompass.mount(canvas, initialAz, updateCompassReadout);
  highlightDirBtn(initialAz);
}

function compassSet(deg) {
  if (_roofCompass) _roofCompass.set(deg);
  highlightDirBtn(deg);
}

function highlightDirBtn(deg) {
  const d = ((Math.round(deg / 45) * 45) % 360 + 360) % 360;
  document.querySelectorAll('.dir-btn').forEach(b => {
    b.classList.toggle('active', parseInt(b.dataset.deg) === d);
  });
}

function updateCompassReadout(a) {
  const dir = document.getElementById('compass-dir');
  const yld = document.getElementById('compass-yield');
  const ql = document.getElementById('compass-quality');
  const v = document.getElementById('compass-verdict');
  if (dir) dir.textContent = a.dir;
  if (yld) yld.textContent = '~' + a.yield + '%';
  if (ql) { ql.textContent = a.quality; ql.className = 'cr-v ' + (a.flagClass === 'ok' ? 'good' : 'warn'); }
  if (v) {
    v.className = 'compass-verdict ' + (a.flagClass === 'ok' ? 'ok' : 'warn');
    v.textContent = a.flag
      ? a.flag
      : '☀ ' + a.dir + ' · תפוקה ~' + a.yield + '% — תנוחה ' + a.quality + ' לייצור סולארי';
  }
  highlightDirBtn(a.az);
}

function wizardOrientationConfirm() {
  const az = _roofCompass ? _roofCompass.get() : 180;
  Wizard.answer({}, az);
  renderWizard();
}

// ============================================================
// PERSISTENT COMPASS DOCK (always-visible, independent instance)
// ============================================================
let _dockCompass = null;

function initDockCompass() {
  const canvas = document.getElementById('dock-compass');
  if (!canvas || !window.RoofCompass) return;
  _dockCompass = window.RoofCompass.mount(canvas, 180, updateDockReadout);
  highlightDockDirBtn(180);
}

function dockCompassSet(deg) {
  if (_dockCompass) _dockCompass.set(deg);
  highlightDockDirBtn(deg);
}

function highlightDockDirBtn(deg) {
  const d = ((Math.round(deg / 45) * 45) % 360 + 360) % 360;
  document.querySelectorAll('.dock-dir-btn').forEach(b => {
    b.classList.toggle('active', parseInt(b.dataset.deg) === d);
  });
}

function updateDockReadout(a) {
  const v = document.getElementById('dock-verdict');
  if (v) {
    v.className = 'dock-verdict ' + (a.flagClass === 'ok' ? 'ok' : 'warn');
    v.textContent = a.flag
      ? a.flag
      : '☀ ' + a.dir + ' · תפוקה ~' + a.yield + '% · ' + a.quality;
  }
  highlightDockDirBtn(a.az);
}

function toggleCompassDock() {
  const dock = document.getElementById('compass-dock');
  const btn = document.getElementById('dock-toggle');
  if (!dock) return;
  const collapsed = dock.classList.toggle('collapsed');
  if (btn) btn.textContent = collapsed ? '▴' : '▾';
}

function labelForId(id) {
  const labels = {
    'property-type': 'סוג נכס', 'ownership': 'בעלות', 'permit': 'טופס 4',
    'connection': 'חיבור חשמל', 'meter': 'מונה חשמל', 'roof-type': 'סוג גג',
    'tiles-age': 'גיל גג רעפים', 'material-sizes': 'שטחי גג', 'roof-orientation': 'כיוון גג', 'shading': 'הצללות',
  };
  return labels[id] || id;
}

function renderQuestionInput(q) {
  if (q.type === 'buttons') {
    return '<div class="answer-row">' +
      q.options.map((opt, i) =>
        `<button class="answer-btn" onclick="wizardAnswer(${i})">${opt.label}</button>`
      ).join('') +
      '</div>';
  }
  if (q.type === 'roof-grid') {
    return '<div class="roof-grid">' +
      q.options.map((opt, i) =>
        `<button class="roof-btn ${opt.flagClass}" onclick="wizardAnswer(${i})">${opt.label}</button>`
      ).join('') +
      '</div>';
  }
  if (q.type === 'roof-grid-multi') {
    const selected = Wizard.getState().selectedRoofTypes;
    const btns = q.options.map((opt, i) => {
      const isSel = selected.some(t => t.value === opt.value);
      return `<button class="roof-btn ${opt.flagClass}${isSel ? ' selected' : ''}" onclick="wizardToggleRoof(${i})">${opt.label}</button>`;
    }).join('');
    return `<div class="roof-grid">${btns}</div>
      <div class="btn-row" style="margin-top:14px">
        <button class="btn primary" onclick="wizardConfirmRoofs()">אשר בחירת גג</button>
      </div>
      <div id="roof-multi-error" style="color:#e63946;font-size:13px;margin-top:8px;text-align:center;min-height:18px;"></div>`;
  }
  if (q.type === 'compass') {
    const dirs = [['צפון',0],['צ-מז',45],['מזרח',90],['ד-מז',135],['דרום',180],['ד-מע',225],['מערב',270],['צ-מע',315]];
    return `
      <div class="compass-wrap">
        <canvas id="roof-compass" class="compass-canvas" width="300" height="300"></canvas>
        <div class="compass-hint-tag">גרור את המחוג · או בחר כיוון</div>
      </div>
      <div class="compass-dirs">
        ${dirs.map(([l,d]) => `<button class="dir-btn" data-deg="${d}" onclick="compassSet(${d})">${l}</button>`).join('')}
      </div>
      <div class="compass-readout">
        <div class="cr-item"><span class="cr-k">כיוון</span><span class="cr-v" id="compass-dir">—</span></div>
        <div class="cr-item"><span class="cr-k">תפוקה משוערת</span><span class="cr-v" id="compass-yield">—</span></div>
        <div class="cr-item"><span class="cr-k">דירוג</span><span class="cr-v" id="compass-quality">—</span></div>
      </div>
      <div class="compass-verdict ok" id="compass-verdict"></div>
      <div class="btn-row" style="margin-top:14px">
        <button class="btn primary" onclick="wizardOrientationConfirm()">אשר כיוון גג ←</button>
      </div>`;
  }
  if (q.type === 'material-sizes') {
    const mats = Wizard.selectedMaterials();
    const rows = mats.map((m, i) => `
      <div class="msize-row">
        <span class="msize-label">${m.emoji} ${escHtml(m.label)}</span>
        <input type="number" min="0" max="1000" value="40" inputmode="numeric"
          class="msize-input" id="msize-${i}" data-id="${escHtml(m.id)}"
          oninput="updateMaterialSizes()">
        <span class="msize-unit">מ"ר</span>
      </div>`).join('');
    return `
      <div class="msize-list">${rows}</div>
      <div class="msize-total" id="msize-total">סה"כ: 0 מ"ר</div>
      <div class="msize-verdict ok" id="msize-verdict"></div>
      <div class="btn-row" style="margin-top:14px">
        <button class="btn primary" onclick="materialSizesConfirm()">אשר שטחי גג ←</button>
      </div>`;
  }
  return '';
}

function wizardAnswer(optionIndex) {
  const q = Wizard.currentQuestion();
  const opt = q.options[optionIndex];
  Wizard.answer(opt);
  renderWizard();
}

// ---- Per-material sizes ----
function readMaterialSizes() {
  return Array.from(document.querySelectorAll('.msize-input')).map(el => ({
    materialId: el.dataset.id,
    size: parseInt(el.value) || 0,
  }));
}

function updateMaterialSizes() {
  const sizes = readMaterialSizes();
  const sum = sizes.reduce((a, s) => a + s.size, 0);
  const totalEl = document.getElementById('msize-total');
  if (totalEl) totalEl.textContent = `סה"כ: ${sum} מ"ר`;
  const v = document.getElementById('msize-verdict');
  if (!v) return;
  // Read the same thresholds evaluateRoof uses, so the live preview matches the
  // authoritative result (and stays correct when roofConfig is manager-edited).
  const th = (typeof DEFAULT_ROOF_CONFIG !== 'undefined' && DEFAULT_ROOF_CONFIG.totalSizeThresholds)
    ? DEFAULT_ROOF_CONFIG.totalSizeThresholds
    : { good: CONFIG.ROOF_SIZE_GOOD, borderline: CONFIG.ROOF_SIZE_BORDERLINE };
  const good = th.good, border = th.borderline;
  if (sum >= good) { v.className = 'msize-verdict ok'; v.textContent = `✅ ${sum} מ"ר — שטח מתאים`; }
  else if (sum >= border) { v.className = 'msize-verdict warn'; v.textContent = `⚠️ ${sum} מ"ר — גבולי, המומחה יאשר`; }
  else { v.className = 'msize-verdict bad'; v.textContent = `❌ ${sum} מ"ר — קטן מדי (מינימום ${border} מ"ר)`; }
  updateMiniSim(readMaterialSizes());
}

function materialSizesConfirm() {
  Wizard.answerMaterialSizes(readMaterialSizes());
  renderWizard();
}

function wizardToggleRoof(i) {
  Wizard.toggleRoofType(i);
  renderWizard();
}

function wizardConfirmRoofs() {
  const result = Wizard.confirmRoofTypes();
  if (!result.done && result.error) {
    const errEl = document.getElementById('roof-multi-error');
    if (errEl) errEl.textContent = result.error;
    return;
  }
  renderWizard();
}

function resetWizard() {
  Wizard.reset();
  renderWizard();
}

function renderWizardResult() {
  const s = Wizard.getState();

  // Answers recap
  const recap = s.answers.map(a => {
    const cls = a.flagClass === 'warn' ? ' warn' : '';
    return `<div class="recap-row"><span class="recap-q">${labelForId(a.questionId)}</span><span class="recap-v${cls}">${a.label}</span></div>`;
  }).join('');

  if (s.outcome === 'go') {
    return `<div class="wizard-result go">
      <div class="wr-header"><div class="wr-icon">✅</div><div class="wr-title">ניתן לתאם שיחת מומחה</div></div>
      <div class="answers-recap">${recap}</div>
      <div class="btn-row">
        <button class="btn primary">📅 תאם שיחת מומחה</button>
        <button class="btn reset" onclick="resetWizard()">🔄 בדיקה חדשה</button>
      </div>
    </div>`;
  }

  if (s.outcome === 'go-notes') {
    const flags = s.flags.map(f => `<div class="flag-box"><span class="flag-icon">📌</span><span>${f}</span></div>`).join('');
    return `<div class="wizard-result go-notes">
      <div class="wr-header"><div class="wr-icon">⚠️</div><div class="wr-title">ניתן לקדם — שים לב להערות</div></div>
      <div class="answers-recap">${recap}</div>
      ${flags}
      <div class="btn-row">
        <button class="btn primary">📅 תאם שיחת מומחה</button>
        <button class="btn reset" onclick="resetWizard()">🔄 בדיקה חדשה</button>
      </div>
    </div>`;
  }

  if (s.outcome === 'follow-up') {
    const note = s.followUpNote || 'נדרשת פעולה נוספת לפני תיאום שיחת מומחה.';
    return `<div class="wizard-result follow-up">
      <div class="wr-header"><div class="wr-icon">📋</div><div class="wr-title">לא ניתן לתאם כעת — שתי אפשרויות</div></div>
      <div class="action-box"><div class="action-text">${escHtml(note)}</div></div>
      <div class="action-box"><div class="action-title">אפשרות א׳ — פולואפ עתידי</div>
        <div class="action-text">לקבוע עם הלקוח מתי צפוי לסדר את הנושא, ולתזמן פולואפ.</div></div>
      <div class="action-box"><div class="action-title">אפשרות ב׳ — העברה ל-VSD</div>
        <div class="action-text">אם הלקוח מעוניין בתכנון ראשוני כבר עכשיו — להעביר לשיחת VSD.</div></div>
      <div class="btn-row">
        <button class="btn secondary">📅 קבע פולואפ לתאריך</button>
        <button class="btn vsd">↗ העבר ל-VSD</button>
        <button class="btn reset" onclick="resetWizard()">🔄 בדיקה חדשה</button>
      </div>
    </div>`;
  }

  if (s.outcome === 'escalate') {
    return `<div class="wizard-result escalate">
      <div class="wr-header"><div class="wr-icon">🔼</div><div class="wr-title">יש להעלות למנהל לפני קידום</div></div>
      <div class="answers-recap">${recap}</div>
      <div class="action-box"><div class="action-title">סיבה</div>
        <div class="action-text">${s.escalateNote || ''}</div></div>
      <div class="btn-row">
        <button class="btn reset" onclick="resetWizard()">🔄 בדיקה חדשה</button>
      </div>
    </div>`;
  }

  // stop
  return `<div class="wizard-result stop">
    <div class="wr-header"><div class="wr-icon">❌</div><div class="wr-title">לא ניתן להתקין</div></div>
    <div class="answers-recap">${recap}</div>
    <div class="action-box">
      <div class="action-title">🔴 הסיבה</div>
      <div class="action-text">${s.stopReason}</div>
    </div>
    ${s.stopScript ? `<div class="flag-box"><span class="flag-icon">💬</span><span>נוסח לנציג: <em>"${s.stopScript}"</em></span></div>` : ''}
    <div class="btn-row">
      <button class="btn reset" onclick="resetWizard()">🔄 בדיקה חדשה</button>
    </div>
  </div>`;
}

function initWizard() {
  Wizard.reset();
  renderWizard();
}

// ============================================================
// INIT
// ============================================================
async function init() {
  initTabs();
  initSettlementTab();

  const statusEl = document.getElementById('data-status');
  statusEl.textContent = 'טוען נתוני יישובים...';
  const result = await Settlements.load();
  if (result.ok) {
    statusEl.textContent = `✓ ${result.count} יישובים נטענו`;
    setTimeout(() => { statusEl.textContent = ''; }, 3000);
  } else {
    statusEl.textContent = `⚠️ לא ניתן לטעון נתונים — בדוק חיבור אינטרנט`;
  }

  if (typeof initWizard === 'function') initWizard();
  initDockCompass();
}

document.addEventListener('DOMContentLoaded', init);
