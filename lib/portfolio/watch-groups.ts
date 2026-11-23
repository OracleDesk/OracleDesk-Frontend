import { validateWatchAddress, type ViewedAddress } from "@/lib/stellar/identity";

/**
 * Watch groups (#315): named sets of validated addresses, stored per network
 * on this device only — never in the wallet session and never in the URL
 * beyond a local id. This module is storage + validation only; the batched
 * reader, query-key wiring and UI are separate, larger pieces of #315 not
 * included here.
 *
 * Storage is passed in explicitly (as `job-store.ts` does) so callers can use
 * `localStorage` directly while tests pass a fake, and every access is
 * wrapped: a private window or blocked storage reads as an empty list and
 * writes become no-ops rather than throwing.
 */

export const MAX_GROUP_MEMBERS = 25;
export const MAX_GROUPS = 20;
const KEY_PREFIX = "oracledesk:watch-groups:v1";

export interface WatchGroupMember {
  address: ViewedAddress;
  label: string;
}

export interface WatchGroup {
  id: string;
  name: string;
  members: WatchGroupMember[];
  createdAt: number;
  updatedAt: number;
}

export const watchGroupsKey = (networkPassphrase: string) => `${KEY_PREFIX}:${networkPassphrase}`;

function isMember(value: unknown): value is WatchGroupMember {
  if (typeof value !== "object" || value === null) return false;
  const member = value as Record<string, unknown>;
  return (
    typeof member.address === "string" &&
    validateWatchAddress(member.address).ok &&
    typeof member.label === "string"
  );
}

function isGroup(value: unknown): value is WatchGroup {
  if (typeof value !== "object" || value === null) return false;
  const group = value as Record<string, unknown>;
  return (
    typeof group.id === "string" &&
    group.id.length > 0 &&
    typeof group.name === "string" &&
    typeof group.createdAt === "number" &&
    typeof group.updatedAt === "number" &&
    Array.isArray(group.members) &&
    group.members.every(isMember)
  );
}

function readRaw(storage: Storage | null, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** Parses a stored group list, dropping malformed entries. Malformed JSON reads as empty. */
export function parseGroups(raw: string | null): WatchGroup[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isGroup) : [];
  } catch {
    return [];
  }
}

export function listGroups(storage: Storage | null, networkPassphrase: string): WatchGroup[] {
  return parseGroups(readRaw(storage, watchGroupsKey(networkPassphrase)));
}

function dedupeMembers(members: WatchGroupMember[]): WatchGroupMember[] {
  const seen = new Map<string, WatchGroupMember>();
  for (const member of members) seen.set(member.address, member);
  return [...seen.values()];
}

/**
 * Saves (creates or replaces) a group, enforcing the per-group member cap and
 * the per-network group count cap. Members are deduplicated by address.
 */
export function saveGroup(
  storage: Storage | null,
  networkPassphrase: string,
  group: WatchGroup
): { ok: true } | { ok: false; error: string } {
  const members = dedupeMembers(group.members);
  if (members.length === 0) {
    return { ok: false, error: "A watch group needs at least one address." };
  }
  if (members.length > MAX_GROUP_MEMBERS) {
    return { ok: false, error: `A watch group can have at most ${MAX_GROUP_MEMBERS} addresses.` };
  }

  const existing = listGroups(storage, networkPassphrase);
  const isUpdate = existing.some((g) => g.id === group.id);
  if (!isUpdate && existing.length >= MAX_GROUPS) {
    return { ok: false, error: `You can have at most ${MAX_GROUPS} watch groups on this network.` };
  }

  const next = [...existing.filter((g) => g.id !== group.id), { ...group, members }];
  try {
    storage?.setItem(watchGroupsKey(networkPassphrase), JSON.stringify(next));
  } catch {
    return { ok: false, error: "Could not save the watch group — storage may be full or blocked." };
  }
  return { ok: true };
}

export function deleteGroup(storage: Storage | null, networkPassphrase: string, id: string): void {
  const remaining = listGroups(storage, networkPassphrase).filter((g) => g.id !== id);
  try {
    storage?.setItem(watchGroupsKey(networkPassphrase), JSON.stringify(remaining));
  } catch {
    // Quota or blocked storage: nothing further to do client-side.
  }
}

export interface ParsedAddressLine {
  address: ViewedAddress;
  label: string;
}

export interface ParseAddressListResult {
  valid: ParsedAddressLine[];
  errors: { line: number; error: string }[];
}

/**
 * Parses a pasted address list, one entry per line, as `ADDRESS` or
 * `ADDRESS,label` / `ADDRESS label`. Invalid lines (bad checksum, lowercase,
 * muxed) are reported with their 1-based line number rather than silently
 * dropped, so the editor can show exactly what to fix.
 */
export function parseAddressList(text: string): ParseAddressListResult {
  const valid: ParsedAddressLine[] = [];
  const errors: { line: number; error: string }[] = [];

  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (raw.length === 0) continue;

    const [addressPart, ...rest] = raw.split(/[, \t]+/);
    const label = rest.join(" ").trim();
    const result = validateWatchAddress(addressPart);
    if (!result.ok) {
      errors.push({ line: i + 1, error: result.error });
      continue;
    }
    valid.push({ address: result.address, label: label.length > 0 ? label : result.address });
  }

  return { valid, errors: errors.slice(0, 50) };
}
