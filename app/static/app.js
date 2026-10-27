/* Tarefas: interface web da API (JavaScript puro, sem etapa de build).
 *
 * 1. Utilitários (DOM, datas)
 * 2. Cliente da API e sessão
 * 3. Leitura da frase digitada ("pagar luz sexta !alta #casa")
 * 4. Telas: entrada, lista, edição
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
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
};

function icon(name) {
  const wrap = document.createElement("span");
  wrap.setAttribute("aria-hidden", "true");
  wrap.style.display = "contents";
  // Conteúdo fixo, definido acima: nunca dados do usuário.
  wrap.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
  return wrap;
}

const pad = (n) => String(n).padStart(2, "0");
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function fromISO(value) {
  const [y, m, d] = value.split("-").map(Number);
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
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** Como o prazo aparece na lista: "Hoje", "Amanhã", "sex, 30/10", "Atrasada há 2 dias". */
function dueLabel(iso, done = false) {
  if (!iso) return null;
  const due = fromISO(iso);
  const diff = daysBetween(today(), due);
  if (diff < 0 && !done) return { text: diff === -1 ? "Venceu ontem" : `Atrasada há ${-diff} dias`, kind: "late" };
  if (diff === 0) return { text: "Hoje", kind: "today" };
  if (diff === 1) return { text: "Amanhã", kind: "" };
  const short = `${pad(due.getDate())}/${pad(due.getMonth() + 1)}`;
  if (diff > 1 && diff < 7) return { text: `${WEEKDAYS_SHORT[due.getDay()]}, ${short}`, kind: "" };
  const year = due.getFullYear() !== today().getFullYear() ? `/${due.getFullYear()}` : "";
  return { text: short + year, kind: "" };
}

const STATUS_LABEL = { pendente: "Pendente", em_andamento: "Em andamento", concluida: "Concluída" };
const PRIORITY_LABEL = { alta: "Alta", media: "Média", baixa: "Baixa" };

/* ===================== 2. API e sessão ===================== */

class ApiError extends Error {
  constructor(status, message, errors = []) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

const TOKEN_KEY = "tarefas.token";
const storage = {
  get() {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  },
  set(value) {
    try {
      if (value) localStorage.setItem(TOKEN_KEY, value);
      else localStorage.removeItem(TOKEN_KEY);
    } catch { /* navegação privada: o login vale só nesta aba */ }
  },
};

let memoryToken = storage.get();

async function request(method, path, { json, form } = {}) {
  const headers = { Accept: "application/json" };
  let body;
  if (json !== undefined) { headers["Content-Type"] = "application/json"; body = JSON.stringify(json); }
  if (form) { body = new URLSearchParams(form); }
  if (memoryToken) headers.Authorization = `Bearer ${memoryToken}`;
  let response;
  try {
    response = await fetch(path, { method, headers, body });
  } catch {
    throw new ApiError(0, "Sem conexão com o servidor. Verifique a internet e tente de novo.");
  }
  if (response.status === 204) return null;
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && memoryToken && path !== "/auth/token") {
      logout();
      toast("Sua sessão expirou. Entre novamente.", { tone: "error" });
    }
    const detail = data?.errors?.length ? data.errors.map((e) => e.message).join(" ") : data?.detail;
    throw new ApiError(response.status, detail || "Algo deu errado. Tente de novo.", data?.errors || []);
  }
  return data;
}

const api = {
  get: (path, params) => {
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
const state = { user: null, view: "open", tag: null, q: "", tasks: [], stats: null, tags: [], lastId: null };

async function login(email, password) {
  const { access_token: token } = await api.login(email, password);
  memoryToken = token;
  storage.set(token);
  state.user = await api.get("/auth/me");
  renderApp();
}

function logout() {
  memoryToken = null;
  storage.set(null);
  state.user = null;
  renderAuth();
}

function toast(message, { tone = "ok", action } = {}) {
  const el = h("div", { class: `toast${tone === "error" ? " toast--error" : ""}`, role: tone === "error" ? "alert" : "status" },
    h("span", null, message),
    action && h("button", { class: "link-btn", type: "button", onclick: () => { el.remove(); action.run(); } }, action.label));
  document.getElementById("toasts").append(el);
  setTimeout(() => el.remove(), action ? 6000 : 3800);
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
    if (month < 1 || month > 12 || date.getMonth() !== month - 1) return false; // 31/02: não é data
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

/* ===================== 4. Telas ===================== */

const root = () => document.getElementById("root");

/* ---------- Entrada ---------- */

function renderAuth(mode = "login") {
  document.title = "Entrar | Tarefas";
  const isLogin = mode === "login";
  const error = h("p", { class: "form__error", role: "alert" });

  const demo = h("button", { class: "btn btn--primary btn--block", type: "button" }, "Entrar na demonstração");
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

  const form = h("form", { class: "form", novalidate: true },
    !isLogin && h("label", { class: "field" }, h("span", { class: "field__label" }, "Seu nome"),
      h("input", { class: "input", name: "name", autocomplete: "name", required: true })),
    h("label", { class: "field" }, h("span", { class: "field__label" }, "E-mail"),
      h("input", { class: "input", name: "email", type: "email", autocomplete: "email", required: true })),
    h("label", { class: "field" }, h("span", { class: "field__label" }, "Senha"),
      h("input", { class: "input", name: "password", type: "password", required: true, autocomplete: isLogin ? "current-password" : "new-password", minlength: isLogin ? null : "8" })),
    error,
    h("button", { class: "btn btn--ghost btn--block", type: "submit" }, isLogin ? "Entrar" : "Criar conta e entrar"));

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

  fill(root(), h("main", { class: "auth" }, h("div", { class: "auth__box" },
    h("span", { class: "brand" }, h("img", { src: "/static/icon.svg", alt: "" }), "Tarefas"),
    h("div", null,
      h("h1", { class: "auth__title" }, "Anote do jeito que você fala."),
      h("p", { class: "auth__lede" }, "Escreva “pagar a luz sexta !alta #casa” e a tarefa já entra com prazo, prioridade e etiqueta.")),
    h("div", { class: "auth__card" },
      isLogin && demo,
      isLogin && h("p", { class: "auth__demo-hint" }, "Uma conta de exemplo, já com tarefas. Sem cadastro."),
      isLogin && h("p", { class: "auth__or" }, "ou use a sua conta"),
      form,
      h("p", { class: "auth__switch" }, isLogin ? "Ainda não tem conta? " : "Já tem conta? ",
        h("button", { class: "link-btn", type: "button", onclick: () => renderAuth(isLogin ? "register" : "login") },
          isLogin ? "Criar conta" : "Entrar"))),
    h("p", { class: "auth__foot" }, "É uma API REST. ", h("a", { href: "/docs" }, "Ver a documentação interativa")))));
}

/* ---------- Lista ---------- */

const VIEWS = {
  open: { label: "A fazer", params: { status: ["pendente", "em_andamento"] } },
  late: { label: "Atrasadas", params: { overdue: "true" } },
  today: { label: "Para hoje", params: () => ({ status: ["pendente", "em_andamento"], due_to: toISO(today()) }) },
  doing: { label: "Em andamento", params: { status: ["em_andamento"] } },
  done: { label: "Concluídas", params: { status: ["concluida"] }, sort: "-created_at" },
};

let els = {};

function renderApp() {
  document.title = "Tarefas";
  const capture = h("input", {
    class: "capture__input", id: "capture", autocomplete: "off", maxlength: "200",
    placeholder: matchMedia("(max-width: 600px)").matches
      ? "Anotar tarefa…"
      : "Anotar tarefa: “ligar para o banco amanhã !alta #financas”",
    "aria-label": "Nova tarefa",
  });
  const add = h("button", { class: "btn btn--primary", type: "submit" }, "Adicionar");
  const preview = h("div", { class: "capture__preview", "aria-live": "polite" });
  const captureForm = h("form", { class: "capture-wrap", autocomplete: "off" },
    h("div", { class: "capture" }, capture, add), preview);

  const search = h("input", { class: "input", type: "search", placeholder: "Buscar no título ou na descrição", "aria-label": "Buscar", value: state.q });
  let searchTimer;
  search.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.q = search.value.trim(); loadTasks(); }, 250);
  });

  els = {
    side: h("aside", { class: "side", "aria-label": "Resumo e filtros" }),
    list: h("section", { "aria-label": "Tarefas" }),
    activeFilter: h("div", { class: "active-filter" }),
    preview, capture,
  };

  function drawPreview() {
    const parsed = parseQuick(capture.value);
    if (!capture.value.trim()) {
      fill(preview, h("span", { class: "capture__help" }, "Entende ",
        h("code", null, "hoje"), " ", h("code", null, "amanhã"), " ", h("code", null, "sexta"), " ",
        h("code", null, "25/12"), " ", h("code", null, "!alta"), " e ", h("code", null, "#etiqueta"), "."));
      return;
    }
    const due = dueLabel(parsed.due_date);
    fill(preview,
      parsed.title ? h("span", null, "Vai entrar como:") : h("span", null, "Falta o que fazer."),
      due && h("span", { class: "pill pill--date" }, `Prazo: ${due.text}`),
      parsed.priority && h("span", { class: `pill pill--${parsed.priority}` }, `Prioridade ${PRIORITY_LABEL[parsed.priority].toLowerCase()}`),
      parsed.tags.map((t) => h("span", { class: "tag" }, `#${t}`)));
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
        title: parsed.title, due_date: parsed.due_date || null,
        priority: parsed.priority || "media", tags: parsed.tags,
      });
      capture.value = "";
      drawPreview();
      state.lastId = task.id;
      if (state.view === "done") state.view = "open";
      await refresh();
      toast("Tarefa adicionada.");
    } catch (err) {
      toast(err.message, { tone: "error" });
    } finally {
      add.disabled = false;
      capture.focus();
    }
  });

  fill(root(),
    h("header", { class: "top" },
      h("span", { class: "brand" }, h("img", { src: "/static/icon.svg", alt: "" }), "Tarefas"),
      h("span", { class: "top__spacer" }),
      h("span", { class: "top__user" }, state.user.name),
      h("a", { class: "top__docs", href: "/docs", target: "_blank", rel: "noopener" }, "API"),
      h("button", { class: "btn btn--ghost btn--small", type: "button", onclick: logout }, "Sair")),
    h("div", { class: "layout" },
      els.side,
      h("main", null,
        captureForm,
        h("div", { class: "toolbar" },
          h("div", { class: "search" }, icon("search"), search),
          els.activeFilter),
        els.list)));

  // Atalho: "n" começa uma tarefa nova, "/" vai para a busca.
  document.onkeydown = (event) => {
    if (event.target.closest("input, textarea, select, dialog")) return;
    if (event.key === "n") { event.preventDefault(); capture.focus(); }
    if (event.key === "/") { event.preventDefault(); search.focus(); }
  };

  refresh();
  capture.focus();
}

async function refresh() {
  await Promise.all([loadTasks(), loadSide()]);
}

let loadSeq = 0;
async function loadTasks() {
  const seq = ++loadSeq;
  if (!state.tasks.length) fill(els.list, h("p", { class: "loading" }, "Carregando…"));
  const view = VIEWS[state.view];
  const params = typeof view.params === "function" ? view.params() : view.params;
  try {
    const all = [];
    for (let offset = 0; ; offset += 100) {
      const page = await api.get("/tasks", { ...params, tag: state.tag, q: state.q, sort: view.sort || "due_date", limit: 100, offset });
      all.push(...page.items);
      if (all.length >= page.total || !page.items.length) break;
    }
    if (seq !== loadSeq) return;
    state.tasks = all;
    drawList();
  } catch (err) {
    if (err.status !== 401) fill(els.list, h("div", { class: "empty" }, h("p", null, err.message)));
  }
}

async function loadSide() {
  try {
    [state.stats, state.tags] = await Promise.all([api.get("/tasks/stats"), api.get("/tags")]);
    drawSide();
  } catch { /* a lista já mostra o erro */ }
}

function setView(view) {
  state.view = view;
  drawSide();
  loadTasks();
}

function setTag(tag) {
  state.tag = state.tag === tag ? null : tag;
  drawSide();
  loadTasks();
}

function drawSide() {
  const s = state.stats;
  if (!s) return;
  const done = s.by_status.concluida;
  const open = s.total - done;
  const percent = Math.round(s.completion_rate * 100);
  const counts = [
    ["open", "A fazer", open],
    ["today", "Para hoje", s.due_today + s.overdue],
    ["late", "Atrasadas", s.overdue],
    ["doing", "Em andamento", s.by_status.em_andamento],
    ["done", "Concluídas", done],
  ];
  fill(els.side,
    h("section", null,
      h("p", { class: "progress__text" }, s.total ? `${done} de ${s.total} concluídas` : "Nenhuma tarefa ainda"),
      h("div", { class: "progress__bar", role: "progressbar", "aria-valuenow": percent, "aria-valuemin": 0, "aria-valuemax": 100, "aria-label": "Tarefas concluídas" },
        h("span", { style: `width:${percent}%` })),
      h("div", { class: "counts", role: "group", "aria-label": "Mostrar" },
        counts.map(([key, label, n]) => h("button", {
          class: `count${key === "late" && n ? " count--late" : ""}`, type: "button",
          "aria-pressed": String(state.view === key), onclick: () => setView(key),
        }, h("span", null, label), n !== null && h("span", { class: "count__n" }, n))))),
    state.tags.length > 0 && h("section", null,
      h("h2", { class: "side__heading" }, "Etiquetas"),
      h("div", { class: "tags" }, state.tags.map((t) => h("button", {
        class: "tag", type: "button", "aria-pressed": String(state.tag === t.name), onclick: () => setTag(t.name),
      }, `#${t.name}`, h("span", { class: "tag__n" }, t.tasks))))));

  const filters = [state.tag && `#${state.tag}`, state.q && `“${state.q}”`].filter(Boolean);
  fill(els.activeFilter, filters.length > 0 && [
    h("span", null, `Filtrando por ${filters.join(" e ")}`),
    h("button", { class: "link-btn", type: "button", onclick: () => {
      state.tag = null; state.q = ""; document.querySelector(".search input").value = ""; drawSide(); loadTasks();
    } }, "Limpar"),
  ]);
}

/** Agrupa pelo tempo que falta: é assim que se decide o que fazer primeiro. */
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

function drawList() {
  if (!state.tasks.length) {
    const filtered = state.tag || state.q;
    const messages = {
      open: ["Nada pendente", "Anote a próxima tarefa no campo acima."],
      late: ["Nada atrasado", "Todas as tarefas com prazo estão em dia."],
      today: ["Nada para hoje", "Use “hoje” ao anotar para colocar uma tarefa aqui."],
      doing: ["Nada em andamento", "Abra uma tarefa e mude a situação para Em andamento."],
      done: ["Nenhuma concluída ainda", "Marque o círculo de uma tarefa quando terminar."],
    };
    const [title, text] = filtered ? ["Nenhuma tarefa encontrada", "Tente outra busca ou limpe o filtro."] : messages[state.view];
    fill(els.list, h("div", { class: "empty" }, h("p", { class: "empty__title" }, title), h("p", null, text)));
    return;
  }
  fill(els.list, groupTasks(state.tasks).map(([title, items, kind]) =>
    h("section", { class: `group${kind ? ` group--${kind}` : ""}` },
      h("div", { class: "group__head" },
        h("h2", { class: "group__title" }, title),
        h("span", { class: "group__count" }, items.length)),
      items.map(taskRow))));
  state.lastId = null;
}

function taskRow(task) {
  const done = task.status === "concluida";
  const doing = task.status === "em_andamento";
  const due = dueLabel(task.due_date, done);
  const check = h("button", {
    class: `check${done ? " check--done" : doing ? " check--doing" : ""}`, type: "button",
    "aria-label": done ? `Reabrir: ${task.title}` : `Concluir: ${task.title}`,
    onclick: () => toggleDone(task),
  }, icon("check"));
  return h("article", {
    class: `task${done ? " is-done" : ""}${state.lastId === task.id ? " is-new" : ""}`,
    "data-priority": done ? null : task.priority,
  },
    check,
    h("button", { class: "task__main", type: "button", onclick: () => openEditor(task), "aria-label": `Editar: ${task.title}` },
      h("span", { class: "task__title" }, task.title),
      task.description && h("span", { class: "task__desc" }, task.description),
      (task.tags.length > 0 || doing || task.priority === "alta") && h("span", { class: "task__meta" },
        doing && h("span", { class: "pill pill--doing" }, "Em andamento"),
        task.priority === "alta" && !done && h("span", { class: "pill pill--alta" }, "Alta"),
        task.tags.map((t) => h("span", { class: "tag", role: "presentation" }, `#${t}`)))),
    due && h("span", { class: `task__due${due.kind ? ` task__due--${due.kind}` : ""}` }, due.text));
}

async function toggleDone(task) {
  const next = task.status === "concluida" ? "pendente" : "concluida";
  try {
    await api.patch(`/tasks/${task.id}`, { status: next });
    await refresh();
    if (next === "concluida") {
      toast("Tarefa concluída.", { action: { label: "Desfazer", run: async () => {
        await api.patch(`/tasks/${task.id}`, { status: task.status });
        refresh();
      } } });
    }
  } catch (err) {
    toast(err.message, { tone: "error" });
  }
}

/* ---------- Edição ---------- */

function openEditor(task) {
  const dialog = h("dialog", { class: "dialog", "aria-labelledby": "edit-title" });
  const close = () => dialog.close();
  dialog.addEventListener("close", () => dialog.remove());

  const segmented = (name, options, value) => h("div", { class: "segmented", role: "radiogroup" },
    options.map(([v, label]) => h("label", null,
      h("input", { type: "radio", name, value: v, checked: v === value }), h("span", null, label))));

  const form = h("form", { class: "form", novalidate: true },
    h("label", { class: "field" }, h("span", { class: "field__label" }, "Tarefa"),
      h("input", { class: "input", name: "title", value: task.title, maxlength: "120", required: true })),
    h("label", { class: "field" }, h("span", { class: "field__label" }, "Detalhes"),
      h("textarea", { class: "input", name: "description", maxlength: "2000", placeholder: "Opcional" })),
    h("div", { class: "field" }, h("span", { class: "field__label" }, "Situação"),
      segmented("status", [["pendente", "Pendente"], ["em_andamento", "Em andamento"], ["concluida", "Concluída"]], task.status)),
    h("div", { class: "form__row" },
      h("div", { class: "field" }, h("span", { class: "field__label" }, "Prioridade"),
        segmented("priority", [["baixa", "Baixa"], ["media", "Média"], ["alta", "Alta"]], task.priority)),
      h("label", { class: "field" }, h("span", { class: "field__label" }, "Prazo"),
        h("input", { class: "input", name: "due_date", type: "date", value: task.due_date || "" }))),
    h("label", { class: "field" }, h("span", { class: "field__label" }, "Etiquetas"),
      h("input", { class: "input", name: "tags", value: task.tags.join(", "), placeholder: "Separadas por vírgula: casa, contas" })),
    h("p", { class: "form__error", role: "alert" }));
  form.elements.description.value = task.description || "";

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
      toast(err.message, { tone: "error" });
    }
  });

  const save = h("button", { class: "btn btn--primary", type: "submit" }, "Salvar");
  form.append(h("div", { class: "dialog__foot" }, remove,
    h("div", { style: "display:flex;gap:10px" },
      h("button", { class: "btn btn--ghost", type: "button", onclick: close }, "Cancelar"), save)));

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
      await refresh();
      toast("Alterações salvas.");
    } catch (err) {
      form.querySelector(".form__error").textContent = err.message;
      save.disabled = false;
    }
  });

  dialog.append(h("div", { class: "dialog__inner" },
    h("div", { class: "dialog__head" },
      h("h2", { class: "dialog__title", id: "edit-title" }, "Editar tarefa"),
      h("button", { class: "icon-btn", type: "button", "aria-label": "Fechar", onclick: close }, icon("close"))),
    form));
  document.body.append(dialog);
  dialog.showModal();
}

/* ---------- Início ---------- */

(async () => {
  if (!memoryToken) return renderAuth();
  try {
    state.user = await api.get("/auth/me");
    renderApp();
  } catch {
    memoryToken = null;
    storage.set(null);
    renderAuth();
  }
})();
