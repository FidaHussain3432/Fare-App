/* =====================================================
   FAREFLOW — MAIN APP LOGIC
   Aik admin = aik user. Data per-user via uid.
   ===================================================== */

/* =====================================================
   STATE
   ===================================================== */
const state = {
  user: null,
  vehicles: [],          // ['Bus', 'Van', ...]
  batches: [],           // ['24', '25', '26', ...]
  boysMaster: [],        // [{ name, batch }, ...]

  trip: {
    date: new Date().toISOString().slice(0, 10),
    vehicles: {},        // { Van: 2, Bus: 1 }  → resolved: Van 1, Van 2, Bus 1
    boys: [],            // [{ masterId, name, batch, vehicle, fare, absent, selected }]
    girlsTotal: 0,
    toll: 0,
    driver: 0
  },

  activeBatch: 'all',    // batch tab filter
  trips: []              // history list
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

function toast(msg, ms = 2200) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), ms);
}

/* =====================================================
   VEHICLE LABELS — "Van 1", "Van 2" …
   Returns FLAT list of concrete vehicle instances
   Example: { Van: 2, Bus: 1 } → ['Van 1', 'Van 2', 'Bus 1']
   ===================================================== */
function getVehicleInstances() {
  const out = [];
  Object.entries(state.trip.vehicles).forEach(([name, qty]) => {
    const n = Math.max(0, Number(qty) || 0);
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

  $('#theme-toggle').onclick = () => {
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
}

window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
  if ((localStorage.getItem('ff-theme') || 'system') === 'system') applyTheme('system', true);
});

/* =====================================================
   AUTH
   ===================================================== */
function initAuth() {
  auth.onAuthStateChanged(async user => {
    state.user = user;
    if (user) {
      $('#login-view').classList.remove('active');
      $('#app-view').classList.add('active');
      await bootstrapUser(user);
    } else {
      $('#app-view').classList.remove('active');
      $('#login-view').classList.add('active');
    }
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
}

function cleanAuthError(err) {
  const m = err.message || '';
  if (m.includes('user-not-found'))      return 'Account not found. Create one.';
  if (m.includes('wrong-password'))      return 'Galat password.';
  if (m.includes('invalid-email'))       return 'Email invalid hai.';
  if (m.includes('email-already-in-use'))return 'Email already registered.';
  if (m.includes('weak-password'))       return 'Password kamzor hai (6+ chars).';
  if (m.includes('network'))             return 'Network issue. Internet check karein.';
  return m.replace('Firebase: ', '');
}

/* =====================================================
   BOOTSTRAP USER
   ===================================================== */
async function bootstrapUser(user) {
  // 1) Config load
  const cfg = await loadUserConfigSafe(user.uid);
  state.vehicles   = cfg.vehicles;
  state.batches    = cfg.batches;
  state.boysMaster = cfg.boys;

  // 2) Trips load (with history bug fix)
  state.trips = await loadTripsSafe(user.uid);

  // 3) Cleanup old (3+ months)
  const removed = await cleanupOldTrips(user.uid);
  if (removed > 0) toast(`🧹 ${removed} purane trips delete kiye (3+ months)`);

  // 4) Render everything
  renderVehicles();
  renderBatchTabs();
  renderBoysList();
  renderBatchSettings();
  renderBoysMaster();
  renderVehicleSettings();
  renderHistory();
  bindStaticEvents();
  updateSummary();
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
  });

  /* ------- ENTRY SUB-TABS ------- */
  $$('#tab-entry .subtab').forEach(st => st.onclick = () => {
    $$('#tab-entry .subtab').forEach(t => t.classList.remove('active'));
    $$('#tab-entry .subtab-panel').forEach(p => p.classList.remove('active'));
    st.classList.add('active');
    $('#subtab-' + st.dataset.subtab)?.classList.add('active');
  });

  /* ------- SETTINGS SUB-TABS ------- */
  $$('#tab-settings .subtab').forEach(st => st.onclick = () => {
    $$('#tab-settings .subtab').forEach(t => t.classList.remove('active'));
    $$('#tab-settings .subtab-panel').forEach(p => p.classList.remove('active'));
    st.classList.add('active');
    $('#subtab-' + st.dataset.subtab)?.classList.add('active');
  });

  /* ------- INPUT BINDINGS ------- */
  const dateEl   = $('#trip-date');
  const girlsEl  = $('#girls-total');
  const tollEl   = $('#toll-cost');
  const driverEl = $('#driver-cost');

  dateEl.value   = state.trip.date;
  dateEl.onchange = e => { state.trip.date = e.target.value; };

  girlsEl.oninput  = e => { state.trip.girlsTotal = +e.target.value || 0; updateSummary(); };
  tollEl.oninput   = e => { state.trip.toll       = +e.target.value || 0; updateSummary(); };
  driverEl.oninput = e => { state.trip.driver     = +e.target.value || 0; updateSummary(); };

  $('#save-trip').onclick = saveTrip;

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

  /* ------- HISTORY SEARCH ------- */
  $('#history-search').oninput = e => renderHistory(e.target.value);

  /* ------- MODAL ------- */
  $('#modal-close').onclick = () => $('#detail-modal').close();
  $('#detail-modal').addEventListener('click', e => {
    if (e.target === $('#detail-modal')) $('#detail-modal').close();
  });
}

/* =====================================================
   VEHICLES — RENDER
   ===================================================== */
function renderVehicles() {
  const ul = $('#vehicle-list');
  ul.innerHTML = '';
  if (!state.vehicles.length) {
    ul.innerHTML = `<li class="empty-state">Settings → Vehicles mein pehle kuch add karein</li>`;
    return;
  }

  state.vehicles.forEach(v => {
    const li = document.createElement('li');
    li.className = 'vehicle-item' + (state.trip.vehicles[v] ? ' active' : '');
    li.dataset.v = v;

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.id = 'veh-' + v.replace(/\s+/g, '');
    cb.checked = !!state.trip.vehicles[v];

    const lb = document.createElement('label');
    lb.htmlFor = cb.id;
    lb.textContent = v;

    const num = document.createElement('input');
    num.type = 'number';
    num.min = 0;
    num.value = state.trip.vehicles[v] || 0;
    num.placeholder = 'Qty';

    const syncVehicle = qty => {
      if (qty > 0) {
        state.trip.vehicles[v] = qty;
        cb.checked = true;
        li.classList.add('active');
      } else {
        delete state.trip.vehicles[v];
        cb.checked = false;
        li.classList.remove('active');
      }
      reflowBoyVehicles();   // refresh dropdowns in boys list
    };

    num.oninput = () => syncVehicle(Math.max(0, +num.value || 0));
    cb.onchange = () => {
      if (cb.checked) {
        const q = Math.max(1, +num.value || 1);
        num.value = q;
        syncVehicle(q);
      } else {
        num.value = 0;
        syncVehicle(0);
      }
    };

    li.append(cb, lb, num);
    ul.append(li);
  });
}

/* =====================================================
   BATCH TABS — All + dynamic batches
   ===================================================== */
function renderBatchTabs() {
  const nav = $('#batch-tabs');
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
   BOYS LIST — render per current batch filter
   ===================================================== */
function renderBoysList() {
  const ul = $('#boys-list');
  ul.innerHTML = '';

  if (!state.boysMaster.length) {
    ul.innerHTML = `<li class="empty-state">Settings → Boys List mein pehle boys add karein</li>`;
    updateBulkCount();
    return;
  }

  const vehicles = getVehicleInstances();
  if (!vehicles.length) {
    ul.innerHTML = `<li class="empty-state">Pehle "Date & Vehicles" tab mein vehicle arrange karein</li>`;
    updateBulkCount();
    return;
  }

  // Sync trip.boys: ensure every master boy has an entry
  syncTripBoys();

  // Filter by active batch
  const filtered = state.trip.boys.filter(b =>
    state.activeBatch === 'all' || String(b.batch) === String(state.activeBatch)
  );

  if (!filtered.length) {
    ul.innerHTML = `<li class="empty-state">Is batch mein koi boy nahi.</li>`;
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

    /* # */
    const num = document.createElement('strong');
    num.className = 'row-num';
    num.textContent = '#';
    num.title = 'Serial';

    /* Checkbox (selection for bulk) */
    const sel = document.createElement('input');
    sel.type = 'checkbox';
    sel.className = 'row-sel';
    sel.checked = !!boy.selected;
    sel.onchange = () => {
      boy.selected = sel.checked;
      li.classList.toggle('selected', boy.selected);
      updateBulkCount();
    };

    /* Name (read-only from master) */
    const name = document.createElement('strong');
    name.className = 'row-name';
    name.textContent = boy.name;

    /* Batch badge */
    const batch = document.createElement('em');
    batch.className = 'row-batch';
    batch.textContent = boy.batch;

    /* Vehicle dropdown */
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

    /* Fare input */
    const fareIn = document.createElement('input');
    fareIn.type = 'number';
    fareIn.min = 0;
    fareIn.placeholder = 'Fare';
    fareIn.value = boy.fare || 0;
    fareIn.oninput = () => { boy.fare = +fareIn.value || 0; updateSummary(); };

    /* Absent toggle (small) */
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

/* Sync trip.boys against master list */
function syncTripBoys() {
  const vehicles = getVehicleInstances();
  const masterIds = new Set(state.boysMaster.map(b => `${b.name}|${b.batch}`));

  // Remove entries whose master was deleted
  state.trip.boys = state.trip.boys.filter(b => masterIds.has(`${b.name}|${b.batch}`));

  // Add missing entries
  const existingKeys = new Set(state.trip.boys.map(b => `${b.name}|${b.batch}`));
  state.boysMaster.forEach(m => {
    const key = `${m.name}|${m.batch}`;
    if (!existingKeys.has(key)) {
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

  // Fix any vehicle references that no longer exist
  state.trip.boys.forEach(b => {
    if (!vehicles.includes(b.vehicle)) b.vehicle = vehicles[0] || '';
  });
}

/* Refresh vehicle dropdowns without losing state */
function reflowBoyVehicles() {
  renderBoysList();
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
  $('#sel-count').textContent = `${n} selected`;
}

/* =====================================================
   LIVE SUMMARY
   ===================================================== */
function updateSummary() {
  const present = state.trip.boys.filter(b => !b.absent);
  const absent  = state.trip.boys.filter(b => b.absent);

  const boysTotal = present.reduce((s, b) => s + (+b.fare || 0), 0);
  const girls     = +($('#girls-total')?.value) || state.trip.girlsTotal || 0;
  const toll      = +($('#toll-cost')?.value)  || state.trip.toll || 0;
  const driver    = +($('#driver-cost')?.value)|| state.trip.driver || 0;

  state.trip.girlsTotal = girls;
  state.trip.toll       = toll;
  state.trip.driver     = driver;

  const totalFare = boysTotal + girls;
  const net       = totalFare - toll - driver;

  $('#sum-present').textContent = present.length;
  $('#sum-absent').textContent  = absent.length;
  $('#sum-boys').textContent    = fmt(boysTotal);
  $('#sum-girls').textContent   = fmt(girls);
  $('#sum-total').textContent   = fmt(totalFare);
  $('#sum-toll').textContent    = fmt(toll);
  $('#sum-driver').textContent  = fmt(driver);
  $('#sum-net').textContent     = fmt(net);

  const netRow = $('#net-row');
  netRow.classList.toggle('positive', net >= 0);
  netRow.classList.toggle('negative', net < 0);
}

/* =====================================================
   SAVE TRIP
   ===================================================== */
async function saveTrip() {
  if (!state.user) return toast('Login required');

  const vehiclesMap = { ...state.trip.vehicles };
  if (!Object.keys(vehiclesMap).length) {
    return toast('Kam az kam ek vehicle arrange karein');
  }

  // Ensure boys reflect latest master
  syncTripBoys();

  const present = state.trip.boys.filter(b => !b.absent);
  const boysTotal = present.reduce((s, b) => s + (+b.fare || 0), 0);
  const girls     = state.trip.girlsTotal || 0;
  const toll      = state.trip.toll || 0;
  const driver    = state.trip.driver || 0;
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
    net
  };

  try {
    await saveTripSafe(state.user.uid, payload);
    toast('✅ Trip saved!');

    // Refresh local history list
    state.trips = await loadTripsSafe(state.user.uid);
    renderHistory();

    resetTripForm();
  } catch (err) {
    toast('❌ Save fail: ' + (err.message || err.code));
  }
}

function resetTripForm() {
  state.trip.vehicles  = {};
  state.trip.boys      = [];
  state.trip.girlsTotal = 0;
  state.trip.toll      = 0;
  state.trip.driver    = 0;

  $('#girls-total').value  = 0;
  $('#toll-cost').value    = 0;
  $('#driver-cost').value  = 0;

  renderVehicles();
  renderBoysList();
  updateSummary();
}

/* =====================================================
   HISTORY — RENDER
   ===================================================== */
function renderHistory(filter = '') {
  const ul = $('#history-list');
  ul.innerHTML = '';

  const list = state.trips.filter(t =>
    !filter || String(t.date || '').includes(filter)
  );

  if (!list.length) {
    ul.innerHTML = `<li class="history-item" style="cursor:default;text-align:center;color:var(--text-dim)">
      Koi trip nahi mili.
    </li>`;
    return;
  }

  list.forEach(t => {
    const li = document.createElement('li');
    li.className = 'history-item';
    li.onclick = () => showTripDetails(t);

    const header = document.createElement('header');

    const time = document.createElement('time');
    time.textContent = t.date || '—';

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

    li.append(header, p);
    ul.append(li);
  });
}

/* =====================================================
   TRIP DETAIL MODAL
   ===================================================== */
function showTripDetails(t) {
  const modal = $('#detail-modal');
  const body  = $('#modal-body');
  $('#modal-title').textContent = 'Trip — ' + (t.date || '—');
  body.innerHTML = '';

  /* Vehicles */
  const vHTML = Object.entries(t.vehicles || {})
    .map(([v, c]) => `<li><em>${esc(v)}</em><strong>${c}</strong></li>`)
    .join('') || '<li><em>None</em><strong>0</strong></li>';

  body.insertAdjacentHTML('beforeend', `
    <section class="modal-section">
      <h3>🚐 Vehicles Arranged</h3>
      <ul>${vHTML}</ul>
    </section>
  `);

  /* Boys grouped by vehicle */
  if (Array.isArray(t.boys) && t.boys.length) {
    const grouped = {};
    t.boys.forEach(b => {
      const v = b.vehicle || 'Unassigned';
      (grouped[v] = grouped[v] || []).push(b);
    });

    const gHTML = Object.entries(grouped).map(([veh, arr]) => {
      const collected = arr
        .filter(b => !b.absent)
        .reduce((s, b) => s + (+b.fare || 0), 0);
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

  /* Girls */
  body.insertAdjacentHTML('beforeend', `
    <section class="modal-section">
      <h3>👧 Girls</h3>
      <ul><li><em>Girls Jo Total Kirayo</em><strong>${fmt(t.girlsTotal)}</strong></li></ul>
    </section>
  `);

  /* Financials */
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
      // If active batch was removed, reset to 'all'
      if (state.activeBatch === b) state.activeBatch = 'all';
      await saveUserConfigSafe(state.user.uid, {
        vehicles: state.vehicles,
        batches: state.batches,
        boys: state.boysMaster
      });
      renderBatchSettings();
      renderBatchTabs();
      renderBoysList();
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
  ul.innerHTML = '';
  sel.innerHTML = '';

  // Populate batch dropdown for the add-form
  state.batches.forEach(b => {
    const o = document.createElement('option');
    o.value = b; o.textContent = b;
    sel.append(o);
  });

  if (!state.boysMaster.length) {
    ul.innerHTML = `<li class="empty-state">Abhi koi boy add nahi. Upar form se add karein.</li>`;
    return;
  }

  state.boysMaster.forEach((boy, i) => {
    const li = document.createElement('li');
    li.className = 'master-row';

    const num = document.createElement('strong');
    num.className = 'row-num';
    num.textContent = '#';

    const nameIn = document.createElement('input');
    nameIn.type = 'text';
    nameIn.value = boy.name;
    nameIn.placeholder = 'Name';
    nameIn.onblur = async () => {
      const v = nameIn.value.trim();
      if (!v) return;
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
    batchSel.style.padding = '.4rem';
    batchSel.style.borderRadius = '8px';
    batchSel.style.background = 'rgba(0,0,0,.2)';
    batchSel.style.color = 'var(--text)';
    batchSel.style.border = '1px solid var(--glass-bd)';
    batchSel.style.fontFamily = 'inherit';
    batchSel.style.fontSize = '.8rem';
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
  if (!batch) return toast('Pehle koi batch add karein');

  // Duplicate check (name + batch)
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
  const d = $('#trip-date');
  if (d) d.value = new Date().toISOString().slice(0, 10);
});