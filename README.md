# Install dprint

A GitHub Action to install the [dprint] code formatter, with caching for the
binary and its WASM plugins.

## Usage

```yaml
- uses: kjanat/install-dprint@v1
```

### Pin a specific version

```yaml
- uses: kjanat/install-dprint@v1
  with:
    version: "0.55.2"
```

### Run dprint after install

```yaml
- uses: kjanat/install-dprint@v1
- run: dprint fmt
```

### Or combine it with [`autofix.ci`]

```yaml
name: autofix.ci
on:
  push: { branches: ["master"] }
  pull_request:
  workflow_call:
permissions: { contents: read }
jobs:
  autofix:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: kjanat/install-dprint@v1
        # Optionally install other dependencies here, if using the
        # `exec` plugin.

        # or update your plugins
      - run: dprint config update

        # autofix-ci will fail if the .github directory is touched
      - run: dprint fmt --allow-no-files --diff --excludes ".github"

      - uses: autofix-ci/action@v1
```

## Inputs

| Name          | Description                                                                               | Default  |
| ------------- | ----------------------------------------------------------------------------------------- | -------- |
| `version`     | dprint version to install (e.g. `0.55.2`)                                                 | `latest` |
| `cache`       | Cache the dprint binary and WASM plugins via `actions/cache`                              | `true`   |
| `config-path` | Path or glob to dprint config file(s) for the plugin cache key (auto-detected if not set) | `""`     |
| `warmup`      | Pre-download WASM plugins after a cache miss so the post step saves a complete store      | `true`   |

Config auto-detection deep-searches the workspace for `.dprint.jsonc`,
`.dprint.json`, `dprint.jsonc`, `dprint.json` (skipping `node_modules` and
`.git`) and hashes every match into the cache key, so a monorepo's per-directory
configs all count; the root config is the primary. A `config-path` glob
overrides detection.

## Outputs

| Name               | Description                                                        |
| ------------------ | ------------------------------------------------------------------ |
| `version`          | Installed dprint version                                           |
| `location`         | Path to the installed dprint binary                                |
| `cache-hit`        | Whether the binary was restored from tool-cache or `actions/cache` |
| `plugin-cache-hit` | Whether the WASM plugin cache was restored (exact key match)       |
| `plugin-cache-key` | The cache key used for the WASM plugin cache                       |

## Caching

- The action exports `DPRINT_CACHE_DIR`, pinning dprint's plugin store to one
  path on every OS, so the directory it caches is the directory dprint uses.
- The plugin cache key hashes every matched config file plus the dprint version;
  `restore-keys` fall back to the nearest older store.
- The cache is saved in a post step that runs even when the job fails, so a
  failing `dprint check` still warms the next run.
- On a cache miss the action pre-downloads the plugins itself (bounded, with
  hang-detecting retries), keeping later dprint steps offline.

## License

[MIT]

<!-- links -->

[dprint]: https://dprint.dev "dprint.dev"
[`autofix.ci`]: https://github.com/autofix-ci/action#readme "autofix-ci/action GitHub"
[MIT]: https://github.com/kjanat/install-dprint/blob/master/LICENSE
