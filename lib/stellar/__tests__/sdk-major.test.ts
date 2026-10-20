import { describe, expect, it } from "vitest";
import { validateSdkMajor } from "../sdk-major";

describe("SDK Major & Deduplication Guard (Issue #142)", () => {
  it("passes when single copy of @stellar/stellar-sdk is installed and majors align", () => {
    const input = {
      packageLock: {
        packages: {
          "": {
            dependencies: {
              "@stellar/stellar-sdk": "^16.3.1",
            },
          },
          "node_modules/@stellar/stellar-sdk": {
            version: "16.3.1",
          },
        },
      },
      bindingsPackage: {
        dependencies: {
          "@stellar/stellar-sdk": "^16.0.0",
        },
      },
      kitPackage: {
        peerDependencies: {
          "@stellar/stellar-sdk": "^16.0.0",
        },
      },
    };

    const result = validateSdkMajor(input);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.appSdkMajor).toBe(16);
    expect(result.bindingsSdkMajor).toBe(16);
    expect(result.kitSdkMajor).toBe(16);
  });

  it("fails when multiple distinct versions of @stellar/stellar-sdk are installed", () => {
    const input = {
      packageLock: {
        packages: {
          "": {
            dependencies: {
              "@stellar/stellar-sdk": "^17.0.0",
            },
          },
          "node_modules/@stellar/stellar-sdk": {
            version: "17.1.0",
          },
          "node_modules/@creit.tech/stellar-wallets-kit/node_modules/@stellar/stellar-sdk": {
            version: "16.3.1",
          },
        },
      },
      bindingsPackage: {
        dependencies: {
          "@stellar/stellar-sdk": "^17.0.0",
        },
      },
    };

    const result = validateSdkMajor(input);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("Multiple distinct versions"))).toBe(true);
  });

  it("fails when app SDK major does not match bindings declared SDK major", () => {
    const input = {
      packageLock: {
        packages: {
          "": {
            dependencies: {
              "@stellar/stellar-sdk": "^17.0.0",
            },
          },
          "node_modules/@stellar/stellar-sdk": {
            version: "17.0.0",
          },
        },
      },
      bindingsPackage: {
        dependencies: {
          "@stellar/stellar-sdk": "^16.0.1",
        },
      },
    };

    const result = validateSdkMajor(input);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("does not match bindings declared major version"))).toBe(true);
  });

  it("fails when wallet kit expected SDK major does not match app major", () => {
    const input = {
      packageLock: {
        packages: {
          "": {
            dependencies: {
              "@stellar/stellar-sdk": "^17.0.0",
            },
          },
          "node_modules/@stellar/stellar-sdk": {
            version: "17.0.0",
          },
        },
      },
      bindingsPackage: {
        dependencies: {
          "@stellar/stellar-sdk": "^17.0.0",
        },
      },
      kitPackage: {
        peerDependencies: {
          "@stellar/stellar-sdk": "^16.3.0",
        },
      },
    };

    const result = validateSdkMajor(input);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("Wallet kit expected @stellar/stellar-sdk major"))).toBe(true);
  });
});
