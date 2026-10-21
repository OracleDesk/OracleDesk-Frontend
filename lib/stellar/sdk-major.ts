export interface PackageLockData {
  packages?: Record<
    string,
    {
      version?: string;
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    }
  >;
}

export interface PackageJsonData {
  version?: string;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  oracledeskSdkMajor?: number;
}

export interface CheckSdkMajorInput {
  packageLock: PackageLockData;
  bindingsPackage?: PackageJsonData | null;
  kitPackage?: PackageJsonData | null;
}

export interface CheckSdkMajorResult {
  ok: boolean;
  appSdkMajor?: number;
  bindingsSdkMajor?: number;
  kitSdkMajor?: number;
  installedSdkVersions: string[];
  errors: string[];
}

function parseMajor(rangeOrVersion: string | undefined | null): number | null {
  if (!rangeOrVersion) return null;
  const clean = rangeOrVersion.trim().replace(/^[v^~>=<\s]+/, "");
  const m = clean.match(/^(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Validates that exactly one copy of @stellar/stellar-sdk is installed, and that
 * the app's SDK major version aligns with the bindings' and wallet kit's expected major.
 */
export function validateSdkMajor(input: CheckSdkMajorInput): CheckSdkMajorResult {
  const errors: string[] = [];
  const packages = input.packageLock.packages || {};

  // 1. Scan for all installed copies of @stellar/stellar-sdk
  const installedSdkVersionsSet = new Set<string>();
  const dependentPaths: string[] = [];

  for (const [pkgPath, pkgInfo] of Object.entries(packages)) {
    // Hardware wallet internals (e.g. Trezor, Ledger) carry separate transitive versions per docs/architecture.md
    if (pkgPath.includes("@trezor") || pkgPath.includes("ledger-live") || pkgPath.includes("@ledgerhq")) {
      continue;
    }
    if (pkgPath.endsWith("node_modules/@stellar/stellar-sdk") && pkgInfo.version) {
      installedSdkVersionsSet.add(pkgInfo.version);
      dependentPaths.push(`${pkgPath} (${pkgInfo.version})`);
    }
  }

  const installedSdkVersions = Array.from(installedSdkVersionsSet);
  if (installedSdkVersions.length > 1) {
    errors.push(
      `Multiple distinct versions of @stellar/stellar-sdk installed: ${installedSdkVersions.join(", ")}. Dependents:\n  ` +
        dependentPaths.join("\n  "),
    );
  }

  // 2. Identify app SDK major
  const rootPkg = packages[""] || {};
  const appSdkRange =
    rootPkg.dependencies?.["@stellar/stellar-sdk"] ||
    installedSdkVersions[0] ||
    "^16.3.1";
  const appSdkMajor = parseMajor(appSdkRange) ?? 16;

  // 3. Compare with bindings declared SDK major
  let bindingsSdkMajor: number | undefined;
  if (input.bindingsPackage) {
    if (typeof input.bindingsPackage.oracledeskSdkMajor === "number") {
      bindingsSdkMajor = input.bindingsPackage.oracledeskSdkMajor;
    } else {
      const bRange =
        input.bindingsPackage.dependencies?.["@stellar/stellar-sdk"] ||
        input.bindingsPackage.peerDependencies?.["@stellar/stellar-sdk"];
      const parsed = parseMajor(bRange);
      if (parsed !== null) bindingsSdkMajor = parsed;
    }

    if (bindingsSdkMajor !== undefined && bindingsSdkMajor !== appSdkMajor) {
      errors.push(
        `App @stellar/stellar-sdk major version (${appSdkMajor}) does not match bindings declared major version (${bindingsSdkMajor}).`,
      );
    }
  }

  // 4. Compare with wallet kit expected major
  let kitSdkMajor: number | undefined;
  if (input.kitPackage) {
    const kRange =
      input.kitPackage.dependencies?.["@stellar/stellar-sdk"] ||
      input.kitPackage.peerDependencies?.["@stellar/stellar-sdk"];
    const parsed = parseMajor(kRange);
    if (parsed !== null) kitSdkMajor = parsed;

    if (kitSdkMajor !== undefined && kitSdkMajor !== appSdkMajor) {
      errors.push(
        `Wallet kit expected @stellar/stellar-sdk major (${kitSdkMajor}) does not match app SDK major (${appSdkMajor}).`,
      );
    }
  }

  return {
    ok: errors.length === 0,
    appSdkMajor,
    bindingsSdkMajor,
    kitSdkMajor,
    installedSdkVersions,
    errors,
  };
}
