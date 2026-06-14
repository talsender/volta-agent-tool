// Pure logic for exception requests. No DOM, no Firebase — unit-testable in Node.
const Requests = (() => {
  function normalizeName(str) {
    if (!str) return '';
    return str
      .toLowerCase()
      .replace(/['"״׳]/g, '')
      .replace(/[-–—]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // overrides: { [normalizedName]: { status, note, updatedBy, updatedAt } }
  function mergeOverrides(settlements, overrides) {
    if (!overrides) return settlements;
    return settlements.map(s => {
      const ov = overrides[normalizeName(s.name)];
      if (!ov) return s;
      return Object.assign({}, s, {
        status: ov.status != null ? ov.status : s.status,
        note: ov.note != null ? ov.note : s.note,
        overridden: true,
      });
    });
  }

  function buildRequest({ type, agent, subject, reason, context }) {
    if (!agent || !agent.id) throw new Error('agent required');
    if (!reason || !reason.trim()) throw new Error('reason required');
    if (type !== 'settlement' && type !== 'roof') throw new Error('invalid type');
    return {
      type,
      agentId: agent.id,
      agentName: agent.name || '',
      subject: subject || '',
      reason: reason.trim(),
      context: context || {},
      status: 'pending',
      resolution: null,
      managerNote: '',
      createdAt: Date.now(),
      resolvedAt: null,
    };
  }

  // decision: { action: 'approve'|'reject', resolution?: 'one-off'|'permanent', managerNote? }
  function decideRequest(request, decision) {
    const now = Date.now();
    if (decision.action === 'reject') {
      return { status: 'rejected', resolution: null, managerNote: decision.managerNote || '', resolvedAt: now };
    }
    if (decision.action === 'approve') {
      const resolution = decision.resolution === 'permanent' ? 'permanent' : 'one-off';
      return { status: 'approved', resolution, managerNote: decision.managerNote || '', resolvedAt: now };
    }
    throw new Error('invalid action');
  }

  // For permanent settlement approval, compute the override doc to write.
  function overrideFromApproval(request, newStatus, managerName) {
    if (request.type !== 'settlement') return null;
    return {
      key: normalizeName(request.subject),
      value: { status: newStatus, note: request.reason, updatedBy: managerName || '', updatedAt: Date.now() },
    };
  }

  return { normalizeName, mergeOverrides, buildRequest, decideRequest, overrideFromApproval };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Requests;
if (typeof window !== 'undefined') window.Requests = Requests;
