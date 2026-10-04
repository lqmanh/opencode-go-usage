# opencode-go-usage

OpenCode v2 TUI plugin that shows [OpenCode Go](https://opencode.ai/go) quota in the session sidebar, plus a compact `OpenCode Go ⬢⬢⬢` indicator above the prompt when an OpenCode Go model is selected.

<!-- prettier-ignore -->
> [!TIP]
> Click the indicator to toggle its label between `OpenCode Go` and the active account.

## Installation

Add the plugin to `cli.json`:

```json
{
  "plugins": ["github:lqmanh/opencode-go-usage"]
}
```

### Options

| Option           | Default | Description               |
| ---------------- | ------- | ------------------------- |
| `refreshSeconds` | `300`   | Poll interval, minimum 30 |

```json
{
  "plugins": [
    {
      "package": "github:lqmanh/opencode-go-usage",
      "options": {
        "refreshSeconds": 120
      }
    }
  ]
}
```

## Limitations

- Expired Console credentials are reported, not refreshed by the plugin; the token refreshes the next time OpenCode uses it, so send a prompt with an OpenCode Go model. Alternatively, configure an API key.
- No manual refresh; usage updates on the poll interval and when credentials change.

## Development

```sh
bun install
bun run check
```

To load this checkout directly, point `cli.json` at the repository directory. The root `tui.tsx` re-exports `src/tui.tsx` because OpenCode resolves local plugin directories by filename, while installed packages use the `./tui` export.
