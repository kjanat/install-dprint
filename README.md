# Install dprint

A GitHub Action to install the [dprint] code formatter, with caching for the binary and its WASM plugins.

## Why

dprint compiles every WASM plugin once and keeps the result in its cache directory. Hosted runners start with an empty
cache, so without this action every job recompiles every plugin from scratch.

Actual results from all 167 recorded `autofix` job attempts in [kjanat/kp2bw] through 2026-08-20, grouped by the
`install-dprint` version recorded in each job (16 WASM plugins). [Commit `4fda405`] switched the workflow from v1 to
v2:

| Metric                     | `install-dprint@v1` | `install-dprint@v2` |
| -------------------------- | ------------------- | ------------------- |
| Jobs                       | 140                 | 27                  |
| Mean job duration          | 8 min 31 s          | 31.6 s              |
| Median job duration        | 30 s                | 28 s                |
| p95 job duration           | 51 s                | 42 s                |
| Maximum job duration       | 6 h 00 min 16 s     | 52 s                |
| Jobs over five minutes     | 5                   | 0                   |
| Jobs over one hour         | 3                   | 0                   |
| Total observed runner time | 19 h 51 min 34 s    | 14 min 12 s         |

The median barely moved because most cold compilations finished normally; the problem was the tail. Five v1 jobs stalled
during plugin compilation for more than five minutes, including three that reached GitHub's six-hour limit. Those five
jobs consumed 18 h 34 min 54 s, or 93.6% of all observed v1 runner time. None of the first 27 v2 jobs exceeded 52
seconds.

On a representative cache hit, `dprint fmt` itself dropped from 11.5 s with v1 to 976 ms with v2. The same cold compile
that a multi-core workstation hides in 11 seconds can stall a 2-vCPU hosted runner; restoring the compiled plugin store
removes it from the formatting step.

## Usage

```yaml
uses: kjanat/install-dprint@v2
```

### Pin a specific version

```yaml
uses: kjanat/install-dprint@v2
with: { version: 0.55.2 }
```

### Run dprint after install

```yaml
- uses: kjanat/install-dprint@v2
- run: dprint fmt
```

### Or combine it with [`autofix.ci`]

```yaml
name: autofix.ci
on: { push: { branches: [master] }, pull_request: null }
permissions: { contents: read }
jobs:
  autofix:
    # An autofix commit pushed to a stacked PR rewrites a layer the merge queue coordinates
    if: github.event.pull_request.stack == null
    runs-on: ubuntu-latest
    timeout-minutes: 2
    steps:
      - uses: actions/checkout@v7
      - uses: kjanat/install-dprint@v2
      # Optionally install other dependencies here, if using the `exec` plugin
      # (or use exec's new `setupCommand` setting, see link in tip below).

      - run: dprint config update -yr
        if: "${{ github.ref_name == 'master' }}"
        # or update your plugins:

      - run: dprint fmt --allow-no-files --diff --excludes .github
        # autofix-ci will fail if the .github directory is touched

      - uses: autofix-ci/action@v1
```

> [!TIP]
> Use dprint-plugin-exec's new `setupCommand` for e.g. installing a formatter binary to add it to PATH.\
> More info: https://github.com/dprint/dprint-plugin-exec#configuration

## Inputs

| Name          | Description                                                                               | Default  |
| ------------- | ----------------------------------------------------------------------------------------- | -------- |
| `version`     | dprint version to install (e.g. `0.55.2`)                                                 | `latest` |
| `cache`       | Cache the dprint binary and WASM plugins via `actions/cache`                              | `true`   |
| `config-path` | Path or glob to dprint config file(s) for the plugin cache key (auto-detected if not set) | `""`     |
| `warmup`      | Pre-download WASM plugins after a cache miss so the post step saves a complete store      | `true`   |

Config auto-detection deep-searches the workspace for `.dprint.jsonc`, `.dprint.json`, `dprint.jsonc`, `dprint.json`
(skipping `node_modules` and `.git`) and hashes every match into the cache key, so a monorepo's per-directory configs
all count; the root config is the primary. A `config-path` glob overrides detection.

## Outputs

| Name               | Description                                                        |
| ------------------ | ------------------------------------------------------------------ |
| `version`          | Installed dprint version                                           |
| `location`         | Path to the installed dprint binary                                |
| `cache-hit`        | Whether the binary was restored from tool-cache or `actions/cache` |
| `plugin-cache-hit` | Whether the WASM plugin cache was restored (exact key match)       |
| `plugin-cache-key` | The cache key used for the WASM plugin cache                       |

## Caching

- The action exports `DPRINT_CACHE_DIR`, pinning dprint's plugin store to one path on every OS, so the directory it
  caches is the directory dprint uses.
- The plugin cache key hashes every matched config file plus the dprint version; `restore-keys` fall back to the nearest
  older store.
- The cache is saved in a post step that runs even when the job fails, so a failing `dprint check` still warms the next
  run.
- On a cache miss the action pre-downloads the plugins itself (bounded, with hang-detecting retries), keeping later
  dprint steps offline.

## License

[MIT]

<!-- links -->

[dprint]: https://dprint.dev "dprint.dev"
[kjanat/kp2bw]: https://github.com/kjanat/kp2bw "KeePass to Bitwarden migration CLI"
[Commit `4fda405`]: https://github.com/kjanat/kp2bw/commit/4fda4054e94141ebce97432dd5a825ac67f15b7f
[`autofix.ci`]: https://github.com/autofix-ci/action#readme "autofix-ci/action GitHub"
[MIT]: https://github.com/kjanat/install-dprint/blob/master/LICENSE

<!-- markdownlint-disable-file MD013 MD034 -->
