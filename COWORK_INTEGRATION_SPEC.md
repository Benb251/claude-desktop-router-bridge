# Cowork Integration Spec

## Purpose

Define a realistic path to route `Cowork -> local bridge -> 9router` without pretending the current `Claude Desktop -> db.json alias` bridge already covers Cowork.

This spec assumes the findings in [bao-cao-cowork-9router.md](C:/Users/benb/Desktop/Cowork/bao-cao-cowork-9router.md) are materially correct:

- Claude Code app can already be pointed at `9router` with `ANTHROPIC_BASE_URL` and token override.
- Cowork currently appears to use a separate Linux VM, OAuth session flow, and Anthropic host-bound request path.
- No public user-facing Cowork config has been found for a custom base URL or router endpoint override.

## Current State

Chrono Spirit currently handles one bridge surface only:

- fetch live catalog from `9router`
- read and write `modelAliases` in `%APPDATA%\\9router\\db.json`
- map known Claude-shaped slot ids from [config/desktop-slots.json](C:/Users/benb/.gemini/antigravity/playground/chrono-spirit/config/desktop-slots.json)

That is enough for `Claude Desktop` and the existing `Claude Code app -> 9router` workflow, but it does not cover a product that:

- does not read `db.json`
- does not honor the same base URL override path
- owns its own OAuth and VM lifecycle

## Non-Goal

This project should not treat Cowork support as "add more slots".

If Cowork cannot be configured through the same public mechanism as Claude Code app, then Cowork support is a second bridge mode with a different transport and session model.

## Success Criteria

Cowork integration is considered successful only if all of the following are true:

1. A Cowork-initiated model request reaches a local bridge component first.
2. The bridge can forward or translate the request into `9router`.
3. The bridge logs enough trace data to prove the route was used.
4. Standard Claude Desktop and Claude Code routing still works unchanged.
5. Failure and rollback behavior is explicit.

## Decision Gates

### Gate 1: Supported Injection

Question:
Can Cowork be given a custom endpoint or equivalent request redirection through a supported, stable configuration path?

Acceptable evidence:

- a writable config file
- a documented or discoverable environment injection path
- a stable app-side hook that does not require binary tampering

If `yes`:

- extend Chrono Spirit with a Cowork session configuration surface
- avoid building a new proxy unless strictly necessary

If `no`:

- do not keep expanding `db.json` alias logic
- move to a dedicated `Cowork bridge mode`

### Gate 2: Proxy Feasibility

Question:
Can Cowork's request path be proxied locally without patching binaries, modifying `app.asar`, or relying on fragile MITM hacks?

If `yes`:

- build a companion proxy service and integrate it into Chrono Spirit

If `no`:

- stop and document Cowork support as blocked by product constraints

## Recommended Architecture

The practical design target is a two-plane system.

### Plane A: Existing Alias Bridge

Keep the current path unchanged:

- Chrono Spirit UI
- `db.json` alias editor
- `9router` catalog and model alias persistence

### Plane B: Cowork Bridge Mode

Add a second runtime path:

- `Cowork`
- local proxy or facade service
- translation or forwarding layer
- `9router`

This should be treated as a separate subsystem, not an extension of `desktop-slots.json`.

## Cowork Bridge Mode

### Core Components

#### 1. Session Discovery

Responsibilities:

- detect whether Cowork is running
- collect the minimum viable session signals
- surface which auth/session mode is active

Suggested outputs:

- `running: boolean`
- `sessionSource: unknown | vm | app | web`
- `oauthState: unknown | present | missing | expired`
- `observedHosts: string[]`

#### 2. Local Cowork Proxy

Responsibilities:

- expose the local endpoint Cowork can actually reach, if such a route is possible
- receive Cowork-style requests
- validate headers and auth expectations
- generate trace ids per request

Notes:

- if Cowork cannot be redirected to a local endpoint, this component cannot be completed safely
- do not fake success here; make the limitation explicit

#### 3. Request Translator

Responsibilities:

- normalize Cowork request shape
- map to `9router` request shape
- preserve the chosen logical target model
- record translation failures with enough detail to debug

Possible translation duties:

- model id normalization
- message schema mapping
- tool-use field pass-through or rejection
- stream or chunk adaptation

#### 4. Router Client

Responsibilities:

- send translated requests to `9router`
- reuse the existing base URL and API key configuration model where possible
- return response streams or buffered responses to the proxy

#### 5. Trace and Audit Layer

Responsibilities:

- emit per-request logs
- distinguish `Cowork` traffic from `Desktop` traffic
- capture target model, upstream route, latency, and failure reason

Minimum fields:

- `traceId`
- `sourceApp`
- `incomingHost`
- `requestedModel`
- `resolvedRouterTarget`
- `responseMode`
- `status`
- `durationMs`

## Chrono Spirit UI Changes

The UI should show two bridge surfaces explicitly.

### Existing Section

Keep the current desktop mapping workspace for:

- model aliases
- saved profiles
- router catalog browsing

### New Section: Cowork

Add a dedicated status card or workspace for:

- Cowork process or session detection
- active endpoint mode
- observed auth state
- last 20 Cowork traces
- current go or no-go status
- known blockers

Recommended statuses:

- `Not detected`
- `Detected, no redirect path`
- `Redirect path found, proxy inactive`
- `Proxy active`
- `Proxy active, validation failed`

## Delivery Plan

### Phase 0: Evidence Hardening

Goal:
Turn the current findings into a repeatable diagnostic baseline.

Tasks:

- collect and normalize Cowork logs into one review checklist
- verify which process originates model calls
- verify whether any request ever touches localhost today
- identify the exact host and path patterns used during inference

Deliverable:

- a short diagnostics note with confirmed request path and auth path

Exit criteria:

- enough evidence to answer Gate 1 confidently

### Phase 1: Injection Path Assessment

Goal:
Prove or reject the existence of a supported endpoint override path.

Tasks:

- inspect writable config locations around Cowork runtime
- inspect launch environment inheritance
- validate whether any app-managed env map can be influenced externally
- reject hidden unsupported routes unless they are stable and reproducible

Deliverable:

- a yes or no result for Gate 1

Exit criteria:

- one concrete supported path or a documented no-go

### Phase 2A: If Gate 1 Is Yes

Goal:
Extend Chrono Spirit with a Cowork configuration panel.

Tasks:

- add Cowork status API endpoints
- add env or endpoint validation helpers
- add UI controls for session state, target endpoint, and verification
- add smoke coverage for Cowork detection and validation

Expected impact:

- moderate changes to `server.js` and the frontend
- minimal change to the existing alias bridge logic

### Phase 2B: If Gate 1 Is No and Gate 2 Is Yes

Goal:
Build a companion proxy mode.

Tasks:

- add a new backend module for Cowork proxy runtime
- define supported inbound paths and headers
- implement translation into `9router`
- add trace logging and health endpoints
- expose Cowork bridge state in the UI

Expected impact:

- this is effectively a second product surface inside the same app
- it should be isolated from `bridge-db.js`

### Phase 2C: If Gate 2 Is No

Goal:
Stop cleanly.

Tasks:

- document why Cowork support is blocked
- keep Chrono Spirit focused on supported routing surfaces
- avoid fragile interception workarounds in the mainline codebase

## Proposed Backend Changes

If proxy mode is pursued, add new modules instead of overloading the alias bridge.

Suggested file split:

- `lib/cowork-runtime.js`
- `lib/cowork-session.js`
- `lib/cowork-proxy.js`
- `lib/cowork-trace.js`

Suggested new API surface:

- `GET /api/cowork/health`
- `GET /api/cowork/state`
- `POST /api/cowork/validate`
- `GET /api/cowork/traces`

The existing routes should remain independent:

- `GET /api/health`
- `GET /api/catalog/models`
- `GET /api/bridge/state`
- `POST /api/bridge/state`

## Validation Plan

Minimum validation set:

1. Claude Desktop alias apply still works.
2. Existing smoke test still passes.
3. Cowork detection does not report false success.
4. A Cowork request, if supported, generates a local trace record.
5. The trace record proves which model and upstream route were used.
6. Error states are visible in the UI without reading raw logs.

## Risks

- Cowork may not expose any stable redirection path at all.
- OAuth tokens may be host-bound or session-bound in a way that prevents safe proxy reuse.
- Tool-use or streaming semantics may differ enough that naive forwarding breaks behavior.
- MITM-style interception may appear to work short-term but fail on app update.

## Recommendation

The next implementation step should not be code for proxying yet.

The correct next step is a short diagnostic sprint that answers Gate 1 and Gate 2 decisively. If both gates fail, the honest answer is that Cowork cannot be integrated safely with the current product constraints.
