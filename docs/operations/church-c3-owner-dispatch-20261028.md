# EKODI Church C3 retirement — owner-controlled dispatch runbook

Status: implementation is in protected EKODI Orchestrator recovery PR #6560, derived from #6559; existing Church hostname retirement logic was protected-merged by PR #6535, and task #6533 remains open until external production verification.

## Trigger contract

The dispatcher is an event bridge, not a DNS administration script. Only the repository owner may post the exact one-line command `EKODI-CHURCH-C3-EXECUTE` as a new comment **on issue #6533**. The script verifies the actual GitHub actor/sender/comment author, the protected merged PR #6535 and merge SHA, the authentic current EKODI Orchestrator release receipt, and canonical public/member URLs before asking GitHub to run the **existing** protected `retire-church-legacy-domain.yml` workflow with the authorized task and branch.

No comment from another account, on a PR, on another issue, or with extra text triggers a production dispatch.

## Cloudflare release boundaries

Only the original guarded C3 workflow may detach exact old Church browser-host Pages, Worker and A/AAAA/CNAME web DNS. It must first pass normal production environment authorization, EKODI AI `--release` checks, quota circuit, read-only inventory and canonical Church canaries. Existing Church Pages, canonical path, Live, member data, donations, role permissions, MX/TXT records, unrelated custom domains and other sites stay untouched.

The dispatch result (HTTP 204) does **not** prove retirement. A successful post-merge production run, Cloudflare zero-old-host binding inventory, independent old-host response check and canonical route regression are mandatory completion evidence.

## Protected merge repair

New PR #6560 is created automatically under the approved EKODI Orchestrator branch. GitHub may classify initial bot-authored checks as `action_required`. This owner-authored documentation changes the exact head SHA to initiate fresh required checks; it neither impersonates a Human Gate nor relaxes branch protection or releases DNS.
