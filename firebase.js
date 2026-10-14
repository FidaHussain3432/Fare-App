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
   ===================================================== */
db.enablePersistence({ synchronizeTabs: true }).catch(err => {
  if (err.code === 'failed-precondition') {
    console.warn('⚠️ Persistence: multiple tabs open');
  } else if (err.code === 'unimplemented') {
    console.warn('⚠️ Persistence: browser not supported');
  }
});

/* =====================================================
   COLLECTIONS REFERENCE
   =====================================================
   users     → { uid, email, createdAt, lastLogin }
   admins    → { uid, email, grantedAt, grantedBy }
   configs   → { uid, vehicles, batches, boys, updatedAt }
   trips     → { uid, date, vehicles, boys, ... }
   ===================================================== */
const COL_USERS   = 'users';
const COL_ADMINS  = 'admins';
const COL_CONFIGS = 'configs';
const COL_TRIPS   = 'trips';

/* =====================================================
   CONSTANTS
   ===================================================== */
const DEFAULT_VEHICLES = ['Bus', 'Mini Bus', 'Coaster Bus', 'Van', 'Carry'];
const DEFAULT_BATCHES  = ['24', '25', '26'];
const DEFAULT_BOYS     = [];

const SUPER_ADMIN_EMAILS = [
  'fh87022@gmail.com'
];

/* =====================================================
   USER REGISTRATION — called on every login
   Saves/updates user record in `users` collection.
   First ever user → auto admin (bootstrap).
   ===================================================== */
async function registerUserSafe(user) {
  if (!user || !user.uid) return null;

  const userRef = db.collection(COL_USERS).doc(user.uid);
  const emailLower = (user.email || '').toLowerCase();

  try {
    const snap = await userRef.get();
    const now = FieldValue.serverTimestamp();

    if (!snap.exists) {
      await userRef.set({
        uid: user.uid,
        email: user.email || '',
        displayName: user.displayName || '',
        createdAt: now,
        lastLogin: now
      });
    } else {
      await userRef.set({
        email: user.email || '',
        lastLogin: now
      }, { merge: true });
    }

    /* ---------- ADMIN BOOTSTRAP LOGIC ---------- */

    // Case 1: Super-admin email list mein hai → auto-grant (hamesha)
    if (SUPER_ADMIN_EMAILS.map(e => e.toLowerCase()).includes(emailLower)) {
      const already = await isAdmin(user.uid);
      if (!already) {
        await grantAdmin(user.uid, user.email, 'super-admin-list');
        console.log('👑 Super-admin auto-granted:', user.email);
      }
      return true;
    }

    // Case 2: Koi bhi admin nahi hai → pehle aane wale ko bootstrap admin banao
    // (Fallback safety — agar super-admin abhi tak login nahi hua)
    const anyAdmin = await hasAnyAdmin();
    if (!anyAdmin) {
      await grantAdmin(user.uid, user.email, 'system-bootstrap');
      console.log('👑 Bootstrap admin granted (no admin existed):', user.email);
    }

    // Case 3: Warna kuch nahi — pending user rahega
    return true;
  } catch (err) {
    console.error('❌ registerUserSafe failed:', err);
    return null;
  }
}

/* =====================================================
   ADMIN CHECKS
   ===================================================== */
async function isAdmin(uid) {
  if (!uid) return false;
  try {
    const doc = await db.collection(COL_ADMINS).doc(uid).get();
    return doc.exists;
  } catch (err) {
    console.warn('⚠️ isAdmin check failed:', err.message);
    return false;
  }
}

async function hasAnyAdmin() {
  try {
    const snap = await db.collection(COL_ADMINS).limit(1).get();
    return !snap.empty;
  } catch (err) {
    console.warn('⚠️ hasAnyAdmin failed:', err.message);
    // Safe default: assume admin exists so we don't accidentally grant
    return true;
  }
}

/* =====================================================
   ADMIN MANAGEMENT — grant / revoke / list
   ===================================================== */
async function grantAdmin(uid, email, grantedBy = 'unknown') {
  if (!uid) throw new Error('uid required');
  try {
    await db.collection(COL_ADMINS).doc(uid).set({
      uid,
      email: email || '',
      grantedAt: FieldValue.serverTimestamp(),
      grantedBy
    }, { merge: true });
    return true;
  } catch (err) {
    console.error('❌ grantAdmin failed:', err);
    throw err;
  }
}

async function revokeAdmin(uid) {
  if (!uid) throw new Error('uid required');
  try {
    // Safety: don't let the last admin remove themselves
    const snap = await db.collection(COL_ADMINS).get();
    if (snap.size <= 1) {
      throw new Error('Last admin cannot be removed');
    }
    await db.collection(COL_ADMINS).doc(uid).delete();
    return true;
  } catch (err) {
    console.error('❌ revokeAdmin failed:', err);
    throw err;
  }
}

async function listAdmins() {
  try {
    const snap = await db.collection(COL_ADMINS).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.warn('⚠️ listAdmins failed:', err.message);
    return [];
  }
}

/* =====================================================
   USERS — list all registered users
   ===================================================== */
async function listAllUsers() {
  try {
    const snap = await db.collection(COL_USERS).get();
    const users = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    // Client-side sort: newest lastLogin first
    users.sort((a, b) => {
      const aT = a.lastLogin?.seconds || a.createdAt?.seconds || 0;
      const bT = b.lastLogin?.seconds || b.createdAt?.seconds || 0;
      return bT - aT;
    });
    return users;
  } catch (err) {
    console.warn('⚠️ listAllUsers failed:', err.message);
    return [];
  }
}

/* =====================================================
   AUTO-CLEANUP: Trips older than 3 months
   ===================================================== */
async function cleanupOldTrips(userId) {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 3);
  const cutoffISO = cutoff.toISOString().slice(0, 10);

  try {
    const snap = await db.collection(COL_TRIPS)
      .where('uid', '==', userId)
      .get();

    if (snap.empty) return 0;

    const toDelete = snap.docs.filter(d => {
      const dateStr = d.data().date || '';
      return dateStr && dateStr < cutoffISO;
    });

    if (!toDelete.length) return 0;

    const chunks = [];
    for (let i = 0; i < toDelete.length; i += 450) {
      chunks.push(toDelete.slice(i, i + 450));
    }

    let totalDeleted = 0;
    for (const chunk of chunks) {
      const batch = db.batch();
      chunk.forEach(doc => batch.ref ? batch.delete(doc.ref) : batch.delete(doc));
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
   SAFE TRIP LOADER (History)
   Try indexed query, fallback to client-side sort.
   ===================================================== */
async function loadTripsSafe(userId, limit = 200) {
  // Attempt 1: Indexed query
  try {
    const snap = await db.collection(COL_TRIPS)
      .where('uid', '==', userId)
      .orderBy('date', 'desc')
      .limit(limit)
      .get();

    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.warn('⚠️ Indexed query failed, falling back…', err.code || err.message);
  }

  // Attempt 2: Fallback without orderBy
  try {
    const snap = await db.collection(COL_TRIPS)
      .where('uid', '==', userId)
      .limit(limit)
      .get();

    const trips = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    trips.sort((a, b) => {
      const dateCmp = (b.date || '').localeCompare(a.date || '');
      if (dateCmp !== 0) return dateCmp;
      const aT = a.updatedAt?.seconds || a.createdAt?.seconds || 0;
      const bT = b.updatedAt?.seconds || b.createdAt?.seconds || 0;
      return bT - aT;
    });

    return trips;
  } catch (err) {
    console.error('❌ Trip load failed entirely:', err);
    return [];
  }
}

/* =====================================================
   TODAY'S ENTRY — UPSERT LOGIC
   Aaj ki date ke liye ek single doc per user.
   Bar bar save karne par same doc update hota hai
   (naya nahi banta), isse edit/update asaan ho jata hai.
   ===================================================== */

/* Deterministic ID: `${uid}_${YYYY-MM-DD}` */
function todayDocId(uid, dateStr) {
  return `${uid}_${dateStr}`;
}

/* Save or update today's trip (upsert) */
async function saveTodayTripSafe(userId, dateStr, payload) {
  const docId = todayDocId(userId, dateStr);
  const ref = db.collection(COL_TRIPS).doc(docId);

  try {
    const existing = await ref.get();
    const now = FieldValue.serverTimestamp();

    if (existing.exists) {
      // UPDATE
      await ref.set({
        ...payload,
        uid: userId,
        date: dateStr,
        updatedAt: now
      }, { merge: true });
      return { id: docId, updated: true };
    } else {
      // CREATE
      await ref.set({
        ...payload,
        uid: userId,
        date: dateStr,
        createdAt: now,
        updatedAt: now
      });
      return { id: docId, updated: false };
    }
  } catch (err) {
    console.error('❌ saveTodayTripSafe failed:', err);
    throw err;
  }
}

/* Load today's trip if exists */
async function loadTodayTripSafe(userId, dateStr) {
  try {
    const docId = todayDocId(userId, dateStr);
    const doc = await db.collection(COL_TRIPS).doc(docId).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() };
  } catch (err) {
    console.warn('⚠️ loadTodayTripSafe failed:', err.message);
    return null;
  }
}

/* Delete today's trip */
async function deleteTodayTripSafe(userId, dateStr) {
  try {
    const docId = todayDocId(userId, dateStr);
    await db.collection(COL_TRIPS).doc(docId).delete();
    return true;
  } catch (err) {
    console.error('❌ deleteTodayTripSafe failed:', err);
    return false;
  }
}

/* =====================================================
   PAST TRIPS — LEGACY SAVE (auto-generated ID)
   Ye function tab use hoga jab user aaj ke ilawa
   kisi purani date ka trip save kare (backfill).
   ===================================================== */
async function saveTripSafe(userId, payload) {
  try {
    const docRef = await db.collection(COL_TRIPS).add({
      ...payload,
      uid: userId,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });
    return docRef.id;
  } catch (err) {
    console.error('❌ Trip save failed:', err);
    throw err;
  }
}

/* =====================================================
   TRIP DELETE HELPERS — single + bulk
   ===================================================== */
async function deleteTripSafe(tripId) {
  try {
    await db.collection(COL_TRIPS).doc(tripId).delete();
    return true;
  } catch (err) {
    console.error('❌ Trip delete failed:', err);
    return false;
  }
}

async function deleteTripsBulkSafe(tripIds = []) {
  if (!Array.isArray(tripIds) || !tripIds.length) return 0;

  // Firestore batch limit = 500
  const chunks = [];
  for (let i = 0; i < tripIds.length; i += 450) {
    chunks.push(tripIds.slice(i, i + 450));
  }

  let total = 0;
  for (const chunk of chunks) {
    const batch = db.batch();
    chunk.forEach(id => batch.delete(db.collection(COL_TRIPS).doc(id)));
    try {
      await batch.commit();
      total += chunk.length;
    } catch (err) {
      console.error('❌ Bulk chunk failed:', err);
    }
  }
  return total;
}

/* =====================================================
   USER CONFIG HELPERS
   ===================================================== */
async function loadUserConfigSafe(userId) {
  try {
    const doc = await db.collection(COL_CONFIGS).doc(userId).get();

    if (!doc.exists) {
      const defaults = {
        vehicles: [...DEFAULT_VEHICLES],
        batches: [...DEFAULT_BATCHES],
        boys: [...DEFAULT_BOYS],
        updatedAt: FieldValue.serverTimestamp()
      };
      await db.collection(COL_CONFIGS).doc(userId).set(defaults);
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
    await db.collection(COL_CONFIGS).doc(userId).set({
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
   GLOBAL EXPOSE (debugging + app.js use)
   ===================================================== */
window.__ff = {
  auth,
  db,
  FieldValue,

  // Collections
  COL_USERS,
  COL_ADMINS,
  COL_CONFIGS,
  COL_TRIPS,

  // Users & Admins
  registerUserSafe,
  isAdmin,
  hasAnyAdmin,
  grantAdmin,
  revokeAdmin,
  listAdmins,
  listAllUsers,

  // Trips
  cleanupOldTrips,
  loadTripsSafe,
  saveTripSafe,
  deleteTripSafe,
  deleteTripsBulkSafe,

  // Today's entry (upsert)
  todayDocId,
  saveTodayTripSafe,
  loadTodayTripSafe,
  deleteTodayTripSafe,

  // Config
  loadUserConfigSafe,
  saveUserConfigSafe,

  // Constants
  DEFAULT_VEHICLES,
  DEFAULT_BATCHES,

  // Super admin emails (editable from console if needed)
  SUPER_ADMIN_EMAILS
};

console.log('%c🚀 FareFlow Firebase ready (v2)', 'color:#f6d365;font-weight:bold;');