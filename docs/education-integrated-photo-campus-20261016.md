# EKODI Education · integrated online campus (2026-10-16)

## Site and appearance
Canonical public entry: `https://ekodi.kr/edu/`. Keep existing internally routed Education Worker and canonical Site Core; never register a new user-facing subdomain. Replaces only existing `education/index.html` homepage with the user-approved photo-led visual. Sticky white header, real-photography education hero, four course cards, fact-based notice/material tabs, instructor-introduction placeholder, responsive learner/operator navigation. Real instructor identity, fees, term dates, accreditation and enrollments are intentionally **not** invented.

Images are external Unsplash HTTPS backgrounds, permitted by the existing `img-src https:` CSP. No third-party scripts or unsafe inline JS/styles are introduced. Prior to long-term publication, assess photo rights and privacy and consider packaging reviewed photos in first-party assets.

## Existing lecture/lab preserved
- `/edu/study/ai-bootcamp/`: existing **four 120-minute lessons × six cohorts**: six course tabs, lecture view, prompts, sample CSV, interactive verification, 36 presentation slides, 24-session schedule CSV.
- `/edu/study/ai-bootcamp/studio/`: existing **local-first** instructor material import, editing, security warnings, preview and reviewed JSON export; there is no server upload or automatic publication.
- `/edu/admission/` and `/edu/study/` remain unchanged, as do Education legacy paths and central Shell/Auth.

## Combined student / educator / operator dashboard
- `/edu/portal/`: common campus destination, course progress and lessons, group-specific admission request, published notice/materials, hands-on prompt and verification checklist.
- Central Google login solely verifies identity. Login URL encodes **the exact current URL including path, search and intended tab** as `return_to`; after authentication return to the same portal panel, not My EKODI.
- `/edu/portal/#manage` is discoverable only for server-confirmed `admin` or `instructor` roles. This visual affordance is never authorization. Supabase RLS enforces every insert, update, read, delete. Admin can approve/reject requests and publish resources; instructor can create/edit private drafts but cannot publish or change published content. Users can request only on their own user ID and see only their own request; progress is self-scoped.
- Public official announcements are empty before genuine posts exist. No fabricated recruiting dates or instructor names. An inactive LMS will **not claim requests or server progress are saved**; isolated local-only checkmarks remain usable.

## Database deployment sequence (MANDATORY)
1. Development Supabase project migration `20261016010000_education_online_campus_rls.sql` was applied and verified separately in DEV only (3 RLS-enabled tables, 11 policies, role RPC).
2. Retain `EDUCATION_LMS_ENABLED` unset/false in Education Worker until a both reviewed production database migrations have been applied through an approved, protected process and read-only production role/RLS checks have passed. Worker exposes `lmsEnabled:false` by default; UI does not attempt speculative REST requests.
3. Activate the flag **only after** authentic production migration evidence, granted role setup, `anon` published-read checks, anonymous write denial, authenticated own-user isolation, instructor no-publish, admin publish and enrollment review are all green. No direct SQL or cloud release bypass.
4. The public Education Worker release is separate from Site Core canonical /edu routing; preserve original protected release and Chromium desktop/mobile acceptance, strict CSP, auth, privacy, rollback.

## Role bootstrap
The role lookup reads **server-maintained** `public.site_access_registry` active membership: site_key `admin` + `platform_admin` grants `admin`; site_key `edu` + `tenant_admin|store_owner|store_staff` grants `instructor`. Do not make roles from `user_metadata`, UI input or a client-side email allowlist. Use official Admin OS authorization for capability management and audits. The migration does not seed new privileged user IDs.

## Coverage
`node --test test/education-platform.test.mjs test/education-integrated-campus.test.mjs test/education-material-studio.test.mjs` plus existing full repository CI, shell/security guard, dev staging, protected merge and EKODI-owned real Chromium at 320/390/768/1366/1440. Live admin mutation acceptance requires a linked owner test account and production RLS/flags, not just an anonymous screenshot. Do not call end-to-end deployment successful before real evidence.
