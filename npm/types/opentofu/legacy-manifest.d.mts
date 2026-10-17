/**
 * @typedef {object} LegacyExpected
 * @property {string} repository Trusted repository.
 * @property {string} commit_sha Trusted checked-out source commit.
 * @property {string} plan_run_id Approved publisher run.
 * @property {string} plan_sha256 Operator-approved binary digest.
 */
/**
 * Verify the legacy five-string envelope, not schema 2 or OPA authorization.
 * Callers still verify exact binary bytes and project-specific plan policy.
 * @param {Record<string, unknown>} manifest Parsed legacy artifact.
 * @param {LegacyExpected} expected Trusted context, never copied from the artifact.
 * @param {number} nowSeconds Current epoch seconds, injectable for tests.
 */
export function verifyLegacyManifest(
  manifest: Record<string, unknown>,
  expected: LegacyExpected,
  nowSeconds?: number
): void
export type LegacyExpected = {
  /**
   * Trusted repository.
   */
  repository: string
  /**
   * Trusted checked-out source commit.
   */
  commit_sha: string
  /**
   * Approved publisher run.
   */
  plan_run_id: string
  /**
   * Operator-approved binary digest.
   */
  plan_sha256: string
}
