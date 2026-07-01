const ROLES = ['agent', 'lead', 'manager'];
const ALLOWED_FIELDS = ['name', 'email', 'phone', 'role', 'active', 'createdAt', 'lastLoginAt'];
const REQUIRED_FIELDS = ['name', 'email', 'role', 'active'];
const { validFirebaseUid } = require('./auth.js');

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function profilesFromPayload(payload) {
  const source = isPlainObject(payload) && isPlainObject(payload.agents) ? payload.agents : payload;
  if (Array.isArray(source)) {
    return source.map((entry, index) => {
      if (!isPlainObject(entry)) return { id: '', profile: entry, source: `agents[${index}]` };
      const id = String(entry.uid || entry.id || '').trim();
      const { uid, id: _id, ...profile } = entry;
      return { id, profile, source: `agents[${index}]` };
    });
  }
  if (isPlainObject(source)) {
    return Object.entries(source).map(([id, profile]) => ({
      id: String(id || '').trim(),
      profile,
      source: `agents.${id}`,
    }));
  }
  return [];
}

function validateProfile(id, profile, source) {
  const errors = [];
  const where = source || id || 'agent';
  if (!id) errors.push(`${where}: missing Firebase Auth uid/document id`);
  else if (!validFirebaseUid(id)) errors.push(`${where}: uid must be a safe Firebase Auth uid and Firestore document id`);
  if (!isPlainObject(profile)) return errors.concat(`${where}: profile must be an object`);

  const keys = Object.keys(profile);
  for (const field of REQUIRED_FIELDS) {
    if (!keys.includes(field)) errors.push(`${where}: missing required field ${field}`);
  }
  for (const field of keys) {
    if (!ALLOWED_FIELDS.includes(field)) errors.push(`${where}: unsupported field ${field}`);
  }
  if (keys.includes('password') || keys.includes('passwordHash')) {
    errors.push(`${where}: password material is forbidden in Firebase Auth profiles`);
  }

  if (typeof profile.name !== 'string' || !profile.name.trim()) errors.push(`${where}: name must be a non-empty string`);
  else if (profile.name.length > 120) errors.push(`${where}: name is longer than 120 characters`);

  if (typeof profile.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email.trim())) {
    errors.push(`${where}: email is invalid`);
  } else if (profile.email.length > 254) {
    errors.push(`${where}: email is longer than 254 characters`);
  } else if (profile.email !== profile.email.trim() || profile.email !== profile.email.toLowerCase()) {
    errors.push(`${where}: email must be trimmed and lowercase`);
  }

  if (!ROLES.includes(profile.role)) errors.push(`${where}: role must be one of ${ROLES.join(', ')}`);
  if (typeof profile.active !== 'boolean') errors.push(`${where}: active must be boolean`);
  if (keys.includes('phone') && (typeof profile.phone !== 'string' || profile.phone.length > 40)) {
    errors.push(`${where}: phone must be a string up to 40 characters`);
  }
  if (keys.includes('createdAt') && typeof profile.createdAt !== 'number') {
    errors.push(`${where}: createdAt must be a number timestamp`);
  }
  if (keys.includes('lastLoginAt') && !(typeof profile.lastLoginAt === 'number' || profile.lastLoginAt === null)) {
    errors.push(`${where}: lastLoginAt must be a number timestamp or null`);
  }
  return errors;
}

function validateProfilesPayload(payload) {
  const entries = profilesFromPayload(payload);
  const errors = [];
  if (!entries.length) errors.push('agents payload must be a non-empty array, map, or { "agents": { ... } } object');

  const seenEmails = new Map();
  const seenUids = new Map();
  let activeManagers = 0;
  for (const entry of entries) {
    errors.push(...validateProfile(entry.id, entry.profile, entry.source));
    if (entry.id) {
      if (seenUids.has(entry.id)) errors.push(`${entry.source}: duplicate uid also used by ${seenUids.get(entry.id)}`);
      else seenUids.set(entry.id, entry.source);
    }
    if (isPlainObject(entry.profile)) {
      const email = String(entry.profile.email || '').trim().toLowerCase();
      if (email) {
        if (seenEmails.has(email)) errors.push(`${entry.source}: duplicate email also used by ${seenEmails.get(email)}`);
        else seenEmails.set(email, entry.source);
      }
      if (entry.profile.role === 'manager' && entry.profile.active === true) activeManagers += 1;
    }
  }
  if (!activeManagers) errors.push('at least one active manager profile is required');
  return { ok: errors.length === 0, errors, count: entries.length, activeManagers };
}

module.exports = { validateProfilesPayload, profilesFromPayload, validateProfile };
