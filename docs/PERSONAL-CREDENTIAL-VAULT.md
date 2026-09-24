# EKODI Personal Credential Vault

Status: **design-review**  
Policy: `PERSONAL-CREDENTIAL-VAULT-001`

## Canonical location

The personal account vault belongs to My EKODI at:

`https://ekodi.kr/my/security/vault`

Legacy My subdomain aliases are compatibility/internal routing only and are intentionally not declared by this vault policy. The vault must not create a new user identity source of truth.

## What problem it solves

Users may forget which account, email, login method, password, recovery code, or API key belongs to a service. The vault records account metadata and, only when necessary, encrypted secret material.

The vault is not a replacement for provider OAuth. Existing OAuth access/refresh tokens remain in the Mail, Channel, AI-provider, or other service-specific credential vaults. The personal vault stores an `oauth_connection_reference` instead of copying those tokens.

## Data separation

1. **Account metadata**: provider, site URL, display name, login hint, recovery email/phone, tags, last verified time. This is searchable without decryption.
2. **Personal secrets**: password, recovery code, API key, optional TOTP seed, secure note. This is encrypted and never indexed.
3. **Passkeys**: only reference/metadata is stored. The authenticator private key never enters EKODI.
4. **OAuth connections**: only a reference is stored. Provider tokens stay in the existing service-specific vault.
5. **Audit**: records action, actor, authentication strength, result, and timestamp. It never stores secret values or request bodies containing them.

## Cryptographic model

Use envelope encryption.

- Generate one random 256-bit DEK per personal vault.
- Wrap the DEK with a versioned KEK stored only as a Worker/managed secret.
- Encrypt every secret item independently with AES-256-GCM and a fresh 96-bit nonce.
- Bind authenticated additional data (AAD) to `owner_person_id + vault_id + item_id + secret_kind + schema_version`.
- Store ciphertext, nonce, AAD descriptor, and key version only.
- A key rotation changes the KEK wrapping without exposing item plaintext where possible.
- No plaintext secret may be written to D1/Supabase, logs, analytics, AI traces, search indexes, browser localStorage, or command history.

The initial server-managed envelope mode prevents ordinary administrators and applications from reading secrets because no admin/UI capability exposes decryption. It is **not zero-knowledge against a fully compromised server/key authority**. A future opt-in zero-knowledge mode can add a user-held unlock key (Passkey PRF where supported or a memory-hard master-secret derivation) at the cost of harder recovery.

## Authorization and UX

The list page never decrypts. It shows provider, account label, login method, last update, and status.

Reveal/copy/edit-secret/export/delete/key-rotation require fresh step-up authentication. Prefer Passkey/WebAuthn; use fresh identity reauthentication only as a fallback. A revealed secret should be masked again after 30 seconds and the vault should lock after 5 minutes of inactivity.

The first release should support:
- add account metadata;
- add/update an encrypted password or recovery code;
- copy/reveal after step-up authentication;
- password generator;
- mark login method as Google/Kakao/Apple/Passkey/OAuth without storing a password;
- link an existing OAuth connection by reference;
- revoke/delete an item;
- encrypted backup/export only.

Do not ship browser autofill, automatic login, bulk CSV plaintext export, shared passwords, or AI access in the first release.

## AI and MCP boundary

AI may help classify account metadata, suggest password hygiene, or explain recovery steps **without receiving the secret**. Secret-reveal capabilities are not exposed through MCP, A2A, ordinary AI context, or external-AI handoff.

If a future automation needs a credential, it receives a narrowly scoped execution capability that uses the secret server-side; the secret itself is not returned to the model.

## Relationship to External Account Control Center

`external_account_connections` remains the cross-service metadata/control registry. Its `credential_ref` may point to a personal-vault item or a service-specific OAuth vault, but the registry must never copy ciphertext or plaintext secrets.

## Activation rule

This design is intentionally fail-closed. Production activation remains off until cryptography, authorization, reauthentication, redaction, backup/key rotation, and synthetic-secret canary tests pass.
