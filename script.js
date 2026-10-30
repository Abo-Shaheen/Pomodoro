const $ = id => document.getElementById(id);
const C = 2 * Math.PI * 130, CA = 2 * Math.PI * 42;
const store = {
  get(k, d){ try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};

const el = {
  time: $('time'), sub: $('sub'), ring: $('ring'), mode: $('modeLabel'),
  start: $('startBtn'), reset: $('resetBtn'),
  focus: $('focusMin'), brk: $('breakMin'), long: $('longMin'), every: $('longEvery'), goal: $('goalHr'),
  aRing: $('aRing'), aPct: $('aPct'), aTime: $('aTime')
};

const s = {
  mode: 'focus', running: false, paused: false,
  remaining: 0, total: 0, last: 0, timer: null, cycle: 0,
  achieved: store.get('achieved', 0) // ms
};

/* ---------- Theme ---------- */
document.documentElement.dataset.theme = store.get('theme', 'dark');
$('themeBtn').onclick = () => {
  const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = t; store.set('theme', t);
};

/* ---------- Helpers ---------- */
const pad = n => String(n).padStart(2, '0');
const clampMin = (input, def, max) => Math.min(max, Math.max(1, parseInt(input.value) || def));
const every = () => Math.min(12, Math.max(2, parseInt(el.every.value) || 4));
const duration = mode => (mode === 'focus' ? clampMin(el.focus, 25, 180) : mode === 'long' ? clampMin(el.long, 15, 120) : clampMin(el.brk, 5, 60)) * 60000;

function subText(){
  if (!s.running) return 'جاهز للبدء';
  if (s.paused) return 'متوقف مؤقتاً';
  if (s.mode === 'focus') return `ركّز على مهمتك • الدورة ${s.cycle % every() + 1} من ${every()}`;
  return s.mode === 'long' ? 'استراحة طويلة، استرح جيداً' : 'خذ قسطاً من الراحة';
}

function saveTimer(){
  store.set('timer', { mode: s.mode, running: s.running, paused: s.paused, remaining: s.remaining, total: s.total, cycle: s.cycle });
}

function render(){
  const secs = Math.ceil(Math.max(0, s.remaining) / 1000);
  el.time.textContent = `${pad(Math.floor(secs / 60))}:${pad(secs % 60)}`;
  const elapsed = s.total ? 1 - s.remaining / s.total : 0;
  el.ring.style.strokeDasharray = C;
  el.ring.style.strokeDashoffset = C * (1 - Math.min(1, Math.max(0, elapsed)));
  document.title = s.running ? `${el.time.textContent} • ${s.mode === 'focus' ? 'تركيز' : 'راحة'}` : 'بومودورو | تركيز';
  renderAchieve();
}

function renderAchieve(){
  const t = Math.floor(s.achieved / 1000);
  el.aTime.textContent = `${pad(Math.floor(t / 3600))}:${pad(Math.floor(t % 3600 / 60))}:${pad(t % 60)}`;
  const goal = Math.max(0.5, parseFloat(el.goal.value) || 2) * 3600000;
  const p = Math.min(1, s.achieved / goal);
  el.aRing.style.strokeDashoffset = CA * (1 - p);
  el.aPct.textContent = Math.round(p * 100) + '%';
}

function setMode(mode, keep){
  s.mode = mode;
  if (!keep) s.total = s.remaining = duration(mode);
  document.body.classList.toggle('break', mode !== 'focus');
  el.mode.textContent = mode === 'focus' ? 'تركيز' : mode === 'long' ? 'استراحة طويلة' : 'استراحة';
  el.sub.textContent = subText();
}

/* ---------- Soft chime (Web Audio) ---------- */
let ctx;
function audio(){
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch {}
  return ctx;
}
['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, audio, { once: true }));

function chime(){
  const a = audio(); if (!a) return;
  const out = a.createGain(); out.gain.value = .55;
  const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3800;
  out.connect(lp); lp.connect(a.destination);
  const notes = [1046.5, 1318.5, 1568, 2093]; // C6 E6 G6 C7, a gentle rising arpeggio
  [0, 2.4].forEach((pass, p) => {
    notes.forEach((f, i) => {
      const t0 = a.currentTime + .05 + pass + i * .2, peak = (p ? .16 : .24) * (1 - i * .08);
      [[f, 1], [f * 2, .12]].forEach(([fr, v]) => {
        const o = a.createOscillator(), g = a.createGain();
        o.type = 'sine'; o.frequency.value = fr;
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(peak * v, t0 + .03);
        g.gain.exponentialRampToValueAtTime(.0008, t0 + 2);
        o.connect(g); g.connect(out); o.start(t0); o.stop(t0 + 2.1);
      });
    });
  });
}

/* ---------- Timer ---------- */
function tick(){
  if (!s.running || s.paused) return;
  const now = Date.now(), d = now - s.last; s.last = now;
  s.remaining -= d;
  if (s.mode === 'focus') { s.achieved += Math.min(d, 65000); store.set('achieved', s.achieved); }
  if (s.remaining <= 0){
    chime();
    if (s.mode === 'focus') { s.cycle++; setMode(s.cycle % every() === 0 ? 'long' : 'break'); }
    else setMode('focus'); // endless loop
  }
  render(); saveTimer();
}

function run(){
  clearInterval(s.timer);
  s.last = Date.now();
  s.timer = setInterval(tick, 200);
}

function start(){
  audio();
  s.running = true; s.paused = false; s.cycle = 0;
  setMode('focus');
  run(); ui(); render(); saveTimer();
}

function togglePause(){
  s.paused = !s.paused;
  if (!s.paused) s.last = Date.now(); // paused time is never counted
  ui(); render(); saveTimer();
}

function fullReset(){
  clearInterval(s.timer);
  s.running = false; s.paused = false; s.cycle = 0;
  setMode('focus');
  ui(); render(); saveTimer();
}

function ui(){
  const b = el.start;
  if (!s.running) { b.textContent = 'بدء'; b.className = 'main-btn go'; }
  else if (s.paused) { b.textContent = 'استئناف'; b.className = 'main-btn go'; }
  else { b.textContent = 'إيقاف مؤقت'; b.className = 'main-btn stop'; }
  el.sub.textContent = subText();
}

el.start.onclick = () => s.running ? togglePause() : start();
el.reset.onclick = fullReset;

/* ---------- Settings ---------- */
const settingInputs = [[el.focus, 'focusMin', 25], [el.brk, 'breakMin', 5], [el.long, 'longMin', 15], [el.every, 'longEvery', 4], [el.goal, 'goalHr', 2]];
settingInputs.forEach(([inp, key, def]) => inp.value = store.get(key, def));

[el.focus, el.brk, el.long, el.every].forEach(i => {
  i.addEventListener('input', () => store.set(settingInputs.find(x => x[0] === i)[1], i.value));
  i.addEventListener('change', () => {
    const m = i === el.focus ? 'focus' : i === el.brk ? 'break' : i === el.long ? 'long' : null;
    if (!s.running) setMode('focus');
    else if (m && m === s.mode) { // changing the active period's length applies now
      const d = duration(s.mode); s.remaining = Math.max(0, s.remaining + d - s.total); s.total = d;
    }
    render(); saveTimer();
  });
});
el.goal.addEventListener('input', () => { store.set('goalHr', el.goal.value); renderAchieve(); });
$('aReset').onclick = () => { s.achieved = 0; store.set('achieved', 0); renderAchieve(); };

/* ---------- Todo ---------- */
let todos = store.get('todos', []);
function renderTodos(){
  const ul = $('todoList'); ul.innerHTML = '';
  $('empty').style.display = todos.length ? 'none' : 'block';
  todos.forEach((t, i) => {
    const li = document.createElement('li'); if (t.done) li.className = 'done';
    const c = document.createElement('input'); c.type = 'checkbox'; c.className = 'chk'; c.checked = t.done;
    c.onchange = () => { t.done = c.checked; store.set('todos', todos); renderTodos(); };
    const sp = document.createElement('span'); sp.textContent = t.text;
    const d = document.createElement('button'); d.className = 'del'; d.textContent = '×'; d.setAttribute('aria-label', 'حذف');
    d.onclick = () => { todos.splice(i, 1); store.set('todos', todos); renderTodos(); };
    li.append(c, sp, d); ul.append(li);
  });
}
function addTodo(){
  const v = $('todoInput').value.trim(); if (!v) return;
  todos.unshift({ text: v, done: false }); store.set('todos', todos);
  $('todoInput').value = ''; renderTodos();
}
$('addBtn').onclick = addTodo;
$('todoInput').addEventListener('keydown', e => { if (e.key === 'Enter') addTodo(); });

/* ---------- Restore saved state ---------- */
const saved = store.get('timer', null);
if (saved && ['focus', 'break', 'long'].includes(saved.mode) && saved.total > 0 && saved.remaining >= 0 && saved.remaining <= saved.total) {
  s.mode = saved.mode; s.total = saved.total; s.remaining = saved.remaining;
  s.cycle = saved.cycle || 0; s.running = !!saved.running; s.paused = !!saved.paused;
  setMode(s.mode, true);
  if (s.running) run(); // continues from the exact point it was left at
} else {
  setMode('focus');
}
ui(); render(); renderTodos();

// save the exact position when the tab is closed or hidden
const flush = () => { tick(); saveTimer(); };
window.addEventListener('pagehide', flush);
document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
