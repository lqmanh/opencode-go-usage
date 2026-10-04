# opencode-go-usage

OpenCode V2 TUI plugin that shows OpenCode Go quota in the session sidebar,
plus a compact `Go ⬢⬢⬢` indicator above the prompt while an OpenCode Go model is
selected.

## Install

Add the package to `cli.json`:

```json
{
  "plugins": ["github:lqmanh/opencode-go-usage"]
}
```

## Options

| Option           | Default | Description               |
| ---------------- | ------- | ------------------------- |
| `refreshSeconds` | `300`   | Poll interval, minimum 30 |

## Limitations

- Reads local OpenCode state, so it only works with a local server.
- Hides itself when no credential is found; connect OpenCode Go with `/connect`.
- Expired Console credentials are reported, not refreshed; use OpenCode once to
  refresh them, or configure an API key.
- With the sidebar hidden, usage is only visible as the compact indicator, and
  only for OpenCode Go models.
