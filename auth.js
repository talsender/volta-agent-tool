// Agent identity. Pure helper (findAgentByCode) + browser session helpers (localStorage).
const Auth = (() => {
  const STORAGE_KEY = 'volta_agent';

  function findAgentByCode(agents, code) {
    if (!code) return null;
    const c = String(code).trim();
    return agents.find(a => a.code === c && a.active) || null;
  }

  function getCurrentAgent() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function setCurrentAgent(agent) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ id: agent.id, name: agent.name }));
  }

  function logout() {
    localStorage.removeItem(STORAGE_KEY);
  }

  return { findAgentByCode, getCurrentAgent, setCurrentAgent, logout };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Auth;
if (typeof window !== 'undefined') window.Auth = Auth;
