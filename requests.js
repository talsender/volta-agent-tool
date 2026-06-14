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

  return { normalizeName, mergeOverrides };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Requests;
if (typeof window !== 'undefined') window.Requests = Requests;
