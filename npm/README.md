# Nitra CI shared

Спільні CI компоненти: чинний `ci-shared` CLI для schema/commit tasks та окремий
pure ESM API `@nitra/ci-shared/opentofu` для artifact validation без CLI.

Legacy manifest має окремий API `@nitra/ci-shared/opentofu/legacy`;
це compatibility path для старого wire format, без schema-2/OPA гарантій.

OpenTofu API додається в source; npm availability залежить від наступного release.
Для першого Azov adoption використовується окремо reviewed immutable Git SHA,
а не mutable `main` або неперевірений npm version.

[Контракт і межі OpenTofu API](https://github.com/nitra/ci-shared/blob/main/docs/reference/opentofu-contract.md).
