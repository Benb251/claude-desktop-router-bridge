const STORAGE_KEY = "chrono-spirit-ui-state-v2";
const MAX_FAVORITES = 12;
const MAX_RECENT_TARGETS = 8;
const MAX_APPLY_HISTORY = 5;
const MAX_SAVED_PROFILES = 12;
const STICKY_SUCCESS_MS = 6000;

const QUICK_PRESETS = [
  {
    id: "preset-sonnet-gpt54",
    title: "Sonnet -> cx/gpt-5.4",
    description: "Route the main Sonnet slot to GPT-5.4 through cx.",
    mappings: { "claude-sonnet-4-6": "cx/gpt-5.4" }
  },
  {
    id: "preset-sonnet-codex-high",
    title: "Sonnet -> cx/gpt-5.3-codex-high",
    description: "Bias the default coding slot toward Codex High.",
    mappings: { "claude-sonnet-4-6": "cx/gpt-5.3-codex-high" }
  },
  {
    id: "preset-sonnet-claude",
    title: "Sonnet -> cc/claude-sonnet-4-6",
    description: "Restore the Sonnet slot to the Claude-coded route.",
    mappings: { "claude-sonnet-4-6": "cc/claude-sonnet-4-6" }
  },
  {
    id: "preset-opus-github",
    title: "Opus -> gh/claude-opus-4.6",
    description: "Use the GitHub-hosted Opus route for the heavy slot.",
    mappings: { "claude-opus-4-6": "gh/claude-opus-4.6" }
  },
  {
    id: "preset-restore-defaults",
    title: "Restore all defaults",
    description: "Stage every slot back to its default Claude route.",
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
    sortMode: "provider"
  },
  favorites: [],
  recentTargets: [],
  applyHistory: [],
  savedProfiles: [],
  selectedProfileIds: [],
  profileFileImportMode: "single-mapping",
  pendingProfilePreview: null,
  pendingProfileSetImport: null,
  profileRename: null,
  lastApplyResult: null,
  saving: false,
  stickyState: null
};

const els = {
  heroSummary: document.getElementById("heroSummary"),
  heroStatusRail: document.getElementById("heroStatusRail"),
  systemHealth: document.getElementById("systemHealth"),
  searchInput: document.getElementById("searchInput"),
  modeCodeFirst: document.getElementById("modeCodeFirst"),
  modeShowAll: document.getElementById("modeShowAll"),
  sortSelect: document.getElementById("sortSelect"),
  providerFilters: document.getElementById("providerFilters"),
  quickPresets: document.getElementById("quickPresets"),
  profileNameInput: document.getElementById("profileNameInput"),
  saveProfileButton: document.getElementById("saveProfileButton"),
  profileQuickLoads: document.getElementById("profileQuickLoads"),
  profileBulkActions: document.getElementById("profileBulkActions"),
  profileBulkSummary: document.getElementById("profileBulkSummary"),
  profileManagerList: document.getElementById("profileManagerList"),
  profilePreviewModal: document.getElementById("profilePreviewModal"),
  analyticsGrid: document.getElementById("analyticsGrid"),
  topTargets: document.getElementById("topTargets"),
  favoritesSection: document.getElementById("favoritesSection"),
  recentTargetsSection: document.getElementById("recentTargetsSection"),
  applyHistorySection: document.getElementById("applyHistorySection"),
  workspaceHeader: document.getElementById("workspaceHeader"),
  degradedBanner: document.getElementById("degradedBanner"),
  slotList: document.getElementById("slotList"),
  stickyApplyBar: document.getElementById("stickyApplyBar"),
  exportProfileButton: document.getElementById("exportProfileButton"),
  importProfileButton: document.getElementById("importProfileButton"),
  opsExportProfileButton: document.getElementById("opsExportProfileButton"),
  opsImportProfileButton: document.getElementById("opsImportProfileButton"),
  profileFileInput: document.getElementById("profileFileInput"),
  reloadButton: document.getElementById("reloadButton"),
  saveButton: document.getElementById("saveButton")
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
    return "n/a";
  }

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return "n/a";
  }

  const diffSeconds = Math.round((Date.now() - timestamp) / 1000);
  const absSeconds = Math.abs(diffSeconds);
  if (absSeconds < 10) {
    return "just now";
  }
  if (absSeconds < 60) {
    return `${absSeconds}s ago`;
  }

  const diffMinutes = Math.round(diffSeconds / 60);
  const absMinutes = Math.abs(diffMinutes);
  if (absMinutes < 60) {
    return `${absMinutes}m ago`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  const absHours = Math.abs(diffHours);
  if (absHours < 24) {
    return `${absHours}h ago`;
  }

  const diffDays = Math.round(diffHours / 24);
  return `${Math.abs(diffDays)}d ago`;
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

function loadStoredState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
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
      sortMode: state.ui.sortMode
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
      name: String(profile.name || "Unnamed profile"),
      source: String(profile.source || "local"),
      savedAt: String(profile.savedAt || new Date().toISOString()),
      pinned: Boolean(profile.pinned),
      locked: Boolean(profile.locked),
      mappings: profile?.mappings && typeof profile.mappings === "object" ? profile.mappings : {}
    }))
    : [];
  state.ui.showAll = Boolean(stored.uiPrefs?.showAll);
  state.ui.selectedProviders = Array.isArray(stored.uiPrefs?.selectedProviders) ? stored.uiPrefs.selectedProviders : [];
  state.ui.sortMode = stored.uiPrefs?.sortMode || "provider";
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
  if (els.searchInput) {
    els.searchInput.value = state.ui.search;
  }
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
      const score = (model) => {
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
      };

      return score(b) - score(a) || a.ownedBy.localeCompare(b.ownedBy) || a.id.localeCompare(b.id);
    });
    return ranked;
  }

  ranked.sort((a, b) => a.ownedBy.localeCompare(b.ownedBy) || a.id.localeCompare(b.id));
  return ranked;
}

function getFilteredModels() {
  return sortModels(state.catalog.models.filter(modelMatchesFilters));
}

function getSuggestionGroups(currentValue) {
  if (!state.catalog.ok) {
    return [];
  }

  const filtered = getFilteredModels();
  const groups = [];

  const favorites = filtered.filter((model) => isFavorite(model.id));
  if (favorites.length > 0) {
    groups.push({ key: "favorites", label: "Favorites", models: favorites });
  }

  const byProvider = new Map();
  for (const model of filtered) {
    if (!byProvider.has(model.ownedBy)) {
      byProvider.set(model.ownedBy, []);
    }
    byProvider.get(model.ownedBy).push(model);
  }

  for (const [provider, models] of byProvider.entries()) {
    groups.push({ key: provider, label: provider, models });
  }

  if (currentValue && !filtered.some((model) => model.id === currentValue)) {
    const existing = state.catalog.models.find((model) => model.id === currentValue);
    const fallbackModel = existing || {
      id: currentValue,
      root: currentValue.includes("/") ? currentValue.split("/").slice(1).join("/") : currentValue,
      ownedBy: currentValue.includes("/") ? currentValue.split("/")[0] : "custom",
      isCodeFirst: true
    };
    groups.unshift({ key: "current-target", label: "Current target", models: [fallbackModel] });
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
    return { className: "state-error", badgeTone: "error", label: "Mismatch" };
  }
  if (isDirty(slotId)) {
    return { className: "state-dirty", badgeTone: "pending", label: "Unsaved" };
  }
  if (getDraftAlias(slotId) === getDefaultRoute(slotId)) {
    return { className: "state-default", badgeTone: "ok", label: "Default" };
  }
  return { className: "state-custom", badgeTone: "", label: "Custom" };
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
    throw new Error("Profile name cannot be empty.");
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
        from: currentValue || "(empty)",
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

function confirmProfilePreview() {
  if (!state.pendingProfilePreview) {
    return;
  }

  const appliedCount = applyMappingsToDraft(state.pendingProfilePreview.mappings || {});
  const profileName = state.pendingProfilePreview.profileName || "profile";
  closeProfilePreview();
  setTransientNotice({ status: "success", message: `Loaded profile "${profileName}" into draft (${appliedCount} slots).` });
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
    const name = String(els.profileNameInput.value || "").trim();
    const existing = state.savedProfiles.find((entry) => entry.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      if (existing.locked) {
        setTransientNotice({ status: "error", message: `Profile "${existing.name}" is locked. Unlock it before updating.` });
        renderAll();
        return;
      }
      existing.savedAt = new Date().toISOString();
      existing.mappings = Object.fromEntries(state.slots.map((slot) => [slot.id, getDraftAlias(slot.id)]));
      persistStoredState();
      setTransientNotice({ status: "success", message: `Updated profile "${existing.name}".` });
      els.profileNameInput.value = "";
      renderAll();
      return;
    }

    const profile = buildNamedProfile(name, "local");
    upsertSavedProfile(profile);
    els.profileNameInput.value = "";
    setTransientNotice({ status: "success", message: `Saved profile "${profile.name}".` });
  } catch (error) {
    setTransientNotice({ status: "error", message: error.message || "Failed to save profile." });
  }
  renderAll();
}

function loadSavedProfile(profileId) {
  const profile = getSavedProfileById(profileId);
  if (!profile) {
    setTransientNotice({ status: "error", message: "Saved profile not found." });
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
    setTransientNotice({ status: "error", message: "Saved profile not found." });
    renderAll();
    return;
  }

  if (profile.locked) {
    setTransientNotice({ status: "error", message: `Profile "${profile.name}" is locked and cannot be renamed.` });
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
    setTransientNotice({ status: "error", message: "Profile name cannot be empty." });
    renderAll();
    return;
  }

  const profile = getSavedProfileById(profileId);
  if (!profile) {
    setTransientNotice({ status: "error", message: "Saved profile not found." });
    renderAll();
    return;
  }

  if (profile.locked) {
    setTransientNotice({ status: "error", message: `Profile "${profile.name}" is locked and cannot be renamed.` });
    renderAll();
    return;
  }

  const nameConflict = state.savedProfiles.some((entry) => entry.id !== profileId && entry.name.toLowerCase() === trimmedName.toLowerCase());
  if (nameConflict) {
    setTransientNotice({ status: "error", message: `Another profile already uses "${trimmedName}".` });
    renderAll();
    return;
  }

  profile.name = trimmedName;
  profile.savedAt = new Date().toISOString();
  state.profileRename = null;
  persistStoredState();
  setTransientNotice({ status: "success", message: `Renamed profile to "${trimmedName}".` });
  renderAll();
}

function createDuplicateProfileName(sourceName) {
  const base = `${sourceName} Copy`;
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
  const base = String(sourceName || "Imported Profile").trim() || "Imported Profile";
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
    setTransientNotice({ status: "error", message: "Saved profile not found." });
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
  setTransientNotice({ status: "success", message: `Created duplicate profile "${cloned.name}".` });
  renderAll();
}

function togglePinSavedProfile(profileId) {
  const profile = getSavedProfileById(profileId);
  if (!profile) {
    setTransientNotice({ status: "error", message: "Saved profile not found." });
    renderAll();
    return;
  }

  profile.pinned = !profile.pinned;
  persistStoredState();
  setTransientNotice({
    status: "success",
    message: profile.pinned ? `Pinned "${profile.name}" to top.` : `Unpinned "${profile.name}".`
  });
  renderAll();
}

function pinUnpinSelectedProfiles(pinValue) {
  const selected = state.selectedProfileIds
    .map((id) => getSavedProfileById(id))
    .filter(Boolean);

  if (selected.length === 0) {
    setTransientNotice({ status: "error", message: "No selected profiles for bulk pin/unpin." });
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
      ? `Pinned ${changed} selected profile(s).`
      : `Unpinned ${changed} selected profile(s).`
  });
  renderAll();
}

function toggleLockSavedProfile(profileId) {
  const profile = getSavedProfileById(profileId);
  if (!profile) {
    setTransientNotice({ status: "error", message: "Saved profile not found." });
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
    message: profile.locked ? `Locked "${profile.name}".` : `Unlocked "${profile.name}".`
  });
  renderAll();
}

function deleteSavedProfile(profileId) {
  const profile = getSavedProfileById(profileId);
  if (profile?.locked) {
    setTransientNotice({ status: "error", message: `Profile "${profile.name}" is locked and cannot be deleted.` });
    renderAll();
    return;
  }

  state.savedProfiles = state.savedProfiles.filter((entry) => entry.id !== profileId);
  if (state.profileRename?.id === profileId) {
    state.profileRename = null;
  }
  persistStoredState();
  setTransientNotice({ status: "success", message: `Deleted profile "${profile?.name || profileId}".` });
  renderAll();
}

function loadSystemProfile(kind) {
  const mappings = createSystemProfile(kind);
  const labels = {
    default: "Default",
    coding: "Coding",
    fast: "Fast"
  };
  openProfilePreview({
    profileName: `${labels[kind] || kind} preset`,
    mappings,
    sourceType: "system",
    sourceId: kind
  });
  renderAll();
}

function exportProfile() {
  const payload = buildProfilePayload();
  payload.name = "current-draft";
  downloadProfilePayload(payload, "current-draft");
  setTransientNotice({ status: "success", message: "Profile JSON exported from current draft state." });
  renderAll();
}

function exportSavedProfile(profileId) {
  const profile = state.savedProfiles.find((entry) => entry.id === profileId);
  if (!profile) {
    setTransientNotice({ status: "error", message: "Saved profile not found." });
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
  setTransientNotice({ status: "success", message: `Exported saved profile "${profile.name}".` });
  renderAll();
}

function exportSavedProfileSet() {
  if (state.savedProfiles.length === 0) {
    setTransientNotice({ status: "error", message: "No saved profiles available for export." });
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

  downloadProfilePayload(payload, "saved-profile-set");
  setTransientNotice({ status: "success", message: `Exported ${payload.profileCount} saved profiles into one file.` });
  renderAll();
}

function createUniqueNameInRegistry(baseName, registry) {
  const base = String(baseName || "Imported Profile").trim() || "Imported Profile";
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
    throw new Error("Profile set JSON is invalid.");
  }

  const entries = Array.isArray(payload.savedProfiles) ? payload.savedProfiles : null;
  if (!entries || entries.length === 0) {
    throw new Error("Profile set JSON is missing savedProfiles.");
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

    const profileName = createUniqueNameInRegistry(raw?.name || "Imported Profile", nameRegistry);
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
    throw new Error("No compatible profile mappings were found in this profile set.");
  }

  return normalizedProfiles;
}

function toStoredProfile(profile) {
  return {
    id: `profile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: String(profile.name || "Imported Profile"),
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
      detail: "replace set"
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
            detail: "local profile is locked"
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
          detail: existing.locked ? "updated locked profile" : "updated existing profile"
        });
      } else {
        nextProfiles.push(toStoredProfile(imported));
        indexByName.set(key, nextProfiles.length - 1);
        summary.created += 1;
        operations.push({
          name: imported.name,
          type: "create",
          detail: "new profile"
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
    message: `Imported set (${plan.mode}): +${summary.created} create, ${summary.updated} update, ${summary.skippedLocked} skipped locked.`
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
    throw new Error("Profile JSON is invalid.");
  }

  const draftMappings = payload?.mappings?.draft;
  if (!draftMappings || typeof draftMappings !== "object" || Array.isArray(draftMappings)) {
    throw new Error("Profile JSON is missing mappings.draft.");
  }

  let appliedCount = 0;
  for (const slot of state.slots) {
    if (Object.hasOwn(draftMappings, slot.id)) {
      const value = String(draftMappings[slot.id] || "").trim();
      if (!value) {
        throw new Error(`Imported profile has an empty target for slot: ${slot.id}`);
      }
      state.draftAliases[slot.id] = value;
      touchRecentTarget(value);
      appliedCount += 1;
    }
  }

  if (appliedCount === 0) {
    throw new Error("No supported slot mappings were found in the imported profile.");
  }

  setTransientNotice({ status: "success", message: `Imported profile staged ${appliedCount} slot mapping(s).` });
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
    setTransientNotice({ status: "error", message: error.message || "Profile import failed." });
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

  if (preset.mappings === "__defaults__") {
    for (const slot of state.slots) {
      state.draftAliases[slot.id] = getDefaultRoute(slot.id);
    }
  } else {
    for (const [slotId, target] of Object.entries(preset.mappings)) {
      if (getSlotById(slotId)) {
        state.draftAliases[slotId] = target;
      }
    }
  }

  renderAll();
}

function renderHero() {
  const metrics = deriveMetrics();
  const catalogState = state.catalog.ok ? "catalog healthy" : "catalog degraded";
  els.heroSummary.textContent = `${metrics.slotCount} slots loaded, ${metrics.liveCatalogCount} live models, ${catalogState}.`;

  const pills = [
    { label: `Catalog: ${state.catalog.ok ? "Live" : "Degraded"}` },
    { label: `DB: ${state.health?.ok ? "Reachable" : "Unknown"}` },
    { label: `Unsaved changes: ${metrics.dirtyCount}` },
    { label: `Sort: ${state.ui.sortMode}` }
  ];

  els.heroStatusRail.innerHTML = pills.map((pill) => `<span class="status-pill">${escapeHtml(pill.label)}</span>`).join("");
  els.saveButton.disabled = state.saving || metrics.dirtyCount === 0;
  els.reloadButton.disabled = state.saving;
  els.exportProfileButton.disabled = state.saving || metrics.slotCount === 0;
  els.importProfileButton.disabled = state.saving || metrics.slotCount === 0;
  els.opsExportProfileButton.disabled = state.saving || metrics.slotCount === 0;
  els.opsImportProfileButton.disabled = state.saving || metrics.slotCount === 0;
  els.saveProfileButton.disabled = state.saving || metrics.slotCount === 0;
}

function renderSystemHealth() {
  const cards = [
    {
      label: "Router status",
      value: state.health?.ok ? "Online" : "Unknown",
      tone: state.health?.ok ? "ok" : "error",
      meta: state.health?.routerBaseUrl || "Router URL unavailable",
      checkedAt: state.health?.checkedAt
    },
    {
      label: "Catalog status",
      value: state.catalog.ok ? "Live" : "Degraded",
      tone: state.catalog.ok ? "ok" : "error",
      meta: state.catalog.ok ? `${state.catalog.models.length} models available` : state.catalog.error || "Live catalog unavailable",
      checkedAt: state.catalog.checkedAt
    },
    {
      label: "Bridge DB",
      value: state.health?.routerDbPath ? "Reachable" : "Missing",
      tone: state.health?.routerDbPath ? "ok" : "error",
      meta: state.health?.routerDbPath || "DB path unavailable",
      checkedAt: state.health?.checkedAt
    },
    {
      label: "Last apply",
      value: state.lastApplyResult?.status || "Idle",
      tone: state.lastApplyResult?.status === "success" ? "ok" : (state.lastApplyResult?.status === "error" || state.lastApplyResult?.status === "validation-error" ? "error" : "pending"),
      meta: state.lastApplyResult?.backupPath || "No write recorded in this session",
      checkedAt: state.lastApplyResult?.appliedAt
    }
  ];

  els.systemHealth.innerHTML = `
    <div class="section-head">
      <div>
        <p class="eyebrow">System Health</p>
        <h2>Operational Snapshot</h2>
      </div>
    </div>
    <div class="health-grid">
      ${cards.map((card) => `
        <article class="health-card">
          <div class="toolbar-inline">
            <span class="badge ${card.tone}">${escapeHtml(card.label)}</span>
          </div>
          <div class="health-value">${escapeHtml(card.value)}</div>
          <div class="helper">${escapeHtml(card.meta)}</div>
          <div class="activity-meta">${escapeHtml(formatRelativeTime(card.checkedAt))}</div>
        </article>
      `).join("")}
    </div>
  `;
}

function renderProviderFilters() {
  const providers = getVisibleProviders();
  const selected = getSelectedProviders();
  const allActive = selected.length === providers.length || providers.length === 0;

  els.providerFilters.innerHTML = [
    `<button class="filter-chip${allActive ? " active" : ""}" type="button" data-provider-chip="__all__">All</button>`,
    ...providers.map((provider) => `
      <button class="filter-chip${selected.includes(provider) ? " active" : ""}" type="button" data-provider-chip="${escapeHtml(provider)}">
        ${escapeHtml(provider)}
      </button>
    `)
  ].join("");

  els.modeCodeFirst.classList.toggle("active", !state.ui.showAll);
  els.modeShowAll.classList.toggle("active", state.ui.showAll);
  els.sortSelect.value = state.ui.sortMode;
}

function renderQuickPresets() {
  els.quickPresets.innerHTML = QUICK_PRESETS.map((preset) => `
    <button class="preset-card" type="button" data-preset-id="${escapeHtml(preset.id)}">
      <strong>${escapeHtml(preset.title)}</strong>
      <p>${escapeHtml(preset.description)}</p>
    </button>
  `).join("");
}

function renderProfileManager() {
  syncSelectedProfileIds();

  els.profileQuickLoads.innerHTML = [
    `<button class="action-chip" type="button" data-system-profile="default">Load default</button>`,
    `<button class="action-chip" type="button" data-system-profile="coding">Load coding</button>`,
    `<button class="action-chip" type="button" data-system-profile="fast">Load fast</button>`
  ].join("");

  const profiles = getSortedSavedProfiles();
  const selectedCount = state.selectedProfileIds.length;

  els.profileBulkActions.innerHTML = `
    <button class="action-chip" type="button" data-action="select-all-profiles" ${profiles.length === 0 ? "disabled" : ""}>Select all</button>
    <button class="action-chip" type="button" data-action="clear-selected-profiles" ${selectedCount === 0 ? "disabled" : ""}>Clear selection</button>
    <button class="action-chip" type="button" data-action="bulk-pin-selected" ${selectedCount === 0 ? "disabled" : ""}>Pin selected</button>
    <button class="action-chip" type="button" data-action="bulk-unpin-selected" ${selectedCount === 0 ? "disabled" : ""}>Unpin selected</button>
    <button class="action-chip" type="button" data-action="export-profile-set" ${profiles.length === 0 ? "disabled" : ""}>Export profile set</button>
    <button class="action-chip" type="button" data-action="import-profile-set">Import profile set</button>
  `;

  els.profileBulkSummary.textContent = profiles.length === 0
    ? "No saved profiles available."
    : `${selectedCount} selected out of ${profiles.length} saved profiles.`;

  els.profileManagerList.innerHTML = profiles.length === 0
    ? `<div class="empty-state">No local profiles saved yet.</div>`
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
          <div class="toolbar-inline">
            <label class="profile-select-control">
              <input type="checkbox" data-action="toggle-select-profile" data-profile-id="${escapeHtml(profile.id)}" ${selected ? "checked" : ""}>
              <span>Select</span>
            </label>
            ${profile.pinned ? `<span class="badge ok">Pinned</span>` : ""}
            ${profile.locked ? `<span class="badge pending">Locked</span>` : ""}
            <span class="badge">${escapeHtml(profile.source || "local")}</span>
          </div>
        </div>
        <div class="profile-badge-row">
          <span class="badge">Mapped ${stats.mappedCount}</span>
          <span class="badge">Custom ${stats.customCount}</span>
          <span class="badge ${stats.diffCount > 0 ? "pending" : "ok"}">Diff ${stats.diffCount}</span>
        </div>
        <div class="helper">${Object.keys(profile.mappings || {}).length} slot mappings saved.</div>
        ${isRenaming ? `
          <div class="profile-rename-row">
            <input type="text" value="${escapeHtml(state.profileRename?.name || profile.name)}" data-profile-rename-input="${escapeHtml(profile.id)}" placeholder="Profile name">
            <button class="action-chip" type="button" data-action="commit-rename-profile" data-profile-id="${escapeHtml(profile.id)}">Save</button>
            <button class="action-chip" type="button" data-action="cancel-rename-profile">Cancel</button>
          </div>
        ` : `
          <div class="profile-card-actions">
            <button class="action-chip" type="button" data-action="load-saved-profile" data-profile-id="${escapeHtml(profile.id)}">Load</button>
            <button class="action-chip" type="button" data-action="duplicate-saved-profile" data-profile-id="${escapeHtml(profile.id)}">Duplicate</button>
            <button class="action-chip" type="button" data-action="rename-saved-profile" data-profile-id="${escapeHtml(profile.id)}" ${profile.locked ? "disabled" : ""}>Rename</button>
            <button class="action-chip" type="button" data-action="toggle-pin-saved-profile" data-profile-id="${escapeHtml(profile.id)}">${profile.pinned ? "Unpin" : "Pin"}</button>
            <button class="action-chip" type="button" data-action="toggle-lock-saved-profile" data-profile-id="${escapeHtml(profile.id)}">${profile.locked ? "Unlock" : "Lock"}</button>
            <button class="action-chip" type="button" data-action="export-saved-profile" data-profile-id="${escapeHtml(profile.id)}">Export</button>
            <button class="action-chip" type="button" data-action="delete-saved-profile" data-profile-id="${escapeHtml(profile.id)}" ${profile.locked ? "disabled" : ""}>Delete</button>
          </div>
        `}
      </article>
    `;
    }).join("");
}

function renderAnalytics() {
  const metrics = deriveMetrics();
  const cards = [
    { label: "Mapped slots", value: String(metrics.mappedSlots) },
    { label: "Custom routes", value: String(metrics.customRouteCount) },
    { label: "Unsaved edits", value: String(metrics.dirtyCount) },
    { label: "Last apply", value: metrics.lastApplyStatus },
    { label: "Catalog size", value: `${metrics.liveCatalogCount} / ${metrics.codeFirstCatalogCount}` },
    { label: "Favorites", value: String(metrics.favoriteCount) }
  ];

  els.analyticsGrid.innerHTML = cards.map((card) => `
    <article class="metric-card">
      <div class="metric-label">${escapeHtml(card.label)}</div>
      <div class="metric-value">${escapeHtml(card.value)}</div>
    </article>
  `).join("");

  const topTargets = getTopTargets();
  els.topTargets.innerHTML = `
    <div class="stack-title">Top targets</div>
    ${topTargets.length === 0 ? `<div class="empty-state">No active routes yet.</div>` : topTargets.map((entry) => `
      <article class="target-card">
        <div class="history-title mono">${escapeHtml(entry.modelId)}</div>
        <div class="activity-meta">Used by ${entry.count} slot${entry.count > 1 ? "s" : ""}</div>
      </article>
    `).join("")}
  `;
}

function renderMemorySections() {
  els.favoritesSection.innerHTML = `
    <div class="stack-title">Favorites</div>
    ${state.favorites.length === 0 ? `<div class="empty-state">No favorite targets yet.</div>` : `
      <div class="favorites-row">
        ${state.favorites.map((modelId) => `
          <button class="action-chip" type="button" data-search-model="${escapeHtml(modelId)}">${escapeHtml(modelId)}</button>
        `).join("")}
      </div>
    `}
  `;

  els.recentTargetsSection.innerHTML = `
    <div class="stack-title">Recent targets</div>
    ${state.recentTargets.length === 0 ? `<div class="empty-state">No recent targets yet.</div>` : `
      <div class="recent-row">
        ${state.recentTargets.map((entry) => `
          <button class="action-chip" type="button" data-search-model="${escapeHtml(entry.modelId)}">
            ${escapeHtml(entry.modelId)}
          </button>
        `).join("")}
      </div>
    `}
  `;
}

function renderApplyHistory() {
  els.applyHistorySection.innerHTML = state.applyHistory.length === 0
    ? `<div class="empty-state">No bridge writes recorded in this browser yet.</div>`
    : state.applyHistory.map((entry) => `
      <article class="history-item">
        <div class="toolbar-inline">
          <span class="badge ${entry.status === "success" ? "ok" : entry.status === "validation-error" ? "pending" : "error"}">${escapeHtml(entry.status)}</span>
        </div>
        <div class="history-title">${escapeHtml(entry.changedSlots.join(", ") || "No changed slots")}</div>
        <div class="activity-meta">${escapeHtml(formatRelativeTime(entry.appliedAt))}</div>
        <div class="helper">${escapeHtml(entry.backupPath || entry.message || "No backup path")}</div>
      </article>
    `).join("");
}

function renderWorkspaceHeader() {
  const filtered = getFilteredModels();
  const dirtyCount = getDirtySlots().length;
  els.workspaceHeader.innerHTML = `
    <div class="workspace-headline">
      <p class="eyebrow">Mapping Workspace</p>
      <h2>Desktop slot remapping</h2>
      <div class="workspace-summary">
        ${state.slots.length} slots, ${filtered.length} visible models, ${dirtyCount} pending edit${dirtyCount === 1 ? "" : "s"}.
      </div>
    </div>
    <div class="workspace-rail">
      <span class="status-pill">${escapeHtml(state.catalog.ok ? "Catalog live" : "Catalog degraded")}</span>
      <span class="status-pill">${escapeHtml(`Providers: ${getSelectedProviders().length || 0}`)}</span>
    </div>
  `;
}

function renderSuggestionGroups(slotId, currentValue) {
  if (state.rawMode[slotId]) {
    return `<div class="raw-hint">Raw input mode is active for this slot. Suggestions are intentionally hidden.</div>`;
  }

  if (!state.catalog.ok) {
    return `<div class="raw-hint">Live catalog unavailable. Use raw input to set any model id manually.</div>`;
  }

  const groups = getSuggestionGroups(currentValue);
  if (groups.length === 0) {
    return `<div class="raw-hint">No suggestions match the current filter. Search less aggressively or switch to Show all.</div>`;
  }

  return groups.map((group) => `
    <section class="provider-group">
      <div class="provider-head">
        <div class="provider-label">${escapeHtml(group.label)}</div>
        <div class="helper">${group.models.length} candidate${group.models.length === 1 ? "" : "s"}</div>
      </div>
      <div class="chip-row">
        ${group.models.map((model) => {
          const active = model.id === currentValue;
          const flags = [
            model.isCodeFirst ? `<span class="flag-chip">Code-first</span>` : "",
            isFavorite(model.id) ? `<span class="flag-chip favorite">Favorite</span>` : "",
            getRecentRank(model.id) !== -1 ? `<span class="flag-chip recent">Recent</span>` : "",
            active ? `<span class="flag-chip current">Current</span>` : ""
          ].filter(Boolean).join("");

          return `
            <button class="model-chip${active ? " active" : ""}${isFavorite(model.id) ? " favorite" : ""}${getRecentRank(model.id) !== -1 ? " recent" : ""}" type="button" data-action="pick-model" data-slot-id="${escapeHtml(slotId)}" data-model-id="${escapeHtml(model.id)}">
              <strong>${highlightMatch(model.root, state.ui.search)}</strong>
              <span class="mono">${highlightMatch(model.id, state.ui.search)}</span>
              <div class="model-flags">${flags}</div>
            </button>
          `;
        }).join("")}
      </div>
    </section>
  `).join("");
}

function renderSlotCard(slot) {
  const currentValue = getDraftAlias(slot.id);
  const persistedValue = getPersistedAlias(slot.id);
  const defaultValue = getDefaultRoute(slot.id);
  const status = getSlotStatus(slot.id);
  const rawChecked = state.rawMode[slot.id] ? "checked" : "";

  return `
    <article class="slot-card ${status.className}" data-slot-id="${escapeHtml(slot.id)}">
      <div class="slot-head">
        <div class="slot-title">
          <p class="eyebrow">Claude Desktop slot</p>
          <h2>${escapeHtml(slot.label)}</h2>
        </div>
        <span class="state-badge ${status.badgeTone}">${escapeHtml(status.label)}</span>
      </div>

      <div class="slot-subcopy">${escapeHtml(slot.hint || "")}</div>

      <div class="slot-lines">
        <div><span class="slot-line-label">Slot id:</span> <span class="mono">${escapeHtml(slot.id)}</span></div>
        <div><span class="slot-line-label">Current DB alias:</span> <span class="mono">${escapeHtml(persistedValue || "none")}</span></div>
        <div><span class="slot-line-label">Default route:</span> <span class="mono">${escapeHtml(defaultValue)}</span></div>
      </div>

      <div class="slot-edit-grid">
        <div>
          <label class="field">
            <span>Target 9router model</span>
            <input class="mapping-input mono" type="text" value="${escapeHtml(currentValue)}" placeholder="cx/gpt-5.4" data-slot-input="${escapeHtml(slot.id)}">
          </label>

          <div class="slot-metrics">
            <span class="badge ${isDirty(slot.id) ? "pending" : "ok"}">${isDirty(slot.id) ? "Draft diverges from DB" : "Draft matches DB"}</span>
            <span class="badge">${escapeHtml(state.rawMode[slot.id] ? "Raw input" : "Guided")}</span>
          </div>

          <div class="slot-actions">
            <button class="action-chip" type="button" data-action="reset-slot" data-slot-id="${escapeHtml(slot.id)}">Revert to persisted</button>
            <button class="action-chip" type="button" data-action="default-slot" data-slot-id="${escapeHtml(slot.id)}">Map to default Claude</button>
            <button class="action-chip${isFavorite(currentValue) ? " active" : ""}" type="button" data-action="toggle-favorite-current" data-slot-id="${escapeHtml(slot.id)}">
              ${isFavorite(currentValue) ? "Unfavorite current" : "Favorite current"}
            </button>
          </div>
        </div>

        <div class="slot-side-actions">
          <label class="toggle-inline">
            <input type="checkbox" data-action="toggle-raw" data-slot-id="${escapeHtml(slot.id)}" ${rawChecked}>
            <span>Use raw input</span>
          </label>
          <button class="ghost-button" type="button" data-action="search-current" data-slot-id="${escapeHtml(slot.id)}">Focus current target</button>
        </div>
      </div>

      <div class="slot-suggestions">
        ${renderSuggestionGroups(slot.id, currentValue)}
      </div>
    </article>
  `;
}

function renderSlots() {
  els.slotList.innerHTML = state.slots.map(renderSlotCard).join("");
}

function shouldShowStickyBar() {
  return state.saving || getDirtySlots().length > 0 || Boolean(state.stickyState);
}

function renderStickyApplyBar() {
  if (!shouldShowStickyBar()) {
    els.stickyApplyBar.innerHTML = "";
    return;
  }

  const dirtySlots = getDirtySlots();
  const tone = state.saving
    ? ""
    : state.stickyState?.status === "success"
      ? "success"
      : (state.stickyState?.status === "error" || state.stickyState?.status === "validation-error" ? "error" : "");

  const summary = state.saving
    ? "Writing aliases into 9router and validating the DB state..."
    : state.stickyState?.message
      ? state.stickyState.message
    : state.stickyState?.status === "success"
      ? `Applied successfully. Backup created at ${state.stickyState.backupPath || "n/a"}.`
      : state.stickyState?.status === "validation-error"
        ? `Validation mismatch detected for ${state.stickyState.mismatchCount || 0} slot(s).`
        : state.stickyState?.status === "error"
          ? state.stickyState.message || "Bridge write failed."
          : `${dirtySlots.length} unsaved change${dirtySlots.length === 1 ? "" : "s"} staged locally.`;

  els.stickyApplyBar.innerHTML = `
    <div class="sticky-bar ${tone}">
      <div class="sticky-row">
        <div class="sticky-copy">
          <div class="history-title">${escapeHtml(summary)}</div>
          <div class="activity-meta">
            ${dirtySlots.length > 0 ? escapeHtml(getVisibleDirtySlotLabels().join(", ")) : "If Claude Desktop does not react immediately, restart 9router manually."}
          </div>
        </div>
        <div class="sticky-actions">
          <button class="ghost-button" type="button" data-action="discard-all" ${state.saving || dirtySlots.length === 0 ? "disabled" : ""}>Discard local edits</button>
          <button class="primary-button" type="button" data-action="apply-all" ${state.saving || dirtySlots.length === 0 ? "disabled" : ""}>Apply mapping</button>
        </div>
      </div>
    </div>
  `;
}

function renderDegradedBanner() {
  els.degradedBanner.classList.toggle("hidden", state.catalog.ok);
}

function renderProfilePreviewModal() {
  const profilePreview = state.pendingProfilePreview;
  const setPreview = state.pendingProfileSetImport;

  if (!profilePreview && !setPreview) {
    els.profilePreviewModal.classList.add("hidden");
    els.profilePreviewModal.innerHTML = "";
    return;
  }

  if (setPreview) {
    const plan = buildProfileSetImportPlan(setPreview.mode, setPreview.importedProfiles);
    const summary = plan.summary;

    els.profilePreviewModal.classList.remove("hidden");
    els.profilePreviewModal.innerHTML = `
      <div class="preview-backdrop" data-action="close-profile-set-preview"></div>
      <section class="preview-panel panel">
        <div class="section-head">
          <div>
            <p class="eyebrow">Profile Set Import Preview</p>
            <h2>${summary.importedCount} incoming profiles</h2>
          </div>
          <span class="badge">${escapeHtml(plan.mode)}</span>
        </div>
        <div class="mode-toggle preview-mode-toggle">
          <button class="segmented-button ${plan.mode === "merge" ? "active" : ""}" type="button" data-action="set-import-mode" data-mode="merge">Merge</button>
          <button class="segmented-button ${plan.mode === "replace" ? "active" : ""}" type="button" data-action="set-import-mode" data-mode="replace">Replace</button>
          <button class="segmented-button ${plan.mode === "skip-locked" ? "active" : ""}" type="button" data-action="set-import-mode" data-mode="skip-locked">Skip locked</button>
        </div>
        <div class="profile-badge-row">
          <span class="badge ok">Create ${summary.created}</span>
          <span class="badge">Update ${summary.updated}</span>
          <span class="badge pending">Skipped locked ${summary.skippedLocked}</span>
          <span class="badge error">Dropped ${summary.droppedByLimit}</span>
          <span class="badge">Final ${summary.finalCount}</span>
        </div>
        <div class="preview-diff-list">
          ${plan.operations.length === 0 ? `<div class="empty-state">No profile operations to apply.</div>` : plan.operations.map((operation) => `
            <article class="preview-diff-item">
              <div class="profile-card-head">
                <div class="history-title">${escapeHtml(operation.name)}</div>
                <span class="badge ${operation.type === "create" ? "ok" : operation.type === "skip-locked" ? "pending" : ""}">${escapeHtml(operation.type)}</span>
              </div>
              <div class="helper">${escapeHtml(operation.detail)}</div>
            </article>
          `).join("")}
        </div>
        <div class="profile-card-actions">
          <button class="ghost-button" type="button" data-action="close-profile-set-preview">Cancel</button>
          <button class="primary-button" type="button" data-action="confirm-profile-set-import">Apply import</button>
        </div>
      </section>
    `;
    return;
  }

  const preview = profilePreview;
  els.profilePreviewModal.classList.remove("hidden");
  const diffRows = preview.diffRows || [];
  els.profilePreviewModal.innerHTML = `
    <div class="preview-backdrop" data-action="close-profile-preview"></div>
    <section class="preview-panel panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">Profile Preview</p>
          <h2>${escapeHtml(preview.profileName)}</h2>
        </div>
        <span class="badge">${escapeHtml(preview.sourceType)}</span>
      </div>
      <div class="helper">
        ${diffRows.length === 0
          ? "No changes compared with current draft."
          : `${diffRows.length} slot change${diffRows.length === 1 ? "" : "s"} will be staged if you continue.`}
      </div>
      <div class="preview-diff-list">
        ${diffRows.length === 0
          ? `<div class="empty-state">Current draft already matches this profile.</div>`
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
      <div class="profile-card-actions">
        <button class="ghost-button" type="button" data-action="close-profile-preview">Cancel</button>
        <button class="primary-button" type="button" data-action="confirm-profile-preview">Stage profile</button>
      </div>
    </section>
  `;
}

function renderAll() {
  syncSelectedProviders();
  renderHero();
  renderSystemHealth();
  renderProviderFilters();
  renderQuickPresets();
  renderProfileManager();
  renderAnalytics();
  renderMemorySections();
  renderApplyHistory();
  renderWorkspaceHeader();
  renderDegradedBanner();
  renderSlots();
  renderStickyApplyBar();
  renderProfilePreviewModal();
}

function patchSlotCardVisual(slotId) {
  const card = els.slotList.querySelector(`[data-slot-id="${CSS.escape(slotId)}"]`);
  if (!card) {
    return;
  }

  const status = getSlotStatus(slotId);
  card.classList.remove("state-dirty", "state-custom", "state-default", "state-error");
  card.classList.add(status.className);

  const badge = card.querySelector(".state-badge");
  if (badge) {
    badge.className = `state-badge ${status.badgeTone}`.trim();
    badge.textContent = status.label;
  }

  const metrics = card.querySelector(".slot-metrics");
  if (metrics) {
    metrics.innerHTML = `
      <span class="badge ${isDirty(slotId) ? "pending" : "ok"}">${isDirty(slotId) ? "Draft diverges from DB" : "Draft matches DB"}</span>
      <span class="badge">${escapeHtml(state.rawMode[slotId] ? "Raw input" : "Guided")}</span>
    `;
  }

  const favoriteButton = card.querySelector('[data-action="toggle-favorite-current"]');
  if (favoriteButton) {
    const currentValue = getDraftAlias(slotId);
    favoriteButton.classList.toggle("active", isFavorite(currentValue));
    favoriteButton.textContent = isFavorite(currentValue) ? "Unfavorite current" : "Favorite current";
  }

  renderHero();
  renderAnalytics();
  renderWorkspaceHeader();
  renderStickyApplyBar();
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
    throw new Error(payload.error || "Cannot load bridge state");
  }

  state.slots = Array.isArray(payload.slots) ? payload.slots : [];
  state.persistedAliases = { ...(payload.bridge?.aliases || {}) };
  state.draftAliases = { ...state.persistedAliases };
  state.rawMode = Object.fromEntries(state.slots.map((slot) => [slot.id, Boolean(state.rawMode[slot.id])]));
}

async function reloadAll() {
  state.saving = false;
  const tasks = await Promise.allSettled([loadHealth(), loadCatalog(), loadBridgeState()]);
  const rejection = tasks.find((result) => result.status === "rejected");
  if (rejection) {
    state.lastApplyResult = {
      status: "error",
      message: rejection.reason?.message || "Bootstrap failed",
      appliedAt: new Date().toISOString(),
      mismatches: [],
      mismatchCount: 0
    };
  }

  if (els.searchInput) {
    els.searchInput.value = state.ui.search;
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
        message: `Target model cannot be empty for slot: ${slot.id}`,
        appliedAt: new Date().toISOString(),
        mismatches: [],
        mismatchCount: 0,
        hideAt: Date.now() + STICKY_SUCCESS_MS
      });
      return;
    }
    mappings[slot.id] = value;
  }

  const changedSlots = getDirtySlots().map((slot) => slot.id);
  state.saving = true;
  renderHero();
  renderStickyApplyBar();

  try {
    const response = await fetch("/api/bridge/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mappings })
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "Bridge write failed");
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
      message: status === "success" ? "Validation ok" : "Validation mismatch"
    });
  } catch (error) {
    const result = {
      status: "error",
      message: error.message || "Bridge write failed",
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
    touchRecentTarget(state.draftAliases[slotId]);
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

  if (action === "toggle-favorite-current") {
    toggleFavorite(getDraftAlias(slotId));
    renderAll();
    return;
  }

  if (action === "search-current") {
    setSearchFromModel(getDraftAlias(slotId));
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
  if (event.target === els.searchInput) {
    state.ui.search = els.searchInput.value;
    renderAll();
    return;
  }

  if (event.target === els.profileNameInput) {
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
  if ((state.pendingProfilePreview || state.pendingProfileSetImport) && event.key === "Escape") {
    closeProfilePreview();
    closeProfileSetImportPreview();
    renderAll();
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
  if (event.target === els.sortSelect) {
    state.ui.sortMode = els.sortSelect.value || "provider";
    persistStoredState();
    renderAll();
    return;
  }

  if (event.target === els.modeCodeFirst) {
    state.ui.showAll = false;
    persistStoredState();
    renderAll();
    return;
  }

  if (event.target === els.modeShowAll) {
    state.ui.showAll = true;
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

  if (event.target.matches('[data-action="toggle-raw"]')) {
    const slotId = event.target.dataset.slotId;
    state.rawMode[slotId] = event.target.checked;
    renderAll();
  }
}

function wireStaticEvents() {
  els.reloadButton.addEventListener("click", () => {
    reloadAll();
  });

  els.saveButton.addEventListener("click", () => {
    applyMappings();
  });

  els.exportProfileButton.addEventListener("click", () => {
    exportProfile();
  });

  els.importProfileButton.addEventListener("click", () => {
    openProfileFilePicker("single-mapping");
  });

  els.opsExportProfileButton.addEventListener("click", () => {
    exportProfile();
  });

  els.opsImportProfileButton.addEventListener("click", () => {
    openProfileFilePicker("single-mapping");
  });

  els.profileFileInput.addEventListener("change", handleProfileFile);
  els.saveProfileButton.addEventListener("click", () => {
    saveCurrentProfile();
  });

  els.modeCodeFirst.addEventListener("click", () => {
    state.ui.showAll = false;
    persistStoredState();
    renderAll();
  });
  els.modeShowAll.addEventListener("click", () => {
    state.ui.showAll = true;
    persistStoredState();
    renderAll();
  });

  document.addEventListener("click", handleClick);
  document.addEventListener("input", handleInput);
  document.addEventListener("change", handleChange);
  document.addEventListener("keydown", handleKeydown);
}

async function init() {
  hydrateStoredState();
  els.searchInput.value = state.ui.search;
  wireStaticEvents();
  renderAll();
  await reloadAll();
}

init();
