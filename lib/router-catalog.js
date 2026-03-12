const DEFAULT_INCLUDE_TOKENS = ["codex", "gpt-5", "claude", "gemini", "grok-code", "kimi"];
const DEFAULT_EXCLUDE_TOKENS = ["tts", "transcribe", "speech", "audio", "image", "vision-only", "embedding", "moderation"];

function buildModelsEndpointUrl(routerBaseUrl) {
  return `${routerBaseUrl.replace(/\/$/, "")}/models`;
}

function hasToken(value, tokens) {
  const normalized = String(value || "").toLowerCase();
  return tokens.some((token) => normalized.includes(token));
}

function normalizeModel(model) {
  const id = String(model?.id || "").trim();
  const root = String(model?.root || "").trim();
  const ownedBy = String(model?.owned_by || "").trim();
  const codeCandidate = `${id} ${root}`;

  const isCodeFirst = hasToken(codeCandidate, DEFAULT_INCLUDE_TOKENS) && !hasToken(codeCandidate, DEFAULT_EXCLUDE_TOKENS);

  return {
    id,
    object: model?.object || "model",
    created: model?.created || null,
    ownedBy: ownedBy || (id.includes("/") ? id.split("/")[0] : "unknown"),
    root: root || (id.includes("/") ? id.split("/").slice(1).join("/") : id),
    isCodeFirst
  };
}

function groupModels(models) {
  return models.reduce((groups, model) => {
    if (!groups[model.ownedBy]) {
      groups[model.ownedBy] = [];
    }
    groups[model.ownedBy].push(model);
    return groups;
  }, {});
}

async function fetchLiveModelCatalog({ routerBaseUrl, apiKey = "" }) {
  const endpoint = buildModelsEndpointUrl(routerBaseUrl);
  const checkedAt = new Date().toISOString();

  try {
    const response = await fetch(endpoint, {
      headers: {
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
      }
    });

    if (!response.ok) {
      return {
        source: "degraded",
        filters: { defaultMode: "code-first" },
        endpoint,
        ok: false,
        checkedAt,
        error: `Yêu cầu danh mục thất bại với mã ${response.status}`,
        models: [],
        groups: {}
      };
    }

    const payload = await response.json();
    const models = Array.isArray(payload?.data) ? payload.data.map(normalizeModel).filter((model) => model.id) : [];
    models.sort((a, b) => a.ownedBy.localeCompare(b.ownedBy) || a.id.localeCompare(b.id));

    return {
      source: "live",
      filters: { defaultMode: "code-first" },
      endpoint,
      ok: true,
      checkedAt,
      error: null,
      models,
      groups: groupModels(models)
    };
  } catch (error) {
    return {
      source: "degraded",
      filters: { defaultMode: "code-first" },
      endpoint,
      ok: false,
      checkedAt,
      error: error.message || "Không thể tải danh mục model trực tiếp",
      models: [],
      groups: {}
    };
  }
}

module.exports = {
  DEFAULT_EXCLUDE_TOKENS,
  DEFAULT_INCLUDE_TOKENS,
  buildModelsEndpointUrl,
  fetchLiveModelCatalog
};
