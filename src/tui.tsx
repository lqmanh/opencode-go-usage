/** @jsxImportSource @opentui/solid */
import { Plugin } from "@opencode/plugin/tui";
import type { ResolvedTheme } from "@opencode/theme/tui";
import type { JSX } from "@opentui/solid";
import { createEffect, createRoot, on, untrack } from "solid-js";
import { clampPercent, displayPercent, formatReset } from "./format";
import {
  accountLabel,
  fetchUsage,
  pickCredential,
  type GoUsage,
  type UsageWindow,
} from "./usage";

const LEVEL_COLORS = ["success", "warning", "error"] as const;
const LEVEL_GLYPHS = ["◇", "◈", "◆"];

type WindowKey = keyof GoUsage;

const WINDOW_LABELS: Record<WindowKey, string> = {
  rolling: "5h",
  weekly: "wk",
  monthly: "mo",
};

const WINDOW_KEYS = Object.keys(WINDOW_LABELS) as WindowKey[];

type WidgetState =
  | { status: "loading" }
  | { status: "ok"; usage: GoUsage; account?: string; now: number }
  | { status: "unavailable" }
  | { status: "error"; message: string; usage?: GoUsage; account?: string; now: number };

function level(percent: number | undefined): 0 | 1 | 2 {
  if (percent === undefined) return 0;
  if (percent >= 90) return 2;
  if (percent >= 70) return 1;
  return 0;
}

function levelColor(theme: ResolvedTheme, percent: number | undefined) {
  if (percent === undefined) return theme.text.muted;
  return theme.text.feedback[LEVEL_COLORS[level(percent)]].base;
}

function snapshot(state: WidgetState | null) {
  return state && (state.status === "ok" || state.status === "error") ? state : undefined;
}

function ResetTime(props: {
  reset: string | undefined;
  theme: ResolvedTheme;
  error?: boolean;
}) {
  return (
    <box width={7} flexShrink={0} flexDirection="row" justifyContent="flex-end">
      <text
        fg={props.error ? props.theme.text.feedback.error.base : props.theme.text.muted}
      >
        {props.reset}
      </text>
    </box>
  );
}

function WindowRow(props: {
  label: string;
  window: UsageWindow | undefined;
  now: number | undefined;
  theme: ResolvedTheme;
}) {
  const percent = displayPercent(props.window);
  const color = levelColor(props.theme, percent);
  const track = props.window && props.theme.background.raised.high;
  return (
    <box flexDirection="row" gap={1}>
      <text fg={props.theme.text.base} width={2} flexShrink={0}>
        {props.label}
      </text>
      <box
        width={percent === 100 ? 4 : 3}
        flexShrink={0}
        flexDirection="row"
        justifyContent="flex-end"
      >
        <text fg={color}>{percent === undefined ? "—" : `${percent}%`}</text>
      </box>
      <box
        flexGrow={1}
        height={1}
        backgroundColor={track}
        renderAfter={function (buffer) {
          if (!props.window) return;
          const cells = Math.round(
            (clampPercent(props.window.percent) / 100) * this.width,
          );
          if (cells < 1) return;
          buffer.fillRect(this.screenX, this.screenY, cells, 1, color);
        }}
      />
      <ResetTime
        reset={props.window && formatReset(props.window.resetsAt, props.now)}
        theme={props.theme}
      />
    </box>
  );
}

function UsageWidget(props: { state: WidgetState; theme: ResolvedTheme }) {
  const current = snapshot(props.state);
  const statusLine =
    props.state.status === "loading"
      ? "Loading..."
      : props.state.status === "error"
        ? props.state.message
        : "";
  const statusColor =
    props.state.status === "error"
      ? props.theme.text.feedback.error.base
      : props.theme.text.muted;
  const account = current?.account;
  return (
    <box flexDirection="column">
      <box flexDirection="row" gap={1}>
        <text fg={props.theme.text.base} flexShrink={0}>
          <b>OpenCode Go</b>
        </text>
        {account ? (
          <text
            fg={props.theme.text.muted}
            flexGrow={1}
            minWidth={0}
            truncate
            wrapMode="none"
            textAlign="right"
          >
            {account}
          </text>
        ) : null}
      </box>
      {WINDOW_KEYS.map((key) => (
        <WindowRow
          label={WINDOW_LABELS[key]}
          window={current?.usage?.[key]}
          now={current?.now}
          theme={props.theme}
        />
      ))}
      {statusLine ? (
        <text fg={statusColor} wrapMode="word">
          {statusLine}
        </text>
      ) : null}
    </box>
  );
}

function clickHandlers(onClick: () => void) {
  let dragged = false;
  return {
    onMouseDown: () => {
      dragged = false;
    },
    onMouseDrag: () => {
      dragged = true;
    },
    onMouseUp: (event: { button: number }) => {
      if (event.button === 0 && !dragged) onClick();
    },
  };
}

function CompactUsage(props: {
  state: WidgetState;
  theme: ResolvedTheme;
  showAccount: boolean;
  countdown: WindowKey;
  onToggle: () => void;
  onCycle: () => void;
}) {
  const current = snapshot(props.state);
  const name = props.showAccount && current?.account ? current.account : "OpenCode Go";
  const selected = current?.usage?.[props.countdown];
  const reset = selected ? formatReset(selected.resetsAt, current?.now) : "—";
  const error = props.state.status === "error";
  return (
    <box flexDirection="row" gap={1} justifyContent="space-between">
      <text
        fg={props.theme.text.muted}
        wrapMode="none"
        truncate
        flexShrink={1}
        minWidth={0}
        {...clickHandlers(props.onToggle)}
      >
        {name}
      </text>
      <box flexDirection="row" gap={1} flexShrink={0} {...clickHandlers(props.onCycle)}>
        <text>
          {WINDOW_KEYS.map((key, index) => {
            const entry = current?.usage?.[key];
            const percent = displayPercent(entry);
            const glyph = LEVEL_GLYPHS[level(percent)];
            const fg =
              key === props.countdown
                ? levelColor(props.theme, percent)
                : props.theme.text.muted;
            return <span style={{ fg }}>{index > 0 ? ` ${glyph}` : glyph}</span>;
          })}
        </text>
        <ResetTime reset={reset} theme={props.theme} error={error} />
      </box>
    </box>
  );
}

export default Plugin.define({
  id: "opencode-go-usage",
  setup(context) {
    const options = (context.options ?? {}) as Record<string, unknown>;
    const refreshSeconds =
      typeof options.refreshSeconds === "number" && options.refreshSeconds >= 30
        ? options.refreshSeconds
        : 300;

    // The host repaints only a plugin's initial frame (anomalyco/opencode#39986),
    // so widgets stay stateless and claims remount on every change.
    let last: WidgetState | null = null;
    let switched = false;
    let showAccount = false;
    let countdown: WindowKey = "rolling";
    let disposeSidebar: (() => void) | undefined;
    let disposeCompact: (() => void) | undefined;
    let sidebarRendered = false;
    let suspended = false;

    function claimSlot(
      append: "sidebar.content" | "session.composer.top",
      render: (state: WidgetState, theme: ResolvedTheme) => JSX.Element,
    ) {
      if (last?.status === "unavailable") return undefined;
      const state: WidgetState = last ?? { status: "loading" };
      const theme = context.theme;
      return context.ui.slot({ append, render: () => render(state, theme) });
    }

    function renderSidebar() {
      disposeSidebar?.();
      sidebarRendered = false;
      disposeSidebar = claimSlot("sidebar.content", (state, theme) => {
        sidebarRendered = true;
        resumePolling();
        return <UsageWidget state={state} theme={theme} />;
      });
    }

    // ui.model.current() reflects the picker's draft selection; the session's
    // stored model only updates on submit. Sidebar visibility is not exposed,
    // so the compact indicator follows the model provider alone.
    function isGoSelected() {
      return context.ui.model.current()?.providerID === "opencode-go";
    }

    function renderCompact() {
      disposeCompact?.();
      disposeCompact = claimSlot("session.composer.top", (state, theme) =>
        isGoSelected() ? (
          <CompactUsage
            state={state}
            theme={theme}
            showAccount={showAccount}
            countdown={countdown}
            onToggle={toggleAccount}
            onCycle={cycleCountdown}
          />
        ) : null,
      );
    }

    function toggleAccount() {
      if (!snapshot(last)?.account) return;
      showAccount = !showAccount;
      queueMicrotask(() => renderCompact());
    }

    function cycleCountdown() {
      countdown = WINDOW_KEYS[(WINDOW_KEYS.indexOf(countdown) + 1) % WINDOW_KEYS.length];
      queueMicrotask(() => renderCompact());
    }

    function renderAll() {
      renderSidebar();
      renderCompact();
    }

    // sidebarRendered is only set while the sidebar slot renders, so polling
    // pauses when neither widget can show.
    function shouldPoll() {
      return sidebarRendered || isGoSelected();
    }

    function resumePolling() {
      if (!suspended) return;
      suspended = false;
      void refresh();
    }

    let generation = 0;

    async function refresh() {
      const current = ++generation;
      let account: string | undefined;
      try {
        const entries = await context.client.credential.list();
        if (current !== generation) return;
        const credential = pickCredential(entries);
        if (!credential) {
          switched = false;
          last = { status: "unavailable" };
        } else {
          account = accountLabel(credential);
          const usage = await fetchUsage(credential);
          if (current !== generation) return;
          switched = false;
          last = { status: "ok", usage, account, now: Date.now() };
        }
      } catch (error) {
        if (current !== generation) return;
        const previous = snapshot(last);
        last = {
          status: "error",
          message: error instanceof Error ? error.message : String(error),
          usage: switched ? undefined : previous?.usage,
          account: account ?? previous?.account,
          now: Date.now(),
        };
        switched = false;
      }
      renderAll();
    }

    renderAll();
    void refresh();
    const timer = setInterval(() => {
      if (!shouldPoll()) {
        suspended = true;
        return;
      }
      void refresh();
    }, refreshSeconds * 1000);

    const stopCredentialUpdated = context.data.on("credential.updated", () => {
      void refresh();
    });
    const stopCredentialSwitched = context.data.on("credential.switched", () => {
      switched = true;
      void refresh();
    });

    // Watch theme and model selection; a remount is the only way to repaint.
    const disposeWatch = createRoot((dispose) => {
      createEffect(
        on(
          () => context.theme,
          (theme, previous) => {
            if (theme === previous) return;
            untrack(() => renderAll());
          },
          { defer: true },
        ),
      );
      createEffect(
        on(
          () => isGoSelected(),
          (go, previous) => {
            if (go === previous) return;
            untrack(() => renderCompact());
            if (go) resumePolling();
          },
          { defer: true },
        ),
      );
      return dispose;
    });

    return () => {
      stopCredentialUpdated();
      stopCredentialSwitched();
      disposeWatch();
      generation++;
      clearInterval(timer);
      disposeSidebar?.();
      disposeCompact?.();
    };
  },
});
