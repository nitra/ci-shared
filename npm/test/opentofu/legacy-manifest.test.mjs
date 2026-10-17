import { test, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { createHash } from 'node:crypto'
import { verifyLegacyManifest } from '../../src/opentofu/legacy-manifest.mjs'
import { verifyLegacyManifest as publicVerifier } from '@nitra/ci-shared/opentofu/legacy'
import { verifyManifest } from '../../src/opentofu/contract.mjs'

const now = 1_000_000
const expected = {
  repository: 'example/infra',
  commit_sha: 'a'.repeat(40),
  plan_run_id: '42',
  plan_sha256: 'b'.repeat(64)
}
const manifest = { ...expected, created_epoch: String(now) }
// Exact Nitra origin/main 2c45e93 source; no production fields or credentials.
const baseline = readFileSync(new URL('fixtures/nitra-legacy.mjs', import.meta.url), 'utf8')
const baselineDigest = '552cc0ac6d03b9df5bdc49042d3ca8338ef52664cf9221fb65f2bc0ad216936f'
if (createHash('sha256').update(baseline).digest('hex') !== baselineDigest) {
  throw new Error('Compatibility oracle differs from reviewed source')
}

/** Execute the frozen CLI in an isolated synthetic environment and clock. */
async function baselineAccepts(value, trusted, clock) {
  try {
    // eslint-disable-next-line sonarjs/code-eval -- Only hash-checked, reviewed fixture code is compiled; artifact data enters via synthetic stdin.
    await runInNewContext('(async () => {' + baseline + '\n})()', {
      process: {
        stdin: [JSON.stringify(value)],
        env: {
          GITHUB_REPOSITORY: trusted.repository,
          GITHUB_SHA: trusted.commit_sha,
          PLAN_RUN_ID: trusted.plan_run_id,
          EXPECTED_PLAN_SHA256: trusted.plan_sha256
        }
      },
      Date: { now: () => clock * 1000 }
    })
    return true
  } catch {
    return false
  }
}

/** Compare accepted/rejected results without relying on error wording. */
function sharedAccepts(value, trusted, clock) {
  try {
    verifyLegacyManifest(value, trusted, clock)
    return true
  } catch {
    return false
  }
}

test('public legacy subpath is explicit and schema 2 still rejects legacy artifacts', () => {
  expect(publicVerifier).toBe(verifyLegacyManifest)
  expect(verifyLegacyManifest(manifest, expected, now)).toBeUndefined()
  expect(() => verifyManifest(manifest, expected, now)).toThrow('Unsupported manifest version')
  expect(() => verifyManifest({ ...manifest, schema_version: 2 }, expected, now)).toThrow()
})

test('TTL boundaries include exactly 24 hours and exclude all future timestamps', () => {
  expect(() => verifyLegacyManifest(manifest, expected, now)).not.toThrow()
  expect(() => verifyLegacyManifest(manifest, expected, now + 86400)).not.toThrow()
  expect(() => verifyLegacyManifest(manifest, expected, now + 86401)).toThrow('Approved plan expired')
  expect(() => verifyLegacyManifest(manifest, expected, now - 1)).toThrow('Approved plan expired')
})

test('default clock accepts a freshly published envelope', () => {
  expect(() =>
    verifyLegacyManifest({ ...manifest, created_epoch: String(Math.floor(Date.now() / 1000)) }, expected)
  ).not.toThrow()
})

test('missing and mismatched values fail without exposing private content', () => {
  for (const field of Object.keys(manifest)) {
    expect(() => verifyLegacyManifest({ ...manifest, [field]: 'PRIVATE_MARKER' }, expected, now)).toThrow()
    try {
      verifyLegacyManifest({ ...manifest, [field]: 'PRIVATE_MARKER' }, expected, now)
    } catch (error) {
      expect(error.message).not.toContain('PRIVATE_MARKER')
    }
    const missing = { ...manifest }
    delete missing[field]
    expect(() => verifyLegacyManifest(missing, expected, now)).toThrow()
  }
})

test('extra legacy fields remain opaque; no OPA guarantee is inferred', () => {
  expect(() => verifyLegacyManifest({ ...manifest, opa_decision: { mode: 'blocked' } }, expected, now)).not.toThrow()
})

test('frozen Nitra verifier parity across types, bindings, digests and timestamps', async () => {
  const candidates = [manifest, null, [], false, {}, { ...manifest, extra: 'opaque' }]
  const values = [
    undefined,
    null,
    '',
    0,
    false,
    {},
    [],
    'PRIVATE_MARKER',
    '0',
    '00042',
    'B'.repeat(64),
    'b'.repeat(63),
    'b'.repeat(65)
  ]
  for (const field of Object.keys(manifest)) {
    for (const value of values) candidates.push({ ...manifest, [field]: value })
  }
  for (const epoch of [now - 86401, now - 86400, now - 1, now, now + 1]) {
    candidates.push({ ...manifest, created_epoch: String(epoch) })
  }
  for (const epoch of ['0001000000', '-1', '1e6', '1000000.0', ' 1000000', '9'.repeat(400)]) {
    candidates.push({ ...manifest, created_epoch: epoch })
  }
  const contexts = [expected]
  for (const field of Object.keys(expected)) {
    contexts.push({ ...expected, [field]: undefined }, { ...expected, [field]: 'mismatch' })
  }
  let count = 0
  for (const value of candidates) {
    const parsed = JSON.parse(JSON.stringify(value))
    for (const trusted of contexts) {
      for (const clock of [now - 1, now, now + 86400, now + 86401]) {
        expect(sharedAccepts(parsed, trusted, clock)).toBe(await baselineAccepts(parsed, trusted, clock))
        count++
      }
    }
  }
  expect(count).toBe(2952)
}, 30_000)

test('compatibility oracle remains the reviewed Nitra source snapshot', () => {
  expect(createHash('sha256').update(baseline).digest('hex')).toBe(
    '552cc0ac6d03b9df5bdc49042d3ca8338ef52664cf9221fb65f2bc0ad216936f'
  )
})
