import { describe, expect, it } from "vitest";
import {
  MAX_GROUPS,
  MAX_GROUP_MEMBERS,
  deleteGroup,
  listGroups,
  parseAddressList,
  saveGroup,
  watchGroupsKey,
  type WatchGroup,
} from "../watch-groups";
import type { ViewedAddress } from "@/lib/stellar/identity";

/** Minimal in-memory Storage. */
function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, value),
  };
}

const NETWORK = "stellar:testnet";
const ADDR_A = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF" as ViewedAddress;
const ADDR_B = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN" as ViewedAddress;

function group(id: string, members: ViewedAddress[]): WatchGroup {
  return {
    id,
    name: id,
    members: members.map((address, i) => ({ address, label: `m${i}` })),
    createdAt: 1,
    updatedAt: 1,
  };
}

describe("watch groups storage", () => {
  it("saves and lists groups per network, keyed by network passphrase", () => {
    const storage = memoryStorage();
    expect(saveGroup(storage, NETWORK, group("g1", [ADDR_A, ADDR_B]))).toEqual({ ok: true });
    expect(listGroups(storage, NETWORK).map((g) => g.id)).toEqual(["g1"]);
    expect(listGroups(storage, "stellar:pubnet")).toEqual([]);
    expect(watchGroupsKey(NETWORK)).toBe("oracledesk:watch-groups:v1:stellar:testnet");
  });

  it("dedupes members by address", () => {
    const storage = memoryStorage();
    saveGroup(storage, NETWORK, group("g1", [ADDR_A, ADDR_A, ADDR_B]));
    expect(listGroups(storage, NETWORK)[0].members).toHaveLength(2);
  });

  it("rejects an empty group", () => {
    const storage = memoryStorage();
    const result = saveGroup(storage, NETWORK, group("g1", []));
    expect(result).toEqual({ ok: false, error: expect.stringContaining("at least one address") });
  });

  it("caps members per group", () => {
    const storage = memoryStorage();
    const members = Array.from({ length: MAX_GROUP_MEMBERS + 1 }, (_, i) => `ADDR_${i}` as ViewedAddress);
    const result = saveGroup(storage, NETWORK, group("g1", members));
    expect(result.ok).toBe(false);
  });

  it("caps the number of groups per network, but allows updating an existing one", () => {
    const storage = memoryStorage();
    for (let i = 0; i < MAX_GROUPS; i++) saveGroup(storage, NETWORK, group(`g${i}`, [ADDR_A]));
    expect(listGroups(storage, NETWORK)).toHaveLength(MAX_GROUPS);

    expect(saveGroup(storage, NETWORK, group("g-overflow", [ADDR_A])).ok).toBe(false);
    // Updating one of the existing groups must not be blocked by the cap.
    expect(saveGroup(storage, NETWORK, group("g0", [ADDR_A, ADDR_B])).ok).toBe(true);
  });

  it("deletes a group by id without touching others", () => {
    const storage = memoryStorage();
    saveGroup(storage, NETWORK, group("g1", [ADDR_A]));
    saveGroup(storage, NETWORK, group("g2", [ADDR_B]));
    deleteGroup(storage, NETWORK, "g1");
    expect(listGroups(storage, NETWORK).map((g) => g.id)).toEqual(["g2"]);
  });

  it("drops malformed stored entries instead of throwing", () => {
    const storage = memoryStorage();
    storage.setItem(watchGroupsKey(NETWORK), JSON.stringify([{ id: "bad" }, group("ok", [ADDR_A])]));
    expect(listGroups(storage, NETWORK).map((g) => g.id)).toEqual(["ok"]);
  });

  it("reads as empty when storage is unavailable (private window)", () => {
    expect(listGroups(null, NETWORK)).toEqual([]);
    expect(saveGroup(null, NETWORK, group("g1", [ADDR_A])).ok).toBe(false);
  });
});

describe("parseAddressList", () => {
  it("parses valid lines with and without a label", () => {
    const result = parseAddressList(`${ADDR_A}\n${ADDR_B}, treasury\n`);
    expect(result.errors).toEqual([]);
    expect(result.valid).toEqual([
      { address: ADDR_A, label: ADDR_A },
      { address: ADDR_B, label: "treasury" },
    ]);
  });

  it("skips blank lines and reports invalid ones with their line number", () => {
    const result = parseAddressList(`${ADDR_A}\n\nnot-an-address\n`);
    expect(result.valid).toEqual([{ address: ADDR_A, label: ADDR_A }]);
    expect(result.errors).toEqual([{ line: 3, error: expect.any(String) }]);
  });

  it("rejects a muxed address with a specific error", () => {
    const result = parseAddressList("MAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
    expect(result.errors[0].error).toMatch(/Muxed/i);
  });
});
