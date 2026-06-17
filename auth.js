// Agent identity + role capabilities.
// Pure helpers (findAgentByCredentials, can, roleLabel, lastManagerGuard) are
// unit-tested in Node; the session helpers use localStorage (browser only).
const Auth = (() => {
  const STORAGE_KEY = 'volta_agent';

  const ROLES = ['agent', 'lead', 'manager'];
  const ROLE_LABELS = { agent: 'נציג', lead: 'ראש צוות', manager: 'מנהל' };

  // Capability matrix per role. agent < lead < manager.
  const CAPS = {
    agent:   { request: true },
    lead:    { request: true, reviewRequests: true },
    manager: { request: true, reviewRequests: true, manageAgents: true, roofSettings: true },
  };

  function roleLabel(role) { return ROLE_LABELS[role] || role || ''; }

  // Match an active agent by email (case-insensitive) + exact password.
  function findAgentByCredentials(agents, email, password) {
    if (!email || !password) return null;
    const e = String(email).trim().toLowerCase();
    const p = String(password);
    return agents.find(a =>
      a.active &&
      String(a.email || '').trim().toLowerCase() === e &&
      String(a.password || '') === p
    ) || null;
  }

  function can(agent, capability) {
    if (!agent || !agent.role) return false;
    const caps = CAPS[agent.role];
    return !!(caps && caps[capability]);
  }

  // Guard: would disabling/removing `agentId` leave zero active managers?
  // Returns true when the action is BLOCKED (it's the last active manager).
  function isLastActiveManager(agents, agentId) {
    const activeManagers = agents.filter(a => a.role === 'manager' && a.active);
    return activeManagers.length === 1 && activeManagers[0].id === agentId;
  }

  // Validate agent fields for add/edit. On edit, pass ignoreId to skip the
  // agent's own email in the uniqueness check, and an empty password means
  // "keep existing". Returns an error string, or null when valid.
  function validateAgentFields(fields, agents, ignoreId) {
    const name = (fields.name || '').trim();
    const email = (fields.email || '').trim();
    const role = fields.role;
    const password = fields.password;
    if (!name) return 'שם חובה';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'אימייל לא תקין';
    if (!ROLES.includes(role)) return 'תפקיד לא תקין';
    if (password != null && password !== '' && String(password).length < 4) {
      return 'סיסמה קצרה מדי (מינימום 4 תווים)';
    }
    const e = email.toLowerCase();
    if ((agents || []).some(a => a.id !== ignoreId && String(a.email || '').trim().toLowerCase() === e)) {
      return 'אימייל כבר קיים';
    }
    return null;
  }

  function getCurrentAgent() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function setCurrentAgent(agent) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      id: agent.id, name: agent.name, role: agent.role, email: agent.email,
    }));
  }

  function logout() {
    localStorage.removeItem(STORAGE_KEY);
  }

  return {
    findAgentByCredentials, can, roleLabel, isLastActiveManager, validateAgentFields,
    getCurrentAgent, setCurrentAgent, logout,
    ROLES, ROLE_LABELS, CAPS,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Auth;
if (typeof window !== 'undefined') window.Auth = Auth;
