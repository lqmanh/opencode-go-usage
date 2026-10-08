import { isRecord, withTimeout } from "../http";
import type { UsageWindow } from "../usage";
import type { Credential, UsageProvider } from "./types";

const INTEGRATIONS = ["opencode-go", "opencode"] as const;
const LABELS = { rolling: "5h", weekly: "wk", monthly: "mo" } as const;
const TIMEOUT_MS = 15_000;

type WindowID = keyof typeof LABELS;

// API keys use the zen endpoint; Console tokens use the inference gateway.
function endpointFor(credential: Credential) {
  return credential.kind === "oauth"
    ? "https://opencode.ai/inference/go/v1/usage"
    : "https://opencode.ai/zen/go/v1/usage";
}

function decodeUsage(input: unknown): UsageWindow[] {
  if (!isRecord(input)) throw new Error("usage response was not an object");
  const usage = input.usage;
  if (!isRecord(usage)) throw new Error("usage response is missing the usage field");
  const read = (id: WindowID): UsageWindow => {
    const item = usage[id];
    if (!isRecord(item)) throw new Error(`usage response is missing ${id}`);
    if (typeof item.percent !== "number" || typeof item.resetsAt !== "string") {
      throw new Error(`usage response has an invalid ${id} window`);
    }
    return { id, label: LABELS[id], percent: item.percent, resetsAt: item.resetsAt };
  };
  return [read("rolling"), read("weekly"), read("monthly")];
}

async function fetchUsage(credential: Credential): Promise<UsageWindow[]> {
  if (
    credential.kind === "oauth" &&
    credential.expires &&
    credential.expires < Date.now()
  ) {
    throw new Error(
      "Console credential expired - send a prompt with an OpenCode Go model to refresh it",
    );
  }
  const headers: Record<string, string> = {
    Authorization: `Bearer ${credential.token}`,
    Accept: "application/json",
    "User-Agent": "opencode-usage",
  };
  // The inference gateway selects the org with `x-opencode-org-id`.
  const orgID = credential.metadata.orgID;
  if (credential.kind === "oauth" && typeof orgID === "string") {
    headers["x-opencode-org-id"] = orgID;
  }
  const response = await withTimeout(
    fetch(endpointFor(credential), {
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }),
    TIMEOUT_MS,
  );
  if (!response.ok) {
    const detail = await withTimeout(
      response.text().catch(() => ""),
      TIMEOUT_MS,
    );
    throw new Error(
      `Go usage request failed with HTTP ${response.status}${detail ? `: ${detail.slice(0, 120)}` : ""}`,
    );
  }
  return decodeUsage(await withTimeout(response.json(), TIMEOUT_MS));
}

// Go API keys live under integration `opencode-go`; Console accounts under
// `opencode`.
export const opencodeGo: UsageProvider = {
  id: "opencode-go",
  integrations: INTEGRATIONS,
  // `opencode` keys are service accounts, not Go API keys.
  accepts: (credential) =>
    !(credential.integrationID === "opencode" && credential.kind === "key"),
  fetch: fetchUsage,
};
