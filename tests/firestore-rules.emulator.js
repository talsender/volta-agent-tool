const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} = require('@firebase/rules-unit-testing');
const {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setLogLevel,
  setDoc,
  updateDoc,
  writeBatch,
} = require('firebase/firestore');

const ROOT = path.join(__dirname, '..');
const PROJECT_ID = 'demo-volta-rules';

setLogLevel('silent');

let env;

function ctx(uid, role) {
  return env.authenticatedContext(uid, { role }).firestore();
}

function anonymous() {
  return env.unauthenticatedContext().firestore();
}

function agentProfile(overrides = {}) {
  return {
    name: 'Agent One',
    email: 'agent@example.com',
    phone: '0500000000',
    role: 'agent',
    active: true,
    createdAt: 1700000000000,
    lastLoginAt: null,
    ...overrides,
  };
}

function pendingRequest(overrides = {}) {
  return {
    type: 'settlement',
    agentId: 'agent-1',
    agentName: 'Agent One',
    subject: 'Test settlement',
    reason: 'Needs review',
    requestedStatus: 'מתקינים',
    context: {},
    status: 'pending',
    resolution: null,
    managerNote: '',
    createdAt: 1700000000000,
    resolvedAt: null,
    ...overrides,
  };
}

function validRoofConfig(overrides = {}) {
  return {
    totalSizeThresholds: { good: 200, borderline: 80 },
    tilesAgeWarning: 25,
    managerPassword: '',
    materials: [
      {
        id: 'concrete',
        label: 'Concrete',
        baseAction: 'ok',
        sizeRules: [],
      },
    ],
    updatedAt: 1700000000000,
    ...overrides,
  };
}

function validSettlementOverride(overrides = {}) {
  return {
    status: pendingRequest().requestedStatus,
    note: 'Approved permanently',
    updatedBy: 'Manager One',
    updatedAt: 1700000000000,
    ...overrides,
  };
}

test.before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8'),
    },
  });
});

test.after(async () => {
  if (env) await env.cleanup();
});

async function clearKnownCollections(db) {
  for (const name of ['agents', 'requests', 'roofConfig', 'settlementOverrides', 'auditLogs']) {
    const snap = await getDocs(collection(db, name));
    const batch = writeBatch(db);
    snap.docs.forEach(docSnap => batch.delete(docSnap.ref));
    if (!snap.empty) await batch.commit();
  }
}

test.beforeEach(async () => {
  await env.withSecurityRulesDisabled(async context => {
    await clearKnownCollections(context.firestore());
  });
});

test('agent profiles require auth scope and reject password material', async () => {
  const managerDb = ctx('manager-1', 'manager');
  const agentDb = ctx('agent-1', 'agent');
  const strangerDb = ctx('agent-2', 'agent');

  await assertSucceeds(setDoc(doc(managerDb, 'agents/agent-1'), agentProfile()));
  await assertSucceeds(getDoc(doc(agentDb, 'agents/agent-1')));
  await assertFails(getDoc(doc(strangerDb, 'agents/agent-1')));
  await assertFails(getDoc(doc(anonymous(), 'agents/agent-1')));
  await assertFails(setDoc(doc(managerDb, 'agents/agent-2'), agentProfile({
    email: 'agent2@example.com',
    passwordHash: 'forbidden',
  })));
  await assertFails(deleteDoc(doc(managerDb, 'agents/agent-1')));
});

test('agents can update only their own last login timestamp', async () => {
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'agents/agent-1'), agentProfile());
    await setDoc(doc(db, 'agents/agent-2'), agentProfile({
      name: 'Agent Two',
      email: 'agent2@example.com',
    }));
  });

  const agentDb = ctx('agent-1', 'agent');

  await assertSucceeds(updateDoc(doc(agentDb, 'agents/agent-1'), {
    lastLoginAt: 1700000000002,
  }));
  await assertFails(updateDoc(doc(agentDb, 'agents/agent-1'), {
    active: false,
  }));
  await assertFails(updateDoc(doc(agentDb, 'agents/agent-2'), {
    lastLoginAt: 1700000000002,
  }));
});

test('agents can create only their own pending requests', async () => {
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'agents/agent-1'), agentProfile());
    await setDoc(doc(db, 'agents/inactive-agent'), agentProfile({
      name: 'Inactive Agent',
      email: 'inactive@example.com',
      active: false,
    }));
    await setDoc(doc(db, 'agents/lead-profile'), agentProfile({
      name: 'Lead Profile',
      email: 'lead-profile@example.com',
      role: 'lead',
    }));
  });

  const agentDb = ctx('agent-1', 'agent');
  const noProfileDb = ctx('missing-agent', 'agent');
  const inactiveDb = ctx('inactive-agent', 'agent');
  const mismatchedRoleDb = ctx('lead-profile', 'agent');

  await assertSucceeds(setDoc(doc(agentDb, 'requests/request-1'), pendingRequest()));
  await assertFails(setDoc(doc(agentDb, 'requests/request-2'), pendingRequest({
    agentId: 'agent-2',
  })));
  await assertFails(setDoc(doc(agentDb, 'requests/request-name-mismatch'), pendingRequest({
    agentName: 'Different Name',
  })));
  await assertFails(setDoc(doc(agentDb, 'requests/request-context-extra'), pendingRequest({
    context: { status: 'check', rawCustomerNote: 'not allowed here' },
  })));
  await assertFails(setDoc(doc(agentDb, 'requests/request-context-large'), pendingRequest({
    context: { status: 'x'.repeat(121) },
  })));
  await assertSucceeds(setDoc(doc(agentDb, 'requests/request-roof'), pendingRequest({
    type: 'roof',
    subject: 'Roof check',
    requestedStatus: null,
    context: { outcome: 'go-notes', answers: [{ q: 'roof', a: 'concrete' }] },
  })));
  await assertFails(setDoc(doc(agentDb, 'requests/request-roof-extra'), pendingRequest({
    type: 'roof',
    subject: 'Roof check',
    requestedStatus: null,
    context: { outcome: 'go-notes', answers: [], extra: true },
  })));
  await assertFails(setDoc(doc(noProfileDb, 'requests/request-no-profile'), pendingRequest({
    agentId: 'missing-agent',
  })));
  await assertFails(setDoc(doc(inactiveDb, 'requests/request-inactive'), pendingRequest({
    agentId: 'inactive-agent',
    agentName: 'Inactive Agent',
  })));
  await assertFails(setDoc(doc(mismatchedRoleDb, 'requests/request-role-mismatch'), pendingRequest({
    agentId: 'lead-profile',
    agentName: 'Lead Profile',
  })));
  await assertFails(setDoc(doc(agentDb, 'requests/request-3'), pendingRequest({
    status: 'approved',
    resolution: 'one-off',
    managerNote: 'Nope',
    resolvedAt: 1700000000001,
  })));
});

test('review decisions are scoped by role and pending state', async () => {
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'requests/request-1'), pendingRequest());
    await setDoc(doc(db, 'requests/request-2'), pendingRequest());
    await setDoc(doc(db, 'requests/request-3'), pendingRequest({
      status: 'approved',
      resolution: 'one-off',
      managerNote: 'Already done',
      resolvedAt: 1700000000001,
    }));
  });

  const leadDb = ctx('lead-1', 'lead');
  const managerDb = ctx('manager-1', 'manager');

  await assertSucceeds(updateDoc(doc(leadDb, 'requests/request-1'), {
    status: 'approved',
    resolution: 'one-off',
    managerNote: 'Approved once',
    resolvedAt: 1700000000002,
  }));
  await assertFails(updateDoc(doc(leadDb, 'requests/request-2'), {
    status: 'approved',
    resolution: 'permanent',
    managerNote: 'Permanent approval',
    resolvedAt: 1700000000002,
  }));
  await assertSucceeds(updateDoc(doc(managerDb, 'requests/request-2'), {
    status: 'approved',
    resolution: 'permanent',
    managerNote: 'Permanent approval',
    resolvedAt: 1700000000002,
  }));
  await assertFails(updateDoc(doc(managerDb, 'requests/request-3'), {
    managerNote: 'Cannot re-review',
  }));
});

test('roof config is default-only, manager-only, and password-free', async () => {
  const managerDb = ctx('manager-1', 'manager');
  const leadDb = ctx('lead-1', 'lead');

  await assertSucceeds(setDoc(doc(managerDb, 'roofConfig/default'), validRoofConfig()));
  await assertFails(setDoc(doc(leadDb, 'roofConfig/default'), validRoofConfig()));
  await assertFails(setDoc(doc(managerDb, 'roofConfig/other'), validRoofConfig()));
  await assertFails(setDoc(doc(managerDb, 'roofConfig/default'), validRoofConfig({
    managerPassword: ['not', 'empty'].join('-'),
  })));
  await assertFails(deleteDoc(doc(managerDb, 'roofConfig/default')));
});

test('settlement overrides are manager-only and schema-limited', async () => {
  const managerDb = ctx('manager-1', 'manager');
  const leadDb = ctx('lead-1', 'lead');
  const agentDb = ctx('agent-1', 'agent');

  await assertSucceeds(setDoc(doc(managerDb, 'settlementOverrides/City A'), validSettlementOverride()));
  await assertSucceeds(getDoc(doc(agentDb, 'settlementOverrides/City A')));
  await assertFails(setDoc(doc(leadDb, 'settlementOverrides/City B'), validSettlementOverride()));
  await assertFails(setDoc(doc(managerDb, 'settlementOverrides/City C'), validSettlementOverride({
    status: 'unsupported',
  })));
  await assertFails(setDoc(doc(managerDb, 'settlementOverrides/City D'), validSettlementOverride({
    extra: true,
  })));
  await assertFails(deleteDoc(doc(leadDb, 'settlementOverrides/City A')));
  await assertSucceeds(deleteDoc(doc(managerDb, 'settlementOverrides/City A')));
});

test('audit logs are append-only and reserved for lead or manager actors', async () => {
  const leadDb = ctx('lead-1', 'lead');
  const agentDb = ctx('agent-1', 'agent');

  const event = {
    action: 'request.approve',
    targetType: 'request',
    targetId: 'request-1',
    actorId: 'lead-1',
    actorName: 'Lead One',
    actorRole: 'lead',
    details: {},
    createdAt: 1700000000000,
  };

  await assertSucceeds(setDoc(doc(leadDb, 'auditLogs/event-1'), event));
  await assertSucceeds(setDoc(doc(leadDb, 'auditLogs/event-typed-details'), {
    ...event,
    details: {
      type: 'settlement',
      subject: 'City A',
      resolution: 'one-off',
      permanentOverride: false,
    },
  }));
  await assertFails(setDoc(doc(agentDb, 'auditLogs/event-2'), {
    ...event,
    actorId: 'agent-1',
    actorRole: 'agent',
  }));
  await assertFails(setDoc(doc(leadDb, 'auditLogs/event-extra-details'), {
    ...event,
    details: { rawPayload: { too: 'wide' } },
  }));
  await assertFails(setDoc(doc(leadDb, 'auditLogs/event-large-details'), {
    ...event,
    details: { subject: 'x'.repeat(501) },
  }));
  await assertFails(updateDoc(doc(leadDb, 'auditLogs/event-1'), {
    actorName: 'Changed',
  }));
});
