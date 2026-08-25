# EKODI Google Drive Storage

## Operating rule

- Code: GitHub
- Runtime: Cloudflare Workers / Pages
- Core metadata: D1 `ekodi-auth`
- Service relational data: Supabase where the platform boundary says so
- Originals, documents, media and long-term archive: Google Drive
- Web-serving copies and durable backup copies: Cloudflare R2 when needed

## Drive roles

`primary` is the EKODI organization Drive. Production defaults to the allowed domains `ekodi.kr,ekodibiz.kr`. Only one active primary connection exists at a time.

`secondary` connections are optional Google accounts. They can be attached for partner, legacy or overflow material without replacing the primary organization archive.

Refresh tokens are never committed to GitHub. `ekodi-storage-control` encrypts them with AES-GCM before D1 persistence. `STORAGE_CREDENTIAL_KEY` must be stored only as a Cloudflare Worker secret.

## Canonical archive

After the primary Drive is connected and selected, Admin → Storage can create:

- `EKODI/01_CORE`
- `EKODI/02_CHURCH`
- `EKODI/03_BIZ`
- `EKODI/04_BOOKS`
- `EKODI/05_COMMUNITY`
- `EKODI/06_WORK`
- `EKODI/07_EDUCATION`
- `EKODI/08_MEDIA`
- `EKODI/09_CAMP`
- `EKODI/99_BACKUP`

The folder IDs are recorded in D1 so services refer to IDs rather than brittle human paths.

## Required Google Cloud settings

Enable Google Drive API for the Google Cloud project that owns the OAuth web client. Add this authorized redirect URI exactly:

`https://drive.ekodi.kr/api/control/storage/google/callback`

The runtime requests `openid`, `email`, `profile`, `drive.file`, and `drive.metadata.readonly`. Shared Drives are supported with `supportsAllDrives=true`.

Cloudflare Worker secrets required on `ekodi-storage-control`:

- `GOOGLE_DRIVE_CLIENT_SECRET`
- `STORAGE_CREDENTIAL_KEY` (stable random key; never rotate without a credential re-encryption plan)

`GOOGLE_DRIVE_CLIENT_ID` and the primary-domain allowlist are non-secret Worker vars in `wrangler.storage.toml`.

## Connection flow

1. Admin → Storage → **EKODI 기본 Drive 연결**.
2. Sign in with the EKODI Workspace account.
3. Choose My Drive or an accessible Shared Drive.
4. Run **EKODI 폴더 구축** once.
5. Use **다른 Google 계정 추가** for any optional secondary account.

Disconnecting a connection removes its encrypted credential from active use but never deletes Google Drive files.
