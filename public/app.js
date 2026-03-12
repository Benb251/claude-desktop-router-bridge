const STORAGE_KEY = "chrono-spirit-ui-state-v3";
const LEGACY_STORAGE_KEY = "chrono-spirit-ui-state-v2";
const MAX_FAVORITES = 12;
const MAX_RECENT_TARGETS = 8;
const MAX_APPLY_HISTORY = 5;
const MAX_SAVED_PROFILES = 12;
const STICKY_SUCCESS_MS = 6000;

const QUICK_PRESETS = [
  {
    id: "preset-sonnet-gpt54",
    title: "Sonnet -> cx/gpt-5.4",
    description: "Chuyển slot Sonnet chính sang GPT-5.4 qua cx.",
    mappings: { "claude-sonnet-4-6": "cx/gpt-5.4" }
  },
  {
    id: "preset-sonnet-codex-high",
    title: "Sonnet -> cx/gpt-5.3-codex-high",
    description: "Ưu tiên slot code mặc định về Codex High.",
    mappings: { "claude-sonnet-4-6": "cx/gpt-5.3-codex-high" }
  },
  {
    id: "preset-sonnet-claude",
    title: "Sonnet -> cc/claude-sonnet-4-6",
    description: "Khôi phục slot Sonnet về route Claude gốc.",
    mappings: { "claude-sonnet-4-6": "cc/claude-sonnet-4-6" }
  },
  {
    id: "preset-opus-github",
    title: "Opus -> gh/claude-opus-4.6",
    description: "Dùng route Opus do GitHub host cho slot nặng.",
    mappings: { "claude-opus-4-6": "gh/claude-opus-4.6" }
  },
  {
    id: "preset-restore-defaults",
    title: "Khôi phục mọi mặc định",
    description: "Đưa toàn bộ slot về route Claude mặc định.",
    mappings: "__defaults__"
  }
];

const state = {
  slots: [],
  health: null,
  catalog: {
    source: "degraded",
    ok: false,
    checkedAt: null,
    error: null,
    models: [],
    groups: {},
    filters: { defaultMode: "code-first" }
  },
  persistedAliases: {},
  draftAliases: {},
  rawMode: {},
  ui: {
    search: "",
    showAll: false,
    selectedProviders: [],
    sortMode: "recommended",
    selectedSlotId: "",
    activeUtilityPanel: "profiles",
    isUtilityDrawerOpen: false,
    catalogLens: "recommended",
    profileDraftName: ""
  },
  favorites: [],
  recentTargets: [],
  applyHistory: [],
  savedProfiles: [],
  selectedProfileIds: [],
  profileFileImportMode: "single-mapping",
  pendingProfilePreview: null,
  pendingProfileSetImport: null,
  pendingModelPicker: null,
  profileRename: null,
  lastApplyResult: null,
  saving: false,
  stickyState: null
};

const els = {
  statusCanopy: document.getElementById("statusCanopy"),
  slotNavigator: document.getElementById("slotNavigator"),
  routeStudio: document.getElementById("routeStudio"),
  catalogBrowser: document.getElementById("catalogBrowser"),
  utilityDrawer: document.getElementById("utilityDrawer"),
  applyDock: document.getElementById("applyDock"),
  modalLayer: document.getElementById("modalLayer"),
  profileFileInput: document.getElementById("profileFileInput"),
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightMatch(value, query) {
  const source = String(value ?? "");
  const search = String(query || "").trim();
  if (!search) {
    return escapeHtml(source);
  }

  const pattern = new RegExp(`(${escapeRegExp(search)})`, "ig");
  return escapeHtml(source).replace(pattern, "<mark>$1</mark>");
}

function formatRelativeTime(value) {
  if (!value) {
    return "không có";
  }

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return "không có";
  }

  const diffSeconds = Math.round((Date.now() - timestamp) / 1000);
  const absSeconds = Math.abs(diffSeconds);
  if (absSeconds < 10) {
    return "vừa xong";
  }
  if (absSeconds < 60) {
    return `${absSeconds} giây trước`;
  }

  const diffMinutes = Math.round(diffSeconds / 60);
  const absMinutes = Math.abs(diffMinutes);
  if (absMinutes < 60) {
    return `${absMinutes} phút trước`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  const absHours = Math.abs(diffHours);
  if (absHours < 24) {
    return `${absHours} giờ trước`;
  }

  const diffDays = Math.round(diffHours / 24);
  return `${Math.abs(diffDays)} ngày trước`;
}

function titleCaseStatus(value) {
  const source = String(value || "idle");
  if (source === "validation-error") {
    return "Lệch xác thực";
  }
  if (source === "success") {
    return "Đã áp dụng";
  }
  if (source === "error") {
    return "Lỗi";
  }
  if (source === "idle") {
    return "Chưa áp dụng";
  }
  return source.charAt(0).toUpperCase() + source.slice(1);
}

function truncateMiddle(value, maxLength = 44) {
  const source = String(value || "");
  if (source.length <= maxLength) {
    return source;
  }

  const keep = Math.max(Math.floor((maxLength - 1) / 2), 6);
  return `${source.slice(0, keep)}...${source.slice(-keep)}`;
}

function toneClass(tone) {
  return tone ? ` tone-${tone}` : "";
}

function renderBadge(label, tone = "") {
  return `<span class="badge${toneClass(tone)}">${escapeHtml(label)}</span>`;
}

function renderPill(label, tone = "") {
  return `<span class="status-pill${toneClass(tone)}">${escapeHtml(label)}</span>`;
}

function getUtilityPanelLabel(panel) {
  const labels = {
    profiles: "Profile",
    analytics: "Thống kê",
    memory: "Ghi nhớ",
    activity: "Hoạt động"
  };
  return labels[panel] || panel;
}

function getProfileSourceLabel(source) {
  const labels = {
    local: "cục bộ",
    "local-clone": "bản sao cục bộ",
    saved: "đã lưu",
    system: "hệ thống",
    "imported-set": "bộ đã nhập"
  };
  return labels[source] || source;
}

function getImportModeLabel(mode) {
  const labels = {
    merge: "gộp",
    replace: "thay thế",
    "skip-locked": "bỏ qua đã khóa"
  };
  return labels[mode] || mode;
}

function getProfileOperationLabel(type) {
  const labels = {
    create: "tạo mới",
    update: "cập nhật",
    "skip-locked": "bỏ qua đã khóa"
  };
  return labels[type] || type;
}

function formatProviderLabel(provider) {
  const labels = {
    custom: "tự nhập",
    none: "chưa gán",
    unknown: "không rõ"
  };
  return labels[provider] || provider;
}

function getDefaultRoute(slotId) {
  return `cc/${slotId}`;
}

function getSlotById(slotId) {
  return state.slots.find((slot) => slot.id === slotId) || null;
}

function getSlotLabel(slotId) {
  return getSlotById(slotId)?.label || slotId;
}

function getPersistedAlias(slotId) {
  return String(state.persistedAliases[slotId] || "");
}

function getDraftAlias(slotId) {
  if (Object.hasOwn(state.draftAliases, slotId)) {
    return String(state.draftAliases[slotId] || "");
  }
  return getPersistedAlias(slotId);
}

function isDirty(slotId) {
  return getDraftAlias(slotId) !== getPersistedAlias(slotId);
}

function getDirtySlots() {
  return state.slots.filter((slot) => isDirty(slot.id));
}

function isFavorite(modelId) {
  return state.favorites.includes(modelId);
}

function getVisibleProviders() {
  return Object.keys(state.catalog.groups || {}).sort((a, b) => a.localeCompare(b));
}

function getSelectedProviders() {
  const visible = getVisibleProviders();
  const selected = state.ui.selectedProviders.filter((provider) => visible.includes(provider));
  return selected.length > 0 ? selected : visible;
}

function syncSelectedProviders() {
  const visible = getVisibleProviders();
  const selected = state.ui.selectedProviders.filter((provider) => visible.includes(provider));
  state.ui.selectedProviders = selected.length > 0 || visible.length === 0 ? selected : [...visible];
}

function getRecentRank(modelId) {
  return state.recentTargets.findIndex((entry) => entry.modelId === modelId);
}

function normalizeUtilityPanel(panel) {
  return ["profiles", "analytics", "memory", "activity"].includes(panel) ? panel : "profiles";
}

function chooseDefaultSlotId(preferredSlotId = "") {
  if (preferredSlotId && getSlotById(preferredSlotId)) {
    return preferredSlotId;
  }

  if (state.ui.selectedSlotId && getSlotById(state.ui.selectedSlotId)) {
    return state.ui.selectedSlotId;
  }

  const firstDirty = getDirtySlots()[0];
  if (firstDirty) {
    return firstDirty.id;
  }

  const sonnet = getSlotById("claude-sonnet-4-6");
  if (sonnet) {
    return sonnet.id;
  }

  return state.slots[0]?.id || "";
}

function ensureSelectedSlot(preferredSlotId = "") {
  state.ui.selectedSlotId = chooseDefaultSlotId(preferredSlotId);
}

function getSelectedSlot() {
  return getSlotById(state.ui.selectedSlotId);
}

function selectSlot(slotId) {
  if (!getSlotById(slotId)) {
    return;
  }

  state.ui.selectedSlotId = slotId;
  state.pendingModelPicker = null;
  persistStoredState();
  renderAll();
}

function openUtilityPanel(panel) {
  state.ui.activeUtilityPanel = normalizeUtilityPanel(panel);
  state.ui.isUtilityDrawerOpen = true;
  persistStoredState();
  renderAll();
}

function toggleUtilityPanel(panel) {
  const normalized = normalizeUtilityPanel(panel);
  if (state.ui.isUtilityDrawerOpen && state.ui.activeUtilityPanel === normalized) {
    state.ui.isUtilityDrawerOpen = false;
  } else {
    state.ui.activeUtilityPanel = normalized;
    state.ui.isUtilityDrawerOpen = true;
  }
  persistStoredState();
  renderAll();
}

function closeUtilityDrawer() {
  state.ui.isUtilityDrawerOpen = false;
  renderAll();
}

function splitTarget(target) {
  const value = String(target || "").trim();
  if (!value) {
    return { full: "", provider: "none", root: "Chưa gán" };
  }

  const parts = value.split("/");
  if (parts.length === 1) {
    return { full: value, provider: "custom", root: value };
  }

  return {
    full: value,
    provider: parts[0],
    root: parts.slice(1).join("/")
  };
}

function getCatalogModel(modelId) {
  return state.catalog.models.find((model) => model.id === modelId) || null;
}

function getTargetMeta(target) {
  const parts = splitTarget(target);
  const catalogModel = getCatalogModel(parts.full);
  if (catalogModel) {
    return {
      full: catalogModel.id,
      provider: catalogModel.ownedBy,
      root: catalogModel.root,
      codeFirst: Boolean(catalogModel.isCodeFirst)
    };
  }

  return {
    full: parts.full,
    provider: parts.provider || "custom",
    root: parts.root || "Route nhập tay",
    codeFirst: Boolean(parts.full)
  };
}

function getCurrentOrFallbackModel(modelId) {
  const existing = getCatalogModel(modelId);
  if (existing) {
    return existing;
  }

  const parts = splitTarget(modelId);
  return {
    id: parts.full || modelId,
    root: parts.root || modelId || "Đích tùy chỉnh",
    ownedBy: parts.provider || "custom",
    isCodeFirst: true
  };
}

function loadStoredState() {
  try {
    const currentRaw = window.localStorage.getItem(STORAGE_KEY);
    if (currentRaw) {
      return JSON.parse(currentRaw);
    }

    const legacyRaw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    return legacyRaw ? JSON.parse(legacyRaw) : {};
  } catch {
    return {};
  }
}

function persistStoredState() {
  const payload = {
    favorites: state.favorites,
    recentTargets: state.recentTargets,
    applyHistory: state.applyHistory,
    savedProfiles: state.savedProfiles,
    uiPrefs: {
      showAll: state.ui.showAll,
      selectedProviders: state.ui.selectedProviders,
      sortMode: state.ui.sortMode,
      selectedSlotId: state.ui.selectedSlotId,
      activeUtilityPanel: state.ui.activeUtilityPanel,
      catalogLens: state.ui.catalogLens
    }
  };

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function hydrateStoredState() {
  const stored = loadStoredState();
  state.favorites = Array.isArray(stored.favorites) ? stored.favorites.slice(0, MAX_FAVORITES) : [];
  state.recentTargets = Array.isArray(stored.recentTargets) ? stored.recentTargets.slice(0, MAX_RECENT_TARGETS) : [];
  state.applyHistory = Array.isArray(stored.applyHistory) ? stored.applyHistory.slice(0, MAX_APPLY_HISTORY) : [];
  state.savedProfiles = Array.isArray(stored.savedProfiles)
    ? stored.savedProfiles.slice(0, MAX_SAVED_PROFILES).map((profile) => ({
      id: String(profile.id || `profile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
      name: String(profile.name || "Profile chưa đặt tên"),
      source: String(profile.source || "local"),
      savedAt: String(profile.savedAt || new Date().toISOString()),
      pinned: Boolean(profile.pinned),
      locked: Boolean(profile.locked),
      mappings: profile?.mappings && typeof profile.mappings === "object" ? profile.mappings : {}
    }))
    : [];
  state.ui.showAll = Boolean(stored.uiPrefs?.showAll);
  state.ui.selectedProviders = Array.isArray(stored.uiPrefs?.selectedProviders) ? stored.uiPrefs.selectedProviders : [];
  state.ui.sortMode = ["provider", "recent", "recommended"].includes(stored.uiPrefs?.sortMode)
    ? stored.uiPrefs.sortMode
    : "recommended";
  state.ui.selectedSlotId = String(stored.uiPrefs?.selectedSlotId || "");
  state.ui.activeUtilityPanel = normalizeUtilityPanel(String(stored.uiPrefs?.activeUtilityPanel || "profiles"));
  state.ui.catalogLens = ["recommended", "all-matches"].includes(stored.uiPrefs?.catalogLens)
    ? stored.uiPrefs.catalogLens
    : "recommended";
}

function touchRecentTarget(modelId) {
  const value = String(modelId || "").trim();
  if (!value) {
    return;
  }

  state.recentTargets = [
    { modelId: value, usedAt: new Date().toISOString() },
    ...state.recentTargets.filter((entry) => entry.modelId !== value)
  ].slice(0, MAX_RECENT_TARGETS);
  persistStoredState();
}

function toggleFavorite(modelId) {
  const value = String(modelId || "").trim();
  if (!value) {
    return;
  }

  state.favorites = isFavorite(value)
    ? state.favorites.filter((entry) => entry !== value)
    : [value, ...state.favorites.filter((entry) => entry !== value)].slice(0, MAX_FAVORITES);
  persistStoredState();
}

function recordApplyHistory(entry) {
  state.applyHistory = [entry, ...state.applyHistory].slice(0, MAX_APPLY_HISTORY);
  persistStoredState();
}

function scheduleStickyHide() {
  if (!state.stickyState?.hideAt) {
    return;
  }

  const delay = Math.max(state.stickyState.hideAt - Date.now(), 0);
  window.setTimeout(() => {
    if (state.stickyState?.hideAt && Date.now() >= state.stickyState.hideAt && !state.saving && getDirtySlots().length === 0) {
      state.stickyState = null;
      renderStickyApplyBar();
    }
  }, delay + 20);
}

function setLastApplyResult(result) {
  state.lastApplyResult = result;
  state.stickyState = result;
  renderStickyApplyBar();
  scheduleStickyHide();
}

function setTransientNotice({ status = "success", message, mismatchCount = 0 }) {
  state.stickyState = {
    status,
    message,
    appliedAt: new Date().toISOString(),
    mismatches: [],
    mismatchCount,
    hideAt: Date.now() + STICKY_SUCCESS_MS
  };
  renderStickyApplyBar();
  scheduleStickyHide();
}

function setSearchFromModel(modelId) {
  state.ui.search = String(modelId || "");
  state.ui.showAll = true;
  state.ui.catalogLens = "all-matches";
  state.ui.selectedProviders = [...getVisibleProviders()];
  state.ui.isUtilityDrawerOpen = false;
  persistStoredState();
  renderAll();
}

function deriveMetrics() {
  const draftValues = state.slots.map((slot) => getDraftAlias(slot.id)).filter(Boolean);
  const mappedSlots = draftValues.length;
  const customRouteCount = state.slots.filter((slot) => getDraftAlias(slot.id) && getDraftAlias(slot.id) !== getDefaultRoute(slot.id)).length;
  const dirtySlots = getDirtySlots();
  const codeFirstCatalogCount = state.catalog.models.filter((model) => model.isCodeFirst).length;

  return {
    slotCount: state.slots.length,
    mappedSlots,
    customRouteCount,
    dirtyCount: dirtySlots.length,
    favoriteCount: state.favorites.length,
    recentTargetCount: state.recentTargets.length,
    codeFirstCatalogCount,
    liveCatalogCount: state.catalog.models.length,
    lastApplyAt: state.lastApplyResult?.appliedAt || state.applyHistory[0]?.appliedAt || null,
    lastApplyStatus: state.lastApplyResult?.status || state.applyHistory[0]?.status || "idle",
    lastValidationMismatchCount: state.lastApplyResult?.mismatchCount || 0
  };
}

function modelMatchesFilters(model) {
  if (!state.ui.showAll && !model.isCodeFirst) {
    return false;
  }

  const providers = getSelectedProviders();
  if (providers.length > 0 && !providers.includes(model.ownedBy)) {
    return false;
  }

  const search = state.ui.search.trim().toLowerCase();
  if (!search) {
    return true;
  }

  return `${model.id} ${model.root} ${model.ownedBy}`.toLowerCase().includes(search);
}

function sortModels(models) {
  const ranked = [...models];

  if (state.ui.sortMode === "recent") {
    ranked.sort((a, b) => {
      const aRank = getRecentRank(a.id);
      const bRank = getRecentRank(b.id);
      if (aRank === -1 && bRank === -1) {
        return a.id.localeCompare(b.id);
      }
      if (aRank === -1) {
        return 1;
      }
      if (bRank === -1) {
        return -1;
      }
      return aRank - bRank;
    });
    return ranked;
  }

  if (state.ui.sortMode === "recommended") {
    ranked.sort((a, b) => {
      return getRecommendationScore(b) - getRecommendationScore(a) || a.ownedBy.localeCompare(b.ownedBy) || a.id.localeCompare(b.id);
    });
    return ranked;
  }

  ranked.sort((a, b) => a.ownedBy.localeCompare(b.ownedBy) || a.id.localeCompare(b.id));
  return ranked;
}

function getRecommendationScore(model) {
  let total = 0;
  if (model.isCodeFirst) {
    total += 10;
  }
  if (isFavorite(model.id)) {
    total += 6;
  }
  const recentRank = getRecentRank(model.id);
  if (recentRank !== -1) {
    total += Math.max(4 - recentRank, 1);
  }
  if (model.id.includes("gpt-5.4")) {
    total += 3;
  }
  if (model.id.includes("codex")) {
    total += 2;
  }
  if (model.id.includes("claude")) {
    total += 1;
  }
  return total;
}

function getRecommendedModels(models) {
  return [...models].sort((a, b) => {
    return getRecommendationScore(b) - getRecommendationScore(a)
      || a.ownedBy.localeCompare(b.ownedBy)
      || a.id.localeCompare(b.id);
  });
}

function getFilteredModels() {
  return sortModels(state.catalog.models.filter(modelMatchesFilters));
}

function getCatalogGroupsForSlot(slotId) {
  if (!state.catalog.ok || state.rawMode[slotId]) {
    return [];
  }

  const currentValue = getDraftAlias(slotId);
  const filtered = getFilteredModels();
  const groups = [];
  const seen = new Set();

  const addGroup = (key, label, models, description = "") => {
    const unique = models.filter((model) => model && !seen.has(model.id));
    if (unique.length === 0) {
      return;
    }
    unique.forEach((model) => seen.add(model.id));
    groups.push({ key, label, description, models: unique });
  };

  if (currentValue && !filtered.some((model) => model.id === currentValue)) {
    addGroup(
      "current-target",
      "Đích hiện tại",
      [getCurrentOrFallbackModel(currentValue)],
      "Được ghim vì route hiện tại nằm ngoài bộ lọc đang áp dụng."
    );
  }

  if (state.ui.catalogLens === "recommended") {
    const favorites = getRecommendedModels(filtered.filter((model) => isFavorite(model.id)));
    addGroup("favorites", "Yêu thích", favorites.slice(0, 6), "Các route đã lưu cục bộ.");

    const recentModels = filtered
      .filter((model) => getRecentRank(model.id) !== -1)
      .sort((a, b) => getRecentRank(a.id) - getRecentRank(b.id));
    addGroup("recent", "Route gần đây", recentModels.slice(0, 6), "Các đích vừa dùng trong bản nháp hoặc lần áp dụng gần đây.");

    const recommended = getRecommendedModels(filtered.filter((model) => !seen.has(model.id)));
    addGroup(
      "recommended",
      "Đề xuất",
      recommended.slice(0, 12),
      state.ui.showAll ? "Các kết quả phù hợp nhất trong toàn bộ danh mục đã lọc." : "Đang ưu tiên các model thiên về code."
    );
  } else {
    const favorites = sortModels(filtered.filter((model) => isFavorite(model.id)));
    addGroup("favorites", "Yêu thích", favorites, "Các route đã ghim được đưa lên trước nhóm provider.");

    const byProvider = new Map();
    for (const model of filtered) {
      if (seen.has(model.id)) {
        continue;
      }
      if (!byProvider.has(model.ownedBy)) {
        byProvider.set(model.ownedBy, []);
      }
      byProvider.get(model.ownedBy).push(model);
    }

    for (const [provider, models] of [...byProvider.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      addGroup(provider, provider, sortModels(models), `${models.length} đích trong nhóm provider này.`);
    }
  }

  return groups;
}

function getModelPickerGroups(slotId) {
  if (!state.catalog.ok) {
    return [];
  }

  const currentValue = getDraftAlias(slotId);
  const filtered = getFilteredModels();
  const groups = [];
  const seen = new Set();

  if (currentValue && !filtered.some((model) => model.id === currentValue)) {
    const currentModel = getCurrentOrFallbackModel(currentValue);
    seen.add(currentModel.id);
    groups.push({
      key: "current-target",
      label: "Đang dùng",
      description: "Giữ sẵn model hiện tại ngay cả khi nó nằm ngoài bộ lọc đang bật.",
      models: [currentModel]
    });
  }

  const byProvider = new Map();
  for (const model of filtered) {
    if (seen.has(model.id)) {
      continue;
    }
    if (!byProvider.has(model.ownedBy)) {
      byProvider.set(model.ownedBy, []);
    }
    byProvider.get(model.ownedBy).push(model);
  }

  for (const [provider, models] of [...byProvider.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    groups.push({
      key: provider,
      label: formatProviderLabel(provider),
      description: `${models.length} model phù hợp trong nhóm này.`,
      models: sortModels(models)
    });
  }

  return groups;
}

function getTopTargets() {
  const counter = new Map();
  for (const slot of state.slots) {
    const target = getDraftAlias(slot.id);
    if (!target) {
      continue;
    }
    counter.set(target, (counter.get(target) || 0) + 1);
  }

  return [...counter.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([modelId, count]) => ({ modelId, count }));
}

function getSlotStatus(slotId) {
  const mismatch = state.lastApplyResult?.mismatches?.some((entry) => entry.slotId === slotId);
  if (mismatch) {
    return { className: "state-error", badgeTone: "error", label: "Lệch" };
  }
  if (isDirty(slotId)) {
    return { className: "state-dirty", badgeTone: "pending", label: "Chưa lưu" };
  }
  if (getDraftAlias(slotId) === getDefaultRoute(slotId)) {
    return { className: "state-default", badgeTone: "ok", label: "Mặc định" };
  }
  return { className: "state-custom", badgeTone: "", label: "Tùy chỉnh" };
}

function getVisibleDirtySlotLabels() {
  return getDirtySlots().map((slot) => slot.label);
}

function buildProfilePayload() {
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    app: "chrono-spirit",
    routerBaseUrl: state.health?.routerBaseUrl || "",
    slots: state.slots.map((slot) => ({
      id: slot.id,
      label: slot.label,
      hint: slot.hint || ""
    })),
    mappings: {
      draft: Object.fromEntries(state.slots.map((slot) => [slot.id, getDraftAlias(slot.id)])),
      persisted: Object.fromEntries(state.slots.map((slot) => [slot.id, getPersistedAlias(slot.id)]))
    }
  };
}

function downloadProfilePayload(payload, fallbackName = "profile") {
  const stamp = String(payload.exportedAt || new Date().toISOString()).replace(/[:.]/g, "-");
  const safeName = String(payload.name || fallbackName).trim().replace(/[^\w-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || fallbackName;
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `chrono-spirit-${safeName}-${stamp}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function buildNamedProfile(name, source = "local") {
  const trimmedName = String(name || "").trim();
  if (!trimmedName) {
    throw new Error("Tên profile không được để trống.");
  }

  return {
    id: `profile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: trimmedName,
    source,
    savedAt: new Date().toISOString(),
    pinned: false,
    locked: false,
    mappings: Object.fromEntries(state.slots.map((slot) => [slot.id, getDraftAlias(slot.id)]))
  };
}

function upsertSavedProfile(profile) {
  state.savedProfiles = [
    profile,
    ...state.savedProfiles.filter((entry) => entry.id !== profile.id && entry.name !== profile.name)
  ].slice(0, MAX_SAVED_PROFILES);
  persistStoredState();
}

function getSavedProfileById(profileId) {
  return state.savedProfiles.find((profile) => profile.id === profileId) || null;
}

function getSortedSavedProfiles() {
  return [...state.savedProfiles].sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) {
      return a.pinned ? -1 : 1;
    }
    return new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime();
  });
}

function syncSelectedProfileIds() {
  const validIds = new Set(state.savedProfiles.map((profile) => profile.id));
  state.selectedProfileIds = state.selectedProfileIds.filter((id) => validIds.has(id));
}

function isProfileSelected(profileId) {
  return state.selectedProfileIds.includes(profileId);
}

function selectAllProfiles() {
  state.selectedProfileIds = state.savedProfiles.map((profile) => profile.id);
}

function clearSelectedProfiles() {
  state.selectedProfileIds = [];
}

function buildProfileDiffRows(mappings) {
  const rows = [];
  for (const slot of state.slots) {
    if (!Object.hasOwn(mappings, slot.id)) {
      continue;
    }

    const nextValue = String(mappings[slot.id] || "").trim();
    if (!nextValue) {
      continue;
    }

    const currentValue = getDraftAlias(slot.id);
    if (currentValue !== nextValue) {
      rows.push({
        slotId: slot.id,
        slotLabel: slot.label,
        from: currentValue || "(trống)",
        to: nextValue
      });
    }
  }
  return rows;
}

function countMappedSlotsInMappings(mappings) {
  let mappedCount = 0;
  for (const slot of state.slots) {
    const value = String(mappings?.[slot.id] || "").trim();
    if (value) {
      mappedCount += 1;
    }
  }
  return mappedCount;
}

function countCustomSlotsInMappings(mappings) {
  let customCount = 0;
  for (const slot of state.slots) {
    const value = String(mappings?.[slot.id] || "").trim();
    if (value && value !== getDefaultRoute(slot.id)) {
      customCount += 1;
    }
  }
  return customCount;
}

function buildProfileStats(mappings) {
  return {
    diffCount: buildProfileDiffRows(mappings).length,
    mappedCount: countMappedSlotsInMappings(mappings),
    customCount: countCustomSlotsInMappings(mappings)
  };
}

function openProfilePreview({ profileName, mappings, sourceType = "saved", sourceId = "" }) {
  const diffRows = buildProfileDiffRows(mappings);
  state.pendingModelPicker = null;
  state.pendingProfileSetImport = null;
  state.pendingProfilePreview = {
    profileName,
    mappings,
    sourceType,
    sourceId,
    diffRows
  };
}

function closeProfilePreview() {
  state.pendingProfilePreview = null;
}

function openModelPicker(slotId, { seedFromCurrent = false } = {}) {
  if (!getSlotById(slotId)) {
    return;
  }

  if (seedFromCurrent) {
    state.ui.search = getDraftAlias(slotId);
    state.ui.showAll = true;
    state.ui.catalogLens = "all-matches";
    state.ui.selectedProviders = [...getVisibleProviders()];
  }

  state.pendingProfilePreview = null;
  state.pendingProfileSetImport = null;
  state.pendingModelPicker = { slotId };
  renderAll();
  window.requestAnimationFrame(() => {
    const input = document.getElementById("modelPickerSearchInput");
    if (input) {
      input.focus();
      if (typeof input.select === "function") {
        input.select();
      }
    }
  });
}

function closeModelPicker() {
  state.pendingModelPicker = null;
}

function renderModelPickerChip(slotId, model, currentValue) {
  const active = model.id === currentValue;
  return `
    <button
      class="model-picker-chip${active ? " active" : ""}"
      type="button"
      data-action="pick-model"
      data-slot-id="${escapeHtml(slotId)}"
      data-model-id="${escapeHtml(model.id)}"
      title="${escapeHtml(model.id)}"
    >
      ${highlightMatch(model.root || model.id, state.ui.search)}
    </button>
  `;
}

function confirmProfilePreview() {
  if (!state.pendingProfilePreview) {
    return;
  }

  const appliedCount = applyMappingsToDraft(state.pendingProfilePreview.mappings || {});
  const profileName = state.pendingProfilePreview.profileName || "profile";
  closeProfilePreview();
  setTransientNotice({ status: "success", message: `Đã nạp profile "${profileName}" vào bản nháp (${appliedCount} slot).` });
  renderAll();
}

function createSystemProfile(kind) {
  const mappings = {};

  for (const slot of state.slots) {
    if (kind === "default") {
      mappings[slot.id] = getDefaultRoute(slot.id);
      continue;
    }

    if (kind === "coding") {
      if (slot.id === "claude-sonnet-4-6") {
        mappings[slot.id] = "cx/gpt-5.3-codex-high";
      } else if (slot.id === "claude-opus-4-6" || slot.id === "claude-opus-4-6-thinking") {
        mappings[slot.id] = "gh/claude-opus-4.6";
      } else if (slot.id === "claude-haiku-4-5-20251001") {
        mappings[slot.id] = "cc/claude-haiku-4-5-20251001";
      } else {
        mappings[slot.id] = getDefaultRoute(slot.id);
      }
      continue;
    }

    if (kind === "fast") {
      if (slot.id === "claude-haiku-4-5-20251001") {
        mappings[slot.id] = "cc/claude-haiku-4-5-20251001";
      } else {
        mappings[slot.id] = "cc/claude-haiku-4-5";
      }
    }
  }

  return mappings;
}

function applyMappingsToDraft(mappings) {
  let appliedCount = 0;
  for (const slot of state.slots) {
    if (Object.hasOwn(mappings, slot.id)) {
      const value = String(mappings[slot.id] || "").trim();
      if (!value) {
        continue;
      }
      state.draftAliases[slot.id] = value;
      touchRecentTarget(value);
      appliedCount += 1;
    }
  }
  return appliedCount;
}

function saveCurrentProfile() {
  try {
    const name = String(state.ui.profileDraftName || "").trim();
    const existing = state.savedProfiles.find((entry) => entry.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      if (existing.locked) {
        setTransientNotice({ status: "error", message: `Profile "${existing.name}" đang bị khóa. Hãy mở khóa trước khi cập nhật.` });
        renderAll();
        return;
      }
      existing.savedAt = new Date().toISOString();
      existing.mappings = Object.fromEntries(state.slots.map((slot) => [slot.id, getDraftAlias(slot.id)]));
      persistStoredState();
      setTransientNotice({ status: "success", message: `Đã cập nhật profile "${existing.name}".` });
      state.ui.profileDraftName = "";
      renderAll();
      return;
    }

    const profile = buildNamedProfile(name, "local");
    upsertSavedProfile(profile);
    state.ui.profileDraftName = "";
    setTransientNotice({ status: "success", message: `Đã lưu profile "${profile.name}".` });
  } catch (error) {
    setTransientNotice({ status: "error", message: error.message || "Không thể lưu profile." });
  }
  renderAll();
}

function loadSavedProfile(profileId) {
  const profile = getSavedProfileById(profileId);
  if (!profile) {
    setTransientNotice({ status: "error", message: "Không tìm thấy profile đã lưu." });
    renderAll();
    return;
  }

  openProfilePreview({
    profileName: profile.name,
    mappings: profile.mappings || {},
    sourceType: "saved",
    sourceId: profile.id
  });
  renderAll();
}

function startRenameSavedProfile(profileId) {
  const profile = getSavedProfileById(profileId);
  if (!profile) {
    setTransientNotice({ status: "error", message: "Không tìm thấy profile đã lưu." });
    renderAll();
    return;
  }

  if (profile.locked) {
    setTransientNotice({ status: "error", message: `Profile "${profile.name}" đang bị khóa và không thể đổi tên.` });
    renderAll();
    return;
  }

  state.profileRename = {
    id: profile.id,
    name: profile.name
  };
  renderAll();
}

function cancelRenameSavedProfile() {
  state.profileRename = null;
  renderAll();
}

function commitRenameSavedProfile(profileId, nextName) {
  const trimmedName = String(nextName || "").trim();
  if (!trimmedName) {
    setTransientNotice({ status: "error", message: "Tên profile không được để trống." });
    renderAll();
    return;
  }

  const profile = getSavedProfileById(profileId);
  if (!profile) {
    setTransientNotice({ status: "error", message: "Không tìm thấy profile đã lưu." });
    renderAll();
    return;
  }

  if (profile.locked) {
    setTransientNotice({ status: "error", message: `Profile "${profile.name}" đang bị khóa và không thể đổi tên.` });
    renderAll();
    return;
  }

  const nameConflict = state.savedProfiles.some((entry) => entry.id !== profileId && entry.name.toLowerCase() === trimmedName.toLowerCase());
  if (nameConflict) {
    setTransientNotice({ status: "error", message: `Đã có profile khác dùng tên "${trimmedName}".` });
    renderAll();
    return;
  }

  profile.name = trimmedName;
  profile.savedAt = new Date().toISOString();
  state.profileRename = null;
  persistStoredState();
  setTransientNotice({ status: "success", message: `Đã đổi tên profile thành "${trimmedName}".` });
  renderAll();
}

function createDuplicateProfileName(sourceName) {
  const base = `${sourceName} Ban sao`;
  const existingNames = new Set(state.savedProfiles.map((entry) => entry.name.toLowerCase()));
  if (!existingNames.has(base.toLowerCase())) {
    return base;
  }

  let counter = 2;
  while (existingNames.has(`${base} ${counter}`.toLowerCase())) {
    counter += 1;
  }
  return `${base} ${counter}`;
}

function createUniqueProfileName(sourceName, blockedNames = null) {
  const base = String(sourceName || "Profile nhập").trim() || "Profile nhập";
  const existing = blockedNames || new Set(state.savedProfiles.map((entry) => entry.name.toLowerCase()));
  if (!existing.has(base.toLowerCase())) {
    existing.add(base.toLowerCase());
    return base;
  }

  let counter = 2;
  while (existing.has(`${base} ${counter}`.toLowerCase())) {
    counter += 1;
  }
  const candidate = `${base} ${counter}`;
  existing.add(candidate.toLowerCase());
  return candidate;
}

function duplicateSavedProfile(profileId) {
  const profile = getSavedProfileById(profileId);
  if (!profile) {
    setTransientNotice({ status: "error", message: "Không tìm thấy profile đã lưu." });
    renderAll();
    return;
  }

  const cloned = {
    id: `profile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: createDuplicateProfileName(profile.name),
    source: "local-clone",
    savedAt: new Date().toISOString(),
    pinned: false,
    locked: false,
    mappings: { ...(profile.mappings || {}) }
  };

  upsertSavedProfile(cloned);
  setTransientNotice({ status: "success", message: `Đã tạo bản sao profile "${cloned.name}".` });
  renderAll();
}

function togglePinSavedProfile(profileId) {
  const profile = getSavedProfileById(profileId);
  if (!profile) {
    setTransientNotice({ status: "error", message: "Không tìm thấy profile đã lưu." });
    renderAll();
    return;
  }

  profile.pinned = !profile.pinned;
  persistStoredState();
  setTransientNotice({
    status: "success",
    message: profile.pinned ? `Đã ghim "${profile.name}" lên đầu.` : `Đã bỏ ghim "${profile.name}".`
  });
  renderAll();
}

function pinUnpinSelectedProfiles(pinValue) {
  const selected = state.selectedProfileIds
    .map((id) => getSavedProfileById(id))
    .filter(Boolean);

  if (selected.length === 0) {
    setTransientNotice({ status: "error", message: "Không có profile nào được chọn để ghim hoặc bỏ ghim." });
    renderAll();
    return;
  }

  let changed = 0;
  for (const profile of selected) {
    if (profile.pinned !== pinValue) {
      profile.pinned = pinValue;
      changed += 1;
    }
  }

  persistStoredState();
  setTransientNotice({
    status: "success",
    message: pinValue
      ? `Đã ghim ${changed} profile đã chọn.`
      : `Đã bỏ ghim ${changed} profile đã chọn.`
  });
  renderAll();
}

function toggleLockSavedProfile(profileId) {
  const profile = getSavedProfileById(profileId);
  if (!profile) {
    setTransientNotice({ status: "error", message: "Không tìm thấy profile đã lưu." });
    renderAll();
    return;
  }

  profile.locked = !profile.locked;
  if (profile.locked && state.profileRename?.id === profile.id) {
    state.profileRename = null;
  }
  persistStoredState();
  setTransientNotice({
    status: "success",
    message: profile.locked ? `Đã khóa "${profile.name}".` : `Đã mở khóa "${profile.name}".`
  });
  renderAll();
}

function deleteSavedProfile(profileId) {
  const profile = getSavedProfileById(profileId);
  if (profile?.locked) {
    setTransientNotice({ status: "error", message: `Profile "${profile.name}" đang bị khóa và không thể xóa.` });
    renderAll();
    return;
  }

  state.savedProfiles = state.savedProfiles.filter((entry) => entry.id !== profileId);
  if (state.profileRename?.id === profileId) {
    state.profileRename = null;
  }
  persistStoredState();
  setTransientNotice({ status: "success", message: `Đã xóa profile "${profile?.name || profileId}".` });
  renderAll();
}

function loadSystemProfile(kind) {
  const mappings = createSystemProfile(kind);
  const labels = {
    default: "Mặc định",
    coding: "Lập trình",
    fast: "Nhanh"
  };
  openProfilePreview({
    profileName: `Preset ${labels[kind] || kind}`,
    mappings,
    sourceType: "system",
    sourceId: kind
  });
  renderAll();
}

function exportProfile() {
  const payload = buildProfilePayload();
  payload.name = "ban-nhap-hien-tai";
  downloadProfilePayload(payload, "ban-nhap-hien-tai");
  setTransientNotice({ status: "success", message: "Đã xuất JSON profile từ bản nháp hiện tại." });
  renderAll();
}

function exportSavedProfile(profileId) {
  const profile = state.savedProfiles.find((entry) => entry.id === profileId);
  if (!profile) {
    setTransientNotice({ status: "error", message: "Không tìm thấy profile đã lưu." });
    renderAll();
    return;
  }

  const payload = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    app: "chrono-spirit",
    name: profile.name,
    source: profile.source || "local",
    slots: state.slots.map((slot) => ({
      id: slot.id,
      label: slot.label,
      hint: slot.hint || ""
    })),
    mappings: {
      draft: { ...(profile.mappings || {}) },
      persisted: {}
    }
  };
  downloadProfilePayload(payload, profile.name);
  setTransientNotice({ status: "success", message: `Đã xuất profile đã lưu "${profile.name}".` });
  renderAll();
}

function exportSavedProfileSet() {
  if (state.savedProfiles.length === 0) {
    setTransientNotice({ status: "error", message: "Không có profile đã lưu nào để xuất." });
    renderAll();
    return;
  }

  const payload = {
    schemaVersion: 1,
    type: "saved-profile-set",
    exportedAt: new Date().toISOString(),
    app: "chrono-spirit",
    profileCount: state.savedProfiles.length,
    slots: state.slots.map((slot) => ({
      id: slot.id,
      label: slot.label,
      hint: slot.hint || ""
    })),
    savedProfiles: getSortedSavedProfiles().map((profile) => ({
      name: profile.name,
      source: profile.source || "local",
      savedAt: profile.savedAt || new Date().toISOString(),
      pinned: Boolean(profile.pinned),
      locked: Boolean(profile.locked),
      mappings: { ...(profile.mappings || {}) }
    }))
  };

  downloadProfilePayload(payload, "bo-profile-da-luu");
  setTransientNotice({ status: "success", message: `Đã xuất ${payload.profileCount} profile đã lưu vào một tệp.` });
  renderAll();
}

function createUniqueNameInRegistry(baseName, registry) {
  const base = String(baseName || "Profile nhập").trim() || "Profile nhập";
  if (!registry.has(base.toLowerCase())) {
    registry.add(base.toLowerCase());
    return base;
  }

  let counter = 2;
  while (registry.has(`${base} ${counter}`.toLowerCase())) {
    counter += 1;
  }
  const nextName = `${base} ${counter}`;
  registry.add(nextName.toLowerCase());
  return nextName;
}

function normalizeImportedProfileSet(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("JSON bộ profile không hợp lệ.");
  }

  const entries = Array.isArray(payload.savedProfiles) ? payload.savedProfiles : null;
  if (!entries || entries.length === 0) {
    throw new Error("JSON bộ profile thiếu trường savedProfiles.");
  }

  const nameRegistry = new Set();
  const normalizedProfiles = [];
  const slotIds = new Set(state.slots.map((slot) => slot.id));

  for (const raw of entries) {
    const rawMappings = raw?.mappings && typeof raw.mappings === "object" && !Array.isArray(raw.mappings) ? raw.mappings : {};
    const normalizedMappings = {};

    for (const [slotId, target] of Object.entries(rawMappings)) {
      if (!slotIds.has(slotId)) {
        continue;
      }
      const value = String(target || "").trim();
      if (!value) {
        continue;
      }
      normalizedMappings[slotId] = value;
    }

    const mappedCount = Object.keys(normalizedMappings).length;
    if (mappedCount === 0) {
      continue;
    }

    const profileName = createUniqueNameInRegistry(raw?.name || "Profile nhập", nameRegistry);
    normalizedProfiles.push({
      name: profileName,
      source: String(raw?.source || "imported-set"),
      savedAt: String(raw?.savedAt || new Date().toISOString()),
      pinned: Boolean(raw?.pinned),
      locked: Boolean(raw?.locked),
      mappings: normalizedMappings
    });
  }

  if (normalizedProfiles.length === 0) {
    throw new Error("Không tìm thấy mapping profile tương thích trong bộ profile này.");
  }

  return normalizedProfiles;
}

function toStoredProfile(profile) {
  return {
    id: `profile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: String(profile.name || "Profile nhập"),
    source: String(profile.source || "imported-set"),
    savedAt: String(profile.savedAt || new Date().toISOString()),
    pinned: Boolean(profile.pinned),
    locked: Boolean(profile.locked),
    mappings: { ...(profile.mappings || {}) }
  };
}

function buildProfileSetImportPlan(mode, importedProfiles) {
  const normalizedMode = ["merge", "replace", "skip-locked"].includes(mode) ? mode : "skip-locked";
  let nextProfiles = state.savedProfiles.map((profile) => ({
    ...profile,
    mappings: { ...(profile.mappings || {}) }
  }));

  const operations = [];
  const summary = {
    importedCount: importedProfiles.length,
    created: 0,
    updated: 0,
    skippedLocked: 0,
    replacedRemoved: 0,
    droppedByLimit: 0,
    finalCount: 0
  };

  if (normalizedMode === "replace") {
    summary.replacedRemoved = nextProfiles.length;
    nextProfiles = importedProfiles.map((profile) => toStoredProfile(profile));
    operations.push(...importedProfiles.map((profile) => ({
      name: profile.name,
      type: "create",
      detail: "thay thế toàn bộ"
    })));
    summary.created = importedProfiles.length;
  } else {
    const indexByName = new Map(nextProfiles.map((profile, index) => [profile.name.toLowerCase(), index]));
    for (const imported of importedProfiles) {
      const key = imported.name.toLowerCase();
      if (indexByName.has(key)) {
        const index = indexByName.get(key);
        const existing = nextProfiles[index];

        if (normalizedMode === "skip-locked" && existing.locked) {
          summary.skippedLocked += 1;
          operations.push({
            name: imported.name,
            type: "skip-locked",
            detail: "profile cục bộ đang bị khóa"
          });
          continue;
        }

        nextProfiles[index] = {
          ...existing,
          name: imported.name,
          source: imported.source,
          savedAt: imported.savedAt,
          pinned: imported.pinned,
          locked: imported.locked,
          mappings: { ...(imported.mappings || {}) }
        };
        summary.updated += 1;
        operations.push({
          name: imported.name,
          type: "update",
          detail: existing.locked ? "đã cập nhật profile bị khóa" : "đã cập nhật profile hiện có"
        });
      } else {
        nextProfiles.push(toStoredProfile(imported));
        indexByName.set(key, nextProfiles.length - 1);
        summary.created += 1;
        operations.push({
          name: imported.name,
          type: "create",
          detail: "profile mới"
        });
      }
    }
  }

  if (nextProfiles.length > MAX_SAVED_PROFILES) {
    summary.droppedByLimit = nextProfiles.length - MAX_SAVED_PROFILES;
    nextProfiles = nextProfiles.slice(0, MAX_SAVED_PROFILES);
  }
  summary.finalCount = nextProfiles.length;

  return {
    mode: normalizedMode,
    operations,
    summary,
    nextProfiles
  };
}

function openProfileSetImportPreview(payload) {
  const importedProfiles = normalizeImportedProfileSet(payload);
  state.pendingModelPicker = null;
  state.pendingProfilePreview = null;
  state.pendingProfileSetImport = {
    mode: "skip-locked",
    importedProfiles
  };
}

function closeProfileSetImportPreview() {
  state.pendingProfileSetImport = null;
}

function setProfileSetImportMode(mode) {
  if (!state.pendingProfileSetImport) {
    return;
  }
  if (!["merge", "replace", "skip-locked"].includes(mode)) {
    return;
  }
  state.pendingProfileSetImport.mode = mode;
}

function applyProfileSetImportPreview() {
  if (!state.pendingProfileSetImport) {
    return;
  }

  const plan = buildProfileSetImportPlan(
    state.pendingProfileSetImport.mode,
    state.pendingProfileSetImport.importedProfiles
  );

  state.savedProfiles = plan.nextProfiles;
  syncSelectedProfileIds();
  if (state.profileRename && !getSavedProfileById(state.profileRename.id)) {
    state.profileRename = null;
  }
  closeProfileSetImportPreview();
  persistStoredState();

  const summary = plan.summary;
  setTransientNotice({
    status: "success",
    message: `Đã nhập bộ (${getImportModeLabel(plan.mode)}): +${summary.created} tạo mới, ${summary.updated} cập nhật, ${summary.skippedLocked} bỏ qua do khóa.`
  });
  renderAll();
}

function setProfileFileImportMode(mode) {
  state.profileFileImportMode = mode;
}

function openProfileFilePicker(mode) {
  setProfileFileImportMode(mode);
  els.profileFileInput.click();
}

function importProfileObject(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("JSON profile không hợp lệ.");
  }

  const draftMappings = payload?.mappings?.draft;
  if (!draftMappings || typeof draftMappings !== "object" || Array.isArray(draftMappings)) {
    throw new Error("JSON profile thiếu mappings.draft.");
  }

  let appliedCount = 0;
  let firstSlotId = "";
  for (const slot of state.slots) {
    if (Object.hasOwn(draftMappings, slot.id)) {
      const value = String(draftMappings[slot.id] || "").trim();
      if (!value) {
        throw new Error(`Profile nhập có model đích trống cho slot: ${slot.id}`);
      }
      if (!firstSlotId) {
        firstSlotId = slot.id;
      }
      state.draftAliases[slot.id] = value;
      touchRecentTarget(value);
      appliedCount += 1;
    }
  }

  if (appliedCount === 0) {
    throw new Error("Không tìm thấy mapping slot nào được hỗ trợ trong profile đã nhập.");
  }

  if (firstSlotId) {
    state.ui.selectedSlotId = firstSlotId;
    persistStoredState();
  }

  setTransientNotice({ status: "success", message: `Đã đưa profile nhập vào bản nháp với ${appliedCount} mapping slot.` });
  renderAll();
}

async function handleProfileFile(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  try {
    const raw = await file.text();
    const payload = JSON.parse(raw);
    if (state.profileFileImportMode === "profile-set") {
      openProfileSetImportPreview(payload);
      renderAll();
    } else {
      importProfileObject(payload);
    }
  } catch (error) {
    setTransientNotice({ status: "error", message: error.message || "Nhập profile thất bại." });
    renderAll();
  } finally {
    state.profileFileImportMode = "single-mapping";
    event.target.value = "";
  }
}

function applyQuickPreset(presetId) {
  const preset = QUICK_PRESETS.find((entry) => entry.id === presetId);
  if (!preset) {
    return;
  }

  let firstSlotId = "";
  if (preset.mappings === "__defaults__") {
    for (const slot of state.slots) {
      if (!firstSlotId) {
        firstSlotId = slot.id;
      }
      state.draftAliases[slot.id] = getDefaultRoute(slot.id);
    }
  } else {
    for (const [slotId, target] of Object.entries(preset.mappings)) {
      if (getSlotById(slotId)) {
        if (!firstSlotId) {
          firstSlotId = slotId;
        }
        state.draftAliases[slotId] = target;
      }
    }
  }

  if (firstSlotId) {
    state.ui.selectedSlotId = firstSlotId;
    persistStoredState();
  }

  renderAll();
}

function renderHero() {
  const metrics = deriveMetrics();
  const selectedSlot = getSelectedSlot();
  const cards = [
    {
      label: "Router",
      value: state.health?.ok ? "Sẵn sàng" : "Chưa rõ",
      tone: state.health?.ok ? "ok" : "error",
      meta: state.health?.routerBaseUrl || "Không có URL router",
      checkedAt: state.health?.checkedAt
    },
    {
      label: "Danh mục",
      value: state.catalog.ok ? "Đang hoạt động" : "Suy giảm",
      tone: state.catalog.ok ? "ok" : "pending",
      meta: state.catalog.ok ? `${state.catalog.models.length} model trực tiếp` : state.catalog.error || "Danh mục trực tiếp không khả dụng",
      checkedAt: state.catalog.checkedAt
    },
    {
      label: "Bridge DB",
      value: state.health?.routerDbPath ? "Truy cập được" : "Thiếu",
      tone: state.health?.routerDbPath ? "ok" : "error",
      meta: state.health?.routerDbPath || "Không có đường dẫn DB",
      checkedAt: state.health?.checkedAt
    },
    {
      label: "Lần áp dụng cuối",
      value: titleCaseStatus(metrics.lastApplyStatus),
      tone: metrics.lastApplyStatus === "success" ? "ok" : (metrics.lastApplyStatus === "error" || metrics.lastApplyStatus === "validation-error" ? "error" : "neutral"),
      meta: state.lastApplyResult?.backupPath || state.applyHistory[0]?.message || "Trình duyệt này chưa ghi lần áp dụng nào",
      checkedAt: metrics.lastApplyAt
    }
  ];
  const toolsDisabled = state.saving || metrics.slotCount === 0;
  const saveDisabled = state.saving || metrics.dirtyCount === 0;
  const summary = state.saving
    ? "Đang áp dụng các thay đổi route tạm vào 9router."
    : selectedSlot
      ? `${metrics.slotCount} slot đang hoạt động. Đang chỉnh ${selectedSlot.label}. Có ${metrics.dirtyCount} thay đổi tạm.`
      : "Đang tải trung tâm điều khiển route.";

  els.statusCanopy.innerHTML = `
    <div class="canopy-layout">
      <div class="canopy-copy">
        <p class="eyebrow">Claude Desktop x 9router</p>
        <h1 class="display-title">Bảng điều khiển bridge</h1>
        <p class="lede">
          Trung tâm điều khiển route để tạm gán và áp dụng các remap slot Claude Desktop lên bridge 9router cục bộ của bạn.
        </p>
        <div class="canopy-summary">
          ${renderPill(summary, "neutral")}
          ${renderPill(`Chưa lưu ${metrics.dirtyCount}`, metrics.dirtyCount > 0 ? "pending" : "ok")}
          ${renderPill(`Yêu thích ${metrics.favoriteCount}`)}
          ${renderPill(`Gần đây ${metrics.recentTargetCount}`)}
        </div>
        ${!state.catalog.ok ? `
          <div class="toolbar-row" style="margin-top: 18px;">
            ${renderPill("Danh mục suy giảm", "pending")}
            <div class="helper small">Duyệt có gợi ý đang bị hạn chế. Bạn vẫn có thể nhập tay và dùng mapping đã lưu.</div>
          </div>
        ` : ""}
      </div>
      <div class="canopy-actions">
        <div class="utility-launchers">
          <button class="utility-chip${state.ui.isUtilityDrawerOpen && state.ui.activeUtilityPanel === "profiles" ? " active" : ""}" type="button" data-action="toggle-utility-panel" data-panel="profiles">Profile</button>
          <button class="utility-chip${state.ui.isUtilityDrawerOpen && state.ui.activeUtilityPanel === "analytics" ? " active" : ""}" type="button" data-action="toggle-utility-panel" data-panel="analytics">Thống kê</button>
          <button class="utility-chip${state.ui.isUtilityDrawerOpen && state.ui.activeUtilityPanel === "memory" ? " active" : ""}" type="button" data-action="toggle-utility-panel" data-panel="memory">Ghi nhớ</button>
          <button class="utility-chip${state.ui.isUtilityDrawerOpen && state.ui.activeUtilityPanel === "activity" ? " active" : ""}" type="button" data-action="toggle-utility-panel" data-panel="activity">Hoạt động</button>
        </div>
        <div class="canopy-action-row">
          <button class="ghost-button" type="button" data-action="reload-all" ${state.saving ? "disabled" : ""}>Tải lại</button>
          <button class="ghost-button" type="button" data-action="import-profile" ${toolsDisabled ? "disabled" : ""}>Nhập</button>
          <button class="ghost-button" type="button" data-action="export-profile" ${toolsDisabled ? "disabled" : ""}>Xuất</button>
          <button class="primary-button" type="button" data-action="apply-all" ${saveDisabled ? "disabled" : ""}>Áp dụng mapping</button>
        </div>
      </div>
    </div>
    <div class="health-grid">
      ${cards.map((card) => `
        <article class="health-card">
          ${renderBadge(card.label, card.tone)}
          <div class="health-value">${escapeHtml(card.value)}</div>
          <div class="helper">${escapeHtml(card.meta)}</div>
          <div class="activity-meta">${escapeHtml(formatRelativeTime(card.checkedAt))}</div>
        </article>
      `).join("")}
    </div>
  `;
}

function renderSystemHealth() {
  const metrics = deriveMetrics();
  const selectedSlotId = state.ui.selectedSlotId;

  els.slotNavigator.innerHTML = `
    <div class="nav-header">
      <div>
        <p class="eyebrow">Điều hướng slot</p>
        <h2 class="section-title">Các slot route Claude</h2>
        <div class="helper">Trạng thái gọn cho từng slot desktop. Chọn một slot để chỉnh trong khu làm việc.</div>
      </div>
      ${renderBadge(`${metrics.dirtyCount} tạm`, metrics.dirtyCount > 0 ? "pending" : "ok")}
    </div>
    <div class="slot-list">
      ${state.slots.length === 0
        ? `
          <article class="empty-card">
            <p class="empty-state">Chưa tải được slot bridge nào.</p>
          </article>
        `
        : state.slots.map((slot) => {
          const status = getSlotStatus(slot.id);
          const currentValue = getDraftAlias(slot.id) || "Chưa gán";
          const persistedValue = getPersistedAlias(slot.id) || "trống";
          const selected = slot.id === selectedSlotId;
          const subcopy = state.rawMode[slot.id]
            ? "Slot này đang bật nhập tay."
            : isDirty(slot.id)
              ? `DB ${truncateMiddle(persistedValue, 34)}`
              : (slot.hint || "Sẵn sàng");

          return `
            <button class="slot-nav-card ${status.className}${selected ? " selected" : ""}" type="button" data-action="select-slot" data-slot-id="${escapeHtml(slot.id)}">
              <div class="slot-nav-head">
                <div>
                  <div class="slot-nav-title">${escapeHtml(slot.label)}</div>
                </div>
                <div class="toolbar-row">
                  <span class="slot-delta"></span>
                  ${renderBadge(status.label, status.badgeTone)}
                </div>
              </div>
              <div class="slot-nav-route">${escapeHtml(truncateMiddle(currentValue, 42))}</div>
              <div class="slot-nav-subtle">${escapeHtml(subcopy)}</div>
            </button>
          `;
        }).join("")}
    </div>
  `;
}

function getStudioRouteSummary(slotId) {
  const currentValue = getDraftAlias(slotId);
  if (!currentValue) {
    return "Slot này chưa có route đích nào được đưa vào bản nháp.";
  }

  const descriptor = getTargetMeta(currentValue);
  const modeNote = state.rawMode[slotId]
    ? "Đang bật nhập tay."
    : state.catalog.ok
      ? "Có thể chọn từ danh mục gợi ý."
      : "Danh mục đang suy giảm; bạn vẫn có thể nhập tay.";

  return `Bản nháp đang route qua ${formatProviderLabel(descriptor.provider)} tới ${descriptor.root}. ${modeNote}`;
}

function renderStateCard(kind, label, value, meta) {
  return `
    <article class="state-card" data-kind="${escapeHtml(kind)}">
      <div class="state-card-label">${escapeHtml(label)}</div>
      <div class="state-card-value mono">${escapeHtml(value || "trống")}</div>
      <div class="state-card-meta">${escapeHtml(meta)}</div>
    </article>
  `;
}

function renderCandidateCard(slotId, model, currentValue, groupKey) {
  const active = model.id === currentValue;
  const favorite = isFavorite(model.id);
  const recent = getRecentRank(model.id) !== -1;
  const flags = [
    model.isCodeFirst ? `<span class="flag-chip code-first">Ưu tiên code</span>` : "",
    favorite ? `<span class="flag-chip favorite">Yêu thích</span>` : "",
    recent ? `<span class="flag-chip recent">Gần đây</span>` : "",
    active ? `<span class="flag-chip current">Hiện tại</span>` : ""
  ].filter(Boolean).join("");

  return `
    <article class="candidate-card${active ? " active" : ""}${groupKey === "current-target" ? " current-pinned" : ""}">
      <div class="candidate-card-head">
        <button class="candidate-main" type="button" data-action="pick-model" data-slot-id="${escapeHtml(slotId)}" data-model-id="${escapeHtml(model.id)}">
          <p class="candidate-title">${highlightMatch(model.root, state.ui.search)}</p>
          <div class="candidate-route">${highlightMatch(model.id, state.ui.search)}</div>
        </button>
        <button class="icon-button" type="button" data-action="toggle-favorite-model" data-model-id="${escapeHtml(model.id)}">
          ${favorite ? "Đã lưu" : "Lưu"}
        </button>
      </div>
      <div class="candidate-foot">
        <div class="candidate-flags">${flags}</div>
        ${renderBadge(formatProviderLabel(model.ownedBy), "neutral")}
      </div>
    </article>
  `;
}

function renderProviderFilters() {
  const slot = getSelectedSlot();
  if (!slot) {
    els.routeStudio.innerHTML = `
      <div class="studio-shell">
        <p class="eyebrow">Khu chỉnh route</p>
        <h2 class="section-title">Chưa chọn slot</h2>
        <article class="empty-card">
          <p class="empty-state">Chọn một slot Claude để xem mapping hiện tại và đưa đích mới vào bản nháp.</p>
        </article>
      </div>
    `;
    return;
  }

  const currentValue = getDraftAlias(slot.id);
  const persistedValue = getPersistedAlias(slot.id);
  const defaultValue = getDefaultRoute(slot.id);
  const status = getSlotStatus(slot.id);
  const descriptor = getTargetMeta(currentValue);
  const favoriteCurrent = isFavorite(currentValue);

  els.routeStudio.innerHTML = `
    <div class="studio-shell ${status.className}">
      <div class="studio-header">
        <div class="studio-header-copy">
          <p class="eyebrow">Slot hiện tại</p>
          <h2 class="slot-title">${escapeHtml(slot.label)}</h2>
          <p class="studio-subcopy">${escapeHtml(slot.hint || "Slot desktop này sẵn sàng để map lại.")}</p>
          <div class="studio-summary">
            ${renderPill(status.label, status.badgeTone)}
            ${renderPill(state.rawMode[slot.id] ? "Nhập tay" : "Duyệt gợi ý", state.rawMode[slot.id] ? "pending" : "ok")}
            ${renderPill(state.catalog.ok ? "Danh mục hoạt động" : "Danh mục suy giảm", state.catalog.ok ? "ok" : "pending")}
          </div>
        </div>
        <div class="studio-meta">
          ${renderPill(`Nhà cung cấp ${formatProviderLabel(descriptor.provider)}`, "neutral")}
          ${renderPill(descriptor.root)}
        </div>
      </div>

      <div class="state-trio">
        ${renderStateCard("persisted", "Đã lưu trong DB", persistedValue || "trống", "Alias hiện đang lưu trong 9router/db.json")}
        ${renderStateCard("draft", "Đích bản nháp", currentValue || "trống", "Giá trị có thể sửa cho lần áp dụng tiếp theo")}
        ${renderStateCard("default", "Route Claude mặc định", defaultValue, "Route dự phòng dùng khi khôi phục mặc định")}
      </div>

      <section class="studio-editor">
        <div class="editor-head">
          <div>
            <p class="eyebrow">Trình chỉnh đích</p>
            <h3 class="section-title">Bản nháp route</h3>
            <div class="helper">${escapeHtml(getStudioRouteSummary(slot.id))}</div>
          </div>
          <div class="segmented-control">
            <button class="segmented-button${!state.rawMode[slot.id] ? " active" : ""}" type="button" data-action="set-raw-mode" data-slot-id="${escapeHtml(slot.id)}" data-mode="guided">Gợi ý</button>
            <button class="segmented-button${state.rawMode[slot.id] ? " active" : ""}" type="button" data-action="set-raw-mode" data-slot-id="${escapeHtml(slot.id)}" data-mode="raw">Nhập tay</button>
          </div>
        </div>

        <div class="editor-grid">
          <label class="field">
            <span>Model đích của 9router</span>
            <input class="mapping-input mono" type="text" value="${escapeHtml(currentValue)}" placeholder="cx/gpt-5.4" data-slot-input="${escapeHtml(slot.id)}">
          </label>
          <button class="tonal-button" type="button" data-action="open-model-picker" data-slot-id="${escapeHtml(slot.id)}">Mở bộ chọn model</button>
        </div>

        <div class="input-support">
          ${renderPill(isDirty(slot.id) ? "Bản nháp khác DB" : "Bản nháp khớp DB", isDirty(slot.id) ? "pending" : "ok")}
          ${renderPill(state.rawMode[slot.id] ? "Nhập route thủ công" : "Chọn có hỗ trợ danh mục")}
          ${!state.catalog.ok ? renderPill("Không thể duyệt gợi ý", "pending") : ""}
        </div>

        <div class="toolbar-row">
          <button class="ghost-button" type="button" data-action="reset-slot" data-slot-id="${escapeHtml(slot.id)}">Khôi phục về DB</button>
          <button class="ghost-button" type="button" data-action="default-slot" data-slot-id="${escapeHtml(slot.id)}">Gán route Claude mặc định</button>
          <button class="ghost-button${favoriteCurrent ? " active" : ""}" type="button" data-action="toggle-favorite-current" data-slot-id="${escapeHtml(slot.id)}" ${currentValue ? "" : "disabled"}>
            ${favoriteCurrent ? "Bỏ yêu thích hiện tại" : "Thêm hiện tại vào yêu thích"}
          </button>
        </div>
      </section>
    </div>
  `;
}

function renderQuickPresets() {
  const slot = getSelectedSlot();
  const filtered = getFilteredModels();
  const selectedProviders = getSelectedProviders();

  const controls = `
    <div class="browser-controls">
      <label class="field">
        <span>Tìm trong danh mục trực tiếp</span>
        <input id="catalogSearchInput" type="text" value="${escapeHtml(state.ui.search)}" placeholder="Tìm theo model id, root hoặc provider">
      </label>

      <div class="field">
        <span>Chế độ xem</span>
        <div class="segmented-control">
          <button class="segmented-button${state.ui.catalogLens === "recommended" ? " active" : ""}" type="button" data-action="set-catalog-lens" data-lens="recommended">Đề xuất</button>
          <button class="segmented-button${state.ui.catalogLens === "all-matches" ? " active" : ""}" type="button" data-action="set-catalog-lens" data-lens="all-matches">Tất cả kết quả</button>
        </div>
      </div>

      <div class="field">
        <span>Phạm vi danh mục</span>
        <div class="segmented-control">
          <button class="segmented-button${!state.ui.showAll ? " active" : ""}" type="button" data-action="set-catalog-scope" data-scope="code-first">Ưu tiên code</button>
          <button class="segmented-button${state.ui.showAll ? " active" : ""}" type="button" data-action="set-catalog-scope" data-scope="all">Toàn bộ danh mục</button>
        </div>
      </div>

      <label class="field">
        <span>Sắp xếp kết quả</span>
        <select id="catalogSortSelect">
          <option value="recommended"${state.ui.sortMode === "recommended" ? " selected" : ""}>Đề xuất</option>
          <option value="provider"${state.ui.sortMode === "provider" ? " selected" : ""}>Nhà cung cấp</option>
          <option value="recent"${state.ui.sortMode === "recent" ? " selected" : ""}>Gần đây</option>
        </select>
      </label>

      <div class="field">
        <span>Nhà cung cấp</span>
        <div class="filter-chip-row">
          <button class="filter-chip${selectedProviders.length === getVisibleProviders().length || getVisibleProviders().length === 0 ? " active" : ""}" type="button" data-provider-chip="__all__">Tất cả</button>
          ${getVisibleProviders().map((provider) => `
            <button class="filter-chip${selectedProviders.includes(provider) ? " active" : ""}" type="button" data-provider-chip="${escapeHtml(provider)}">
              ${escapeHtml(provider)}
            </button>
          `).join("")}
        </div>
      </div>
    </div>
  `;

  let body = `
    <article class="empty-card">
      <p class="empty-state">Chọn một slot để duyệt các đích phù hợp.</p>
    </article>
  `;

  if (slot) {
    if (state.rawMode[slot.id]) {
      body = `
        <article class="empty-card">
          ${renderBadge("Đang bật nhập tay", "pending")}
          <p class="empty-state">Các thẻ gợi ý bị ẩn khi slot này ở chế độ nhập tay. Chuyển lại chế độ gợi ý để duyệt danh mục trực tiếp.</p>
          <div class="toolbar-row">
            <button class="ghost-button" type="button" data-action="set-raw-mode" data-slot-id="${escapeHtml(slot.id)}" data-mode="guided">Quay lại gợi ý</button>
          </div>
        </article>
      `;
    } else if (!state.catalog.ok) {
      body = `
        <article class="empty-card">
          ${renderBadge("Danh mục suy giảm", "pending")}
          <p class="empty-state">Danh mục model trực tiếp hiện không khả dụng. Bạn vẫn có thể sửa thủ công trường đích và áp dụng route nhập tay mà không mất mapping đã lưu.</p>
        </article>
      `;
    } else {
      const groups = getCatalogGroupsForSlot(slot.id);
      body = groups.length === 0
        ? `
          <article class="empty-card">
            ${renderBadge("Không có kết quả", "pending")}
            <p class="empty-state">Không có đích nào khớp với bộ tìm kiếm và bộ lọc hiện tại. Hãy xóa tìm kiếm, mở rộng provider hoặc chuyển sang xem toàn bộ danh mục.</p>
            <div class="toolbar-row">
              <button class="ghost-button" type="button" data-action="clear-search">Xóa tìm kiếm</button>
              <button class="ghost-button" type="button" data-action="set-catalog-scope" data-scope="all">Hiện toàn bộ danh mục</button>
            </div>
          </article>
        `
        : `
          <div class="candidate-groups">
            ${groups.map((group) => `
              <section class="candidate-group">
                <div class="candidate-group-head">
                  <div class="candidate-group-copy">
                    <h3 class="section-title">${escapeHtml(group.label)}</h3>
                    <div class="helper">${escapeHtml(group.description || `${group.models.length} đích phù hợp.`)}</div>
                  </div>
                  ${renderBadge(`${group.models.length} đích`)}
                </div>
                <div class="candidate-grid">
                  ${group.models.map((model) => renderCandidateCard(slot.id, model, getDraftAlias(slot.id), group.key)).join("")}
                </div>
              </section>
            `).join("")}
          </div>
        `;
    }
  }

  els.catalogBrowser.innerHTML = `
    <div class="browser-shell">
      <div class="browser-head">
        <div>
          <p class="eyebrow">Các đích phù hợp</p>
          <h2 class="browser-title">Trình duyệt danh mục trực tiếp</h2>
          <div class="browser-summary">
            ${slot
              ? `${filtered.length} kết quả hiển thị trong ${selectedProviders.length} nhà cung cấp cho ${slot.label}.`
              : "Duyệt danh mục trực tiếp và đưa route vào bản nháp cho slot đang được chọn."}
          </div>
        </div>
        <div class="status-row">
          ${slot ? `<button class="tonal-button" type="button" data-action="open-model-picker" data-slot-id="${escapeHtml(slot.id)}">Chọn model</button>` : ""}
          ${renderPill(state.catalog.ok ? "Danh mục hoạt động" : "Danh mục suy giảm", state.catalog.ok ? "ok" : "pending")}
          ${slot ? renderPill(slot.label) : ""}
        </div>
      </div>
      ${controls}
      ${body}
    </div>
  `;
}

function renderAnalyticsPanel() {
  const metrics = deriveMetrics();
  const cards = [
    { label: "Slot đã gán", value: String(metrics.mappedSlots) },
    { label: "Route tùy chỉnh", value: String(metrics.customRouteCount) },
    { label: "Chỉnh sửa chưa lưu", value: String(metrics.dirtyCount) },
    { label: "Lần áp dụng cuối", value: titleCaseStatus(metrics.lastApplyStatus) },
    { label: "Quy mô danh mục", value: `${metrics.liveCatalogCount} / ${metrics.codeFirstCatalogCount}` },
    { label: "Yêu thích", value: String(metrics.favoriteCount) }
  ];
  const topTargets = getTopTargets();

  return `
    <section class="drawer-section">
      <div class="drawer-section-head">
        <div>
          <p class="eyebrow">Vận hành bridge</p>
          <h2 class="drawer-title">Thống kê trực tiếp</h2>
        </div>
      </div>
      <div class="metric-grid">
        ${cards.map((card) => `
          <article class="metric-card">
            <div class="metric-label">${escapeHtml(card.label)}</div>
            <div class="metric-value">${escapeHtml(card.value)}</div>
          </article>
        `).join("")}
      </div>
    </section>
    <section class="drawer-section">
      <div class="drawer-section-head">
        <div>
          <p class="eyebrow">Đích dùng nhiều</p>
          <h2 class="drawer-title">Các route nháp dùng nhiều nhất</h2>
        </div>
      </div>
      <div class="target-list">
        ${topTargets.length === 0
          ? `<article class="empty-card"><p class="empty-state">Chưa có route nào đang được đưa vào bản nháp.</p></article>`
          : topTargets.map((entry) => `
            <article class="target-card">
              <div class="history-title mono">${escapeHtml(entry.modelId)}</div>
              <div class="activity-meta">Đang được dùng bởi ${entry.count} slot</div>
            </article>
          `).join("")}
      </div>
    </section>
  `;
}

function renderMemoryPanel() {
  return `
    <section class="drawer-section">
      <div class="drawer-section-head">
        <div>
          <p class="eyebrow">Yêu thích</p>
          <h2 class="drawer-title">Các đích đã ghim</h2>
        </div>
      </div>
      <div class="chip-list">
        ${state.favorites.length === 0
          ? `<div class="helper">Chưa có đích yêu thích nào.</div>`
          : state.favorites.map((modelId) => `<button class="ghost-button" type="button" data-search-model="${escapeHtml(modelId)}">${escapeHtml(modelId)}</button>`).join("")}
      </div>
    </section>
    <section class="drawer-section">
      <div class="drawer-section-head">
        <div>
          <p class="eyebrow">Đích gần đây</p>
          <h2 class="drawer-title">Gọi lại nhanh</h2>
        </div>
      </div>
      <div class="chip-list">
        ${state.recentTargets.length === 0
          ? `<div class="helper">Chưa có đích gần đây nào.</div>`
          : state.recentTargets.map((entry) => `<button class="ghost-button" type="button" data-search-model="${escapeHtml(entry.modelId)}">${escapeHtml(entry.modelId)}</button>`).join("")}
      </div>
    </section>
  `;
}

function renderActivityPanel() {
  return `
    <section class="drawer-section">
      <div class="drawer-section-head">
        <div>
          <p class="eyebrow">Hoạt động</p>
          <h2 class="drawer-title">Các lần ghi bridge gần đây</h2>
        </div>
      </div>
      <div class="activity-list">
        ${state.applyHistory.length === 0
          ? `<article class="empty-card"><p class="empty-state">Trình duyệt này chưa ghi nhận lần ghi bridge nào.</p></article>`
          : state.applyHistory.map((entry) => `
            <article class="history-item">
              <div class="history-head">
                ${renderBadge(titleCaseStatus(entry.status), entry.status === "success" ? "ok" : entry.status === "validation-error" ? "pending" : "error")}
                <div class="activity-meta">${escapeHtml(formatRelativeTime(entry.appliedAt))}</div>
              </div>
              <div class="history-title">${escapeHtml((entry.changedSlots || []).map(getSlotLabel).join(", ") || "Không có slot thay đổi")}</div>
              <div class="activity-meta">${escapeHtml(entry.backupPath || entry.message || "Không có đường dẫn backup")}</div>
            </article>
          `).join("")}
      </div>
    </section>
  `;
}

function renderProfileManager() {
  syncSelectedProfileIds();
  if (!state.ui.isUtilityDrawerOpen) {
    els.utilityDrawer.classList.add("hidden");
    els.utilityDrawer.innerHTML = "";
    return;
  }

  const profiles = getSortedSavedProfiles();
  const selectedCount = state.selectedProfileIds.length;
  const panel = normalizeUtilityPanel(state.ui.activeUtilityPanel);
  let content = "";

  if (panel === "profiles") {
    content = `
      <section class="drawer-section">
        <div class="drawer-section-head">
          <div>
            <p class="eyebrow">Thư viện profile</p>
            <h2 class="drawer-title">Ảnh chụp bản nháp</h2>
          </div>
          ${renderBadge(`${profiles.length} đã lưu`)}
        </div>

        <div class="profile-toolbar">
          <label class="field">
            <span>Tên profile</span>
            <input id="profileNameInput" type="text" value="${escapeHtml(state.ui.profileDraftName)}" placeholder="Lap trinh - GPT 5.3 Codex">
          </label>
          <button class="primary-button" type="button" data-action="save-current-profile" ${state.saving || state.slots.length === 0 ? "disabled" : ""}>Lưu bản nháp</button>
        </div>

        <div class="profile-actions">
          <button class="ghost-button" type="button" data-action="export-profile" ${state.slots.length === 0 ? "disabled" : ""}>Xuất bản nháp hiện tại</button>
          <button class="ghost-button" type="button" data-action="import-profile" ${state.slots.length === 0 ? "disabled" : ""}>Nhập JSON profile</button>
          <button class="ghost-button" type="button" data-action="export-profile-set" ${profiles.length === 0 ? "disabled" : ""}>Xuất bộ profile</button>
          <button class="ghost-button" type="button" data-action="import-profile-set">Nhập bộ profile</button>
        </div>
      </section>

      <section class="drawer-section">
        <div class="drawer-section-head">
          <div>
            <p class="eyebrow">Tải nhanh</p>
            <h2 class="drawer-title">Preset hệ thống</h2>
          </div>
        </div>
        <div class="preset-grid">
          <button class="preset-card" type="button" data-system-profile="default">
            <strong>Tải mặc định</strong>
            <p>Đưa mọi slot về route Claude mặc định trước khi áp dụng.</p>
          </button>
          <button class="preset-card" type="button" data-system-profile="coding">
            <strong>Tải lập trình</strong>
            <p>Ưu tiên các slot thiên về code sang các route nghiêng về Codex và Opus.</p>
          </button>
          <button class="preset-card" type="button" data-system-profile="fast">
            <strong>Tải nhanh</strong>
            <p>Đưa các route nhanh vào bản nháp với mapping nghiêng về Haiku.</p>
          </button>
          ${QUICK_PRESETS.map((preset) => `
            <button class="preset-card" type="button" data-preset-id="${escapeHtml(preset.id)}">
              <strong>${escapeHtml(preset.title)}</strong>
              <p>${escapeHtml(preset.description)}</p>
            </button>
          `).join("")}
        </div>
      </section>

      <section class="drawer-section">
        <div class="drawer-section-head">
          <div>
            <p class="eyebrow">Profile đã lưu</p>
            <h2 class="drawer-title">Bản nháp có tên dùng lại</h2>
          </div>
          ${renderBadge(`${selectedCount} đã chọn`, selectedCount > 0 ? "pending" : "neutral")}
        </div>

        <div class="profile-actions">
          <button class="ghost-button" type="button" data-action="select-all-profiles" ${profiles.length === 0 ? "disabled" : ""}>Chọn tất cả</button>
          <button class="ghost-button" type="button" data-action="clear-selected-profiles" ${selectedCount === 0 ? "disabled" : ""}>Bỏ chọn</button>
          <button class="ghost-button" type="button" data-action="bulk-pin-selected" ${selectedCount === 0 ? "disabled" : ""}>Ghim mục chọn</button>
          <button class="ghost-button" type="button" data-action="bulk-unpin-selected" ${selectedCount === 0 ? "disabled" : ""}>Bỏ ghim mục chọn</button>
        </div>

        <div class="helper">${profiles.length === 0 ? "Chưa có profile đã lưu nào." : `Đã chọn ${selectedCount} trên tổng ${profiles.length} profile đã lưu.`}</div>

        <div class="profile-grid">
          ${profiles.length === 0
            ? `<article class="empty-card"><p class="empty-state">Hãy lưu bản nháp hiện tại để tạo thư viện profile có thể dùng lại.</p></article>`
            : profiles.map((profile) => {
              const isRenaming = state.profileRename?.id === profile.id;
              const stats = buildProfileStats(profile.mappings || {});
              const selected = isProfileSelected(profile.id);
              return `
                <article class="profile-card${profile.pinned ? " pinned" : ""}${selected ? " selected" : ""}">
                  <div class="profile-card-head">
                    <div>
                      <div class="history-title">${escapeHtml(profile.name)}</div>
                      <div class="activity-meta">${escapeHtml(formatRelativeTime(profile.savedAt))}</div>
                    </div>
                    <div class="toolbar-row">
                      <label class="profile-select-control">
                        <input type="checkbox" data-action="toggle-select-profile" data-profile-id="${escapeHtml(profile.id)}" ${selected ? "checked" : ""}>
                        <span>Chọn</span>
                      </label>
                      ${profile.pinned ? renderBadge("Đã ghim", "ok") : ""}
                      ${profile.locked ? renderBadge("Đã khóa", "pending") : ""}
                      ${renderBadge(getProfileSourceLabel(profile.source || "local"))}
                    </div>
                  </div>
                  <div class="profile-badge-row">
                    ${renderBadge(`Đã gán ${stats.mappedCount}`)}
                    ${renderBadge(`Tùy chỉnh ${stats.customCount}`)}
                    ${renderBadge(`Khác biệt ${stats.diffCount}`, stats.diffCount > 0 ? "pending" : "ok")}
                  </div>
                  <div class="helper">Đã lưu ${Object.keys(profile.mappings || {}).length} mapping slot.</div>
                  ${isRenaming ? `
                    <div class="profile-rename-row">
                      <input type="text" value="${escapeHtml(state.profileRename?.name || profile.name)}" data-profile-rename-input="${escapeHtml(profile.id)}" placeholder="Tên profile">
                      <button class="tonal-button" type="button" data-action="commit-rename-profile" data-profile-id="${escapeHtml(profile.id)}">Lưu</button>
                      <button class="ghost-button" type="button" data-action="cancel-rename-profile">Hủy</button>
                    </div>
                  ` : `
                    <div class="profile-card-actions">
                      <button class="ghost-button" type="button" data-action="load-saved-profile" data-profile-id="${escapeHtml(profile.id)}">Tải</button>
                      <button class="ghost-button" type="button" data-action="duplicate-saved-profile" data-profile-id="${escapeHtml(profile.id)}">Nhân bản</button>
                      <button class="ghost-button" type="button" data-action="rename-saved-profile" data-profile-id="${escapeHtml(profile.id)}" ${profile.locked ? "disabled" : ""}>Đổi tên</button>
                      <button class="ghost-button" type="button" data-action="toggle-pin-saved-profile" data-profile-id="${escapeHtml(profile.id)}">${profile.pinned ? "Bỏ ghim" : "Ghim"}</button>
                      <button class="ghost-button" type="button" data-action="toggle-lock-saved-profile" data-profile-id="${escapeHtml(profile.id)}">${profile.locked ? "Mở khóa" : "Khóa"}</button>
                      <button class="ghost-button" type="button" data-action="export-saved-profile" data-profile-id="${escapeHtml(profile.id)}">Xuất</button>
                      <button class="ghost-button" type="button" data-action="delete-saved-profile" data-profile-id="${escapeHtml(profile.id)}" ${profile.locked ? "disabled" : ""}>Xóa</button>
                    </div>
                  `}
                </article>
              `;
            }).join("")}
        </div>
      </section>
    `;
  } else if (panel === "analytics") {
    content = renderAnalyticsPanel();
  } else if (panel === "memory") {
    content = renderMemoryPanel();
  } else {
    content = renderActivityPanel();
  }

  els.utilityDrawer.classList.remove("hidden");
  els.utilityDrawer.innerHTML = `
    <div class="drawer-backdrop" data-action="close-drawer"></div>
    <aside class="drawer-shell glass-panel glass-primary">
      <div class="drawer-header">
        <div>
          <p class="eyebrow">Ngăn công cụ</p>
          <h2 class="drawer-title">${escapeHtml(getUtilityPanelLabel(panel))}</h2>
        </div>
        <button class="icon-button" type="button" data-action="close-drawer">Đóng</button>
      </div>
      <div class="drawer-tabs">
        <button class="drawer-tab${panel === "profiles" ? " active" : ""}" type="button" data-action="set-utility-panel" data-panel="profiles">Profile</button>
        <button class="drawer-tab${panel === "analytics" ? " active" : ""}" type="button" data-action="set-utility-panel" data-panel="analytics">Thống kê</button>
        <button class="drawer-tab${panel === "memory" ? " active" : ""}" type="button" data-action="set-utility-panel" data-panel="memory">Ghi nhớ</button>
        <button class="drawer-tab${panel === "activity" ? " active" : ""}" type="button" data-action="set-utility-panel" data-panel="activity">Hoạt động</button>
      </div>
      <div class="drawer-content">
        ${content}
      </div>
    </aside>
  `;
}

function renderAnalytics() {
  return;
}

function renderMemorySections() {
  return;
}

function renderApplyHistory() {
  return;
}

function renderWorkspaceHeader() {
  return;
}

function renderSuggestionGroups(slotId, currentValue) {
  return "";
}

function renderSlotCard(slot) {
  return "";
}

function renderSlots() {
  return;
}

function shouldShowStickyBar() {
  return state.saving || getDirtySlots().length > 0 || Boolean(state.stickyState);
}

function renderStickyApplyBar() {
  if (!shouldShowStickyBar()) {
    els.applyDock.innerHTML = "";
    return;
  }

  const dirtySlots = getDirtySlots();
  const tone = state.saving
    ? ""
    : state.stickyState?.status === "success"
      ? " tone-ok"
      : (state.stickyState?.status === "error" || state.stickyState?.status === "validation-error" ? " tone-error" : "");

  const summary = state.saving
    ? "Đang ghi alias vào 9router và xác thực trạng thái DB..."
    : state.stickyState?.message
      ? state.stickyState.message
    : state.stickyState?.status === "success"
      ? `Đã áp dụng thành công. Đã tạo bản sao lưu tại ${state.stickyState.backupPath || "không có"}.`
      : state.stickyState?.status === "validation-error"
        ? `Phát hiện lệch xác thực ở ${state.stickyState.mismatchCount || 0} slot.`
        : state.stickyState?.status === "error"
          ? state.stickyState.message || "Ghi bridge thất bại."
          : `Có ${dirtySlots.length} thay đổi chưa lưu đang được giữ cục bộ.`;

  els.applyDock.innerHTML = `
    <div class="apply-dock${tone}">
      <div class="dock-row">
        <div class="dock-copy">
          <div class="history-title">${escapeHtml(summary)}</div>
          <div class="activity-meta">
            ${dirtySlots.length > 0 ? escapeHtml(getVisibleDirtySlotLabels().join(", ")) : "Nếu Claude Desktop chưa phản hồi ngay, hãy khởi động lại 9router thủ công."}
          </div>
        </div>
        <div class="dock-actions">
          <button class="ghost-button" type="button" data-action="discard-all" ${state.saving || dirtySlots.length === 0 ? "disabled" : ""}>Bỏ thay đổi</button>
          <button class="primary-button" type="button" data-action="apply-all" ${state.saving || dirtySlots.length === 0 ? "disabled" : ""}>Áp dụng mapping</button>
        </div>
      </div>
    </div>
  `;
}

function renderDegradedBanner() {
  return;
}

function renderProfilePreviewModal() {
  const profilePreview = state.pendingProfilePreview;
  const setPreview = state.pendingProfileSetImport;
  const modelPicker = state.pendingModelPicker;

  if (!profilePreview && !setPreview && !modelPicker) {
    els.modalLayer.classList.add("hidden");
    els.modalLayer.innerHTML = "";
    return;
  }

  if (modelPicker) {
    const slot = getSlotById(modelPicker.slotId);
    const currentValue = slot ? getDraftAlias(slot.id) : "";
    const groups = slot ? getModelPickerGroups(slot.id) : [];

    els.modalLayer.classList.remove("hidden");
    els.modalLayer.innerHTML = `
      <div class="modal-backdrop" data-action="close-model-picker"></div>
      <section class="modal-panel glass-panel glass-primary model-picker-window">
        <div class="model-picker-head">
          <div class="model-picker-titlebar">
            <div class="window-dots" aria-hidden="true">
              <span class="window-dot dot-close"></span>
              <span class="window-dot dot-min"></span>
              <span class="window-dot dot-max"></span>
            </div>
            <div>
              <p class="eyebrow">Bộ chọn model</p>
              <h2 class="drawer-title">${escapeHtml(slot ? `Chọn model cho ${slot.label}` : "Chọn model")}</h2>
            </div>
          </div>
          <button class="icon-button model-picker-close" type="button" data-action="close-model-picker">Đóng</button>
        </div>

        <div class="model-picker-toolbar">
          <label class="field">
            <span>Tìm model</span>
            <input id="modelPickerSearchInput" type="text" value="${escapeHtml(state.ui.search)}" placeholder="Tìm theo model id, root hoặc provider">
          </label>

          <div class="model-picker-status-row">
            <div class="segmented-control">
              <button class="segmented-button${!state.ui.showAll ? " active" : ""}" type="button" data-action="set-catalog-scope" data-scope="code-first">Ưu tiên code</button>
              <button class="segmented-button${state.ui.showAll ? " active" : ""}" type="button" data-action="set-catalog-scope" data-scope="all">Toàn bộ danh mục</button>
            </div>
            ${slot ? renderPill(slot.label, "neutral") : ""}
            ${currentValue ? renderPill(truncateMiddle(currentValue, 36)) : ""}
          </div>

          <div class="filter-chip-row">
            <button class="filter-chip${getSelectedProviders().length === getVisibleProviders().length || getVisibleProviders().length === 0 ? " active" : ""}" type="button" data-provider-chip="__all__">Tất cả provider</button>
            ${getVisibleProviders().map((provider) => `
              <button class="filter-chip${getSelectedProviders().includes(provider) ? " active" : ""}" type="button" data-provider-chip="${escapeHtml(provider)}">
                ${escapeHtml(provider)}
              </button>
            `).join("")}
          </div>
        </div>

        ${!slot ? `
          <article class="empty-card model-picker-empty">
            <p class="empty-state">Không tìm thấy slot để mở bộ chọn model.</p>
          </article>
        ` : !state.catalog.ok ? `
          <article class="empty-card model-picker-empty">
            ${renderBadge("Danh mục suy giảm", "pending")}
            <p class="empty-state">Danh mục trực tiếp hiện chưa khả dụng. Hãy nhập model thủ công hoặc thử tải lại sau.</p>
          </article>
        ` : groups.length === 0 ? `
          <article class="empty-card model-picker-empty">
            ${renderBadge("Không có kết quả", "pending")}
            <p class="empty-state">Không có model nào khớp với bộ lọc hiện tại. Hãy xóa tìm kiếm hoặc mở rộng phạm vi danh mục.</p>
          </article>
        ` : `
          <div class="model-picker-scroll">
            ${groups.map((group) => `
              <section class="model-picker-group">
                <div class="model-picker-group-head">
                  <div>
                    <div class="history-title">${escapeHtml(group.label)}</div>
                    <div class="helper">${escapeHtml(group.description)}</div>
                  </div>
                  ${renderBadge(`${group.models.length} model`)}
                </div>
                <div class="model-picker-chip-grid">
                  ${group.models.map((model) => renderModelPickerChip(slot.id, model, currentValue)).join("")}
                </div>
              </section>
            `).join("")}
          </div>
        `}
      </section>
    `;
    return;
  }

  if (setPreview) {
    const plan = buildProfileSetImportPlan(setPreview.mode, setPreview.importedProfiles);
    const summary = plan.summary;

    els.modalLayer.classList.remove("hidden");
    els.modalLayer.innerHTML = `
      <div class="modal-backdrop" data-action="close-profile-set-preview"></div>
      <section class="modal-panel glass-panel glass-primary">
        <div class="drawer-header">
          <div>
            <p class="eyebrow">Xem trước nhập bộ profile</p>
            <h2 class="drawer-title">${summary.importedCount} profile sắp nhập</h2>
          </div>
          ${renderBadge(getImportModeLabel(plan.mode))}
        </div>
        <div class="segmented-control">
          <button class="segmented-button${plan.mode === "merge" ? " active" : ""}" type="button" data-action="set-import-mode" data-mode="merge">Gộp</button>
          <button class="segmented-button${plan.mode === "replace" ? " active" : ""}" type="button" data-action="set-import-mode" data-mode="replace">Thay thế</button>
          <button class="segmented-button${plan.mode === "skip-locked" ? " active" : ""}" type="button" data-action="set-import-mode" data-mode="skip-locked">Bỏ qua đã khóa</button>
        </div>
        <div class="profile-badge-row" style="margin-top: 16px;">
          ${renderBadge(`Tạo ${summary.created}`, "ok")}
          ${renderBadge(`Cập nhật ${summary.updated}`)}
          ${renderBadge(`Bỏ qua khóa ${summary.skippedLocked}`, "pending")}
          ${renderBadge(`Loại ${summary.droppedByLimit}`, "error")}
          ${renderBadge(`Sau cùng ${summary.finalCount}`)}
        </div>
        <div class="preview-diff-list">
          ${plan.operations.length === 0 ? `<article class="empty-card"><p class="empty-state">Không có thao tác profile nào để áp dụng.</p></article>` : plan.operations.map((operation) => `
            <article class="preview-diff-item">
              <div class="profile-card-head">
                <div class="history-title">${escapeHtml(operation.name)}</div>
                ${renderBadge(getProfileOperationLabel(operation.type), operation.type === "create" ? "ok" : operation.type === "skip-locked" ? "pending" : "neutral")}
              </div>
              <div class="helper">${escapeHtml(operation.detail)}</div>
            </article>
          `).join("")}
        </div>
        <div class="modal-actions">
          <button class="ghost-button" type="button" data-action="close-profile-set-preview">Hủy</button>
          <button class="primary-button" type="button" data-action="confirm-profile-set-import">Áp dụng nhập</button>
        </div>
      </section>
    `;
    return;
  }

  const preview = profilePreview;
  els.modalLayer.classList.remove("hidden");
  const diffRows = preview.diffRows || [];
  els.modalLayer.innerHTML = `
    <div class="modal-backdrop" data-action="close-profile-preview"></div>
    <section class="modal-panel glass-panel glass-primary">
      <div class="drawer-header">
        <div>
          <p class="eyebrow">Xem trước profile</p>
          <h2 class="drawer-title">${escapeHtml(preview.profileName)}</h2>
        </div>
        ${renderBadge(getProfileSourceLabel(preview.sourceType))}
      </div>
      <div class="helper">
        ${diffRows.length === 0
          ? "Không có thay đổi nào so với bản nháp hiện tại."
          : `Nếu tiếp tục, sẽ đưa ${diffRows.length} thay đổi slot vào bản nháp.`}
      </div>
      <div class="preview-diff-list">
        ${diffRows.length === 0
          ? `<article class="empty-card"><p class="empty-state">Bản nháp hiện tại đã khớp với profile này.</p></article>`
          : diffRows.map((row) => `
            <article class="preview-diff-item">
              <div class="history-title">${escapeHtml(row.slotLabel)}</div>
              <div class="preview-diff-values">
                <span class="mono">${escapeHtml(row.from)}</span>
                <span class="preview-arrow">-></span>
                <span class="mono">${escapeHtml(row.to)}</span>
              </div>
            </article>
          `).join("")}
      </div>
      <div class="modal-actions">
        <button class="ghost-button" type="button" data-action="close-profile-preview">Hủy</button>
        <button class="primary-button" type="button" data-action="confirm-profile-preview">Đưa vào bản nháp</button>
      </div>
    </section>
  `;
}

function renderAll() {
  syncSelectedProviders();
  ensureSelectedSlot();
  renderHero();
  renderSystemHealth();
  renderProviderFilters();
  renderQuickPresets();
  renderProfileManager();
  renderStickyApplyBar();
  renderProfilePreviewModal();
}

function patchSlotCardVisual(slotId) {
  const active = document.activeElement;
  const shouldPreserve = active && active.matches("[data-slot-input]") && active.dataset.slotInput === slotId;
  const start = shouldPreserve ? active.selectionStart : null;
  const end = shouldPreserve ? active.selectionEnd : null;

  renderAll();

  if (shouldPreserve) {
    const next = document.querySelector(`[data-slot-input="${CSS.escape(slotId)}"]`);
    if (next) {
      next.focus();
      if (typeof next.setSelectionRange === "function" && start !== null && end !== null) {
        next.setSelectionRange(start, end);
      }
    }
  }
}

async function loadHealth() {
  const response = await fetch("/api/health");
  state.health = await response.json();
}

async function loadCatalog() {
  const response = await fetch("/api/catalog/models");
  state.catalog = await response.json();
}

async function loadBridgeState() {
  const response = await fetch("/api/bridge/state");
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "Không thể tải trạng thái bridge");
  }

  state.slots = Array.isArray(payload.slots) ? payload.slots : [];
  state.persistedAliases = { ...(payload.bridge?.aliases || {}) };
  state.draftAliases = { ...state.persistedAliases };
  state.rawMode = Object.fromEntries(state.slots.map((slot) => [slot.id, Boolean(state.rawMode[slot.id])]));
  ensureSelectedSlot();
}

async function reloadAll() {
  state.saving = false;
  const tasks = await Promise.allSettled([loadHealth(), loadCatalog(), loadBridgeState()]);
  const rejection = tasks.find((result) => result.status === "rejected");
  if (rejection) {
    state.lastApplyResult = {
      status: "error",
      message: rejection.reason?.message || "Khởi tạo ứng dụng thất bại",
      appliedAt: new Date().toISOString(),
      mismatches: [],
      mismatchCount: 0
    };
  }

  persistStoredState();
  renderAll();
}

async function applyMappings() {
  const mappings = {};
  for (const slot of state.slots) {
    const value = getDraftAlias(slot.id).trim();
    if (!value) {
      setLastApplyResult({
        status: "error",
        message: `Model đích không được để trống cho slot: ${slot.id}`,
        appliedAt: new Date().toISOString(),
        mismatches: [],
        mismatchCount: 0,
        hideAt: Date.now() + STICKY_SUCCESS_MS
      });
      renderAll();
      return;
    }
    mappings[slot.id] = value;
  }

  const changedSlots = getDirtySlots().map((slot) => slot.id);
  state.saving = true;
  renderAll();

  try {
    const response = await fetch("/api/bridge/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mappings })
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "Ghi bridge thất bại");
    }

    state.persistedAliases = { ...(payload.bridge?.aliases || {}) };
    state.draftAliases = { ...state.persistedAliases };
    changedSlots.forEach((slotId) => touchRecentTarget(state.persistedAliases[slotId]));

    const status = payload.validation?.ok ? "success" : "validation-error";
    const result = {
      status,
      appliedAt: new Date().toISOString(),
      backupPath: payload.backupPath || "",
      mismatches: payload.validation?.mismatches || [],
      mismatchCount: payload.validation?.mismatches?.length || 0,
      hideAt: Date.now() + STICKY_SUCCESS_MS
    };

    setLastApplyResult(result);
    recordApplyHistory({
      status,
      appliedAt: result.appliedAt,
      changedSlots,
      backupPath: result.backupPath,
      message: status === "success" ? "Xác thực thành công" : "Lệch xác thực"
    });
  } catch (error) {
    const result = {
      status: "error",
      message: error.message || "Ghi bridge thất bại",
      appliedAt: new Date().toISOString(),
      mismatches: [],
      mismatchCount: 0,
      hideAt: Date.now() + STICKY_SUCCESS_MS
    };
    setLastApplyResult(result);
    recordApplyHistory({
      status: "error",
      appliedAt: result.appliedAt,
      changedSlots,
      message: result.message,
      backupPath: ""
    });
  } finally {
    state.saving = false;
    persistStoredState();
    renderAll();
  }
}

function discardAllEdits() {
  state.draftAliases = { ...state.persistedAliases };
  state.stickyState = null;
  renderAll();
}

function toggleProvider(provider) {
  const visible = getVisibleProviders();
  if (provider === "__all__") {
    state.ui.selectedProviders = [...visible];
  } else if (state.ui.selectedProviders.includes(provider)) {
    state.ui.selectedProviders = state.ui.selectedProviders.filter((entry) => entry !== provider);
  } else {
    state.ui.selectedProviders = [...state.ui.selectedProviders, provider];
  }

  syncSelectedProviders();
  persistStoredState();
  renderAll();
}

function handleClick(event) {
  const target = event.target.closest("[data-provider-chip], [data-preset-id], [data-search-model], [data-system-profile], [data-action]");
  if (!target) {
    return;
  }

  if (target.dataset.providerChip) {
    toggleProvider(target.dataset.providerChip);
    return;
  }

  if (target.dataset.presetId) {
    applyQuickPreset(target.dataset.presetId);
    return;
  }

  if (target.dataset.searchModel) {
    setSearchFromModel(target.dataset.searchModel);
    return;
  }

  if (target.dataset.systemProfile) {
    loadSystemProfile(target.dataset.systemProfile);
    return;
  }

  const action = target.dataset.action;
  const slotId = target.dataset.slotId;

  if (action === "reload-all") {
    reloadAll();
    return;
  }

  if (action === "toggle-utility-panel") {
    toggleUtilityPanel(target.dataset.panel || "profiles");
    return;
  }

  if (action === "set-utility-panel") {
    openUtilityPanel(target.dataset.panel || "profiles");
    return;
  }

  if (action === "close-drawer") {
    closeUtilityDrawer();
    return;
  }

  if (action === "select-slot") {
    selectSlot(slotId);
    return;
  }

  if (action === "close-model-picker") {
    closeModelPicker();
    renderAll();
    return;
  }

  if (action === "close-profile-preview") {
    closeProfilePreview();
    renderAll();
    return;
  }

  if (action === "confirm-profile-preview") {
    confirmProfilePreview();
    return;
  }

  if (action === "close-profile-set-preview") {
    closeProfileSetImportPreview();
    renderAll();
    return;
  }

  if (action === "set-import-mode") {
    setProfileSetImportMode(target.dataset.mode || "");
    renderAll();
    return;
  }

  if (action === "confirm-profile-set-import") {
    applyProfileSetImportPreview();
    return;
  }

  if (action === "pick-model") {
    state.draftAliases[slotId] = target.dataset.modelId || "";
    state.rawMode[slotId] = false;
    touchRecentTarget(state.draftAliases[slotId]);
    closeModelPicker();
    renderAll();
    return;
  }

  if (action === "toggle-favorite-model") {
    toggleFavorite(target.dataset.modelId || "");
    renderAll();
    return;
  }

  if (action === "reset-slot") {
    state.draftAliases[slotId] = getPersistedAlias(slotId);
    renderAll();
    return;
  }

  if (action === "default-slot") {
    state.draftAliases[slotId] = getDefaultRoute(slotId);
    renderAll();
    return;
  }

  if (action === "set-raw-mode") {
    state.rawMode[slotId] = target.dataset.mode === "raw";
    renderAll();
    return;
  }

  if (action === "toggle-favorite-current") {
    toggleFavorite(getDraftAlias(slotId));
    renderAll();
    return;
  }

  if (action === "open-model-picker") {
    openModelPicker(slotId, { seedFromCurrent: Boolean(getDraftAlias(slotId)) });
    return;
  }

  if (action === "set-catalog-lens") {
    state.ui.catalogLens = target.dataset.lens === "all-matches" ? "all-matches" : "recommended";
    persistStoredState();
    renderAll();
    return;
  }

  if (action === "set-catalog-scope") {
    state.ui.showAll = target.dataset.scope === "all";
    persistStoredState();
    renderAll();
    return;
  }

  if (action === "clear-search") {
    state.ui.search = "";
    renderAll();
    return;
  }

  if (action === "apply-all") {
    applyMappings();
    return;
  }

  if (action === "discard-all") {
    discardAllEdits();
    return;
  }

  if (action === "save-current-profile") {
    saveCurrentProfile();
    return;
  }

  if (action === "export-profile") {
    exportProfile();
    return;
  }

  if (action === "import-profile") {
    openProfileFilePicker("single-mapping");
    return;
  }

  if (action === "load-saved-profile") {
    loadSavedProfile(target.dataset.profileId);
    return;
  }

  if (action === "duplicate-saved-profile") {
    duplicateSavedProfile(target.dataset.profileId);
    return;
  }

  if (action === "rename-saved-profile") {
    startRenameSavedProfile(target.dataset.profileId);
    return;
  }

  if (action === "cancel-rename-profile") {
    cancelRenameSavedProfile();
    return;
  }

  if (action === "commit-rename-profile") {
    commitRenameSavedProfile(target.dataset.profileId, state.profileRename?.name || "");
    return;
  }

  if (action === "toggle-pin-saved-profile") {
    togglePinSavedProfile(target.dataset.profileId);
    return;
  }

  if (action === "toggle-lock-saved-profile") {
    toggleLockSavedProfile(target.dataset.profileId);
    return;
  }

  if (action === "select-all-profiles") {
    selectAllProfiles();
    renderAll();
    return;
  }

  if (action === "clear-selected-profiles") {
    clearSelectedProfiles();
    renderAll();
    return;
  }

  if (action === "bulk-pin-selected") {
    pinUnpinSelectedProfiles(true);
    return;
  }

  if (action === "bulk-unpin-selected") {
    pinUnpinSelectedProfiles(false);
    return;
  }

  if (action === "export-profile-set") {
    exportSavedProfileSet();
    return;
  }

  if (action === "import-profile-set") {
    openProfileFilePicker("profile-set");
    return;
  }

  if (action === "delete-saved-profile") {
    deleteSavedProfile(target.dataset.profileId);
    return;
  }

  if (action === "export-saved-profile") {
    exportSavedProfile(target.dataset.profileId);
  }
}

function handleInput(event) {
  if (event.target.id === "catalogSearchInput") {
    const active = event.target;
    const start = active.selectionStart;
    const end = active.selectionEnd;
    state.ui.search = active.value;
    renderQuickPresets();
    const next = document.getElementById("catalogSearchInput");
    if (next) {
      next.focus();
      if (typeof next.setSelectionRange === "function" && start !== null && end !== null) {
        next.setSelectionRange(start, end);
      }
    }
    return;
  }

  if (event.target.id === "modelPickerSearchInput") {
    const active = event.target;
    const start = active.selectionStart;
    const end = active.selectionEnd;
    state.ui.search = active.value;
    renderAll();
    const next = document.getElementById("modelPickerSearchInput");
    if (next) {
      next.focus();
      if (typeof next.setSelectionRange === "function" && start !== null && end !== null) {
        next.setSelectionRange(start, end);
      }
    }
    return;
  }

  if (event.target.id === "profileNameInput") {
    state.ui.profileDraftName = event.target.value;
    return;
  }

  if (event.target.matches("[data-profile-rename-input]")) {
    const profileId = event.target.dataset.profileRenameInput;
    if (state.profileRename?.id === profileId) {
      state.profileRename.name = event.target.value;
    }
    return;
  }

  if (event.target.matches("[data-slot-input]")) {
    const slotId = event.target.dataset.slotInput;
    state.draftAliases[slotId] = event.target.value;
    patchSlotCardVisual(slotId);
  }
}

function handleKeydown(event) {
  if ((state.pendingProfilePreview || state.pendingProfileSetImport || state.pendingModelPicker) && event.key === "Escape") {
    closeProfilePreview();
    closeProfileSetImportPreview();
    closeModelPicker();
    renderAll();
    return;
  }

  if (state.ui.isUtilityDrawerOpen && event.key === "Escape") {
    closeUtilityDrawer();
    return;
  }

  if (event.target.id === "profileNameInput" && event.key === "Enter") {
    event.preventDefault();
    saveCurrentProfile();
    return;
  }

  if (!event.target.matches("[data-profile-rename-input]")) {
    return;
  }

  const profileId = event.target.dataset.profileRenameInput;
  if (event.key === "Enter") {
    event.preventDefault();
    commitRenameSavedProfile(profileId, state.profileRename?.name || event.target.value);
    return;
  }

  if (event.key === "Escape") {
    event.preventDefault();
    cancelRenameSavedProfile();
  }
}

function handleChange(event) {
  if (event.target.id === "catalogSortSelect") {
    state.ui.sortMode = event.target.value || "recommended";
    persistStoredState();
    renderAll();
    return;
  }

  if (event.target.matches('[data-action="toggle-select-profile"]')) {
    const profileId = event.target.dataset.profileId;
    if (event.target.checked) {
      if (!isProfileSelected(profileId)) {
        state.selectedProfileIds = [...state.selectedProfileIds, profileId];
      }
    } else {
      state.selectedProfileIds = state.selectedProfileIds.filter((id) => id !== profileId);
    }
    renderAll();
    return;
  }

}

function wireStaticEvents() {
  els.profileFileInput.addEventListener("change", handleProfileFile);
  document.addEventListener("click", handleClick);
  document.addEventListener("input", handleInput);
  document.addEventListener("change", handleChange);
  document.addEventListener("keydown", handleKeydown);
}

async function init() {
  hydrateStoredState();
  wireStaticEvents();
  renderAll();
  await reloadAll();
}

init();
