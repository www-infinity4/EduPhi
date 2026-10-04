// EduPhi core: pure logic shared by the browser UI, the Worker and tests.

export const COLORS = {
  yellow: { label: "Explore", hex: "#f5c518", intent: "continue naturally and discover closely related information", section: "Related concepts" },
  green: { label: "Engineer", hex: "#2e9e57", intent: "mechanisms, construction, design, systems, components and how it works", section: "How it works" },
  blue: { label: "Understand", hex: "#2f6fdd", intent: "principles, definitions, background, evidence and deeper context", section: "Principles and background" },
  red: { label: "Challenge", hex: "#d8382f", intent: "problems, limitations, counterarguments, failures, risks and open questions", section: "Challenges and open questions" },
  orange: { label: "Build", hex: "#f08a1c", intent: "turn current knowledge into a lesson, design or project component", section: "Build and apply" },
};
export const COLOR_KEYS = Object.keys(COLORS);

const STOP = new Set(("the a an and or but of to in on for with as at by from is are was were be been this that these those it its into than then so such not can could may might will would should about over under between their there which what when where how why who also more most some any each other only very just have has had do does did you your we our they them he she his her").split(" "));

export function uid(prefix = "id") {
  const r = (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`).replace(/-/g, "");
  return `${prefix}_${r.slice(0, 16)}`;
}

/** Contract: ?q=...&app=newsphi&title=...&url=...&h=<handoffId> */
export function parseHandoff(search) {
  const p = new URLSearchParams(search);
  const clean = (k) => (p.get(k) || "").trim();
  const ctx = { q: clean("q"), app: clean("app"), title: clean("title"), url: clean("url"), handoffId: clean("h") };
  if (ctx.url && !/^https?:\/\//i.test(ctx.url)) ctx.url = "";
  return ctx;
}

export const URL_CONTEXT_LIMIT = 1500;

/** Build a link into EduPhi. Large context is never truncated: it must go through the shared handoff store. */
export function buildHandoffUrl(base, { q = "", app = "", title = "", url = "", context = "" } = {}, handoffId = "") {
  const u = new URL(base);
  if (q) u.searchParams.set("q", q);
  if (app) u.searchParams.set("app", app);
  if (title) u.searchParams.set("title", title);
  if (url) u.searchParams.set("url", url);
  if (handoffId) u.searchParams.set("h", handoffId);
  const needsStore = context.length > 0 || u.search.length > URL_CONTEXT_LIMIT;
  if (needsStore && !handoffId) return { url: u.toString(), needsStore: true };
  return { url: u.toString(), needsStore: false };
}

export function createProject({ query, origin = {} }) {
  const id = uid("proj");
  const now = Date.now();
  const root = {
    id: uid("card"), projectId: id, parentId: null, word: null, color: "orange",
    title: query, body: origin.title ? `Starting from “${origin.title}”${origin.app ? ` (${origin.app})` : ""}.` : `Project question: ${query}`,
    terms: extractTerms(query + " " + (origin.title || "")),
    sources: origin.url ? [{ title: origin.title || origin.url, url: origin.url, kind: "origin", app: origin.app || "" }] : [],
    relation: "root", createdAt: now,
  };
  return {
    id, title: query, query, origin, createdAt: now, updatedAt: now,
    activeColor: "yellow", rootId: root.id, cards: { [root.id]: root },
    selections: [], steering: [], pages: [],
  };
}

export function extractTerms(text, max = 6) {
  const counts = new Map();
  const words = (text.match(/[A-Za-z][A-Za-z'-]{3,}/g) || []);
  for (const w of words) {
    const k = w.toLowerCase();
    if (STOP.has(k)) continue;
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length).slice(0, max).map(([k]) => k);
}

/** Split text into [{text, term?}] segments so only chosen terms are highlighted. */
export function segmentText(text, terms) {
  const valid = [...new Set(terms)].filter(Boolean).sort((a, b) => b.length - a.length);
  if (!valid.length) return [{ text }];
  const re = new RegExp(`\\b(${valid.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "gi");
  const out = []; let last = 0; const seen = new Set(); let m;
  while ((m = re.exec(text))) {
    const k = m[0].toLowerCase();
    if (seen.has(k)) continue; // highlight first occurrence only
    seen.add(k);
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    out.push({ text: m[0], term: k });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

const searchSource = (w) => ({ title: `Search: ${w}`, url: `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(w)}`, kind: "search" });

/** Local scaffold generator (used when no generateUrl is configured). Structure only, no factual claims. */
export async function localGenerator({ project, parent, word, color }) {
  const topic = project.query;
  const t = {
    yellow: [`Around “${word}”`, `Within ${topic}, ${word} connects to neighbouring ideas. Look for what ${word} is usually grouped with, where it appears, and which related concepts a learner meets next.`],
    green: [`How ${word} works`, `To engineer an understanding of ${word}, list its components, the mechanism connecting them, the inputs and outputs, and the design choices that change the result.`],
    blue: [`Understanding ${word}`, `Define ${word} precisely, state the underlying principle, give the background that makes it make sense, and note what evidence supports the explanation.`],
    red: [`Challenging ${word}`, `Question ${word}: where does it fail, what are its limits, which competing explanations exist, what risks follow, and which questions remain unresolved?`],
    orange: [`Build with ${word}`, `Turn ${word} into something reusable: a lesson section, a worked example, a diagram or a project component that applies it within ${topic}.`],
  }[color];
  const terms = extractTerms(`${t[1]} ${parent?.title || ""}`.replace(new RegExp(word, "gi"), ""), 5);
  return { title: t[0], body: t[1], terms, sources: [searchSource(word), ...(parent?.sources || []).filter((s) => s.kind === "origin")] };
}

export async function generateCard(project, parentId, word, color, generator = localGenerator, steering = "") {
  const parent = project.cards[parentId];
  if (!parent) throw new Error("Unknown parent card");
  if (!COLORS[color]) throw new Error("Unknown color");
  const g = await generator({ project, parent, word, color, steering });
  const card = {
    id: uid("card"), projectId: project.id, parentId, word, color,
    title: g.title, body: g.body, terms: g.terms || extractTerms(g.body), sources: g.sources || [],
    relation: `${COLORS[color].label} from “${word}” in “${parent.title}”`,
    steering: steering || "", createdAt: Date.now(),
  };
  const next = { ...project, cards: { ...project.cards, [card.id]: card }, updatedAt: Date.now(),
    selections: [...project.selections, { cardId: parentId, word, color, resultId: card.id }] };
  if (steering) next.steering = [...project.steering, { text: steering, at: card.createdAt, cardId: card.id }];
  return { project: next, card };
}

export function childrenOf(project, id) {
  return Object.values(project.cards).filter((c) => c.parentId === id).sort((a, b) => a.createdAt - b.createdAt);
}
export function pathTo(project, id) {
  const out = []; let c = project.cards[id];
  while (c) { out.unshift(c); c = c.parentId && project.cards[c.parentId]; }
  return out;
}

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
const safeUrl = (u) => (/^https?:\/\//i.test(u) ? u : "#");

/** Turn the project tree into a coherent, mobile-first standalone HTML page. */
export function buildEducationalPage(project) {
  const root = project.cards[project.rootId];
  const all = Object.values(project.cards).filter((c) => c.id !== root.id).sort((a, b) => a.createdAt - b.createdAt);
  const sections = COLOR_KEYS.map((k) => ({ k, cards: all.filter((c) => c.color === k) })).filter((s) => s.cards.length);
  const explored = new Set(all.map((c) => (c.word || "").toLowerCase()));
  const further = [...new Set(Object.values(project.cards).flatMap((c) => c.terms))].filter((t) => !explored.has(t)).slice(0, 12);
  const srcMap = new Map();
  for (const c of Object.values(project.cards)) for (const s of c.sources) if (!srcMap.has(s.url)) srcMap.set(s.url, s);
  const media = (c) => `<figure class="media" role="img" aria-label="Visual placeholder for ${esc(c.title)}"><span>Add diagram or image: ${esc(c.title)}</span></figure>`;
  const cardHtml = (c) => {
    const path = pathTo(project, c.id).map((p) => esc(p.word || p.title)).join(" → ");
    return `<article id="${esc(c.id)}"><h3>${esc(c.title)}</h3><p class="path">${path}</p><p>${esc(c.body)}</p>${media(c)}</article>`;
  };
  const toc = [`<a href="#overview">Overview</a>`, ...sections.map((s) => `<a href="#sec-${s.k}">${esc(COLORS[s.k].section)}</a>`), `<a href="#sources">Sources</a>`, `<a href="#further">Further learning</a>`].join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(project.title)} — EduPhi</title>
<style>body{margin:0;font:16px/1.6 system-ui,sans-serif;color:#222;background:#fffaf3}header{background:#f08a1c;color:#fff;padding:1.2rem 1rem}h1{margin:0;font-size:1.5rem}main{max-width:44rem;margin:0 auto;padding:1rem}nav{display:flex;flex-wrap:wrap;gap:.5rem;margin:1rem 0}nav a{background:#fff;border:1px solid #f0c48a;border-radius:1rem;padding:.25rem .75rem;color:#8a4b00;text-decoration:none;font-size:.9rem}section{margin:2rem 0}h2{border-bottom:3px solid #f08a1c;padding-bottom:.25rem}article{background:#fff;border-radius:.6rem;padding:.2rem 1rem 1rem;margin:1rem 0;box-shadow:0 1px 3px #0002}.path{font-size:.8rem;color:#777}.media{margin:0;border:2px dashed #f0c48a;border-radius:.5rem;padding:1.5rem 1rem;text-align:center;color:#999;font-size:.85rem}li{margin:.3rem 0;overflow-wrap:anywhere}</style></head><body>
<header><h1>${esc(project.title)}</h1></header><main><nav aria-label="Contents">${toc}</nav>
<section id="overview"><h2>Overview</h2><p>${esc(root.body)}</p>${media(root)}</section>
${sections.map((s) => `<section id="sec-${s.k}"><h2>${esc(COLORS[s.k].section)}</h2>${s.cards.map(cardHtml).join("")}</section>`).join("\n")}
<section id="sources"><h2>Sources</h2>${srcMap.size ? `<ul>${[...srcMap.values()].map((s) => `<li><a href="${esc(safeUrl(s.url))}" rel="noopener noreferrer">${esc(s.title)}</a>${s.kind === "search" ? " (search pointer)" : ""}</li>`).join("")}</ul>` : "<p>No sources recorded.</p>"}</section>
<section id="further"><h2>Further learning paths</h2>${further.length ? `<ul>${further.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : "<p>All highlighted concepts have been explored.</p>"}</section>
</main></body></html>`;
}
