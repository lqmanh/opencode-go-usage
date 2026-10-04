import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";

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

interface ResolveOptions {
  channel?: string;
}

class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

// AbortSignal.timeout does not reliably fire in the TUI runtime, so settlement
// must not depend on signal dispatch.
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(new UsageError(`usage request did not respond within ${ms}ms`)),
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
const STABLE_CHANNELS = new Set(["latest", "dev", "beta", "next", "prod"]);
export const INTEGRATIONS = ["opencode-go", "opencode"];

// Mirrors Global.Path.data: $XDG_DATA_HOME/opencode or ~/.local/share/opencode
// on every platform.
function dataDir() {
  const xdg = process.env.XDG_DATA_HOME?.trim();
  return xdg
    ? join(xdg, "opencode")
    : join(homedir(), ".local", "share", "opencode");
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseCredentialValue(
  value: unknown,
  label?: string,
): Credential | undefined {
  if (!isRecord(value)) return undefined;
  const record = value;
  const metadata = isRecord(record.metadata) ? record.metadata : {};
  if (
    record.type === "oauth" &&
    typeof record.access === "string" &&
    record.access.trim()
  ) {
    return {
      kind: "oauth",
      token: record.access.trim(),
      label,
      orgID: typeof metadata.orgID === "string" ? metadata.orgID : undefined,
      orgName:
        typeof metadata.orgName === "string" ? metadata.orgName : undefined,
      email: typeof metadata.email === "string" ? metadata.email : undefined,
      expires: typeof record.expires === "number" ? record.expires : undefined,
    };
  }
  if (
    record.type === "key" &&
    typeof record.key === "string" &&
    record.key.trim()
  ) {
    return { kind: "key", token: record.key.trim(), label };
  }
  return undefined;
}

async function openDatabase(file: string) {
  try {
    const { Database } = await import("bun:sqlite");
    return new Database(file, { readonly: true });
  } catch {
    return undefined;
  }
}

// Mirrors Database.path(): OPENCODE_DB overrides; stable channels use
// opencode.db, others opencode-<channel>.db.
function databaseFile(channel?: string) {
  const override = process.env.OPENCODE_DB?.trim();
  if (override && override !== ":memory:") {
    return isAbsolute(override) ? override : join(dataDir(), override);
  }
  const disabled = ["1", "true"].includes(
    process.env.OPENCODE_DISABLE_CHANNEL_DB ?? "",
  );
  if (!channel || STABLE_CHANNELS.has(channel) || disabled)
    return join(dataDir(), "opencode.db");
  return join(
    dataDir(),
    `opencode-${channel.replace(/[^a-zA-Z0-9._-]/g, "-")}.db`,
  );
}

// Go API keys live under integration `opencode-go`; Console accounts under
// `opencode`.
export async function resolveCredential(
  options: ResolveOptions = {},
): Promise<Credential | undefined> {
  const db = await openDatabase(databaseFile(options.channel));
  if (!db) return undefined;
  try {
    for (const integration of INTEGRATIONS) {
      const row = db
        .query(
          "select value, label from credential where integration_id = ? order by active desc, time_created desc, id desc limit 1",
        )
        .get(integration) as { value?: string; label?: string } | null;
      if (!row?.value) continue;
      const credential = parseCredentialValue(
        JSON.parse(row.value),
        typeof row.label === "string" ? row.label : undefined,
      );
      if (!credential) continue;
      // `opencode` keys are service accounts, not Go API keys.
      if (integration === "opencode" && credential.kind === "key") continue;
      return credential;
    }
  } catch {
    // Missing table, locked database, or malformed value.
  } finally {
    db.close();
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
  if (!isRecord(input))
    throw new UsageError("usage response was not an object");
  const usage = input.usage;
  if (!isRecord(usage))
    throw new UsageError("usage response is missing the usage field");
  const read = (name: string): UsageWindow => {
    const item = usage[name];
    if (!isRecord(item))
      throw new UsageError(`usage response is missing ${name}`);
    if (typeof item.percent !== "number" || typeof item.resetsAt !== "string") {
      throw new UsageError(`usage response has an invalid ${name} window`);
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
    throw new UsageError(
      "Console credential expired - use OpenCode once to refresh it",
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
    throw new UsageError(
      `Go usage request failed with HTTP ${response.status}${detail ? `: ${detail.slice(0, 120)}` : ""}`,
    );
  }
  return decodeUsage(await withTimeout(response.json(), TIMEOUT_MS));
}
