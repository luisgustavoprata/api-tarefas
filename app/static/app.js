/* Tarefas: interface web da API (JavaScript puro, sem etapa de build).
 *
 * 1. Utilitários (DOM, ícones, datas)
 * 2. Cliente da API, sessão e tema
 * 3. Leitura da frase digitada ("pagar luz sexta !alta #casa")
 * 4. Tela de entrada
 * 5. App: menu lateral, cabeçalho, anotar, lista, quadro, painel de detalhes
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
const initials = (name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join("");

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
  mode: store.get("tarefas.mode") === "board" ? "board" : "list",
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
  document.querySelectorAll("[data-theme-btn]").forEach(drawThemeButton);
}
function drawThemeButton(btn) {
  btn.setAttribute("aria-label", isDark() ? "Usar tema claro" : "Usar tema escuro");
  btn.title = btn.getAttribute("aria-label");
  fill(btn, icon(isDark() ? "sun" : "moon"));
}

function toast(message, { tone = "ok", action } = {}) {
  const el = h("div", { class: `toast${tone === "error" ? " toast--error" : ""}`, role: tone === "error" ? "alert" : "status" },
    h("span", null, message),
    action && h("button", { class: "link-btn", type: "button", onclick: () => { el.remove(); action.run(); } }, action.label));
  document.getElementById("toasts").append(el);
  setTimeout(() => el.remove(), action ? 6000 : 3500);
}

/* ===================== 3. Leitura da frase ===================== */

const WEEKDAY_WORDS = { domingo: 0, segunda: 1, terca: 2, "terça": 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6, "sábado": 6 };
const END = "(?=\\s|$|[.,;])";
const START = "(^|\\s)";

/**
 * "pagar luz sexta !alta #casa #contas" →
 * { title: "pagar luz", due_date: "2030-01-11", priority: "alta", tags: ["casa", "contas"] }
 */
function parseQuick(text, base = today()) {
  let rest = ` ${text} `;
  const result = { tags: [] };
  const take = (regex, onMatch) => {
    // Se onMatch devolver false, o trecho fica no título (ex.: "31/02" não é data).
    rest = rest.replace(regex, (...m) => (onMatch(m) === false ? m[0] : " "));
  };

  take(new RegExp(`${START}#([\\p{L}\\p{N}_-]{1,30})${END}`, "giu"), (m) => {
    const tag = m[2].toLowerCase();
    if (!result.tags.includes(tag) && result.tags.length < 10) result.tags.push(tag);
  });
  take(new RegExp(`${START}!(alta|m[eé]dia|baixa)?${END}`, "iu"), (m) => {
    const word = (m[2] || "alta").toLowerCase();
    result.priority = word.startsWith("m") ? "media" : word;
  });

  const setDate = (d) => { if (!result.due_date) result.due_date = toISO(d); };
  const prep = "(?:(?:para|pra|até|ate|na|no|em)\\s+)?";
  take(new RegExp(`${START}${prep}depois de amanh[ãa]${END}`, "iu"), () => setDate(addDays(base, 2)));
  take(new RegExp(`${START}${prep}amanh[ãa]${END}`, "iu"), () => setDate(addDays(base, 1)));
  take(new RegExp(`${START}${prep}hoje${END}`, "iu"), () => setDate(base));
  take(new RegExp(`${START}(?:em|daqui a)\\s+(\\d{1,3})\\s+dias?${END}`, "iu"), (m) => setDate(addDays(base, Number(m[2]))));
  take(new RegExp(`${START}${prep}(\\d{1,2})/(\\d{1,2})(?:/(\\d{2,4}))?${END}`, "u"), (m) => {
    const [day, month] = [Number(m[2]), Number(m[3])];
    let year = m[4] ? Number(m[4].length === 2 ? `20${m[4]}` : m[4]) : base.getFullYear();
    let date = new Date(year, month - 1, day);
    if (month < 1 || month > 12 || date.getMonth() !== month - 1) return false;
    if (!m[4] && date < base) date = new Date(++year, month - 1, day);
    setDate(date);
  });
  take(new RegExp(`${START}${prep}(segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo)(?:-feira)?${END}`, "iu"), (m) => {
    const target = WEEKDAY_WORDS[m[2].toLowerCase()];
    let diff = (target - base.getDay() + 7) % 7;
    if (diff === 0) diff = 7; // "sexta" dita numa sexta = a próxima
    setDate(addDays(base, diff));
  });

  result.title = rest.replace(/\s+/g, " ").trim();
  return result;
}

/* ===================== 4. Entrada ===================== */

const root = () => document.getElementById("root");

function renderAuth(mode = "login") {
  document.title = "Entrar | Tarefas";
  const isLogin = mode === "login";
  const error = h("p", { class: "form__error", role: "alert" });

  const demo = h("button", { class: "btn btn--primary btn--block btn--lg", type: "button" }, "Entrar na demonstração");
  demo.addEventListener("click", async () => {
    demo.disabled = true;
    demo.textContent = "Entrando…";
    try {
      await login(DEMO.email, DEMO.password);
    } catch (err) {
      error.textContent = err.message;
      demo.disabled = false;
      demo.textContent = "Entrar na demonstração";
    }
  });

  const field = (label, attrs) => h("label", { class: "field" }, h("span", { class: "field__label" }, label), h("input", { class: "input", required: true, ...attrs }));
  const form = h("form", { class: "form", novalidate: true },
    !isLogin && field("Seu nome", { name: "name", autocomplete: "name" }),
    field("E-mail", { name: "email", type: "email", autocomplete: "email" }),
    field("Senha", { name: "password", type: "password", autocomplete: isLogin ? "current-password" : "new-password", placeholder: isLogin ? null : "Pelo menos 8 caracteres" }),
    error,
    h("button", { class: `btn ${isLogin ? "btn--ghost" : "btn--primary"} btn--block btn--lg`, type: "submit" }, isLogin ? "Entrar" : "Criar conta"));

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

  const themeBtn = h("button", { class: "icon-btn", type: "button", "data-theme-btn": true, onclick: toggleTheme });
  drawThemeButton(themeBtn);

  const friday = dueLabel(parseQuick("x sexta").due_date).text; // a data da prévia acompanha o calendário
  const preview = h("div", { class: "preview", "aria-hidden": "true" },
    h("div", { class: "preview__capture" }, "pagar a luz sexta !alta #casa", h("span", { class: "preview__caret" })),
    h("div", { class: "preview__chips" },
      h("span", { class: "badge badge--date" }, friday),
      h("span", { class: "badge badge--alta" }, "Alta"),
      h("span", { class: "badge badge--tag" }, "#casa")),
    h("p", { class: "preview__group preview__group--late" }, "Atrasadas"),
    h("div", { class: "preview__row" }, h("span", { class: "preview__dot", style: "border-color:#d4443c" }), h("span", null, "Enviar proposta para o cliente"), h("span", { style: "color:#d4443c" }, "Há 2 dias")),
    h("p", { class: "preview__group" }, "Hoje"),
    h("div", { class: "preview__row" }, h("span", { class: "preview__dot", style: "border-color:#c08108" }), h("span", null, "Preparar a apresentação"), h("span", null, "Hoje")),
    h("div", { class: "preview__row" }, h("span", { class: "preview__dot" }), h("span", null, "Responder o contador"), h("span", null, "Hoje")));

  fill(root(), h("div", { class: "auth" },
    h("main", { class: "auth__form-side" }, h("div", { class: "auth__box" },
      h("div", { style: "display:flex;justify-content:space-between;align-items:center" },
        h("span", { class: "brand", style: "padding:0" }, h("img", { src: "/static/icon.svg", alt: "" }), "Tarefas"), themeBtn),
      h("div", null,
        h("h1", { class: "auth__title" }, isLogin ? "Entrar" : "Criar conta"),
        h("p", { class: "auth__lede" }, isLogin ? "Bom te ver de novo." : "Grátis, leva meio minuto.")),
      isLogin && demo,
      isLogin && h("p", { class: "auth__or" }, "ou com a sua conta"),
      form,
      h("p", { class: "auth__switch" }, isLogin ? "Ainda não tem conta? " : "Já tem conta? ",
        h("button", { class: "link-btn", type: "button", onclick: () => renderAuth(isLogin ? "register" : "login") }, isLogin ? "Criar conta" : "Entrar")),
      h("p", { class: "auth__foot" }, "Para desenvolvedores: ", h("a", { href: "/docs" }, "documentação da API")))),
    h("section", { class: "auth__show", "aria-label": "Sobre o produto" },
      h("h2", null, "Anote do jeito que você fala. O resto se organiza."),
      h("div", { class: "auth__points" }, h("ul", null,
        [
          "Prazo, prioridade e etiquetas saem da própria frase.",
          "A lista se arruma pelo que vence primeiro: atrasadas, hoje, próximos dias.",
          "Lista ou quadro, no computador e no celular.",
        ].map((text) => h("li", null, icon("check"), h("span", null, text))))),
      preview)));
}

/* ===================== 5. App ===================== */

const VIEWS = {
  inbox: { label: "A fazer", icon: "inbox", params: () => ({ status: ["pendente", "em_andamento"] }) },
  today: { label: "Hoje", icon: "today", params: () => ({ status: ["pendente", "em_andamento"], due_to: toISO(today()) }) },
  week: {
    label: "Próximos 7 dias", icon: "week",
    params: () => ({ status: ["pendente", "em_andamento"], due_from: toISO(today()), due_to: toISO(addDays(today(), 7)) }),
  },
  late: { label: "Atrasadas", icon: "late", params: () => ({ overdue: "true" }) },
  done: { label: "Concluídas", icon: "done", params: () => ({ status: ["concluida"] }), sort: "-created_at" },
};

const COLUMNS = [
  ["pendente", "Pendente", "var(--faint)"],
  ["em_andamento", "Em andamento", "var(--accent)"],
  ["concluida", "Concluída", "var(--done)"],
];

let els = {};

function renderApp() {
  document.title = "Tarefas";
  const app = h("div", { class: `app` });

  /* Menu lateral */
  els.nav = h("nav", { class: "nav", "aria-label": "Visões" });
  els.tagNav = h("nav", { class: "nav", "aria-label": "Etiquetas" });
  els.progress = h("div", { class: "progress" });
  const sidebar = h("aside", { class: "sidebar", id: "sidebar" },
    h("span", { class: "brand" }, h("img", { src: "/static/icon.svg", alt: "" }), "Tarefas"),
    els.nav,
    els.tagNav,
    h("div", { class: "sidebar__foot" },
      els.progress,
      h("div", { class: "me" },
        h("span", { class: "avatar", "aria-hidden": "true" }, initials(state.user.name)),
        h("div", null, h("p", { class: "me__name" }, state.user.name), h("p", { class: "me__email" }, state.user.email)),
        h("button", { class: "icon-btn", type: "button", "aria-label": "Sair", title: "Sair", onclick: logout }, icon("logout")))));

  const closeMenu = () => { app.classList.remove("menu-open"); scrim.hidden = true; };
  const scrim = h("div", { class: "scrim", hidden: true, onclick: closeMenu });
  els.closeMenu = closeMenu;

  /* Cabeçalho */
  els.title = h("h1", { class: "head__title", tabindex: "-1" });
  els.sub = h("p", { class: "head__sub" });
  const themeBtn = h("button", { class: "icon-btn", type: "button", "data-theme-btn": true, onclick: toggleTheme });
  drawThemeButton(themeBtn);
  els.modeSwitch = h("div", { class: "switch", role: "group", "aria-label": "Forma de ver" });

  /* Anotar */
  const capture = h("input", {
    class: "capture__input", id: "capture", autocomplete: "off", maxlength: "200", "aria-label": "Nova tarefa",
    placeholder: matchMedia("(max-width: 600px)").matches ? "Anotar tarefa…" : "Anotar tarefa: “ligar para o banco amanhã !alta #financas”",
  });
  const add = h("button", { class: "btn btn--primary", type: "submit" }, "Adicionar");
  const preview = h("div", { class: "capture__preview", "aria-live": "polite" });
  const captureForm = h("form", { class: "capture", autocomplete: "off" },
    h("div", { class: "capture__box" }, icon("plus"), capture, add), preview);

  function drawPreview() {
    const parsed = parseQuick(capture.value);
    if (!capture.value.trim()) {
      fill(preview, h("span", null, "Escreva como fala: "),
        ["amanhã", "sexta", "25/12", "!alta", "#cliente"].map((w) => [h("code", null, w), " "]),
        h("span", null, "entram como prazo, prioridade e etiqueta."));
      return;
    }
    const due = dueLabel(parsed.due_date);
    fill(preview,
      h("span", null, parsed.title ? "Vai entrar como" : "Falta dizer o que fazer"),
      due && h("span", { class: "badge badge--date" }, icon("clock"), due.text),
      parsed.priority && h("span", { class: `badge badge--${parsed.priority}` }, icon("flag"), PRIORITY_LABEL[parsed.priority]),
      parsed.tags.map((t) => h("span", { class: "badge badge--tag" }, `#${t}`)));
  }
  capture.addEventListener("input", drawPreview);
  drawPreview();

  captureForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const parsed = parseQuick(capture.value);
    if (!parsed.title) {
      capture.focus();
      toast("Escreva o que precisa ser feito.", { tone: "error" });
      return;
    }
    add.disabled = true;
    try {
      const task = await api.post("/tasks", {
        title: parsed.title, due_date: parsed.due_date || null, priority: parsed.priority || "media", tags: parsed.tags,
      });
      capture.value = "";
      drawPreview();
      state.highlight = task.id;
      if (state.view === "done" || state.view === "late") state.view = "inbox";
      await refresh();
      toast("Tarefa adicionada.");
    } catch (err) {
      toast(err.message, { tone: "error" });
    } finally {
      add.disabled = false;
      capture.focus();
    }
  });

  /* Busca */
  const search = h("input", { class: "input", type: "search", placeholder: "Buscar tarefas", "aria-label": "Buscar tarefas", value: state.q });
  let searchTimer;
  search.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.q = search.value.trim(); drawChrome(); loadTasks(); }, 250);
  });
  els.search = search;
  els.filters = h("div", { style: "display:flex;gap:6px;flex-wrap:wrap" });
  els.content = h("section", { "aria-live": "polite" });

  fill(app,
    sidebar, scrim,
    h("main", { class: "main" }, h("div", { class: "main__inner" },
      h("header", { class: "head" },
        h("button", { class: "icon-btn head__menu", type: "button", "aria-label": "Abrir menu", "aria-controls": "sidebar",
          onclick: () => { app.classList.add("menu-open"); scrim.hidden = false; } }, icon("menu")),
        h("div", { class: "head__titles" }, els.title, els.sub),
        h("div", { class: "head__actions" }, els.modeSwitch,
          h("a", { class: "icon-btn", href: "/docs", target: "_blank", rel: "noopener", "aria-label": "Documentação da API", title: "Documentação da API" }, icon("code")),
          h("button", { class: "icon-btn", type: "button", "aria-label": "Atalhos de teclado", title: "Atalhos de teclado", onclick: openShortcuts }, icon("keyboard")),
          themeBtn)),
      captureForm,
      h("div", { class: "toolbar" }, h("div", { class: "search" }, icon("search"), search, h("kbd", null, "/")), els.filters),
      els.content)));
  fill(root(), app);

  document.onkeydown = (event) => {
    if (event.target.closest("input, textarea, select, dialog") || event.metaKey || event.ctrlKey || event.altKey) return;
    const keys = {
      n: () => capture.focus(),
      "/": () => search.focus(),
      b: () => setMode(state.mode === "board" ? "list" : "board"),
      "?": openShortcuts,
      1: () => setView("inbox"), 2: () => setView("today"), 3: () => setView("week"), 4: () => setView("late"), 5: () => setView("done"),
    };
    if (keys[event.key]) { event.preventDefault(); keys[event.key](); }
  };

  drawChrome();
  refresh();
  capture.focus();
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
  store.set("tarefas.mode", mode);
  drawChrome();
  loadTasks();
}

function setTag(tag) {
  state.tag = state.tag === tag ? null : tag;
  els.closeMenu?.();
  drawChrome();
  loadTasks();
}

/** Menu lateral, título, resumo e filtros ativos. */
function drawChrome() {
  const s = state.stats;
  const counts = s && {
    inbox: s.total - s.by_status.concluida,
    today: s.due_today + s.overdue,
    week: null,
    late: s.overdue,
    done: s.by_status.concluida,
  };

  fill(els.nav, Object.entries(VIEWS).map(([key, view]) => h("button", {
    class: "nav__item", type: "button", "aria-current": String(state.view === key), onclick: () => setView(key),
  }, icon(view.icon), h("span", null, view.label),
    counts && counts[key] !== null && counts[key] > 0 &&
      h("span", { class: `nav__n${key === "late" ? " nav__n--late" : ""}` }, counts[key]))));

  fill(els.tagNav, state.tags.length > 0 && [
    h("p", { class: "nav__title" }, "Etiquetas"),
    state.tags.map((t) => h("button", {
      class: "nav__item", type: "button", "aria-current": String(state.tag === t.name), onclick: () => setTag(t.name),
    }, h("span", { class: "nav__hash", "aria-hidden": "true" }, "#"), h("span", null, t.name), h("span", { class: "nav__n" }, t.tasks))),
  ]);

  if (s) {
    const percent = Math.round(s.completion_rate * 100);
    fill(els.progress,
      h("div", { class: "progress__label" }, h("span", null, "Concluídas"), h("span", null, `${s.by_status.concluida} de ${s.total}`)),
      h("div", { class: "progress__bar", role: "progressbar", "aria-valuenow": percent, "aria-valuemin": 0, "aria-valuemax": 100, "aria-label": "Tarefas concluídas" },
        h("span", { style: `width:${percent}%` })));
  }

  els.title.textContent = state.mode === "board" ? "Quadro" : VIEWS[state.view].label;
  const parts = [];
  if (s) {
    if (s.overdue) parts.push(h("span", { class: "late" }, plural(s.overdue, "atrasada", "atrasadas")));
    if (s.due_today) parts.push(h("strong", null, `${s.due_today} para hoje`));
    const open = s.total - s.by_status.concluida;
    parts.push(`${plural(open, "em aberto", "em aberto")}`);
  }
  fill(els.sub, capitalize(longDate.format(new Date())), parts.length ? ". " : "",
    parts.map((p, i) => [i > 0 ? (i === parts.length - 1 ? " e " : ", ") : "", p]), parts.length ? "." : "");

  fill(els.modeSwitch, [["list", "Lista", "list"], ["board", "Quadro", "board"]].map(([mode, label, ic]) => h("button", {
    type: "button", "aria-pressed": String(state.mode === mode), onclick: () => setMode(mode),
  }, icon(ic), h("span", null, label))));

  const chip = (label, onClear) => h("span", { class: "chip-filter" }, label,
    h("button", { type: "button", "aria-label": `Remover filtro ${label}`, onclick: onClear }, icon("close")));
  fill(els.filters,
    state.mode === "board" && state.view !== "inbox" && chip(VIEWS[state.view].label, () => setView("inbox")),
    state.tag && chip(`#${state.tag}`, () => setTag(state.tag)),
    state.q && chip(`“${state.q}”`, () => { state.q = ""; els.search.value = ""; drawChrome(); loadTasks(); }));
}

async function refresh() {
  await Promise.all([loadTasks(), loadSide()]);
}

async function loadSide() {
  try {
    [state.stats, state.tags] = await Promise.all([api.get("/tasks/stats"), api.get("/tags")]);
    drawChrome();
  } catch { /* a área principal já mostra o erro */ }
}

let loadSeq = 0;
async function loadTasks() {
  const seq = ++loadSeq;
  if (!state.tasks.length) fill(els.content, h("div", { class: "skeleton", "aria-label": "Carregando" }, h("span"), h("span"), h("span")));
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
    if (err.status !== 401) fill(els.content, h("div", { class: "empty" }, h("p", { class: "empty__title" }, "Não foi possível carregar"), h("p", null, err.message)));
  }
}

/* ---------- Lista ---------- */

function groupTasks(tasks) {
  if (state.view === "done") return [["Concluídas", tasks, ""]];
  const t0 = today();
  const buckets = { late: [], today: [], tomorrow: [], week: [], later: [], none: [] };
  for (const task of tasks) {
    if (!task.due_date) { buckets.none.push(task); continue; }
    const diff = daysBetween(t0, fromISO(task.due_date));
    if (task.overdue || diff < 0) buckets.late.push(task);
    else if (diff === 0) buckets.today.push(task);
    else if (diff === 1) buckets.tomorrow.push(task);
    else if (diff < 7) buckets.week.push(task);
    else buckets.later.push(task);
  }
  return [
    ["Atrasadas", buckets.late, "late"],
    ["Hoje", buckets.today, ""],
    ["Amanhã", buckets.tomorrow, ""],
    ["Próximos dias", buckets.week, ""],
    ["Mais adiante", buckets.later, ""],
    ["Sem prazo", buckets.none, ""],
  ].filter(([, items]) => items.length);
}

const EMPTY = {
  inbox: ["Tudo em dia", "Nenhuma tarefa em aberto. Anote a próxima no campo acima."],
  today: ["Nada para hoje", "Use “hoje” ao anotar para colocar uma tarefa aqui."],
  week: ["Semana livre", "Nenhuma tarefa vence nos próximos 7 dias."],
  late: ["Nada atrasado", "Todas as tarefas com prazo estão em dia."],
  done: ["Nenhuma concluída ainda", "Marque o círculo de uma tarefa quando terminar."],
};

function drawList() {
  if (!state.tasks.length) {
    const [title, text] = state.tag || state.q ? ["Nada encontrado", "Tente outra busca ou remova o filtro."] : EMPTY[state.view];
    fill(els.content, h("div", { class: "empty" }, icon("done"), h("p", { class: "empty__title" }, title), h("p", null, text)));
    return;
  }
  fill(els.content, groupTasks(state.tasks).map(([title, items, kind]) =>
    h("section", { class: `group${kind ? ` group--${kind}` : ""}` },
      h("div", { class: "group__head" }, h("h2", { class: "group__title" }, title), h("span", { class: "group__count" }, items.length)),
      h("div", { class: "card-list" }, items.map(taskRow)))));
}

function taskMeta(task, { showDue = false, showStatus = true } = {}) {
  const done = task.status === "concluida";
  const due = showDue && dueLabel(task.due_date, done);
  return [
    showStatus && task.status === "em_andamento" && h("span", { class: "badge badge--doing" }, "Em andamento"),
    !done && task.priority !== "media" && h("span", { class: `badge badge--${task.priority}` }, icon("flag"), PRIORITY_LABEL[task.priority]),
    due && h("span", { class: `task__due${due.kind ? ` task__due--${due.kind}` : ""}` }, icon("clock"), due.text),
    task.tags.map((t) => h("span", { class: "tag" }, t)),
  ];
}

function taskRow(task) {
  const done = task.status === "concluida";
  const due = dueLabel(task.due_date, done);
  const meta = taskMeta(task).flat().filter(Boolean);
  const row = h("article", {
    class: `task${done ? " is-done" : ""}${state.highlight === task.id ? " is-new" : ""}`,
    "data-priority": task.priority,
  });
  const check = h("button", {
    class: `check${done ? " check--done" : task.status === "em_andamento" ? " check--doing" : ""}`, type: "button",
    "aria-label": done ? `Reabrir: ${task.title}` : `Concluir: ${task.title}`,
    onclick: () => toggleDone(task, row, check),
  }, icon("check"));
  fill(row,
    check,
    h("button", { class: "task__main", type: "button", onclick: () => openDrawer(task) },
      h("span", { class: "task__title" }, task.title),
      task.description && h("span", { class: "task__desc" }, task.description),
      meta.length > 0 && h("span", { class: "task__meta" }, meta)),
    due && h("span", { class: `task__due${due.kind ? ` task__due--${due.kind}` : ""}` }, due.text));
  return row;
}

async function toggleDone(task, row, check) {
  const next = task.status === "concluida" ? "pendente" : "concluida";
  check.disabled = true;
  if (next === "concluida") check.className = "check check--done";
  try {
    await api.patch(`/tasks/${task.id}`, { status: next });
    const leaves = (next === "concluida" && state.view !== "done") || (next !== "concluida" && state.view === "done");
    if (leaves) {
      row.classList.add("is-leaving");
      await new Promise((r) => setTimeout(r, 260));
    }
    await refresh();
    if (next === "concluida") {
      toast("Tarefa concluída.", { action: { label: "Desfazer", run: async () => {
        await api.patch(`/tasks/${task.id}`, { status: task.status });
        refresh();
      } } });
    }
  } catch (err) {
    check.disabled = false;
    toast(err.message, { tone: "error" });
  }
}

/* ---------- Quadro (arrastar entre colunas muda a situação) ---------- */

function drawBoard() {
  const byStatus = Object.fromEntries(COLUMNS.map(([s]) => [s, []]));
  for (const task of state.tasks) byStatus[task.status].push(task);
  const MAX_DONE = 20;

  fill(els.content, h("div", { class: "board" }, COLUMNS.map(([status, label, color]) => {
    const items = status === "concluida" ? byStatus[status].slice(0, MAX_DONE) : byStatus[status];
    const column = h("section", { class: "column", "data-status": status, "aria-label": label },
      h("div", { class: "column__head" },
        h("span", { class: "column__dot", style: `background:${color}` }),
        h("h2", { class: "column__title" }, label),
        h("span", { class: "column__n" }, byStatus[status].length)),
      h("div", { class: "column__body" },
        items.length ? items.map(boardCard) : h("p", { class: "column__empty" }, "Arraste tarefas para cá")));

    column.addEventListener("dragover", (event) => { event.preventDefault(); column.classList.add("is-over"); });
    column.addEventListener("dragleave", (event) => { if (!column.contains(event.relatedTarget)) column.classList.remove("is-over"); });
    column.addEventListener("drop", async (event) => {
      event.preventDefault();
      column.classList.remove("is-over");
      const id = Number(event.dataTransfer.getData("text/plain"));
      const task = state.tasks.find((t) => t.id === id);
      if (!task || task.status === status) return;
      task.status = status; // mostra já no lugar novo enquanto salva
      drawBoard();
      try {
        await api.patch(`/tasks/${id}`, { status });
        await refresh();
        toast(`Movida para ${label}.`);
      } catch (err) {
        toast(err.message, { tone: "error" });
        refresh();
      }
    });
    return column;
  })));
}

function boardCard(task) {
  const done = task.status === "concluida";
  const meta = taskMeta(task, { showDue: true, showStatus: false }).flat().filter(Boolean);
  const card = h("button", {
    class: `kcard${done ? " is-done" : ""}`, type: "button", draggable: "true", "data-priority": task.priority,
    onclick: () => openDrawer(task),
  },
    h("span", { class: "kcard__title" }, task.title),
    meta.length > 0 && h("span", { class: "kcard__meta" }, meta));
  card.addEventListener("dragstart", (event) => {
    event.dataTransfer.setData("text/plain", String(task.id));
    event.dataTransfer.effectAllowed = "move";
    card.classList.add("is-dragging");
  });
  card.addEventListener("dragend", () => card.classList.remove("is-dragging"));
  return card;
}

/* ---------- Painel de detalhes ---------- */

function openDrawer(task) {
  const dialog = h("dialog", { class: "drawer", "aria-label": "Detalhes da tarefa" });
  const close = () => dialog.close();
  dialog.addEventListener("close", () => dialog.remove());
  dialog.addEventListener("click", (event) => { if (event.target === dialog) close(); }); // clique fora fecha

  const segmented = (name, options, value) => h("div", { class: "segmented", role: "radiogroup", "aria-label": name === "status" ? "Situação" : "Prioridade" },
    options.map(([v, label]) => h("label", null, h("input", { type: "radio", name, value: v, checked: v === value }), h("span", null, label))));

  const form = h("form", { class: "drawer__inner", novalidate: true });
  const title = h("input", { class: "drawer__title-input", name: "title", value: task.title, maxlength: "120", "aria-label": "Título" });
  const field = (label, control) => h("div", { class: "field" }, h("span", { class: "field__label" }, label), control);
  const description = h("textarea", { class: "input", name: "description", maxlength: "2000", placeholder: "Anotações, links, próximos passos…", "aria-label": "Detalhes" });
  description.value = task.description || "";
  const error = h("p", { class: "form__error", role: "alert" });

  const remove = h("button", { class: "btn btn--danger", type: "button" }, "Excluir");
  let confirmTimer;
  remove.addEventListener("click", async () => {
    if (!remove.classList.contains("is-confirming")) {
      remove.classList.add("is-confirming");
      remove.textContent = "Confirmar exclusão";
      confirmTimer = setTimeout(() => { remove.classList.remove("is-confirming"); remove.textContent = "Excluir"; }, 4000);
      return;
    }
    clearTimeout(confirmTimer);
    try {
      await api.del(`/tasks/${task.id}`);
      close();
      await refresh();
      toast("Tarefa excluída.", { action: { label: "Desfazer", run: async () => {
        const { id, overdue, created_at, updated_at, completed_at, ...data } = task;
        await api.post("/tasks", data);
        refresh();
      } } });
    } catch (err) {
      error.textContent = err.message;
    }
  });

  const save = h("button", { class: "btn btn--primary", type: "submit" }, "Salvar");
  const created = new Date(task.created_at);
  fill(form,
    h("div", { class: "drawer__head" },
      h("span", { class: "drawer__crumb" }, `Tarefa #${task.id}`),
      h("button", { class: "icon-btn", type: "button", "aria-label": "Fechar", onclick: close }, icon("close"))),
    h("div", { class: "drawer__body" },
      title,
      field("Situação", segmented("status", [["pendente", "Pendente"], ["em_andamento", "Em andamento"], ["concluida", "Concluída"]], task.status)),
      h("div", { class: "form__row" },
        field("Prioridade", segmented("priority", [["baixa", "Baixa"], ["media", "Média"], ["alta", "Alta"]], task.priority)),
        field("Prazo", h("input", { class: "input", name: "due_date", type: "date", value: task.due_date || "", "aria-label": "Prazo" }))),
      field("Etiquetas", h("input", { class: "input", name: "tags", value: task.tags.join(", "), placeholder: "Separadas por vírgula: cliente, financeiro", "aria-label": "Etiquetas" })),
      field("Detalhes", description),
      error,
      h("div", { class: "drawer__meta" },
        h("span", null, `Criada em ${dateTime.format(created)}`),
        task.completed_at && h("span", null, `Concluída em ${dateTime.format(new Date(task.completed_at))}`))),
    h("div", { class: "drawer__foot" }, remove,
      h("div", { style: "display:flex;gap:8px" }, h("button", { class: "btn btn--ghost", type: "button", onclick: close }, "Cancelar"), save)));

  form.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) form.requestSubmit();
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const f = form.elements;
    const changes = {
      title: f.title.value.trim(),
      description: f.description.value.trim() || null,
      status: form.querySelector('[name="status"]:checked').value,
      priority: form.querySelector('[name="priority"]:checked').value,
      due_date: f.due_date.value || null,
      tags: f.tags.value.split(",").map((t) => t.trim().replace(/^#/, "")).filter(Boolean),
    };
    save.disabled = true;
    try {
      await api.patch(`/tasks/${task.id}`, changes);
      close();
      state.highlight = task.id;
      await refresh();
      toast("Alterações salvas.");
    } catch (err) {
      error.textContent = err.message;
      save.disabled = false;
    }
  });

  dialog.append(form);
  document.body.append(dialog);
  dialog.showModal();
  title.focus();
}

/* ---------- Atalhos ---------- */

function openShortcuts() {
  const dialog = h("dialog", { class: "dialog", "aria-labelledby": "keys-title" });
  dialog.addEventListener("close", () => dialog.remove());
  dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
  const row = (keys, text) => h("div", null, h("dt", null, text), h("dd", null, keys.map((k) => [h("kbd", null, k), " "])));
  dialog.append(h("div", { class: "dialog__inner" },
    h("h2", { id: "keys-title" }, "Atalhos de teclado"),
    h("dl", { class: "keys" },
      row(["n"], "Anotar tarefa"),
      row(["/"], "Buscar"),
      row(["b"], "Alternar lista e quadro"),
      row(["1", "2", "3", "4", "5"], "Trocar de visão"),
      row(["Ctrl", "Enter"], "Salvar no painel"),
      row(["Esc"], "Fechar painel")),
    h("button", { class: "btn btn--ghost", type: "button", onclick: () => dialog.close() }, "Fechar")));
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
