# Claude Desktop Router Bridge

Local bridge console for `Claude Desktop -> 9router`.

## What it does

- Reads the live catalog from `http://localhost:20128/v1/models`
- Reads and writes `9router` aliases in `%APPDATA%\\9router\\db.json`
- Stages draft mappings separately from persisted DB state
- Validates read-back state after every apply
- Creates a timestamped backup before every write
- Keeps local browser memory for favorites, recent targets, and recent apply history
- Supports profile import/export for slot mappings without touching the backend
- Supports a local profile manager with named saved drafts and quick-load profiles
- Supports preview diff before loading profiles, profile rename, and pin-to-top behavior
- Supports per-profile diff detail badges, duplicate profile, and lock protection
- Supports bulk profile actions: multi-select pin/unpin and profile-set export/import

## Related specs

- See `COWORK_INTEGRATION_SPEC.md` for the planned Cowork bridge architecture and go/no-go decision gates.

## Cowork bridge

Chrono Spirit now exposes a second local bridge for Cowork on `http://localhost:8000` by default.

- It serves a minimal local OAuth flow for the hidden `OAUTH_ENVIRONMENT=local` mode.
- It proxies Cowork ` /v1/* ` traffic to your configured `NINE_ROUTER_BASE_URL`.
- If `NINE_ROUTER_API_KEY` is set, the Cowork bridge rewrites outbound `Authorization` to that router key.
- Bridge state is visible at `GET /api/cowork/bridge`.

To launch Claude Desktop in the local Cowork OAuth mode after starting Chrono Spirit:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\launch-claude-cowork-local.ps1 -KillExistingClaude
```

This script sets:

- `CLAUDE_AI_URL=https://claude-ai.staging.ant.dev`
- `OAUTH_ENVIRONMENT=local`
- `ANTHROPIC_BASE_URL=http://localhost:8000`

This hidden OAuth path remains available as a legacy experiment, but the supported Cowork routing path is now the production-host MITM bridge below.

## Cowork MITM

Chrono Spirit can now intercept Cowork production API traffic for `api.anthropic.com` and `a-api.anthropic.com`, then route inference calls to `9router` while leaving OAuth/profile passthrough on Anthropic.

- `Lane A`
  Per-user PAC + local HTTP CONNECT proxy on `127.0.0.1`
- `Lane B`
  Hosts-file redirect fallback for the same API hosts
- Diagnostics
  `GET /api/cowork/mitm/status`, `GET /api/cowork/mitm/recent`, `GET /api/cowork/mitm/config`

Install and enable on Windows:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-cowork-mitm.ps1
$env:COWORK_MITM_ENABLED = "1"
npm start
```

If Cowork still does not hit the proxy lane, switch to transparent fallback:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\switch-cowork-mitm-lane.ps1 -Mode transparent
```

Inspect live status:

```powershell
Invoke-RestMethod http://localhost:4311/api/cowork/mitm/status | ConvertTo-Json -Depth 8
```

## UI model

Chrono Spirit is now a two-pane dark control room:

- Left `Ops Rail`
  Shows router/catalog/DB health, filters, presets, bridge analytics, favorites, recent targets, and recent applies.
- Right `Mapping Workspace`
  Shows every Claude Desktop slot as a stacked card with current alias, draft target, raw-input toggle, and grouped live suggestions.
- Sticky apply bar
  Surfaces unsaved edits, save progress, success, and validation mismatches without hiding the active workspace.
- Profile tools
  Export the current draft as JSON or import a saved profile to stage mappings before apply.
- Named profiles
  Save multiple local draft profiles, then load, duplicate, rename, pin, lock, export, or delete them from the Ops Rail.
- Preview before load
  Every profile load opens a diff preview so you can confirm slot changes before staging.
- Diff detail badges
  Each profile card shows `Mapped`, `Custom`, and `Diff` counts against the current draft.
- Bulk actions
  Multi-select profiles for batch pin/unpin, and export/import the entire saved profile set in one JSON file.
- Profile-set import modes
  `merge`, `replace`, and `skip-locked`, all with a preview modal before commit.

## Bridge concepts

- `Default route`
  The Claude-shaped route for a slot, such as `cc/claude-sonnet-4-6`.
- `Custom route`
  Any non-default target such as `cx/gpt-5.4` or `gh/claude-opus-4.6`.
- `Draft alias`
  The local unsaved value in the UI.
- `Persisted alias`
  The value currently stored in `9router\\db.json`.

## Local persistence

The browser stores a small local state bundle under `chrono-spirit-ui-state-v2`:

- favorite targets
- recent targets
- recent apply history
- saved local profiles
- UI preferences for provider filters, sort mode, and `Show all`

This data stays local to the browser profile on the same machine.

Locked profiles are protected against rename, delete, and same-name overwrite updates until unlocked.

## Profile import/export

- `Export profile`
  Downloads the current draft and persisted slot mappings as a JSON file.
- `Import profile`
  Reads a JSON file locally in the browser and stages any supported slot mappings into the draft state.

Import never writes directly to `9router`. Review the staged changes, then click `Apply mapping`.

Profile-set import opens a preview first, then applies based on selected mode:

- `merge`
  Create new profiles and update same-name profiles.
- `replace`
  Replace local saved profile list with incoming set.
- `skip-locked`
  Merge like above but skip updates for locked local profiles.

Imported profile names are normalized and de-duplicated inside each imported set.

## Built-in quick-load profiles

- `Load default`
  Restores every slot to its `cc/<slot>` default route.
- `Load coding`
  Biases the main coding slots toward Codex and Opus-oriented routes.
- `Load fast`
  Stages every slot toward Haiku-oriented fast routes.

Each quick-load action now opens the same diff preview before changes are staged.

## Degraded mode

If `GET /v1/models` fails:

- the catalog card switches to degraded
- the workspace stays usable
- raw input still works
- existing DB mappings still load from `9router\\db.json`

In degraded mode, you can still type a target model id manually and apply it.

## Run

```powershell
npm start
```

Then open `http://localhost:4311`.

If that port is already in use:

```powershell
$env:PORT = "4312"
npm start
```

## Smoke test

Run a local pre-release smoke test:

```powershell
npm run smoke
```

This starts a temporary mock catalog server, boots Chrono Spirit against a temp `db.json`, verifies the main API routes, applies one mapping, checks backup creation, and validates static file serving.

## Environment

- `PORT`
  Default: `4311`
- `NINE_ROUTER_BASE_URL`
  Default: `http://localhost:20128/v1`
- `NINE_ROUTER_DB_PATH`
  Default on Windows: `%APPDATA%\\9router\\db.json`
- `NINE_ROUTER_API_KEY`
  Optional. Only needed if your local `9router` protects `/v1/models`.
- `COWORK_BRIDGE_ENABLED`
  Default: enabled. Set `0` or `false` to disable the local Cowork bridge.
- `COWORK_BRIDGE_HOST`
  Default: `127.0.0.1`
- `COWORK_BRIDGE_PORT`
  Default: `8000`
- `COWORK_BRIDGE_FAKE_TOKEN`
  Optional. Override the fake local OAuth token prefix used by the Cowork bridge.
- `COWORK_MITM_ENABLED`
  Default: `0`
- `COWORK_MITM_MODE`
  Default: `system-proxy`
- `COWORK_MITM_PROXY_HOST`
  Default: `127.0.0.1`
- `COWORK_MITM_PROXY_PORT`
  Default: `8877`
- `COWORK_MITM_TLS_PORT`
  Default: `443`
- `COWORK_MITM_TARGET_HOSTS`
  Default: `api.anthropic.com,a-api.anthropic.com`
- `COWORK_MITM_CA_DIR`
  Default on Windows: `%LOCALAPPDATA%\\ChronoSpirit\\cowork-mitm`
- `COWORK_MITM_LOG_BODY_BYTES`
  Default: `2048`
- `COWORK_MITM_UPSTREAM_TIMEOUT_MS`
  Default: `45000`

## API

- `GET /api/health`
  Includes `checkedAt` plus live reachability for the catalog endpoint.
- `GET /api/catalog/models`
  Returns the live model list, provider groups, and `checkedAt`.
- `GET /api/bridge/state`
  Returns the supported Claude Desktop slots and the current persisted aliases.
- `POST /api/bridge/state`
  Applies mappings, creates a backup, then read-back validates the DB.
- `GET /api/cowork/bridge`
  Returns the local Cowork bridge status, recent requests, and startup errors if any.
- `GET /api/cowork/mitm/status`
  Returns Cowork MITM runtime status, install state, counters, and recent request summary.
- `GET /api/cowork/mitm/recent`
  Returns the recent MITM request list only.
- `GET /api/cowork/mitm/config`
  Returns the effective MITM config and last loaded install metadata.

## How it works

Example:

- Claude Desktop sends `claude-sonnet-4-6`
- Chrono Spirit writes:
  `modelAliases["claude-sonnet-4-6"] = "cx/gpt-5.4"`
- `9router` resolves the alias and routes the request to `cx/gpt-5.4`
- Claude Desktop still shows the original Claude label

## Important limits

- This bridge changes routing, not Claude Desktop labels.
- Some non-Claude targets may be less compatible with Claude Code tool-use expectations.
- If Claude Desktop does not react immediately after apply, restart `9router` manually.
- Runtime suggestions come from the live catalog, not from static presets.

## Pre-release checklist

- Run `npm run smoke`
- Confirm the real local workflow still works with your live `9router`
- Push the release commit to `main`
- Create and push a tag like `v0.1.0` to trigger `.github/workflows/release.yml`
- Review the generated GitHub Release notes and edit from `RELEASE_NOTES.md` if needed
- Review `.gitignore` coverage for local artifacts before first push
- Decide whether this repo should keep `"private": true` in `package.json`
- Add a license file if the repo will be shared beyond private/internal use
- Use `CHANGELOG.md` and `RELEASE_NOTES.md` as the starting point for release summaries
