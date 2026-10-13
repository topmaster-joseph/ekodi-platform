# SeonamMedi HTML head repair — protected recovery reconciliation

## Approved provenance

- Original PR: #4662; owner-approved exact source commit: `b87b7c5158171510d0b31e1eb0a8f69032c5e64c`.
- EKODI Orchestrator recovery PR: #4667, task `orch_recovery_b87b7c5158171510d0b31e1eb0a8f690`.
- Production mutation remains solely behind the existing guarded release process. No runtime/source implementation from the exact approved SHA is changed by this documentation-only reconciliation.

## Confirmed error and corrective design

Campaign image commit `c88180d9c98bc23976658f0f202c06eb5e6dc324` wrote literal `\\n` between homepage social meta tags; `e3ade82ff042b1c8331ed0e89a7fd1871f4aa16d` fixed the original HTML. The earlier release marker omitted HTML bytes and therefore could not attest the repaired page. The approved PR removes a DOM-only mask, repairs known whitespace errors at build time, adds source/render HTML fingerprints, attests finalized HTML SHA-256, verifies both hosted origins, and extends first-party desktop/mobile Chromium checks to raw response bytes.

## Protected continuation

The orchestrator-created recovery PR may initially have `action_required` on bot-authored checks. This *documentation-only owner-authored validation record* requests fresh normal CI under the existing authorization path, without changing the approved executable code. All mandatory security, authentication, parallel change, Cloudflare staging, guarded Worker deployment, and rollback controls remain intact. Do not infer CI success from this document.

Production verification must prove that the actual HTTP responses for both `https://ekodi.kr/seonammedi/` and `https://seonammedi.kr/` have real newlines between `twitter:card` and `og:image`, no literal `\\n` in the HTML head, and no leading text above the visible header on desktop/mobile. Complete only when first-party production evidence confirms this.

## Protected main synchronization

EKODI synchronized the orchestrator-issued release branch with the protected main, producing merge source `9303020218aa441cc52ecb55431dd5f1356f1cb1`. The repository owner requests fresh required CI on this synchronized source. This owner-authored documentation update does not change the previously owner-approved executable fix, remove any safeguard, or imply production success. Guarded release and live verification remain mandatory.
