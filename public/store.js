// Project persistence: Cloudflare Worker/KV first, localStorage as offline cache/fallback.
const LS = "eduphi:projects";
const CLIENT = "eduphi:client";

export function clientId() {
  let id = localStorage.getItem(CLIENT);
  if (!id) { id = "c_" + crypto.randomUUID().replace(/-/g, "").slice(0, 24); localStorage.setItem(CLIENT, id); }
  return id;
}
const headers = () => ({ "content-type": "application/json", "x-eduphi-client": clientId() });
const readLocal = () => { try { return JSON.parse(localStorage.getItem(LS) || "{}"); } catch { return {}; } };

export async function saveProject(p) {
  const all = readLocal(); all[p.id] = p;
  try { localStorage.setItem(LS, JSON.stringify(all)); } catch { /* quota: remote copy is authoritative */ }
  try { const r = await fetch(`/api/projects/${p.id}`, { method: "PUT", headers: headers(), body: JSON.stringify(p) }); return r.ok ? "cloud" : "local"; }
  catch { return "local"; }
}
export async function listProjects() {
  const map = new Map(Object.values(readLocal()).map((p) => [p.id, { id: p.id, title: p.title, updatedAt: p.updatedAt, cards: Object.keys(p.cards).length }]));
  try { const r = await fetch("/api/projects", { headers: headers() }); if (r.ok) for (const m of (await r.json()).projects) map.set(m.id, { ...map.get(m.id), ...m }); } catch { /* offline */ }
  return [...map.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}
export async function loadProject(id) {
  try { const r = await fetch(`/api/projects/${id}`, { headers: headers() }); if (r.ok) return await r.json(); } catch { /* fall through */ }
  return readLocal()[id] || null;
}
export async function deleteProject(id) {
  const all = readLocal(); delete all[id]; localStorage.setItem(LS, JSON.stringify(all));
  try { await fetch(`/api/projects/${id}`, { method: "DELETE", headers: headers() }); } catch { /* offline */ }
}
export async function fetchHandoff(id) {
  const r = await fetch(`/api/handoff/${encodeURIComponent(id)}`); if (!r.ok) throw new Error("handoff not found"); return r.json();
}
export async function putHandoff(data) {
  const r = await fetch("/api/handoff", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
  if (!r.ok) throw new Error("handoff failed"); return (await r.json()).id;
}
