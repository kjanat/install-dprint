# PROJECT KNOWLEDGE BASE

**Updated:** 2026-07-20\
**Branch:** native-ts-action

## OVERVIEW

GitHub Action (native TypeScript, node24) that installs the
[dprint](https://dprint.dev) code formatter and caches both the binary and its
WASM plugin store. Bundled with ncc; `dist/` is committed (actions run it
directly).

## STRUCTURE

```tree
./
├── action.yml        # Inputs/outputs, node24 main + post (post-if: always())
├── src/
│   ├── main.ts       # Orchestration: DPRINT_CACHE_DIR export, install, plugin cache restore, warmup
│   ├── install.ts    # Binary install: tool-cache -> actions/cache -> download; post-save state
│   ├── config.ts     # Config discovery ({.,}dprint.{jsonc,json}) + plugin cache key
│   ├── warmup.ts     # Plugin pre-download, 60s x3 hang-detecting retry, best-effort
│   ├── post.ts       # Saves binary + plugin caches; tolerates concurrent saves
│   ├── version.ts    # "latest" -> tag via GitHub releases redirect
│   └── platform.ts   # Target triple detection (incl. musl probe)
├── dist/             # ncc bundles (committed); rebuild with `bun run build`
└── .github/workflows/
    ├── autofix.yml   # Self-tests action + auto-formats via autofix-ci
    └── test.yml      # Cross-OS matrix: install, cache-hit, plugin-cache, no-cache, pinned version
```

## WHERE TO LOOK

| Task                       | Location             | Notes                                            |
| -------------------------- | -------------------- | ------------------------------------------------ |
| Change install/cache logic | `src/*.ts`           | Then `bun run build` and commit `dist/`          |
| Modify action inputs/outs  | `action.yml`         | Keep README tables in sync                       |
| Adjust formatting rules    | `.dprint.jsonc`      | Plugins: json, markdown, yaml, typescript, shfmt |
| Fix CI                     | `.github/workflows/` | test.yml self-references `@native-ts-action`     |

## CACHING MODEL

- `DPRINT_CACHE_DIR` is exported by main so the cached plugin path and the path
  dprint uses are identical on every OS.
- Binary: tool-cache (self-hosted) plus `actions/cache` keyed
  `dprint-bin-{os}-{arch}-{version}` (hosted runners).
- Plugins: `actions/cache` keyed `dprint-plugins-{os}-{version}-{configHash}`;
  the hash covers every discovered config file (deep search, `node_modules` and
  `.git` excluded); restore-keys fall back per version, then per OS.
- The post step runs on `always()` so failing format checks still save.
- Warmup pre-downloads plugins on non-exact hits; only timeouts retry, real
  failures warn once without failing the action.

## CONVENTIONS

- **Tabs everywhere**, double-quoted strings in TS
- **Formatter: dprint only**
- **Versioning**: semver tags (`v2.0.0`) + floating major tag (`v1`)
- **Build**: `bun run typecheck && bun run build` before committing src changes

## COMMANDS

```bash
bun run typecheck   # tsc --noEmit
bun run build       # ncc -> dist/ and dist/post/
dprint fmt          # format (requires dprint + shfmt)
```
