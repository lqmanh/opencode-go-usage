/** @jsxImportSource @opentui/solid */
import { Plugin } from "@opencode/plugin/tui";
import type { ResolvedTheme } from "@opencode/theme/tui";
import type { JSX } from "@opentui/solid";
import { createEffect, createRoot, on, untrack } from "solid-js";
import { clampPercent, displayPercent, formatReset } from "./format";
import { findProvider, resolveCredential } from "./providers";
import { selectWindow, type UsageWindow } from "./usage";

const LEVEL_COLORS = ["success", "warning", "error"] as const;
const LEVEL_GLYPHS = ["◇", "◈", "◆"];

type Snapshot = {
  name: string;
  account: string;
  windows: UsageWindow[];
  now: number;
};

type WidgetState =
  | ({ status: "ok" } & Snapshot)
  | { status: "unavailable" }
  | ({ status: "error"; message: string } & Partial<Snapshot>);

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
  labelWidth: number;
  window: UsageWindow | undefined;
  now: number | undefined;
  theme: ResolvedTheme;
}) {
  const percent = displayPercent(props.window);
  const color = levelColor(props.theme, percent);
  const track = props.window && props.theme.background.raised.high;
  return (
    <box flexDirection="row" gap={1}>
      <text fg={props.theme.text.base} width={props.labelWidth} flexShrink={0}>
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
  const statusLine = props.state.status === "error" ? props.state.message : "";
  const statusColor =
    props.state.status === "error"
      ? props.theme.text.feedback.error.base
      : props.theme.text.muted;
  const windows = current?.windows ?? [];
  const labelWidth = windows.reduce(
    (width, window) => Math.max(width, window.label.length),
    0,
  );
  return (
    <box flexDirection="column">
      {current?.name ? (
        <box flexDirection="row" gap={1}>
          <text fg={props.theme.text.base} flexShrink={0}>
            <b>{current.name}</b>
          </text>
          {current.account ? (
            <text
              fg={props.theme.text.muted}
              flexGrow={1}
              minWidth={0}
              truncate
              wrapMode="none"
              textAlign="right"
            >
              {current.account}
            </text>
          ) : null}
        </box>
      ) : null}
      {windows.map((window) => (
        <WindowRow
          label={window.label}
          labelWidth={labelWidth}
          window={window}
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
  countdown: string | undefined;
  onToggle: () => void;
  onCycle: () => void;
}) {
  const current = snapshot(props.state);
  const windows = current?.windows ?? [];
  if (windows.length === 0) return null;
  const name = props.showAccount && current?.account ? current.account : current?.name;
  const selected = selectWindow(windows, props.countdown);
  const reset = formatReset(selected.resetsAt, current?.now);
  const error = props.state.status === "error";
  const labelWidth = windows.reduce(
    (width, window) => Math.max(width, window.label.length),
    0,
  );
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
          {windows.map((window, index) => {
            const percent = displayPercent(window);
            const glyph = LEVEL_GLYPHS[level(percent)];
            const fg =
              window.id === selected.id
                ? levelColor(props.theme, percent)
                : props.theme.text.muted;
            return <span style={{ fg }}>{index > 0 ? ` ${glyph}` : glyph}</span>;
          })}
        </text>
        <text fg={props.theme.text.muted} width={labelWidth} flexShrink={0}>
          {selected.label}
        </text>
        <text fg={props.theme.text.muted}>·</text>
        <ResetTime reset={reset} theme={props.theme} error={error} />
      </box>
    </box>
  );
}

export default Plugin.define({
  id: "opencode-usage",
  setup(context) {
    const options = (context.options ?? {}) as Record<string, unknown>;
    const refreshSeconds =
      typeof options.refreshSeconds === "number" && options.refreshSeconds >= 30
        ? options.refreshSeconds
        : 300;

    // Workaround for anomalyco/opencode#39986: the host only repaints a
    // plugin's initial frame, so widgets stay stateless and claims remount on
    // every change. A remount alone no longer schedules a frame, so each one
    // also requests a render. Drop the stateless remounting and the
    // requestRender calls once the host shares its Solid runtime with plugins.
    let last: WidgetState | null = null;
    let showAccount = false;
    let countdown: string | undefined;
    let disposeSidebar: (() => void) | undefined;
    let disposeCompact: (() => void) | undefined;
    let sidebarRendered = false;

    // ui.model.current() reflects the picker's draft selection; the session's
    // stored model only updates on submit.
    function selectedProvider() {
      const providerID = context.ui.model.current()?.providerID;
      if (!providerID) return undefined;
      const info = context.data.location.provider
        .list()
        ?.find((item) => item.id === providerID);
      const adapter = findProvider(providerID, info?.canonical);
      return adapter ? { adapter, info } : undefined;
    }

    function claimSlot(
      append: "sidebar.content" | "session.composer.top",
      render: (state: WidgetState, theme: ResolvedTheme) => JSX.Element,
    ) {
      if (!last || last.status === "unavailable") return undefined;
      const state = last;
      const theme = context.theme;
      return context.ui.slot({ append, render: () => render(state, theme) });
    }

    function renderSidebar() {
      disposeSidebar?.();
      sidebarRendered = false;
      disposeSidebar = claimSlot("sidebar.content", (state, theme) => {
        sidebarRendered = true;
        return <UsageWidget state={state} theme={theme} />;
      });
      context.renderer.requestRender();
    }

    function renderCompact() {
      disposeCompact?.();
      disposeCompact = claimSlot("session.composer.top", (state, theme) =>
        selectedProvider() ? (
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
      context.renderer.requestRender();
    }

    function toggleAccount() {
      if (!snapshot(last)?.account) return;
      showAccount = !showAccount;
      queueMicrotask(() => renderCompact());
    }

    function cycleCountdown() {
      const windows = snapshot(last)?.windows;
      if (!windows || windows.length === 0) return;
      const selected = selectWindow(windows, countdown);
      countdown = windows[(windows.indexOf(selected) + 1) % windows.length].id;
      queueMicrotask(() => renderCompact());
    }

    function renderAll() {
      renderSidebar();
      renderCompact();
    }

    let generation = 0;

    async function refresh(selected = selectedProvider()) {
      const current = ++generation;
      let name: string | undefined;
      let account: string | undefined;
      try {
        const credential = selected?.info
          ? resolveCredential(selected.adapter, await context.client.credential.list())
          : undefined;
        if (current !== generation) return;
        if (!selected?.info || !credential) {
          last = { status: "unavailable" };
        } else {
          name = selected.info.name;
          account = credential.label;
          const windows = await selected.adapter.fetch(credential);
          if (current !== generation) return;
          last = { status: "ok", name, account, windows, now: Date.now() };
        }
      } catch (error) {
        if (current !== generation) return;
        const previous = snapshot(last);
        last = {
          status: "error",
          message: error instanceof Error ? error.message : String(error),
          windows: previous?.windows,
          account: account ?? previous?.account,
          name: name ?? previous?.name,
          now: Date.now(),
        };
      }
      renderAll();
    }

    renderAll();
    void refresh();
    // sidebarRendered is only set while the sidebar slot renders, so polling
    // pauses when neither widget can show.
    const timer = setInterval(() => {
      const selected = selectedProvider();
      if (!sidebarRendered && !selected) return;
      void refresh(selected);
    }, refreshSeconds * 1000);

    const stopCredentialUpdated = context.data.on("credential.updated", () => {
      void refresh();
    });
    const stopCredentialSwitched = context.data.on("credential.switched", () => {
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
          () => context.ui.model.current()?.providerID,
          (providerID, previous) => {
            if (providerID === previous) return;
            untrack(() => {
              void refresh();
            });
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
