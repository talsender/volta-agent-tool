// Firestore data layer for agents, requests, settlementOverrides.
// Loaded after the Firebase SDK modular CDN (see index.html).
const VoltaDB = (() => {
  let _db = null;
  let _ok = false;

  function init() {
    try {
      const app = firebase.initializeApp(CONFIG.FIREBASE_CONFIG);
      _db = firebase.getFirestore(app);
      _ok = true;
    } catch (e) {
      console.warn('Firebase init failed:', e);
      _ok = false;
    }
    return _ok;
  }

  function ready() { return _ok; }

  // ---- agents ----
  function subscribeAgents(cb) {
    if (!_ok) { cb([]); return () => {}; }
    return firebase.onSnapshot(firebase.collection(_db, 'agents'), snap => {
      cb(snap.docs.map(d => Object.assign({ id: d.id }, d.data())));
    }, err => { console.warn('agents listen error', err); cb([]); });
  }
  function addAgent(agent) {
    return firebase.addDoc(firebase.collection(_db, 'agents'), agent);
  }
  function updateAgent(id, patch) {
    return firebase.updateDoc(firebase.doc(_db, 'agents', id), patch);
  }
  function deleteAgent(id) {
    return firebase.deleteDoc(firebase.doc(_db, 'agents', id));
  }

  // ---- requests ----
  function subscribeRequests(cb) {
    if (!_ok) { cb([]); return () => {}; }
    return firebase.onSnapshot(firebase.collection(_db, 'requests'), snap => {
      cb(snap.docs.map(d => Object.assign({ id: d.id }, d.data())));
    }, err => { console.warn('requests listen error', err); cb([]); });
  }
  function addRequest(req) {
    return firebase.addDoc(firebase.collection(_db, 'requests'), req);
  }
  function updateRequest(id, patch) {
    return firebase.updateDoc(firebase.doc(_db, 'requests', id), patch);
  }

  // ---- settlementOverrides ----
  // Returns a plain map { normalizedName: {status,note,...} } once.
  async function loadOverrides() {
    if (!_ok) return {};
    try {
      const snap = await firebase.getDocs(firebase.collection(_db, 'settlementOverrides'));
      const map = {};
      snap.docs.forEach(d => { map[d.id] = d.data(); });
      return map;
    } catch (e) { console.warn('overrides load error', e); return {}; }
  }
  function setOverride(key, value) {
    return firebase.setDoc(firebase.doc(_db, 'settlementOverrides', key), value);
  }

  return {
    init, ready,
    subscribeAgents, addAgent, updateAgent, deleteAgent,
    subscribeRequests, addRequest, updateRequest,
    loadOverrides, setOverride,
  };
})();

if (typeof window !== 'undefined') window.VoltaDB = VoltaDB;
