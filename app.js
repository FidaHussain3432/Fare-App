/* =====================================================
   FAREFLOW — MAIN APP LOGIC v2.1
   • Admin gating (super admin: fh87022@gmail.com)
   • Boys list bug fixed (master sync)
   • Today's entry persistence (upsert + auto-load)
   • Vehicle stepper (− / +) — no keyboard
   • Per-vehicle expenses with "Free" toggle
   • Sliding gold tab indicators
   • History bulk delete
   • PWA install prompt
   • Confirm modal (reusable)
   • Admin management tab
   FIX v2.1:
   • Unique subtab IDs (entry-subtab-* / settings-subtab-*)
   • Boys Master list now renders empty-state clearly
   • Batch select empty handling (auto-message)
   • Subtab click routing updated for renamed IDs
   ===================================================== */

/* =====================================================
   STATE
   ===================================================== */
const state = {
  user: null,
  isAdminUser: false,
  vehicles: [],
  batches: [],
  boysMaster: [],

  trip: {
    date: new Date().toISOString().slice(0, 10),
    vehicles: {},            // { Van: 2, Bus: 1 }
    boys: [],                // [{ name, batch, vehicle, fare, absent, selected }]
    girlsTotal: 0,
    toll: 0,
    driver: 0,
    expenses: {}             // { "Van 1": { toll, driver, tollFree, driverFree } }
  },

  activeBatch: 'all',
  trips: [],
  historySelected: new Set(),
  adminsCache: [],
  usersCache: [],
  pwaPrompt: null,
  loadedTodayId: null
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

/* Reusable confirm modal → returns Promise<boolean> */
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
   VEHICLE INSTANCES — flat list of concrete vehicles
   { Van: 2, Bus: 1 } → ['Van 1', 'Van 2', 'Bus 1']
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
  // refresh indicators after theme change
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
   SLIDING TAB INDICATOR
   ===================================================== */
function positionIndicator(container, indicatorSel, activeSel) {
  if (!container) return;
  const ind = container.querySelector(indicatorSel);
  const active = container.querySelector(activeSel);
  if (!ind || !active) return;

  const cRect = container.getBoundingClientRect();
  const aRect = active.getBoundingClientRect();
  const left = aRect.left - cRect.left;
  const width = aRect.width;

  ind.style.width = width + 'px';
  ind.style.transform = `translateX(${left - 4}px)`;
}

function initTabs() {
  const mainTabs = $('#main-tabs');
  const entrySubs = $('#entry-subtabs');
  const settingsSubs = $('#settings-subtabs');

  requestAnimationFrame(() => {
    positionIndicator(mainTabs, '.tab-indicator', '.tab.active');
    positionIndicator(entrySubs, '.subtab-indicator', '.subtab.active');
    positionIndicator(settingsSubs, '.subtab-indicator', '.subtab.active');
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
}

/* =====================================================
   AUTH
   ===================================================== */
function initAuth() {
  auth.onAuthStateChanged(async user => {
    state.user = user;

    if (!user) {
      state.isAdminUser = false;
      showView('login');
      return;
    }

    try {
      await registerUserSafe(user);
    } catch (e) {
      console.warn('registerUserSafe failed:', e);
    }

    const admin = await isAdmin(user.uid);
    state.isAdminUser = admin;

    if (!admin) {
      const pe = $('#pending-email');
      if (pe) pe.textContent = user.email || '';
      showView('pending');
      return;
    }

    showView('app');
    await bootstrapUser(user);
  });

  $('#login-form').onsubmit = async e => {
    e.preventDefault();
    const email = $('#email').value.trim();
    const pass  = $('#password').value;
    const msg   = $('#auth-msg');
    msg.textContent = '';
    try {
      await auth.signInWithEmailAndPassword(email, pass);
    } catch (err) {
      msg.textContent = cleanAuthError(err);
    }
  };

  $('#signup-btn').onclick = async () => {
    const email = $('#email').value.trim();
    const pass  = $('#password').value;
    const msg   = $('#auth-msg');
    msg.textContent = '';
    if (!email || pass.length < 6) {
      msg.textContent = 'Email + 6-char password required';
      return;
    }
    try {
      await auth.createUserWithEmailAndPassword(email, pass);
      toast('✅ Account created!');
    } catch (err) {
      msg.textContent = cleanAuthError(err);
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
  return m.replace('Firebase: ', '');
}

/* =====================================================
   BOOTSTRAP USER
   ===================================================== */
async function bootstrapUser(user) {
  const cfg = await loadUserConfigSafe(user.uid);
  state.vehicles   = cfg.vehicles;
  state.batches    = cfg.batches;
  state.boysMaster = cfg.boys;

  state.trips = await loadTripsSafe(user.uid);

  const removed = await cleanupOldTrips(user.uid);
  if (removed > 0) toast(`🧹 ${removed} purane trips delete kiye (3+ months)`);

  await loadTodayIntoForm();

  renderVehicles();
  renderBatchTabs();
  renderBoysList();
  renderBatchSettings();
  renderBoysMaster();
  renderVehicleSettings();
  renderExpenses();
  renderHistory();
  updateSummary();

  bindStaticEvents();
  initTabs();

  const adminsTab = $('#admins-tab-btn');
  if (adminsTab) adminsTab.hidden = !state.isAdminUser;
}

/* =====================================================
   LOAD TODAY'S ENTRY INTO FORM
   ===================================================== */
async function loadTodayIntoForm() {
  if (!state.user) return;

  const today = todayISO();
  const todayTrip = await loadTodayTripSafe(state.user.uid, today);
  if (!todayTrip) {
    state.loadedTodayId = null;
    updateSaveHint();
    return;
  }

  state.loadedTodayId = todayTrip.id;
  state.trip.date       = todayTrip.date || today;
  state.trip.vehicles   = { ...(todayTrip.vehicles || {}) };
  state.trip.girlsTotal = todayTrip.girlsTotal || 0;
  state.trip.toll       = todayTrip.toll || 0;
  state.trip.driver     = todayTrip.driver || 0;
  state.trip.expenses   = { ...(todayTrip.expenses || {}) };

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
  const gEl = $('#girls-total');
  if (gEl) gEl.value = state.trip.girlsTotal;
  const tEl = $('#toll-cost');
  if (tEl) tEl.value = state.trip.toll;
  const drEl = $('#driver-cost');
  if (drEl) drEl.value = state.trip.driver;

  toast('📝 Today\'s entry loaded');
  updateSaveHint();
}

function updateSaveHint() {
  const hint = $('#save-hint');
  if (!hint) return;
  if (state.loadedTodayId) {
    hint.textContent = '✓ Aaj ki entry mojood hai — Save karke update karein';
  } else {
    hint.textContent = '';
  }
}

/* =====================================================
   BIND STATIC EVENTS (once)
   ===================================================== */
let bound = false;
function bindStaticEvents() {
  if (bound) return;
  bound = true;

  /* ------- MAIN TABS ------- */
  $$('.tab').forEach(tab => tab.onclick = () => {
    $$('.tab').forEach(t => t.classList.remove('active'));
    $$('.tab-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    $('#tab-' + tab.dataset.tab)?.classList.add('active');
    positionIndicator($('#main-tabs'), '.tab-indicator', '.tab.active');
    if (tab.dataset.tab === 'history') renderHistory();
    if (tab.dataset.tab === 'settings' && state.isAdminUser) refreshAdminsTab();
  });

  /* ------- ENTRY SUB-TABS (uses entry-subtab-* IDs) ------- */
  $$('#entry-subtabs .subtab').forEach(st => st.onclick = () => {
    $$('#entry-subtabs .subtab').forEach(t => t.classList.remove('active'));
    $$('#tab-entry .subtab-panel').forEach(p => p.classList.remove('active'));
    st.classList.add('active');
    const panelId = 'entry-subtab-' + st.dataset.subtab;
    $('#' + panelId)?.classList.add('active');
    positionIndicator($('#entry-subtabs'), '.subtab-indicator', '.subtab.active');
  });

  /* ------- SETTINGS SUB-TABS (uses settings-subtab-* IDs) ------- */
  $$('#settings-subtabs .subtab').forEach(st => st.onclick = () => {
    $$('#settings-subtabs .subtab').forEach(t => t.classList.remove('active'));
    $$('#tab-settings .subtab-panel').forEach(p => p.classList.remove('active'));
    st.classList.add('active');
    const panelId = 'settings-subtab-' + st.dataset.subtab;
    $('#' + panelId)?.classList.add('active');
    positionIndicator($('#settings-subtabs'), '.subtab-indicator', '.subtab.active');
    if (st.dataset.subtab === 'admins' && state.isAdminUser) refreshAdminsTab();
    if (st.dataset.subtab === 'boysmaster') renderBoysMaster();
  });

  /* ------- INPUT BINDINGS ------- */
  const dateEl   = $('#trip-date');
  const girlsEl  = $('#girls-total');
  const tollEl   = $('#toll-cost');
  const driverEl = $('#driver-cost');

  if (dateEl) {
    dateEl.value = state.trip.date;
    dateEl.onchange = async e => {
      state.trip.date = e.target.value || todayISO();
      if (state.user) {
        const trip = await loadTodayTripSafe(state.user.uid, state.trip.date);
        if (trip && state.trip.date === todayISO()) {
          await loadTodayIntoForm();
          renderVehicles();
          renderBoysList();
          renderExpenses();
          updateSummary();
        }
      }
    };
  }

  if (girlsEl)  girlsEl.oninput  = e => { state.trip.girlsTotal = +e.target.value || 0; updateSummary(); };
  if (tollEl)   tollEl.oninput   = e => { state.trip.toll       = +e.target.value || 0; updateSummary(); };
  if (driverEl) driverEl.oninput = e => { state.trip.driver     = +e.target.value || 0; updateSummary(); };

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

  /* ------- BULK ACTIONS ------- */
  $('#select-all-btn').onclick  = () => bulkSelect(true);
  $('#clear-sel-btn').onclick   = () => bulkSelect(false);
  $('#apply-fare-btn').onclick  = bulkApplyFare;
  $('#mark-absent-btn').onclick = () => bulkSetAbsent(true);
  $('#mark-present-btn').onclick= () => bulkSetAbsent(false);

  /* ------- SETTINGS FORMS ------- */
  $('#add-vehicle-form').onsubmit = addVehicle;
  $('#add-batch-form').onsubmit   = addBatch;
  $('#add-boy-master').onsubmit   = addBoyMaster;

  /* ------- HISTORY ------- */
  $('#history-search').oninput = e => renderHistory(e.target.value);

  const selectAllBtn = $('#history-select-all');
  if (selectAllBtn) selectAllBtn.onclick = () => {
    state.trips.forEach(t => state.historySelected.add(t.id));
    renderHistory($('#history-search').value);
  };
  const clearSelBtn = $('#history-clear-sel');
  if (clearSelBtn) clearSelBtn.onclick = () => {
    state.historySelected.clear();
    renderHistory($('#history-search').value);
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
    state.trips = await loadTripsSafe(state.user.uid);
    renderHistory($('#history-search').value);
  };

  /* ------- MODAL ------- */
  $('#modal-close').onclick = () => $('#detail-modal').close();
  $('#detail-modal').addEventListener('click', e => {
    if (e.target === $('#detail-modal')) $('#detail-modal').close();
  });

  /* ------- ADMINS TAB ------- */
  const refreshAdmins = $('#refresh-users-btn');
  if (refreshAdmins) refreshAdmins.onclick = refreshAdminsTab;
}

/* =====================================================
   VEHICLES — RENDER (with stepper)
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

    const label = document.createElement('div');
    label.className = 'veh-label';
    label.textContent = v;

    const stepper = document.createElement('div');
    stepper.className = 'stepper';

    const btnMinus = document.createElement('button');
    btnMinus.type = 'button';
    btnMinus.textContent = '−';
    btnMinus.setAttribute('aria-label', `Decrease ${v}`);

    const valEl = document.createElement('div');
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
   EXPENSES — per-vehicle dynamic
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

    const vEl = document.createElement('div');
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

    const freeText = document.createElement('span');
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

  const tEl = $('#toll-cost');
  const dEl = $('#driver-cost');
  if (tEl) tEl.value = toll;
  if (dEl) dEl.value = driver;
}

/* =====================================================
   BATCH TABS
   ===================================================== */
function renderBatchTabs() {
  const nav = $('#batch-tabs');
  if (!nav) return;
  nav.innerHTML = '';

  const mkTab = (key, label) => {
    const btn = document.createElement('button');
    btn.className = 'batch-tab' + (state.activeBatch === key ? ' active' : '');
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
}

/* =====================================================
   BOYS LIST (Entry)
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

  const filtered = state.trip.boys.filter(b =>
    state.activeBatch === 'all' || String(b.batch) === String(state.activeBatch)
  );

  if (!filtered.length) {
    ul.innerHTML = `<li class="empty-state">
      <strong>Is batch mein koi boy nahi</strong>
      Doosra batch select karein ya naye boys add karein
    </li>`;
    updateBulkCount();
    return;
  }

  filtered.forEach(boy => {
    const globalIdx = state.trip.boys.indexOf(boy);
    const li = document.createElement('li');
    li.className = 'boy-row' +
      (boy.absent ? ' absent' : '') +
      (boy.selected ? ' selected' : '');
    li.dataset.idx = globalIdx;

    const num = document.createElement('strong');
    num.className = 'row-num';
    num.textContent = '#';

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

    const batch = document.createElement('em');
    batch.className = 'row-batch';
    batch.textContent = boy.batch;

    const vehSel = document.createElement('select');
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
    fareIn.placeholder = 'Fare';
    fareIn.value = boy.fare || 0;
    fareIn.oninput = () => { boy.fare = +fareIn.value || 0; updateSummary(); };

    const rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'remove-btn';
    rm.style.borderColor = boy.absent ? 'rgba(110,231,168,0.4)' : 'rgba(255,100,100,0.4)';
    rm.style.color = boy.absent ? 'var(--green)' : 'var(--red)';
    rm.textContent = boy.absent ? '✓' : '✕';
    rm.title = boy.absent ? 'Mark Present' : 'Mark Absent';
    rm.onclick = () => {
      boy.absent = !boy.absent;
      if (boy.absent) { boy.fare = 0; boy.selected = false; }
      renderBoysList();
      updateSummary();
    };

    li.append(num, sel, name, batch, vehSel, fareIn, rm);
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
    if (state.activeBatch === 'all' || String(b.batch) === String(state.activeBatch)) {
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
  const girls     = +($('#girls-total')?.value) || state.trip.girlsTotal || 0;

  let toll = 0, driver = 0;
  Object.values(state.trip.expenses || {}).forEach(r => {
    if (!r.tollFree)   toll   += +r.toll   || 0;
    if (!r.driverFree) driver += +r.driver || 0;
  });

  state.trip.girlsTotal = girls;
  state.trip.toll       = toll;
  state.trip.driver     = driver;

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
   SAVE TRIP (upsert today)
   ===================================================== */
async function saveTrip() {
  if (!state.user) return toast('Login required');

  const vehiclesMap = { ...state.trip.vehicles };
  if (!Object.keys(vehiclesMap).length) {
    return toast('Kam az kam ek vehicle arrange karein');
  }

  syncTripBoys();

  const present = state.trip.boys.filter(b => !b.absent);
  const boysTotal = present.reduce((s, b) => s + (+b.fare || 0), 0);
  const girls     = state.trip.girlsTotal || 0;

  let toll = 0, driver = 0;
  Object.values(state.trip.expenses || {}).forEach(r => {
    if (!r.tollFree)   toll   += +r.toll   || 0;
    if (!r.driverFree) driver += +r.driver || 0;
  });

  const totalFare = boysTotal + girls;
  const net       = totalFare - toll - driver;

  const payload = {
    date: state.trip.date,
    vehicles: vehiclesMap,
    boys: state.trip.boys.map(b => ({
      name: b.name,
      batch: b.batch,
      vehicle: b.vehicle,
      fare: b.absent ? 0 : (+b.fare || 0),
      absent: !!b.absent
    })),
    girlsTotal: girls,
    boysTotal,
    totalFare,
    toll,
    driver,
    expenses: JSON.parse(JSON.stringify(state.trip.expenses || {})),
    net
  };

  try {
    const today = todayISO();
    let result;

    if (state.trip.date === today) {
      result = await saveTodayTripSafe(state.user.uid, today, payload);
      state.loadedTodayId = result.id;
    } else {
      const id = await saveTripSafe(state.user.uid, payload);
      result = { id, updated: false };
    }

    toast(result.updated ? '✅ Today\'s entry updated!' : '✅ Trip saved!');
    updateSaveHint();

    state.trips = await loadTripsSafe(state.user.uid);
    renderHistory();

    if (state.trip.date !== today) resetTripForm();
  } catch (err) {
    toast('❌ Save fail: ' + (err.message || err.code));
  }
}

function resetTripForm() {
  state.trip.vehicles   = {};
  state.trip.boys       = [];
  state.trip.girlsTotal = 0;
  state.trip.toll       = 0;
  state.trip.driver     = 0;
  state.trip.expenses   = {};
  state.loadedTodayId   = null;

  const setV = (id, v) => { const el = $(id); if (el) el.value = v; };
  setV('#girls-total', 0);
  setV('#toll-cost', 0);
  setV('#driver-cost', 0);

  renderVehicles();
  renderBoysList();
  renderExpenses();
  updateSummary();
  updateSaveHint();
}

/* =====================================================
   HISTORY — RENDER
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

    const body = document.createElement('div');
    body.className = 'hist-body';
    body.style.cursor = 'pointer';
    body.onclick = () => showTripDetails(t);

    const header = document.createElement('header');

    const time = document.createElement('time');
    time.textContent = t.date || '—';
    if (t.date === today) {
      const tag = document.createElement('span');
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
    p.textContent = `${vList || 'No vehicles'} • Present: ${presentCount} • Absent: ${absentCount} • Fare: ${fmt(t.totalFare)} • Toll: ${fmt(t.toll)} • Driver: ${fmt(t.driver)}`;

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

  body.insertAdjacentHTML('beforeend', `
    <section class="modal-section">
      <h3>👧 Girls</h3>
      <ul><li><em>Girls Jo Total Kirayo</em><strong>${fmt(t.girlsTotal)}</strong></li></ul>
    </section>
  `);

  body.insertAdjacentHTML('beforeend', `
    <section class="modal-section">
      <h3>💰 Financials</h3>
      <ul>
        <li><em>Boys Collected</em><strong>${fmt(t.boysTotal)}</strong></li>
        <li><em>Girls Collected</em><strong>${fmt(t.girlsTotal)}</strong></li>
        <li><em>Total Fare</em><strong>${fmt(t.totalFare)}</strong></li>
        <li><em>Toll (–)</em><strong>${fmt(t.toll)}</strong></li>
        <li><em>Driver Cost (–)</em><strong>${fmt(t.driver)}</strong></li>
        <li style="border-top:1px dashed var(--glass-bd);padding-top:.5rem;margin-top:.4rem">
          <em><strong>Net ${t.net >= 0 ? 'Profit ✅' : 'Loss ❌'}</strong></em>
          <strong style="color:${t.net >= 0 ? 'var(--green)' : 'var(--red)'}">${fmt(t.net)}</strong>
        </li>
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
      await saveUserConfigSafe(state.user.uid, {
        vehicles: state.vehicles,
        batches: state.batches,
        boys: state.boysMaster
      });
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
      await saveUserConfigSafe(state.user.uid, {
        vehicles: state.vehicles,
        batches: state.batches,
        boys: state.boysMaster
      });
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
   FIX v2.1: Emits clear empty-state message and
   handles the case when no batches exist.
   ===================================================== */
function renderBoysMaster() {
  const ul = $('#boys-master');
  const sel = $('#master-batch');
  if (!ul || !sel) return;

  ul.innerHTML = '';
  sel.innerHTML = '';

  // Populate batch dropdown
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

  // Empty boys list
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
  await saveUserConfigSafe(state.user.uid, {
    vehicles: state.vehicles,
    batches: state.batches,
    boys: state.boysMaster
  });
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
  await saveUserConfigSafe(state.user.uid, {
    vehicles: state.vehicles,
    batches: state.batches,
    boys: state.boysMaster
  });
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
  await saveUserConfigSafe(state.user.uid, {
    vehicles: state.vehicles,
    batches: state.batches,
    boys: state.boysMaster
  });
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

      const av = document.createElement('div');
      av.className = 'admin-avatar';
      av.textContent = (u.email || '?')[0].toUpperCase();

      const info = document.createElement('div');
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
  initTheme();
  initAuth();
  initPWA();

  const d = $('#trip-date');
  if (d) d.value = todayISO();
});