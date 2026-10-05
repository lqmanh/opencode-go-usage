/** @jsxImportSource @opentui/solid */
import { Plugin } from "@opencode/plugin/tui";
import type { ResolvedTheme } from "@opencode/theme/tui";
import { createEffect, createRoot, on, untrack } from "solid-js";
import { clampPercent, formatReset } from "./format";
import {
  accountLabel,
  fetchUsage,
  pickCredential,
  type GoUsage,
  type UsageWindow,
} from "./usage";

const COMPACT_GLYPH = "⬢";

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

function levelColor(theme: ResolvedTheme, percent: number | undefined) {
  if (percent === undefined) return theme.text.muted;
  if (percent >= 90) return theme.text.feedback.error.base;
  if (percent >= 70) return theme.text.feedback.warning.base;
  return theme.text.feedback.success.base;
}

function snapshot(state: WidgetState | null) {
  return state && (state.status === "ok" || state.status === "error") ? state : undefined;
}

function WindowRow(props: {
  label: string;
  window: UsageWindow | undefined;
  now: number | undefined;
  theme: ResolvedTheme;
}) {
  const percent = props.window && Math.round(clampPercent(props.window.percent));
  const color = levelColor(props.theme, percent);
  const track = props.window && props.theme.background.raised.high;
  return (
    <box flexDirection="row" gap={1}>
      <text fg={props.theme.text.base} width={2} flexShrink={0} wrapMode="none">
        {props.label}
      </text>
      <box
        width={percent === 100 ? 4 : 3}
        flexShrink={0}
        flexDirection="row"
        justifyContent="flex-end"
      >
        <text fg={color} wrapMode="none">
          {percent === undefined ? "—" : `${percent}%`}
        </text>
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
      <box width={7} flexShrink={0} flexDirection="row" justifyContent="flex-end">
        <text fg={props.theme.text.muted} wrapMode="none">
          {props.window && formatReset(props.window.resetsAt, props.now)}
        </text>
      </box>
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
        <text fg={props.theme.text.base} flexShrink={0} wrapMode="none">
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
      <WindowRow
        label={WINDOW_LABELS.rolling}
        window={current?.usage?.rolling}
        now={current?.now}
        theme={props.theme}
      />
      <WindowRow
        label={WINDOW_LABELS.weekly}
        window={current?.usage?.weekly}
        now={current?.now}
        theme={props.theme}
      />
      <WindowRow
        label={WINDOW_LABELS.monthly}
        window={current?.usage?.monthly}
        now={current?.now}
        theme={props.theme}
      />
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
  const color = (entry: UsageWindow | undefined) =>
    levelColor(props.theme, entry && Math.round(clampPercent(entry.percent)));
  const name = props.showAccount && current?.account ? current.account : "OpenCode Go";
  const selected = current?.usage?.[props.countdown];
  const reset = selected ? formatReset(selected.resetsAt, current?.now) : "—";
  return (
    <box flexDirection="row" gap={1} justifyContent="space-between">
      <box flexDirection="row" gap={1} {...clickHandlers(props.onToggle)}>
        <text
          fg={props.theme.text.muted}
          wrapMode="none"
          truncate
          flexShrink={1}
          minWidth={0}
        >
          {name}
        </text>
        <text wrapMode="none" flexShrink={0}>
          {WINDOW_KEYS.map((key) => (
            <span style={{ fg: color(current?.usage?.[key]) }}>{COMPACT_GLYPH}</span>
          ))}
          {props.state.status === "error" ? (
            <span style={{ fg: props.theme.text.feedback.error.base }}>!</span>
          ) : null}
        </text>
      </box>
      <text
        fg={props.theme.text.muted}
        wrapMode="none"
        flexShrink={0}
        {...clickHandlers(props.onCycle)}
      >
        {`${WINDOW_LABELS[props.countdown]} · ${reset}`}
      </text>
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
    let disposeWidget: (() => void) | undefined;
    let disposeCompact: (() => void) | undefined;
    let sidebarRendered = false;
    let suspended = false;

    function renderWidget() {
      disposeWidget?.();
      disposeWidget = undefined;
      sidebarRendered = false;
      if (last?.status === "unavailable") return;
      const state: WidgetState = last ?? { status: "loading" };
      const theme = context.theme;
      disposeWidget = context.ui.slot({
        append: "sidebar.content",
        render: () => {
          sidebarRendered = true;
          resumePolling();
          return <UsageWidget state={state} theme={theme} />;
        },
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
      disposeCompact = undefined;
      if (last?.status === "unavailable") return;
      const state: WidgetState = last ?? { status: "loading" };
      const theme = context.theme;
      disposeCompact = context.ui.slot({
        append: "session.composer.top",
        render: () =>
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
      });
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

    function renderWidgets() {
      renderWidget();
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
    let timer: ReturnType<typeof setInterval> | undefined;

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
          renderWidgets();
          return;
        }
        account = accountLabel(credential);
        const usage = await fetchUsage(credential);
        if (current !== generation) return;
        switched = false;
        last = { status: "ok", usage, account, now: Date.now() };
        renderWidgets();
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
        renderWidgets();
      }
    }

    renderWidgets();
    void refresh();
    timer = setInterval(() => {
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
            untrack(() => renderWidgets());
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
      if (timer) clearInterval(timer);
      disposeWidget?.();
      disposeCompact?.();
    };
  },
});
