# Education production read-only diagnostic following official recovery #4811

This is a temporary **diagnostic-only** PR. It does not authorize code publication, deploy Workers, access private authentication or disable CSP. The owner-approved PR #4808 (source `6cdb44bb6d09cc6a8d9b30086b42ea050a4957de`) was merged by official recovery PR #4811 as main `9ac525bf9bd4f4514e11d77b9b55ac510682fa10`. The immediate recovery-merge workflow did not dispatch the required guarded Shell Worker deployment, and fresh recovery PR test jobs reported failure while the branch was being closed.

The separate `verify-education-postmerge-diagnostic.yml` workflow invokes the existing first-party native Chromium scripts in disposable GitHub runners against **actual** `https://ekodi.kr/edu/` classroom/studio paths. It records both mobile and desktop positive or negative evidence and archives evidence on failure. It does not modify live content. Do not use CI preview as proof of operational release.

Required follow-through: official receipt-bound Shell deployment, verify actual deployed asset version and rollback status, then run independent, five-viewport canonical Education + legacy Shell/Auth tests until all pass. Protect payment, privacy, scripts and CSP unchanged.

This temporary source branch is for observation only and MUST NOT be merged as a production change without its own owner exact-SHA approval.
