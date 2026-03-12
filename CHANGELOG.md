# Changelog

## 0.1.0 - 2026-03-12

Initial release.

### Added

- Local bridge UI for remapping Claude Desktop slots to live 9router targets
- Live catalog loading from `/v1/models`
- Read/write alias control for `%APPDATA%\\9router\\db.json`
- Read-back validation and timestamped backup creation on apply
- Raw input mode and code-first catalog filtering
- Favorites, recents, and apply history stored in browser localStorage
- Named profile manager with quick-load defaults
- Profile diff preview, duplicate, rename, pin, lock, import, and export
- Bulk profile-set import/export with preview and import modes
- Cowork bridge mode for local Anthropic-compatible routing
- Cowork MITM helpers, install scripts, and runtime diagnostics
- Smoke test script for API/static/apply verification

### Notes

- Chrono Spirit changes routing only; it does not change labels inside Claude Desktop.
