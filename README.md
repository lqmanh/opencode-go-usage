# opencode-usage

OpenCode v2 TUI plugin that shows the selected provider's quota/usage in the sidebar, plus a compact indicator above the prompt.

## Supported providers

- [OpenCode Go](https://opencode.ai/go)

## Preview

Sidebar widget:

```text
OpenCode Go                          Default
5h 42% ████████████░░░░░░░░░░░░░░░░░   3h 6m
wk 18% █████░░░░░░░░░░░░░░░░░░░░░░░░  2d 11h
mo  7% ██░░░░░░░░░░░░░░░░░░░░░░░░░░░     20d
```

Compact indicator:

```text
OpenCode Go               ◈ ◇ ◇ 5h ·   3h 6m
```

The glyphs stand for the provider's quota windows in order. Each fills up as usage rises: `◇` below 70%, `◈` from 70%, `◆` from 90%. The window the countdown tracks is colored by the same levels — green, amber, red — while the others stay muted.

<!-- prettier-ignore -->
> [!TIP]
> Click the name to toggle between the provider name and the active account. Click the glyphs, label, or countdown to cycle the window it tracks.

## Installation

Add the plugin to `cli.json`:

```json
{
  "plugins": ["github:lqmanh/opencode-usage"]
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
      "package": "github:lqmanh/opencode-usage",
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
