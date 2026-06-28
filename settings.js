// Manager settings panel: edit roofConfig in a working draft, validate, save.
const Settings = (() => {
  let draft = null;
  let onSaved = null;
  const OUTCOMES = [['ok', 'תקין'], ['warn', 'אזהרה'], ['escalate', 'הסלמה'], ['stop', 'עצירה']];
  const ACTIONS = [['', 'ללא'], ['flag', 'דגל'], ['escalate', 'הסלמה'], ['stop', 'עצירה'], ['tiles-age', 'שאלת גיל']];
  const GEOMS = [['flat', 'שטוח'], ['pitched', 'משופע (רעפים)'], ['pergola', 'פרגולה'], ['insulated', 'מבודד'], ['corrugated', 'איסכורית'], ['light', 'בנייה קלה']];
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function host() { return document.getElementById('settings-modal'); }

  function onKey(e) { if (e.key === 'Escape') close(); }

  function open() {
    draft = (typeof RoofStore !== 'undefined') ? RoofStore.get() : null;
    if (!draft) return;
    document.addEventListener('keydown', onKey);
    render();
  }
  function close() {
    const h = host();
    if (h) { h.classList.remove('on'); h.setAttribute('aria-hidden', 'true'); h.innerHTML = ''; }
    document.removeEventListener('keydown', onKey);
  }

  function sel(options, val) {
    return options.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(val == null ? '' : val) ? ' selected' : ''}>${esc(l)}</option>`).join('');
  }

  function render() {
    const h = host(); if (!h) return;
    const th = draft.totalSizeThresholds || {};
    const mats = draft.materials.map((m, i) => materialCard(m, i)).join('');
    h.innerHTML = `
      <div class="settings-backdrop" onclick="Settings.close()"></div>
      <div class="settings-panel" role="dialog" aria-label="הגדרות מנהל">
        <div class="settings-head">
          <span class="settings-title">⚙ הגדרות מנהל · כשירות גג</span>
          <button class="settings-x" onclick="Settings.close()">✕</button>
        </div>
        <div class="settings-body">
          <div id="settings-errors" class="settings-errors"></div>
          <div class="set-grid">
            <label class="set-field"><span>סף שטח "טוב" (מ"ר)</span>
              <input type="number" min="1" value="${esc(th.good)}" oninput="Settings.setNum('good', this.value)"></label>
            <label class="set-field"><span>סף שטח "גבולי" (מ"ר)</span>
              <input type="number" min="1" value="${esc(th.borderline)}" oninput="Settings.setNum('borderline', this.value)"></label>
            <label class="set-field"><span>גיל גג מקסימלי (שנים)</span>
              <input type="number" min="1" value="${esc(draft.tilesAgeWarning)}" oninput="Settings.setNum('tilesAge', this.value)"></label>
            <label class="set-field"><span>סיסמת אתחול מנהל ראשון</span>
              <input type="text" value="${esc(draft.managerPassword)}" oninput="Settings.setPass(this.value)"></label>
          </div>
          <div class="set-section-title">חומרי גג</div>
          <div id="set-materials">${mats}</div>
          <button class="btn secondary" onclick="Settings.addMaterial()">➕ הוסף חומר</button>
        </div>
        <div class="settings-foot">
          <button class="btn primary" onclick="Settings.save()">💾 שמור</button>
          <button class="btn reset" onclick="Settings.resetDefaults()">↺ אפס לברירת מחדל</button>
          <button class="btn secondary" onclick="Settings.close()">ביטול</button>
        </div>
      </div>`;
    h.classList.add('on');
    h.setAttribute('aria-hidden', 'false');
  }

  function materialCard(m, i) {
    const msg = m.messages || {};
    const showFlag = m.baseAction === 'flag', showEsc = m.baseAction === 'escalate', showStop = m.baseAction === 'stop';
    const rules = (m.sizeRules || []).map((r, j) => `
      <div class="rule-row">
        <input type="number" placeholder="עד (∞=ריק)" value="${r.upTo == null ? '' : esc(r.upTo)}" oninput="Settings.setRule(${i},${j},'upTo',this.value)">
        <select onchange="Settings.setRule(${i},${j},'outcome',this.value)">${sel(OUTCOMES, r.outcome)}</select>
        <input type="text" placeholder="הודעה" value="${esc(r.message)}" oninput="Settings.setRule(${i},${j},'message',this.value)">
        <button class="rule-x" onclick="Settings.delRule(${i},${j})">✕</button>
      </div>`).join('');
    return `
      <div class="mat-card">
        <div class="mat-head">
          <input class="mat-emoji" type="text" value="${esc(m.emoji)}" oninput="Settings.setMat(${i},'emoji',this.value)">
          <input class="mat-label" type="text" value="${esc(m.label)}" oninput="Settings.setMat(${i},'label',this.value)">
          <input class="mat-id" type="text" value="${esc(m.id)}" oninput="Settings.setMat(${i},'id',this.value)" title="מזהה ייחודי">
          <button class="mat-del" onclick="Settings.delMaterial(${i})">🗑</button>
        </div>
        <div class="mat-row">
          <label>פעולת בסיס
            <select onchange="Settings.setMat(${i},'baseAction',this.value)">${sel(ACTIONS, m.baseAction || '')}</select>
          </label>
          <label>גאומטריה (לסימולציה)
            <select onchange="Settings.setMat(${i},'geometry',this.value)">${sel(GEOMS, m.geometry || 'flat')}</select>
          </label>
        </div>
        ${showFlag ? `<label class="mat-msg">הודעת דגל<input type="text" value="${esc(msg.flagMsg)}" oninput="Settings.setMsg(${i},'flagMsg',this.value)"></label>` : ''}
        ${showEsc ? `<label class="mat-msg">הערת הסלמה<input type="text" value="${esc(msg.escalateNote)}" oninput="Settings.setMsg(${i},'escalateNote',this.value)"></label>` : ''}
        ${showStop ? `<label class="mat-msg">סיבת עצירה<input type="text" value="${esc(msg.stopReason)}" oninput="Settings.setMsg(${i},'stopReason',this.value)"></label>
          <label class="mat-msg">נוסח לנציג<input type="text" value="${esc(msg.stopScript)}" oninput="Settings.setMsg(${i},'stopScript',this.value)"></label>` : ''}
        <div class="rules-title">כללי שטח <button class="rule-add" onclick="Settings.addRule(${i})">+ כלל</button></div>
        ${rules}
      </div>`;
  }

  // ---- draft mutations ----
  function setNum(k, v) { const n = parseInt(v) || 0; if (k === 'tilesAge') draft.tilesAgeWarning = n; else draft.totalSizeThresholds[k] = n; }
  function setPass(v) { draft.managerPassword = v; }
  function setMat(i, k, v) { draft.materials[i][k] = (k === 'baseAction' && v === '') ? null : v; if (k === 'baseAction') render(); }
  function setMsg(i, k, v) { draft.materials[i].messages = draft.materials[i].messages || {}; draft.materials[i].messages[k] = v; }
  function setRule(i, j, k, v) {
    const r = draft.materials[i].sizeRules[j];
    if (k === 'upTo') r.upTo = (v === '' ? null : (parseInt(v) || 0));
    else r[k] = v;
  }
  function addRule(i) { (draft.materials[i].sizeRules = draft.materials[i].sizeRules || []).push({ upTo: null, outcome: 'ok', message: '' }); render(); }
  function delRule(i, j) { draft.materials[i].sizeRules.splice(j, 1); render(); }
  function addMaterial() {
    const ids = new Set(draft.materials.map(m => m.id));
    let n = draft.materials.length + 1;
    while (ids.has('mat' + n)) n++;
    draft.materials.push({ id: 'mat' + n, label: 'חומר חדש', emoji: '🏠', baseFlagClass: 'ok', baseAction: null, geometry: 'flat', messages: { flagMsg: '', escalateNote: '', stopReason: '', stopScript: '' }, sizeRules: [{ upTo: null, outcome: 'ok', message: '' }] });
    render();
  }
  function delMaterial(i) { draft.materials.splice(i, 1); render(); }

  function showErrors(errs) {
    const e = document.getElementById('settings-errors');
    if (!e) return;
    e.innerHTML = errs.map(x => `<div>⚠ ${esc(x)}</div>`).join('');
    e.classList.toggle('on', errs.length > 0);
  }

  async function save() {
    const v = RoofStore.validate(draft);
    if (!v.ok) { showErrors(v.errors); return; }
    const res = RoofStore.saveAsync ? await RoofStore.saveAsync(draft) : RoofStore.save(draft);
    if (!res.ok) { showErrors(res.errors); return; }
    close();
    if (typeof onSaved === 'function') onSaved();
  }
  function resetDefaults() { draft = RoofStore.reset(); render(); }

  function setOnSaved(fn) { onSaved = fn; }

  return { open, close, setNum, setPass, setMat, setMsg, setRule, addRule, delRule, addMaterial, delMaterial, save, resetDefaults, setOnSaved };
})();
if (typeof window !== 'undefined') window.Settings = Settings;
