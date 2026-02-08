# Install dprint

A GitHub Action to install the [dprint](https://dprint.dev) code formatter.

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
- run: dprint check
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

MIT
