import { test } from "node:test";
import assert from "node:assert/strict";
import { createProject, generateCard, parseHandoff, buildHandoffUrl, segmentText, buildEducationalPage, pathTo, COLOR_KEYS, extractTerms } from "../public/core.js";
import { handle } from "../worker/worker.js";

test("handoff contract", () => {
  const c = parseHandoff("?q=fusion&app=newsphi&title=T&url=https%3A%2F%2Fx.org%2Fa&h=h_abc123");
  assert.deepEqual(c, { q: "fusion", app: "newsphi", title: "T", url: "https://x.org/a", handoffId: "h_abc123" });
  assert.equal(parseHandoff("?url=javascript:alert(1)").url, "");
  assert.equal(buildHandoffUrl("https://e.test/", { q: "a", context: "big" }).needsStore, true);
  assert.equal(buildHandoffUrl("https://e.test/", { q: "a" }).needsStore, false);
});

test("only chosen terms are highlighted", () => {
  const segs = segmentText("Plasma confinement needs plasma heating", ["plasma", "heating"]);
  assert.deepEqual(segs.filter((s) => s.term).map((s) => s.term), ["plasma", "heating"]);
  assert.equal(segs.map((s) => s.text).join(""), "Plasma confinement needs plasma heating");
  assert.ok(extractTerms("the and of").length === 0);
});

test("branching keeps earlier paths: Explore -> Engineer -> Understand", async () => {
  let p = createProject({ query: "solar sails", origin: { app: "newsphi", title: "Story", url: "https://n.test/s" } });
  const root = p.rootId;
  let r = await generateCard(p, root, "sails", "yellow"); p = r.project; const a = r.card;
  r = await generateCard(p, a.id, "sails", "green", undefined, "focus on materials"); p = r.project; const b = r.card;
  r = await generateCard(p, b.id, "sails", "blue"); p = r.project; const c = r.card;
  r = await generateCard(p, root, "sails", "red"); p = r.project;
  assert.deepEqual(pathTo(p, c.id).map((x) => x.color), ["orange", "yellow", "green", "blue"]);
  assert.equal(c.projectId, p.id);
  assert.ok(c.relation && c.sources.length);
  assert.equal(p.steering.length, 1);
  assert.equal(Object.keys(p.cards).length, 5);
  assert.equal(p.selections.length, 4);
  assert.ok(COLOR_KEYS.length === 5);
  const html = buildEducationalPage(p);
  assert.match(html, /viewport/); assert.match(html, /id="sources"/); assert.match(html, /id="further"/);
  assert.match(html, /How it works/); assert.match(html, /n\.test\/s/);
});

test("page escapes content", async () => {
  const p = createProject({ query: "<script>alert(1)</script>" });
  assert.ok(!buildEducationalPage(p).includes("<script>alert"));
});

test("worker stores projects per client and handoffs", async () => {
  const data = new Map();
  const kv = { put: async (k, v, o) => data.set(k, { v, m: o?.metadata }), get: async (k) => data.get(k)?.v ?? null, delete: async (k) => data.delete(k),
    list: async ({ prefix }) => ({ keys: [...data].filter(([k]) => k.startsWith(prefix)).map(([name, x]) => ({ name, metadata: x.m })) }) };
  const env = { EDUPHI_KV: kv };
  const req = (path, init = {}) => handle(new Request("https://e.test" + path, init), env);
  const H = { "x-eduphi-client": "c_client1234" };
  const p = createProject({ query: "q" });
  assert.equal((await req(`/api/projects/${p.id}`, { method: "PUT", headers: H, body: JSON.stringify(p) })).status, 200);
  assert.equal((await (await req("/api/projects", { headers: H })).json()).projects.length, 1);
  assert.equal((await req(`/api/projects/${p.id}`, { headers: { "x-eduphi-client": "c_other12345" } })).status, 404);
  assert.equal((await req("/api/projects")).status, 401);
  const { id } = await (await req("/api/handoff", { method: "POST", body: JSON.stringify({ q: "x", context: "long" }) })).json();
  assert.equal((await (await req(`/api/handoff/${id}`)).json()).context, "long");
});
