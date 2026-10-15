# First-party Education live proof after guarded Shell Worker production

Owner exact-SHA-approved PR #4825 via official recovery #4827 merged main `997633bc24e462d3e53e09a097c22961a9bd459a`. Owner-labeled issue #4813 executed official first-party reconciliation run #38707198281. Existing receipt-bound guarded Shell Worker production run #38707222853 completed **success**, with Shell contract validation, staging and production checks positive.

This separate PR is a **read-only diagnostic only**, not a release and not authorized for merge. Its sole workflow invokes the existing first-party Chromium Education classroom and materials studio E2E check directly against real `https://ekodi.kr/edu/`, with responsive mobile and desktop widths, strict CSP, network-error, synthetic training-data/redaction, no mutations and explicit evidence artifacts. The prior native test failed because shared Shell erroneously requested a non-tenant `edu` chrome configuration and caused HTTP 404; Shell source fix now runs in production, but result must be independently measured.

A failed native test is a blocking issue, never evidence of success. No secrets, direct Cloudflare API calls, authenticated student data, Worker deployment or production changes are authorized by this PR.
