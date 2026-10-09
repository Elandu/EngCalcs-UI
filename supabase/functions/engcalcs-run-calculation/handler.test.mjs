import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { webcrypto } from "node:crypto";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

// Execute the actual entrypoint and its imports, replacing only external services.
function fixture({ role = "engineer", saveError = null } = {}) {
  const calls = [];
  let handler;
  const admin = {
    auth: { getUser: async () => ({ data: { user: { id: "actor" } }, error: null }) },
    from(table) {
      assert.ok(["projects", "organisation_members"].includes(table), "writes must use the RPC");
      const query = {
        select() { return query; },
        eq() { return query; },
        async maybeSingle() {
          return { data: table === "projects" ? { id: "project", organisation_id: "org" } : { role } };
        },
      };
      return query;
    },
    async rpc(name, payload) {
      calls.push({ name, payload });
      return { error: saveError, data: saveError ? null : {
        calculationId: "saved-calculation", runId: "saved-run", runSequence: 1, parentRunId: null,
      } };
    },
  };
  const cache = new Map();
  const load = (path) => {
    if (cache.has(path)) return cache.get(path).exports;
    const module = { exports: {} };
    cache.set(path, module);
    const code = ts.transpileModule(readFileSync(path, "utf8"), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText;
    runInNewContext(code, {
      module, exports: module.exports,
      require(specifier) {
        if (specifier.startsWith("jsr:")) return {};
        if (specifier.startsWith("npm:@supabase/supabase-js@")) return { createClient: () => admin };
        assert.ok(specifier.startsWith("."), `Unexpected import: ${specifier}`);
        return load(resolve(dirname(path), specifier));
      },
      Deno: { env: { get: () => undefined }, serve: (callback) => { handler = callback; } },
      Response, Request, TextEncoder, crypto: webcrypto, structuredClone,
      fetch: async (url) => Response.json(url.endsWith("/run")
        ? { value: 4, warnings: ["Review required"] }
        : { input_schema: { type: "object" }, plugin: { id: "fixture", version: "1" } }),
    }, { filename: path });
    return module.exports;
  };
  load(fileURLToPath(new URL("./index.ts", import.meta.url)));
  assert.equal(typeof handler, "function");
  return {
    calls,
    run: (body, token = "test-user-token") => handler(new Request("http://localhost", {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: JSON.stringify(body),
    })),
  };
}

const input = { projectId: "project", calculationId: "test.calc", title: "Standalone", inputs: { value: 2 } };

test("original endpoint saves an unlinked run and audit through one atomic RPC", async () => {
  const { run, calls } = fixture();
  const response = await run(input);
  assert.equal(response.status, 200);
  const saved = await response.json();
  assert.equal(saved.runId, "saved-run");
  assert.equal(calls.length, 1);
  const { name, payload } = calls[0];
  assert.equal(name, "engcalcs_save_run");
  assert.equal(payload.p_actor_id, "actor");
  assert.equal(payload.p_expected_run_id, null);
  assert.equal(payload.p_calculation_id, null);
  assert.equal(JSON.stringify(payload.p_run.provenance_json.linked_inputs), "[]");
  assert.equal(JSON.stringify(payload.p_run.warnings_json), '["Review required"]');
  assert.match(payload.p_run.input_hash, /^[a-f0-9]{64}$/);
});

test("original endpoint reports failed atomic saves without success IDs or cleanup writes", async () => {
  const { run, calls } = fixture({ saveError: { code: "42501", message: "Engineer access required" } });
  const response = await run(input);
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "Engineer access required" });
  assert.equal(calls.length, 1);
});

test("original endpoint rejects absent auth, viewer writes and malformed inputs before persistence", async () => {
  const regular = fixture();
  assert.equal((await regular.run(input, "")).status, 401);
  assert.equal((await regular.run({ ...input, inputs: [] })).status, 400);
  assert.equal((await regular.run({ ...input, title: 123 })).status, 400);
  assert.equal(regular.calls.length, 0);
  const viewer = fixture({ role: "viewer" });
  assert.equal((await viewer.run(input)).status, 403);
  assert.equal(viewer.calls.length, 0);
});
