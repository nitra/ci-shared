/** @param {string | Uint8Array} bytes Exact bytes, without JSON normalization. */
export function hash(bytes: string | Uint8Array): any
/** Verify approved bytes before parsing a downloaded manifest. */
export function verifyManifestDigest(bytes: any, expectedDigest: any): void
/** Validate a redacted receipt; a valid blocked receipt is not permission to execute. */
export function verifyObservation(decision: any, fingerprint: any, revision: any): any
/** Existing Azov allowlist guard, not a full JSON validator. Summary values may be sensitive. */
export function verifyPlan(
  plan: any,
  policy: any,
  mode: any
): {
  address: any
  actions: any
  changes: {
    [k: string]: {
      before: any
      after: any
    }
  }
}[]
/** Bind manifest v2 to independently supplied trusted context; callers retain their own OPA pin/gate. */
export function verifyManifest(manifest: any, expected: any, now?: number): any
