# enterprise

## Purpose
Enterprise features: multi-tenant orgs, OIDC/SAML SSO bootstrap, RBAC roles, and a federated trust/mesh
endpoint. `getEnterpriseStatus` summarises enabled enterprise features. (Helix area.)

## Public exports (selected)
- `interface EnterpriseStatus`.
- `async function getEnterpriseStatus(): Promise<EnterpriseStatus>`.
- `interface OidcConfig`, `async function configureOidc(config)`.
- `interface SamlConfig`, `async function configureSaml(config)`.
- `interface RoleDef`, `async function createRole(role)`, `assignRole(userId, roleId)`.
- `async function meshTrustEndpoint(...)` — federated mesh handshake.

## Env vars
- `NEXUS_ENTERPRISE_ENABLED`, `NEXUS_OIDC_ISSUER`, `NEXUS_SAML_METADATA_URL`, `NEXUS_RBAC_ENABLED`.

## Test file
- `server/tests/enterprise.test.ts` (status, OIDC/SAML configure, RBAC).
