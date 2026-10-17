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

Перший consumer Azov підключив immutable commit SHA й module SHA-256
та завершив live publisher/consumer no-op acceptance 2026-10-17.
Наступні consumers переключаються окремими compatibility/acceptance PR.
Mutable branches/tags або `latest` не є production pin.
Наявний manifest v2 і source `contract.mjs` у legacy API PR не змінюються.

Root-specific policy та `deny-blocked-v1` enforcement не переносяться до generic
API. Standalone checks не доводять source authenticity, backend state freshness,
binary/JSON equivalence, JSON structural consistency або actual cloud parity.
Ці перевірки виконуються локальними guards/OPA/runtime acceptance consumers.
Тести: [Bun contract tests](../../npm/test/opentofu/contract.test.mjs).

## Legacy manifest API

Окремий import `@nitra/ci-shared/opentofu/legacy`:
`verifyLegacyManifest(manifest, expected, nowSeconds)` повертає `undefined`
або кидає помилку без значень artifact. Source:
`npm/src/opentofu/legacy-manifest.mjs`.
[Рішення та rollout](../adr/opentofu-legacy-manifest.md).

Manifest має п’ять непорожніх string fields: `repository`, `commit_sha`,
`plan_run_id`, `created_epoch`, `plan_sha256`. Trusted `expected` містить
repository, commit SHA, plan run ID та погоджений binary SHA-256 — не копії
downloaded fields. Значення мають точно збігатися; digest — 64 lowercase hex.
Creation epoch — десятковий string, age від 0 до 86400 секунд включно.
Clock передається для tests; default — current epoch seconds.
Як у Nitra baseline, невідомі додаткові fields не перевіряються.

Це compatibility API для старого wire format, не послаблений schema-2 verifier.
Не викликати його як fallback після `verifyManifest` failure. Немає OPA,
root/backend/tool/lock/policy binding чи перевірки digest самого manifest.
Локальний consumer має перевіряти exact binary bytes і власний plan guard.
Нові schema-2 consumers продовжують використовувати `verifyManifest`;
додавати штучні receipt або fields для адаптації legacy artifacts заборонено.

Перший наступний consumer — Nitra, окремим PR після merge цього API.
ABIE майбутню дату наразі допускає: його перехід потребує явного hardening
review. Win потребує окремого workflow/identity review. Ця зміна shared API
не є fleet rollout чи live acceptance.

Перевірки: [legacy tests і frozen Nitra oracle](../../npm/test/opentofu/legacy-manifest.test.mjs).
