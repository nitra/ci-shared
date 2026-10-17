/** Rejects an artifact whose immutable manifest does not match this apply run. */
let input = ''
for await (const chunk of process.stdin) input += chunk

const manifest = JSON.parse(input)
for (const field of ['repository', 'commit_sha', 'plan_run_id', 'created_epoch', 'plan_sha256']) {
  if (typeof manifest[field] !== 'string' || manifest[field] === '') throw new Error(`Missing ${field}`)
}

if (manifest.repository !== process.env.GITHUB_REPOSITORY) throw new Error('Repository mismatch')
if (manifest.commit_sha !== process.env.GITHUB_SHA) throw new Error('Commit mismatch')
if (manifest.plan_run_id !== process.env.PLAN_RUN_ID) throw new Error('Plan run mismatch')
if (manifest.plan_sha256 !== process.env.EXPECTED_PLAN_SHA256 || !/^[0-9a-f]{64}$/.test(manifest.plan_sha256)) {
  throw new Error('Plan SHA-256 mismatch')
}

const age = Math.floor(Date.now() / 1000) - Number(manifest.created_epoch)
if (!/^\d+$/.test(manifest.created_epoch) || age < 0 || age > 86400) {
  throw new Error('Approved plan expired')
}
