# SOSIK unified ministry news · release handoff
2026-11-03 | implementation agent chatgpt | release owner EKODI Orchestrator.

## Routes
- https://ekodi.kr/sosik/ : approved public news and scoped subscriber opt-in.
- https://ekodi.kr/sosik/admin/ : owner editor and publisher approval.
- https://ekodi.kr/sosik/unsubscribe/ : explicit one-click confirmation.
- API: /api/sosik/* on existing Control API. Existing DB (D1), private LIVE_RECORDINGS_BUCKET (R2), Supabase Auth, Core AI Gateway and Gmail test-sending credentials.
- Approved feeds embedded into church homepage and mission stories page; joint news is shared while recipient rosters remain separated.

## Release sequence
1. PR CI + orchestrator governance authorization first. Agent cannot directly merge or deploy.
2. Apply additive 202611032335_sosik_unified_ministry_news.sql to staging D1 before staging Control API, preserving all existing church reporting tables.
3. Stage Control API and private R2 binding, shared-site pages, and independent church/mission site updates.
4. Test real staged input -> select -> draft -> owner approval -> public feed -> single-recipient test email. Capture actual mobile, desktop, login-return and unsubscribe screenshots. Verify no sensitive photo ever escapes consent checks.
5. Only orchestrator-generated recovery branch may promote to production. Repeat full production UI and Gmail delivery verification, and archive screenshot and delivery IDs.
6. First external or bulk recipient mailing, FAN web submission, and any paid service require separate human approval. No authorization in this PR.

## Privacy
- Activity: church/mission/joint. Recipient roster: church/mission separate.
- Foreign ministry photo or identifiable text defaults supporter-only. Public publication requires publicConsent and explicit publish action. External agency with people present also needs distinct externalConsent.
- All browser-uploaded photos are re-encoded to strip EXIF/GPS. Optional entire-image blur is not face detection. Original private R2 files have no public listing.
- Web opt-in stays pending until checked consent evidence is verified; CSV import requires consent date and source. All single-owner test mail has a unsubscribe link.
- Approved draft immutable; before sending recheck every source and reject changed/revoked consent; duplicate send by same selected source fingerprint blocked.
- Church: 307-82-82097 donation receipt possible where lawful. Mission: 120-82-72255 receipt unavailable. No mixed notices.
- FAN verified KWMA page: https://kwma.org/%ED%9A%8C%EC%9B%90/?mod=document&uid=28 ; phone 032-811-2256. Web portal / reporting form / reporting cadence are still "확인필요".

## Explicitly incomplete before production claims
- Full automated audience-specific mailing is intentionally not enabled; existing Channel Service Bridge only authorizes devotional_daily and scoped product_short, not ministry_news. Requires proper new delegation and human first-bulk approval before extension.
- Excel / Google Sheets files must first be exported as CSV; direct XLSX upload and live Google Sheets sync not yet implemented.
- Client Word DOCX is generated; PDF is browser Print -> Save to PDF, not a server-generated binary PDF.
- Missionfund ZIP saves numbered photos in their original output format (JPEG/PNG/WebP) plus an editable prayer-letter DOCX. Not all images are converted to .jpg.
- Fan submission remains manual until verifiable official portal/form/cadence and explicit human consent.
- Public opt-in form needs platform rate-limit/Turnstile hardening before broad promotion.
- No actual staging, Gmail delivery, external submission, deployment, or production screenshot should be called complete without real evidence.

## Checks
node --test test/sosik-unified-news.test.mjs test/sosik-api-integration.test.mjs
node scripts/validate-additive-migrations.mjs
node scripts/validate-deployment-guardrails.mjs
npm run build
git diff --check
