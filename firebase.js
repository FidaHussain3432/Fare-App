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
   users      → { uid, email, createdAt, lastLogin }
   admins     → { uid, email, grantedAt, grantedBy }
   configs    → { global: { vehicles, batches, boys, layout, ... } }
   trips      → { "YYYY-MM-DD": { vehicles, boys, expenses, ... } }
   
   NOTE: Ab config aur trips GLOBAL hain (shared by all admins).
   Har admin wahi data dekhega aur edit karega.
   ===================================================== */
const COL_USERS   = 'users';
const COL_ADMINS  = 'admins';
const COL_CONFIGS = 'configs';
const COL_TRIPS   = 'trips';

/* Global config doc IDs */
const GLOBAL_CONFIG_DOC = 'global';

/* =====================================================
   CONSTANTS
   ===================================================== */
const DEFAULT_VEHICLES = ['Bus', 'Mini Bus', 'Coaster Bus', 'Van', 'Carry'];
const DEFAULT_BATCHES  = ['24', '25', '26'];
const DEFAULT_BOYS     = [];

/* Default layout settings (customizable via Layout tab) */
const DEFAULT_LAYOUT = {
  darkBlur:     22,      // px — card backdrop blur in dark theme
  lightBlur:    18,      // px — card backdrop blur in light theme
  darkOpacity:  0.06,    // 0–1 — card background opacity (dark)
  lightOpacity: 0.55,    // 0–1 — card background opacity (light)
  darkSaturate: 160,     // % — backdrop saturation
  lightSaturate:160,
  cardRadius:   18,      // px — border radius
  shadowDepth:  0.5      // 0–1 — shadow intensity multiplier
};

const SUPER_ADMIN_EMAILS = [
  'fh87022@gmail.com'
];

/* =====================================================
   USER REGISTRATION — called on every login
   Saves/updates user record in `users` collection.
   Super admin email → auto-grant. Bootstrap fallback.
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

    // Case 1: Super-admin email list mein hai → auto-grant
    if (SUPER_ADMIN_EMAILS.map(e => e.toLowerCase()).includes(emailLower)) {
      const already = await isAdmin(user.uid);
      if (!already) {
        await grantAdmin(user.uid, user.email, 'super-admin-list');
        console.log('👑 Super-admin auto-granted:', user.email);
      }
      return true;
    }

    // Case 2: Koi bhi admin nahi hai → bootstrap admin
    const anyAdmin = await hasAnyAdmin();
    if (!anyAdmin) {
      await grantAdmin(user.uid, user.email, 'system-bootstrap');
      console.log('👑 Bootstrap admin granted (no admin existed):', user.email);
    }

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
    return true; // safe default
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
   ============== GLOBAL CONFIG ========================
   configs/global — single doc shared by all admins
   ===================================================== */

/**
 * Load global config (vehicles, batches, boys, layout)
 * Returns object with defaults if not exists
 */
async function loadGlobalConfigSafe() {
  try {
    const doc = await db.collection(COL_CONFIGS).doc(GLOBAL_CONFIG_DOC).get();

    if (!doc.exists) {
      // Create with defaults
      const defaults = {
        vehicles:  [...DEFAULT_VEHICLES],
        batches:   [...DEFAULT_BATCHES],
        boys:      [...DEFAULT_BOYS],
        layout:    { ...DEFAULT_LAYOUT },
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: 'system-bootstrap'
      };
      await db.collection(COL_CONFIGS).doc(GLOBAL_CONFIG_DOC).set(defaults);
      return {
        vehicles: [...DEFAULT_VEHICLES],
        batches:  [...DEFAULT_BATCHES],
        boys:     [],
        layout:   { ...DEFAULT_LAYOUT }
      };
    }

    const d = doc.data();
    return {
      vehicles: Array.isArray(d.vehicles) && d.vehicles.length
                ? d.vehicles : [...DEFAULT_VEHICLES],
      batches:  Array.isArray(d.batches)  && d.batches.length
                ? d.batches  : [...DEFAULT_BATCHES],
      boys:     Array.isArray(d.boys) ? d.boys : [],
      layout:   { ...DEFAULT_LAYOUT, ...(d.layout || {}) },
      updatedAt: d.updatedAt || null,
      updatedBy: d.updatedBy || null,
      updatedByName: d.updatedByName || null
    };
  } catch (err) {
    console.warn('⚠️ Global config load failed:', err.message);
    return {
      vehicles: [...DEFAULT_VEHICLES],
      batches:  [...DEFAULT_BATCHES],
      boys:     [],
      layout:   { ...DEFAULT_LAYOUT }
    };
  }
}

/**
 * Save global config (full or partial).
 * Automatically adds updatedBy / updatedAt for change tracking.
 *
 * @param {object} config         - { vehicles?, batches?, boys?, layout? }
 * @param {object} editorInfo     - { uid, email, name } — for tracking
 */
async function saveGlobalConfigSafe(config, editorInfo = {}) {
  try {
    const payload = {
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: editorInfo.uid  || 'unknown',
      updatedByEmail: editorInfo.email || '',
      updatedByName:  editorInfo.name  || (editorInfo.email || '').split('@')[0] || 'Admin'
    };

    if (Array.isArray(config.vehicles))  payload.vehicles  = config.vehicles;
    if (Array.isArray(config.batches))   payload.batches   = config.batches;
    if (Array.isArray(config.boys))      payload.boys      = config.boys;
    if (config.layout && typeof config.layout === 'object') {
      payload.layout = config.layout;
    }

    await db.collection(COL_CONFIGS).doc(GLOBAL_CONFIG_DOC).set(payload, { merge: true });
    return true;
  } catch (err) {
    console.error('❌ Global config save failed:', err);
    return false;
  }
}

/**
 * Save only layout settings (used by Layout tab)
 */
async function saveLayoutSafe(layout, editorInfo = {}) {
  try {
    const payload = {
      layout: { ...layout },
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: editorInfo.uid  || 'unknown',
      updatedByEmail: editorInfo.email || '',
      updatedByName:  editorInfo.name  || (editorInfo.email || '').split('@')[0] || 'Admin'
    };
    await db.collection(COL_CONFIGS).doc(GLOBAL_CONFIG_DOC).set(payload, { merge: true });
    return true;
  } catch (err) {
    console.error('❌ Layout save failed:', err);
    return false;
  }
}

/**
 * Real-time subscription to global config.
 * Calls `onChange(config, meta)` whenever doc changes.
 * Returns unsubscribe function.
 *
 * meta = { isInitial, updatedBy, updatedByName, updatedByEmail, updatedAt }
 */
function subscribeToConfig(onChange) {
  let isFirst = true;

  const unsub = db.collection(COL_CONFIGS).doc(GLOBAL_CONFIG_DOC)
    .onSnapshot(snap => {
      if (!snap.exists) return;

      const d = snap.data();
      const config = {
        vehicles: Array.isArray(d.vehicles) && d.vehicles.length
                  ? d.vehicles : [...DEFAULT_VEHICLES],
        batches:  Array.isArray(d.batches)  && d.batches.length
                  ? d.batches  : [...DEFAULT_BATCHES],
        boys:     Array.isArray(d.boys) ? d.boys : [],
        layout:   { ...DEFAULT_LAYOUT, ...(d.layout || {}) }
      };

      const meta = {
        isInitial: isFirst,
        updatedBy:      d.updatedBy      || null,
        updatedByEmail: d.updatedByEmail || null,
        updatedByName:  d.updatedByName  || null,
        updatedAt:      d.updatedAt      || null
      };

      isFirst = false;

      try {
        onChange(config, meta);
      } catch (e) {
        console.error('subscribeToConfig onChange error:', e);
      }
    }, err => {
      console.error('❌ subscribeToConfig error:', err);
    });

  return unsub;
}

/* =====================================================
   ============== SHARED TRIPS =========================
   trips/{YYYY-MM-DD} — one trip per date, shared by all
   ===================================================== */

/**
 * Deterministic doc ID — now just the date (no uid prefix)
 */
function todayDocId(dateStr) {
  return dateStr;   // e.g., "2026-10-16"
}

/**
 * Save (upsert) trip for a given date.
 * Replaces vehicles / boys / expenses completely.
 * Adds updatedBy tracking.
 *
 * @param {string} dateStr       - "YYYY-MM-DD"
 * @param {object} payload       - { vehicles, boys, expenses, girlsCount, ... }
 * @param {object} editorInfo    - { uid, email, name } — for tracking
 */
async function saveTripByDateSafe(dateStr, payload, editorInfo = {}) {
  const docId = todayDocId(dateStr);
  const ref = db.collection(COL_TRIPS).doc(docId);

  try {
    const existing = await ref.get();
    const now = FieldValue.serverTimestamp();

    const baseData = {
      // Replace-mode fields
      vehicles:  payload.vehicles  || {},
      boys:      payload.boys      || [],
      expenses:  payload.expenses  || {},

      // Aggregates
      girlsCount:   payload.girlsCount   ?? 0,
      girlsFarePer: payload.girlsFarePer ?? 0,
      girlsTotal:   payload.girlsTotal   ?? 0,
      boysTotal:    payload.boysTotal    ?? 0,
      totalFare:    payload.totalFare    ?? 0,
      toll:         payload.toll         ?? 0,
      driver:       payload.driver       ?? 0,
      net:          payload.net          ?? 0,

      // Meta
      date: dateStr,
      updatedAt: now,
      updatedBy:      editorInfo.uid   || 'unknown',
      updatedByEmail: editorInfo.email || '',
      updatedByName:  editorInfo.name  || (editorInfo.email || '').split('@')[0] || 'Admin'
    };

    if (existing.exists) {
      const prevCreatedAt = existing.data()?.createdAt || now;
      const prevCreatedBy = existing.data()?.createdBy || null;
      await ref.set({
        ...baseData,
        createdAt: prevCreatedAt,
        createdBy: prevCreatedBy
      });
      return { id: docId, updated: true };
    } else {
      await ref.set({
        ...baseData,
        createdAt: now,
        createdBy: editorInfo.uid || 'unknown'
      });
      return { id: docId, updated: false };
    }
  } catch (err) {
    console.error('❌ saveTripByDateSafe failed:', err);
    throw err;
  }
}

/**
 * Load trip for a specific date (one-shot)
 */
async function loadTripByDateSafe(dateStr) {
  try {
    const docId = todayDocId(dateStr);
    const doc = await db.collection(COL_TRIPS).doc(docId).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() };
  } catch (err) {
    console.warn('⚠️ loadTripByDateSafe failed:', err.message);
    return null;
  }
}

/**
 * Delete trip for a date
 */
async function deleteTripByDateSafe(dateStr) {
  try {
    const docId = todayDocId(dateStr);
    await db.collection(COL_TRIPS).doc(docId).delete();
    return true;
  } catch (err) {
    console.error('❌ deleteTripByDateSafe failed:', err);
    return false;
  }
}

/**
 * Load recent trips (last N months) — one-shot.
 * Fetches all trips sorted by date desc, then client-side filters.
 */
async function loadAllTripsSafe(monthsBack = 3, limit = 300) {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - monthsBack);
  const cutoffISO = cutoff.toISOString().slice(0, 10);

  try {
    // Try indexed query first
    let snap;
    try {
      snap = await db.collection(COL_TRIPS)
        .orderBy('date', 'desc')
        .limit(limit)
        .get();
    } catch (idxErr) {
      console.warn('⚠️ Indexed trips query failed, fallback…', idxErr.code || idxErr.message);
      snap = await db.collection(COL_TRIPS).limit(limit).get();
    }

    const trips = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(t => (t.date || '') >= cutoffISO);

    // Client-side sort (safety)
    trips.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return trips;
  } catch (err) {
    console.error('❌ loadAllTripsSafe failed:', err);
    return [];
  }
}

/**
 * Real-time subscription to recent trips (last 3 months).
 * Calls `onChange(trips, meta)` whenever list changes.
 * Returns unsubscribe function.
 *
 * Note: Firestore can't filter by dynamic date range in onSnapshot easily,
 * so we fetch a reasonable limit and filter client-side.
 */
function subscribeToRecentTrips(onChange, monthsBack = 3, limit = 300) {
  let isFirst = true;

  const unsub = db.collection(COL_TRIPS)
    .orderBy('date', 'desc')
    .limit(limit)
    .onSnapshot(snap => {
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - monthsBack);
      const cutoffISO = cutoff.toISOString().slice(0, 10);

      const trips = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(t => (t.date || '') >= cutoffISO);

      trips.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

      const meta = { isInitial: isFirst };
      isFirst = false;

      try {
        onChange(trips, meta);
      } catch (e) {
        console.error('subscribeToRecentTrips onChange error:', e);
      }
    }, err => {
      console.error('❌ subscribeToRecentTrips error:', err);
      // Fallback: try without orderBy
      console.warn('⚠️ Retrying without orderBy…');
      db.collection(COL_TRIPS).limit(limit).onSnapshot(
        snap2 => {
          const trips = snap2.docs.map(d => ({ id: d.id, ...d.data() }));
          trips.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
          try { onChange(trips, { isInitial: false }); } catch (e) {}
        }
      );
    });

  return unsub;
}

/**
 * Real-time subscription to today's trip only.
 * Calls `onChange(trip, meta)` when today's trip changes.
 */
function subscribeToTodayTrip(dateStr, onChange) {
  let isFirst = true;
  const docId = todayDocId(dateStr);

  const unsub = db.collection(COL_TRIPS).doc(docId)
    .onSnapshot(snap => {
      const trip = snap.exists ? { id: snap.id, ...snap.data() } : null;
      const meta = {
        isInitial: isFirst,
        updatedBy:      trip?.updatedBy      || null,
        updatedByEmail: trip?.updatedByEmail || null,
        updatedByName:  trip?.updatedByName  || null,
        updatedAt:      trip?.updatedAt      || null
      };
      isFirst = false;
      try { onChange(trip, meta); } catch (e) {
        console.error('subscribeToTodayTrip onChange error:', e);
      }
    }, err => {
      console.error('❌ subscribeToTodayTrip error:', err);
    });

  return unsub;
}

/* =====================================================
   AUTO-CLEANUP: Trips older than N months (GLOBAL)
   ===================================================== */
async function cleanupOldTrips(monthsBack = 3) {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - monthsBack);
  const cutoffISO = cutoff.toISOString().slice(0, 10);

  try {
    const snap = await db.collection(COL_TRIPS).get();
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
   DELETE HELPERS
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
   LEGACY / BACKWARD COMPAT SHIMS
   Purane function names ko naye functions pe map kiya
   taake app.js ki baaki jagah break na ho.
   (Baad mein app.js update hone ke baad hata dein)
   ===================================================== */
async function loadUserConfigSafe() {
  // eslint-disable-next-line
  return loadGlobalConfigSafe();
}

async function saveUserConfigSafe(_uidIgnored, config) {
  // eslint-disable-next-line
  return saveGlobalConfigSafe(config, currentEditorInfo());
}

async function loadTodayTripSafe(_uidIgnored, dateStr) {
  return loadTripByDateSafe(dateStr);
}

async function saveTodayTripSafe(_uidIgnored, dateStr, payload) {
  return saveTripByDateSafe(dateStr, payload, currentEditorInfo());
}

async function loadTripsSafe() {
  return loadAllTripsSafe(3, 300);
}

/* =====================================================
   EDITOR INFO HELPER
   Returns current signed-in admin's info for tracking.
   ===================================================== */
function currentEditorInfo() {
  const user = auth.currentUser;
  if (!user) return { uid: 'unknown', email: '', name: 'Unknown' };
  const email = user.email || '';
  return {
    uid:   user.uid,
    email,
    name:  user.displayName || email.split('@')[0] || 'Admin'
  };
}

/* =====================================================
   GLOBAL EXPOSE (debugging + app.js use)
   ===================================================== */
window.__ff = {
  // Core
  auth,
  db,
  FieldValue,

  // Collection names
  COL_USERS,
  COL_ADMINS,
  COL_CONFIGS,
  COL_TRIPS,
  GLOBAL_CONFIG_DOC,

  // Users & admins
  registerUserSafe,
  isAdmin,
  hasAnyAdmin,
  grantAdmin,
  revokeAdmin,
  listAdmins,
  listAllUsers,

  // Global config
  loadGlobalConfigSafe,
  saveGlobalConfigSafe,
  saveLayoutSafe,
  subscribeToConfig,

  // Trips (shared)
  todayDocId,
  saveTripByDateSafe,
  loadTripByDateSafe,
  deleteTripByDateSafe,
  loadAllTripsSafe,
  subscribeToRecentTrips,
  subscribeToTodayTrip,
  cleanupOldTrips,
  deleteTripSafe,
  deleteTripsBulkSafe,

  // Legacy shims (kept for compatibility)
  loadUserConfigSafe,
  saveUserConfigSafe,
  loadTodayTripSafe,
  saveTodayTripSafe,
  loadTripsSafe,

  // Helpers
  currentEditorInfo,

  // Constants
  DEFAULT_VEHICLES,
  DEFAULT_BATCHES,
  DEFAULT_LAYOUT,
  SUPER_ADMIN_EMAILS
};

console.log(
  '%c🚀 FareFlow Firebase ready (v4.0 — Global Shared + Real-Time)',
  'color:#f6d365;font-weight:bold;'
);