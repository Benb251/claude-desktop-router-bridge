function buildRouterUrl(routerBaseUrl, pathname, search = "") {
  return `${String(routerBaseUrl || "").replace(/\/$/, "")}${String(pathname || "").replace(/^\/v1/, "")}${search}`;
}

function sanitizeRouterHeaders(headers, apiKey) {
  const nextHeaders = {};

  for (const [key, value] of Object.entries(headers || {})) {
    const lowerKey = key.toLowerCase();
    if ([
      "host",
      "connection",
      "proxy-connection",
      "content-length",
      "transfer-encoding",
      "authorization",
      "x-api-key"
    ].includes(lowerKey)) {
      continue;
    }

    nextHeaders[key] = Array.isArray(value) ? value.join(", ") : value;
  }

  if (apiKey) {
    nextHeaders.authorization = `Bearer ${apiKey}`;
  }

  nextHeaders["x-chrono-spirit-session-type"] = "cowork";
  nextHeaders["x-chrono-spirit-route-kind"] = "anthropic_inference";

  return nextHeaders;
}

async function routeToRouter({
  routerBaseUrl,
  routerApiKey,
  method,
  pathname,
  search = "",
  headers,
  body,
  timeoutMs
}) {
  const upstreamUrl = buildRouterUrl(routerBaseUrl, pathname, search);
  const response = await fetch(upstreamUrl, {
    method,
    headers: sanitizeRouterHeaders(headers, routerApiKey),
    body: body && body.length > 0 ? body : undefined,
    redirect: "manual",
    signal: AbortSignal.timeout(timeoutMs)
  });

  return {
    upstream: upstreamUrl,
    response
  };
}

module.exports = {
  buildRouterUrl,
  routeToRouter,
  sanitizeRouterHeaders
};
