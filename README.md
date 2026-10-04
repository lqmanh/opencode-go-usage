# opencode-go-usage

OpenCode V2 TUI plugin that shows OpenCode Go quota in the session sidebar, plus a compact `Go ⬢⬢⬢` indicator above the prompt while an OpenCode Go model is selected.

## Installation

Add the package to `cli.json`:

```json
{
  "plugins": ["github:lqmanh/opencode-go-usage"]
}
```

### Options

| Option           | Default | Description               |
| ---------------- | ------- | ------------------------- |
| `refreshSeconds` | `300`   | Poll interval, minimum 30 |

## Limitations

- Expired Console credentials are reported, not refreshed by the plugin; the token refreshes the next time OpenCode uses it, so send a prompt with an OpenCode Go model. Alternatively, configure an API key.
- No manual refresh; usage updates on the poll interval and when credentials change.

## Development

```sh
bun install
bun run check
```

To load this checkout directly, point `cli.json` at the repository directory. The root `tui.tsx` re-exports `src/tui.tsx` because OpenCode resolves local plugin directories by filename, while installed packages use the `./tui` export.
