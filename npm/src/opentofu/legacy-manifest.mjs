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
export function verifyLegacyManifest(manifest, expected, nowSeconds = Math.floor(Date.now() / 1000)) {
  for (const field of ['repository', 'commit_sha', 'plan_run_id', 'created_epoch', 'plan_sha256']) {
    if (typeof manifest?.[field] !== 'string' || manifest[field] === '') throw new Error(`Missing ${field}`)
  }
  if (manifest.repository !== expected.repository) throw new Error('Repository mismatch')
  if (manifest.commit_sha !== expected.commit_sha) throw new Error('Commit mismatch')
  if (manifest.plan_run_id !== expected.plan_run_id) throw new Error('Plan run mismatch')
  if (manifest.plan_sha256 !== expected.plan_sha256 || !/^[0-9a-f]{64}$/.test(manifest.plan_sha256)) {
    throw new Error('Plan SHA-256 mismatch')
  }
  const age = nowSeconds - Number(manifest.created_epoch)
  if (!/^\d+$/.test(manifest.created_epoch) || age < 0 || age > 86400) {
    throw new Error('Approved plan expired')
  }
}
