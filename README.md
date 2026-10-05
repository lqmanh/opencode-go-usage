# opencode-go-usage

OpenCode v2 TUI plugin that shows [OpenCode Go](https://opencode.ai/go) quota in the sidebar, plus a compact indicator above the prompt when an OpenCode Go model is selected.

## Preview

Sidebar widget:

```text
OpenCode Go              account@example.com
5h 42% ████████████░░░░░░░░░░░░░░░░░   3h 6m
wk 18% █████░░░░░░░░░░░░░░░░░░░░░░░░  2d 11h
mo  7% ██░░░░░░░░░░░░░░░░░░░░░░░░░░░     20d
```

Compact indicator:

```text
OpenCode Go ⬢⬢⬢                   5h · 3h 6m
```

The three ⬢ glyphs stand for the `5h`, `wk`, and `mo` windows in order. Colors indicate usage level: green normally, amber from 70%, red from 90%. A trailing `!` marks a failed refresh.

<!-- prettier-ignore -->
> [!TIP]
> Click the name or ⬢ glyphs to toggle between `OpenCode Go` and the active account. Click the countdown to cycle the window it tracks: `5h → wk → mo`.

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
