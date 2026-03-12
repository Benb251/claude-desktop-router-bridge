function sanitizeUpstreamHeaders(headers) {
  const nextHeaders = {};

  for (const [key, value] of Object.entries(headers || {})) {
    const lowerKey = key.toLowerCase();
    if ([
      "host",
      "connection",
      "proxy-connection",
      "content-length",
      "transfer-encoding"
    ].includes(lowerKey)) {
      continue;
    }

    nextHeaders[key] = Array.isArray(value) ? value.join(", ") : value;
  }

  return nextHeaders;
}

async function passthroughToAnthropic({
  host,
  method,
  pathname,
  search = "",
  headers,
  body,
  timeoutMs
}) {
  const upstreamUrl = `https://${host}${pathname}${search}`;
  const response = await fetch(upstreamUrl, {
    method,
    headers: sanitizeUpstreamHeaders(headers),
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
  passthroughToAnthropic,
  sanitizeUpstreamHeaders
};
