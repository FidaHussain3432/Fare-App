/* =====================================================
   FAREFLOW — MAIN APP LOGIC v4.2
   =====================================================
   • Global SHARED data (vehicles/batches/boys + trips)
   • PER-USER layout (each admin has own layout)
   • Real-time sync (Firestore onSnapshot)
   • Toast notifications on remote changes
   • Layout customization (card blur / opacity / color)
   • ANDROID FIX: solid card bg layer + range slider
   • AUTO-INVERSE TEXT (mix-blend-mode: difference)
   • Directional sub-tab slide animations
   • Staggered card entry (immersive)
   • Tab indicator centering fix
   • Swipe-disabled sub-tabs (only titles clickable)
   • Admin gating (super admin: fh87022@gmail.com)
   • Today's entry persistence (upsert + auto-load)
   • Vehicle stepper (− / +)
   • Per-vehicle expenses with "Free" toggle
   • Boys card restructured
   • Filter tabs: All, Batches, Present, Absent, Not Paid
   • Girls count × fare = total
   • History bulk delete + refresh
   • PWA install prompt
   • Confirm modal
   • Admin management tab
   • Layout sub-tab (per-admin)
   ===================================================== */

/* =====================================================
   STATE
   ===================================================== */
const state = {
  user: null,
  isAdminUser: false,

  /* Shared data (vehicles / batches / boys) */
  vehicles: [],
  batches: [],
  boysMaster: [],

  /* PER-USER layout — loaded from users/{uid}.layout */
  layout: {
    darkBlur: 28,
    lightBlur: 24,
    darkOpacity: 0.82,
    lightOpacity: 0.90,
    darkSaturate: 160,
    lightSaturate: 140,
    cardRadius: 18,
    shadowDepth: 0.55,
    darkBgHex: '#0a0a0f',
    lightBgHex: '#ffffff',
    autoInvertText: true,
    forceSolidBg: false,
    androidSolidFallback: true
  },

  trip: {
    date: new Date().toISOString().slice(0, 10),
    vehicles: {},
    boys: [],
    girlsCount: 0,
    girlsFarePer: 0,
    girlsTotal: 0,
    toll: 0,
    driver: 0,
    expenses: {}
  },

  activeBatch: 'all',
  trips: [],
  historySelected: new Set(),
  adminsCache: [],
  usersCache: [],
  pwaPrompt: null,
  loadedTodayId: null,

  /* Real-time unsubscribers */
  unsubscribers: {
    config: null,
    trips: null,
    today: null,
    layout: null
  },

  /* Toast debounce for remote changes */
  remoteToast: {
    lastAt: 0,
    lastBy: '',
    timer: null
  },

  /* Sub-tab animation direction tracking */
  subtabOrder: {
    'entry':  ['trip', 'boys', 'girls', 'expenses', 'summary'],
    'settings': ['vehicles', 'batches', 'boysmaster', 'layout', 'admins'],
    current: { entry: 'trip', settings: 'vehicles' }
  },

  /* Dirty flag — prevent re-render loop when we are the ones saving */
  suppressRemoteToast: false,

  cooldown: {
    signin: 0,
    signup: 0
  }
};

/* =====================================================
   HELPERS
   ===================================================== */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const fmt = n => 'Rs ' + Number(n || 0).toLocaleString('en-PK');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function toast(msg, ms = 2200) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), ms);
}

/* Remote-change toast (de-bounced) */
function remoteToast(name, actionLabel = 'ne data update kiya') {
  const now = Date.now();
  const r = state.remoteToast;

  if (now - r.lastAt < 1500 && r.lastBy === name) return;
  r.lastAt = now;
  r.lastBy = name;

  toast(`📝 ${name} ${actionLabel}`, 2400);
}

/* Editor info for Firestore tracking */
function editorInfo() {
  const u = state.user;
  if (!u) return { uid: 'unknown', email: '', name: 'Unknown' };
  const email = u.email || '';
  return {
    uid:   u.uid,
    email,
    name:  u.displayName || email.split('@')[0] || 'Admin'
  };
}

/* =====================================================
   HEX → RGBA helper (mirrors firebase.js hexToRgb)
   ===================================================== */
function hexToRgba(hex, alpha) {
  const h = String(hex || '').replace('#', '').trim();
  let r = 255, g = 255, b = 255;
  if (h.length === 3) {
    r = parseInt(h[0] + h[0], 16);
    g = parseInt(h[1] + h[1], 16);
    b = parseInt(h[2] + h[2], 16);
  } else if (h.length === 6) {
    r = parseInt(h.substring(0, 2), 16);
    g = parseInt(h.substring(2, 4), 16);
    b = parseInt(h.substring(4, 6), 16);
  }
  return `rgba(${r},${g},${b},${alpha})`;
}

/* =====================================================
   ANDROID DETECTION (for solid bg fallback)
   ===================================================== */
function isAndroid() {
  return /android/i.test(navigator.userAgent || '');
}

/* Detect if backdrop-filter is actually supported (not just parsed) */
function supportsBackdropFilter() {
  if (typeof CSS === 'undefined' || !CSS.supports) return false;
  return CSS.supports('backdrop-filter', 'blur(1px)') ||
         CSS.supports('-webkit-backdrop-filter', 'blur(1px)');
}

/* =====================================================
   CONFIRM MODAL
   ===================================================== */
function confirmDialog(title, msg, okText = 'Confirm') {
  return new Promise(resolve => {
    const modal = $('#confirm-modal');
    $('#confirm-title').textContent = title;
    $('#confirm-msg').textContent = msg;
    const ok = $('#confirm-ok');
    const cancel = $('#confirm-cancel');
    ok.querySelector('strong').textContent = okText;

    const cleanup = () => {
      ok.removeEventListener('click', onOk);
      cancel.removeEventListener('click', onCancel);
      modal.removeEventListener('cancel', onCancel);
    };
    const onOk = () => { cleanup(); modal.close(); resolve(true); };
    const onCancel = () => { cleanup(); modal.close(); resolve(false); };

    ok.addEventListener('click', onOk);
    cancel.addEventListener('click', onCancel);
    modal.addEventListener('cancel', onCancel);

    modal.showModal();
  });
}

/* =====================================================
   BOOT LOADER
   ===================================================== */
const boot = {
  el: null, bar: null, pct: null, status: null, value: 0,

  init() {
    this.el     = $('#boot-loader');
    this.bar    = $('#boot-bar');
    this.pct    = $('#boot-pct');
    this.status = $('#boot-status');
  },

  set(value, label) {
    this.value = Math.max(0, Math.min(100, value));
    if (this.bar) this.bar.value = this.value;
    if (this.pct) this.pct.textContent = Math.round(this.value) + '%';
    if (label && this.status) this.status.textContent = label;
  },

  async hide() {
    this.set(100, 'Ready!');
    await new Promise(r => setTimeout(r, 350));
    if (this.el) {
      this.el.classList.add('hidden');
      setTimeout(() => {
        if (this.el) this.el.style.display = 'none';
      }, 600);
    }
    document.body.classList.remove('no-scroll');
  }
};

/* =====================================================
   SKELETON
   ===================================================== */
function showSkeleton(show) {
  const skel = $('#app-skeleton');
  if (!skel) return;
  skel.hidden = !show;
}

/* =====================================================
   SPARKLE BUTTON EFFECT
   ===================================================== */
function spawnSparkles(btn, count = 14) {
  if (!btn) return;

  let layer = btn.querySelector('.sparkle-layer');
  if (!layer) {
    layer = document.createElement('i');
    layer.className = 'sparkle-layer';
    layer.setAttribute('aria-hidden', 'true');
    btn.appendChild(layer);
  }

  const rect = btn.getBoundingClientRect();
  const cx = rect.width / 2;
  const cy = rect.height / 2;

  for (let i = 0; i < count; i++) {
    const dot = document.createElement('i');
    dot.className = 'sparkle-dot';
    dot.setAttribute('aria-hidden', 'true');

    const angle = (Math.random() - 0.5) * Math.PI * 0.9;
    const dist = 60 + Math.random() * 80;
    const dir = Math.random() < 0.5 ? -1 : 1;
    const dx = dir * (40 + Math.random() * 90);
    const dy = Math.sin(angle) * dist * 0.6;

    dot.style.left = cx + 'px';
    dot.style.top = cy + 'px';
    dot.style.setProperty('--dx', dx + 'px');
    dot.style.setProperty('--dy', dy + 'px');
    dot.style.setProperty('--dur', (700 + Math.random() * 400) + 'ms');

    layer.appendChild(dot);
    setTimeout(() => dot.remove(), 1200);
  }

  btn.classList.add('burst');
  setTimeout(() => btn.classList.remove('burst'), 500);
}

/* =====================================================
   BUTTON COOLDOWN (7 seconds)
   ===================================================== */
function applyCooldown(btn, key, seconds = 7) {
  if (!btn) return false;
  const now = Date.now();
  const until = state.cooldown[key] || 0;
  if (now < until) return false;

  state.cooldown[key] = now + seconds * 1000;
  btn.disabled = true;

  const strongEl = btn.querySelector('strong');
  const originalText = strongEl?.textContent || btn.textContent;

  let remaining = seconds;
  const tick = () => {
    remaining--;
    if (remaining > 0) {
      if (strongEl) strongEl.textContent = `Wait ${remaining}s…`;
      else btn.textContent = `Wait ${remaining}s…`;
      setTimeout(tick, 1000);
    } else {
      if (strongEl) strongEl.textContent = originalText;
      else btn.textContent = originalText;
      btn.disabled = false;
      state.cooldown[key] = 0;
    }
  };
  if (strongEl) strongEl.textContent = `Wait ${remaining}s…`;
  else btn.textContent = `Wait ${remaining}s…`;
  setTimeout(tick, 1000);

  return true;
}

/* =====================================================
   VEHICLE INSTANCES
   ===================================================== */
function getVehicleInstances() {
  const out = [];
  Object.entries(state.trip.vehicles).forEach(([name, qty]) => {
    const n = Math.max(0, Number(qty) || 0);
    if (n === 0) return;
    if (n === 1) out.push(name);
    else for (let i = 1; i <= n; i++) out.push(`${name} ${i}`);
  });
  return out;
}

/* =====================================================
   THEME
   ===================================================== */
function initTheme() {
  const saved = localStorage.getItem('ff-theme') || 'system';
  applyTheme(saved, false);

  const btn = $('#theme-toggle');
  if (btn) btn.onclick = () => {
    const cur = localStorage.getItem('ff-theme') || 'system';
    const next = cur === 'dark' ? 'light' : cur === 'light' ? 'system' : 'dark';
    localStorage.setItem('ff-theme', next);
    applyTheme(next, true);
    toast('Theme: ' + next);
  };
}

function applyTheme(mode, animate = true) {
  if (animate) document.documentElement.style.transition = 'background .5s ease, color .35s ease';
  let resolved = mode;
  if (mode === 'system') {
    resolved = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  document.documentElement.dataset.theme = resolved;

  /* Re-apply layout with new theme-specific values */
  applyLayoutToCSS(state.layout);

  requestAnimationFrame(() => {
    positionIndicator($('#main-tabs'), '.tab-indicator', '.tab.active');
    positionIndicator($('#entry-subtabs'), '.subtab-indicator', '.subtab.active');
    positionIndicator($('#settings-subtabs'), '.subtab-indicator', '.subtab.active');
  });
}

window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
  if ((localStorage.getItem('ff-theme') || 'system') === 'system') applyTheme('system', true);
});

/* =====================================================
   APPLY LAYOUT — CSS variables for card blur / opacity
   =====================================================
   Sets:
   • --blur              backdrop blur px
   • --glass-sat         backdrop saturation %
   • --radius            card corner radius
   • --shadow-depth      shadow multiplier
   • --card-bg-hex       base color (dark/light)
   • --card-bg-opacity   base alpha
   • --card-solid-layer  rgba() — solid fallback for Android
   • --auto-invert       'difference' or 'normal'
   ===================================================== */
function applyLayoutToCSS(layout) {
  const L = { ...state.layout, ...(layout || {}) };
  state.layout = L;

  const root = document.documentElement;
  const isLight = root.dataset.theme === 'light';

  const blur     = isLight ? L.lightBlur    : L.darkBlur;
  const opacity  = isLight ? L.lightOpacity : L.darkOpacity;
  const saturate = isLight ? L.lightSaturate: L.darkSaturate;
  const bgHex    = isLight ? L.lightBgHex   : L.darkBgHex;

  root.style.setProperty('--blur',        blur + 'px');
  root.style.setProperty('--glass-sat',   saturate + '%');
  root.style.setProperty('--radius',      (L.cardRadius || 18) + 'px');
  root.style.setProperty('--card-bg-hex', bgHex);
  root.style.setProperty('--card-bg-opacity', String(opacity));

  /* Determine effective opacity for the SOLID layer.
     If backdrop-filter is unsupported (or forceSolidBg), we need
     a stronger solid layer so text stays readable on Android. */
  let solidOpacity = opacity;
  const bfSupported = supportsBackdropFilter();
  const forceSolid = !!L.forceSolidBg;
  const androidFallback = !!L.androidSolidFallback && isAndroid();

  if (forceSolid || !bfSupported) {
    solidOpacity = Math.min(1, opacity + 0.15);
  } else if (androidFallback) {
    /* Android with partial backdrop-filter support → boost a bit */
    solidOpacity = Math.min(1, opacity + 0.05);
  }

  const solidLayer = hexToRgba(bgHex, solidOpacity);
  root.style.setProperty('--card-solid-layer', solidLayer);
  root.style.setProperty('--glass-bg', hexToRgba(bgHex, opacity));

  /* Keep old light-theme value working too (some rules still reference it) */
  root.style.setProperty('--card-bg', hexToRgba(bgHex, opacity));

  /* Shadow depth */
  const depth = Math.max(0, Math.min(1.5, L.shadowDepth ?? 0.5));
  root.style.setProperty('--shadow-depth', depth.toFixed(2));

  /* Auto-inverse text toggle */
  const invert = L.autoInvertText === false ? 'normal' : 'difference';
  root.style.setProperty('--auto-invert', invert);
  root.style.setProperty('--invert-enabled', L.autoInvertText === false ? '0' : '1');
}

/* =====================================================
   SLIDING TAB INDICATOR — FIXED CENTERING
   ===================================================== */
function positionIndicator(container, indicatorSel, activeSel) {
  if (!container) return;
  const ind = container.querySelector(indicatorSel);
  const active = container.querySelector(activeSel);
  if (!ind || !active) return;

  const cRect = container.getBoundingClientRect();
  const aRect = active.getBoundingClientRect();
  const containerStyle = window.getComputedStyle(container);
  const padLeft = parseFloat(containerStyle.paddingLeft) || 0;

  const left  = aRect.left - cRect.left - padLeft;
  const width = aRect.width;

  ind.style.width = width + 'px';
  ind.style.transform = `translateX(${left}px)`;
  ind.classList.add('ready');
}

function initTabs() {
  const mainTabs = $('#main-tabs');
  const entrySubs = $('#entry-subtabs');
  const settingsSubs = $('#settings-subtabs');

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      positionIndicator(mainTabs, '.tab-indicator', '.tab.active');
      positionIndicator(entrySubs, '.subtab-indicator', '.subtab.active');
      positionIndicator(settingsSubs, '.subtab-indicator', '.subtab.active');
    });
  });

  let rT;
  window.addEventListener('resize', () => {
    clearTimeout(rT);
    rT = setTimeout(() => {
      positionIndicator(mainTabs, '.tab-indicator', '.tab.active');
      positionIndicator(entrySubs, '.subtab-indicator', '.subtab.active');
      positionIndicator(settingsSubs, '.subtab-indicator', '.subtab.active');
    }, 100);
  }, { passive: true });

  [entrySubs, settingsSubs].forEach(container => {
    if (!container) return;

    let startX = 0, startY = 0, scrolling = false;

    container.addEventListener('touchstart', e => {
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      scrolling = false;
    }, { passive: true });

    container.addEventListener('touchmove', e => {
      const t = e.touches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;

      if (!scrolling) {
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 8) {
          e.preventDefault();
          return;
        }
        if (Math.abs(dy) > 8) {
          scrolling = true;
        }
      }
    }, { passive: false });

    container.addEventListener('scroll', () => {
      positionIndicator(container, '.subtab-indicator', '.subtab.active');
    }, { passive: true });
  });
}

/* =====================================================
   DIRECTIONAL SUB-TAB SWITCHING
   ===================================================== */
function switchSubtab(group, key) {
  const order = state.subtabOrder[group];
  const prevKey = state.subtabOrder.current[group];
  if (key === prevKey) return;

  const prevIndex = order.indexOf(prevKey);
  const nextIndex = order.indexOf(key);
  const forward = nextIndex > prevIndex;

  state.subtabOrder.current[group] = key;

  const prefix = group === 'entry' ? 'entry-subtab-' : 'settings-subtab-';
  const containerId = group === 'entry' ? 'entry-subtabs' : 'settings-subtabs';
  const subtabsNav = $('#' + containerId);

  if (subtabsNav) {
    $$(`#${containerId} .subtab`).forEach(t => {
      t.classList.toggle('active', t.dataset.subtab === key);
    });
  }

  const oldPanel = $('#' + prefix + prevKey);
  const newPanel = $('#' + prefix + key);

  if (oldPanel) oldPanel.classList.remove('active');

  if (newPanel) {
    newPanel.classList.remove('slide-from-left', 'slide-from-right');
    newPanel.classList.add(forward ? 'slide-from-left' : 'slide-from-right');
    newPanel.classList.add('active');

    setTimeout(() => {
      newPanel.classList.remove('slide-from-left', 'slide-from-right');
    }, 700);
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      positionIndicator(subtabsNav, '.subtab-indicator', '.subtab.active');
    });
  });
}

/* =====================================================
   AUTH
   ===================================================== */
function initAuth() {
  auth.onAuthStateChanged(async user => {
    state.user = user;

    if (!user) {
      state.isAdminUser = false;
      detachAllListeners();
      showView('login');
      showSkeleton(false);
      if (boot.value === 100) {
        boot.el?.classList.add('hidden');
      }
      return;
    }

    boot.set(60, 'Verifying access…');

    try {
      await registerUserSafe(user);
    } catch (e) {
      console.warn('registerUserSafe failed:', e);
    }

    boot.set(70, 'Checking admin status…');

    const admin = await isAdmin(user.uid);
    state.isAdminUser = admin;

    if (!admin) {
      boot.set(85, 'Awaiting approval');
      const pe = $('#pending-email');
      if (pe) pe.textContent = user.email || '';
      showView('pending');
      await boot.hide();
      return;
    }

    boot.set(80, 'Loading configuration…');
    showView('app');

    showSkeleton(true);
    await boot.hide();

    try {
      await bootstrapUser(user);
    } finally {
      showSkeleton(false);
    }
  });

  /* SIGN IN */
  $('#login-form').onsubmit = async e => {
    e.preventDefault();
    const btn = $('#signin-btn');
    if (!applyCooldown(btn, 'signin', 7)) return;
    spawnSparkles(btn, 16);

    const email = $('#email').value.trim();
    const pass  = $('#password').value;
    const msg   = $('#auth-msg');
    msg.textContent = '';

    try {
      await auth.signInWithEmailAndPassword(email, pass);
    } catch (err) {
      msg.textContent = cleanAuthError(err);
      state.cooldown.signin = 0;
      if (btn) {
        btn.disabled = false;
        const strongEl = btn.querySelector('strong');
        if (strongEl) strongEl.textContent = 'Sign In';
      }
    }
  };

  /* SIGN UP */
  $('#signup-btn').onclick = async () => {
    const btn = $('#signup-btn');
    const email = $('#email').value.trim();
    const pass  = $('#password').value;
    const msg   = $('#auth-msg');
    msg.textContent = '';

    if (!email || pass.length < 6) {
      msg.textContent = 'Email + 6-char password required';
      return;
    }

    if (!applyCooldown(btn, 'signup', 7)) return;
    spawnSparkles(btn, 16);

    try {
      await auth.createUserWithEmailAndPassword(email, pass);
      toast('✅ Account created!');
    } catch (err) {
      msg.textContent = cleanAuthError(err);
      state.cooldown.signup = 0;
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Create Account';
      }
    }
  };

  $('#logout-btn').onclick = () => auth.signOut();
  const pendingLogout = $('#pending-logout');
  if (pendingLogout) pendingLogout.onclick = () => auth.signOut();
}

function showView(name) {
  $('#login-view').classList.toggle('active', name === 'login');
  $('#pending-view').classList.toggle('active', name === 'pending');
  $('#app-view').classList.toggle('active', name === 'app');
}

function cleanAuthError(err) {
  const m = err.message || '';
  if (m.includes('user-not-found'))       return 'Account not found. Create one.';
  if (m.includes('wrong-password'))       return 'Galat password.';
  if (m.includes('invalid-email'))        return 'Email invalid hai.';
  if (m.includes('email-already-in-use')) return 'Email already registered.';
  if (m.includes('weak-password'))        return 'Password kamzor hai (6+ chars).';
  if (m.includes('network'))              return 'Network issue. Internet check karein.';
  if (m.includes('invalid-credential'))   return 'Email ya password galat hai.';
  if (m.includes('too-many-requests'))    return 'Bohat zyada attempts. Thori der baad try karein.';
  return m.replace('Firebase: ', '');
}

/* =====================================================
   BOOTSTRAP USER
   ===================================================== */
async function bootstrapUser(user) {
  /* 1) Load shared config (vehicles/batches/boys only) */
  boot.set(82, 'Loading shared config…');
  const cfg = await loadGlobalConfigSafe();
  state.vehicles   = cfg.vehicles;
  state.batches    = cfg.batches;
  state.boysMaster = cfg.boys;

  /* 2) Load PERSONAL layout from users/{uid}.layout */
  boot.set(84, 'Loading your layout…');
  try {
    const personalLayout = await loadUserLayoutSafe(user.uid);
    state.layout = { ...state.layout, ...personalLayout };
  } catch (e) {
    console.warn('Layout load failed, using defaults:', e);
  }
  applyLayoutToCSS(state.layout);

  /* 3) Initial trips load */
  boot.set(88, 'Loading trips…');
  state.trips = await loadAllTripsSafe(3, 300);

  /* 4) Cleanup old trips */
  boot.set(92, 'Cleaning old data…');
  const removed = await cleanupOldTrips(3);
  if (removed > 0) toast(`🧹 ${removed} purane trips delete kiye (3+ months)`);

  /* 5) Load today's entry */
  boot.set(95, 'Loading today\'s entry…');
  await loadTodayIntoForm();

  /* 6) Initial renders */
  boot.set(97, 'Rendering…');
  renderVehicles();
  renderBatchTabs();
  renderBoysList();
  renderBatchSettings();
  renderBoysMaster();
  renderVehicleSettings();
  renderExpenses();
  renderHistory();
  updateSummary();
  renderLayoutControls();

  /* 7) Bind events */
  bindStaticEvents();
  initTabs();

  /* 8) Attach real-time listeners */
  attachAllListeners();

  const adminsTab = $('#admins-tab-btn');
  if (adminsTab) adminsTab.hidden = !state.isAdminUser;

  boot.set(100, 'Ready!');
}

/* =====================================================
   REAL-TIME LISTENERS
   ===================================================== */
function attachAllListeners() {
  detachAllListeners();

  /* --- SHARED CONFIG (vehicles / batches / boys) --- */
  state.unsubscribers.config = subscribeToConfig((cfg, meta) => {
    state.vehicles   = cfg.vehicles;
    state.batches    = cfg.batches;
    state.boysMaster = cfg.boys;

    /* NOTE: layout is NOT part of shared config anymore —
       it lives in users/{uid}.layout (see below). */

    if (!meta.isInitial && meta.updatedBy && meta.updatedBy !== state.user?.uid) {
      const who = meta.updatedByName || 'Admin';
      remoteToast(who, 'ne config update kiya');
    }

    if (!meta.isInitial) {
      renderVehicles();
      renderBatchTabs();
      renderBatchSettings();
      renderBoysMaster();
      renderVehicleSettings();
      renderBoysList();
      renderExpenses();
      updateSummary();
    }
  });

  /* --- PERSONAL LAYOUT (users/{uid}.layout) --- */
  if (state.user?.uid) {
    state.unsubscribers.layout = subscribeToUserLayout(state.user.uid, (layout, meta) => {
      state.layout = { ...state.layout, ...layout };
      applyLayoutToCSS(state.layout);

      if (!meta.isInitial) {
        renderLayoutControls();
        /* Toast only if the change came from another device/tab */
        if (meta.layoutUpdatedAt) {
          /* Silent — layout sync across devices is expected */
        }
      }
    });
  }

  /* --- RECENT TRIPS --- */
  state.unsubscribers.trips = subscribeToRecentTrips((trips, meta) => {
    state.trips = trips;
    if (!meta.isInitial) {
      renderHistory($('#history-search')?.value || '');
    }
  }, 3, 300);

  /* --- TODAY'S TRIP --- */
  const today = todayISO();
  state.unsubscribers.today = subscribeToTodayTrip(today, (trip, meta) => {
    if (!meta.isInitial && meta.updatedBy && meta.updatedBy !== state.user?.uid) {
      const who = meta.updatedByName || 'Admin';
      remoteToast(who, 'ne aaj ki entry update ki');
    }
    if (!meta.isInitial && trip && state.trip.date === today) {
      const myEmail = state.user?.email;
      if (trip.updatedByEmail && trip.updatedByEmail !== myEmail) {
        mergeTripIntoForm(trip);
      }
    }
  });
}

function detachAllListeners() {
  Object.keys(state.unsubscribers).forEach(k => {
    const unsub = state.unsubscribers[k];
    if (typeof unsub === 'function') {
      try { unsub(); } catch (e) {}
    }
    state.unsubscribers[k] = null;
  });
}

/* =====================================================
   LOAD / MERGE TODAY'S TRIP INTO FORM
   ===================================================== */
async function loadTodayIntoForm() {
  if (!state.user) return;

  const today = todayISO();
  const todayTrip = await loadTripByDateSafe(today);
  if (!todayTrip) {
    state.loadedTodayId = null;
    updateSaveHint();
    return;
  }
  mergeTripIntoForm(todayTrip);
}

function mergeTripIntoForm(todayTrip) {
  const today = todayISO();

  state.loadedTodayId = todayTrip.id;
  state.trip.date         = todayTrip.date || today;
  state.trip.vehicles     = { ...(todayTrip.vehicles || {}) };
  state.trip.girlsCount   = todayTrip.girlsCount   || 0;
  state.trip.girlsFarePer = todayTrip.girlsFarePer || 0;
  state.trip.girlsTotal   = todayTrip.girlsTotal   || 0;
  state.trip.toll         = todayTrip.toll         || 0;
  state.trip.driver       = todayTrip.driver       || 0;
  state.trip.expenses     = { ...(todayTrip.expenses || {}) };

  const savedBoys = Array.isArray(todayTrip.boys) ? todayTrip.boys : [];
  const map = new Map();
  savedBoys.forEach(b => map.set(`${b.name}|${b.batch}`, b));

  state.trip.boys = state.boysMaster.map(m => {
    const key = `${m.name}|${m.batch}`;
    const saved = map.get(key);
    return {
      name: m.name,
      batch: m.batch,
      vehicle: saved?.vehicle || '',
      fare: saved?.fare || 0,
      absent: !!saved?.absent,
      selected: false
    };
  });

  const dEl = $('#trip-date');
  if (dEl) dEl.value = state.trip.date;

  const gcEl = $('#girls-count');
  if (gcEl) gcEl.value = state.trip.girlsCount;
  const gpEl = $('#girls-fare-per');
  if (gpEl) gpEl.value = state.trip.girlsFarePer;

  renderVehicles();
  renderExpenses();
  renderBoysList();
  updateGirlsTotal();
  updateSaveHint();
  updateSummary();
}

function updateSaveHint() {
  const hint = $('#save-hint');
  if (!hint) return;
  hint.textContent = state.loadedTodayId
    ? '✓ Aaj ki entry mojood hai — Save karke update karein'
    : '';
}

/* =====================================================
   BIND STATIC EVENTS
   ===================================================== */
let bound = false;
function bindStaticEvents() {
  if (bound) return;
  bound = true;

  /* MAIN TABS */
  $$('.tab').forEach(tab => tab.onclick = () => {
    $$('.tab').forEach(t => t.classList.remove('active'));
    $$('.tab-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    $('#tab-' + tab.dataset.tab)?.classList.add('active');
    positionIndicator($('#main-tabs'), '.tab-indicator', '.tab.active');

    if (tab.dataset.tab === 'history') renderHistory();
    if (tab.dataset.tab === 'settings' && state.isAdminUser) refreshAdminsTab();

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        positionIndicator($('#entry-subtabs'), '.subtab-indicator', '.subtab.active');
        positionIndicator($('#settings-subtabs'), '.subtab-indicator', '.subtab.active');
      });
    });
  });

  /* ENTRY SUB-TABS */
  $$('#entry-subtabs .subtab').forEach(st => st.onclick = () => {
    switchSubtab('entry', st.dataset.subtab);
  });

  /* SETTINGS SUB-TABS */
  $$('#settings-subtabs .subtab').forEach(st => st.onclick = () => {
    switchSubtab('settings', st.dataset.subtab);
    if (st.dataset.subtab === 'admins' && state.isAdminUser) refreshAdminsTab();
    if (st.dataset.subtab === 'boysmaster') renderBoysMaster();
    if (st.dataset.subtab === 'layout') renderLayoutControls();
  });

  /* DATE / GIRLS INPUTS */
  const dateEl   = $('#trip-date');
  const girlsCountEl = $('#girls-count');
  const girlsFareEl  = $('#girls-fare-per');

  if (dateEl) {
    dateEl.value = state.trip.date;
    dateEl.onchange = async e => {
      state.trip.date = e.target.value || todayISO();
      if (state.unsubscribers.today) {
        try { state.unsubscribers.today(); } catch (err) {}
        state.unsubscribers.today = null;
      }
      const trip = await loadTripByDateSafe(state.trip.date);
      if (trip) mergeTripIntoForm(trip);
      else resetTripForm();
      if (state.trip.date === todayISO()) {
        state.unsubscribers.today = subscribeToTodayTrip(todayISO(), (t, meta) => {
          if (!meta.isInitial && t && meta.updatedBy !== state.user?.uid) {
            mergeTripIntoForm(t);
          }
        });
      }
    };
  }

  if (girlsCountEl) girlsCountEl.oninput = e => {
    state.trip.girlsCount = Math.max(0, +e.target.value || 0);
    updateGirlsTotal();
    updateSummary();
  };

  if (girlsFareEl) girlsFareEl.oninput = e => {
    state.trip.girlsFarePer = Math.max(0, +e.target.value || 0);
    updateGirlsTotal();
    updateSummary();
  };

  $('#save-trip').onclick = saveTrip;

  const clearBtn = $('#clear-today');
  if (clearBtn) clearBtn.onclick = async () => {
    const ok = await confirmDialog(
      'Clear Today\'s Entry',
      'Kya aap aaj ki entry clear karna chahte hain? Form reset ho jayega lekin saved data Firestore mein rahega.',
      'Clear'
    );
    if (!ok) return;
    resetTripForm();
    toast('🗑️ Form cleared');
  };

  /* BULK ACTIONS */
  $('#select-all-btn').onclick  = () => bulkSelect(true);
  $('#clear-sel-btn').onclick   = () => bulkSelect(false);
  $('#apply-fare-btn').onclick  = bulkApplyFare;
  $('#mark-absent-btn').onclick = () => bulkSetAbsent(true);
  $('#mark-present-btn').onclick= () => bulkSetAbsent(false);

  /* SETTINGS FORMS */
  $('#add-vehicle-form').onsubmit = addVehicle;
  $('#add-batch-form').onsubmit   = addBatch;
  $('#add-boy-master').onsubmit   = addBoyMaster;

  /* HISTORY */
  const searchInput = $('#history-search');
  if (searchInput) searchInput.oninput = e => renderHistory(e.target.value);

  const refreshHistBtn = $('#refresh-history-btn');
  if (refreshHistBtn) refreshHistBtn.onclick = async () => {
    refreshHistBtn.disabled = true;
    refreshHistBtn.textContent = '🔄 Refreshing…';
    try {
      state.trips = await loadAllTripsSafe(3, 300);
      renderHistory(searchInput ? searchInput.value : '');
      toast('✅ History refreshed');
    } catch (e) {
      toast('❌ Refresh failed');
    } finally {
      refreshHistBtn.disabled = false;
      refreshHistBtn.textContent = '🔄 Refresh History';
    }
  };

  const selectAllBtn = $('#history-select-all');
  if (selectAllBtn) selectAllBtn.onclick = () => {
    state.trips.forEach(t => state.historySelected.add(t.id));
    renderHistory(searchInput ? searchInput.value : '');
  };
  const clearSelBtn = $('#history-clear-sel');
  if (clearSelBtn) clearSelBtn.onclick = () => {
    state.historySelected.clear();
    renderHistory(searchInput ? searchInput.value : '');
  };
  const delBtn = $('#history-delete-btn');
  if (delBtn) delBtn.onclick = async () => {
    const ids = [...state.historySelected];
    if (!ids.length) return toast('Pehle trips select karein');
    const ok = await confirmDialog(
      'Delete Trips',
      `${ids.length} trip(s) permanently delete ho jayenge. Ye action undo nahi ho sakta.`,
      'Delete'
    );
    if (!ok) return;
    const removed = await deleteTripsBulkSafe(ids);
    toast(`🗑️ ${removed} trip(s) delete`);
    state.historySelected.clear();
    state.trips = await loadAllTripsSafe(3, 300);
    renderHistory(searchInput ? searchInput.value : '');
  };

  /* MODAL */
  $('#modal-close').onclick = () => $('#detail-modal').close();
  $('#detail-modal').addEventListener('click', e => {
    if (e.target === $('#detail-modal')) $('#detail-modal').close();
  });

  /* ADMINS TAB */
  const refreshAdmins = $('#refresh-users-btn');
  if (refreshAdmins) refreshAdmins.onclick = refreshAdminsTab;

  /* LAYOUT TAB CONTROLS */
  bindLayoutControls();
}

/* =====================================================
   LAYOUT TAB — sliders + live preview (PER-USER)
   ===================================================== */
function renderLayoutControls() {
  const L = state.layout;

  const setVal = (id, v) => { const el = $(id); if (el) el.value = v; };
  const setTxt = (id, v) => { const el = $(id); if (el) el.textContent = v; };
  const setChk = (id, v) => { const el = $(id); if (el) el.checked = !!v; };

  /* ---- Sliders (dark theme) ---- */
  setVal('#layout-dark-blur', L.darkBlur);
  setVal('#layout-dark-op',   L.darkOpacity);
  setVal('#layout-dark-sat',  L.darkSaturate);

  setTxt('#layout-dark-blur-val', L.darkBlur + 'px');
  setTxt('#layout-dark-op-val',   Number(L.darkOpacity).toFixed(2));
  setTxt('#layout-dark-sat-val',  L.darkSaturate + '%');

  /* ---- Sliders (light theme) ---- */
  setVal('#layout-light-blur', L.lightBlur);
  setVal('#layout-light-op',   L.lightOpacity);
  setVal('#layout-light-sat',  L.lightSaturate);

  setTxt('#layout-light-blur-val', L.lightBlur + 'px');
  setTxt('#layout-light-op-val',   Number(L.lightOpacity).toFixed(2));
  setTxt('#layout-light-sat-val',  L.lightSaturate + '%');

  /* ---- Shape & depth ---- */
  setVal('#layout-radius', L.cardRadius);
  setVal('#layout-shadow', L.shadowDepth);

  setTxt('#layout-radius-val', L.cardRadius + 'px');
  setTxt('#layout-shadow-val', Number(L.shadowDepth).toFixed(2));

  /* ---- Color pickers (dark + light background) ---- */
  const darkHex  = L.darkBgHex  || '#0a0a0f';
  const lightHex = L.lightBgHex || '#ffffff';

  setVal('#layout-dark-bg',  darkHex);
  setVal('#layout-light-bg', lightHex);

  setTxt('#layout-dark-bg-val',  darkHex);
  setTxt('#layout-light-bg-val', lightHex);

  /* ---- Toggles (auto-invert + Android fallback + force solid) ---- */
  const autoInvert    = L.autoInvertText !== false;
  const androidSolid  = L.androidSolidFallback !== false;
  const forceSolid    = L.forceSolidBg === true;

  setChk('#layout-auto-invert',   autoInvert);
  setChk('#layout-android-solid', androidSolid);
  setChk('#layout-force-solid',   forceSolid);

  setTxt('#layout-auto-invert-val',   autoInvert   ? 'ON' : 'OFF');
  setTxt('#layout-android-solid-val', androidSolid ? 'ON' : 'OFF');
  setTxt('#layout-force-solid-val',   forceSolid   ? 'ON' : 'OFF');
}

function bindLayoutControls() {
  /* Collect current values from all controls into a layout object */
  const collect = () => ({
    darkBlur:     +$('#layout-dark-blur')?.value  || 22,
    lightBlur:    +$('#layout-light-blur')?.value || 18,
    darkOpacity:  +$('#layout-dark-op')?.value    || 0.06,
    lightOpacity: +$('#layout-light-op')?.value   || 0.55,
    darkSaturate: +$('#layout-dark-sat')?.value   || 160,
    lightSaturate:+$('#layout-light-sat')?.value  || 160,
    cardRadius:   +$('#layout-radius')?.value     || 18,
    shadowDepth:  +$('#layout-shadow')?.value     || 0.5,
    darkBgHex:    $('#layout-dark-bg')?.value     || '#0a0a0f',
    lightBgHex:   $('#layout-light-bg')?.value    || '#ffffff',
    autoInvertText:       !!$('#layout-auto-invert')?.checked,
    androidSolidFallback: !!$('#layout-android-solid')?.checked,
    forceSolidBg:         !!$('#layout-force-solid')?.checked
  });

  /* Live update on any control change */
  const onChange = () => {
    const L = collect();
    applyLayoutToCSS(L);
    renderLayoutControls();
  };

  [
    '#layout-dark-blur', '#layout-light-blur',
    '#layout-dark-op',   '#layout-light-op',
    '#layout-dark-sat',  '#layout-light-sat',
    '#layout-radius',    '#layout-shadow',
    '#layout-dark-bg',   '#layout-light-bg',
    '#layout-auto-invert','#layout-android-solid',
    '#layout-force-solid'
  ].forEach(sel => {
    const el = $(sel);
    if (!el) return;
    el.addEventListener('input', onChange);
    el.addEventListener('change', onChange);
  });

  /* Save → per-user */
  const saveBtn = $('#layout-save');
  if (saveBtn) saveBtn.onclick = async () => {
    if (!state.user?.uid) return toast('Login required');
    saveBtn.disabled = true;
    const original = saveBtn.textContent;
    saveBtn.textContent = '⏳ Saving…';
    try {
      const L = collect();
      state.layout = { ...state.layout, ...L };
      applyLayoutToCSS(state.layout);
      const ok = await saveUserLayoutSafe(state.user.uid, state.layout);
      if (ok) {
        toast('✅ Layout saved (only for your account)');
      } else {
        toast('❌ Save failed');
      }
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = original || '💾 Save Layout';
    }
  };

  /* Reset → defaults (per-user) */
  const resetBtn = $('#layout-reset');
  if (resetBtn) resetBtn.onclick = async () => {
    if (!state.user?.uid) return toast('Login required');
    const ok = await confirmDialog(
      'Reset Layout',
      'Aapki layout settings default pe wapis chali jayengi. Confirm?',
      'Reset'
    );
    if (!ok) return;

    const D = {
      darkBlur: 28, lightBlur: 24,
      darkOpacity: 0.82, lightOpacity: 0.90,
      darkSaturate: 160, lightSaturate: 140,
      cardRadius: 18, shadowDepth: 0.55,
      darkBgHex: '#0a0a0f',
      lightBgHex: '#ffffff',
      autoInvertText: true,
      forceSolidBg: false,
      androidSolidFallback: true
    };
    state.layout = { ...D };
    applyLayoutToCSS(D);
    renderLayoutControls();
    await saveUserLayoutSafe(state.user.uid, D);
    toast('↩️ Layout reset (your account)');
  };
}

/* =====================================================
   VEHICLES — RENDER (stepper)
   ===================================================== */
function renderVehicles() {
  const ul = $('#vehicle-list');
  if (!ul) return;
  ul.innerHTML = '';

  if (!state.vehicles.length) {
    ul.innerHTML = `<li class="empty-state">
      <strong>Koi vehicle nahi</strong>
      Settings → Vehicles mein pehle kuch add karein
    </li>`;
    return;
  }

  state.vehicles.forEach(v => {
    const li = document.createElement('li');
    li.className = 'vehicle-item' + (state.trip.vehicles[v] ? ' active' : '');
    li.dataset.v = v;

    const label = document.createElement('strong');
    label.className = 'veh-label';
    label.textContent = v;

    const stepper = document.createElement('section');
    stepper.className = 'stepper';

    const btnMinus = document.createElement('button');
    btnMinus.type = 'button';
    btnMinus.textContent = '−';
    btnMinus.setAttribute('aria-label', `Decrease ${v}`);

    const valEl = document.createElement('output');
    valEl.className = 'step-value';
    valEl.textContent = state.trip.vehicles[v] || 0;

    const btnPlus = document.createElement('button');
    btnPlus.type = 'button';
    btnPlus.textContent = '+';
    btnPlus.setAttribute('aria-label', `Increase ${v}`);

    const updateBtnState = () => {
      const q = state.trip.vehicles[v] || 0;
      btnMinus.disabled = q <= 0;
      valEl.textContent = q;
    };

    const syncVehicle = qty => {
      qty = Math.max(0, qty | 0);
      if (qty > 0) {
        state.trip.vehicles[v] = qty;
        li.classList.add('active');
      } else {
        delete state.trip.vehicles[v];
        li.classList.remove('active');
      }
      updateBtnState();
      renderExpenses();
      renderBoysList();
      updateSummary();
    };

    btnMinus.onclick = () => {
      const q = state.trip.vehicles[v] || 0;
      if (q > 0) syncVehicle(q - 1);
    };
    btnPlus.onclick = () => {
      const q = state.trip.vehicles[v] || 0;
      syncVehicle(q + 1);
    };

    updateBtnState();

    stepper.append(btnMinus, valEl, btnPlus);
    li.append(label, stepper);
    ul.append(li);
  });
}

/* =====================================================
   EXPENSES — per-vehicle
   ===================================================== */
function renderExpenses() {
  const ul = $('#expenses-list');
  if (!ul) return;
  ul.innerHTML = '';

  const instances = getVehicleInstances();

  if (!instances.length) {
    ul.innerHTML = `<li class="empty-state">
      <strong>Pehle vehicles arrange karein</strong>
      "Date & Vehicles" tab mein vehicles ka count set karein
    </li>`;
    updateExpenseTotals();
    return;
  }

  instances.forEach(v => {
    if (!state.trip.expenses[v]) {
      state.trip.expenses[v] = { toll: 0, driver: 0, tollFree: false, driverFree: false };
    }
  });

  Object.keys(state.trip.expenses).forEach(k => {
    if (!instances.includes(k)) delete state.trip.expenses[k];
  });

  instances.forEach(v => {
    const rec = state.trip.expenses[v];

    const li = document.createElement('li');
    li.className = 'expense-row';

    const vEl = document.createElement('strong');
    vEl.className = 'exp-veh';
    vEl.textContent = v;

    const tollIn = document.createElement('input');
    tollIn.type = 'number';
    tollIn.min = 0;
    tollIn.placeholder = 'Toll';
    tollIn.value = rec.toll || 0;
    tollIn.disabled = !!rec.tollFree;
    tollIn.oninput = () => {
      rec.toll = +tollIn.value || 0;
      updateExpenseTotals();
      updateSummary();
    };

    const driverIn = document.createElement('input');
    driverIn.type = 'number';
    driverIn.min = 0;
    driverIn.placeholder = 'Driver';
    driverIn.value = rec.driver || 0;
    driverIn.disabled = !!rec.driverFree;
    driverIn.oninput = () => {
      rec.driver = +driverIn.value || 0;
      updateExpenseTotals();
      updateSummary();
    };

    const freeLabel = document.createElement('label');
    freeLabel.className = 'free-toggle' + (rec.tollFree && rec.driverFree ? ' on' : '');

    const freeCb = document.createElement('input');
    freeCb.type = 'checkbox';
    freeCb.checked = !!(rec.tollFree && rec.driverFree);

    const freeText = document.createElement('small');
    freeText.textContent = 'Free';

    freeCb.onchange = () => {
      const on = freeCb.checked;
      rec.tollFree = on;
      rec.driverFree = on;
      if (on) { rec.toll = 0; rec.driver = 0; }
      freeLabel.classList.toggle('on', on);
      tollIn.disabled = on;
      driverIn.disabled = on;
      tollIn.value = on ? 0 : rec.toll;
      driverIn.value = on ? 0 : rec.driver;
      updateExpenseTotals();
      updateSummary();
    };

    freeLabel.append(freeCb, freeText);
    li.append(vEl, tollIn, driverIn, freeLabel);
    ul.append(li);
  });

  updateExpenseTotals();
}

function updateExpenseTotals() {
  let toll = 0, driver = 0;
  Object.values(state.trip.expenses).forEach(r => {
    if (!r.tollFree)   toll   += +r.toll   || 0;
    if (!r.driverFree) driver += +r.driver || 0;
  });

  state.trip.toll   = toll;
  state.trip.driver = driver;

  const t1 = $('#exp-toll-total');
  const t2 = $('#exp-driver-total');
  if (t1) t1.textContent = fmt(toll);
  if (t2) t2.textContent = fmt(driver);
}

/* =====================================================
   GIRLS
   ===================================================== */
function updateGirlsTotal() {
  const count = state.trip.girlsCount || 0;
  const per   = state.trip.girlsFarePer || 0;
  const total = count * per;
  state.trip.girlsTotal = total;

  const el = $('#girls-total');
  if (el) el.textContent = fmt(total);
}

/* =====================================================
   FILTER TABS
   ===================================================== */
function renderBatchTabs() {
  const nav = $('#batch-tabs');
  if (!nav) return;
  nav.innerHTML = '';

  const mkTab = (key, label, cls = '') => {
    const btn = document.createElement('button');
    btn.className = 'batch-tab' +
      (state.activeBatch === key ? ' active' : '') +
      (cls ? ' ' + cls : '');
    btn.dataset.batch = key;
    btn.textContent = label;
    btn.onclick = () => {
      state.activeBatch = key;
      $$('.batch-tab').forEach(t => t.classList.toggle('active', t.dataset.batch === key));
      renderBoysList();
    };
    return btn;
  };

  nav.append(mkTab('all', 'All'));
  state.batches.forEach(b => nav.append(mkTab(b, b)));

  nav.append(mkTab('present', '✓ Present', 'filter-present'));
  nav.append(mkTab('absent',  '✕ Absent',  'filter-absent'));
  nav.append(mkTab('notpaid', '◌ Not Paid','filter-notpaid'));
}

/* =====================================================
   BOYS LIST
   ===================================================== */
function renderBoysList() {
  const ul = $('#boys-list');
  if (!ul) return;
  ul.innerHTML = '';

  if (!state.boysMaster.length) {
    ul.innerHTML = `<li class="empty-state">
      <strong>Abhi koi boy add nahi hua</strong>
      Settings → Boys List mein jaa kar boys add karein
    </li>`;
    updateBulkCount();
    return;
  }

  const vehicles = getVehicleInstances();
  if (!vehicles.length) {
    ul.innerHTML = `<li class="empty-state">
      <strong>Pehle vehicles arrange karein</strong>
      "Date & Vehicles" tab mein vehicles ka count set karein
    </li>`;
    updateBulkCount();
    return;
  }

  syncTripBoys();

  const filtered = state.trip.boys.filter(boy => {
    const filter = state.activeBatch;

    if (filter === 'all') return true;

    if (filter === 'present') {
      return !boy.absent && (+boy.fare || 0) > 0;
    }

    if (filter === 'absent') {
      return boy.absent || (!boy.absent && (+boy.fare || 0) === 0);
    }

    if (filter === 'notpaid') {
      return !boy.absent && (+boy.fare || 0) === 0;
    }

    return String(boy.batch) === String(filter);
  });

  if (!filtered.length) {
    let msg = 'Koi boy nahi mila';
    if (state.activeBatch === 'present') msg = 'Koi present boy nahi (fare > 0)';
    else if (state.activeBatch === 'absent') msg = 'Koi absent boy nahi';
    else if (state.activeBatch === 'notpaid') msg = 'Sab boys ne fare pay kar diya hai';

    ul.innerHTML = `<li class="empty-state">
      <strong>${msg}</strong>
      Filter change karein ya doosra batch select karein
    </li>`;
    updateBulkCount();
    return;
  }

  filtered.forEach(boy => {
    const globalIdx = state.trip.boys.indexOf(boy);
    const isNotPaid = !boy.absent && (+boy.fare || 0) === 0;

    const li = document.createElement('li');
    li.className = 'boy-row' +
      (boy.absent ? ' absent' : '') +
      (boy.selected ? ' selected' : '') +
      (isNotPaid ? ' not-paid' : '');
    li.dataset.idx = globalIdx;

    const sel = document.createElement('input');
    sel.type = 'checkbox';
    sel.className = 'row-sel';
    sel.checked = !!boy.selected;
    sel.onchange = () => {
      boy.selected = sel.checked;
      li.classList.toggle('selected', boy.selected);
      updateBulkCount();
    };

    const name = document.createElement('strong');
    name.className = 'row-name';
    name.textContent = boy.name;
    name.title = boy.name;

    const batch = document.createElement('em');
    batch.className = 'row-batch';
    batch.textContent = boy.batch;

    const vehSel = document.createElement('select');
    vehSel.className = 'row-veh';
    const currentVeh = boy.vehicle || vehicles[0];
    if (!vehicles.includes(currentVeh)) boy.vehicle = vehicles[0];
    vehicles.forEach(v => {
      const o = document.createElement('option');
      o.value = v; o.textContent = v;
      if (boy.vehicle === v) o.selected = true;
      vehSel.append(o);
    });
    vehSel.onchange = () => { boy.vehicle = vehSel.value; };

    const fareIn = document.createElement('input');
    fareIn.type = 'number';
    fareIn.min = 0;
    fareIn.className = 'fare-in';
    fareIn.placeholder = 'Fare';
    fareIn.value = boy.fare || 0;
    fareIn.oninput = () => {
      boy.fare = +fareIn.value || 0;
      li.classList.toggle('not-paid', !boy.absent && boy.fare === 0);
      updateSummary();
    };

    const absentLabel = document.createElement('label');
    absentLabel.className = 'absent-toggle' + (boy.absent ? ' on' : '');
    absentLabel.title = boy.absent ? 'Mark Present' : 'Mark Absent';

    const absentCb = document.createElement('input');
    absentCb.type = 'checkbox';
    absentCb.checked = !!boy.absent;
    absentCb.onchange = () => {
      boy.absent = absentCb.checked;
      if (boy.absent) { boy.fare = 0; boy.selected = false; }
      renderBoysList();
      updateSummary();
    };

    const absentText = document.createElement('small');
    absentText.textContent = 'Absent';

    absentLabel.append(absentCb, absentText);

    li.append(sel, name, batch, vehSel, fareIn, absentLabel);
    ul.append(li);
  });

  updateBulkCount();
}

function syncTripBoys() {
  const vehicles = getVehicleInstances();
  const masterKeys = new Set(state.boysMaster.map(b => `${b.name}|${b.batch}`));

  state.trip.boys = state.trip.boys.filter(b => masterKeys.has(`${b.name}|${b.batch}`));

  const existing = new Set(state.trip.boys.map(b => `${b.name}|${b.batch}`));
  state.boysMaster.forEach(m => {
    const key = `${m.name}|${m.batch}`;
    if (!existing.has(key)) {
      state.trip.boys.push({
        name: m.name,
        batch: m.batch,
        vehicle: vehicles[0] || '',
        fare: 0,
        absent: false,
        selected: false
      });
    }
  });

  state.trip.boys.forEach(b => {
    if (!vehicles.includes(b.vehicle)) b.vehicle = vehicles[0] || '';
  });
}

/* =====================================================
   BULK SELECT / ACTIONS
   ===================================================== */
function bulkSelect(on) {
  state.trip.boys.forEach(b => {
    if (state.activeBatch === 'all' ||
        String(b.batch) === String(state.activeBatch) ||
        ['present','absent','notpaid'].includes(state.activeBatch)) {
      b.selected = on;
    }
  });
  renderBoysList();
}

function bulkApplyFare() {
  const val = +$('#bulk-fare').value;
  if (!val || val < 0) return toast('Fare value daalein');
  const selected = state.trip.boys.filter(b => b.selected);
  if (!selected.length) return toast('Pehle boys select karein');

  selected.forEach(b => { b.fare = val; b.absent = false; b.selected = false; });
  $('#bulk-fare').value = '';
  renderBoysList();
  updateSummary();
  toast(`✅ ${selected.length} boys ka fare ${fmt(val)} set`);
}

function bulkSetAbsent(absent) {
  const selected = state.trip.boys.filter(b => b.selected);
  if (!selected.length) return toast('Pehle boys select karein');

  selected.forEach(b => {
    b.absent = absent;
    if (absent) b.fare = 0;
    b.selected = false;
  });
  renderBoysList();
  updateSummary();
  toast(absent ? `❌ ${selected.length} boys absent` : `✅ ${selected.length} boys present`);
}

function updateBulkCount() {
  const n = state.trip.boys.filter(b => b.selected).length;
  const el = $('#sel-count');
  if (el) el.textContent = `${n} selected`;
}

/* =====================================================
   LIVE SUMMARY
   ===================================================== */
function updateSummary() {
  const present = state.trip.boys.filter(b => !b.absent);
  const absent  = state.trip.boys.filter(b => b.absent);

  const boysTotal = present.reduce((s, b) => s + (+b.fare || 0), 0);

  const girls = (state.trip.girlsCount || 0) * (state.trip.girlsFarePer || 0);
  state.trip.girlsTotal = girls;

  let toll = 0, driver = 0;
  Object.values(state.trip.expenses || {}).forEach(r => {
    if (!r.tollFree)   toll   += +r.toll   || 0;
    if (!r.driverFree) driver += +r.driver || 0;
  });

  state.trip.toll   = toll;
  state.trip.driver = driver;

  const totalFare = boysTotal + girls;
  const net       = totalFare - toll - driver;

  const setTxt = (id, v) => { const el = $(id); if (el) el.textContent = v; };
  setTxt('#sum-present', present.length);
  setTxt('#sum-absent',  absent.length);
  setTxt('#sum-boys',    fmt(boysTotal));
  setTxt('#sum-girls',   fmt(girls));
  setTxt('#sum-total',   fmt(totalFare));
  setTxt('#sum-toll',    fmt(toll));
  setTxt('#sum-driver',  fmt(driver));
  setTxt('#sum-net',     fmt(net));

  const netRow = $('#net-row');
  if (netRow) {
    netRow.classList.toggle('positive', net >= 0);
    netRow.classList.toggle('negative', net < 0);
  }
}

/* =====================================================
   SAVE TRIP (global)
   ===================================================== */
async function saveTrip() {
  if (!state.user) return toast('Login required');

  const btn = $('#save-trip');
  if (btn) btn.disabled = true;

  state.suppressRemoteToast = true;
  setTimeout(() => { state.suppressRemoteToast = false; }, 2500);

  try {
    const vehiclesMap = { ...state.trip.vehicles };
    if (!Object.keys(vehiclesMap).length) {
      return toast('Kam az kam ek vehicle arrange karein');
    }

    syncTripBoys();

    const present = state.trip.boys.filter(b => !b.absent);
    const boysTotal = present.reduce((s, b) => s + (+b.fare || 0), 0);

    const girlsCount   = state.trip.girlsCount   || 0;
    const girlsFarePer = state.trip.girlsFarePer || 0;
    const girlsTotal   = girlsCount * girlsFarePer;

    let toll = 0, driver = 0;
    Object.values(state.trip.expenses || {}).forEach(r => {
      if (!r.tollFree)   toll   += +r.toll   || 0;
      if (!r.driverFree) driver += +r.driver || 0;
    });

    const totalFare = boysTotal + girlsTotal;
    const net       = totalFare - toll - driver;

    const payload = {
      vehicles: vehiclesMap,
      boys: state.trip.boys.map(b => ({
        name: b.name,
        batch: b.batch,
        vehicle: b.vehicle,
        fare: b.absent ? 0 : (+b.fare || 0),
        absent: !!b.absent
      })),
      expenses: JSON.parse(JSON.stringify(state.trip.expenses || {})),
      girlsCount,
      girlsFarePer,
      girlsTotal,
      boysTotal,
      totalFare,
      toll,
      driver,
      net
    };

    const result = await saveTripByDateSafe(state.trip.date, payload, editorInfo());
    state.loadedTodayId = result.id;

    toast(result.updated ? '✅ Entry updated!' : '✅ Trip saved!');
    updateSaveHint();

    state.trips = await loadAllTripsSafe(3, 300);
    renderHistory();

    if (state.trip.date !== todayISO()) resetTripForm();
  } catch (err) {
    toast('❌ Save fail: ' + (err.message || err.code));
  } finally {
    if (btn) btn.disabled = false;
  }
}

function resetTripForm() {
  state.trip.vehicles     = {};
  state.trip.boys         = [];
  state.trip.girlsCount   = 0;
  state.trip.girlsFarePer = 0;
  state.trip.girlsTotal   = 0;
  state.trip.toll         = 0;
  state.trip.driver       = 0;
  state.trip.expenses     = {};
  state.loadedTodayId     = null;

  const setV = (id, v) => { const el = $(id); if (el) el.value = v; };
  setV('#girls-count', 0);
  setV('#girls-fare-per', 0);

  updateGirlsTotal();
  renderVehicles();
  renderBoysList();
  renderExpenses();
  updateSummary();
  updateSaveHint();
}

/* =====================================================
   HISTORY
   ===================================================== */
function renderHistory(filter = '') {
  const ul = $('#history-list');
  if (!ul) return;
  ul.innerHTML = '';

  const bulkBar = $('#history-bulk-bar');
  if (bulkBar) bulkBar.hidden = state.trips.length === 0;

  const list = state.trips.filter(t =>
    !filter || String(t.date || '').includes(filter)
  );

  if (!list.length) {
    ul.innerHTML = `<li class="history-item no-select" style="cursor:default;text-align:center;color:var(--text-dim)">
      Koi trip nahi mili.
    </li>`;
    updateHistoryCount();
    return;
  }

  const today = todayISO();

  list.forEach(t => {
    const li = document.createElement('li');
    li.className = 'history-item' + (state.historySelected.has(t.id) ? ' selected' : '');

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'history-check';
    cb.checked = state.historySelected.has(t.id);
    cb.onclick = e => e.stopPropagation();
    cb.onchange = () => {
      if (cb.checked) state.historySelected.add(t.id);
      else state.historySelected.delete(t.id);
      li.classList.toggle('selected', cb.checked);
      updateHistoryCount();
    };

    const body = document.createElement('article');
    body.className = 'hist-body';
    body.style.cursor = 'pointer';
    body.onclick = () => showTripDetails(t);

    const header = document.createElement('header');

    const time = document.createElement('time');
    time.textContent = t.date || '—';
    if (t.date === today) {
      const tag = document.createElement('small');
      tag.className = 'today-tag';
      tag.textContent = 'TODAY';
      time.append(' ', tag);
    }

    const badge = document.createElement('strong');
    badge.className = 'net-badge ' + (t.net >= 0 ? 'pos' : 'neg');
    badge.textContent = fmt(t.net);
    header.append(time, badge);

    const p = document.createElement('p');
    const vList = Object.entries(t.vehicles || {})
      .map(([k, v]) => `${k}×${v}`).join(', ');
    const presentCount = (t.boys || []).filter(b => !b.absent).length;
    const absentCount  = (t.boys || []).filter(b => b.absent).length;
    const whoBy = t.updatedByName ? ` • by ${esc(t.updatedByName)}` : '';
    p.textContent = `${vList || 'No vehicles'} • Present: ${presentCount} • Absent: ${absentCount} • Fare: ${fmt(t.totalFare)} • Toll: ${fmt(t.toll)} • Driver: ${fmt(t.driver)}${whoBy}`;

    body.append(header, p);
    li.append(cb, body);
    ul.append(li);
  });

  updateHistoryCount();
}

function updateHistoryCount() {
  const el = $('#history-sel-count');
  if (el) el.textContent = `${state.historySelected.size} selected`;
}

/* =====================================================
   TRIP DETAIL MODAL
   ===================================================== */
function showTripDetails(t) {
  const modal = $('#detail-modal');
  const body  = $('#modal-body');
  $('#modal-title').textContent = 'Trip — ' + (t.date || '—');
  body.innerHTML = '';

  const vHTML = Object.entries(t.vehicles || {})
    .map(([v, c]) => `<li><em>${esc(v)}</em><strong>${c}</strong></li>`)
    .join('') || '<li><em>None</em><strong>0</strong></li>';

  body.insertAdjacentHTML('beforeend', `
    <section class="modal-section">
      <h3>🚐 Vehicles Arranged</h3>
      <ul>${vHTML}</ul>
    </section>
  `);

  if (Array.isArray(t.boys) && t.boys.length) {
    const grouped = {};
    t.boys.forEach(b => {
      const v = b.vehicle || 'Unassigned';
      (grouped[v] = grouped[v] || []).push(b);
    });

    const gHTML = Object.entries(grouped).map(([veh, arr]) => {
      const collected = arr.filter(b => !b.absent).reduce((s, b) => s + (+b.fare || 0), 0);
      const rows = arr.map(b => `
        <li style="padding-left:1rem;${b.absent ? 'opacity:.5;text-decoration:line-through' : ''}">
          <em>↳ ${esc(b.name)} ${b.absent ? '(Absent)' : `[Batch ${esc(b.batch)}]`}</em>
          <strong>${b.absent ? '—' : fmt(b.fare)}</strong>
        </li>
      `).join('');
      return `
        <ul style="margin-bottom:.6rem">
          <li><em><strong>${esc(veh)}</strong></em><strong>${fmt(collected)}</strong></li>
          ${rows}
        </ul>
      `;
    }).join('');

    body.insertAdjacentHTML('beforeend', `
      <section class="modal-section">
        <h3>👦 Boys — Vehicle-wise</h3>
        ${gHTML}
      </section>
    `);
  }

  const exp = t.expenses || {};
  if (Object.keys(exp).length) {
    const rows = Object.entries(exp).map(([veh, r]) => {
      const tollTxt   = r.tollFree   ? 'Free' : fmt(r.toll);
      const driverTxt = r.driverFree ? 'Free' : fmt(r.driver);
      return `<li><em>${esc(veh)} — Toll / Driver</em><strong>${tollTxt} / ${driverTxt}</strong></li>`;
    }).join('');
    body.insertAdjacentHTML('beforeend', `
      <section class="modal-section">
        <h3>🚐 Per-Vehicle Expenses</h3>
        <ul>${rows}</ul>
      </section>
    `);
  }

  const gCount = t.girlsCount || 0;
  const gPer   = t.girlsFarePer || 0;
  const gTotal = t.girlsTotal || (gCount * gPer) || 0;
  body.insertAdjacentHTML('beforeend', `
    <section class="modal-section">
      <h3>👧 Girls</h3>
      <ul>
        <li><em>Count</em><strong>${gCount}</strong></li>
        <li><em>Fare per Girl</em><strong>${fmt(gPer)}</strong></li>
        <li><em>Total Collected</em><strong>${fmt(gTotal)}</strong></li>
      </ul>
    </section>
  `);

  const whoHTML = t.updatedByName
    ? `<li><em>Last updated by</em><strong>${esc(t.updatedByName)}</strong></li>`
    : '';

  body.insertAdjacentHTML('beforeend', `
    <section class="modal-section">
      <h3>💰 Financials</h3>
      <ul>
        <li><em>Boys Collected</em><strong>${fmt(t.boysTotal)}</strong></li>
        <li><em>Girls Collected</em><strong>${fmt(gTotal)}</strong></li>
        <li><em>Total Fare</em><strong>${fmt(t.totalFare)}</strong></li>
        <li><em>Toll (–)</em><strong>${fmt(t.toll)}</strong></li>
        <li><em>Driver Cost (–)</em><strong>${fmt(t.driver)}</strong></li>
        <li style="border-top:1px dashed var(--glass-bd);padding-top:.5rem;margin-top:.4rem">
          <em><strong>Net ${t.net >= 0 ? 'Profit ✅' : 'Loss ❌'}</strong></em>
          <strong style="color:${t.net >= 0 ? 'var(--green)' : 'var(--red)'}">${fmt(t.net)}</strong>
        </li>
        ${whoHTML}
      </ul>
    </section>
  `);

  modal.showModal();
}

/* =====================================================
   SETTINGS — VEHICLE CHIPS
   ===================================================== */
function renderVehicleSettings() {
  const ul = $('#vehicle-settings');
  if (!ul) return;
  ul.innerHTML = '';

  if (!state.vehicles.length) {
    ul.innerHTML = `<li class="chip-item" style="opacity:.6">No vehicles</li>`;
    return;
  }

  state.vehicles.forEach((v, i) => {
    const li = document.createElement('li');
    li.className = 'chip-item';
    li.textContent = v;

    const rm = document.createElement('button');
    rm.className = 'remove-btn';
    rm.textContent = '✕';
    rm.onclick = async () => {
      if (state.vehicles.length <= 1) return toast('Kam az kam 1 vehicle chahiye');
      state.vehicles.splice(i, 1);
      await persistGlobalConfig();
      renderVehicleSettings();
      renderVehicles();
      renderBoysList();
      renderExpenses();
      toast('Vehicle removed');
    };
    li.append(rm);
    ul.append(li);
  });
}

/* =====================================================
   SETTINGS — BATCH CHIPS
   ===================================================== */
function renderBatchSettings() {
  const ul = $('#batch-settings');
  if (!ul) return;
  ul.innerHTML = '';

  if (!state.batches.length) {
    ul.innerHTML = `<li class="chip-item" style="opacity:.6">No batches</li>`;
    return;
  }

  state.batches.forEach((b, i) => {
    const li = document.createElement('li');
    li.className = 'chip-item';
    li.textContent = b;

    const rm = document.createElement('button');
    rm.className = 'remove-btn';
    rm.textContent = '✕';
    rm.onclick = async () => {
      state.batches.splice(i, 1);
      if (state.activeBatch === b) state.activeBatch = 'all';
      await persistGlobalConfig();
      renderBatchSettings();
      renderBatchTabs();
      renderBoysList();
      renderBoysMaster();
      toast('Batch removed');
    };
    li.append(rm);
    ul.append(li);
  });
}

/* =====================================================
   SETTINGS — BOYS MASTER
   ===================================================== */
function renderBoysMaster() {
  const ul = $('#boys-master');
  const sel = $('#master-batch');
  if (!ul || !sel) return;

  ul.innerHTML = '';
  sel.innerHTML = '';

  if (!state.batches.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '— Pehle batch add karein —';
    opt.disabled = true;
    opt.selected = true;
    sel.append(opt);
  } else {
    state.batches.forEach(b => {
      const o = document.createElement('option');
      o.value = b; o.textContent = b;
      sel.append(o);
    });
  }

  if (!state.boysMaster.length) {
    ul.innerHTML = `<li class="empty-state">
      <strong>Abhi koi boy add nahi hua</strong>
      Upar form se naam + batch select karke add karein
    </li>`;
    return;
  }

  state.boysMaster.forEach((boy, i) => {
    const li = document.createElement('li');
    li.className = 'master-row';

    const num = document.createElement('strong');
    num.className = 'row-num';
    num.textContent = '#' + (i + 1);

    const nameIn = document.createElement('input');
    nameIn.type = 'text';
    nameIn.value = boy.name;
    nameIn.placeholder = 'Name';
    nameIn.onblur = async () => {
      const v = nameIn.value.trim();
      if (!v) { nameIn.value = boy.name; return; }
      boy.name = v;
      await persistBoysMaster();
      renderBoysList();
    };

    const batchSel = document.createElement('select');
    state.batches.forEach(b => {
      const o = document.createElement('option');
      o.value = b; o.textContent = b;
      if (String(boy.batch) === String(b)) o.selected = true;
      batchSel.append(o);
    });
    batchSel.style.cssText = 'padding:.4rem;border-radius:8px;background:rgba(0,0,0,.2);color:var(--text);border:1px solid var(--glass-bd);font-family:inherit;font-size:.8rem';
    batchSel.onchange = async () => {
      boy.batch = batchSel.value;
      await persistBoysMaster();
      renderBoysList();
    };

    const rm = document.createElement('button');
    rm.className = 'remove-btn';
    rm.textContent = '✕';
    rm.onclick = async () => {
      state.boysMaster.splice(i, 1);
      await persistBoysMaster();
      renderBoysMaster();
      renderBoysList();
      toast('Boy removed');
    };

    li.append(num, nameIn, batchSel, rm);
    ul.append(li);
  });
}

async function persistBoysMaster() {
  await persistGlobalConfig();
}

/* =====================================================
   SETTINGS — GLOBAL CONFIG PERSISTENCE
   (vehicles / batches / boys ONLY — layout is per-user)
   ===================================================== */
async function persistGlobalConfig() {
  state.suppressRemoteToast = true;
  setTimeout(() => { state.suppressRemoteToast = false; }, 2000);

  await saveGlobalConfigSafe({
    vehicles: state.vehicles,
    batches:  state.batches,
    boys:     state.boysMaster
  }, editorInfo());
}

/* =====================================================
   SETTINGS — ADD FORMS
   ===================================================== */
async function addVehicle(e) {
  e.preventDefault();
  const v = $('#new-vehicle').value.trim();
  if (!v) return;
  if (state.vehicles.includes(v)) return toast('Already exists');

  state.vehicles.push(v);
  $('#new-vehicle').value = '';
  await persistGlobalConfig();
  renderVehicleSettings();
  renderVehicles();
  renderExpenses();
  renderBoysList();
  toast('✅ Vehicle added');
}

async function addBatch(e) {
  e.preventDefault();
  const b = $('#new-batch').value.trim();
  if (!b) return;
  if (state.batches.includes(b)) return toast('Already exists');

  state.batches.push(b);
  $('#new-batch').value = '';
  await persistGlobalConfig();
  renderBatchSettings();
  renderBatchTabs();
  renderBoysMaster();
  renderBoysList();
  toast('✅ Batch added');
}

async function addBoyMaster(e) {
  e.preventDefault();
  const name = $('#master-name').value.trim();
  const batch = $('#master-batch').value;

  if (!name) return toast('Name daalein');
  if (!state.batches.length) return toast('Pehle Batches tab mein koi batch add karein');
  if (!batch) return toast('Batch select karein');

  const dup = state.boysMaster.some(
    b => b.name.toLowerCase() === name.toLowerCase() && String(b.batch) === String(batch)
  );
  if (dup) return toast('Yeh boy is batch mein already hai');

  state.boysMaster.push({ name, batch });
  $('#master-name').value = '';
  await persistBoysMaster();
  renderBoysMaster();
  renderBoysList();
  toast('✅ Boy added');
}

/* =====================================================
   ADMINS TAB
   ===================================================== */
async function refreshAdminsTab() {
  if (!state.isAdminUser) return;
  const ul = $('#admins-list');
  if (!ul) return;

  ul.innerHTML = `<li class="empty-state">Loading users…</li>`;

  try {
    const [users, admins] = await Promise.all([listAllUsers(), listAdmins()]);
    state.usersCache = users;
    state.adminsCache = admins;

    const adminUids = new Set(admins.map(a => a.uid));

    if (!users.length) {
      ul.innerHTML = `<li class="empty-state">Abhi koi user register nahi hua.</li>`;
      return;
    }

    ul.innerHTML = '';
    users.forEach(u => {
      const isAdm = adminUids.has(u.uid);
      const isSelf = u.uid === state.user.uid;

      const li = document.createElement('li');
      li.className = 'admin-row' + (isAdm ? ' is-admin' : '');

      const av = document.createElement('output');
      av.className = 'admin-avatar';
      av.textContent = (u.email || '?')[0].toUpperCase();

      const info = document.createElement('section');
      info.className = 'admin-info';
      const strong = document.createElement('strong');
      strong.textContent = u.email || '(no email)';
      const small = document.createElement('small');
      small.textContent = isSelf ? 'You' : (isAdm ? 'Admin' : 'User');
      info.append(strong, small);

      const btn = document.createElement('button');
      btn.className = 'mini-btn ' + (isAdm ? 'red' : 'gold');
      btn.textContent = isAdm ? 'Revoke' : 'Make Admin';
      btn.disabled = isSelf;
      if (isSelf) btn.title = 'Khud ko revoke nahi kar sakte';

      btn.onclick = async () => {
        try {
          if (isAdm) {
            if (isSelf) return toast('Khud ko revoke nahi kar sakte');
            const ok = await confirmDialog('Revoke Admin',
              `${u.email} ko admin se hata dein?`, 'Revoke');
            if (!ok) return;
            await revokeAdmin(u.uid);
            toast('👤 Admin revoked');
          } else {
            await grantAdmin(u.uid, u.email, state.user.email);
            toast('👑 Admin granted');
          }
          await refreshAdminsTab();
        } catch (err) {
          toast('❌ ' + (err.message || err));
        }
      };

      li.append(av, info, btn);
      ul.append(li);
    });
  } catch (err) {
    ul.innerHTML = `<li class="empty-state">Load fail: ${esc(err.message)}</li>`;
  }
}

/* =====================================================
   PWA INSTALL PROMPT
   ===================================================== */
function initPWA() {
  const promptEl = $('#pwa-install');
  const installBtn = $('#pwa-install-btn');
  const dismissBtn = $('#pwa-dismiss');
  if (!promptEl) return;

  if (window.matchMedia('(display-mode: standalone)').matches) return;
  if (localStorage.getItem('ff-pwa-dismissed') === '1') return;

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    state.pwaPrompt = e;
    promptEl.hidden = false;
    requestAnimationFrame(() => promptEl.classList.add('show'));
  });

  if (installBtn) installBtn.onclick = async () => {
    if (!state.pwaPrompt) return;
    state.pwaPrompt.prompt();
    const { outcome } = await state.pwaPrompt.userChoice;
    state.pwaPrompt = null;
    promptEl.classList.remove('show');
    setTimeout(() => { promptEl.hidden = true; }, 400);
    if (outcome === 'accepted') toast('📲 Installed!');
  };

  if (dismissBtn) dismissBtn.onclick = () => {
    localStorage.setItem('ff-pwa-dismissed', '1');
    promptEl.classList.remove('show');
    setTimeout(() => { promptEl.hidden = true; }, 400);
  };

  window.addEventListener('appinstalled', () => {
    promptEl.classList.remove('show');
    setTimeout(() => { promptEl.hidden = true; }, 400);
  });
}

/* =====================================================
   RIPPLE EFFECT
   ===================================================== */
document.addEventListener('pointerdown', e => {
  const btn = e.target.closest('.ripple');
  if (!btn) return;
  const r = document.createElement('b');
  const rect = btn.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  Object.assign(r.style, {
    position: 'absolute',
    width: size + 'px',
    height: size + 'px',
    left: (e.clientX - rect.left - size / 2) + 'px',
    top:  (e.clientY - rect.top  - size / 2) + 'px',
    background: 'rgba(255,255,255,0.5)',
    borderRadius: '50%',
    transform: 'scale(0)',
    animation: 'rippleAnim .6s ease-out',
    pointerEvents: 'none'
  });
  btn.append(r);
  setTimeout(() => r.remove(), 650);
});

const rippleStyle = document.createElement('style');
rippleStyle.textContent = '@keyframes rippleAnim{to{transform:scale(2.5);opacity:0}}';
document.head.append(rippleStyle);

/* =====================================================
   BOOT
   ===================================================== */
document.addEventListener('DOMContentLoaded', () => {
  boot.init();
  boot.set(5, 'Starting up…');
  document.body.classList.add('no-scroll');

  initTheme();
  boot.set(15, 'Theme ready');

  initAuth();
  boot.set(30, 'Auth initializing…');

  initPWA();
  boot.set(40, 'PWA checked');

  const d = $('#trip-date');
  if (d) d.value = todayISO();

  setTimeout(() => {
    if (boot.value < 100) {
      boot.set(100, 'Ready!');
      boot.hide();
      showSkeleton(false);
    }
  }, 12000);
});