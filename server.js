const fs = require("fs");
const http = require("http");
const path = require("path");

const { applyMappings, buildBridgeState } = require("./lib/bridge-db");
const {
  createCoworkBridge,
  DEFAULT_HOST: DEFAULT_COWORK_HOST,
  DEFAULT_PORT: DEFAULT_COWORK_PORT
} = require("./lib/cowork-bridge");
const {
  createCoworkMitm,
  DEFAULT_LOG_BODY_BYTES,
  DEFAULT_PROXY_HOST,
  DEFAULT_PROXY_PORT,
  DEFAULT_TARGET_HOSTS,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_TLS_PORT
} = require("./lib/cowork-mitm");
const { buildModelsEndpointUrl, fetchLiveModelCatalog } = require("./lib/router-catalog");

const PORT = Number(process.env.PORT || 4311);
const ROUTER_BASE_URL = (process.env.NINE_ROUTER_BASE_URL || "http://localhost:20128/v1").replace(/\/$/, "");
const ROUTER_API_KEY = process.env.NINE_ROUTER_API_KEY || "";
const ROUTER_DB_PATH = process.env.NINE_ROUTER_DB_PATH || path.join(process.env.APPDATA || "", "9router", "db.json");

const COWORK_BRIDGE_ENABLED = !["0", "false"].includes(String(process.env.COWORK_BRIDGE_ENABLED || "").toLowerCase());
const COWORK_BRIDGE_HOST = process.env.COWORK_BRIDGE_HOST || DEFAULT_COWORK_HOST;
const COWORK_BRIDGE_PORT = Number(process.env.COWORK_BRIDGE_PORT || DEFAULT_COWORK_PORT);
const COWORK_BRIDGE_FAKE_TOKEN = process.env.COWORK_BRIDGE_FAKE_TOKEN || undefined;

const COWORK_MITM_ENABLED = ["1", "true"].includes(String(process.env.COWORK_MITM_ENABLED || "").toLowerCase());
const COWORK_MITM_MODE = process.env.COWORK_MITM_MODE || "system-proxy";
const COWORK_MITM_PROXY_HOST = process.env.COWORK_MITM_PROXY_HOST || DEFAULT_PROXY_HOST;
const COWORK_MITM_PROXY_PORT = Number(process.env.COWORK_MITM_PROXY_PORT || DEFAULT_PROXY_PORT);
const COWORK_MITM_TLS_PORT = Number(process.env.COWORK_MITM_TLS_PORT || DEFAULT_TLS_PORT);
const COWORK_MITM_TARGET_HOSTS = process.env.COWORK_MITM_TARGET_HOSTS || DEFAULT_TARGET_HOSTS.join(",");
const COWORK_MITM_CA_DIR = process.env.COWORK_MITM_CA_DIR || "";
const COWORK_MITM_LOG_BODY_BYTES = Number(process.env.COWORK_MITM_LOG_BODY_BYTES || DEFAULT_LOG_BODY_BYTES);
const COWORK_MITM_UPSTREAM_TIMEOUT_MS = Number(process.env.COWORK_MITM_UPSTREAM_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);

const publicDir = path.join(__dirname, "public");
const desktopSlotsPath = path.join(__dirname, "config", "desktop-slots.json");

const coworkBridge = COWORK_BRIDGE_ENABLED
  ? createCoworkBridge({
      host: COWORK_BRIDGE_HOST,
      port: COWORK_BRIDGE_PORT,
      routerBaseUrl: ROUTER_BASE_URL,
      apiKey: ROUTER_API_KEY,
      fakeToken: COWORK_BRIDGE_FAKE_TOKEN
    })
  : null;

const coworkMitm = createCoworkMitm({
  enabled: COWORK_MITM_ENABLED,
  mode: COWORK_MITM_MODE,
  targetHosts: COWORK_MITM_TARGET_HOSTS,
  caDir: COWORK_MITM_CA_DIR || undefined,
  proxyHost: COWORK_MITM_PROXY_HOST,
  proxyPort: COWORK_MITM_PROXY_PORT,
  tlsPort: COWORK_MITM_TLS_PORT,
  routerBaseUrl: ROUTER_BASE_URL,
  routerApiKey: ROUTER_API_KEY,
  logBodyBytes: COWORK_MITM_LOG_BODY_BYTES,
  timeoutMs: COWORK_MITM_UPSTREAM_TIMEOUT_MS
});

let coworkBridgeStartupError = null;
let coworkMitmStartupError = null;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function sendJson(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload)
  });
  res.end(payload);
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function serveStatic(req, res) {
  const requestedPath = req.url === "/" ? "/index.html" : req.url;
  const safePath = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(publicDir, safePath);

  if (!filePath.startsWith(publicDir)) {
    sendJson(res, 403, { error: "Truy cap bi tu choi" });
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      sendJson(res, 404, { error: "Khong tim thay" });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": mimeTypes[ext] || "application/octet-stream",
      "Content-Length": data.length
    });
    res.end(data);
  });
}

function getCoworkBridgeState() {
  if (!coworkBridge) {
    return {
      enabled: false,
      listening: false,
      host: COWORK_BRIDGE_HOST,
      port: COWORK_BRIDGE_PORT,
      routerBaseUrl: ROUTER_BASE_URL,
      lastError: null
    };
  }

  const state = coworkBridge.getState();
  return {
    ...state,
    lastError: state.lastError || coworkBridgeStartupError
  };
}

async function getCoworkMitmStatus() {
  const status = await coworkMitm.getStatus();
  return {
    ...status,
    lastError: status.lastError || coworkMitmStartupError
  };
}

async function handleHealth(res) {
  const [catalog, coworkMitmStatus] = await Promise.all([
    fetchLiveModelCatalog({
      routerBaseUrl: ROUTER_BASE_URL,
      apiKey: ROUTER_API_KEY
    }),
    getCoworkMitmStatus()
  ]);

  sendJson(res, 200, {
    ok: true,
    checkedAt: new Date().toISOString(),
    routerBaseUrl: ROUTER_BASE_URL,
    routerDbPath: ROUTER_DB_PATH,
    coworkBridge: getCoworkBridgeState(),
    coworkMitm: coworkMitmStatus,
    modelsEndpoint: {
      url: buildModelsEndpointUrl(ROUTER_BASE_URL),
      ok: catalog.ok
    }
  });
}

async function handleCatalog(res) {
  const catalog = await fetchLiveModelCatalog({
    routerBaseUrl: ROUTER_BASE_URL,
    apiKey: ROUTER_API_KEY
  });
  sendJson(res, 200, catalog);
}

async function handleBridgeGet(res) {
  try {
    const payload = await buildBridgeState({
      dbPath: ROUTER_DB_PATH,
      slotsPath: desktopSlotsPath
    });
    sendJson(res, 200, payload);
  } catch (error) {
    sendJson(res, 500, { error: `Khong the tai trang thai bridge: ${error.message}` });
  }
}

function handleCoworkBridgeGet(res) {
  sendJson(res, 200, {
    ok: true,
    checkedAt: new Date().toISOString(),
    coworkBridge: getCoworkBridgeState()
  });
}

async function handleCoworkMitmStatusGet(res) {
  sendJson(res, 200, {
    ok: true,
    checkedAt: new Date().toISOString(),
    coworkMitm: await getCoworkMitmStatus()
  });
}

async function handleCoworkMitmRecentGet(res) {
  sendJson(res, 200, {
    ok: true,
    checkedAt: new Date().toISOString(),
    recentRequests: await coworkMitm.getRecent()
  });
}

async function handleCoworkMitmConfigGet(res) {
  sendJson(res, 200, {
    ok: true,
    checkedAt: new Date().toISOString(),
    config: await coworkMitm.getConfig()
  });
}

async function handleBridgePost(req, res) {
  try {
    const rawBody = await readRequestBody(req);
    const body = JSON.parse(rawBody || "{}");
    const payload = await applyMappings({
      dbPath: ROUTER_DB_PATH,
      slotsPath: desktopSlotsPath,
      mappings: body.mappings
    });

    sendJson(res, 200, {
      ok: true,
      backupPath: payload.backupPath,
      validation: payload.validation,
      bridge: payload.bridge
    });
  } catch (error) {
    sendJson(res, error.statusCode || 500, {
      error: error.message || "Loi bridge ngoai du kien"
    });
  }
}

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    sendJson(res, 400, { error: "Thieu URL" });
    return;
  }

  if (req.method === "GET" && req.url === "/api/health") {
    await handleHealth(res);
    return;
  }

  if (req.method === "GET" && req.url === "/api/catalog/models") {
    await handleCatalog(res);
    return;
  }

  if (req.method === "GET" && req.url === "/api/bridge/state") {
    await handleBridgeGet(res);
    return;
  }

  if (req.method === "GET" && req.url === "/api/cowork/bridge") {
    handleCoworkBridgeGet(res);
    return;
  }

  if (req.method === "GET" && req.url === "/api/cowork/mitm/status") {
    await handleCoworkMitmStatusGet(res);
    return;
  }

  if (req.method === "GET" && req.url === "/api/cowork/mitm/recent") {
    await handleCoworkMitmRecentGet(res);
    return;
  }

  if (req.method === "GET" && req.url === "/api/cowork/mitm/config") {
    await handleCoworkMitmConfigGet(res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/bridge/state") {
    await handleBridgePost(req, res);
    return;
  }

  if (req.method === "GET") {
    serveStatic(req, res);
    return;
  }

  sendJson(res, 405, { error: "Phuong thuc khong duoc ho tro" });
});

server.listen(PORT, () => {
  console.log(`chrono-spirit dang chay tai http://localhost:${PORT}`);
  console.log(`Router goc: ${ROUTER_BASE_URL}`);
  console.log(`Router DB: ${ROUTER_DB_PATH}`);

  if (!coworkBridge) {
    console.log("Cowork bridge: disabled");
  } else {
    coworkBridge.start().then((state) => {
      coworkBridgeStartupError = null;
      console.log(`Cowork bridge: http://${state.host}:${state.port}`);
    }).catch((error) => {
      coworkBridgeStartupError = error.message || String(error);
      console.error(`Cowork bridge startup failed: ${coworkBridgeStartupError}`);
    });
  }

  coworkMitm.start().then((state) => {
    coworkMitmStartupError = state.lastError || null;
    const summary = state.listening
      ? `Cowork MITM listening: mode=${state.mode}, proxy=${COWORK_MITM_PROXY_PORT}, tls=${COWORK_MITM_TLS_PORT}`
      : `Cowork MITM inactive: ${state.lastError || "disabled or certs missing"}`;
    console.log(summary);
  }).catch((error) => {
    coworkMitmStartupError = error.message || String(error);
    console.error(`Cowork MITM startup failed: ${coworkMitmStartupError}`);
  });
});
