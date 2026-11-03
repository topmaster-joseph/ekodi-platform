# EKODI Mall former repository — independent Git history preservation

Scope: `topmaster-joseph/ekodi-mall`. Date: 2026-11-02 (KST). Task: `satellite-history-backup-20261102`.

## Observed and directly tested

- Connected EKODI Windows device: `user3`. Existing private GitHub repository read-access was tested through authenticated `gh repo view`, not token extraction.
- Performed read-only `gh repo clone ... -- --mirror`; local `git fsck --full --no-reflogs` succeeded.
- Created private local `all-refs.bundle`, ran `git bundle verify` from mirror repository context, cloned the bundle into a distinct bare repository and ran full fsck.
- Independently compared **all 73** refs and pointed commit SHA pairs between source mirror and restored mirror: identical.
- Source and restored `main` commit: `1afbfdead2c3054b37fbd2e7bb19585220883d44`.
- Private bundle byte size: `380329`; SHA-256: `0c3ffec139d07ff0dc1251bb720a922d1434ab600377276d6de74843ec2424b6`.
- Saved local evidence in the selected device's private `Documents/EKODI-Private-Archives/repo-retirement-20261102/ekodi-mall/backup-restore-proof.json` with an explicit `offsiteCopyVerified:false` and `deletionAuthorized:false`.
- Read-only production HTTP probes on the selected device: `https://ekodi.kr/ekodimall/` -> 200, `https://ekodi-mall.pages.dev/` -> 200, canonical `/ekodimall/assets/marketplace-live.js` -> 200, canonical `/ekodimall/pages/privacy/` -> 200. These are **HTTP surface-only** results, not functional checkout/auth, exact runtime SHA or build parity proof.

## Remaining blocks (do not delete former repository)

- Private bundle has only been verified on one local device. **No offsite or independent backup destination is verified yet.** This is not sufficient under `SOURCE-REPO-RETIREMENT-001`.
- Historical ref counts and local restoration do not prove every webhook, GitHub Action, GitHub App, secret, branch protection, Cloudflare API token or external callback was migrated/revoked.
- The Pages and canonical routes both answer 200, but their HTML response sizes differed on this probe. This **does not prove drift** (gateway HTML rewriting may differ), nor does it establish production artifact SHA parity; compare source hashes/markers and actual browser flows.
- Final repository-specific deletion authorization and all 13 pre-delete evidence requirements are still absent; deleting or archiving the GitHub repo is premature.

## Repeatable execution for other satellites

Use `node scripts/archive-satellite-git-history.mjs --repository topmaster-joseph/ekodi-mall --destination <an-absolute-new-private-directory>` on an authorized and isolated execution node with Git and GitHub CLI access. The tool never accepts deletion instructions, never overwrites a previous archive, and verifies the entire ref set after restoration. It stores only a local proof; an independently authorized offsite backup and its restore drill must still be performed.

## Retained independent release

The official source for Mall is `sites/ekodi-mall` in `topmaster-joseph/ekodi-platform`, and the existing distinct Cloudflare Pages release is governed by `.github/workflows/deploy-ekodi-mall.yml`. Consolidating Git sources does not authorize collapsing the deploy target, D1 data, payment controls, tenant roles or production secrets.
