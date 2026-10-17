# OpenTofu artifact contract API

Pure ESM модуль `npm/src/opentofu/contract.mjs` не читає env/files, не виконує
network/subprocess calls і не створює CLI. Початкова реалізація відокремлює
generic частину Azov manifest v2; [межі рішення](../adr/opentofu-artifact-contract.md).

## API

- `hash(bytes)` — SHA-256 exact bytes, lowercase hex.
- `verifyManifestDigest(bytes, approvedDigest)` — перевірка погоджених bytes
  до JSON parsing; будь-яке форматування змінює digest.
- `verifyObservation(decision, fingerprint, revision)` — exact redacted schema v1,
  policy identity, shadow flags, mode `noop|manual|blocked`, integer mutation count
  і machine-readable rule IDs. Не надає дозволу на execution.
- `verifyPlan(plan, policy, mode)` — існуючий Azov field allowlist guard:
  `adopt` допускає managed no-op і data reads; `change` додатково дозволяє лише
  in-place updates exact addresses/fields із `policy.updates`. Reject imports,
  replacements, failed checks, incomplete plans і unknown mutation values.
  Повертає update summary із before/after, який може містити sensitive data:
  caller не повинен друкувати його в загальні logs.
- `verifyManifest(manifest, expected, nowSeconds)` — exact manifest schema v2
  binding, TTL і policy mode `adopt|change`; повертає mode. Clock можна передати
  для deterministic tests; default — current epoch seconds.

`expected` — trusted context, не поля з downloaded manifest: repository,
commit SHA, root/backend, plan run ID, engine, provider-lock/policy/binary/JSON/OPA
digests, OPA version/decision/revision, `ttl_seconds`. Caller звіряє manifest digest
перед parsing і відтворює binary JSON/OPA receipt pinned tools перед execution.
Перевіряються ті самі поля, що в Azov v2, без додаткового transport schema/DSL.
Trusted OPA version має бути непорожньою й точно збігатися з manifest;
Azov adapter продовжує задавати власний pin 1.21.1.

## Adoption

Перший consumer — Azov, окремий PR з immutable commit SHA й module SHA-256,
порівняльними tests старого та shared verifier, потім live no-op acceptance.
У цьому PR consumers не переключаються. Mutable branches/tags або `latest`
не є production pin. Наявний manifest v2 не змінюється.

Root-specific policy та `deny-blocked-v1` enforcement не переносяться до generic
API. Standalone checks не доводять source authenticity, backend state freshness,
binary/JSON equivalence, JSON structural consistency або actual cloud parity.
Ці перевірки виконуються локальними guards/OPA/runtime acceptance consumers.
Тести: [Bun contract tests](../../npm/test/opentofu/contract.test.mjs).
