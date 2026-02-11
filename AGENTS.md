# PROJECT KNOWLEDGE BASE

**Generated:** 2026-02-11\
**Commit:** 94176cd\
**Branch:** master

## OVERVIEW

GitHub Action (composite) that installs the [dprint](https://dprint.dev) code
formatter. Pure Bash + YAML, no build step, no dependencies.

## STRUCTURE

```tree
./
├── action.yml        # Action definition: inputs, outputs, composite step
├── install.sh        # All logic lives here (~30 lines)
├── .dprint.jsonc     # Formatting config (JSON, Markdown, YAML, Shell)
├── .github/workflows/
│   └── autofix.yml   # CI: self-tests action + auto-formats via autofix-ci
└── .zed/             # Zed editor: uses dprint as external formatter
```

## WHERE TO LOOK

| Task                      | Location                        | Notes                                             |
| ------------------------- | ------------------------------- | ------------------------------------------------- |
| Change install logic      | `install.sh`                    | Single entry point, strict bash                   |
| Modify action inputs/outs | `action.yml`                    | Composite action definition                       |
| Adjust formatting rules   | `.dprint.jsonc`                 | Plugins: json, markdown, yaml, exec (shfmt)       |
| Fix CI                    | `.github/workflows/autofix.yml` | Self-referential: uses `kjanat/install-dprint@v1` |

## CONVENTIONS

- **Tabs everywhere** -- all file types use tab indentation
- **Formatter: dprint only** -- no prettier, eslint, or biome
- **Shell**: `#!/usr/bin/env bash`, `set -euo pipefail`, `[[ ]]` conditionals,
  `"${VAR}"` quoting, parameter expansion defaults `${VAR:-default}`
- **YAML**: schema comment at top (`# yaml-language-server: $schema=...`),
  compact flow for simple mappings (`{ icon: terminal, color: blue }`), 120-char
  print width
- **Markdown**: text wraps always, asterisks for emphasis
- **Versioning**: semver tags (`v1.0.2`) + floating major tag (`v1`)
- **Default branch**: `master`

## ANTI-PATTERNS (THIS PROJECT)

- No `.gitignore` -- editor configs (`.zed/`, `.claude/`) are committed
- No tests -- no test framework, no test CI job
- No shellcheck -- shell linting not configured
- `shfmt` is an implicit CI dependency installed via `apt` in the workflow

## COMMANDS

```bash
# Format (requires dprint + shfmt installed)
dprint fmt

# Format check (CI mode)
dprint fmt --allow-no-files --diff --excludes ".github"

# Update dprint plugins
dprint config update
```

## NOTES

- `install.sh` gracefully degrades outside GitHub Actions: `GITHUB_OUTPUT` and
  `GITHUB_PATH` default to `/dev/null`
- If dprint is already on `$PATH`, installation is skipped (emits `::notice::`)
- CI excludes `.github/` directory from dprint formatting
- The action self-tests by using `kjanat/install-dprint@v1` in its own CI
