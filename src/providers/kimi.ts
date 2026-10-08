import { fetchUsageJSON, isRecord } from "../http";
import type { UsageWindow } from "../usage";
import type { Credential, UsageProvider } from "./types";

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function percentOf(quota: Record<string, unknown>): number | undefined {
  const limit = toNumber(quota.limit);
  if (limit === undefined || limit <= 0) return undefined;
  const remaining = toNumber(quota.remaining);
  const used =
    toNumber(quota.used) ?? (remaining !== undefined ? limit - remaining : undefined);
  if (used === undefined) return undefined;
  return (used / limit) * 100;
}

function resetOf(...quotas: Record<string, unknown>[]): string {
  for (const quota of quotas) {
    const value = quota.reset_at ?? quota.resetAt ?? quota.resetTime;
    if (typeof value === "string") return value;
  }
  return "";
}

// The 5h row can carry only a window descriptor for a fresh window; treat a
// missing percentage as zero rather than dropping the window.
function rollingWindow(limits: unknown): UsageWindow | undefined {
  if (!Array.isArray(limits)) return undefined;
  const item = limits.find(isRecord);
  if (!item) return undefined;
  const detail = isRecord(item.detail) ? item.detail : item;
  return {
    id: "rolling",
    label: "5h",
    percent: percentOf(detail) ?? 0,
    resetsAt: resetOf(detail, item),
  };
}

function decodeUsage(input: unknown): UsageWindow[] {
  if (!isRecord(input)) throw new Error("usage response was not an object");
  const windows: UsageWindow[] = [];
  const rolling = rollingWindow(input.limits);
  if (rolling) windows.push(rolling);
  if (isRecord(input.usage)) {
    const percent = percentOf(input.usage);
    if (percent !== undefined) {
      windows.push({
        id: "weekly",
        label: "wk",
        percent,
        resetsAt: resetOf(input.usage),
      });
    }
  }
  if (windows.length === 0) throw new Error("usage response carried no usage windows");
  return windows;
}

async function fetchUsage(
  endpoint: string,
  credential: Credential,
): Promise<UsageWindow[]> {
  return decodeUsage(await fetchUsageJSON(endpoint, credential.token, "Kimi"));
}

function defineKimi(id: string, endpoint: string): UsageProvider {
  return {
    id,
    integrations: [id],
    accepts: () => true,
    fetch: (credential) => fetchUsage(endpoint, credential),
  };
}

export const kimiCn = defineKimi(
  "kimi-code-plan-cn",
  "https://api.kimi.com/coding/v1/usages",
);
export const kimiGlobal = defineKimi(
  "kimi-code-plan-global",
  "https://api.kimi.ai/coding/v1/usages",
);
