# Сумісність старого OpenTofu manifest

**Status:** Proposed
**Date:** 2026-10-17

## Context and Problem Statement

Azov завершив publisher/consumer no-op acceptance schema 2. Nitra і ABIE
використовують manifest із п’ятьма string fields: repository, commit SHA,
plan run ID, creation epoch та binary plan SHA-256. У ньому немає OPA receipt,
root/backend/tool/policy bindings чи окремого approved manifest digest.
Прямий виклик schema-2 verifier не сумісний із цими artifacts.

## Considered Options

- Одночасно перевести всі consumers на schema 2 та OPA.
- Створювати відсутні OPA fields у consumer adapter.
- Відокремити legacy API і підключати consumers окремими PR.

## Decision Outcome

Додати pure ESM export `@nitra/ci-shared/opentofu/legacy` з функцією
`verifyLegacyManifest(manifest, expected, nowSeconds)`. Окремий source file
не змінює bytes `opentofu/contract.mjs`, уже pinned в Azov.
Першим compatibility baseline є чинний Nitra verifier: exact repository,
commit/run/binary digest bindings, lowercase SHA-256, string creation epoch,
TTL 24 години включно, заборона future timestamp.

Немає schema detection, fallback із schema 2, підробленого receipt або нового CLI.
Caller вибирає API явно. Root-specific plan guard, exact binary hash check,
confirmation, transport, identities й apply лишаються локальними.

### Consequences

Спочатку shared PR, потім Nitra consumer з immutable merge SHA/module SHA-256
та окремим acceptance. ABIE потребує явного review заборони future timestamp:
його нинішня реалізація перевіряє expiry, але не від’ємний age.
Win спочатку потребує окремого плану publisher/consumer і identity boundaries;
наявний main auto-apply не можна назвати сумісним із Azov exact approval.

Legacy API не надає schema-2 гарантій. Azov не переключається на нього й
не оновлює свій pin у цьому PR. Consumers та cloud resources не змінюються.

## More Information

[API та межі гарантій](../reference/opentofu-contract.md#legacy-manifest-api).
Parity tests порівнюють accepted/rejected результати з чинним Nitra verifier,
а не лише happy path; окремі tests захищають незмінний strict schema-2 шлях.
