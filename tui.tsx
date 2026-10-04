/** @jsxImportSource @opentui/solid */
import { Plugin } from "@opencode/plugin/tui";
import { createEffect, createRoot, untrack } from "solid-js";
import { clampPercent, formatReset } from "./format";
import {
  accountLabel,
  fetchUsage,
  INTEGRATIONS,
  isRecord,
  resolveCredential,
  type GoUsage,
  type UsageWindow,
} from "./usage";

const COMPACT_GLYPH = "⬢";

type WidgetState =
  | { status: "loading" }
  | { status: "ok"; usage: GoUsage; account?: string }
  | { status: "unavailable" }
  | { status: "error"; message: string; usage?: GoUsage; account?: string };

type Theme = {
  text: {
    base: unknown;
    muted: unknown;
    feedback?: {
      success?: { base?: unknown };
      warning?: { base?: unknown };
      error?: { base?: unknown };
    };
  };
  background: {
    raised: {
      high: unknown;
    };
  };
};

function levelColor(theme: Theme, percent: number | undefined) {
  if (percent === undefined) return theme.text.muted;
  if (percent >= 90) return theme.text.feedback?.error?.base ?? theme.text.base;
  if (percent >= 70)
    return theme.text.feedback?.warning?.base ?? theme.text.base;
  return theme.text.feedback?.success?.base ?? theme.text.base;
}

function snapshot(state: WidgetState | null) {
  return state && (state.status === "ok" || state.status === "error")
    ? state
    : undefined;
}

// V2 moves a switched credential to the front of the synced list, so the first
// credential id identifies the active account.
function activeCredentialKey(integrations: unknown) {
  if (!Array.isArray(integrations)) return undefined;
  for (const id of INTEGRATIONS) {
    const integration = integrations.find(
      (item) => isRecord(item) && item.id === id,
    );
    if (!isRecord(integration) || !Array.isArray(integration.connections)) {
      continue;
    }
    const connection = integration.connections.find(
      (item) => isRecord(item) && item.type === "credential",
    );
    if (isRecord(connection) && typeof connection.id === "string") {
      return `${id}:${connection.id}`;
    }
  }
  return undefined;
}

function WindowRow(props: {
  label: string;
  window: UsageWindow | undefined;
  theme: Theme;
}) {
  const percent =
    props.window && Math.round(clampPercent(props.window.percent));
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
      <box flexGrow={1} height={1} backgroundColor={track}>
        {percent !== undefined && (
          <box width={`${percent}%`} height={1} backgroundColor={color} />
        )}
      </box>
      <box
        width={7}
        flexShrink={0}
        flexDirection="row"
        justifyContent="flex-end"
      >
        <text fg={props.theme.text.muted} wrapMode="none">
          {props.window && formatReset(props.window.resetsAt)}
        </text>
      </box>
    </box>
  );
}

function UsageWidget(props: { state: WidgetState; theme: Theme }) {
  const current = snapshot(props.state);
  const statusLine =
    props.state.status === "loading"
      ? "Loading..."
      : props.state.status === "error"
        ? props.state.message
        : "";
  const statusColor =
    (props.state.status === "error" &&
      props.theme.text.feedback?.error?.base) ||
    props.theme.text.muted;
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
        label="5h"
        window={current?.usage?.rolling}
        theme={props.theme}
      />
      <WindowRow
        label="wk"
        window={current?.usage?.weekly}
        theme={props.theme}
      />
      <WindowRow
        label="mo"
        window={current?.usage?.monthly}
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

function CompactUsage(props: { state: WidgetState; theme: Theme }) {
  const current = snapshot(props.state);
  const color = (entry: UsageWindow | undefined) =>
    levelColor(props.theme, entry && Math.round(clampPercent(entry.percent)));
  return (
    <text wrapMode="none">
      <span style={{ fg: props.theme.text.muted }}>OpenCode Go </span>
      <span style={{ fg: color(current?.usage?.rolling) }}>
        {COMPACT_GLYPH}
      </span>
      <span style={{ fg: color(current?.usage?.weekly) }}>{COMPACT_GLYPH}</span>
      <span style={{ fg: color(current?.usage?.monthly) }}>
        {COMPACT_GLYPH}
      </span>
      {props.state.status === "error" ? (
        <span
          style={{
            fg:
              props.theme.text.feedback?.error?.base ?? props.theme.text.muted,
          }}
        >
          !
        </span>
      ) : null}
    </text>
  );
}

export default Plugin.define({
  id: "opencode-go-usage",
  setup(context) {
    const options = (context.options ?? {}) as Record<string, unknown>;
    const channel =
      typeof context.app.channel === "string" ? context.app.channel : undefined;
    const refreshSeconds =
      typeof options.refreshSeconds === "number" && options.refreshSeconds >= 30
        ? options.refreshSeconds
        : 300;

    // The host repaints only a plugin's initial frame (anomalyco/opencode#39986),
    // so widgets stay stateless and claims remount on every change.
    let last: WidgetState | null = null;
    let switched = false;
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
      const theme = context.theme as unknown as Theme;
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
      return context.ui.model?.current?.()?.providerID === "opencode-go";
    }

    function renderCompact() {
      disposeCompact?.();
      disposeCompact = undefined;
      if (last?.status === "unavailable") return;
      const state: WidgetState = last ?? { status: "loading" };
      const theme = context.theme as unknown as Theme;
      disposeCompact = context.ui.slot({
        append: "session.composer.top",
        render: () =>
          isGoSelected() ? <CompactUsage state={state} theme={theme} /> : null,
      });
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
        const credential = await resolveCredential({ channel });
        if (current !== generation) return;
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
        last = { status: "ok", usage, account };
        renderWidgets();
      } catch (error) {
        if (current !== generation) return;
        const previous = snapshot(last);
        last = {
          status: "error",
          message: error instanceof Error ? error.message : String(error),
          usage: switched ? undefined : previous?.usage,
          account: account ?? previous?.account,
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

    // Watch the synced integration list for credential switches, plus theme and
    // model selection; a remount is the only way to repaint.
    let watchReady = false;
    let watchedKey: string | undefined;
    let themeReady = false;
    let watchedTheme: unknown;
    let goReady = false;
    let watchedGo = false;
    const disposeWatch = createRoot((dispose) => {
      createEffect(() => {
        const key = activeCredentialKey(
          context.data.location.integration.list(),
        );
        if (!watchReady) {
          watchReady = true;
          watchedKey = key;
          return;
        }
        if (key === watchedKey) return;
        watchedKey = key;
        switched = true;
        void refresh();
      });
      createEffect(() => {
        const theme = context.theme;
        if (!themeReady) {
          themeReady = true;
          watchedTheme = theme;
          return;
        }
        if (theme === watchedTheme) return;
        watchedTheme = theme;
        untrack(() => renderWidgets());
      });
      createEffect(() => {
        const go = isGoSelected();
        if (!goReady) {
          goReady = true;
          watchedGo = go;
          return;
        }
        if (go === watchedGo) return;
        watchedGo = go;
        untrack(() => renderCompact());
        if (go) resumePolling();
      });
      return dispose;
    });

    return () => {
      disposeWatch();
      generation++;
      if (timer) clearInterval(timer);
      disposeWidget?.();
      disposeCompact?.();
    };
  },
});
