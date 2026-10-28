/* Tarefas: interface web da API (JavaScript puro, sem etapa de build).
 *
 * 1. Utilitários (DOM, ícones, datas)
 * 2. Cliente da API, sessão e tema
 * 3. Tela de entrada (com uma prévia do quadro)
 * 4. App: índice lateral, cabeçalho, quadro, lista em forma de caderno, ficha da tarefa
 *
 * Todo texto vindo da API entra no DOM como texto (nunca innerHTML), o que impede XSS.
 */
"use strict";

/* ===================== 1. Utilitários ===================== */

function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "class") el.className = value;
    else if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value === true) el.setAttribute(key, "");
    else el.setAttribute(key, value);
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : String(child));
  }
  return el;
}

function fill(el, ...children) {
  el.replaceChildren(...children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false));
}

const ICONS = {
  inbox: '<path d="M4 13l2.5-7h11L20 13v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M4 13h4.5l1 2h5l1-2H20"/>',
  today: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/><circle cx="12" cy="15" r="1.6" fill="currentColor"/>',
  week: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4M8 14h2M12 14h2M16 14h0M8 17h2M12 17h2"/>',
  late: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  done: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.3l2.4 2.4 4.6-4.9"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
  board: '<rect x="3.5" y="4" width="5" height="16" rx="1.5"/><rect x="9.5" y="4" width="5" height="11" rx="1.5"/><rect x="15.5" y="4" width="5" height="7" rx="1.5"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4-4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  moon: '<path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l2.5 1.5"/>',
  flag: '<path d="M6 21V4M6 4h11l-2 4 2 4H6"/>',
  logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 17l-5-5 5-5M5 12h11"/>',
  keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
  code: '<path d="M8 8l-4 4 4 4M16 8l4 4-4 4"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>',
};

function icon(name) {
  const wrap = document.createElement("span");
  wrap.setAttribute("aria-hidden", "true");
  wrap.style.display = "contents";
  // Conteúdo fixo, definido acima: nunca dados do usuário.
  wrap.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
  return wrap;
}

const pad = (n) => String(n).padStart(2, "0");
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function fromISO(value) {
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}
function addDays(date, n) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + n);
  return copy;
}
function today() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
const daysBetween = (a, b) => Math.round((b - a) / 86400000);
const WEEKDAYS_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const longDate = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" });
const dateTime = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const capitalize = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** Como o prazo aparece: "Hoje", "Amanhã", "sex, 30/10", "Atrasada há 2 dias". */
function dueLabel(iso, done = false) {
  if (!iso) return null;
  const due = fromISO(iso);
  const diff = daysBetween(today(), due);
  if (diff < 0 && !done) return { text: diff === -1 ? "Ontem" : `Há ${-diff} dias`, kind: "late" };
  if (diff === 0) return { text: "Hoje", kind: "today" };
  if (diff === 1) return { text: "Amanhã", kind: "" };
  const short = `${pad(due.getDate())}/${pad(due.getMonth() + 1)}`;
  if (diff > 1 && diff < 7) return { text: `${capitalize(WEEKDAYS_SHORT[due.getDay()])}, ${short}`, kind: "" };
  const year = due.getFullYear() !== today().getFullYear() ? `/${due.getFullYear()}` : "";
  return { text: short + year, kind: "" };
}

const PRIORITY_LABEL = { alta: "Alta", media: "Média", baixa: "Baixa" };

/* ===================== 2. API, sessão e tema ===================== */

class ApiError extends Error {
  constructor(status, message, errors = []) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

const store = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch { /* navegação privada: vale só nesta aba */ }
  },
};

let token = store.get("tarefas.token");

async function request(method, path, { json, form } = {}) {
  const headers = { Accept: "application/json" };
  let body;
  if (json !== undefined) { headers["Content-Type"] = "application/json"; body = JSON.stringify(json); }
  if (form) body = new URLSearchParams(form);
  if (token) headers.Authorization = `Bearer ${token}`;
  let response;
  try {
    response = await fetch(path, { method, headers, body });
  } catch {
    throw new ApiError(0, "Sem conexão com o servidor. Verifique a internet e tente de novo.");
  }
  if (response.status === 204) return null;
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && token && path !== "/auth/token") {
      logout();
      toast("Sua sessão expirou. Entre novamente.", { tone: "error" });
    }
    const detail = data?.errors?.length ? data.errors.map((e) => e.message).join(" ") : data?.detail;
    throw new ApiError(response.status, detail || "Algo deu errado. Tente de novo.", data?.errors || []);
  }
  return data;
}

const api = {
  get(path, params) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params || {})) {
      if (Array.isArray(v)) v.forEach((x) => qs.append(k, x));
      else if (v !== undefined && v !== null && v !== "") qs.set(k, v);
    }
    const s = qs.toString();
    return request("GET", s ? `${path}?${s}` : path);
  },
  post: (path, json) => request("POST", path, { json }),
  patch: (path, json) => request("PATCH", path, { json }),
  del: (path) => request("DELETE", path),
  login: (email, password) => request("POST", "/auth/token", { form: { username: email, password } }),
};

const DEMO = { email: "demo@tarefas.dev", password: "demo12345" };

const state = {
  user: null,
  view: "inbox",
  mode: "board", // ao entrar, o quadro dá a visão geral; a lista é a segunda opção
  tag: null,
  q: "",
  tasks: [],
  stats: null,
  tags: [],
  highlight: null,
};

async function login(email, password) {
  const { access_token: newToken } = await api.login(email, password);
  token = newToken;
  store.set("tarefas.token", newToken);
  state.user = await api.get("/auth/me");
  renderApp();
}

function logout() {
  token = null;
  store.set("tarefas.token", null);
  Object.assign(state, { user: null, tag: null, q: "", tasks: [], stats: null, tags: [] });
  document.onkeydown = null;
  renderAuth();
}

const isDark = () => document.documentElement.dataset.theme === "dark";
function toggleTheme() {
  const next = isDark() ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  store.set("tarefas.theme", next);
  document.querySelectorAll("[data-theme-btn]").forEach((btn) => { btn.textContent = themeLabel(); });
}

function toast(message, { tone = "ok", action } = {}) {
  const el = h("div", { class: `toast${tone === "error" ? " toast--error" : ""}`, role: tone === "error" ? "alert" : "status" },
    h("span", null, message),
    action && h("button", { class: "link-btn", type: "button", onclick: () => { el.remove(); action.run(); } }, action.label));
  document.getElementById("toasts").append(el);
  setTimeout(() => el.remove(), action ? 6000 : 3500);
}

/* ===================== 3. Entrada ===================== */

const root = () => document.getElementById("root");

/** Números por extenso até dez: "uma tarefa", "duas para hoje". Lê melhor que dígitos numa frase. */
const WORDS = ["nenhuma", "uma", "duas", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez"];
const word = (n) => WORDS[n] ?? String(n);

function themeLabel() {
  return isDark() ? "Tema claro" : "Tema escuro";
}

function renderAuth(mode = "login") {
  document.title = "Entrar | Tarefas";
  const isLogin = mode === "login";
  const error = h("p", { class: "error", role: "alert" });

  const DEMO_LABEL = "Entrar na demonstração";
  const demo = h("button", { class: "btn btn--primary auth__big", type: "button" }, DEMO_LABEL);
  demo.addEventListener("click", async () => {
    demo.disabled = true;
    demo.textContent = "Abrindo…";
    try {
      await login(DEMO.email, DEMO.password);
    } catch (err) {
      error.textContent = err.message;
      demo.disabled = false;
      demo.textContent = DEMO_LABEL;
    }
  });

  const input = (label, attrs) => h("label", null, h("span", { class: "auth__label" }, label), h("input", { class: "input auth__input", required: true, ...attrs }));
  const form = h("form", { class: "form auth__fields", novalidate: true },
    !isLogin && input("Como quer ser chamado", { name: "name", autocomplete: "name" }),
    input("E-mail", { name: "email", type: "email", autocomplete: "email" }),
    input("Senha", { name: "password", type: "password", autocomplete: isLogin ? "current-password" : "new-password" }),
    !isLogin && h("p", { class: "auth__note" }, "A senha precisa de pelo menos 8 caracteres."),
    error,
    // No login, o destaque é da demonstração; o botão da conta fica discreto, como no modelo.
    h("button", { class: `btn auth__big ${isLogin ? "btn--plain auth__soft" : "btn--primary"}`, type: "submit" }, isLogin ? "Entrar" : "Criar a conta"));

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const v = Object.fromEntries(new FormData(form));
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    error.textContent = "";
    try {
      if (!isLogin) await api.post("/auth/register", { name: v.name.trim(), email: v.email.trim(), password: v.password });
      await login(v.email.trim(), v.password);
    } catch (err) {
      error.textContent = err.message;
      submit.disabled = false;
    }
  });

  const tab = (name, label) => h("button", {
    class: "auth__tab", type: "button", role: "tab", "aria-selected": String(mode === name),
    onclick: () => mode !== name && renderAuth(name),
  }, label);
  const tabs = h("div", { class: "auth__tabs", role: "tablist" }, tab("login", "Entrar"), tab("register", "Criar conta"));

  const themeBtn = h("button", { class: "text-btn", type: "button", "data-theme-btn": true, onclick: toggleTheme }, themeLabel());

  fill(root(), h("div", { class: "auth" },
    h("main", { class: "auth__left" },
      h("div", { class: "auth__top" },
        h("span", { class: "wordmark" }, h("img", { src: "/static/icon.svg", alt: "" }), "Tarefas"), themeBtn),
      h("div", { class: "auth__form" },
        h("h1", { class: "auth__title" }, isLogin ? "Entrar na sua conta" : "Criar sua conta"),
        tabs,
        isLogin && h("div", { class: "auth__demo" },
          demo,
          h("p", { class: "auth__note" }, "Acesso imediato, sem cadastro, a uma conta de exemplo com tarefas no quadro, prazos e etiquetas.")),
        isLogin && h("div", { class: "auth__or" }, h("span", null, "ou entre com a sua conta")),
        form),
      h("p", { class: "auth__foot" }, "Feito por Luis Gustavo Prata. É também uma API REST: ", h("a", { href: "/docs" }, "documentação"), ".")),
    h("section", { class: "auth__right", "aria-label": "Sobre o site" },
      h("p", { class: "auth__slogan" }, "Organize o seu dia,", h("br"), "uma tarefa de cada vez."))));
}

/* ===================== 4. App ===================== */

const VIEWS = {
  inbox: { label: "A fazer", params: () => ({ status: ["pendente", "em_andamento"] }) },
  today: { label: "Hoje", params: () => ({ status: ["pendente", "em_andamento"], due_to: toISO(today()) }) },
  week: {
    label: "Esta semana",
    params: () => ({ status: ["pendente", "em_andamento"], due_from: toISO(today()), due_to: toISO(addDays(today(), 7)) }),
  },
  late: { label: "Atrasadas", params: () => ({ overdue: "true" }) },
  done: { label: "Feitas", params: () => ({ status: ["concluida"] }), sort: "-created_at" },
};

const LANES = [["pendente", "Pendente"], ["em_andamento", "Em andamento"], ["concluida", "Feita"]];

let els = {};

function renderApp() {
  Object.assign(state, { mode: "board", view: "inbox" });
  document.title = "Tarefas";
  const app = h("div", { class: "app" });
  const scrim = h("div", { class: "scrim", hidden: true });
  const closeMenu = () => { app.classList.remove("menu-open"); scrim.hidden = true; };
  scrim.addEventListener("click", closeMenu);
  els.closeMenu = closeMenu;

  /* Menu lateral: só texto, como um índice */
  els.views = h("nav", { class: "views", "aria-label": "Visões" });
  els.tally = h("div");
  const themeBtn = h("button", { class: "text-btn", type: "button", "data-theme-btn": true, onclick: toggleTheme }, themeLabel());
  const side = h("aside", { class: "side", id: "menu" },
    h("span", { class: "wordmark" }, h("img", { src: "/static/icon.svg", alt: "" }), "Tarefas"),
    els.views,
    h("div", { class: "side__foot" },
      els.tally,
      h("p", null, state.user.name),
      h("div", { class: "side__links" },
        h("button", { class: "text-btn", type: "button", onclick: openShortcuts }, "Atalhos"),
        themeBtn,
        h("a", { class: "text-btn", href: "/docs", target: "_blank", rel: "noopener" }, "API"),
        h("button", { class: "text-btn", type: "button", onclick: logout }, "Sair"))));

  /* Cabeçalho */
  els.title = h("h1", { tabindex: "-1" });
  els.line = h("p", { class: "head__line" });
  els.modes = h("div", { class: "modes", role: "group", "aria-label": "Forma de ver" });

  /* Adicionar: abre a ficha em branco, onde se escolhe prazo, prioridade e etiquetas */
  const add = h("button", { class: "btn btn--primary add-btn", type: "button", onclick: () => openDrawer() },
    h("span", { "aria-hidden": "true" }, "+"), "Adicionar");
  els.add = add;

  /* Busca e filtros */
  const search = h("input", { class: "search", type: "search", placeholder: "Procurar…", "aria-label": "Procurar tarefas", value: state.q });
  let timer;
  search.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => { state.q = search.value.trim(); drawChrome(); loadTasks(); }, 250);
  });
  els.search = search;
  els.filters = h("div", { class: "filters" });
  els.tagPicker = h("div", { class: "picker" });
  els.content = h("section", { "aria-live": "polite" });

  fill(app, side, scrim,
    h("main", { class: "main" }, h("div", { class: "page" },
      h("header", { class: "head" },
        h("button", { class: "head__menu", type: "button", "aria-controls": "menu",
          onclick: () => { app.classList.add("menu-open"); scrim.hidden = false; } }, "Menu"),
        h("div", { class: "head__title" }, els.title, h("span", { class: "head__date" }, longDate.format(new Date()))),
        els.modes,
        els.line),
      h("div", { class: "tools" }, h("div", { class: "tools__left" }, add, search, els.tagPicker), els.filters),
      els.content)));
  fill(root(), app);

  document.onkeydown = (event) => {
    if (event.target.closest("input, textarea, select, dialog") || event.metaKey || event.ctrlKey || event.altKey) return;
    const keys = {
      n: () => openDrawer(), "/": () => search.focus(), b: () => setMode(state.mode === "board" ? "list" : "board"), "?": openShortcuts,
      1: () => setView("inbox"), 2: () => setView("today"), 3: () => setView("week"), 4: () => setView("late"), 5: () => setView("done"),
    };
    if (keys[event.key]) { event.preventDefault(); keys[event.key](); }
  };

  drawChrome();
  refresh();
  add.focus();
}

function setView(view) {
  state.view = view;
  if (view === "done" && state.mode === "board") state.mode = "list";
  els.closeMenu?.();
  drawChrome();
  loadTasks();
}

function setMode(mode) {
  state.mode = mode;
  drawChrome();
  loadTasks();
}

function setTag(tag) {
  state.tag = state.tag === tag ? null : tag;
  els.closeMenu?.();
  drawChrome();
  loadTasks();
}

/** A frase do cabeçalho, escrita como alguém diria. */
function summary(s) {
  if (!s) return [];
  const open = s.total - s.by_status.concluida;
  const late = s.overdue;
  const due = s.due_today;
  const lateText = h("span", { class: "late" }, `${capitalize(word(late))} ${late === 1 ? "tarefa atrasada" : "tarefas atrasadas"}`);
  if (!open) return ["Nada pendente. Quando lembrar de algo, é só clicar em Adicionar."];
  if (late && due) return [lateText, ` e ${word(due)} para hoje.`];
  if (late) return [lateText, ". O resto está em dia."];
  if (due) return [`${capitalize(word(due))} para hoje, ${word(open)} em aberto no total.`];
  return [`Nada vence hoje. ${capitalize(word(open))} em aberto.`];
}

function drawChrome() {
  const s = state.stats;
  const counts = s && {
    inbox: s.total - s.by_status.concluida, today: s.due_today + s.overdue, week: null,
    late: s.overdue, done: s.by_status.concluida,
  };
  fill(els.views, Object.entries(VIEWS).map(([key, view]) => h("button", {
    // No quadro, as visões filtram as colunas; "Feitas" abre a lista.
    class: "view", type: "button", "aria-current": String(state.view === key), onclick: () => setView(key),
  }, h("span", null, view.label),
    counts && counts[key] ? h("span", { class: `view__n${key === "late" ? " view__n--late" : ""}` }, counts[key]) : null)));

  drawTagPicker();

  if (s) {
    const percent = Math.round(s.completion_rate * 100);
    fill(els.tally,
      h("p", null, `${capitalize(word(s.by_status.concluida))} de ${s.total} feitas`),
      h("div", { class: "tally__bar", role: "progressbar", "aria-valuenow": percent, "aria-valuemin": 0, "aria-valuemax": 100, "aria-label": "Tarefas feitas" },
        h("span", { style: `width:${percent}%` })));
  }

  els.title.textContent = state.mode === "board" ? "Quadro" : VIEWS[state.view].label;
  fill(els.line, summary(s));
  fill(els.modes, [["board", "Quadro"], ["list", "Lista"]].map(([mode, label]) => h("button", {
    type: "button", "aria-pressed": String(state.mode === mode), onclick: () => setMode(mode),
  }, label)));

  const clear = (fn) => h("button", { class: "text-btn", type: "button", onclick: fn }, "limpar");
  fill(els.filters,
    state.mode === "board" && state.view !== "inbox" && h("span", null, "Só ", h("b", null, VIEWS[state.view].label.toLowerCase()), " ", clear(() => setView("inbox"))),
    state.tag && h("span", null, "Só ", h("b", null, `#${state.tag}`), " ", clear(() => setTag(state.tag))),
    state.q && h("span", null, "Com ", h("b", null, `“${state.q}”`), " ", clear(() => { state.q = ""; els.search.value = ""; drawChrome(); loadTasks(); })));
}

/** Botão "Etiquetas" ao lado da busca: abre a lista com todas as etiquetas num só lugar. */
function drawTagPicker() {
  const wasOpen = els.tagPicker.querySelector(".picker__panel:not([hidden])") !== null;
  const button = h("button", {
    class: `picker__btn${state.tag ? " is-active" : ""}`, type: "button",
    "aria-haspopup": "true", "aria-expanded": String(wasOpen), "aria-controls": "tag-panel",
  }, state.tag ? `#${state.tag}` : "Etiquetas", h("span", { class: "picker__caret", "aria-hidden": "true" }, "▾"));
  const panel = h("div", { class: "picker__panel", id: "tag-panel", role: "menu", hidden: !wasOpen });

  const toggle = (open) => {
    panel.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
    if (open) panel.querySelector("button")?.focus();
  };
  button.addEventListener("click", () => toggle(panel.hidden));
  panel.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { toggle(false); button.focus(); }
  });

  const option = (label, count, active, onPick) => h("button", {
    class: "picker__item", type: "button", role: "menuitemradio", "aria-checked": String(active),
    onclick: () => { toggle(false); onPick(); },
  }, h("span", null, label), count !== null && h("span", { class: "picker__n" }, count));

  fill(panel, state.tags.length
    ? [
      option("Todas as etiquetas", null, !state.tag, () => { if (state.tag) setTag(state.tag); }),
      state.tags.map((t) => option(`#${t.name}`, t.tasks, state.tag === t.name, () => { if (state.tag !== t.name) setTag(t.name); })),
    ]
    : h("p", { class: "picker__empty" }, "Nenhuma etiqueta ainda. Coloque etiquetas ao adicionar ou editar uma tarefa."));
  fill(els.tagPicker, button, panel);
}

// Fecha a lista de etiquetas ao clicar fora dela.
document.addEventListener("click", (event) => {
  const picker = els.tagPicker;
  if (!picker || picker.contains(event.target)) return;
  const panel = picker.querySelector(".picker__panel");
  if (panel && !panel.hidden) {
    panel.hidden = true;
    picker.querySelector(".picker__btn")?.setAttribute("aria-expanded", "false");
  }
});

async function refresh() {
  await Promise.all([loadTasks(), loadSide()]);
}

async function loadSide() {
  try {
    [state.stats, state.tags] = await Promise.all([api.get("/tasks/stats"), api.get("/tags")]);
    drawChrome();
  } catch { /* a área principal mostra o erro */ }
}

let loadSeq = 0;
async function loadTasks() {
  const seq = ++loadSeq;
  if (!state.tasks.length) fill(els.content, h("p", { class: "quiet" }, "Carregando…"));
  const view = VIEWS[state.view];
  const params = view.params();
  if (state.mode === "board") delete params.status; // o quadro mostra todas as situações
  try {
    const all = [];
    for (let offset = 0; ; offset += 100) {
      const page = await api.get("/tasks", {
        ...params, tag: state.tag, q: state.q, sort: state.mode === "board" ? "-priority" : view.sort || "due_date", limit: 100, offset,
      });
      all.push(...page.items);
      if (all.length >= page.total || !page.items.length) break;
    }
    if (seq !== loadSeq) return;
    state.tasks = all;
    if (state.mode === "board") drawBoard();
    else drawList();
    state.highlight = null;
  } catch (err) {
    if (err.status !== 401) fill(els.content, h("div", { class: "quiet" }, h("strong", null, "Não deu para carregar"), err.message));
  }
}

/* ---------- Lista ---------- */

function groupTasks(tasks) {
  if (state.view === "done") return [["Feitas", tasks, ""]];
  const t0 = today();
  const b = { late: [], today: [], tomorrow: [], week: [], later: [], none: [] };
  for (const task of tasks) {
    if (!task.due_date) { b.none.push(task); continue; }
    const diff = daysBetween(t0, fromISO(task.due_date));
    if (task.overdue || diff < 0) b.late.push(task);
    else if (diff === 0) b.today.push(task);
    else if (diff === 1) b.tomorrow.push(task);
    else if (diff < 7) b.week.push(task);
    else b.later.push(task);
  }
  return [
    ["Atrasadas", b.late, "late"], ["Hoje", b.today, ""], ["Amanhã", b.tomorrow, ""],
    ["Esta semana", b.week, ""], ["Mais pra frente", b.later, ""], ["Sem prazo", b.none, ""],
  ].filter(([, items]) => items.length);
}

const QUIET = {
  inbox: ["Nada pendente", "Quando lembrar de algo, é só clicar em Adicionar."],
  today: ["Nada para hoje", "Tarefas com prazo para hoje aparecem aqui."],
  week: ["Semana livre", "Nenhuma tarefa vence nos próximos sete dias."],
  late: ["Nada atrasado", "Tudo o que tem prazo está em dia."],
  done: ["Nada feito ainda", "Marque o círculo de uma tarefa quando terminar."],
};

function drawList() {
  if (!state.tasks.length) {
    const [title, text] = state.tag || state.q ? ["Nada encontrado", "Tente outra palavra ou limpe o filtro."] : QUIET[state.view];
    fill(els.content, h("div", { class: "quiet" }, h("strong", null, title), text));
    return;
  }
  fill(els.content, h("div", { class: "sheet-list" }, groupTasks(state.tasks).map(([label, items, kind]) =>
    h("section", { class: `block${kind ? ` block--${kind}` : ""}`, "aria-label": label },
      h("h2", { class: "block__label" }, label, h("span", null, `${items.length} ${items.length === 1 ? "tarefa" : "tarefas"}`)),
      h("div", { class: "block__items" }, items.map(taskRow))))));
}

function metaLine(task, { status = true } = {}) {
  const done = task.status === "concluida";
  const parts = [
    status && task.status === "em_andamento" && h("span", null, "em andamento"),
    !done && task.priority === "alta" && h("span", { class: "hi" }, "prioridade alta"),
    !done && task.priority === "baixa" && h("span", null, "pode esperar"),
    task.tags.map((t) => h("span", { class: "tag" }, `#${t}`)),
  ].flat().filter(Boolean);
  return parts.length ? h("span", { class: "task__meta" }, parts) : null;
}

function taskRow(task) {
  const done = task.status === "concluida";
  const due = dueLabel(task.due_date, done);
  const row = h("article", { class: `task${done ? " is-done" : ""}${state.highlight === task.id ? " is-new" : ""}`, "data-priority": task.priority });
  const dot = h("button", {
    class: `dot${done ? " dot--done" : task.status === "em_andamento" ? " dot--doing" : ""}`, type: "button",
    "aria-label": done ? `Desmarcar: ${task.title}` : `Marcar como feita: ${task.title}`,
    onclick: () => toggleDone(task, row, dot),
  }, icon("check"));
  fill(row, dot,
    h("button", { class: "task__body", type: "button", onclick: () => openDrawer(task) },
      h("span", { class: "task__title" }, task.title),
      task.description && h("span", { class: "task__note" }, task.description),
      metaLine(task)),
    due && h("span", { class: `task__due${due.kind ? ` task__due--${due.kind}` : ""}` }, due.text.toLowerCase()));
  return row;
}

async function toggleDone(task, row, dot) {
  const next = task.status === "concluida" ? "pendente" : "concluida";
  dot.disabled = true;
  if (next === "concluida") dot.className = "dot dot--done";
  try {
    await api.patch(`/tasks/${task.id}`, { status: next });
    const leaves = (next === "concluida") !== (state.view === "done");
    if (leaves) {
      row.classList.add("is-leaving");
      await new Promise((r) => setTimeout(r, 260));
    }
    await refresh();
    if (next === "concluida") {
      toast("Feita.", { action: { label: "Desfazer", run: async () => {
        await api.patch(`/tasks/${task.id}`, { status: task.status });
        refresh();
      } } });
    }
  } catch (err) {
    dot.disabled = false;
    toast(err.message, { tone: "error" });
  }
}

/* ---------- Quadro: arrastar entre colunas muda a situação ---------- */

function drawBoard() {
  const by = Object.fromEntries(LANES.map(([s]) => [s, []]));
  for (const task of state.tasks) by[task.status].push(task);

  fill(els.content, h("div", { class: "board" }, LANES.map(([status, label]) => {
    const items = status === "concluida" ? by[status].slice(0, 20) : by[status];
    const lane = h("section", { class: "lane", "data-status": status, "aria-label": label },
      h("div", { class: "lane__head" }, h("h2", { class: "lane__title" }, label), h("span", { class: "lane__n" }, by[status].length)),
      h("div", { class: "lane__body" }, items.length ? items.map(boardNote) : h("p", { class: "lane__empty" }, "Arraste uma tarefa para cá.")));

    lane.addEventListener("dragover", (event) => { event.preventDefault(); lane.classList.add("is-over"); });
    lane.addEventListener("dragleave", (event) => { if (!lane.contains(event.relatedTarget)) lane.classList.remove("is-over"); });
    lane.addEventListener("drop", async (event) => {
      event.preventDefault();
      lane.classList.remove("is-over");
      const id = Number(event.dataTransfer.getData("text/plain"));
      const task = state.tasks.find((t) => t.id === id);
      if (!task || task.status === status) return;
      task.status = status;
      drawBoard();
      try {
        await api.patch(`/tasks/${id}`, { status });
        await refresh();
        toast(`Movida para “${label}”.`);
      } catch (err) {
        toast(err.message, { tone: "error" });
        refresh();
      }
    });
    return lane;
  })));
}

function boardNote(task) {
  const done = task.status === "concluida";
  const due = dueLabel(task.due_date, done);
  const meta = metaLine(task, { status: false });
  if (due && meta) meta.prepend(h("span", { class: due.kind === "late" ? "late" : null }, due.text.toLowerCase()));
  const note = h("button", {
    class: `note${done ? " is-done" : ""}`, type: "button", draggable: "true", "data-priority": task.priority,
    onclick: () => openDrawer(task),
  },
    h("span", { class: "note__pip", "aria-hidden": "true" }),
    h("span", { class: "note__title" }, task.title),
    meta || (due && h("span", { class: "task__meta" }, h("span", { class: due.kind === "late" ? "late" : null }, due.text.toLowerCase()))));
  note.addEventListener("dragstart", (event) => {
    event.dataTransfer.setData("text/plain", String(task.id));
    event.dataTransfer.effectAllowed = "move";
    note.classList.add("is-dragging");
  });
  note.addEventListener("dragend", () => note.classList.remove("is-dragging"));
  return note;
}

/* ---------- Ficha da tarefa ---------- */

const fullDate = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

/** Ficha da tarefa. Sem argumento, abre em branco para adicionar uma tarefa nova. */
function openDrawer(task = null) {
  const isNew = task === null;
  if (isNew) {
    // Começa com o que faz sentido para a tela atual: prazo de hoje na visão "Hoje", etiqueta do filtro.
    task = {
      title: "", description: null, status: "pendente", priority: "media", tags: state.tag ? [state.tag] : [],
      due_date: state.view === "today" ? toISO(today()) : null,
    };
  }
  const dialog = h("dialog", { class: "drawer", "aria-label": isNew ? "Nova tarefa" : "Tarefa" });
  const close = () => dialog.close();
  dialog.addEventListener("close", () => dialog.remove());
  dialog.addEventListener("click", (event) => { if (event.target === dialog) close(); });

  const select = (name, options, value) => h("select", { name },
    options.map(([v, label]) => h("option", { value: v, selected: v === value }, label)));
  const prop = (label, control) => h("div", { class: "prop" }, h("dt", null, label), h("dd", null, control));

  // Título em área de texto para quebrar linha em títulos longos; Enter salva em vez de pular linha.
  const title = h("textarea", {
    class: "drawer__title", name: "title", rows: "1", maxlength: "120", "aria-label": "Título",
    placeholder: "Título da tarefa",
  });
  title.value = task.title;
  // A altura acompanha o texto (soma a borda de baixo, que o scrollHeight não inclui).
  const fit = () => {
    title.style.height = "auto";
    title.style.height = `${title.scrollHeight + (title.offsetHeight - title.clientHeight)}px`;
  };
  title.addEventListener("input", fit);
  title.addEventListener("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); title.form.requestSubmit(); }
  });
  const notes = h("textarea", { name: "description", maxlength: "2000", id: "notes", placeholder: "Links, telefones, o que já foi feito…" });
  notes.value = task.description || "";
  const error = h("p", { class: "error", role: "alert" });

  const remove = isNew
    ? h("button", { class: "btn btn--plain", type: "button", onclick: () => dialog.close() }, "Cancelar")
    : h("button", { class: "btn btn--danger", type: "button" }, "Excluir tarefa");
  let confirmTimer;
  if (!isNew) remove.addEventListener("click", async () => {
    if (!remove.classList.contains("is-confirming")) {
      remove.classList.add("is-confirming");
      remove.textContent = "Excluir mesmo?";
      confirmTimer = setTimeout(() => { remove.classList.remove("is-confirming"); remove.textContent = "Excluir tarefa"; }, 4000);
      return;
    }
    clearTimeout(confirmTimer);
    try {
      await api.del(`/tasks/${task.id}`);
      close();
      await refresh();
      toast("Excluída.", { action: { label: "Desfazer", run: async () => {
        const { id, overdue, created_at, updated_at, completed_at, ...data } = task;
        await api.post("/tasks", data);
        refresh();
      } } });
    } catch (err) {
      error.textContent = err.message;
    }
  });

  const save = h("button", { class: "btn btn--primary", type: "submit" }, isNew ? "Adicionar" : "Salvar");
  const form = h("form", { novalidate: true },
    h("div", { class: "drawer__top" },
      h("span", null, isNew ? "Nova tarefa" : `Tarefa nº ${task.id}`),
      h("button", { class: "drawer__close", type: "button", onclick: close }, "Fechar")),
    h("div", { class: "drawer__body" },
      title,
      h("dl", { class: "props" },
        prop("Situação", select("status", [["pendente", "Pendente"], ["em_andamento", "Em andamento"], ["concluida", "Feita"]], task.status)),
        prop("Prioridade", select("priority", [["alta", "Alta"], ["media", "Normal"], ["baixa", "Pode esperar"]], task.priority)),
        prop("Prazo", h("input", { name: "due_date", type: "date", value: task.due_date || "" })),
        prop("Etiquetas", h("input", { name: "tags", value: task.tags.map((t) => `#${t}`).join(" "), placeholder: "#cliente #contas" }))),
      h("div", { class: "drawer__notes" }, h("label", { class: "label", for: "notes" }, "Anotações"), notes),
      error,
      !isNew && h("p", { class: "drawer__stamp" },
        `Criada em ${fullDate.format(new Date(task.created_at))}`,
        task.completed_at ? `, feita em ${fullDate.format(new Date(task.completed_at))}.` : ".")),
    h("div", { class: "drawer__foot" }, remove, save));

  form.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) form.requestSubmit();
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const f = form.elements;
    const data = {
      title: f.title.value.trim(),
      description: f.description.value.trim() || null,
      status: f.status.value,
      priority: f.priority.value,
      due_date: f.due_date.value || null,
      tags: f.tags.value.split(/[\s,]+/).map((t) => t.replace(/^#/, "")).filter(Boolean),
    };
    if (!data.title) {
      error.textContent = "Escreva o que precisa ser feito.";
      title.focus();
      return;
    }
    save.disabled = true;
    try {
      const saved = isNew ? await api.post("/tasks", data) : await api.patch(`/tasks/${task.id}`, data);
      close();
      state.highlight = saved.id;
      if (isNew && state.view === "done" && data.status !== "concluida") state.view = "inbox";
      await refresh();
      toast(isNew ? "Tarefa adicionada." : "Salvo.");
    } catch (err) {
      error.textContent = err.message;
      save.disabled = false;
    }
  });

  dialog.append(form);
  document.body.append(dialog);
  dialog.showModal();
  fit();
  title.focus();
}

/* ---------- Atalhos ---------- */

function openShortcuts() {
  const dialog = h("dialog", { class: "dialog", "aria-labelledby": "keys-title" });
  dialog.addEventListener("close", () => dialog.remove());
  dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
  const row = (keys, text) => h("div", null, h("dt", null, text), h("dd", null, keys.map((k) => [h("kbd", null, k), " "])));
  dialog.append(
    h("h2", { id: "keys-title" }, "Atalhos"),
    h("dl", { class: "keys" },
      row(["n"], "Adicionar tarefa"),
      row(["/"], "Procurar"),
      row(["b"], "Quadro ou lista"),
      row(["1", "–", "5"], "Trocar de visão"),
      row(["Ctrl", "Enter"], "Salvar a tarefa aberta")),
    h("button", { class: "btn btn--plain", type: "button", onclick: () => dialog.close() }, "Fechar"));
  document.body.append(dialog);
  dialog.showModal();
}

/* ---------- Início ---------- */

(async () => {
  if (!token) return renderAuth();
  try {
    state.user = await api.get("/auth/me");
    renderApp();
  } catch {
    token = null;
    store.set("tarefas.token", null);
    renderAuth();
  }
})();
