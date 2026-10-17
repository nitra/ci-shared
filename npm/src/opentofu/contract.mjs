import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'

const digestPattern = /^[0-9a-f]{64}$/

/** Reject without including private values in diagnostics. */
function requireCondition(condition, message) {
  if (!condition) throw new Error(message)
}

/** @param {string | Uint8Array} bytes Exact bytes, without JSON normalization. */
export function hash(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

/** Verify approved bytes before parsing a downloaded manifest. */
export function verifyManifestDigest(bytes, expectedDigest) {
  requireCondition(
    digestPattern.test(expectedDigest) && hash(bytes) === expectedDigest,
    'Approved manifest digest mismatch'
  )
}

/** Validate a redacted receipt; a valid blocked receipt is not permission to execute. */
export function verifyObservation(decision, fingerprint, revision) {
  const keys = [
    'schema_version',
    'policy_revision',
    'shadow',
    'enforcement',
    'auto_enabled',
    'mode',
    'rule_ids',
    'mutation_count',
    'policy_sha256'
  ]
  requireCondition(
    decision &&
      typeof decision === 'object' &&
      !Array.isArray(decision) &&
      isDeepStrictEqual(Object.keys(decision).toSorted(), keys.toSorted()),
    'Invalid OPA receipt fields'
  )
  requireCondition(
    decision.schema_version === 1 &&
      decision.policy_revision === revision &&
      decision.policy_sha256 === fingerprint &&
      digestPattern.test(fingerprint),
    'OPA receipt policy mismatch'
  )
  requireCondition(
    decision.shadow === true && decision.enforcement === false && decision.auto_enabled === false,
    'OPA receipt is not shadow-only'
  )
  requireCondition(['noop', 'manual', 'blocked'].includes(decision.mode), 'Invalid OPA receipt mode')
  requireCondition(
    Number.isSafeInteger(decision.mutation_count) && decision.mutation_count >= 0,
    'Invalid OPA mutation count'
  )
  requireCondition(
    Array.isArray(decision.rule_ids) &&
      decision.rule_ids.every(rule => typeof rule === 'string' && /^[a-z][a-z0-9-]*$/.test(rule)),
    'Invalid OPA rule IDs'
  )
  return decision
}

/** Recursively detect standard OpenTofu after_unknown true leaves. */
function containsUnknown(value) {
  return (
    value === true || (value && typeof value === 'object' && Object.values(value).some(item => containsUnknown(item)))
  )
}

/** Existing Azov allowlist guard, not a full JSON validator. Summary values may be sensitive. */
export function verifyPlan(plan, policy, mode) {
  requireCondition(['adopt', 'change'].includes(mode), 'Unknown policy mode')
  requireCondition(plan.errored !== true && plan.complete !== false, 'Incomplete or errored plan')
  requireCondition(Array.isArray(plan.resource_changes), 'Missing resource_changes')
  for (const check of plan.checks ?? []) requireCondition(check.status === 'pass', 'A plan check did not pass')
  const summary = []
  for (const { address, mode: resourceMode, change } of plan.resource_changes) {
    requireCondition(Array.isArray(change?.actions) && change.actions.length > 0, 'Missing actions')
    requireCondition(!change.importing, `Import requires a separate ownership transfer: ${address}`)
    if (isDeepStrictEqual(change.actions, ['read'])) {
      requireCondition(resourceMode === 'data', `Unexpected read: ${address}`)
      continue
    }
    requireCondition(
      resourceMode === 'managed' && Object.hasOwn(policy.updates, address),
      `Unknown address: ${address}`
    )
    if (isDeepStrictEqual(change.actions, ['no-op'])) continue
    requireCondition(
      mode === 'change' && isDeepStrictEqual(change.actions, ['update']),
      `Prohibited action: ${address}`
    )
    requireCondition(change.before && change.after, `Missing update values: ${address}`)
    requireCondition((change.replace_paths ?? []).length === 0, `Replacement paths: ${address}`)
    const fields = [...new Set([...Object.keys(change.before), ...Object.keys(change.after)])].filter(
      field => !isDeepStrictEqual(change.before[field], change.after[field])
    )
    requireCondition(
      fields.length > 0 && fields.every(field => policy.updates[address].includes(field)),
      `Prohibited fields: ${address} (${fields.join(', ')})`
    )
    requireCondition(!containsUnknown(change.after_unknown), `Unknown update values: ${address}`)
    summary.push({
      address,
      actions: change.actions,
      changes: Object.fromEntries(
        fields.map(field => [field, { before: change.before[field], after: change.after[field] }])
      )
    })
  }
  return summary
}

/** Bind manifest v2 to independently supplied trusted context; callers retain their own OPA pin/gate. */
export function verifyManifest(manifest, expected, now = Math.floor(Date.now() / 1000)) {
  requireCondition(manifest.schema_version === 2, 'Unsupported manifest version; publish a new plan')
  for (const field of [
    'repository',
    'commit_sha',
    'root',
    'backend_bucket',
    'backend_prefix',
    'plan_run_id',
    'tofu_version',
    'lock_sha256',
    'policy_sha256',
    'plan_sha256',
    'plan_json_sha256',
    'opa_policy_sha256',
    'opa_version',
    'opa_result_sha256'
  ]) {
    requireCondition(
      typeof manifest[field] === 'string' && manifest[field] === expected[field],
      `Manifest mismatch: ${field}`
    )
  }
  for (const field of [
    'lock_sha256',
    'policy_sha256',
    'plan_sha256',
    'plan_json_sha256',
    'opa_policy_sha256',
    'opa_result_sha256'
  ]) {
    requireCondition(digestPattern.test(manifest[field]), `Invalid digest: ${field}`)
  }
  requireCondition(
    typeof expected.opa_version === 'string' && expected.opa_version.length > 0,
    'Missing trusted OPA version'
  )
  verifyObservation(manifest.opa_decision, expected.opa_policy_sha256, expected.opa_revision)
  requireCondition(isDeepStrictEqual(manifest.opa_decision, expected.opa_decision), 'OPA decision mismatch')
  requireCondition(/^[1-9]\d*$/.test(manifest.plan_run_id), 'Invalid plan run ID')
  requireCondition(/^[0-9a-f]{40}$/.test(manifest.commit_sha), 'Invalid commit SHA')
  requireCondition(['adopt', 'change'].includes(manifest.policy_mode), 'Unknown manifest policy mode')
  requireCondition(Number.isSafeInteger(manifest.created_epoch), 'Invalid creation time')
  const age = now - manifest.created_epoch
  requireCondition(age >= 0 && age <= expected.ttl_seconds, 'Plan expired or timestamp is in the future')
  return manifest.policy_mode
}
