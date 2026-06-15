// Manager panel: entry (double-click logo + password), requests tab, agents tab.
const Admin = (() => {
  let _agents = [];
  let _requests = [];
  let _open = false;
  let _reqFilter = 'pending'; // 'pending' | 'all'

  function managerPassword() {
    // Prefer the live (manager-editable) password from RoofStore, so the unified
    // entry honors any change made in the roof-settings editor.
    if (typeof RoofStore !== 'undefined' && RoofStore.get) {
      const cfg = RoofStore.get();
      if (cfg && cfg.managerPassword) return cfg.managerPassword;
    }
    return (typeof DEFAULT_ROOF_CONFIG !== 'undefined' && DEFAULT_ROOF_CONFIG.managerPassword)
      || 'volta';
  }

  function open() {
    document.getElementById('admin-modal').classList.remove('hidden');
    _open = true;
    renderRequests();
    renderAgents();
    renderRoof();
  }
  function close() {
    document.getElementById('admin-modal').classList.add('hidden');
    _open = false;
  }
  function promptLogin() {
    const pw = window.prompt('סיסמת מנהל:');
    if (pw == null) return;
    if (pw === managerPassword()) open();
    else alert('סיסמה שגויה');
  }

  function switchTab(name) {
    document.querySelectorAll('.admin-tab').forEach(t =>
      t.classList.toggle('active', t.dataset.atab === name));
    document.getElementById('admin-requests').classList.toggle('hidden', name !== 'requests');
    document.getElementById('admin-agents').classList.toggle('hidden', name !== 'agents');
    document.getElementById('admin-roof').classList.toggle('hidden', name !== 'roof');
  }

  // ---- roof settings tab (launches the existing roof Settings editor) ----
  function renderRoof() {
    const pane = document.getElementById('admin-roof');
    if (!pane) return;
    if (typeof Settings === 'undefined' || !window.Settings) {
      pane.innerHTML = '<div class="my-req-empty">עורך הגדרות הגג לא נטען.</div>';
      return;
    }
    pane.innerHTML = `
      <div class="my-req-empty" style="text-align:right;padding:8px 0 14px">
        עריכת ספי גודל, גיל גג, חומרים וכללי גודל — משותף לכל הנציגים.
      </div>
      <button class="btn primary" onclick="Admin.openRoofSettings()">פתח עורך הגדרות גג ←</button>`;
  }

  function openRoofSettings() {
    if (window.Settings) Settings.open();
  }

  // ---- requests tab ----
  function renderRequests() {
    const pane = document.getElementById('admin-requests');
    let list = _requests.slice();
    if (_reqFilter === 'pending') list = list.filter(r => r.status === 'pending');
    list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    const filterBar = `<div class="admin-filter">
      <button class="chip ${_reqFilter === 'pending' ? 'on' : ''}" onclick="Admin.filterReq('pending')">ממתינות</button>
      <button class="chip ${_reqFilter === 'all' ? 'on' : ''}" onclick="Admin.filterReq('all')">הכל</button>
    </div>`;

    if (!list.length) { pane.innerHTML = filterBar + '<div class="my-req-empty">אין בקשות.</div>'; return; }

    pane.innerHTML = filterBar + list.map(r => {
      const permLabel = r.type === 'settlement' ? 'אשר — שינוי קבוע' : 'אשר — קבוע (גג)';
      const actions = r.status === 'pending' ? `
        <div class="req-row-actions">
          <button class="btn primary sm" onclick="Admin.approve('${r.id}','permanent')">${permLabel}</button>
          <button class="btn secondary sm" onclick="Admin.approve('${r.id}','one-off')">אשר — חד-פעמי</button>
          <button class="btn vsd sm" onclick="Admin.reject('${r.id}')">דחה</button>
        </div>`
        : `<div class="req-row-status">${escHtml(r.status)} ${escHtml(r.resolution || '')}${r.managerNote ? ' · ' + escHtml(r.managerNote) : ''}</div>`;
      return `<div class="admin-req-row ${r.status}">
        <div class="ar-head"><span>${r.type === 'roof' ? '🏠 גג' : '📍 יישוב'}</span>
          <span class="ar-agent">${escHtml(r.agentName || '')}</span></div>
        <div class="ar-subject">${escHtml(r.subject || '')}</div>
        <div class="ar-reason">${escHtml(r.reason || '')}</div>
        ${actions}
      </div>`;
    }).join('');
  }

  function filterReq(f) { _reqFilter = f; renderRequests(); }

  async function approve(id, resolution) {
    const req = _requests.find(r => r.id === id);
    if (!req) return;
    let newStatus = null;
    if (resolution === 'permanent' && req.type === 'settlement') {
      newStatus = window.prompt('סטטוס חדש ליישוב (מתקינים / לא מתקינים / להתייעץ):', 'לא מתקינים');
      if (newStatus == null) return;
      newStatus = newStatus.trim();
    } else if (resolution === 'permanent' && req.type === 'roof') {
      alert('אישור גג קבוע נרשם. החלת הכלל בפועל נעשית בפאנל הגדרות הגג.');
    }
    const note = window.prompt('הערה לנציג (אופציונלי):', '') || '';
    const patch = Requests.decideRequest(req, { action: 'approve', resolution, managerNote: note });
    if (newStatus) {
      const ov = Requests.overrideFromApproval(req, newStatus, 'מנהל');
      if (ov) await VoltaDB.setOverride(ov.key, ov.value);
    }
    await VoltaDB.updateRequest(id, patch);
  }

  async function reject(id) {
    const req = _requests.find(r => r.id === id);
    if (!req) return;
    const note = window.prompt('סיבת דחייה (אופציונלי):', '') || '';
    const patch = Requests.decideRequest(req, { action: 'reject', managerNote: note });
    await VoltaDB.updateRequest(id, patch);
  }

  // ---- agents tab ----
  function renderAgents() {
    const pane = document.getElementById('admin-agents');
    const rows = _agents.slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      .map(a => `<div class="agent-row ${a.active ? '' : 'inactive'}">
        <span class="ag-name">${escHtml(a.name || '')}</span>
        <span class="ag-code">קוד: ${escHtml(a.code || '')}</span>
        <span class="ag-state">${a.active ? 'פעיל' : 'מושבת'}</span>
        <button class="btn secondary sm" onclick="Admin.toggleAgent('${a.id}', ${a.active ? 'false' : 'true'})">${a.active ? 'השבת' : 'הפעל'}</button>
        <button class="btn vsd sm" onclick="Admin.removeAgent('${a.id}')">מחק</button>
      </div>`).join('');
    pane.innerHTML = `
      <div class="agent-add">
        <input id="new-agent-name" class="login-input sm" placeholder="שם נציג">
        <input id="new-agent-code" class="login-input sm" placeholder="קוד">
        <button class="btn primary sm" onclick="Admin.addAgent()">הוסף נציג</button>
        <div id="agent-add-error" class="req-error"></div>
      </div>
      <div class="agent-list">${rows || '<div class="my-req-empty">אין נציגים.</div>'}</div>`;
  }

  async function addAgent() {
    const name = document.getElementById('new-agent-name').value.trim();
    const code = document.getElementById('new-agent-code').value.trim();
    const err = document.getElementById('agent-add-error');
    if (!name || !code) { err.textContent = 'שם וקוד חובה'; return; }
    if (_agents.some(a => a.code === code)) { err.textContent = 'קוד כבר קיים'; return; }
    await VoltaDB.addAgent({ name, code, active: true, createdAt: Date.now() });
  }
  async function toggleAgent(id, active) {
    await VoltaDB.updateAgent(id, { active });
  }
  async function removeAgent(id) {
    if (!window.confirm('למחוק את הנציג? (עדיף להשבית כדי לשמור היסטוריית בקשות)')) return;
    await VoltaDB.deleteAgent(id);
  }

  function init() {
    const logo = document.querySelector('.brand');
    if (logo) logo.addEventListener('dblclick', promptLogin);
    // Reachable from the login gate too, so a manager can bootstrap agents
    // before anyone is able to log in.
    const mgrBtn = document.getElementById('manager-access');
    if (mgrBtn) mgrBtn.addEventListener('click', promptLogin);
    document.getElementById('admin-close').addEventListener('click', close);
    document.querySelectorAll('.admin-tab').forEach(t =>
      t.addEventListener('click', () => switchTab(t.dataset.atab)));

    VoltaDB.subscribeAgents(list => { _agents = list; if (_open) renderAgents(); });
    VoltaDB.subscribeRequests(list => { _requests = list; if (_open) renderRequests(); });
  }

  return {
    init,
    filterReq, approve, reject,
    addAgent, toggleAgent, removeAgent,
    openRoofSettings,
  };
})();

function initManagerPanel() { Admin.init(); }
if (typeof window !== 'undefined') window.Admin = Admin;
