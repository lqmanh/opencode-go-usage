export interface UsageWindow {
  id: string;
  label: string;
  percent: number;
  resetsAt: string;
}

export function selectWindow(
  windows: readonly UsageWindow[],
  id: string | undefined,
): UsageWindow {
  return windows.find((window) => window.id === id) ?? windows[0];
}
