// Daybook — app shell. Vanilla ES module, no build step.
import {
  esc, safeUrl, safeColor, renderMarkdown, splitSections,
  isoDateInTz, minutesInTz, startOfDayInTz, addDays, weekdayOf, mondayOf, daysBetween,
  fmtDate, monthLabel, dayShort, fmtClock, fmtMinutes, fmtInstant, fmtBytes, timeAgo, greeting, normTag, uuid,
} from './lib.js';

// ---------------------------------------------------------------------------
// Config + client
// ---------------------------------------------------------------------------
const CONFIG = JSON.parse(document.getElementById('daybook-config').textContent);
const TZ = CONFIG.timeZone || 'America/New_York';
const OWNER = CONFIG.ownerName || 'there';
const CACHE_KEY = 'daybook:cache:v1';
const QUEUE_KEY = 'daybook:queue';
const BUSINESSES = ['Berner Studio', 'Tolbert Sheet Fab', 'DuctLink', 'Voice Agent', 'Client Work', 'Personal'];
const COLORS = ['#8B7CF6', '#5B4DBE', '#E58BB0', '#E5615B', '#E9A23B', '#9CBF3B', '#3FAE8C', '#3B8FD9', '#1E1E1E'];

const configured = !/YOUR-PROJECT|YOUR-ANON/.test(CONFIG.supabaseUrl + CONFIG.supabaseAnonKey);
const sb = configured && window.supabase
  ? window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  })
  : null;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const state = {
  user: null,
  projects: [],
  tasks: [],
  notes: [],
  files: [],
  briefing: null,
  events: [],
  threads: [],
  googleConnected: null,
  googleEmail: null,
  loadedAt: null,
  ui: {
    taskFilter: 'todo',
    calFilter: 'all',
    selectedDate: null,
    library: 'projects',
    projectTab: 'tasks',
    noteQuery: '',
    briefingOpen: false,
    online: navigator.onLine,
  },
};

const today = () => isoDateInTz(new Date(), TZ);
const nowMinutes = () => minutesInTz(new Date(), TZ);

// ---------------------------------------------------------------------------
// Icons (inline SVG, stroke-based)
// ---------------------------------------------------------------------------
const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  bell: '<path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4Z"/><path d="M10 21h4"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  left: '<path d="M15 5 8 12l7 7"/>',
  right: '<path d="m9 5 7 7-7 7"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5"/>',
  pdf: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5M8.5 13h7M8.5 17h5"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
  link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
  note: '<path d="M5 4h14v16H5z"/><path d="M9 9h6M9 13h6M9 17h3"/>',
  task: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16Z"/><path d="m13.5 6.5 4 4"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="3"/><path d="m16 10 5-3v10l-5-3"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  pin: '<path d="M9 4h6l-1 5 4 4H6l4-4Z"/><path d="M12 13v8"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.6-4.5L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.6 4.5L20 16"/><path d="M20 20v-4h-4"/>',
  logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 17l-5-5 5-5M5 12h11"/>',
  google: '<path d="M20.5 12.2c0-.6-.1-1.2-.2-1.7H12v3.3h4.8a4.1 4.1 0 0 1-1.8 2.7v2.2h2.9c1.7-1.6 2.6-3.9 2.6-6.5Z"/><path d="M12 21c2.4 0 4.5-.8 5.9-2.2L15 16.5c-.8.5-1.8.9-3 .9a5.2 5.2 0 0 1-4.9-3.6H4.1v2.3A9 9 0 0 0 12 21Z"/><path d="M7.1 13.8a5.4 5.4 0 0 1 0-3.5V8H4.1a9 9 0 0 0 0 8.1Z"/><path d="M12 6.6c1.3 0 2.5.5 3.4 1.3l2.6-2.6A9 9 0 0 0 4.1 8l3 2.3A5.2 5.2 0 0 1 12 6.6Z"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  inbox: '<path d="M3 13h5l2 3h4l2-3h5"/><path d="M5 5h14l2 8v6H3v-6Z"/>',
  more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  wifiOff: '<path d="M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5-2.7M14 10.3A10 10 0 0 1 19 13M2 9.5a15 15 0 0 1 4.5-3M10 5.2A15 15 0 0 1 22 9.5"/><circle cx="12" cy="20" r=".8"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
};
const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const viewEl = $('#view');
const navEl = $('#nav');

function toast(message, { error = false, action = null, onAction = null, ms = 3200 } = {}) {
  const root = $('#toast-root');
  const el = document.createElement('div');
  el.className = `toast${error ? ' err' : ''}`;
  el.innerHTML = `<span>${esc(message)}</span>${action ? `<button type="button">${esc(action)}</button>` : ''}`;
  const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 180); };
  if (action) el.querySelector('button').addEventListener('click', () => { close(); onAction?.(); });
  root.appendChild(el);
  if (ms) setTimeout(close, ms);
  return close;
}

// ---------------------------------------------------------------------------
// Sheets (bottom sheet on mobile, centered modal on desktop)
// ---------------------------------------------------------------------------
let sheetStack = [];

function openSheet(html, { onMount, onClose, label = 'Dialog' } = {}) {
  closeSheet(true);
  const root = $('#sheet-root');
  root.innerHTML = `
    <div class="sheet-backdrop" data-action="close-sheet"></div>
    <section class="sheet" role="dialog" aria-modal="true" aria-label="${esc(label)}">
      <div class="sheet-grip" aria-hidden="true"></div>
      ${html}
    </section>`;
  const sheet = $('.sheet', root);
  sheetStack = [{ onClose }];
  requestAnimationFrame(() => {
    $('.sheet-backdrop', root).classList.add('in');
    sheet.classList.add('in');
  });
  onMount?.(sheet);
  const first = sheet.querySelector('[autofocus]');
  if (first && matchMedia('(min-width: 640px)').matches) setTimeout(() => first.focus(), 60);
  document.body.style.overflow = 'hidden';
  return sheet;
}

function closeSheet(immediate = false) {
  const root = $('#sheet-root');
  const sheet = $('.sheet', root);
  if (!sheet) return;
  const entry = sheetStack.pop();
  document.body.style.overflow = '';
  if (immediate) { root.innerHTML = ''; entry?.onClose?.(); return; }
  sheet.classList.remove('in');
  $('.sheet-backdrop', root)?.classList.remove('in');
  setTimeout(() => { if ($('.sheet', root) === sheet) root.innerHTML = ''; entry?.onClose?.(); }, 200);
}

// Swipe-down to dismiss on touch
(() => {
  let startY = null; let sheet = null;
  document.addEventListener('touchstart', (e) => {
    const grip = e.target.closest('.sheet-grip, .sheet-head');
    sheet = grip?.closest('.sheet');
    startY = sheet && sheet.scrollTop <= 0 ? e.touches[0].clientY : null;
  }, { passive: true });
  document.addEventListener('touchmove', (e) => {
    if (startY === null || !sheet) return;
    const dy = Math.max(0, e.touches[0].clientY - startY);
    sheet.style.transition = 'none';
    sheet.style.transform = `translate(-50%, ${dy}px)`;
  }, { passive: true });
  document.addEventListener('touchend', (e) => {
    if (startY === null || !sheet) return;
    const dy = (e.changedTouches[0]?.clientY ?? startY) - startY;
    sheet.style.transition = '';
    sheet.style.transform = '';
    if (dy > 110) closeSheet();
    startY = null; sheet = null;
  });
})();

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
const TABS = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'projects', label: 'Projects', icon: 'folder' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar' },
  { id: 'profile', label: 'Profile', icon: 'user' },
];

function parseRoute() {
  const raw = decodeURIComponent(location.hash.replace(/^#\/?/, '')) || 'home';
  const [view, id] = raw.split('/');
  const known = ['home', 'projects', 'notes', 'files', 'calendar', 'profile', 'task', 'note', 'project', 'file'];
  return known.includes(view) ? { view, id: id || null } : { view: 'home', id: null };
}

function navTabFor(view) {
  if (['projects', 'notes', 'files', 'project', 'note', 'file'].includes(view)) return 'projects';
  if (view === 'task') return null;
  return view;
}

function go(hash) {
  if (location.hash === hash) render(); else location.hash = hash;
}

function renderNav(route) {
  const active = navTabFor(route.view);
  navEl.innerHTML = TABS.map((t) => `
    <a href="#${t.id}" class="${active === t.id ? 'active' : ''}" aria-label="${t.label}" ${active === t.id ? 'aria-current="page"' : ''}>
      ${icon(t.icon)}<span>${t.label}</span>
    </a>`).join('');
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------
const VIEWS = {};
let lastRouteKey = '';

function render() {
  if (!state.user) {
    navEl.hidden = true;
    viewEl.className = 'view no-nav';
    viewEl.innerHTML = configured ? viewLogin() : viewNotConfigured();
    return;
  }
  const route = parseRoute();
  const key = `${route.view}/${route.id || ''}`;
  const scrollY = key === lastRouteKey ? window.scrollY : 0;
  navEl.hidden = false;
  renderNav(route);
  const fn = VIEWS[route.view] || VIEWS.home;
  viewEl.className = 'view';
  if (key !== lastRouteKey) {
    // retrigger the entry animation only on navigation
    viewEl.style.animation = 'none'; void viewEl.offsetHeight; viewEl.style.animation = '';
  }
  viewEl.innerHTML = offlineBanner() + fn(route);
  if (key !== lastRouteKey) window.scrollTo(0, 0); else if (Math.abs(window.scrollY - scrollY) > 2) window.scrollTo(0, scrollY);
  lastRouteKey = key;
}

function offlineBanner() {
  if (state.ui.online) return '';
  const q = readQueue().length;
  return `<div class="offline-pill">${icon('wifiOff', 'xs')} Offline${q ? ` · ${q} change${q > 1 ? 's' : ''} waiting` : ' · showing saved data'}</div>`;
}

const emptyLine = (text) => `<div class="empty">${esc(text)}</div>`;

function header({ title, back = null, actions = '' }) {
  const left = back
    ? `<div class="back-title"><button class="icon-btn sm" data-action="back" data-fallback="${esc(back)}" aria-label="Back">${icon('left')}</button><h1 class="page-title">${esc(title)}</h1></div>`
    : `<h1 class="page-title">${esc(title)}</h1>`;
  return `<header class="header">${left}<div class="header-actions">${actions}</div></header>`;
}

// ---------------------------------------------------------------------------
// Login / unconfigured
// ---------------------------------------------------------------------------
function viewNotConfigured() {
  return `<section class="login">
    <div class="brand"><div class="brand-mark">${icon('sun')}</div><b>Daybook</b></div>
    <h1 class="display">Almost there.</h1>
    <p class="lede">Paste your Supabase URL and anon key into the config block at the top of <code>index.html</code> (README, step 2.7), then reload.</p>
  </section>`;
}

function viewLogin() {
  return `<section class="login">
    <div class="brand"><div class="brand-mark">${icon('sun')}</div><b>Daybook</b></div>
    <h1 class="display">Welcome back.</h1>
    <p class="lede">Sign in to see your day.</p>
    <form class="card" id="login-form" novalidate>
      <div id="login-msg"></div>
      <div class="field"><label for="login-email">Email</label>
        <input class="input" id="login-email" name="email" type="email" autocomplete="username" required inputmode="email"></div>
      <div class="field"><label for="login-password">Password</label>
        <input class="input" id="login-password" name="password" type="password" autocomplete="current-password"></div>
      <button class="btn dark big block" type="submit">Sign in</button>
      <button class="btn block" type="button" data-action="magic-link" style="margin-top:10px">Email me a magic link instead</button>
    </form>
  </section>`;
}

function loginMsg(text, ok = false) {
  const el = $('#login-msg');
  if (el) el.innerHTML = text ? `<p class="form-msg ${ok ? 'ok' : 'err'}">${esc(text)}</p>` : '';
}

async function handleLogin(form) {
  const email = form.email.value.trim();
  const password = form.password.value;
  if (!email || !password) return loginMsg('Enter your email and password.');
  const btn = form.querySelector('[type=submit]');
  btn.disabled = true; btn.textContent = 'Signing in…';
  const { error } = await sb.auth.signInWithPassword({ email, password });
  btn.disabled = false; btn.textContent = 'Sign in';
  if (error) loginMsg(error.message === 'Invalid login credentials' ? 'That email and password don’t match.' : error.message);
}

async function handleMagicLink() {
  const email = $('#login-email')?.value.trim();
  if (!email) return loginMsg('Enter your email first.');
  const { error } = await sb.auth.signInWithOtp({
    email, options: { shouldCreateUser: false, emailRedirectTo: location.origin + '/' },
  });
  if (error) loginMsg(error.message); else loginMsg('Check your email for a sign-in link.', true);
}

// ---------------------------------------------------------------------------
// Data layer: cache, load, optimistic writes, offline queue, realtime
// ---------------------------------------------------------------------------
const TABLES = ['projects', 'tasks', 'notes', 'files'];
const QUEUEABLE = new Set(['tasks', 'notes']);

// Local preview without Supabase: http://localhost:PORT/?demo (never active on a real host).
const DEMO = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).has('demo');

function saveCache() {
  if (DEMO || !state.user) return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      v: 1,
      user: { id: state.user.id, email: state.user.email },
      projects: state.projects, tasks: state.tasks, notes: state.notes, files: state.files,
      briefing: state.briefing, threads: state.threads,
      events: state.events.filter((e) => String(e.end || e.start) >= addDays(today(), -7) && String(e.start) <= addDays(today(), 21)),
      googleConnected: state.googleConnected, googleEmail: state.googleEmail, googleScopes: state.googleScopes,
      savedAt: Date.now(),
    }));
  } catch { /* quota or private mode — the app still works, just without the instant offline paint */ }
}
let cacheTimer = null;
const saveCacheSoon = () => { clearTimeout(cacheTimer); cacheTimer = setTimeout(saveCache, 400); };

function loadCache() {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    return c && c.v === 1 ? c : null;
  } catch { return null; }
}

function applyCache(c) {
  for (const k of [...TABLES, 'briefing', 'events', 'threads', 'googleConnected', 'googleEmail', 'googleScopes']) {
    if (c[k] !== undefined) state[k] = c[k];
  }
}

function clearLocal() {
  try { localStorage.removeItem(CACHE_KEY); localStorage.removeItem(QUEUE_KEY); } catch { /* ignore */ }
  Object.assign(state, {
    projects: [], tasks: [], notes: [], files: [], briefing: null, events: [], threads: [],
    googleConnected: null, googleEmail: null, loadedAt: null,
  });
}

function readQueue() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch { return []; }
}
function writeQueue(q) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch { /* ignore */ }
}
function enqueue(op) {
  const q = readQueue();
  q.push({ ...op, queuedAt: Date.now() });
  writeQueue(q);
}

const isNetworkError = (err) => !navigator.onLine || /failed to fetch|networkerror|load failed|network request failed|timeout|fetch failed/i.test(String(err?.message || err));

/** Re-apply not-yet-synced queued ops on top of freshly fetched rows so offline edits don't flicker away. */
function applyQueueToState() {
  for (const op of readQueue()) {
    const arr = state[op.table];
    if (!arr) continue;
    const i = arr.findIndex((x) => x.id === op.id);
    if (op.op === 'insert' && i < 0) arr.unshift({ ...op.row });
    else if (op.op === 'update' && i >= 0) Object.assign(arr[i], op.patch);
    else if (op.op === 'delete' && i >= 0) arr.splice(i, 1);
  }
}

let loading = null;
async function loadAll() {
  if (DEMO || !state.user) return;
  if (loading) return loading;
  loading = (async () => {
    try {
      const [p, t, n, f, b] = await Promise.all([
        sb.from('projects').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
        sb.from('tasks').select('*').order('created_at', { ascending: false }).limit(3000),
        sb.from('notes').select('*').order('updated_at', { ascending: false }).limit(2000),
        sb.from('files').select('*').order('created_at', { ascending: false }).limit(2000),
        sb.from('briefings').select('*').order('briefing_date', { ascending: false }).limit(1).maybeSingle(),
      ]);
      const err = [p, t, n, f, b].find((r) => r.error)?.error;
      if (err) throw err;
      state.projects = p.data; state.tasks = t.data; state.notes = n.data; state.files = f.data;
      state.briefing = b.data || state.briefing;
      applyQueueToState();
      state.loadedAt = Date.now();
      scheduleRender();
      saveCache();
      loadGoogle();
    } catch (err) {
      if (!isNetworkError(err)) toast(`Couldn’t load: ${err.message}`, { error: true });
    } finally {
      loading = null;
    }
  })();
  return loading;
}

const nowIso = () => new Date().toISOString();
const findIn = (table, id) => state[table].find((x) => x.id === id);

async function runOp(op) {
  let q;
  if (op.op === 'insert') q = sb.from(op.table).upsert(op.row); // upsert = safe to retry from the queue
  else if (op.op === 'update') q = sb.from(op.table).update(op.patch).eq('id', op.id);
  else q = sb.from(op.table).delete().eq('id', op.id);
  const { error } = await q;
  if (error) throw error;
}

async function persist(op, rollback) {
  if (DEMO) return true;
  const queueable = QUEUEABLE.has(op.table);
  if (!navigator.onLine) {
    if (queueable) { enqueue(op); saveCache(); scheduleRender(); return true; }
    rollback(); scheduleRender();
    toast('You’re offline — that change needs a connection.', { error: true });
    return false;
  }
  try {
    await runOp(op);
    saveCacheSoon();
    return true;
  } catch (err) {
    if (queueable && isNetworkError(err)) {
      enqueue(op); saveCache(); scheduleRender();
      toast('Saved offline — will sync when you’re back.');
      return true;
    }
    rollback(); scheduleRender();
    toast(`Couldn’t save: ${err.message}`, { error: true });
    return false;
  }
}

/** Columns we send to Postgres per table (local-only fields are never sent). */
const COLUMNS = {
  projects: ['id', 'user_id', 'name', 'color', 'business', 'status', 'description', 'sort_order'],
  tasks: ['id', 'user_id', 'project_id', 'title', 'description', 'status', 'priority', 'due_date', 'due_time', 'tags', 'completed_at'],
  notes: ['id', 'user_id', 'project_id', 'title', 'body', 'pinned', 'tags'],
  files: ['id', 'user_id', 'project_id', 'name', 'kind', 'storage_path', 'url', 'mime', 'size_bytes', 'tags'],
};
const pick = (table, obj) => Object.fromEntries(COLUMNS[table].filter((k) => k in obj).map((k) => [k, obj[k]]));

async function createRow(table, fields) {
  const row = { id: uuid(), user_id: state.user.id, ...fields };
  const local = { ...row, created_at: nowIso(), updated_at: nowIso() };
  state[table].unshift(local);
  scheduleRender();
  const ok = await persist({ table, op: 'insert', id: row.id, row: pick(table, row) }, () => {
    state[table] = state[table].filter((x) => x.id !== row.id);
  });
  return ok ? local : null;
}

async function updateRow(table, id, patch) {
  const item = findIn(table, id);
  if (!item) return false;
  const prev = { ...item };
  Object.assign(item, patch, { updated_at: nowIso() });
  scheduleRender();
  return persist({ table, op: 'update', id, patch: pick(table, patch) }, () => { Object.assign(item, prev); });
}

async function deleteRow(table, id) {
  const i = state[table].findIndex((x) => x.id === id);
  if (i < 0) return false;
  const [prev] = state[table].splice(i, 1);
  scheduleRender();
  return persist({ table, op: 'delete', id }, () => { state[table].splice(i, 0, prev); });
}

let flushing = false;
async function flushQueue() {
  if (flushing || DEMO || !state.user || !navigator.onLine) return;
  let q = readQueue();
  if (!q.length) return;
  flushing = true;
  let done = 0;
  try {
    while (q.length) {
      try {
        await runOp(q[0]);
      } catch (err) {
        if (isNetworkError(err)) break;
        toast(`A queued change couldn’t sync: ${err.message}`, { error: true });
      }
      q.shift(); writeQueue(q); done += 1;
    }
  } finally {
    flushing = false;
  }
  if (done) {
    toast(`Synced ${done} offline change${done > 1 ? 's' : ''}.`);
    await loadAll();
  }
  scheduleRender();
}

let channel = null;
function subscribeRealtime() {
  if (DEMO || channel || !state.user) return;
  const filter = `user_id=eq.${state.user.id}`;
  channel = sb.channel('daybook-sync');
  for (const table of [...TABLES, 'briefings']) {
    channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table, filter }, (p) => onRealtime(table, p));
    channel.on('postgres_changes', { event: 'UPDATE', schema: 'public', table, filter }, (p) => onRealtime(table, p));
    // DELETE events can't be filtered server-side; they only carry the primary key.
    channel.on('postgres_changes', { event: 'DELETE', schema: 'public', table }, (p) => onRealtime(table, p));
  }
  channel.subscribe();
}
function unsubscribeRealtime() {
  if (channel) sb.removeChannel(channel);
  channel = null;
}

function onRealtime(table, payload) {
  const row = payload.new;
  if (table === 'briefings') {
    if (row?.briefing_date && (!state.briefing || row.briefing_date >= state.briefing.briefing_date)) state.briefing = row;
  } else if (payload.eventType === 'DELETE') {
    state[table] = state[table].filter((x) => x.id !== payload.old?.id);
  } else if (row?.id) {
    const arr = state[table];
    const i = arr.findIndex((x) => x.id === row.id);
    if (i < 0) arr.unshift(row);
    else if (!arr[i].updated_at || row.updated_at >= arr[i].updated_at) arr[i] = row;
  }
  scheduleRender();
  saveCacheSoon();
}

// Batch re-renders, but don't clobber a focused input inside the view.
let renderQueued = false;
let renderDeferred = false;
function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  // Microtask, not rAF: rAF is paused in background tabs, which would leave realtime updates unpainted.
  queueMicrotask(() => {
    renderQueued = false;
    const a = document.activeElement;
    if (a && viewEl.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) { renderDeferred = true; return; }
    render();
  });
}
viewEl.addEventListener('focusout', () => { if (renderDeferred) { renderDeferred = false; setTimeout(scheduleRender, 0); } });


// ---------------------------------------------------------------------------
// Derived data
// ---------------------------------------------------------------------------
const projectById = (id) => (id ? state.projects.find((p) => p.id === id) : null);
const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };
const STATUS_LABEL = { todo: 'To Do', in_progress: 'In Progress', done: 'Done' };
const isOverdue = (t) => t.status !== 'done' && t.due_date && t.due_date < today();
const completedOn = (t) => (t.completed_at ? isoDateInTz(new Date(t.completed_at), TZ) : null);

function sortTasks(list) {
  return [...list].sort((a, b) => {
    const ao = isOverdue(a) ? 0 : 1; const bo = isOverdue(b) ? 0 : 1;
    if (ao !== bo) return ao - bo;
    const ad = a.due_date || '9999-12-31'; const bd = b.due_date || '9999-12-31';
    if (ad !== bd) return ad < bd ? -1 : 1;
    const at = a.due_time || '99'; const bt = b.due_time || '99';
    if (at !== bt) return at < bt ? -1 : 1;
    const ap = PRIORITY_RANK[a.priority] ?? 1; const bp = PRIORITY_RANK[b.priority] ?? 1;
    if (ap !== bp) return ap - bp;
    return (b.created_at || '').localeCompare(a.created_at || '');
  });
}

/** Home "Today's Tasks": open tasks due today/overdue/undated, plus anything finished today. */
function todaysTasks() {
  const d = today();
  return state.tasks.filter((t) => (t.status === 'done'
    ? completedOn(t) === d || t.due_date === d
    : !t.due_date || t.due_date <= d));
}

/** Progress ring: tasks due today ∪ tasks completed today. */
function todayProgress() {
  const d = today();
  const set = state.tasks.filter((t) => t.due_date === d || (t.status === 'done' && completedOn(t) === d));
  const done = set.filter((t) => t.status === 'done').length;
  return { total: set.length, done, pending: set.length - done };
}

function fmtDue(t) {
  if (!t.due_date) return t.due_time ? fmtClock(t.due_time) : '';
  const d = today();
  const diff = daysBetween(d, t.due_date);
  const day = diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : diff === -1 ? 'Yesterday' : fmtDate(t.due_date, { weekday: Math.abs(diff) < 7 });
  return t.due_time ? `${day} · ${fmtClock(t.due_time)}` : day;
}

// ---------------------------------------------------------------------------
// Shared fragments
// ---------------------------------------------------------------------------
const prioChip = (p) => `<span class="chip ${esc(p)}">${esc((p || 'medium')[0].toUpperCase() + (p || 'medium').slice(1))}</span>`;
const statusChip = (s) => `<span class="chip status-${esc(s)}">${esc(STATUS_LABEL[s] || s)}</span>`;
const tagChips = (tags = [], max = 99) => (tags || []).slice(0, max).map((t) => `<span class="chip tag">#${esc(t)}</span>`).join('');
const projectDot = (p) => (p ? `<span class="dot" style="background:${safeColor(p.color)}"></span>` : '');

function taskCard(t, { showProject = true } = {}) {
  const p = projectById(t.project_id);
  const done = t.status === 'done';
  const due = fmtDue(t);
  return `<div class="swipe-wrap" data-swipe="${esc(t.id)}">
    <div class="swipe-bg">${icon('check', 'sm')} ${done ? 'Reopen' : 'Done'}</div>
    <div class="task-card${done ? ' done' : ''}" data-action="open-task" data-id="${esc(t.id)}" role="button" tabindex="0">
      <button class="check${done ? ' on' : t.status === 'in_progress' ? ' half' : ''}" data-action="toggle-task" data-id="${esc(t.id)}" aria-label="${done ? 'Mark not done' : 'Mark done'}">${icon('check', 'sm')}</button>
      <div class="task-main">
        <div class="task-top">${prioChip(t.priority)}${t.status === 'in_progress' ? statusChip('in_progress') : ''}${tagChips(t.tags, 2)}</div>
        <div class="task-title">${esc(t.title)}</div>
        ${due || (showProject && p) ? `<div class="task-meta">
          ${due ? `<span class="${isOverdue(t) ? 'overdue-text' : ''}">${icon('clock', 'xs')}${isOverdue(t) ? 'Overdue · ' : ''}${esc(due)}</span>` : ''}
          ${showProject && p ? `<span>${projectDot(p)}${esc(p.name)}</span>` : ''}
        </div>` : ''}
      </div>
    </div>
  </div>`;
}

function pillsHTML(items, active, action) {
  return `<div class="pills" role="tablist">${items.map((it) => `
    <button class="pill${it.cls ? ` ${it.cls}` : ''}${active === it.id ? ' active' : ''}" role="tab" aria-selected="${active === it.id}" data-action="${action}" data-value="${esc(it.id)}">
      ${esc(it.label)}${it.count !== undefined ? `<span class="count">${it.count}</span>` : ''}
    </button>`).join('')}</div>`;
}

function progressRing(pct) {
  const r = 46; const c = 2 * Math.PI * r;
  return `<svg viewBox="0 0 112 112" aria-hidden="true">
    <circle class="track" cx="56" cy="56" r="${r}" fill="none" stroke-width="12"/>
    <circle class="bar" cx="56" cy="56" r="${r}" fill="none" stroke-width="12" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - pct)).toFixed(1)}"/>
  </svg>`;
}

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------
VIEWS.home = () => {
  const headline = state.briefing?.briefing_date === today() && state.briefing.headline
    ? state.briefing.headline
    : 'Let’s make today productive';
  const prog = todayProgress();
  const pct = prog.total ? prog.done / prog.total : 0;
  const list = todaysTasks();
  const counts = { todo: 0, in_progress: 0, done: 0 };
  list.forEach((t) => { counts[t.status] = (counts[t.status] || 0) + 1; });
  const f = state.ui.taskFilter;
  const filtered = sortTasks(list.filter((t) => t.status === f));
  const emptyCopy = {
    todo: list.length ? 'Nothing left to start. Nice.' : 'A clear list. Add something when it comes up.',
    in_progress: 'Nothing in motion right now.',
    done: 'Nothing finished yet today.',
  }[f];

  return `
  <div class="ptr" id="ptr">${icon('down', 'sm')}</div>
  <header class="header">
    <div class="header-left"><div class="avatar">${esc((OWNER[0] || 'D').toUpperCase())}</div>
      <div class="hello"><div class="hello-sub">${esc(greeting(nowMinutes()))}</div><div class="hello-name">${esc(OWNER)}</div></div></div>
    <div class="header-actions">
      <button class="icon-btn" data-action="open-add" aria-label="Add">${icon('plus')}</button>
      <button class="icon-btn dark" data-action="show-briefing" aria-label="Morning briefing">${icon('sparkle')}${briefingIsFresh() && !state.ui.briefingOpen ? '<span class="badge"></span>' : ''}</button>
    </div>
  </header>
  <h1 class="display">${esc(headline)}</h1>

  <section class="dark-card" aria-label="Today's progress">
    <div class="progress">
      <div class="progress-ring">${progressRing(pct)}<div class="pct"><div>${Math.round(pct * 100)}%<small>done</small></div></div></div>
      <div class="progress-body">
        <h2>Today’s Progress</h2>
        <div class="stat-rows">
          <div class="stat-row"><span><i class="dot total"></i>Total</span><b>${prog.total}</b></div>
          <div class="stat-row"><span><i class="dot done"></i>Completed</span><b>${prog.done}</b></div>
          <div class="stat-row"><span><i class="dot pending"></i>Pending</span><b>${prog.pending}</b></div>
        </div>
      </div>
    </div>
  </section>

  ${homeBriefing()}
  ${homeUpNext()}

  <div class="section-title"><h2>Today’s Tasks</h2><button class="link-btn" data-action="new-task">+ Add task</button></div>
  ${pillsHTML([
    { id: 'todo', label: 'To Do', count: counts.todo, cls: 'green' },
    { id: 'in_progress', label: 'In Progress', count: counts.in_progress },
    { id: 'done', label: 'Done', count: counts.done },
  ], f, 'task-filter')}
  <div class="list">${filtered.length ? filtered.map((t) => taskCard(t)).join('') : `<div class="card empty">${esc(emptyCopy)}</div>`}</div>

  ${homeInbox()}`;
};

// ---------------------------------------------------------------------------
// Morning briefing (written by /api/cron/briefing; the page only reads it)
// ---------------------------------------------------------------------------
const SEEN_KEY = 'daybook:briefing-seen';
const briefingKey = (b) => (b ? `${b.id}:${b.generated_at}` : '');
function briefingIsFresh() {
  const b = state.briefing;
  if (!b || b.briefing_date !== today()) return false;
  try { return localStorage.getItem(SEEN_KEY) !== briefingKey(b); } catch { return false; }
}
function markBriefingSeen() {
  try { localStorage.setItem(SEEN_KEY, briefingKey(state.briefing)); } catch { /* ignore */ }
}

function homeBriefing() {
  const b = state.briefing;
  const head = (caption, chip = '') => `<div class="briefing-head">
      <span class="briefing-badge">${icon('sparkle', 'sm')}</span>
      <div><h2 style="margin:0;font-size:17px">Morning briefing</h2><div class="caption">${esc(caption)}</div></div>
      ${chip}
    </div>`;
  if (!b) {
    return `<section class="card briefing" id="briefing">${head('Not generated yet')}
      <p class="caption" style="margin:0">The first one arrives tomorrow morning. You can also generate one now from Profile.</p></section>`;
  }
  const isToday = b.briefing_date === today();
  const sections = splitSections(b.body_md);
  const open = state.ui.briefingOpen || sections.length <= 1;
  const first = sections[0];
  const md = open ? b.body_md : `${first.title ? `## ${first.title}\n` : ''}${first.body}`;
  const when = b.generated_at ? fmtInstant(new Date(b.generated_at), TZ) : '';
  const caption = `${isToday ? `Generated ${when}` : `From ${fmtDate(b.briefing_date, { weekday: true })}`}${b.stats?.source === 'fallback' ? ' · basic summary' : ''}`;
  const shape = ['heavy', 'normal', 'open'].includes(b.day_shape)
    ? `<span class="chip ${b.day_shape} shape-chip">${{ heavy: 'Full day', normal: 'Steady day', open: 'Open day' }[b.day_shape]}</span>` : '';
  return `<section class="card briefing" id="briefing">
    ${head(caption, shape)}
    <div class="md">${renderMarkdown(md)}</div>
    ${sections.length > 1 ? `<button class="link-btn" data-action="toggle-briefing" aria-expanded="${open}" style="margin-top:6px">${open ? 'Show less' : 'Read briefing'}</button>` : ''}
  </section>`;
}

// ---------------------------------------------------------------------------
// Task detail
// ---------------------------------------------------------------------------
VIEWS.task = ({ id }) => {
  const t = findIn('tasks', id);
  if (!t) return header({ title: 'Task', back: '#home' }) + '<div class="card empty">This task isn’t here anymore.</div>';
  const p = projectById(t.project_id);
  return `${header({
    title: 'Task',
    back: p ? `#project/${p.id}` : '#home',
    actions: `<button class="icon-btn sm" data-action="edit-task" data-id="${esc(t.id)}" aria-label="Edit">${icon('edit', 'sm')}</button>`,
  })}
  <div class="chips">${prioChip(t.priority)}${statusChip(t.status)}${isOverdue(t) ? '<span class="chip overdue">Overdue</span>' : ''}</div>
  <h1 class="detail-title">${esc(t.title)}</h1>
  <div class="seg on-card status-seg" role="tablist">
    ${['todo', 'in_progress', 'done'].map((s) => `<button class="${t.status === s ? 'on' : ''}" data-action="set-status" data-id="${esc(t.id)}" data-value="${s}">${STATUS_LABEL[s]}</button>`).join('')}
  </div>
  ${t.description ? `<div class="card md">${renderMarkdown(t.description)}</div>` : ''}
  <div class="card"><dl class="kv">
    <div><dt>Due</dt><dd>${esc(fmtDue(t) || '—')}</dd></div>
    <div><dt>Project</dt><dd>${p ? `<a href="#project/${esc(p.id)}">${projectDot(p)} ${esc(p.name)}</a>` : '—'}</dd></div>
    <div><dt>Tags</dt><dd><div class="chips" style="justify-content:flex-end">${tagChips(t.tags) || '—'}</div></dd></div>
    ${t.completed_at ? `<div><dt>Completed</dt><dd>${esc(fmtDate(completedOn(t)))} · ${esc(fmtInstant(new Date(t.completed_at), TZ))}</dd></div>` : ''}
    <div><dt>Created</dt><dd>${esc(t.created_at ? fmtDate(isoDateInTz(new Date(t.created_at), TZ)) : '—')}</dd></div>
  </dl></div>
  <button class="btn danger block" data-action="delete" data-table="tasks" data-id="${esc(t.id)}">${icon('trash', 'sm')} Delete task</button>`;
};

// ---------------------------------------------------------------------------
// Projects (library: Projects · Notes · Files)
// ---------------------------------------------------------------------------
function libraryTabs(active) {
  return `<div class="seg on-card" role="tablist">
    <button class="${active === 'projects' ? 'on' : ''}" data-action="nav" data-href="#projects">Projects</button>
    <button class="${active === 'notes' ? 'on' : ''}" data-action="nav" data-href="#notes">Notes</button>
    <button class="${active === 'files' ? 'on' : ''}" data-action="nav" data-href="#files">Files</button>
  </div>`;
}
const libraryActions = (addAction, label) => `
  <button class="icon-btn" data-action="open-search" aria-label="Search everything">${icon('search')}</button>
  <button class="icon-btn dark" data-action="${addAction}" aria-label="${esc(label)}">${icon('plus')}</button>`;

function projectCounts(p) {
  return {
    open: state.tasks.filter((t) => t.project_id === p.id && t.status !== 'done').length,
    notes: state.notes.filter((n) => n.project_id === p.id).length,
    files: state.files.filter((f) => f.project_id === p.id).length,
  };
}

function projectCard(p) {
  const c = projectCounts(p);
  return `<a class="project-card" href="#project/${esc(p.id)}">
    <div class="project-bar" style="background:${safeColor(p.color)}"></div>
    <div class="project-body">
      <div class="project-top">
        <div style="min-width:0"><div class="caption">${esc(p.business || 'No business')}</div><div class="project-name">${esc(p.name)}</div></div>
        ${p.status !== 'active' ? `<span class="chip ${p.status === 'done' ? 'muted' : 'normal'}">${esc(p.status[0].toUpperCase() + p.status.slice(1))}</span>` : ''}
      </div>
      <div class="project-counts">
        <span>${icon('task', 'xs')}<b>${c.open}</b> open</span>
        <span>${icon('note', 'xs')}<b>${c.notes}</b> notes</span>
        <span>${icon('file', 'xs')}<b>${c.files}</b> files</span>
      </div>
    </div>
  </a>`;
}

VIEWS.projects = () => {
  const f = state.ui.projectFilter || 'active';
  const by = (s) => state.projects.filter((p) => p.status === s);
  const list = by(f).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name));
  return `${header({ title: 'Projects', actions: libraryActions('new-project', 'New project') })}
  ${libraryTabs('projects')}
  ${pillsHTML([
    { id: 'active', label: 'Active', count: by('active').length },
    { id: 'paused', label: 'Paused', count: by('paused').length },
    { id: 'done', label: 'Done', count: by('done').length },
  ], f, 'project-filter')}
  <div class="list">${list.length ? list.map(projectCard).join('')
    : `<div class="card empty">${f === 'active' ? 'No active projects. Start one with the + button.' : `No ${f} projects.`}</div>`}</div>`;
};

VIEWS.project = ({ id }) => {
  const p = findIn('projects', id);
  if (!p) return header({ title: 'Project', back: '#projects' }) + '<div class="card empty">This project isn’t here anymore.</div>';
  const tab = state.ui.projectTab;
  const c = projectCounts(p);
  let body = '';
  if (tab === 'tasks') {
    const tasks = sortTasks(state.tasks.filter((t) => t.project_id === p.id));
    const open = tasks.filter((t) => t.status !== 'done');
    const done = tasks.filter((t) => t.status === 'done');
    body = `<div class="section-title"><h2>Open · ${open.length}</h2><button class="link-btn" data-action="new-task" data-project="${esc(p.id)}">+ Add task</button></div>
      <div class="list">${open.length ? open.map((t) => taskCard(t, { showProject: false })).join('') : '<div class="card empty">No open tasks here.</div>'}</div>
      ${done.length ? `<div class="section-title"><h2>Done · ${done.length}</h2></div><div class="list">${done.slice(0, 30).map((t) => taskCard(t, { showProject: false })).join('')}</div>` : ''}`;
  } else if (tab === 'notes') {
    body = projectNotesTab(p);
  } else {
    body = projectFilesTab(p);
  }
  return `${header({
    title: '',
    back: '#projects',
    actions: `<button class="icon-btn sm" data-action="edit-project" data-id="${esc(p.id)}" aria-label="Edit project">${icon('edit', 'sm')}</button>`,
  })}
  <section class="project-hero" style="--hero:${safeColor(p.color)}">
    <div class="caption">${esc(p.business || 'No business')} · ${esc(p.status)}</div>
    <h1>${esc(p.name)}</h1>
    ${p.description ? `<p>${esc(p.description)}</p>` : ''}
  </section>
  <div class="seg on-card" role="tablist">
    <button class="${tab === 'tasks' ? 'on' : ''}" data-action="project-tab" data-value="tasks">Tasks · ${c.open}</button>
    <button class="${tab === 'notes' ? 'on' : ''}" data-action="project-tab" data-value="notes">Notes · ${c.notes}</button>
    <button class="${tab === 'files' ? 'on' : ''}" data-action="project-tab" data-value="files">Files · ${c.files}</button>
  </div>
  ${body}`;
};


// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------
VIEWS.profile = () => `${header({ title: 'Profile' })}
  <section class="card">
    <div class="card-title"><h2>Account</h2></div>
    <div class="settings-row"><span class="k">Signed in as</span><span class="v">${esc(state.user?.email)}</span></div>
    <button class="btn block" data-action="sign-out" style="margin-top:8px">${icon('logout', 'sm')} Sign out</button>
  </section>
  ${profileGoogle()}
  ${profileBriefing()}
  ${profileInstall()}
  <p class="caption" style="text-align:center;margin-top:20px">Daybook · ${readQueue().length ? `${readQueue().length} change(s) waiting to sync` : 'all changes synced'}</p>`;

function profileBriefing() {
  const b = state.briefing;
  return `<section class="card">
    <div class="card-title"><h2>Briefing</h2>${b?.stats?.source === 'fallback' ? '<span class="chip normal">Basic</span>' : ''}</div>
    <div class="settings-row"><span class="k">Last generated</span><span class="v">${b?.generated_at ? `${esc(fmtDate(isoDateInTz(new Date(b.generated_at), TZ), { weekday: true }))} · ${esc(fmtInstant(new Date(b.generated_at), TZ))}` : 'Never'}</span></div>
    <p class="caption" style="margin:4px 0 12px">Written every morning at 6:30 AM Eastern (5:30 AM in winter, because Vercel cron runs on UTC). It reads today’s calendar, inbox, tasks and pinned notes.</p>
    <button class="btn dark block" data-action="regenerate">${icon('refresh', 'sm')} Regenerate now</button>
  </section>`;
}

async function regenerateBriefing(el) {
  if (DEMO) { toast('Demo mode: briefing is simulated.'); return; }
  if (!navigator.onLine) { toast('Regenerating needs a connection.', { error: true }); return; }
  el.disabled = true; el.innerHTML = `${icon('refresh', 'sm')} Writing…`;
  try {
    const res = await fetchApi('/api/cron/briefing', { method: 'POST' });
    if (res.briefing) state.briefing = res.briefing;
    saveCache();
    toast(res.source === 'claude' ? 'Fresh briefing ready.' : 'Claude was unavailable — wrote a basic summary instead.', { error: res.source !== 'claude' });
  } catch (err) {
    toast(`Couldn’t regenerate: ${err.message}`, { error: true });
  }
  render();
}
function profileInstall() { return ''; } // milestone 7

// ---------------------------------------------------------------------------
// Form fragments: tags editor, priority pills, project select
// ---------------------------------------------------------------------------
function tagEditor(tags = []) {
  return `<div class="tag-editor" data-tags>
    ${(tags || []).map((t) => `<span class="chip tag" data-tag="${esc(t)}">#${esc(t)}<button type="button" data-action="remove-tag" aria-label="Remove tag ${esc(t)}">${icon('x', 'xs')}</button></span>`).join('')}
    <button type="button" class="tag-add" data-action="add-tag">+ Add</button>
  </div>`;
}
const readTags = (form) => $$('[data-tag]', form).map((el) => el.dataset.tag);

function addTagChip(editor, raw) {
  const t = normTag(raw);
  if (!t || $$('[data-tag]', editor).some((el) => el.dataset.tag === t)) return;
  const chip = document.createElement('span');
  chip.className = 'chip tag';
  chip.dataset.tag = t;
  chip.innerHTML = `#${esc(t)}<button type="button" data-action="remove-tag" aria-label="Remove tag ${esc(t)}">${icon('x', 'xs')}</button>`;
  editor.insertBefore(chip, editor.querySelector('.tag-add, .tag-input'));
}

function openTagInput(btn) {
  const editor = btn.closest('[data-tags]');
  const input = document.createElement('input');
  input.className = 'tag-input';
  input.placeholder = 'tag';
  input.setAttribute('aria-label', 'New tag');
  input.enterKeyHint = 'done';
  btn.replaceWith(input);
  input.focus();
  const finish = () => {
    if (input.value.trim()) addTagChip(editor, input.value);
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'tag-add'; b.dataset.action = 'add-tag'; b.textContent = '+ Add';
    input.replaceWith(b);
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (input.value.trim()) { addTagChip(editor, input.value); input.value = ''; } else finish();
    } else if (e.key === 'Escape') { e.stopPropagation(); input.value = ''; finish(); }
  });
  input.addEventListener('blur', finish, { once: true });
}

function projectSelect(selected, name = 'project_id') {
  const opts = state.projects
    .filter((p) => p.status !== 'done' || p.id === selected)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((p) => `<option value="${esc(p.id)}"${p.id === selected ? ' selected' : ''}>${esc(p.name)}${p.business ? ` — ${esc(p.business)}` : ''}</option>`).join('');
  return `<select class="select" name="${name}" id="f-${name}"><option value="">No project</option>${opts}</select>`;
}

const sheetHead = (title) => `<div class="sheet-head"><h2>${esc(title)}</h2><button type="button" class="icon-btn sm ghost" data-action="close-sheet" aria-label="Close">${icon('x')}</button></div>`;

// ---------------------------------------------------------------------------
// Add menu + Task sheet + Project sheet
// ---------------------------------------------------------------------------
function openAddMenu() {
  const item = (action, ic, cls, title, sub) => `<button class="menu-item" data-action="${action}">
    <span class="row-icon ${cls}">${icon(ic)}</span><b>${title}</b><span class="caption">${sub}</span></button>`;
  openSheet(`${sheetHead('Add')}
    <div class="menu-grid">
      ${item('new-task', 'task', 'green', 'Task', 'Something to do')}
      ${item('new-note', 'note', 'lav', 'Note', 'Write it down')}
      ${item('new-file', 'upload', 'amber', 'File', 'Upload or link')}
      ${item('new-project', 'folder', 'red', 'Project', 'Group the work')}
    </div>`, { label: 'Add' });
}

function openTaskSheet({ id = null, projectId = null, dueDate = null } = {}) {
  const t = id ? findIn('tasks', id) : null;
  const v = t || { title: '', description: '', priority: 'medium', due_date: dueDate, due_time: null, project_id: projectId, tags: [] };
  openSheet(`${sheetHead(t ? 'Edit Task' : 'Add Task')}
    <form id="task-form" data-id="${esc(t?.id || '')}" novalidate autocomplete="off">
      <div class="field"><label for="f-title">Title</label>
        <input class="input" id="f-title" name="title" maxlength="300" required value="${esc(v.title)}" placeholder="What needs doing?" autofocus></div>
      <div class="field"><label for="f-desc">Description</label>
        <textarea class="textarea" id="f-desc" name="description" placeholder="Add details">${esc(v.description || '')}</textarea></div>
      <div class="field"><span class="label">Due date &amp; time</span>
        <div class="two">
          <input class="input" type="date" name="due_date" aria-label="Due date" value="${esc(v.due_date || '')}">
          <input class="input" type="time" name="due_time" aria-label="Due time" value="${esc((v.due_time || '').slice(0, 5))}">
        </div></div>
      <div class="field"><span class="label">Priority</span>
        <input type="hidden" name="priority" value="${esc(v.priority)}">
        <div class="prio-pills" role="radiogroup" aria-label="Priority">
          ${['low', 'medium', 'high'].map((p) => `<button type="button" class="prio ${p}${v.priority === p ? ' on' : ''}" role="radio" aria-checked="${v.priority === p}" data-action="set-prio" data-value="${p}"><i class="dot"></i>${p[0].toUpperCase() + p.slice(1)}</button>`).join('')}
        </div></div>
      <div class="field"><label for="f-project_id">Project</label>${projectSelect(v.project_id)}</div>
      <div class="field"><span class="label">Tags</span>${tagEditor(v.tags)}</div>
      <div class="sheet-foot"><button class="btn dark big block" type="submit">${t ? 'Save Changes' : 'Create Task'}</button></div>
    </form>`, { label: t ? 'Edit task' : 'Add task' });
}

async function submitTask(form) {
  const title = form.title.value.trim();
  if (!title) { form.title.focus(); toast('Give the task a title.', { error: true }); return; }
  const dueDate = form.due_date.value || null;
  const dueTime = form.due_time.value || null;
  const fields = {
    title,
    description: form.description.value.trim() || null,
    priority: form.priority.value || 'medium',
    due_date: dueDate || (dueTime ? today() : null),
    due_time: dueTime,
    project_id: form.project_id.value || null,
    tags: readTags(form),
  };
  const id = form.dataset.id;
  closeSheet();
  if (id) await updateRow('tasks', id, fields);
  else {
    const row = await createRow('tasks', { ...fields, status: 'todo' });
    if (row) { state.ui.taskFilter = 'todo'; scheduleRender(); }
  }
}

async function setTaskStatus(id, status, { undo = false } = {}) {
  const t = findIn('tasks', id);
  if (!t || t.status === status) return;
  const prev = { status: t.status, completed_at: t.completed_at };
  await updateRow('tasks', id, { status, completed_at: status === 'done' ? nowIso() : null });
  if (undo && status === 'done') {
    toast('Marked done', { action: 'Undo', onAction: () => updateRow('tasks', id, prev) });
  }
}

function openProjectSheet({ id = null } = {}) {
  const p = id ? findIn('projects', id) : null;
  const v = p || { name: '', business: '', color: COLORS[state.projects.length % COLORS.length], status: 'active', description: '' };
  const color = safeColor(v.color);
  openSheet(`${sheetHead(p ? 'Edit Project' : 'New Project')}
    <form id="project-form" data-id="${esc(p?.id || '')}" novalidate autocomplete="off">
      <div class="field"><label for="f-name">Name</label>
        <input class="input" id="f-name" name="name" maxlength="120" required value="${esc(v.name)}" placeholder="Project name" autofocus></div>
      <div class="field"><label for="f-business">Business</label>
        <input class="input" id="f-business" name="business" list="business-list" maxlength="80" value="${esc(v.business || '')}" placeholder="Berner Studio, Personal…">
        <datalist id="business-list">${BUSINESSES.map((b) => `<option value="${esc(b)}"></option>`).join('')}</datalist>
        <div class="chips">${BUSINESSES.map((b) => `<button type="button" class="chip muted" data-action="pick-business" data-value="${esc(b)}">${esc(b)}</button>`).join('')}</div></div>
      <div class="field"><span class="label">Color</span>
        <input type="hidden" name="color" value="${esc(color)}">
        <div class="swatches">${COLORS.map((c) => `<button type="button" class="swatch${c === color ? ' on' : ''}" style="background:${c}" data-action="pick-color" data-value="${c}" aria-label="Color ${c}"></button>`).join('')}</div></div>
      <div class="field"><span class="label">Status</span>
        <input type="hidden" name="status" value="${esc(v.status)}">
        <div class="seg">${['active', 'paused', 'done'].map((s) => `<button type="button" class="${v.status === s ? 'on' : ''}" data-action="pick-status" data-value="${s}">${s[0].toUpperCase() + s.slice(1)}</button>`).join('')}</div></div>
      <div class="field"><label for="f-pdesc">Description</label>
        <textarea class="textarea" id="f-pdesc" name="description" placeholder="What is this about?">${esc(v.description || '')}</textarea></div>
      <div class="sheet-foot">
        <button class="btn dark big block" type="submit">${p ? 'Save Changes' : 'Create Project'}</button>
        ${p ? `<button type="button" class="btn danger block" data-action="delete" data-table="projects" data-id="${esc(p.id)}">${icon('trash', 'sm')} Delete project</button>` : ''}
      </div>
    </form>`, { label: p ? 'Edit project' : 'New project' });
}

async function submitProject(form) {
  const name = form.name.value.trim();
  if (!name) { form.name.focus(); toast('Give the project a name.', { error: true }); return; }
  const fields = {
    name,
    business: form.business.value.trim() || null,
    color: safeColor(form.color.value),
    status: form.status.value || 'active',
    description: form.description.value.trim() || null,
  };
  const id = form.dataset.id;
  closeSheet();
  if (id) await updateRow('projects', id, fields);
  else {
    const maxOrder = Math.max(0, ...state.projects.map((p) => p.sort_order || 0));
    const row = await createRow('projects', { ...fields, sort_order: maxOrder + 1 });
    if (row) go(`#project/${row.id}`);
  }
}

// Two-tap delete (no native confirm dialogs).
const armed = new Map();
async function handleDelete(el) {
  const key = `${el.dataset.table}:${el.dataset.id}`;
  if (!armed.has(key)) {
    const original = el.innerHTML;
    el.innerHTML = `${icon('trash', 'sm')} Tap again to delete`;
    armed.set(key, setTimeout(() => { armed.delete(key); if (el.isConnected) el.innerHTML = original; }, 3000));
    return;
  }
  clearTimeout(armed.get(key)); armed.delete(key);
  const { table, id } = el.dataset;
  const row = findIn(table, id);
  if (!row) return;
  closeSheet(true);
  if (table === 'files') { await deleteFile(row); return; }
  const ok = await deleteRow(table, id);
  if (!ok) return;
  if (table === 'projects') {
    // FK is ON DELETE SET NULL; mirror it locally
    for (const arr of [state.tasks, state.notes, state.files]) arr.forEach((x) => { if (x.project_id === id) x.project_id = null; });
    go('#projects');
  } else if (location.hash.startsWith(`#${table.slice(0, -1)}/`)) {
    history.length > 1 && navDepth > 0 ? history.back() : go('#home');
  }
  const label = { tasks: 'Task', notes: 'Note', projects: 'Project' }[table] || 'Item';
  toast(`${label} deleted`, {
    action: table === 'projects' ? null : 'Undo',
    onAction: () => {
      const { created_at, updated_at, ...rest } = row;
      createRow(table, rest);
    },
  });
}


// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------
function noteTitle(n) {
  if (n.title?.trim()) return n.title.trim();
  const first = (n.body || '').split('\n').find((l) => l.trim());
  return first ? first.replace(/^#+\s*/, '').slice(0, 80) : 'Untitled note';
}
const plain = (md) => String(md || '').replace(/[#*_`>\[\]()-]+/g, ' ').replace(/\s+/g, ' ').trim();
const shortDate = (ts) => (ts ? fmtDate(isoDateInTz(new Date(ts), TZ)) : '');

function sortNotes(list) {
  return [...list].sort((a, b) => (b.pinned - a.pinned) || (b.updated_at || '').localeCompare(a.updated_at || ''));
}

function noteMatches(n, q) {
  if (!q) return true;
  const hay = `${n.title || ''} ${n.body || ''} ${(n.tags || []).join(' ')}`.toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w.replace(/^#/, '')));
}

function noteRow(n, { showProject = true } = {}) {
  const p = projectById(n.project_id);
  const snippet = plain(n.body).slice(0, 160);
  return `<a class="row" href="#note/${esc(n.id)}">
    <span class="row-icon lav">${icon(n.pinned ? 'pin' : 'note')}</span>
    <span class="row-main">
      <span class="row-title" style="display:block">${esc(noteTitle(n))}</span>
      ${snippet ? `<span class="row-snippet">${esc(snippet)}</span>` : ''}
      <span class="row-sub" style="display:block;margin-top:4px">${esc(shortDate(n.updated_at))}${showProject && p ? ` · ${esc(p.name)}` : ''}${(n.tags || []).length ? ` · ${n.tags.slice(0, 3).map((t) => `#${esc(t)}`).join(' ')}` : ''}</span>
    </span>
  </a>`;
}

function notesList() {
  const q = state.ui.noteQuery.trim();
  const list = sortNotes(state.notes.filter((n) => noteMatches(n, q)));
  if (!list.length) return `<div class="card empty">${q ? 'No notes match that.' : 'No notes yet. Jot something down with +.'}</div>`;
  return list.map((n) => noteRow(n)).join('');
}

VIEWS.notes = () => `${header({ title: 'Notes', actions: libraryActions('new-note', 'New note') })}
  ${libraryTabs('notes')}
  <div class="input-wrap" style="margin-bottom:14px">${icon('search', 'sm')}
    <input class="input" type="search" data-input="note-search" placeholder="Search notes and #tags" value="${esc(state.ui.noteQuery)}" aria-label="Search notes" enterkeyhint="search"></div>
  <div class="list" id="note-results">${notesList()}</div>`;

VIEWS.note = ({ id }) => {
  const n = findIn('notes', id);
  if (!n) return header({ title: 'Note', back: '#notes' }) + '<div class="card empty">This note isn’t here anymore.</div>';
  const p = projectById(n.project_id);
  return `${header({
    title: '',
    back: p ? `#project/${p.id}` : '#notes',
    actions: `
      <button class="icon-btn sm${n.pinned ? ' dark' : ''}" data-action="toggle-pin" data-id="${esc(n.id)}" aria-label="${n.pinned ? 'Unpin' : 'Pin'}" aria-pressed="${n.pinned}">${icon('pin', 'sm')}</button>
      <button class="icon-btn sm" data-action="edit-note" data-id="${esc(n.id)}" aria-label="Edit note">${icon('edit', 'sm')}</button>`,
  })}
  <h1 class="detail-title">${esc(noteTitle(n))}</h1>
  <div class="chips" style="margin-bottom:14px">
    ${p ? `<a class="chip muted" href="#project/${esc(p.id)}" style="text-decoration:none">${projectDot(p)} ${esc(p.name)}</a>` : ''}
    ${tagChips(n.tags)}
    <span class="chip muted">Edited ${esc(shortDate(n.updated_at))}</span>
  </div>
  <article class="card md">${n.body?.trim() ? renderMarkdown(n.body) : '<p class="caption">Empty note.</p>'}</article>
  <button class="btn danger block" data-action="delete" data-table="notes" data-id="${esc(n.id)}">${icon('trash', 'sm')} Delete note</button>`;
};

function projectNotesTab(p) {
  const list = sortNotes(state.notes.filter((n) => n.project_id === p.id));
  return `<div class="section-title"><h2>Notes · ${list.length}</h2><button class="link-btn" data-action="new-note" data-project="${esc(p.id)}">+ Add note</button></div>
    <div class="list">${list.length ? list.map((n) => noteRow(n, { showProject: false })).join('') : '<div class="card empty">No notes for this project yet.</div>'}</div>`;
}

function openNoteSheet({ id = null, projectId = null } = {}) {
  const n = id ? findIn('notes', id) : null;
  const v = n || { title: '', body: '', project_id: projectId, tags: [], pinned: false };
  openSheet(`${sheetHead(n ? 'Edit Note' : 'New Note')}
    <form id="note-form" data-id="${esc(n?.id || '')}" novalidate autocomplete="off">
      <div class="field"><label for="f-ntitle">Title</label>
        <input class="input" id="f-ntitle" name="title" maxlength="200" value="${esc(v.title || '')}" placeholder="Title (optional)" autofocus></div>
      <div class="field">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
          <span class="label">Body</span>
          <div class="seg" style="width:180px"><button type="button" class="on" data-action="note-mode" data-value="write">Write</button><button type="button" data-action="note-mode" data-value="preview">Preview</button></div>
        </div>
        <textarea class="textarea tall" name="body" placeholder="Markdown: # heading, **bold**, - list, [link](https://…)">${esc(v.body || '')}</textarea>
        <div class="md md-preview" data-preview hidden></div>
      </div>
      <div class="field"><label for="f-project_id">Project</label>${projectSelect(v.project_id)}</div>
      <div class="field"><span class="label">Tags</span>${tagEditor(v.tags)}</div>
      <input type="hidden" name="pinned" value="${v.pinned ? '1' : ''}">
      <div class="toggle"><span>Pin to top</span><button type="button" class="switch${v.pinned ? ' on' : ''}" role="switch" aria-checked="${!!v.pinned}" aria-label="Pin to top" data-action="toggle-switch" data-field="pinned"></button></div>
      <div class="sheet-foot"><button class="btn dark big block" type="submit">${n ? 'Save Changes' : 'Create Note'}</button></div>
    </form>`, { label: n ? 'Edit note' : 'New note' });
}

async function submitNote(form) {
  const title = form.title.value.trim();
  const body = form.body.value;
  if (!title && !body.trim()) { toast('Write something first.', { error: true }); form.body.focus(); return; }
  const fields = {
    title: title || null,
    body: body.trim() ? body : null,
    project_id: form.project_id.value || null,
    tags: readTags(form),
    pinned: !!form.pinned.value,
  };
  const id = form.dataset.id;
  closeSheet();
  if (id) await updateRow('notes', id, fields);
  else {
    const row = await createRow('notes', fields);
    if (row && parseRoute().view !== 'project') go(`#note/${row.id}`);
  }
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------
function fileIcon(f) {
  if (f.kind === 'link') return ['link', 'lav'];
  const m = f.mime || '';
  if (m === 'application/pdf') return ['pdf', 'red'];
  if (m.startsWith('image/')) return ['image', 'green'];
  return ['file', 'amber'];
}

function fileHost(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

function fileRow(f, { showProject = true } = {}) {
  const [ic, cls] = fileIcon(f);
  const p = projectById(f.project_id);
  const meta = [
    f.kind === 'link' ? fileHost(f.url) : fmtBytes(f.size_bytes),
    showProject && p ? p.name : '',
    shortDate(f.created_at),
  ].filter(Boolean).join(' · ');
  return `<div class="row">
    <span class="row-icon ${cls}">${icon(ic)}</span>
    <button class="row-main" data-action="open-file" data-id="${esc(f.id)}" style="text-align:left">
      <span class="row-title" style="display:block">${esc(f.name)}</span>
      <span class="row-sub" style="display:block">${esc(meta)}</span>
    </button>
    <a class="icon-btn sm ghost" href="#file/${esc(f.id)}" aria-label="Details for ${esc(f.name)}">${icon('more', 'sm')}</a>
  </div>`;
}

VIEWS.files = () => {
  const list = [...state.files].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  return `${header({ title: 'Files', actions: libraryActions('new-file', 'Add file') })}
  ${libraryTabs('files')}
  <div class="list">${list.length ? list.map((f) => fileRow(f)).join('') : '<div class="card empty">No files yet. Upload one or save a link with +.</div>'}</div>`;
};

VIEWS.file = ({ id }) => {
  const f = findIn('files', id);
  if (!f) return header({ title: 'File', back: '#files' }) + '<div class="card empty">This file isn’t here anymore.</div>';
  const p = projectById(f.project_id);
  const [ic, cls] = fileIcon(f);
  return `${header({
    title: 'File',
    back: p ? `#project/${p.id}` : '#files',
    actions: `<button class="icon-btn sm" data-action="edit-file" data-id="${esc(f.id)}" aria-label="Edit file">${icon('edit', 'sm')}</button>`,
  })}
  <div style="display:flex;gap:14px;align-items:center;margin:4px 0 16px">
    <span class="row-icon ${cls}" style="width:56px;height:56px;border-radius:18px">${icon(ic)}</span>
    <h1 class="detail-title" style="margin:0">${esc(f.name)}</h1>
  </div>
  <div class="card"><dl class="kv">
    <div><dt>Type</dt><dd>${f.kind === 'link' ? 'Link' : esc(f.mime || 'File')}</dd></div>
    ${f.kind === 'link' ? `<div><dt>URL</dt><dd>${esc(fileHost(f.url))}</dd></div>` : `<div><dt>Size</dt><dd>${esc(fmtBytes(f.size_bytes))}</dd></div>`}
    <div><dt>Project</dt><dd>${p ? `<a href="#project/${esc(p.id)}">${projectDot(p)} ${esc(p.name)}</a>` : '—'}</dd></div>
    <div><dt>Tags</dt><dd><div class="chips" style="justify-content:flex-end">${tagChips(f.tags) || '—'}</div></dd></div>
    <div><dt>Added</dt><dd>${esc(shortDate(f.created_at))}</dd></div>
  </dl></div>
  <div class="btn-row" style="margin-bottom:12px">
    <button class="btn dark" style="flex:1" data-action="open-file" data-id="${esc(f.id)}">${icon('external', 'sm')} Open</button>
  </div>
  <button class="btn danger block" data-action="delete" data-table="files" data-id="${esc(f.id)}">${icon('trash', 'sm')} Delete ${f.kind === 'upload' ? 'file' : 'link'}</button>`;
};

function projectFilesTab(p) {
  const list = state.files.filter((f) => f.project_id === p.id).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  return `<div class="section-title"><h2>Files · ${list.length}</h2><button class="link-btn" data-action="new-file" data-project="${esc(p.id)}">+ Add file</button></div>
    <div class="list">${list.length ? list.map((f) => fileRow(f, { showProject: false })).join('') : '<div class="card empty">No files for this project yet.</div>'}</div>`;
}

async function openFile(id) {
  const f = findIn('files', id);
  if (!f) return;
  if (f.kind === 'link') {
    const url = safeUrl(f.url);
    if (url) window.open(url, '_blank', 'noopener'); else toast('That link doesn’t look valid.', { error: true });
    return;
  }
  if (DEMO) { toast('Demo mode: uploads aren’t real.'); return; }
  // Open a window synchronously (popup blockers), then point it at the signed URL.
  const win = window.open('', '_blank');
  const { data, error } = await sb.storage.from('files').createSignedUrl(f.storage_path, 3600);
  if (error || !data?.signedUrl) {
    win?.close();
    toast(navigator.onLine ? `Couldn’t open: ${error?.message || 'unknown error'}` : 'Opening files needs a connection.', { error: true });
    return;
  }
  if (win) { win.opener = null; win.location.href = data.signedUrl; } else location.href = data.signedUrl;
}

const safeFileName = (name) => (String(name || 'file').normalize('NFKD').replace(/[^\w.\-]+/g, '_').replace(/_+/g, '_').slice(-120)) || 'file';

function uploadToStorage(path, file, onProgress) {
  return new Promise(async (resolve, reject) => {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { reject(new Error('Not signed in')); return; }
    const xhr = new XMLHttpRequest();
    const encoded = path.split('/').map(encodeURIComponent).join('/');
    xhr.open('POST', `${CONFIG.supabaseUrl}/storage/v1/object/files/${encoded}`);
    xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`);
    xhr.setRequestHeader('apikey', CONFIG.supabaseAnonKey);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.setRequestHeader('cache-control', '3600');
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else {
        let msg = `Upload failed (${xhr.status})`;
        try { msg = JSON.parse(xhr.responseText).message || msg; } catch { /* keep default */ }
        reject(new Error(msg));
      }
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(file);
  });
}

function openFileSheet({ id = null, projectId = null } = {}) {
  const f = id ? findIn('files', id) : null;
  const mode = f ? f.kind : 'upload';
  const v = f || { name: '', url: '', project_id: projectId, tags: [] };
  openSheet(`${sheetHead(f ? 'Edit File' : 'Add File')}
    <form id="file-form" data-id="${esc(f?.id || '')}" data-mode="${mode}" novalidate autocomplete="off">
      ${f ? '' : `<div class="seg" style="margin-bottom:16px">
        <button type="button" class="on" data-action="file-mode" data-value="upload">Upload</button>
        <button type="button" data-action="file-mode" data-value="link">Paste link</button></div>`}
      <div data-mode-panel="upload"${mode === 'upload' ? '' : ' hidden'}>
        ${f ? '' : `<label class="dropzone field" data-dropzone>
          ${icon('upload')}
          <span data-file-label><strong>Choose a file</strong> or drop it here</span>
          <span class="caption">Up to 50 MB</span>
          <input type="file" name="file" class="sr-only">
        </label>
        <div class="progressbar" data-progress hidden><div></div></div>`}
      </div>
      <div data-mode-panel="link"${mode === 'link' ? '' : ' hidden'}>
        <div class="field"><label for="f-url">URL</label>
          <input class="input" id="f-url" name="url" type="url" inputmode="url" placeholder="https://…" value="${esc(v.url || '')}"></div>
      </div>
      <div class="field"><label for="f-fname">Name</label>
        <input class="input" id="f-fname" name="name" maxlength="200" value="${esc(v.name)}" placeholder="Shown in your list"></div>
      <div class="field"><label for="f-project_id">Project</label>${projectSelect(v.project_id)}</div>
      <div class="field"><span class="label">Tags</span>${tagEditor(v.tags)}</div>
      <div class="sheet-foot"><button class="btn dark big block" type="submit">${f ? 'Save Changes' : 'Add File'}</button></div>
    </form>`, {
    label: f ? 'Edit file' : 'Add file',
    onMount: (sheet) => {
      const input = $('input[type=file]', sheet);
      const zone = $('[data-dropzone]', sheet);
      if (!input || !zone) return;
      const pickFile = (file) => {
        if (!file) return;
        const form = $('#file-form', sheet);
        form._file = file;
        $('[data-file-label]', sheet).innerHTML = `<strong>${esc(file.name)}</strong> · ${esc(fmtBytes(file.size))}`;
        if (!form.name.value.trim()) form.name.value = file.name;
      };
      input.addEventListener('change', () => pickFile(input.files[0]));
      zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('over'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('over'));
      zone.addEventListener('drop', (e) => { e.preventDefault(); zone.classList.remove('over'); pickFile(e.dataTransfer.files[0]); });
    },
  });
}

async function submitFile(form) {
  const id = form.dataset.id;
  const mode = form.dataset.mode;
  const common = { project_id: form.project_id.value || null, tags: readTags(form) };
  const btn = form.querySelector('[type=submit]');

  if (id) { // edit: metadata only (and URL for links)
    const patch = { ...common, name: form.name.value.trim() || findIn('files', id).name };
    if (mode === 'link') {
      const url = safeUrl(form.url.value);
      if (!url) { toast('Enter a valid http(s) link.', { error: true }); return; }
      patch.url = url;
    }
    closeSheet();
    await updateRow('files', id, patch);
    return;
  }

  if (!navigator.onLine && !DEMO) { toast('Adding files needs a connection.', { error: true }); return; }

  if (mode === 'link') {
    const url = safeUrl(form.url.value);
    if (!url || url.startsWith('mailto:')) { toast('Enter a valid http(s) link.', { error: true }); form.url.focus(); return; }
    closeSheet();
    await createRow('files', { ...common, kind: 'link', url, name: form.name.value.trim() || fileHost(url) || url });
    return;
  }

  const file = form._file;
  if (!file) { toast('Choose a file to upload.', { error: true }); return; }
  if (file.size > 50 * 1024 * 1024) { toast('That file is over 50 MB.', { error: true }); return; }
  const fileId = uuid();
  const path = `${state.user.id}/${fileId}/${safeFileName(file.name)}`;
  const bar = $('[data-progress]', form);
  bar.hidden = false;
  btn.disabled = true; btn.textContent = 'Uploading…';
  try {
    if (DEMO) { for (let i = 1; i <= 10; i++) { bar.firstElementChild.style.width = `${i * 10}%`; await new Promise((r) => setTimeout(r, 60)); } }
    else await uploadToStorage(path, file, (pct) => { bar.firstElementChild.style.width = `${Math.round(pct * 100)}%`; });
  } catch (err) {
    btn.disabled = false; btn.textContent = 'Add File'; bar.hidden = true;
    toast(err.message, { error: true });
    return;
  }
  closeSheet();
  const row = await createRow('files', {
    ...common, id: fileId, kind: 'upload', storage_path: path,
    name: form.name.value.trim() || file.name, mime: file.type || null, size_bytes: file.size,
  });
  if (!row && !DEMO) await sb.storage.from('files').remove([path]); // don't leave an orphaned object
}

async function deleteFile(row) {
  if (row.kind === 'upload' && row.storage_path && !DEMO) {
    if (!navigator.onLine) { toast('Deleting files needs a connection.', { error: true }); return; }
    const { error } = await sb.storage.from('files').remove([row.storage_path]);
    if (error) { toast(`Couldn’t delete the stored file: ${error.message}`, { error: true }); return; }
  }
  const ok = await deleteRow('files', row.id);
  if (ok) {
    if (parseRoute().view === 'file') go('#files');
    toast(row.kind === 'upload' ? 'File deleted' : 'Link deleted');
  }
}

// ---------------------------------------------------------------------------
// Global search (client-side over the loaded cache)
// ---------------------------------------------------------------------------
function searchResults(q) {
  q = q.trim().toLowerCase();
  if (!q) return '<div class="empty">Search tasks, notes, files and projects.</div>';
  const words = q.split(/\s+/).map((w) => w.replace(/^#/, ''));
  const hit = (...fields) => {
    const hay = fields.flat().filter(Boolean).join(' ').toLowerCase();
    return words.every((w) => hay.includes(w));
  };
  const groups = [
    ['Tasks', state.tasks.filter((t) => hit(t.title, t.description, t.tags)).slice(0, 8)
      .map((t) => `<a class="row" href="#task/${esc(t.id)}"><span class="row-icon green">${icon('task')}</span><span class="row-main"><span class="row-title" style="display:block">${esc(t.title)}</span><span class="row-sub" style="display:block">${esc(STATUS_LABEL[t.status])}${t.due_date ? ` · ${esc(fmtDue(t))}` : ''}</span></span></a>`)],
    ['Notes', sortNotes(state.notes.filter((n) => hit(n.title, n.body, n.tags))).slice(0, 8).map((n) => noteRow(n))],
    ['Files', state.files.filter((f) => hit(f.name, f.tags, f.url)).slice(0, 8)
      .map((f) => { const [ic, cls] = fileIcon(f); return `<a class="row" href="#file/${esc(f.id)}"><span class="row-icon ${cls}">${icon(ic)}</span><span class="row-main"><span class="row-title" style="display:block">${esc(f.name)}</span><span class="row-sub" style="display:block">${f.kind === 'link' ? esc(fileHost(f.url)) : esc(fmtBytes(f.size_bytes))}</span></span></a>`; })],
    ['Projects', state.projects.filter((p) => hit(p.name, p.business, p.description)).slice(0, 8)
      .map((p) => `<a class="row" href="#project/${esc(p.id)}"><span class="row-icon" style="background:${safeColor(p.color)}22;color:${safeColor(p.color)}">${icon('folder')}</span><span class="row-main"><span class="row-title" style="display:block">${esc(p.name)}</span><span class="row-sub" style="display:block">${esc(p.business || '')}</span></span></a>`)],
  ].filter(([, rows]) => rows.length);
  if (!groups.length) return '<div class="empty">Nothing matches that.</div>';
  return groups.map(([label, rows]) => `<div class="search-group">${label}</div>${rows.join('')}`).join('');
}

function openSearch() {
  openSheet(`${sheetHead('Search')}
    <div class="input-wrap">${icon('search', 'sm')}<input class="input" type="search" data-input="global-search" placeholder="Search everything" aria-label="Search everything" autofocus enterkeyhint="search"></div>
    <div class="search-results" id="search-results">${searchResults('')}</div>`, {
    label: 'Search',
    onMount: (sheet) => setTimeout(() => $('input', sheet)?.focus(), 220),
  });
}

document.addEventListener('input', (e) => {
  const kind = e.target.dataset?.input;
  if (kind === 'note-search') {
    state.ui.noteQuery = e.target.value;
    const box = $('#note-results');
    if (box) box.innerHTML = notesList();
  } else if (kind === 'global-search') {
    const box = $('#search-results');
    if (box) box.innerHTML = searchResults(e.target.value);
  }
});

// ---------------------------------------------------------------------------
// API + Google (server holds every Google token; the browser only sees results)
// ---------------------------------------------------------------------------
async function fetchApi(path, { method = 'GET', body } = {}) {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) throw new Error('Not signed in');
  const res = await fetch(path, {
    method,
    headers: { authorization: `Bearer ${session.access_token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(data.error || `Request failed (${res.status})`);
    e.status = res.status;
    throw e;
  }
  return data;
}

const loadedRanges = new Set();

function markDisconnected(reconnect = false) {
  state.googleConnected = false;
  state.googleReconnect = reconnect;
  state.events = [];
  state.threads = [];
  loadedRanges.clear();
}

async function loadEvents(start, end) {
  const data = await fetchApi(`/api/google/calendar?start=${start}&end=${end}`);
  if (data.connected === false) { markDisconnected(!!data.reconnect); return; }
  const s = startOfDayInTz(start, TZ); const e = startOfDayInTz(end, TZ);
  // replace anything we had in this window with the fresh set
  state.events = state.events.filter((ev) => !(evStart(ev) < e && evEnd(ev) > s)).concat(data.events || []);
  loadedRanges.add(`${start}|${end}`);
}

async function loadThreads() {
  const data = await fetchApi('/api/google/gmail');
  if (data.connected === false) { markDisconnected(!!data.reconnect); return; }
  state.threads = data.threads || [];
}

async function loadGoogle() {
  if (DEMO || !state.user || !navigator.onLine) return;
  try {
    const s = await fetchApi('/api/google/status');
    state.googleConnected = s.connected;
    state.googleEmail = s.email;
    state.googleScopes = s.scopes || [];
    if (s.connected) {
      state.googleReconnect = false;
      loadedRanges.clear();
      const ws = mondayOf(today());
      const jobs = [loadEvents(ws, addDays(ws, 14)), loadThreads()];
      const sel = state.ui.selectedDate && mondayOf(state.ui.selectedDate);
      if (sel && (sel < ws || sel >= addDays(ws, 14))) jobs.push(loadEvents(sel, addDays(sel, 7)));
      const results = await Promise.allSettled(jobs);
      results.filter((r) => r.status === 'rejected').forEach((r) => console.warn('google load failed', r.reason));
    } else {
      markDisconnected(false);
    }
  } catch (err) {
    console.warn('google status failed', err); // keep cached Google data on transient errors
  }
  scheduleRender();
  saveCacheSoon();
}

async function ensureWeekEvents(weekStart) {
  if (DEMO || !state.googleConnected || !navigator.onLine) return;
  const ws = mondayOf(today());
  if (weekStart >= ws && weekStart < addDays(ws, 14) && loadedRanges.has(`${ws}|${addDays(ws, 14)}`)) return;
  const key = `${weekStart}|${addDays(weekStart, 7)}`;
  if (loadedRanges.has(key)) return;
  loadedRanges.add(key);
  try { await loadEvents(weekStart, addDays(weekStart, 7)); scheduleRender(); } catch (err) { loadedRanges.delete(key); console.warn(err); }
}

async function connectGoogle() {
  if (DEMO) { toast('Demo mode: Google is simulated.'); return; }
  if (!navigator.onLine) { toast('Connecting Google needs a connection.', { error: true }); return; }
  try {
    const { url } = await fetchApi('/api/google/auth');
    if (!/^https:\/\/accounts\.google\.com\//.test(url)) throw new Error('Unexpected consent URL');
    location.href = url;
  } catch (err) {
    toast(`Couldn’t start Google sign-in: ${err.message}`, { error: true });
  }
}

let disconnectArmed = null;
async function disconnectGoogle(el) {
  if (!disconnectArmed) {
    el.textContent = 'Tap again to disconnect';
    disconnectArmed = setTimeout(() => { disconnectArmed = null; if (el.isConnected) el.textContent = 'Disconnect Google'; }, 3000);
    return;
  }
  clearTimeout(disconnectArmed); disconnectArmed = null;
  if (DEMO) { markDisconnected(); render(); return; }
  try {
    await fetchApi('/api/google/disconnect', { method: 'POST' });
    markDisconnected(false);
    state.googleEmail = null;
    saveCache(); render();
    toast('Google disconnected.');
  } catch (err) {
    toast(`Couldn’t disconnect: ${err.message}`, { error: true });
  }
}

// ---------------------------------------------------------------------------
// Event helpers
// ---------------------------------------------------------------------------
const evStart = (e) => (e.allDay ? startOfDayInTz(e.start, TZ) : new Date(e.start));
const evEnd = (e) => (e.allDay ? startOfDayInTz(e.end || addDays(e.start, 1), TZ) : new Date(e.end || e.start));
function eventsOn(iso) {
  const s = startOfDayInTz(iso, TZ); const e = startOfDayInTz(addDays(iso, 1), TZ);
  return state.events.filter((ev) => evStart(ev) < e && evEnd(ev) > s);
}
const isWorkEvent = (e) => !!e.primary;
const isWorkTask = (t) => { const p = projectById(t.project_id); return !!(p && p.business && p.business.trim().toLowerCase() !== 'personal'); };

function eventTimeRange(e, iso) {
  if (e.allDay) return 'All day';
  const s = evStart(e); const en = evEnd(e);
  const sameDayStart = isoDateInTz(s, TZ) === iso;
  const sameDayEnd = isoDateInTz(en, TZ) === iso;
  return `${sameDayStart ? fmtInstant(s, TZ) : '…'} – ${sameDayEnd ? fmtInstant(en, TZ) : '…'}`;
}

function eventLinkBtn(e, cls = 'btn xs lav') {
  const meet = safeUrl(e.meetUrl || '');
  const open = safeUrl(e.htmlLink || '');
  if (meet) return `<a class="${cls}" href="${esc(meet)}" target="_blank" rel="noopener noreferrer">${icon('video', 'xs')} Meet</a>`;
  if (open) return `<a class="btn xs" href="${esc(open)}" target="_blank" rel="noopener noreferrer">${icon('external', 'xs')} Open</a>`;
  return '';
}

function connectCard(compact = false) {
  const again = state.googleReconnect;
  return `<section class="card" aria-label="Connect Google">
    <div style="display:flex;gap:12px;align-items:center;margin-bottom:12px">
      <span class="row-icon lav">${icon('google')}</span>
      <div><b>${again ? 'Reconnect Google' : 'Connect Google'}</b>
        <div class="caption">${again ? 'Google access expired. Reconnect to bring your calendar and inbox back.' : compact ? 'See your events next to your tasks.' : 'See your calendar and the email that needs you, read-only.'}</div></div>
    </div>
    <button class="btn dark block" data-action="connect-google">${icon('google', 'sm')} ${again ? 'Reconnect' : 'Connect'} Google</button>
  </section>`;
}

// ---------------------------------------------------------------------------
// Home: Up next + Inbox
// ---------------------------------------------------------------------------
function homeUpNext() {
  if (state.googleConnected === false) return connectCard();
  if (!state.googleConnected) return '';
  const now = new Date();
  const horizon = startOfDayInTz(addDays(today(), 2), TZ);
  const next = state.events
    .filter((e) => !e.allDay && evEnd(e) > now && evStart(e) < horizon)
    .sort((a, b) => evStart(a) - evStart(b))
    .slice(0, 2);
  const when = (e) => {
    const s = evStart(e);
    if (s <= now) return 'Now';
    const d = isoDateInTz(s, TZ);
    return `${d === today() ? '' : 'Tomorrow · '}${fmtInstant(s, TZ)}`;
  };
  return `<div class="section-title"><h2>Up next</h2><a class="link-btn" href="#calendar">Calendar</a></div>
    ${next.length ? `<div class="strip">${next.map((e, i) => `
      <div class="event-tile${i === 0 ? ' first' : ''}">
        <span class="t">${esc(when(e))}</span>
        <span class="n">${esc(e.title)}</span>
        ${e.location && !safeUrl(e.location) ? `<span class="caption" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(e.location)}</span>` : ''}
        <div class="actions">${eventLinkBtn(e)}</div>
      </div>`).join('')}</div>`
    : '<div class="card empty">Nothing else on the calendar today.</div>'}`;
}

function homeInbox() {
  if (!state.googleConnected) return '';
  const th = state.threads || [];
  return `<section class="card" style="margin-top:16px" aria-label="Inbox">
    <div class="card-title"><h2>Inbox</h2><span class="chip ${th.length ? 'dark' : 'muted'}">${th.length} need${th.length === 1 ? 's' : ''} you</span></div>
    ${th.length ? `<div class="inset-list">${th.slice(0, 3).map((t) => {
      const url = safeUrl(t.url);
      return `<a class="row" ${url ? `href="${esc(url)}" target="_blank" rel="noopener noreferrer"` : ''}>
        <span class="row-icon${t.unread ? ' lav' : ''}">${icon('mail', 'sm')}</span>
        <span class="row-main"><span class="row-title" style="display:block">${esc(t.from)}</span><span class="row-sub" style="display:block">${esc(t.subject)}</span></span>
        <span class="row-end caption">${esc(timeAgo(new Date(t.date)))}</span>
      </a>`;
    }).join('')}</div>
    ${th.length > 3 ? `<a class="link-btn" href="https://mail.google.com/mail/u/0/#inbox" target="_blank" rel="noopener noreferrer">+${th.length - 3} more in Gmail</a>` : ''}`
    : '<div class="empty">The inbox is quiet.</div>'}
  </section>`;
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------
VIEWS.calendar = () => {
  const sel = state.ui.selectedDate || today();
  state.ui.selectedDate = sel;
  const ws = mondayOf(sel);
  ensureWeekEvents(ws);
  const f = state.ui.calFilter;
  const keepEvent = (e) => f === 'all' || (f === 'work' ? isWorkEvent(e) : !isWorkEvent(e));
  const keepTask = (t) => f === 'all' || (f === 'work' ? isWorkTask(t) : !isWorkTask(t));

  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const week = days.map((d) => {
    const hasEv = eventsOn(d).some(keepEvent);
    const hasTask = state.tasks.some((t) => t.due_date === d && t.status !== 'done' && keepTask(t));
    return `<button class="day${d === today() ? ' today' : ''}${d === sel ? ' sel' : ''}" data-action="select-day" data-value="${d}" aria-pressed="${d === sel}" aria-label="${esc(fmtDate(d, { long: true, weekday: true }))}">
      <span>${dayShort(d)}</span><span class="num">${Number(d.slice(8))}</span>
      <span class="marks">${hasEv ? '<i></i>' : ''}${hasTask ? '<i class="t"></i>' : ''}</span>
    </button>`;
  }).join('');

  const items = [];
  const dayStart = startOfDayInTz(sel, TZ);
  for (const e of eventsOn(sel).filter(keepEvent)) {
    const min = e.allDay ? null : Math.max(0, Math.round((evStart(e) - dayStart) / 60000));
    items.push({ kind: 'event', min, e });
  }
  for (const t of state.tasks.filter((x) => x.due_date === sel && keepTask(x))) {
    const min = t.due_time ? Number(t.due_time.slice(0, 2)) * 60 + Number(t.due_time.slice(3, 5)) : null;
    items.push({ kind: 'task', min, t });
  }
  items.sort((a, b) => (a.min ?? -1) - (b.min ?? -1));
  const nowMin = sel === today() ? nowMinutes() : null;
  const nextIdx = nowMin === null ? -1 : items.findIndex((it) => it.min !== null && it.min >= nowMin);

  const groups = [
    ['Anytime', (it) => it.min === null],
    ['Morning', (it) => it.min !== null && it.min < 720],
    ['Afternoon', (it) => it.min !== null && it.min >= 720 && it.min < 1020],
    ['Evening', (it) => it.min !== null && it.min >= 1020],
  ];

  const itemHTML = (it) => {
    const isNext = items.indexOf(it) === nextIdx;
    const [hm, ap] = it.min === null ? [] : fmtMinutes(it.min).split(' ');
    const time = it.min === null ? '' : `<span class="tl-time">${esc(hm)}<br>${esc(ap)}</span>`;
    if (it.kind === 'event') {
      const e = it.e;
      return `<div class="tl-item${isNext ? ' now' : ''}">${time}
        <div class="tl-card event${isWorkEvent(e) ? '' : ' personal'}">
          <div class="title">${esc(e.title)}</div>
          <div class="sub"><span>${icon('clock', 'xs')}${esc(eventTimeRange(e, sel))}</span>${e.calendarName ? `<span>${esc(e.calendarName)}</span>` : ''}</div>
          ${e.location && !safeUrl(e.location) ? `<div class="sub"><span>${esc(e.location)}</span></div>` : ''}
          ${eventLinkBtn(e) ? `<div class="foot"><span></span>${eventLinkBtn(e)}</div>` : ''}
        </div></div>`;
    }
    const t = it.t; const p = projectById(t.project_id);
    return `<div class="tl-item task${isNext ? ' now' : ''}">${time}
      <button class="tl-card" data-action="open-task" data-id="${esc(t.id)}">
        <div class="title"${t.status === 'done' ? ' style="text-decoration:line-through;color:var(--muted)"' : ''}>${esc(t.title)}</div>
        <div class="foot"><div class="chips">${statusChip(t.status)}${prioChip(t.priority)}</div>${p ? `<span class="caption">${projectDot(p)} ${esc(p.name)}</span>` : ''}</div>
      </button></div>`;
  };

  const timeline = groups.map(([label, test]) => {
    const g = items.filter(test);
    if (!g.length) return '';
    return `<section class="tl-group${label === 'Anytime' ? ' anytime' : ''}"><h3 class="tl-group-title">${label}<span class="chip muted">${g.length}</span></h3><div class="tl-items">${g.map(itemHTML).join('')}</div></section>`;
  }).join('');

  return `${header({
    title: 'Calendar',
    actions: `<button class="icon-btn" data-action="new-task" data-date="${esc(sel)}" aria-label="Add task on this day">${icon('plus')}</button>`,
  })}
  <div class="week-head">
    <h2>${esc(monthLabel(sel))}</h2>
    <div class="week-nav">
      <button class="icon-btn sm" data-action="week" data-value="-7" aria-label="Previous week">${icon('left', 'sm')}</button>
      <button class="pill sm" data-action="open-month">${icon('calendar', 'xs')} Calendar</button>
      <button class="icon-btn sm" data-action="week" data-value="7" aria-label="Next week">${icon('right', 'sm')}</button>
    </div>
  </div>
  <div class="week">${week}</div>
  ${pillsHTML([{ id: 'all', label: 'All' }, { id: 'work', label: 'Work' }, { id: 'personal', label: 'Personal' }], f, 'cal-filter')}
  ${state.googleConnected === false ? connectCard(true) : ''}
  <div class="section-title"><h2>${esc(sel === today() ? 'Today' : fmtDate(sel, { long: true, weekday: true }))}</h2>${sel !== today() ? '<button class="link-btn" data-action="select-day" data-value="today">Back to today</button>' : ''}</div>
  <div class="timeline">${timeline || `<div class="card empty">${sel === today() ? 'Nothing scheduled. An open day.' : 'Nothing scheduled.'}</div>`}</div>`;
};

function monthGrid(monthIso) {
  const first = `${monthIso.slice(0, 7)}-01`;
  const start = mondayOf(first);
  const sel = state.ui.selectedDate || today();
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const busy = new Set([
    ...state.tasks.filter((t) => t.due_date && t.status !== 'done').map((t) => t.due_date),
    ...state.events.map((e) => isoDateInTz(evStart(e), TZ)),
  ]);
  return `<div class="week-head">
      <button class="icon-btn sm" data-action="month-nav" data-value="${addDays(first, -1).slice(0, 7)}-01" aria-label="Previous month">${icon('left', 'sm')}</button>
      <h2>${esc(monthLabel(first))}</h2>
      <button class="icon-btn sm" data-action="month-nav" data-value="${addDays(first, 32).slice(0, 7)}-01" aria-label="Next month">${icon('right', 'sm')}</button>
    </div>
    <div class="month">
      ${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d) => `<span class="dow">${d}</span>`).join('')}
      ${cells.map((d) => `<button class="${d.slice(0, 7) !== first.slice(0, 7) ? 'out' : ''}${d === today() ? ' today' : ''}${d === sel ? ' sel' : ''}${busy.has(d) ? ' has' : ''}" data-action="pick-day" data-value="${d}" aria-label="${esc(fmtDate(d, { long: true }))}">${Number(d.slice(8))}</button>`).join('')}
    </div>
    <button class="btn block" style="margin-top:14px" data-action="pick-day" data-value="${today()}">Today</button>`;
}

function openMonthPicker() {
  openSheet(`${sheetHead('Pick a day')}<div id="month-body">${monthGrid(state.ui.selectedDate || today())}</div>`, { label: 'Pick a day' });
}

// ---------------------------------------------------------------------------
// Profile: Google section
// ---------------------------------------------------------------------------
function profileGoogle() {
  let body;
  if (state.googleConnected) {
    const scopes = state.googleScopes || [];
    const missing = scopes.length && ['calendar.readonly', 'gmail.readonly'].filter((s) => !scopes.some((x) => x.endsWith(s)));
    body = `<div class="settings-row"><span class="k">Connected</span><span class="v">${esc(state.googleEmail || 'Google account')}</span></div>
      <div class="settings-row"><span class="k">Access</span><span class="v">Calendar + Gmail, read-only</span></div>
      ${missing && missing.length ? `<p class="form-msg err">Missing permission: ${esc(missing.join(', '))}. Reconnect and allow it.</p>` : ''}
      <div class="btn-row" style="margin-top:8px">
        <button class="btn" style="flex:1" data-action="connect-google">${icon('refresh', 'sm')} Reconnect</button>
        <button class="btn danger" style="flex:1" data-action="disconnect-google">Disconnect Google</button>
      </div>`;
  } else if (state.googleConnected === false) {
    body = `<p class="caption" style="margin:0 0 12px">${state.googleReconnect ? 'Google access expired.' : 'Not connected.'} Daybook reads your calendar and inbox (never sends or edits). Tokens stay on the server.</p>
      <button class="btn dark block" data-action="connect-google">${icon('google', 'sm')} ${state.googleReconnect ? 'Reconnect' : 'Connect'} Google</button>`;
  } else {
    body = `<p class="caption" style="margin:0">${navigator.onLine ? 'Checking…' : 'Offline — status unknown.'}</p>`;
  }
  return `<section class="card"><div class="card-title"><h2>Google</h2>${state.googleConnected ? '<span class="chip open">Connected</span>' : ''}</div>${body}</section>`;
}

// ---------------------------------------------------------------------------
// Actions (event delegation)
// ---------------------------------------------------------------------------
let navDepth = 0;
let suppressClick = false;

const ACTIONS = {
  'close-sheet': () => closeSheet(),
  back: (el) => { if (navDepth > 0) history.back(); else go(el.dataset.fallback || '#home'); },
  nav: (el) => go(el.dataset.href),
  'magic-link': () => handleMagicLink(),
  'sign-out': async () => {
    unsubscribeRealtime();
    clearLocal();
    if (DEMO) { location.href = '/'; return; }
    await sb.auth.signOut();
  },
  'open-add': () => openAddMenu(),
  'open-search': () => openSearch(),
  'new-task': (el) => openTaskSheet({
    projectId: el.dataset.project || (parseRoute().view === 'project' ? parseRoute().id : null),
    dueDate: el.dataset.date || (parseRoute().view === 'home' ? today() : null),
  }),
  'edit-task': (el) => openTaskSheet({ id: el.dataset.id }),
  'new-project': () => openProjectSheet(),
  'edit-project': (el) => openProjectSheet({ id: el.dataset.id }),
  'open-task': (el) => { if (!suppressClick) go(`#task/${el.dataset.id}`); },
  'toggle-task': (el) => {
    const t = findIn('tasks', el.dataset.id);
    if (t) setTaskStatus(t.id, t.status === 'done' ? 'todo' : 'done', { undo: true });
  },
  'set-status': (el) => setTaskStatus(el.dataset.id, el.dataset.value, { undo: true }),
  'task-filter': (el) => { state.ui.taskFilter = el.dataset.value; render(); },
  'project-filter': (el) => { state.ui.projectFilter = el.dataset.value; render(); },
  'project-tab': (el) => { state.ui.projectTab = el.dataset.value; render(); },
  'set-prio': (el) => {
    const form = el.closest('form');
    form.priority.value = el.dataset.value;
    $$('.prio', form).forEach((b) => { const on = b === el; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
  },
  'pick-color': (el) => {
    const form = el.closest('form');
    form.color.value = el.dataset.value;
    $$('.swatch', form).forEach((b) => b.classList.toggle('on', b === el));
  },
  'pick-status': (el) => {
    const form = el.closest('form');
    form.status.value = el.dataset.value;
    $$('.seg button', form).forEach((b) => b.classList.toggle('on', b === el));
  },
  'pick-business': (el) => { el.closest('form').business.value = el.dataset.value; },
  'add-tag': (el) => openTagInput(el),
  'remove-tag': (el) => el.closest('[data-tag]').remove(),
  delete: (el) => handleDelete(el),
  'new-note': (el) => openNoteSheet({ projectId: el.dataset.project || (parseRoute().view === 'project' ? parseRoute().id : null) }),
  'edit-note': (el) => openNoteSheet({ id: el.dataset.id }),
  'toggle-pin': (el) => { const n = findIn('notes', el.dataset.id); if (n) updateRow('notes', n.id, { pinned: !n.pinned }); },
  'note-mode': (el) => {
    const form = el.closest('form');
    const preview = el.dataset.value === 'preview';
    $$('[data-action=note-mode]', form).forEach((b) => b.classList.toggle('on', b === el));
    const pane = $('[data-preview]', form);
    pane.innerHTML = renderMarkdown(form.body.value) || '<p class="caption">Nothing to preview.</p>';
    pane.hidden = !preview;
    form.body.hidden = preview;
  },
  'toggle-switch': (el) => {
    const form = el.closest('form');
    const on = !el.classList.contains('on');
    el.classList.toggle('on', on);
    el.setAttribute('aria-checked', on);
    form[el.dataset.field].value = on ? '1' : '';
  },
  'new-file': (el) => openFileSheet({ projectId: el.dataset.project || (parseRoute().view === 'project' ? parseRoute().id : null) }),
  'edit-file': (el) => openFileSheet({ id: el.dataset.id }),
  'file-mode': (el) => {
    const form = el.closest('form');
    form.dataset.mode = el.dataset.value;
    $$('[data-action=file-mode]', form).forEach((b) => b.classList.toggle('on', b === el));
    $$('[data-mode-panel]', form).forEach((p) => { p.hidden = p.dataset.modePanel !== el.dataset.value; });
    if (el.dataset.value === 'link') form.url.focus();
  },
  'open-file': (el) => openFile(el.dataset.id),
  'connect-google': () => connectGoogle(),
  'disconnect-google': (el) => disconnectGoogle(el),
  'select-day': (el) => { state.ui.selectedDate = el.dataset.value === 'today' ? today() : el.dataset.value; render(); },
  week: (el) => { state.ui.selectedDate = addDays(state.ui.selectedDate || today(), Number(el.dataset.value)); render(); },
  'cal-filter': (el) => { state.ui.calFilter = el.dataset.value; render(); },
  'open-month': () => openMonthPicker(),
  'month-nav': (el) => { const body = $('#month-body'); if (body) body.innerHTML = monthGrid(el.dataset.value); },
  'pick-day': (el) => { state.ui.selectedDate = el.dataset.value; closeSheet(); if (parseRoute().view !== 'calendar') go('#calendar'); else render(); },
  'show-briefing': () => {
    state.ui.briefingOpen = true;
    markBriefingSeen();
    render();
    $('#briefing')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },
  'toggle-briefing': () => {
    state.ui.briefingOpen = !state.ui.briefingOpen;
    if (state.ui.briefingOpen) markBriefingSeen();
    render();
  },
  regenerate: (el) => regenerateBriefing(el),
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const fn = ACTIONS[el.dataset.action];
  if (!fn) return;
  e.preventDefault();
  e.stopPropagation();
  fn(el, e);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && $('.sheet')) { closeSheet(); return; }
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role=button][data-action]')) {
    e.preventDefault();
    e.target.click();
  }
});

const FORMS = {
  'login-form': handleLogin,
  'task-form': submitTask,
  'project-form': submitProject,
  'note-form': submitNote,
  'file-form': submitFile,
};
document.addEventListener('submit', (e) => {
  const fn = FORMS[e.target.id];
  if (!fn) return;
  e.preventDefault();
  fn(e.target);
});

window.addEventListener('hashchange', () => { navDepth += 1; closeSheet(true); render(); });

// Swipe right on a task card → toggle done (touch only).
(() => {
  let start = null; let card = null; let wrap = null; let dx = 0; let locked = null;
  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    card = e.target.closest('.task-card');
    if (!card || e.target.closest('.check')) { card = null; return; }
    wrap = card.parentElement;
    start = { x: e.clientX, y: e.clientY }; dx = 0; locked = null;
  });
  document.addEventListener('pointermove', (e) => {
    if (!card || !start) return;
    const mx = e.clientX - start.x; const my = e.clientY - start.y;
    if (locked === null && (Math.abs(mx) > 8 || Math.abs(my) > 8)) locked = Math.abs(mx) > Math.abs(my) && mx > 0 ? 'x' : 'y';
    if (locked !== 'x') return;
    dx = Math.max(0, mx);
    card.style.transition = 'none';
    card.style.transform = `translateX(${Math.min(dx, 160)}px)`;
    wrap.classList.toggle('swiping', dx > 12);
  });
  const end = () => {
    if (!card) return;
    const id = wrap.dataset.swipe; const c = card; const w = wrap; const passed = locked === 'x' && dx > 90;
    c.style.transition = ''; c.style.transform = '';
    setTimeout(() => w.classList.remove('swiping'), 180);
    if (locked === 'x') { suppressClick = true; setTimeout(() => { suppressClick = false; }, 250); }
    if (passed) {
      const t = findIn('tasks', id);
      if (t) setTaskStatus(id, t.status === 'done' ? 'todo' : 'done', { undo: true });
    }
    card = null; wrap = null; start = null;
  };
  document.addEventListener('pointerup', end);
  document.addEventListener('pointercancel', end);
})();

// Pull to refresh on Home.
(() => {
  let startY = null; let pulled = 0;
  document.addEventListener('touchstart', (e) => {
    startY = parseRoute().view === 'home' && window.scrollY <= 0 && !$('.sheet') ? e.touches[0].clientY : null;
    pulled = 0;
  }, { passive: true });
  document.addEventListener('touchmove', (e) => {
    if (startY === null) return;
    pulled = Math.max(0, e.touches[0].clientY - startY);
    const ptr = $('#ptr');
    if (!ptr) return;
    ptr.style.height = `${Math.min(pulled * 0.5, 56)}px`;
    ptr.classList.toggle('ready', pulled > 110);
  }, { passive: true });
  document.addEventListener('touchend', async () => {
    if (startY === null) return;
    const ptr = $('#ptr');
    startY = null;
    if (!ptr) return;
    if (pulled > 110) {
      ptr.classList.add('loading'); ptr.style.height = '44px';
      await refreshAll();
    }
    ptr.style.height = '0'; ptr.classList.remove('loading', 'ready');
  });
})();

async function refreshAll() {
  if (DEMO) return;
  await flushQueue();
  await loadAll();
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
function onSignedIn(user) {
  const cache = loadCache();
  if (cache && cache.user?.id !== user.id) clearLocal();
  else if (cache) applyCache(cache);
  state.user = user;
  render();
  subscribeRealtime();
  flushQueue().finally(loadAll);
}

async function boot() {
  if (DEMO) { state.user = { id: 'demo', email: 'demo@localhost' }; seedDemo(); render(); return; }
  if (!sb) { render(); return; }

  // Paint from cache immediately (also covers opening offline with an expired access token).
  const cache = loadCache();
  const { data: { session } } = await sb.auth.getSession();
  if (session?.user) onSignedIn(session.user);
  else if (cache?.user && !navigator.onLine) { applyCache(cache); state.user = cache.user; render(); }
  else render();

  sb.auth.onAuthStateChange((event, sess) => {
    if (event === 'SIGNED_OUT') {
      unsubscribeRealtime(); clearLocal(); state.user = null; render();
    } else if (sess?.user && sess.user.id !== state.user?.id) {
      onSignedIn(sess.user);
    } else if (sess?.user) {
      state.user = sess.user;
    }
  });

  const params = new URLSearchParams(location.search);
  if (params.has('google')) {
    const g = params.get('google');
    toast(g === 'connected' ? 'Google connected.' : `Google connection failed${params.get('reason') ? `: ${params.get('reason')}` : ''}.`, { error: g !== 'connected' });
    history.replaceState(null, '', location.pathname + location.hash);
  }
}

window.addEventListener('online', () => { state.ui.online = true; flushQueue().finally(loadAll); scheduleRender(); });
window.addEventListener('offline', () => { state.ui.online = false; scheduleRender(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !state.user || DEMO) return;
  scheduleRender(); // the date/greeting may have rolled over
  if (!state.loadedAt || Date.now() - state.loadedAt > 30000) refreshAll();
});

// ---------------------------------------------------------------------------
// Demo data (localhost ?demo only)
// ---------------------------------------------------------------------------
function seedDemo() {
  const d = today();
  const mk = (o) => ({ id: uuid(), user_id: 'demo', created_at: nowIso(), updated_at: nowIso(), tags: [], ...o });
  const p1 = mk({ name: 'Website refresh', business: 'Berner Studio', color: '#8B7CF6', status: 'active', description: 'New portfolio pages and case studies.', sort_order: 1 });
  const p2 = mk({ name: 'Shop quoting tool', business: 'Tolbert Sheet Fab', color: '#E9A23B', status: 'active', sort_order: 2 });
  const p3 = mk({ name: 'Home', business: 'Personal', color: '#E58BB0', status: 'active', sort_order: 3 });
  state.projects = [p1, p2, p3];
  state.tasks = [
    mk({ title: 'Send revised estimate to the Hollis job', priority: 'high', status: 'todo', due_date: d, due_time: '10:00', project_id: p2.id, tags: ['client'] }),
    mk({ title: 'Draft case study outline', priority: 'medium', status: 'in_progress', due_date: d, project_id: p1.id, tags: ['writing'] }),
    mk({ title: 'Renew truck registration', priority: 'low', status: 'todo', due_date: addDays(d, -1), project_id: p3.id }),
    mk({ title: 'Review DuctLink pricing page', priority: 'medium', status: 'done', due_date: d, completed_at: nowIso(), project_id: p1.id }),
    mk({ title: 'Call about shop insurance', priority: 'medium', status: 'todo', due_date: addDays(d, 1), due_time: '14:30', project_id: p2.id }),
    mk({ title: '<img src=x onerror=alert(1)> escaping check', priority: 'low', status: 'todo', tags: ['test'] }),
  ];
  state.notes = [
    mk({ title: 'Case study structure', body: '## Outline\n- Problem\n- **Process**\n- Result\n\nSee [the brief](https://example.com).', pinned: true, project_id: p1.id, tags: ['writing'] }),
    mk({ title: '', body: 'Gauge table for the quoting tool: 16ga, 18ga, 20ga, 22ga.', project_id: p2.id }),
    mk({ title: '<script>alert(1)</script>', body: '[bad](javascript:alert(1)) and <b>raw</b>', tags: ['test'] }),
  ];
  state.files = [
    mk({ name: 'Hollis estimate v2.pdf', kind: 'upload', storage_path: 'demo/x/est.pdf', mime: 'application/pdf', size_bytes: 284120, project_id: p2.id }),
    mk({ name: 'Brand moodboard', kind: 'link', url: 'https://www.figma.com/file/abc', project_id: p1.id, tags: ['design'] }),
  ];
  const at = (iso, hhmm) => { const [h, m] = hhmm.split(':').map(Number); return new Date(startOfDayInTz(iso, TZ).getTime() + (h * 60 + m) * 60000).toISOString(); };
  const ev = (o) => ({ id: uuid(), allDay: false, primary: true, calendarName: 'Work', htmlLink: 'https://calendar.google.com/', ...o });
  state.events = [
    ev({ title: 'Standup with shop crew', start: at(d, '08:30'), end: at(d, '08:45') }),
    ev({ title: 'Hollis site walk', start: at(d, '11:00'), end: at(d, '12:00'), location: '14 Mill Rd' }),
    ev({ title: 'Design review', start: at(d, '15:30'), end: at(d, '16:15'), meetUrl: 'https://meet.google.com/abc-defg-hij' }),
    ev({ title: 'Dinner with family', start: at(d, '18:30'), end: at(d, '20:00'), primary: false, calendarName: 'Family' }),
    ev({ title: 'Trash day', start: d, end: addDays(d, 1), allDay: true, primary: false, calendarName: 'Home' }),
    ev({ title: 'Supplier call', start: at(addDays(d, 1), '09:00'), end: at(addDays(d, 1), '09:30') }),
  ];
  state.threads = [
    { threadId: 't1', from: 'Dana Hollis', subject: 'Re: revised estimate', snippet: 'Thanks — can you confirm the gauge?', date: new Date(Date.now() - 3600e3).toISOString(), unread: true, url: 'https://mail.google.com/mail/u/0/#all/t1' },
    { threadId: 't2', from: 'Acme Steel', subject: 'Order 4471 shipping update', snippet: 'Your order ships Thursday.', date: new Date(Date.now() - 7200e3 * 5).toISOString(), unread: false, url: 'https://mail.google.com/mail/u/0/#all/t2' },
    { threadId: 't3', from: '<script>x</script>', subject: '<img src=x onerror=alert(1)>', snippet: '', date: new Date(Date.now() - 86400e3).toISOString(), unread: true, url: 'javascript:alert(1)' },
    { threadId: 't4', from: 'Priya (DuctLink)', subject: 'Pricing page notes', snippet: 'Left a few comments.', date: new Date(Date.now() - 86400e3 * 1.5).toISOString(), unread: true, url: 'https://mail.google.com/mail/u/0/#all/t4' },
  ];
  state.googleConnected = true;
  state.googleEmail = 'demo@gmail.com';
  state.briefing = {
    id: 'demo', briefing_date: d, generated_at: new Date(startOfDayInTz(d, TZ).getTime() + 392 * 60000).toISOString(),
    headline: 'The Hollis estimate is the one thing that can’t slide today',
    day_shape: 'normal', stats: { source: 'claude' },
    body_md: '## Needs you\n- **Hollis estimate** goes out by 10 — Dana asked about the gauge an hour ago.\n- Truck registration slipped past yesterday.\n\n## Already sorted\n- DuctLink pricing page reviewed.\n\n## Shape of the day\n- **Morning** — Standup, then the site walk at 11.\n- **Afternoon** — Design review at 3:30; the rest is yours.\n- **Evening** — Dinner with family at 6:30.',
  };
}

boot();
