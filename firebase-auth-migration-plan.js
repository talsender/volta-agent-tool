const { profilesFromPayload, validateProfilesPayload } = require('./firebase-auth-profiles.js');
const { claimsFromPayload, validateClaimsPayload } = require('./firebase-auth-claims.js');

function buildMigrationPlan(profilesPayload, claimsPayload) {
  const profileResult = validateProfilesPayload(profilesPayload);
  const claimsResult = validateClaimsPayload(claimsPayload, profilesPayload);
  const errors = [...new Set([...profileResult.errors, ...claimsResult.errors])];
  if (errors.length) return { ok: false, errors };

  const profiles = profilesFromPayload(profilesPayload);
  const claimsByUid = new Map(claimsFromPayload(claimsPayload).map(entry => [entry.uid, entry.claims]));
  const authUsers = profiles.map(({ id, profile }) => ({
    uid: id,
    email: profile.email,
    displayName: profile.name,
    disabled: profile.active === false,
  }));
  const customClaims = profiles.map(({ id }) => ({
    uid: id,
    claims: claimsByUid.get(id),
  }));
  const firestoreAgents = profiles.map(({ id, profile }) => ({
    path: `agents/${id}`,
    data: profile,
  }));

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    counts: {
      authUsers: authUsers.length,
      customClaims: customClaims.length,
      firestoreAgents: firestoreAgents.length,
    },
    authUsers,
    customClaims,
    firestoreAgents,
    checklist: [
      'Create Firebase Auth users with the listed uid/email/displayName/disabled values.',
      'Set each user custom claims object exactly as listed.',
      'Write each Firestore agents/{uid} profile exactly as listed.',
      'Deploy firestore.rules only after Auth users, claims, and profiles exist.',
      "Set CONFIG.AUTH_MODE to 'firebase' and run npm run verify:deploy.",
    ],
  };
}

module.exports = { buildMigrationPlan };
