# Canonical Contract Spec Fingerprint (`odspec-v1`)

OracleDesk defines a canonical spec fingerprint algorithm (`odspec-v1`) to compare Soroban contract interfaces across the frontend, the backend, and deployed on-chain WebAssembly instances.

## Goals

1. **Deterministic & Cross-Runtime**: Produce identical hashes across Node.js and browser runtimes regardless of platform or locale settings.
2. **Doc-Insensitive**: Documentation updates (`doc` strings in contract spec entries) must not alter the fingerprint.
3. **Per-Entry Diagnostics**: Granular hashes per function, struct, union, enum, error, and event to identify exact points of interface drift.
4. **Fail-Closed**: Unknown spec entry types or duplicate definitions fail immediately with an explicit error.

---

## Specification

### 1. Stripping Documentation
Every spec entry (`xdr.ScSpecEntry`) is recursively normalized:
- All documentation fields (`doc`) in functions, inputs, outputs, structs, struct fields, unions, union cases, enums, error enums, and events are replaced with empty strings (`""`).
- If an unrecognized entry kind is encountered, parsing throws an error rather than passing it through with documentation intact.

### 2. Per-Entry Hashing
For each stripped entry:
- Compute `sha256(entry.toXDR())` (raw binary XDR representation).
- Format as lowercase 64-character hexadecimal.
- Map to:
  ```ts
  {
    kind: "function" | "struct" | "union" | "enum" | "error" | "event",
    name: string,
    sha256: string
  }
  ```

### 3. Ordering
Entries are sorted lexicographically by `kind` and then `name` using standard Unicode code-point ordering (`<` and `>` comparisons, never `localeCompare`).

Duplicate `(kind, name)` pairs are prohibited and cause an immediate failure.

### 4. Root Calculation
The canonical root fingerprint is computed by joining normalized lines:
```text
kind:name:sha256
```
separated by newline `\n`, and computing the SHA-256 digest over the UTF-8 encoded string.

Output format:
```ts
{
  algo: "odspec-v1",
  root: "<hex-sha256>",
  entries: EntryFingerprint[]
}
```

---

## Test Vectors

```text
Algorithm: odspec-v1
Hashing: SHA-256 (globalThis.crypto.subtle)
Ordering: Code-point ascending on kind, then name
Separator: "\n"
```
