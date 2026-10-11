# Google Workspace Google Slides audio insertion — EKODI native pilot

Tracking: [issue #4097](https://github.com/topmaster-joseph/ekodi-platform/issues/4097)

This is not a generic Google-browser bypass. The only mutating task type is
`computer.workspace.slides.audio.insert`, with a single hard-coded, previously
approved **42-slide original**, eight named MP3 Drive IDs, and exact slide
object IDs. The general `computer.browser.execute` remains EKODI-origin only.

## Scope

- Existing deck: https://docs.google.com/presentation/d/1wJhndsrFK7GrwnJsmWMvarivlNCfgTE97RGQTRJ3CfI/edit
- Target slides: 22, 23, 24 (sermon titles), 38–42 (Lord's Prayer)
- Original MP3s: `/Google Drive/EKODI/02_CHURCH/261011_주일예배_오디오`
- No duplicate presentations, auth bypass, foreground takeover, shared clipboard, arbitrary Google Workspace mutation, direct GitHub deployment, or password/token forwarding.

## Runtime gate

Cloud:
1. Only authenticated `super_admin` + `confirmed:true` may enqueue.
2. Payload must equal `{pilotId:"261011-ekodi-sunday-service-8-mp3",presentationId:"1wJhndsrFK7GrwnJsmWMvarivlNCfgTE97RGQTRJ3CfI",operation:"insert-native-audio"}`. No URL, path, user ID, third-party URL, or user-selected file ID is accepted. Server expands the full fixed eight-file plan.
3. Strict one-shot: any prior submission (even failed/partial) blocks an automatic second attempt until all eight slides are reviewed. No active parallel task and `maxAttempts=1`.
4. The queue requires Agent capability `workspaceSlidesAudio:true`. An ordinary online/browser-canary node does NOT qualify.
5. A job cannot be marked completed by a link-only result, an incomplete set or an unverifiable native audio playback receipt.

Windows Agent:
1. Install the approved runtime release tree, *preserving repository-relative module paths*, under `%ProgramData%\EKODI\GoogleWorkspace\`:
   - `google-workspace-slides-audio-policy.js`
   - `package.json` with `{"type":"module"}`
   - `tools/ekodi-device-agent/windows/google-workspace-slides-audio.mjs`
2. Node.js + local `playwright` must be provisioned and Microsoft Edge installed. **No automatic npm installs or external subscriptions from unattended jobs.** For a locally verified, officially released repo checkout, the controlled bootstrap is `tools/ekodi-device-agent/windows/install-google-workspace-audio-runtime.ps1 -RepositoryRoot <approved checkout> -Apply`; without `-Apply` it is a read-only preflight. Installation never logs in or creates consent.
3. Provision a completely **dedicated** automation browser profile at `%ProgramData%\EKODI\GoogleWorkspace\automation-profile`. It must not be the active Chrome/Edge/Opera user profile or have an active process sharing it.
4. An authorized human must explicitly consent to an *isolated automation profile* and authenticate in it. No passwords, cookie exports, token URLs, clipboard scraping or unattended login. Use separately reviewed local-consent session bootstrap tooling; if absent, leave the job blocked.
5. Human consent is recorded locally in `consent.json` with the exact `pilotId`, `presentationId`, `operatorConsented:true`, `dedicatedProfileVerified:true`, and a future `expiresAt` no more than 7 days ahead. This file is a prerequisite, **not** authentication itself.
6. Run the same worker in **headless canary** mode from an approved isolated context:
   ```powershell
   $env:EKODI_WORKSPACE_AUTOMATION_PROFILE = "$env:ProgramData\EKODI\GoogleWorkspace\automation-profile"
   $env:EKODI_WORKSPACE_CONSENT_FILE = "$env:ProgramData\EKODI\GoogleWorkspace\consent.json"
   $env:EKODI_WORKSPACE_CANARY_FILE = "$env:ProgramData\EKODI\GoogleWorkspace\canary.json"
   $env:EKODI_AGENT_VERSION = "2.5.3"
   node "$env:ProgramData\EKODI\GoogleWorkspace\tools\ekodi-device-agent\windows\google-workspace-slides-audio.mjs" --canary
   ```
7. Agent advertises `workspaceSlidesAudio:true` only with a fresh (24 hours) matching local canary, intact runtime files, dedicated profile, consent and Node runtime. Session/Google permissions are never distributed via EKODI cloud logs.
8. The headless edit worker attempts Google Slides' native **Insert > Audio** for exactly each mapped file and requires the slide-native audio UI and advancing media playback. Unrecognized picker/accessibility UI or missing media proof fails closed; it is **not** a success receipt.

## To submit after canary + central deploy
The authenticated super-admin sends:
```json
{
  "taskType":"computer.workspace.slides.audio.insert",
  "confirmed":true,
  "maxAttempts":1,
  "payload":{
    "pilotId":"261011-ekodi-sunday-service-8-mp3",
    "presentationId":"1wJhndsrFK7GrwnJsmWMvarivlNCfgTE97RGQTRJ3CfI",
    "operation":"insert-native-audio"
  }
}
```
to `POST https://ekodi.kr/api/control/hybrid-execution/jobs`, after reviewing any existing pending tasks. Do **not** enqueue until a verified, eligible node is online. A returned job ID is not completion. Require proof receipt for 8/8; review Google Slides UI personally.

## Release status
This implementation is a **candidate** until CI, Orchestrator task provenance, protected merge, staged canary, authenticated Windows dedicated browser and the actual editable Google Slides UI all pass. The deployment must not lower EKODI's general external-URL or authentication boundaries. Playwright's accessible menu selectors may need localized UI calibration in isolated staging before live mutation.

## 2026-10-11 formal Orchestrator release handoff

- Source: PR #4106, owner-approved exact commit `6c1194005f117e37adefc2a72ae55b8f52e5fac9`.
- EKODI-issued task: `orch_recovery_6c1194005f117e37adefc2a72ae55b8f`.
- Orchestrator-owned branch: `ai/gworkspace/orch_recovery_6c1194005f117e37adefc2a72ae55b8f`.
- Protected recovery PR: #4122; official server release receipt returned `authorized:true`, `authority:ekodi-orchestrator`.
- All required CI and Control API staging checks passed on original recovered commit. The recovery lane must still run strict base sync and all checks on the new head before merging.
- Do not mark native audio complete without a local authenticated Windows canary and 8/8 real embedded audio playback evidence. Desktop Commander remote quota is currently exhausted, and no authorized local browser session has been verified.
