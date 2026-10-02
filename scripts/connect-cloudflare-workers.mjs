import fs from "node:fs/promises";

const API = "https://api.cloudflare.com/client/v4";
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
const cfg = JSON.parse(await fs.readFile("cloudflare-workers.json", "utf8"));

if (!accountId || !token) throw new Error("Cloudflare credentials are missing.");

async function request(path, init = {}) {
  const res = await fetch(API + "/accounts/" + accountId + path, {
    ...init,
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", ...(init.headers || {}) }
  });
  const data = await res.json();
  return { status: res.status, ok: res.ok && data.success !== false, data };
}

async function workers() {
  const out = [];
  let page = 1;
  while (true) {
    const r = await request("/workers/scripts-search?page=" + page + "&per_page=100&order_by=name");
    if (!r.ok) throw new Error("Could not search Workers: " + JSON.stringify(r.data.errors));
    const batch = r.data.result || [];
    out.push(...batch.map(x => ({ id: x.script_name, tag: x.id })));
    const info = r.data.result_info || {};
    if (info.total_pages && page < info.total_pages) { page++; continue; }
    if (!info.total_pages && batch.length === 100) { page++; continue; }
    break;
  }
  return [...new Map(out.map(w => [w.id, w])).values()];
}

async function triggers(tag) {
  const r = await request("/builds/workers/" + encodeURIComponent(tag) + "/triggers");
  if (!r.ok) throw new Error("Could not list triggers for tag " + tag + ": " + JSON.stringify(r.data.errors));
  return r.data.result || [];
}

// Ensure test Worker 114 exists before connecting triggers.\nlet all = await workers();\nif (!all.some(x => x.id === "114")) {\n  const form = new FormData();\n  form.append("metadata", new Blob([JSON.stringify({ main_module: "index.js", compatibility_date: "2026-10-02" })], { type: "application/json" }), "metadata.json");\n  form.append("index.js", new Blob([`export default { async fetch() { return new Response("Worker 114"); } };`], { type: "application/javascript+module" }), "index.js");\n  const res = await fetch(API + "/accounts/" + accountId + "/workers/scripts/114", { method: "PUT", headers: { Authorization: "Bearer " + token }, body: form });\n  const data = await res.json();\n  if (!res.ok || data.success === false) throw new Error("Could not create Worker 114: " + JSON.stringify(data.errors || data));\n  console.log("CREATED Worker 114");\n  all = await workers();\n}\n
console.log("Workers found:", all.length);

const reference = all.find(x => x.id === cfg.reference_worker);
if (!reference?.tag) throw new Error("Reference Worker 01 was not found.");

const referenceTriggers = await triggers(reference.tag);
const source = referenceTriggers.find(x => (x.branch_includes || []).includes(cfg.branch)) || referenceTriggers[0];
if (!source?.repo_connection?.repo_connection_uuid || !source?.build_token_uuid)
  throw new Error("Worker 01 does not have a reusable GitHub Builds trigger.");

let created = 0, skipped = 0, failed = 0;
for (const worker of all) {
  try {
    const current = await triggers(worker.tag);
    if (current.some(x => (x.branch_includes || []).includes(cfg.branch))) {
      console.log("SKIP", worker.id, "production trigger already exists"); skipped++; continue;
    }
    const payload = {
      external_script_id: worker.tag,
      repo_connection_uuid: source.repo_connection.repo_connection_uuid,
      build_token_uuid: source.build_token_uuid,
      trigger_name: cfg.trigger_name,
      build_command: cfg.build_command,
      deploy_command: cfg.deploy_command,
      root_directory: "/" + worker.id,
      branch_includes: [cfg.branch],
      branch_excludes: [],
      path_includes: cfg.path_includes,
      path_excludes: cfg.path_excludes,
      build_caching_enabled: cfg.build_caching_enabled
    };
    const r = await request("/builds/triggers", { method: "POST", body: JSON.stringify(payload) });
    if (r.ok) { console.log("OK", worker.id, "-> /" + worker.id); created++; continue; }
    const message = JSON.stringify(r.data.errors || r.data);
    if (r.status === 409 || /already|exist|conflict/i.test(message)) {
      console.log("SKIP", worker.id, message); skipped++;
    } else { console.log("FAIL", worker.id, message); failed++; }
  } catch (err) { console.log("FAIL", worker.id, err.message); failed++; }
}
console.log("DONE", { created, skipped, failed, total: all.length });
if (failed) process.exitCode = 1;
