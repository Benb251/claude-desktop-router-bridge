const crypto = require("crypto");
const http = require("http");

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 8000;
const DEFAULT_FAKE_TOKEN = "chrono-spirit-cowork-local";
const DEFAULT_REDIRECT_URI = "http://localhost:3000/oauth/code/callback";
const MAX_RECENT_REQUESTS = 20;

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function sendJson(res, statusCode, body, headers = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    ...headers
  });
  res.end(payload);
}

function sendRedirect(res, location) {
  res.writeHead(302, {
    Location: location,
    "Access-Control-Allow-Origin": "*"
  });
  res.end();
}

function normalizeUrl(url) {
  return String(url || "").replace(/\/$/, "");
}

function hasBody(method) {
  return !["GET", "HEAD"].includes(String(method || "").toUpperCase());
}

function parseRequestPayload(req, rawBody, requestUrl) {
  const bodyText = rawBody.toString("utf8");
  const contentType = String(req.headers["content-type"] || "").toLowerCase();

  if (!bodyText.trim()) {
    return Object.fromEntries(requestUrl.searchParams.entries());
  }

  if (contentType.includes("application/json")) {
    return JSON.parse(bodyText);
  }

  if (contentType.includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(bodyText).entries());
  }

  try {
    return JSON.parse(bodyText);
  } catch {
    return Object.fromEntries(new URLSearchParams(bodyText).entries());
  }
}

function buildRedirectUrl(redirectUri, code, state) {
  const target = new URL(redirectUri || DEFAULT_REDIRECT_URI);
  target.searchParams.set("code", code);
  if (state) {
    target.searchParams.set("state", state);
  }
  return target.toString();
}

function matchAuthorizePath(pathname) {
  return /^\/(?:v1\/)?oauth(?:\/[^/]+)?\/authorize\/?$/.test(pathname) || pathname === "/authorize";
}

function matchTokenPath(pathname) {
  return /^\/(?:v1\/)?oauth\/token\/?$/.test(pathname) || pathname === "/token";
}

function matchHealthPath(pathname) {
  return pathname === "/health" || pathname === "/v1/health";
}

function sanitizeRequestHeaders(headers, apiKey) {
  const nextHeaders = {};

  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();
    if (["host", "connection", "content-length", "transfer-encoding"].includes(lowerKey)) {
      continue;
    }

    if (value === undefined) {
      continue;
    }

    nextHeaders[key] = Array.isArray(value) ? value.join(", ") : value;
  }

  if (apiKey) {
    delete nextHeaders.Authorization;
    delete nextHeaders.authorization;
    nextHeaders.authorization = `Bearer ${apiKey}`;
  }

  return nextHeaders;
}

function filterResponseHeaders(headers) {
  const nextHeaders = {};

  for (const [key, value] of headers.entries()) {
    const lowerKey = key.toLowerCase();
    if (["connection", "content-length", "content-encoding", "transfer-encoding"].includes(lowerKey)) {
      continue;
    }
    nextHeaders[key] = value;
  }

  return nextHeaders;
}

function buildUpstreamUrl(routerBaseUrl, requestUrl) {
  return `${normalizeUrl(routerBaseUrl)}${requestUrl.pathname.replace(/^\/v1/, "")}${requestUrl.search}`;
}

function createRecentRequest(method, pathname, kind, statusCode, extra = {}) {
  return {
    method,
    pathname,
    kind,
    statusCode,
    at: new Date().toISOString(),
    ...extra
  };
}

function previewToken(value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return "";
  }

  return normalized.length <= 12 ? normalized : `${normalized.slice(0, 6)}...${normalized.slice(-4)}`;
}

function createCoworkBridge({
  host = DEFAULT_HOST,
  port = DEFAULT_PORT,
  routerBaseUrl,
  apiKey = "",
  fakeToken = DEFAULT_FAKE_TOKEN
}) {
  const authCodes = new Map();
  const accessTokens = new Map();
  const state = {
    host,
    port,
    fakeToken,
    routerBaseUrl: normalizeUrl(routerBaseUrl),
    startedAt: null,
    listening: false,
    requestCount: 0,
    lastRequestAt: null,
    lastError: null,
    recentRequests: []
  };

  function recordRequest(entry) {
    state.requestCount += 1;
    state.lastRequestAt = entry.at;
    state.recentRequests.unshift(entry);
    state.recentRequests = state.recentRequests.slice(0, MAX_RECENT_REQUESTS);
  }

  function getState() {
    return {
      enabled: true,
      listening: state.listening,
      host: state.host,
      port: state.port,
      fakeTokenPreview: previewToken(state.fakeToken),
      routerBaseUrl: state.routerBaseUrl,
      requestCount: state.requestCount,
      lastRequestAt: state.lastRequestAt,
      lastError: state.lastError,
      startedAt: state.startedAt,
      auth: {
        pendingCodes: authCodes.size,
        activeTokens: accessTokens.size
      },
      recentRequests: state.recentRequests
    };
  }

  async function handleAuthorize(req, res, requestUrl) {
    const rawBody = await readRequestBody(req);
    const payload = parseRequestPayload(req, rawBody, requestUrl);
    const code = `cs_code_${crypto.randomUUID().replace(/-/g, "")}`;
    const redirectUri = String(payload.redirect_uri || payload.redirectUri || DEFAULT_REDIRECT_URI);
    const stateValue = String(payload.state || "");
    const redirectTo = buildRedirectUrl(redirectUri, code, stateValue);

    authCodes.set(code, {
      createdAt: Date.now(),
      redirectUri,
      state: stateValue
    });

    const entry = createRecentRequest(req.method, requestUrl.pathname, "oauth-authorize", 200, {
      redirectUri
    });
    recordRequest(entry);

    if (req.method === "GET") {
      sendRedirect(res, redirectTo);
      return;
    }

    sendJson(res, 200, {
      ok: true,
      code,
      authorization_code: code,
      redirect_uri: redirectTo,
      redirect_url: redirectTo,
      redirectTo,
      state: stateValue
    });
  }

  async function handleToken(req, res, requestUrl) {
    const rawBody = await readRequestBody(req);
    const payload = parseRequestPayload(req, rawBody, requestUrl);
    const grantType = String(payload.grant_type || payload.grantType || "authorization_code");
    const code = String(payload.code || "");
    const codeDetails = authCodes.get(code);
    const accessToken = `${fakeToken}-${crypto.randomUUID().replace(/-/g, "")}`;
    const refreshToken = `cs_refresh_${crypto.randomUUID().replace(/-/g, "")}`;

    if (codeDetails) {
      authCodes.delete(code);
    }

    accessTokens.set(accessToken, {
      createdAt: Date.now(),
      grantType,
      codeMatched: Boolean(codeDetails)
    });

    const entry = createRecentRequest(req.method, requestUrl.pathname, "oauth-token", 200, {
      grantType,
      codeMatched: Boolean(codeDetails)
    });
    recordRequest(entry);

    sendJson(res, 200, {
      token_type: "Bearer",
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: 60 * 60 * 12,
      scope: "user:inference",
      created_at: Math.floor(Date.now() / 1000)
    });
  }

  async function handleProxy(req, res, requestUrl) {
    const body = hasBody(req.method) ? await readRequestBody(req) : null;
    const upstreamUrl = buildUpstreamUrl(state.routerBaseUrl, requestUrl);

    try {
      const response = await fetch(upstreamUrl, {
        method: req.method,
        headers: sanitizeRequestHeaders(req.headers, apiKey),
        body: body && body.length > 0 ? body : undefined,
        redirect: "manual"
      });

      const responseBody = Buffer.from(await response.arrayBuffer());
      const headers = filterResponseHeaders(response.headers);
      headers["Access-Control-Allow-Origin"] = "*";
      headers["x-chrono-spirit-cowork-bridge"] = "1";
      headers["Content-Length"] = Buffer.byteLength(responseBody);

      res.writeHead(response.status, headers);
      res.end(responseBody);

      recordRequest(
        createRecentRequest(req.method, requestUrl.pathname, "proxy", response.status, {
          upstreamUrl
        })
      );
    } catch (error) {
      const message = error.message || "Khong the proxy request Cowork";
      state.lastError = message;
      recordRequest(
        createRecentRequest(req.method, requestUrl.pathname, "proxy-error", 502, {
          upstreamUrl
        })
      );
      sendJson(res, 502, {
        error: message,
        upstreamUrl
      });
    }
  }

  const server = http.createServer(async (req, res) => {
    if (!req.url) {
      sendJson(res, 400, { error: "Thieu URL request" });
      return;
    }

    const requestUrl = new URL(req.url, `http://${req.headers.host || `${host}:${port}`}`);

    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS"
      });
      res.end();
      return;
    }

    if (matchHealthPath(requestUrl.pathname)) {
      const entry = createRecentRequest(req.method, requestUrl.pathname, "health", 200);
      recordRequest(entry);
      sendJson(res, 200, {
        ok: true,
        bridge: "cowork",
        checkedAt: new Date().toISOString(),
        routerBaseUrl: state.routerBaseUrl
      });
      return;
    }

    try {
      if (matchAuthorizePath(requestUrl.pathname)) {
        await handleAuthorize(req, res, requestUrl);
        return;
      }

      if (matchTokenPath(requestUrl.pathname)) {
        await handleToken(req, res, requestUrl);
        return;
      }

      if (requestUrl.pathname.startsWith("/v1/")) {
        await handleProxy(req, res, requestUrl);
        return;
      }

      const entry = createRecentRequest(req.method, requestUrl.pathname, "not-found", 404);
      recordRequest(entry);
      sendJson(res, 404, { error: "Cowork bridge khong ho tro endpoint nay" });
    } catch (error) {
      state.lastError = error.message || "Loi bridge Cowork";
      recordRequest(createRecentRequest(req.method, requestUrl.pathname, "handler-error", 500));
      sendJson(res, 500, { error: state.lastError });
    }
  });

  function start() {
    return new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, host, () => {
        server.removeListener("error", reject);
        state.listening = true;
        state.startedAt = new Date().toISOString();
        resolve(getState());
      });
    });
  }

  async function stop() {
    if (!state.listening) {
      return;
    }

    await new Promise((resolve) => server.close(() => resolve()));
    state.listening = false;
  }

  return {
    start,
    stop,
    getState
  };
}

module.exports = {
  DEFAULT_FAKE_TOKEN,
  DEFAULT_HOST,
  DEFAULT_PORT,
  createCoworkBridge
};
