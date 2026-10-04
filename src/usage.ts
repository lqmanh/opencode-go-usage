import type { CredentialEntry, CredentialValue } from "@opencode/client";

export interface UsageWindow {
  percent: number;
  resetsAt: string;
}

export interface GoUsage {
  rolling: UsageWindow;
  weekly: UsageWindow;
  monthly: UsageWindow;
}

type Credential = {
  kind: "key" | "oauth";
  token: string;
  label?: string;
  orgID?: string;
  orgName?: string;
  email?: string;
  expires?: number;
};

const INTEGRATIONS = ["opencode-go", "opencode"] as const;

// AbortSignal.timeout does not reliably fire in the TUI runtime, so settlement
// must not depend on signal dispatch.
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`usage request did not respond within ${ms}ms`)),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

const TIMEOUT_MS = 15_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toCredential(value: CredentialValue, label?: string): Credential | undefined {
  if (value.type === "oauth") {
    const metadata: Record<string, unknown> = value.metadata ?? {};
    return {
      kind: "oauth",
      token: value.access,
      label,
      orgID: typeof metadata.orgID === "string" ? metadata.orgID : undefined,
      orgName: typeof metadata.orgName === "string" ? metadata.orgName : undefined,
      email: typeof metadata.email === "string" ? metadata.email : undefined,
      expires: value.expires,
    };
  }
  if (value.type === "key") {
    return { kind: "key", token: value.key, label };
  }
  return undefined;
}

// Go API keys live under integration `opencode-go`; Console accounts under
// `opencode`.
export function pickCredential(
  entries: readonly CredentialEntry[],
): Credential | undefined {
  for (const integration of INTEGRATIONS) {
    const entry =
      entries.find((item) => item.integrationID === integration && item.active) ??
      entries.find((item) => item.integrationID === integration);
    if (!entry) continue;
    const credential = toCredential(entry.value, entry.label);
    if (!credential) continue;
    // `opencode` keys are service accounts, not Go API keys.
    if (integration === "opencode" && credential.kind === "key") continue;
    return credential;
  }
  return undefined;
}

export function accountLabel(credential: Credential) {
  if (credential.kind === "oauth") {
    return credential.email ?? credential.orgName ?? credential.label;
  }
  return credential.label;
}

// API keys use the zen endpoint; Console tokens use the inference gateway.
function endpointFor(credential: Credential) {
  return credential.kind === "oauth"
    ? "https://opencode.ai/inference/go/v1/usage"
    : "https://opencode.ai/zen/go/v1/usage";
}

function decodeUsage(input: unknown): GoUsage {
  if (!isRecord(input)) throw new Error("usage response was not an object");
  const usage = input.usage;
  if (!isRecord(usage)) throw new Error("usage response is missing the usage field");
  const read = (name: string): UsageWindow => {
    const item = usage[name];
    if (!isRecord(item)) throw new Error(`usage response is missing ${name}`);
    if (typeof item.percent !== "number" || typeof item.resetsAt !== "string") {
      throw new Error(`usage response has an invalid ${name} window`);
    }
    return { percent: item.percent, resetsAt: item.resetsAt };
  };
  return {
    rolling: read("rolling"),
    weekly: read("weekly"),
    monthly: read("monthly"),
  };
}

export async function fetchUsage(credential: Credential): Promise<GoUsage> {
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
    "User-Agent": "opencode-go-usage-plugin/0.1",
  };
  // The inference gateway selects the org with `x-opencode-org-id`.
  if (credential.kind === "oauth" && credential.orgID) {
    headers["x-opencode-org-id"] = credential.orgID;
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
