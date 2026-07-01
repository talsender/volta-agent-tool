const { profilesFromPayload, validateProfilesPayload } = require('./firebase-auth-profiles.js');

const ROLES = ['agent', 'lead', 'manager'];
const ALLOWED_CLAIM_FIELDS = ['role'];

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function claimsFromPayload(payload) {
  const source = isPlainObject(payload) && isPlainObject(payload.claims) ? payload.claims : payload;
  if (Array.isArray(source)) {
    return source.map((entry, index) => {
      if (!isPlainObject(entry)) return { uid: '', claims: entry, source: `claims[${index}]` };
      const uid = String(entry.uid || entry.id || '').trim();
      const { uid: _uid, id: _id, ...claims } = entry;
      return { uid, claims, source: `claims[${index}]` };
    });
  }
  if (isPlainObject(source)) {
    return Object.entries(source).map(([uid, claims]) => ({
      uid: String(uid || '').trim(),
      claims,
      source: `claims.${uid}`,
    }));
  }
  return [];
}

function validateClaimsPayload(claimsPayload, profilesPayload) {
  const profileResult = validateProfilesPayload(profilesPayload);
  const profileEntries = profilesFromPayload(profilesPayload);
  const profileByUid = new Map(profileEntries.map(entry => [entry.id, entry.profile]));
  const claimEntries = claimsFromPayload(claimsPayload);
  const errors = [...profileResult.errors];

  if (!claimEntries.length) errors.push('claims payload must be a non-empty array, map, or { "claims": { ... } } object');

  const seen = new Set();
  for (const entry of claimEntries) {
    if (!entry.uid) errors.push(`${entry.source}: missing Firebase Auth uid`);
    if (seen.has(entry.uid)) errors.push(`${entry.source}: duplicate uid claim entry`);
    seen.add(entry.uid);
    if (!isPlainObject(entry.claims)) {
      errors.push(`${entry.source}: claims must be an object`);
      continue;
    }
    for (const field of Object.keys(entry.claims)) {
      if (!ALLOWED_CLAIM_FIELDS.includes(field)) errors.push(`${entry.source}: unsupported claim field ${field}`);
    }
    if (!ROLES.includes(entry.claims.role)) errors.push(`${entry.source}: role claim must be one of ${ROLES.join(', ')}`);
    const profile = profileByUid.get(entry.uid);
    if (!profile) {
      errors.push(`${entry.source}: no matching agents/{uid} profile`);
    } else if (profile.role !== entry.claims.role) {
      errors.push(`${entry.source}: role claim ${entry.claims.role} does not match profile role ${profile.role}`);
    }
  }

  for (const entry of profileEntries) {
    if (entry.id && !seen.has(entry.id)) errors.push(`${entry.source}: missing matching custom claims entry`);
  }

  return { ok: errors.length === 0, errors, count: claimEntries.length };
}

module.exports = { validateClaimsPayload, claimsFromPayload };
