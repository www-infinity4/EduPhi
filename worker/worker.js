// Cloudflare Worker: project persistence + shared handoff store (KV). Static UI is served via ASSETS.
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
const ID = /^[A-Za-z0-9_]{6,64}$/;
const MAX = 1_000_000;
const HANDOFF_TTL = 60 * 60 * 24 * 7;

export async function handle(request, env) {
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean); // api, projects|handoff, id?
  if (parts[0] !== "api") return env.ASSETS ? env.ASSETS.fetch(request) : json({ error: "not found" }, 404);
  const kv = env.EDUPHI_KV;
  if (!kv) return json({ error: "storage not configured" }, 503);

  if (parts[1] === "handoff") {
    if (request.method === "POST" && parts.length === 2) {
      const text = await request.text();
      if (text.length > MAX) return json({ error: "too large" }, 413);
      let data; try { data = JSON.parse(text); } catch { return json({ error: "invalid json" }, 400); }
      const id = "h_" + crypto.randomUUID().replace(/-/g, "").slice(0, 20);
      await kv.put(`handoff:${id}`, JSON.stringify(data), { expirationTtl: HANDOFF_TTL });
      return json({ id }, 201);
    }
    if (request.method === "GET" && ID.test(parts[2] || "")) {
      const v = await kv.get(`handoff:${parts[2]}`);
      return v ? new Response(v, { headers: { "content-type": "application/json" } }) : json({ error: "not found" }, 404);
    }
    return json({ error: "bad request" }, 400);
  }

  if (parts[1] === "projects") {
    const client = request.headers.get("x-eduphi-client") || "";
    if (!ID.test(client)) return json({ error: "missing client id" }, 401);
    const prefix = `project:${client}:`;
    if (request.method === "GET" && parts.length === 2) {
      const list = await kv.list({ prefix });
      const items = list.keys.map((k) => ({ id: k.name.slice(prefix.length), ...(k.metadata || {}) }));
      return json({ projects: items });
    }
    const id = parts[2];
    if (!ID.test(id || "")) return json({ error: "bad id" }, 400);
    if (request.method === "GET") {
      const v = await kv.get(prefix + id);
      return v ? new Response(v, { headers: { "content-type": "application/json" } }) : json({ error: "not found" }, 404);
    }
    if (request.method === "PUT") {
      const text = await request.text();
      if (text.length > MAX) return json({ error: "too large" }, 413);
      let p; try { p = JSON.parse(text); } catch { return json({ error: "invalid json" }, 400); }
      if (p.id !== id) return json({ error: "id mismatch" }, 400);
      await kv.put(prefix + id, text, { metadata: { title: String(p.title || "").slice(0, 120), updatedAt: p.updatedAt || 0, cards: Object.keys(p.cards || {}).length } });
      return json({ ok: true });
    }
    if (request.method === "DELETE") { await kv.delete(prefix + id); return json({ ok: true }); }
  }
  return json({ error: "not found" }, 404);
}

export default { fetch: handle };
