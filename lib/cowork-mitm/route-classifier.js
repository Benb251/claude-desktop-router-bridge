const ROUTER_PATHS = new Set([
  "/v1/messages",
  "/v1/complete",
  "/v1/chat/completions",
  "/v1/models"
]);

function classifyRequest({ method, pathname }) {
  const normalizedMethod = String(method || "GET").toUpperCase();
  const normalizedPath = String(pathname || "");

  if (normalizedPath === "/api/oauth/profile") {
    return "profile_passthrough";
  }

  if (normalizedPath === "/oauth/token" || normalizedPath === "/v1/oauth/token") {
    return "oauth_passthrough";
  }

  if (normalizedPath.startsWith("/v1/oauth/") || normalizedPath.startsWith("/api/oauth/")) {
    return "oauth_passthrough";
  }

  if (ROUTER_PATHS.has(normalizedPath)) {
    if (normalizedPath === "/v1/models" && normalizedMethod !== "GET") {
      return "unsupported_passthrough";
    }
    return "router_passthrough";
  }

  return "unsupported_passthrough";
}

module.exports = {
  classifyRequest
};
