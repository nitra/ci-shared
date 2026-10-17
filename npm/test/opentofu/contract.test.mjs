import { test, expect } from 'bun:test'
import {
  hash,
  verifyManifestDigest,
  verifyObservation,
  verifyPlan,
  verifyManifest
} from '../../src/opentofu/contract.mjs'
import { verifyPlan as publicVerifyPlan } from '@nitra/ci-shared/opentofu'

test('public ESM subpath exposes the same implementation', () => {
  expect(publicVerifyPlan).toBe(verifyPlan)
})

const policy = { updates: { 'google_container_cluster.example': ['maintenance_policy'] } }
/** Build one synthetic plan; never production state. */
function plan(actions = ['no-op'], before = {}, after = {}) {
  return {
    resource_changes: [
      {
        address: 'google_container_cluster.example',
        mode: 'managed',
        change: { actions, before, after, after_unknown: {} }
      }
    ]
  }
}
const decision = {
  schema_version: 1,
  policy_revision: 'fixture',
  shadow: true,
  enforcement: false,
  auto_enabled: false,
  mode: 'manual',
  rule_ids: ['resource-drift'],
  mutation_count: 0,
  policy_sha256: 'e'.repeat(64)
}
const expected = {
  repository: 'example/infra',
  commit_sha: 'a'.repeat(40),
  root: 'tofu/example',
  backend_bucket: 'example-state',
  backend_prefix: 'gke/example',
  plan_run_id: '42',
  tofu_version: '1.8.3',
  lock_sha256: 'b'.repeat(64),
  policy_sha256: 'c'.repeat(64),
  plan_sha256: 'd'.repeat(64),
  plan_json_sha256: 'f'.repeat(64),
  opa_policy_sha256: decision.policy_sha256,
  opa_version: '1.21.1',
  opa_result_sha256: '1'.repeat(64),
  opa_decision: decision,
  opa_revision: 'fixture',
  ttl_seconds: 86400
}
const manifest = { ...expected, schema_version: 2, policy_mode: 'adopt', created_epoch: 1000 }

test('exact bytes are approved before parsing', () => {
  expect(hash('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  const bytes = JSON.stringify(manifest)
  verifyManifestDigest(bytes, hash(bytes))
  expect(() => verifyManifestDigest(bytes + '\n', hash(bytes))).toThrow()
  for (const digest of ['', undefined, 'invalid', '0'.repeat(64)]) {
    expect(() => verifyManifestDigest(bytes, digest)).toThrow()
  }
})
test('adopt permits no-op/read, not cloud mutations or imports', () => {
  expect(verifyPlan(plan(), policy, 'adopt')).toEqual([])
  expect(
    verifyPlan(
      { resource_changes: [{ mode: 'data', address: 'data.example', change: { actions: ['read'] } }] },
      policy,
      'adopt'
    )
  ).toEqual([])
  for (const actions of [['create'], ['update'], ['delete'], ['delete', 'create'], ['read']]) {
    expect(() => verifyPlan(plan(actions), policy, 'adopt')).toThrow()
  }
  const imported = plan()
  imported.resource_changes[0].change.importing = { id: 'example' }
  expect(() => verifyPlan(imported, policy, 'adopt')).toThrow()
})
test('change allows only exact reviewed fields with known values', () => {
  const p = plan(
    ['update'],
    { maintenance_policy: 'old', network: 'same' },
    { maintenance_policy: 'new', network: 'same' }
  )
  expect(verifyPlan(p, policy, 'change')).toHaveLength(1)
  for (const patch of [
    { after_unknown: { nested: [{ value: true }] } },
    { replace_paths: [['maintenance_policy']] },
    { after: { network: 'other' } },
    { before: null }
  ]) {
    const changed = structuredClone(p)
    Object.assign(changed.resource_changes[0].change, patch)
    expect(() => verifyPlan(changed, policy, 'change')).toThrow()
  }
  const foreign = structuredClone(p)
  foreign.resource_changes[0].address = 'google_container_cluster.foreign'
  expect(() => verifyPlan(foreign, policy, 'change')).toThrow()
})
for (const patch of [
  { errored: true },
  { complete: false },
  { checks: [{ status: 'unknown' }] },
  { resource_changes: null }
]) {
  test(`invalid plan rejects ${JSON.stringify(patch)}`, () => {
    expect(() => verifyPlan({ ...plan(), ...patch }, policy, 'adopt')).toThrow()
  })
}
test('receipt validation is not execution authorization', () => {
  for (const mode of ['noop', 'manual', 'blocked']) {
    const d = { ...decision, mode }
    expect(verifyObservation(d, d.policy_sha256, 'fixture')).toEqual(d)
  }
  for (const patch of [
    { shadow: false },
    { enforcement: true },
    { auto_enabled: true },
    { mode: 'auto' },
    { schema_version: 2 },
    { mutation_count: -1 },
    { mutation_count: 0.5 },
    { rule_ids: ['PRIVATE VALUE'] },
    { rule_ids: null },
    { extra: 'sample-secret' },
    { policy_revision: 'foreign' }
  ]) {
    expect(() => verifyObservation({ ...decision, ...patch }, decision.policy_sha256, 'fixture')).toThrow()
  }
})
test('manifest v2 accepts exact trusted context and boundary TTL', () => {
  expect(verifyManifest(manifest, expected, 1000)).toBe('adopt')
  expect(verifyManifest(manifest, expected, 87400)).toBe('adopt')
  for (const now of [999, 87401]) expect(() => verifyManifest(manifest, expected, now)).toThrow()
})
const boundFields = Object.keys(expected).filter(key => !['ttl_seconds', 'opa_revision'].includes(key))
for (const field of boundFields) {
  test(`manifest binds ${field}`, () => {
    expect(() => verifyManifest({ ...manifest, [field]: 'foreign' }, expected, 1001)).toThrow()
    const missing = { ...manifest }
    delete missing[field]
    expect(() => verifyManifest(missing, expected, 1001)).toThrow()
  })
}
test('legacy, unsupported mode and invalid identifiers fail closed', () => {
  for (const patch of [{ schema_version: 1 }, { policy_mode: 'auto' }, { created_epoch: '1000' }]) {
    expect(() => verifyManifest({ ...manifest, ...patch }, expected, 1001)).toThrow()
  }
  for (const [field, value] of [
    ['commit_sha', 'invalid'],
    ['plan_run_id', '0'],
    ['plan_sha256', 'invalid']
  ]) {
    expect(() => verifyManifest({ ...manifest, [field]: value }, { ...expected, [field]: value }, 1001)).toThrow()
  }
})
test('OPA pin belongs to trusted caller, not downloaded manifest', () => {
  const pinned = { ...expected, opa_version: '9.0.0' }
  expect(() => verifyManifest(manifest, pinned, 1001)).toThrow()
  expect(verifyManifest({ ...manifest, opa_version: pinned.opa_version }, pinned, 1001)).toBe('adopt')
})
