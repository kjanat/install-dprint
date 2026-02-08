# Install dprint

A GitHub Action to install the [dprint] code formatter.

## Usage

```yaml
- uses: kjanat/install-dprint@v1
```

### Pin a specific version

```yaml
- uses: kjanat/install-dprint@v1
  with:
    version: "0.51.1"
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

| Name      | Description                               | Default  |
| --------- | ----------------------------------------- | -------- |
| `version` | dprint version to install (e.g. `0.51.1`) | `latest` |

## Outputs

| Name       | Description                         |
| ---------- | ----------------------------------- |
| `version`  | Installed dprint version            |
| `location` | Path to the installed dprint binary |

## License

[MIT]

<!-- links -->

[dprint]: https://dprint.dev "dprint.dev"
[`autofix.ci`]: https://github.com/autofix-ci/action#readme "autofix-ci/action GitHub"
[MIT]: https://github.com/kjanat/install-dprint/blob/master/LICENSE
