import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile, access } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const slotsPath = path.join(rootDir, "config", "desktop-slots.json");
const require = createRequire(import.meta.url);
const { classifyRequest } = require("../lib/cowork-mitm/route-classifier");
const { buildRouterUrl, sanitizeRouterHeaders } = require("../lib/cowork-mitm/router-adapter");

async function readSlots() {
  const raw = await readFile(slotsPath, "utf8");
  const payload = JSON.parse(raw);
  return Array.isArray(payload?.slots) ? payload.slots : [];
}

function listen(server, port = 0) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      resolve(address.port);
    });
  });
}

async function closeServer(server) {
  await new Promise((resolve) => server.close(() => resolve()));
}

async function waitForServer(url, attempts = 20) {
  let lastError;

  for (let index = 0; index < attempts; index += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
      lastError = new Error(`Health probe returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await delay(150);
  }

  throw lastError || new Error("Server did not become ready");
}

async function waitForJson(url, predicate, attempts = 20) {
  let lastError;

  for (let index = 0; index < attempts; index += 1) {
    try {
      const response = await fetch(url);
      const payload = await response.json();
      if (response.ok && predicate(payload)) {
        return payload;
      }
      lastError = new Error(`Predicate not satisfied for ${url}`);
    } catch (error) {
      lastError = error;
    }

    await delay(150);
  }

  throw lastError || new Error(`JSON endpoint did not become ready: ${url}`);
}

function createCatalogServer() {
  return http.createServer((req, res) => {
    if (req.url === "/v1/models") {
      const payload = {
        data: [
          { id: "cx/gpt-5.4", owned_by: "cx", root: "gpt-5.4" },
          { id: "cx/gpt-5.3-codex-high", owned_by: "cx", root: "gpt-5.3-codex-high" },
          { id: "cc/claude-sonnet-4-6", owned_by: "cc", root: "claude-sonnet-4-6" }
        ]
      };

      const body = JSON.stringify(payload);
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": Buffer.byteLength(body)
      });
      res.end(body);
      return;
    }

    if (req.url === "/v1/messages" && req.method === "POST") {
      const chunks = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        const payload = {
          ok: true,
          path: req.url,
          authorization: req.headers.authorization || "",
          body: body ? JSON.parse(body) : null
        };
        const response = JSON.stringify(payload);
        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Length": Buffer.byteLength(response)
        });
        res.end(response);
      });
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Not found" }));
  });
}

async function main() {
  assert.equal(classifyRequest({ method: "POST", pathname: "/v1/messages" }), "router_passthrough");
  assert.equal(classifyRequest({ method: "POST", pathname: "/v1/oauth/test/authorize" }), "oauth_passthrough");
  assert.equal(classifyRequest({ method: "GET", pathname: "/api/oauth/profile" }), "profile_passthrough");
  assert.equal(classifyRequest({ method: "GET", pathname: "/api/unknown" }), "unsupported_passthrough");
  assert.equal(buildRouterUrl("http://127.0.0.1:20128/v1", "/v1/messages", "?a=1"), "http://127.0.0.1:20128/v1/messages?a=1");
  const rewrittenHeaders = sanitizeRouterHeaders({ Authorization: "Bearer old", "Content-Type": "application/json" }, "sk_test");
  assert.equal(rewrittenHeaders.authorization, "Bearer sk_test");
  assert.equal(rewrittenHeaders["Content-Type"], "application/json");
  assert.equal("Authorization" in rewrittenHeaders, false);

  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "chrono-spirit-smoke-"));
  const slots = await readSlots();
  const dbPath = path.join(tmpDir, "db.json");

  await writeFile(dbPath, `${JSON.stringify({ modelAliases: {} }, null, 2)}\n`, "utf8");

  const catalogServer = createCatalogServer();
  const catalogPort = await listen(catalogServer);
  const appPort = catalogPort + 1;
  const coworkPort = catalogPort + 2;
  const appUrl = `http://127.0.0.1:${appPort}`;
  const routerBaseUrl = `http://127.0.0.1:${catalogPort}/v1`;
  const coworkUrl = `http://127.0.0.1:${coworkPort}`;

  const appProcess = spawn(process.execPath, ["server.js"], {
    cwd: rootDir,
    env: {
      ...process.env,
      PORT: String(appPort),
      NINE_ROUTER_BASE_URL: routerBaseUrl,
      NINE_ROUTER_DB_PATH: dbPath,
      NINE_ROUTER_API_KEY: "sk_test_9router",
      COWORK_BRIDGE_PORT: String(coworkPort)
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  const output = [];
  appProcess.stdout.on("data", (chunk) => output.push(chunk.toString("utf8")));
  appProcess.stderr.on("data", (chunk) => output.push(chunk.toString("utf8")));

  try {
    await waitForServer(`${appUrl}/api/health`);
    await waitForJson(`${appUrl}/api/cowork/bridge`, (payload) => payload?.coworkBridge?.listening === true);

    const health = await fetch(`${appUrl}/api/health`).then((response) => response.json());
    assert.equal(health.ok, true);
    assert.equal(health.modelsEndpoint.ok, true);
    assert.equal(health.coworkBridge.listening, true);
    assert.equal(health.coworkBridge.port, coworkPort);
    assert.equal(health.coworkMitm.enabled, false);

    const catalog = await fetch(`${appUrl}/api/catalog/models`).then((response) => response.json());
    assert.equal(catalog.ok, true);
    assert.ok(Array.isArray(catalog.models));
    assert.ok(catalog.models.length >= 3);

    const bridgeState = await fetch(`${appUrl}/api/bridge/state`).then((response) => response.json());
    assert.equal(Array.isArray(bridgeState.slots), true);
    assert.equal(bridgeState.slots.length, slots.length);

    const targetSlot = slots[0]?.id;
    const applyResponse = await fetch(`${appUrl}/api/bridge/state`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mappings: {
          [targetSlot]: "cx/gpt-5.4"
        }
      })
    });

    assert.equal(applyResponse.status, 200);
    const applied = await applyResponse.json();
    assert.equal(applied.ok, true);
    assert.equal(applied.validation.ok, true);
    assert.equal(applied.bridge.aliases[targetSlot], "cx/gpt-5.4");
    await access(applied.backupPath);

    const persistedDb = JSON.parse(await readFile(dbPath, "utf8"));
    assert.equal(persistedDb.modelAliases[targetSlot], "cx/gpt-5.4");

    const indexResponse = await fetch(`${appUrl}/`);
    assert.equal(indexResponse.status, 200);
    const indexHtml = await indexResponse.text();
    assert.match(indexHtml, /<html lang="vi">/);
    assert.match(indexHtml, /Chrono Spirit/);

    const appBundle = await fetch(`${appUrl}/app.js`);
    assert.equal(appBundle.status, 200);

    const coworkBridgeState = await fetch(`${appUrl}/api/cowork/bridge`).then((response) => response.json());
    assert.equal(coworkBridgeState.ok, true);
    assert.equal(coworkBridgeState.coworkBridge.listening, true);

    const mitmStatus = await fetch(`${appUrl}/api/cowork/mitm/status`).then((response) => response.json());
    assert.equal(mitmStatus.ok, true);
    assert.equal(mitmStatus.coworkMitm.enabled, false);
    assert.equal(mitmStatus.coworkMitm.listening, false);

    const mitmConfig = await fetch(`${appUrl}/api/cowork/mitm/config`).then((response) => response.json());
    assert.equal(mitmConfig.ok, true);
    assert.equal(Array.isArray(mitmConfig.config.targetHosts), true);
    assert.ok(mitmConfig.config.targetHosts.includes("api.anthropic.com"));

    const authorizeResponse = await fetch(`${coworkUrl}/v1/oauth/test-org/authorize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        redirect_uri: "http://localhost:3000/oauth/code/callback",
        state: "smoke-state"
      })
    });
    assert.equal(authorizeResponse.status, 200);
    const authorizePayload = await authorizeResponse.json();
    assert.match(authorizePayload.code, /^cs_code_/);
    assert.match(authorizePayload.redirect_uri, /code=/);
    assert.match(authorizePayload.redirect_uri, /state=smoke-state/);

    const tokenResponse = await fetch(`${coworkUrl}/v1/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: authorizePayload.code
      })
    });
    assert.equal(tokenResponse.status, 200);
    const tokenPayload = await tokenResponse.json();
    assert.match(tokenPayload.access_token, /^chrono-spirit-cowork-local-/);

    const proxyResponse = await fetch(`${coworkUrl}/v1/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenPayload.access_token}` },
      body: JSON.stringify({ model: "cc/claude-sonnet-4-6", max_tokens: 32, messages: [] })
    });
    assert.equal(proxyResponse.status, 200);
    const proxyPayload = await proxyResponse.json();
    assert.equal(proxyPayload.ok, true);
    assert.equal(proxyPayload.authorization, "Bearer sk_test_9router");
    assert.equal(proxyPayload.body.model, "cc/claude-sonnet-4-6");

    console.log("Smoke test passed.");
  } finally {
    appProcess.kill();
    await closeServer(catalogServer);
    await rm(tmpDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
