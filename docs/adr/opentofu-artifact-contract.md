# Спільний OpenTofu artifact contract

**Status:** Accepted
**Date:** 2026-10-17

## Context and Problem Statement

Azov перевірив saved binary plan, manifest v2 і OPA receipt. ABIE/Win/Nitra
мають інші workflows і policies. Потрібна спільна перевірка артефактів без
перенесення project credentials, cloud ownership або автоматизації apply.

## Considered Options

- Новий репозиторій для OpenTofu tooling.
- Наявний `nitra/ci-shared`, погоджений користувачем.
- Локальний компонент тільки в Azov.

## Decision Outcome

Додати pure ESM API `@nitra/ci-shared/opentofu` без CLI та нових runtime
dependencies. Перший етап переносить перевірки з Azov source `70e8a7e`:
plan allowlist, exact manifest bytes, manifest v2 context/TTL та redacted OPA receipt.
Специфікація API — [OpenTofu contract](../reference/opentofu-contract.md).

WIF, tool installation/pins, policy files, backend, transport, mutation queue,
project-specific OPA gate і runtime acceptance залишаються в consumer repo.
Trusted `expected` context передається явно; жодних env defaults або cloud API.
OPA version є локальним reviewed pin, не глобальною константою бібліотеки.

### Consequences

Azov підключається окремим PR після merge shared компонента, через full Git SHA
та перевірку bytes. Npm API не вимагає запуску наявного `ci-shared` CLI або
встановлення GraphQL dependencies при source-based vendoring. Нових identity
grants і cloud applies цей PR не робить. Fleet acceptance не успадковується від Azov.

## More Information

Контракт не є повним OpenTofu JSON validator, policy engine, цифровим підписом
або authorization executor. `blocked` може бути валідним OPA receipt, але його
повинен відхилити локальний consumer gate. Production apply потребує окремого
artifact approval та acceptance. Див. [тести контракту](../../npm/test/opentofu/contract.test.mjs).
