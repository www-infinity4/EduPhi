import { COLORS, COLOR_KEYS, createProject, generateCard, localGenerator, segmentText, childrenOf, pathTo, parseHandoff, buildEducationalPage } from "./core.js";
import * as store from "./store.js";

const $ = (id) => document.getElementById(id);
const cfg = window.EDUPHI_CONFIG || {};
let project = null, focusId = null;

async function remoteGenerator(args) {
  const { project: p, parent, word, color, steering } = args;
  const r = await fetch(cfg.generateUrl, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: p.query, parent: { title: parent.title, body: parent.body }, word, color, mode: COLORS[color].label, intent: COLORS[color].intent, steering }) });
  if (!r.ok) throw new Error("generator failed");
  return r.json();
}
const generator = cfg.generateUrl ? remoteGenerator : localGenerator;

function el(tag, props = {}, ...kids) {
  const e = Object.assign(document.createElement(tag), props);
  for (const k of kids) e.append(k);
  return e;
}

function renderWheel() {
  $("wheel").replaceChildren(...COLOR_KEYS.map((k) => {
    const b = el("button", { type: "button", title: `${COLORS[k].label}: ${COLORS[k].intent}`, textContent: COLORS[k].label[0] });
    b.style.background = COLORS[k].hex;
    b.setAttribute("aria-pressed", String(project?.activeColor === k));
    b.setAttribute("aria-label", COLORS[k].label);
    b.onclick = () => { if (project) { project.activeColor = k; persist(); } render(); };
    return b;
  }));
  const c = COLORS[project?.activeColor || "yellow"];
  $("mode").textContent = `${c.label}: ${c.intent}`;
}

function renderTree(id, parent) {
  const kids = childrenOf(project, id);
  const c = project.cards[id];
  const a = el("a", { textContent: c.word ? `${c.word} · ${COLORS[c.color].label}` : c.title, className: id === focusId ? "cur" : "" });
  a.style.borderColor = COLORS[c.color].hex;
  a.onclick = () => { focusId = id; render(); document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }); };
  const li = el("li", {}, a);
  if (kids.length) li.append(el("ul", {}, ...kids.map((k) => renderTree(k.id))));
  return li;
}

function cardEl(c) {
  const art = el("article", { id: c.id, className: "card" + (c.id === focusId ? " focus" : "") });
  art.style.borderLeftColor = COLORS[c.color].hex;
  art.append(el("h3", { textContent: c.title }), el("p", { className: "rel", textContent: c.relation + (c.steering ? ` · steering: ${c.steering}` : "") }));
  const p = el("p");
  for (const s of segmentText(c.body, c.terms)) {
    if (!s.term) { p.append(s.text); continue; }
    const b = el("button", { className: "term", textContent: s.text, title: `${COLORS[project.activeColor].label} ${s.text}` });
    b.style.borderBottomColor = COLORS[project.activeColor].hex;
    b.onclick = () => branch(c.id, s.term);
    p.append(b);
  }
  art.append(p);
  if (c.sources.length) art.append(el("p", { className: "src" }, "Sources: ", ...c.sources.flatMap((s, i) => [i ? ", " : "", /^https?:/.test(s.url) ? el("a", { href: s.url, target: "_blank", rel: "noopener noreferrer", textContent: s.title }) : s.title])));
  return art;
}

function render() {
  renderWheel();
  $("cards").replaceChildren();
  $("tree").replaceChildren();
  if (!project) return;
  focusId ||= project.rootId;
  $("tree").append(el("ul", {}, renderTree(project.rootId)));
  const o = project.origin;
  $("origin").textContent = o?.app || o?.title ? `From ${o.app || "another app"}: ${o.title || ""} ${o.url || ""}` : "";
  // Show the path to the focused card plus its direct children, keeping earlier branches reachable via the tree.
  const shown = [...pathTo(project, focusId), ...childrenOf(project, focusId)];
  $("cards").append(...shown.map(cardEl));
}

async function persist() { project && await store.saveProject(project); }

async function branch(parentId, word) {
  try {
    const r = await generateCard(project, parentId, word, project.activeColor, generator, $("steer").value.trim());
    project = r.project; focusId = r.card.id; $("steer").value = "";
    await persist(); render();
    document.getElementById(r.card.id)?.scrollIntoView({ behavior: "smooth" });
  } catch (e) { alert("Could not generate card: " + e.message); }
}

async function start(query, origin) {
  project = createProject({ query, origin }); focusId = project.rootId;
  await persist(); render();
}

$("startForm").onsubmit = (e) => { e.preventDefault(); const q = $("q").value.trim(); if (q) start(q, {}); };
$("newBtn").onclick = async () => { await persist(); project = null; focusId = null; $("q").value = ""; history.replaceState(null, "", location.pathname); render(); $("q").focus(); };
$("histBtn").onclick = async () => {
  const items = await store.listProjects();
  $("histList").replaceChildren(...(items.length ? items.map((m) => {
    const open = el("button", { textContent: `${m.title} (${m.cards ?? "?"} cards, ${new Date(m.updatedAt).toLocaleString()})` });
    open.onclick = async () => { const p = await store.loadProject(m.id); if (p) { project = p; focusId = p.rootId; render(); $("hist").close(); } };
    const del = el("button", { textContent: "Delete" });
    del.onclick = async () => { if (confirm("Delete this project?")) { await store.deleteProject(m.id); open.parentElement.remove(); } };
    return el("li", {}, open, del);
  }) : [el("li", { textContent: "No projects yet." })]));
  $("hist").showModal();
};
$("histClose").onclick = () => $("hist").close();
$("pageBtn").onclick = () => {
  if (!project) return;
  const html = buildEducationalPage(project);
  $("pageFrame").srcdoc = html;
  $("dl").onclick = () => { const a = el("a", { href: URL.createObjectURL(new Blob([html], { type: "text/html" })), download: "eduphi-page.html" }); a.click(); };
  $("pageDlg").showModal();
};
$("pageClose").onclick = () => $("pageDlg").close();

(async () => {
  const ctx = parseHandoff(location.search);
  let { q, app, title, url } = ctx; let extra = null;
  if (ctx.handoffId) {
    try { extra = await store.fetchHandoff(ctx.handoffId); q ||= extra.q || ""; app ||= extra.app || ""; title ||= extra.title || ""; url ||= extra.url || ""; }
    catch { $("origin").textContent = "Shared handoff could not be loaded; context not truncated or guessed."; }
  }
  if (q) { $("q").value = q; await start(q, { app, title, url, context: extra?.context || "" }); } else render();
})();
