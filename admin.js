// Manager panel: entry (double-click logo + password), requests tab, agents tab.
const Admin = (() => {
  let _agents = [];
  let _requests = [];
  let _open = false;
  let _reqFilter = 'pending'; // 'pending' | 'all'
  let _ctx = 'manager';       // 'lead' (requests only) | 'manager' (all tabs)
  let _agentSearch = '';
  let _editingId = null;

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

  // roleCtx: 'lead' → requests tab only; 'manager' → all tabs.
  function open(roleCtx) {
    _ctx = roleCtx === 'manager' ? 'manager' : 'lead';
    _editingId = null;
    applyTabVisibility();
    document.getElementById('admin-modal').classList.remove('hidden');
    _open = true;
    renderRequests();
    renderAgents();
    renderRoof();
    switchTab('requests');
  }
  function close() {
    document.getElementById('admin-modal').classList.add('hidden');
    _open = false;
  }

  // Open honoring the logged-in agent's role.
  function openForCurrentAgent() {
    const agent = Auth.getCurrentAgent();
    if (!agent) return;
    if (Auth.can(agent, 'manageAgents')) open('manager');
    else if (Auth.can(agent, 'reviewRequests')) open('lead');
    else alert('אין לך הרשאה לפאנל הניהול.');
  }

  // First-time setup: only when no agents exist, the bootstrap password opens
  // the panel in manager mode so the first manager account can be created.
  function bootstrap() {
    const hasManager = _agents.some(a => a.role === 'manager' && a.active);
    if (hasManager) { alert('כבר קיים מנהל פעיל — היכנס עם חשבון המנהל.'); return; }
    const pw = window.prompt('סיסמת אתחול:');
    if (pw == null) return;
    if (pw === managerPassword()) open('manager');
    else alert('סיסמה שגויה');
  }

  function applyTabVisibility() {
    const isManager = _ctx === 'manager';
    const set = (atab, show) => {
      const btn = document.querySelector('.admin-tab[data-atab="' + atab + '"]');
      if (btn) btn.classList.toggle('hidden', !show);
    };
    set('requests', true);
    set('agents', isManager);
    set('roof', isManager);
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
        ${r.type === 'settlement' && r.requestedStatus
          ? `<div class="ar-requested">מבקש לשנות ל־ <b>${escHtml(r.requestedStatus)}</b></div>` : ''}
        <div class="ar-reason">${escHtml(r.reason || '')}</div>
        ${actions}
      </div>`;
    }).join('');
  }

  function filterReq(f) { _reqFilter = f; renderRequests(); }

  async function approve(id, resolution) {
    const req = _requests.find(r => r.id === id);
    if (!req) return;
    if (resolution === 'permanent' && req.type === 'roof') {
      alert('אישור גג קבוע נרשם. החלת הכלל בפועל נעשית בפאנל הגדרות הגג.');
    }
    const note = window.prompt('הערה לנציג (אופציונלי):', '') || '';
    const patch = Requests.decideRequest(req, { action: 'approve', resolution, managerNote: note });
    // Permanent settlement approval applies the status the agent requested.
    if (resolution === 'permanent' && req.type === 'settlement') {
      const ov = Requests.overrideFromApproval(req, 'מנהל');
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
  function roleOptions(sel) {
    return Auth.ROLES.map(r =>
      `<option value="${r}"${r === sel ? ' selected' : ''}>${escHtml(Auth.roleLabel(r))}</option>`).join('');
  }
  function fmtDate(ts) {
    try { return new Date(ts).toLocaleDateString('he-IL'); } catch (e) { return ''; }
  }

  function renderAgents() {
    const pane = document.getElementById('admin-agents');
    if (!pane) return;
    pane.innerHTML = `
      <div class="agent-add">
        <input id="new-agent-name" class="login-input sm" placeholder="שם">
        <input id="new-agent-email" class="login-input sm" type="email" placeholder="אימייל">
        <input id="new-agent-password" class="login-input sm" type="password" placeholder="סיסמה">
        <input id="new-agent-phone" class="login-input sm" placeholder="טלפון (אופציונלי)">
        <select id="new-agent-role" class="login-input sm">${roleOptions('agent')}</select>
        <button class="btn primary sm" onclick="Admin.addAgent()">הוסף נציג</button>
      </div>
      <div id="agent-add-error" class="req-error"></div>
      <input id="agent-search" class="login-input sm agent-search"
        placeholder="🔍 חיפוש לפי שם / אימייל / טלפון" oninput="Admin.searchAgents(this.value)">
      <div id="agent-list" class="agent-list"></div>`;
    const se = document.getElementById('agent-search');
    if (se) se.value = _agentSearch;
    renderAgentList();
  }

  function renderAgentList() {
    const host = document.getElementById('agent-list');
    if (!host) return;
    const q = _agentSearch.trim().toLowerCase();
    let list = _agents.slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    if (q) list = list.filter(a =>
      (a.name || '').toLowerCase().includes(q) ||
      (a.email || '').toLowerCase().includes(q) ||
      (a.phone || '').includes(q));
    host.innerHTML = list.length
      ? list.map(a => _editingId === a.id ? editRowHtml(a) : viewRowHtml(a)).join('')
      : '<div class="my-req-empty">אין נציגים.</div>';
  }

  function viewRowHtml(a) {
    return `<div class="agent-row ${a.active ? '' : 'inactive'}">
      <span class="ag-name">${escHtml(a.name || '')}</span>
      <span class="role-badge role-${escHtml(a.role || 'agent')}">${escHtml(Auth.roleLabel(a.role))}</span>
      <span class="ag-code">${escHtml(a.email || '')}</span>
      <span class="ag-phone">${escHtml(a.phone || '')}</span>
      <span class="ag-state">${a.active ? 'פעיל' : 'מושבת'}${a.lastLoginAt ? ' · כניסה ' + fmtDate(a.lastLoginAt) : ''}</span>
      <span class="ag-actions">
        <button class="btn secondary sm" onclick="Admin.startEdit('${a.id}')">ערוך</button>
        <button class="btn secondary sm" onclick="Admin.toggleAgent('${a.id}')">${a.active ? 'השבת' : 'הפעל'}</button>
        <button class="btn vsd sm" onclick="Admin.removeAgent('${a.id}')">מחק</button>
      </span>
    </div>`;
  }

  function editRowHtml(a) {
    return `<div class="agent-row editing">
      <input id="edit-name-${a.id}" class="login-input sm" value="${escHtml(a.name || '')}" placeholder="שם">
      <input id="edit-email-${a.id}" class="login-input sm" type="email" value="${escHtml(a.email || '')}" placeholder="אימייל">
      <input id="edit-password-${a.id}" class="login-input sm" type="password" placeholder="סיסמה חדשה (ריק = ללא שינוי)">
      <input id="edit-phone-${a.id}" class="login-input sm" value="${escHtml(a.phone || '')}" placeholder="טלפון">
      <select id="edit-role-${a.id}" class="login-input sm">${roleOptions(a.role)}</select>
      <span class="ag-actions">
        <button class="btn primary sm" onclick="Admin.saveEdit('${a.id}')">שמור</button>
        <button class="btn reset sm" onclick="Admin.cancelEdit()">ביטול</button>
      </span>
      <div id="edit-error-${a.id}" class="req-error"></div>
    </div>`;
  }

  function searchAgents(v) { _agentSearch = v; renderAgentList(); }
  function startEdit(id) { _editingId = id; renderAgentList(); }
  function cancelEdit() { _editingId = null; renderAgentList(); }

  async function addAgent() {
    const fields = {
      name: document.getElementById('new-agent-name').value.trim(),
      email: document.getElementById('new-agent-email').value.trim(),
      password: document.getElementById('new-agent-password').value,
      phone: document.getElementById('new-agent-phone').value.trim(),
      role: document.getElementById('new-agent-role').value,
    };
    const err = document.getElementById('agent-add-error');
    if (!fields.password) { err.textContent = 'סיסמה חובה'; return; }
    const problem = Auth.validateAgentFields(fields, _agents);
    if (problem) { err.textContent = problem; return; }
    err.textContent = '';
    const passwordPatch = await Auth.hashPassword(fields.password);
    await VoltaDB.addAgent({
      name: fields.name, email: fields.email.toLowerCase(),
      passwordHash: passwordPatch.passwordHash, password: null,
      phone: fields.phone, role: fields.role, active: true, createdAt: Date.now(), lastLoginAt: null,
    });
    ['new-agent-name', 'new-agent-email', 'new-agent-password', 'new-agent-phone'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
  }

  async function saveEdit(id) {
    const agent = _agents.find(a => a.id === id);
    if (!agent) return;
    const fields = {
      name: document.getElementById('edit-name-' + id).value.trim(),
      email: document.getElementById('edit-email-' + id).value.trim(),
      password: document.getElementById('edit-password-' + id).value,
      phone: document.getElementById('edit-phone-' + id).value.trim(),
      role: document.getElementById('edit-role-' + id).value,
    };
    const err = document.getElementById('edit-error-' + id);
    const problem = Auth.validateAgentFields(fields, _agents, id);
    if (problem) { if (err) err.textContent = problem; return; }
    // Guard: don't demote the last active manager away from 'manager'.
    if (agent.role === 'manager' && fields.role !== 'manager' && Auth.isLastActiveManager(_agents, id)) {
      if (err) err.textContent = 'לא ניתן לשנות תפקיד של המנהל הפעיל האחרון';
      return;
    }
    const patch = { name: fields.name, email: fields.email.toLowerCase(), phone: fields.phone, role: fields.role };
    if (fields.password) {
      const passwordPatch = await Auth.hashPassword(fields.password);
      patch.passwordHash = passwordPatch.passwordHash;
      patch.password = null;
    } // empty = keep existing
    _editingId = null;
    await VoltaDB.updateAgent(id, patch);
  }

  async function toggleAgent(id) {
    const agent = _agents.find(a => a.id === id);
    if (!agent) return;
    if (agent.active && Auth.isLastActiveManager(_agents, id)) {
      alert('לא ניתן להשבית את המנהל הפעיל האחרון.');
      return;
    }
    await VoltaDB.updateAgent(id, { active: !agent.active });
  }

  async function removeAgent(id) {
    if (Auth.isLastActiveManager(_agents, id)) {
      alert('לא ניתן למחוק את המנהל הפעיל האחרון.');
      return;
    }
    if (!window.confirm('למחוק את הנציג? (עדיף להשבית כדי לשמור היסטוריית בקשות)')) return;
    if (_editingId === id) _editingId = null;
    await VoltaDB.deleteAgent(id);
  }

  function init() {
    // Double-click the logo opens the panel for the logged-in lead/manager.
    // (Login-gate bootstrap + header button are wired in app.js.)
    const logo = document.querySelector('.brand');
    if (logo) logo.addEventListener('dblclick', openForCurrentAgent);
    document.getElementById('admin-close').addEventListener('click', close);
    document.querySelectorAll('.admin-tab').forEach(t =>
      t.addEventListener('click', () => switchTab(t.dataset.atab)));

    VoltaDB.subscribeAgents(list => {
      _agents = list;
      // Refresh only the list (keeps the add-form's typed values intact).
      if (_open && _ctx === 'manager') renderAgentList();
    });
    VoltaDB.subscribeRequests(list => { _requests = list; if (_open) renderRequests(); });
  }

  return {
    init,
    openForCurrentAgent, bootstrap,
    filterReq, approve, reject,
    addAgent, saveEdit, toggleAgent, removeAgent, startEdit, cancelEdit, searchAgents,
    openRoofSettings,
  };
})();

function initManagerPanel() { Admin.init(); }
if (typeof window !== 'undefined') window.Admin = Admin;
