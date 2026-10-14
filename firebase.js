/* =====================================================
   FIREBASE CONFIG — Fare App 24
   Project: fare-app-24
   ===================================================== */
const firebaseConfig = {
  apiKey: "AIzaSyAs3pQnBIoLxX1mdb_LBPm9nT9FtvCk3wY",
  authDomain: "fare-app-24.firebaseapp.com",
  projectId: "fare-app-24",
  storageBucket: "fare-app-24.firebasestorage.app",
  messagingSenderId: "908872903059",
  appId: "1:908872903059:web:fd2b38aa5933b8b017e066",
  measurementId: "G-S89G87ZQ96"
};

/* =====================================================
   INITIALIZE FIREBASE (compat mode for <script> tags)
   ===================================================== */
firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();
const FieldValue = firebase.firestore.FieldValue;

/* =====================================================
   ANALYTICS (optional, safe-guarded)
   ===================================================== */
try {
  if (firebase.analytics) firebase.analytics();
} catch (e) {
  console.warn('⚠️ Analytics skipped:', e.message);
}

/* =====================================================
   OFFLINE PERSISTENCE — multi-tab safe
   Data local cache mein rahega, network wapas aane par sync
   ===================================================== */
db.enablePersistence({ synchronizeTabs: true }).catch(err => {
  if (err.code === 'failed-precondition') {
    console.warn('⚠️ Persistence: multiple tabs open');
  } else if (err.code === 'unimplemented') {
    console.warn('⚠️ Persistence: browser not supported');
  }
});

/* =====================================================
   AUTO-CLEANUP: Trips older than 3 months
   Har login pe ek dafa chalega — batch delete
   ===================================================== */
async function cleanupOldTrips(userId) {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 3);
  const cutoffISO = cutoff.toISOString().slice(0, 10);

  try {
    // Single where clause only (uid) — avoids composite index requirement
    const snap = await db.collection('trips')
      .where('uid', '==', userId)
      .get();

    if (snap.empty) return 0;

    // Client-side filter (safe + index-free)
    const toDelete = snap.docs.filter(d => {
      const dateStr = d.data().date || '';
      return dateStr && dateStr < cutoffISO;
    });

    if (!toDelete.length) return 0;

    // Firestore batch limit = 500; chunk if needed
    const chunks = [];
    for (let i = 0; i < toDelete.length; i += 450) {
      chunks.push(toDelete.slice(i, i + 450));
    }

    let totalDeleted = 0;
    for (const chunk of chunks) {
      const batch = db.batch();
      chunk.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
      totalDeleted += chunk.length;
    }

    return totalDeleted;
  } catch (err) {
    console.warn('⚠️ Cleanup skipped:', err.message);
    return 0;
  }
}

/* =====================================================
   SAFE TRIP LOADER (History bug fix)
   
   ROOT CAUSE:
   Query: where('uid','==',uid).orderBy('date','desc')
   → Requires COMPOSITE INDEX in Firestore.
   Bina index ke query SILENTLY fail hoti hai → empty array.
   
   SOLUTION:
   1. Try indexed query first (best performance)
   2. Fallback: fetch by uid only + client-side sort
   ===================================================== */
async function loadTripsSafe(userId, limit = 200) {
  // ---- Attempt 1: Indexed query ----
  try {
    const snap = await db.collection('trips')
      .where('uid', '==', userId)
      .orderBy('date', 'desc')
      .limit(limit)
      .get();

    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.warn('⚠️ Indexed query failed (composite index likely missing). Falling back…', err.code || err.message);
  }

  // ---- Fallback: No orderBy, sort client-side ----
  try {
    const snap = await db.collection('trips')
      .where('uid', '==', userId)
      .limit(limit)
      .get();

    const trips = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Client-side sort: newest date first, then by createdAt
    trips.sort((a, b) => {
      const dateCmp = (b.date || '').localeCompare(a.date || '');
      if (dateCmp !== 0) return dateCmp;
      const aT = a.createdAt?.seconds || 0;
      const bT = b.createdAt?.seconds || 0;
      return bT - aT;
    });

    return trips;
  } catch (err) {
    console.error('❌ Trip load failed entirely:', err);
    return [];
  }
}

/* =====================================================
   DEFAULT CONFIG (Fallback when user config missing)
   ===================================================== */
const DEFAULT_VEHICLES = ['Bus', 'Mini Bus', 'Coaster Bus', 'Van', 'Carry'];
const DEFAULT_BATCHES  = ['24', '25', '26'];
const DEFAULT_BOYS     = [];   // [{ name: '', batch: '' }]

/* =====================================================
   USER CONFIG HELPERS
   ===================================================== */
async function loadUserConfigSafe(userId) {
  try {
    const doc = await db.collection('configs').doc(userId).get();

    if (!doc.exists) {
      // First-time user: create defaults
      const defaults = {
        vehicles: [...DEFAULT_VEHICLES],
        batches: [...DEFAULT_BATCHES],
        boys: [...DEFAULT_BOYS],
        updatedAt: FieldValue.serverTimestamp()
      };
      await db.collection('configs').doc(userId).set(defaults);
      return defaults;
    }

    const d = doc.data();
    return {
      vehicles: Array.isArray(d.vehicles) && d.vehicles.length ? d.vehicles : [...DEFAULT_VEHICLES],
      batches:  Array.isArray(d.batches)  && d.batches.length  ? d.batches  : [...DEFAULT_BATCHES],
      boys:     Array.isArray(d.boys)                          ? d.boys     : [],
      updatedAt: d.updatedAt || null
    };
  } catch (err) {
    console.warn('⚠️ Config load failed:', err.message);
    return {
      vehicles: [...DEFAULT_VEHICLES],
      batches:  [...DEFAULT_BATCHES],
      boys:     []
    };
  }
}

async function saveUserConfigSafe(userId, config) {
  try {
    await db.collection('configs').doc(userId).set({
      vehicles: config.vehicles || [],
      batches:  config.batches  || [],
      boys:     config.boys     || [],
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    return true;
  } catch (err) {
    console.error('❌ Config save failed:', err);
    return false;
  }
}

/* =====================================================
   TRIP SAVE HELPER
   Ensures consistent schema + timestamp
   ===================================================== */
async function saveTripSafe(userId, payload) {
  try {
    const docRef = await db.collection('trips').add({
      ...payload,
      uid: userId,
      createdAt: FieldValue.serverTimestamp()
    });
    return docRef.id;
  } catch (err) {
    console.error('❌ Trip save failed:', err);
    throw err;
  }
}

/* =====================================================
   TRIP DELETE HELPER
   ===================================================== */
async function deleteTripSafe(tripId) {
  try {
    await db.collection('trips').doc(tripId).delete();
    return true;
  } catch (err) {
    console.error('❌ Trip delete failed:', err);
    return false;
  }
}

/* =====================================================
   GLOBAL EXPOSE (for app.js console debugging)
   ===================================================== */
window.__ff = {
  auth,
  db,
  FieldValue,
  cleanupOldTrips,
  loadTripsSafe,
  loadUserConfigSafe,
  saveUserConfigSafe,
  saveTripSafe,
  deleteTripSafe,
  DEFAULT_VEHICLES,
  DEFAULT_BATCHES
};

console.log('%c🚀 FareFlow Firebase ready', 'color:#f6d365;font-weight:bold;');