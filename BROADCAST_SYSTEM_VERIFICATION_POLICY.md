# EKODI Broadcast System Verification Policy

Status: mandatory ecosystem-wide broadcast contract  
Scope: every EKODI live/broadcast surface, tenant, site, service, provider, and future broadcast implementation.

## Mandatory completion rule

Broadcast work MUST NOT depend on a broadcaster, applicant, participant, operator, or administrator manually testing the flow before normal completion.

The default release path is:

`implementation -> CI -> staging synthetic E2E -> guarded deploy -> production synthetic canary -> System Verified -> completion`

Human/device verification is additive evidence, not a normal release blocker.

## Required synthetic actors

Every broadcast implementation MUST provide equivalent automated verification using:

- Virtual Broadcaster
- Virtual Participant / Viewer
- synthetic camera video, including portrait 9:16 and landscape fixtures
- synthetic microphone/reference audio
- synthetic screen/application/tab share sources where the runtime supports them
- representative presentation/file fixtures
- a second independent receiving session that verifies the actual delivered WebRTC/media result

A test that only clicks controls or checks DOM state is insufficient when the feature changes delivered media.

## Required assertions

System verification MUST check, as applicable:

- camera acquisition and program composition
- portrait/mobile field-of-view preservation and unintended crop regression
- microphone/audio track delivery
- screen, application-window, and browser-tab sharing
- presentation/file selection and the defined fallback for formats the browser cannot render directly
- PIP, 70:30, 1:1, shared-screen-only and any later registered layouts
- source add/remove and return-to-camera flow
- broadcaster-to-viewer media delivery, not only broadcaster preview
- black/frozen frame detection and expected frame progression
- WebRTC connection/track state
- broadcast start, share replacement/restart, and clean end
- relevant API, Worker, browser, media and quota errors
- production canary evidence against the real deployed surface

Representative file fixtures SHOULD include PDF, PPT/PPTX, HWP/HWPX, DOC/DOCX, XLS/XLSX, images, video, and audio. “All file types” means the selector may accept arbitrary files; it does not imply that every browser can natively render every format. Unsupported native rendering MUST have a verified application/window-share or conversion fallback.

## Verification states

- `System Verified`: all required synthetic E2E and production canary checks pass. This is sufficient for normal operational completion.
- `Device Verified`: additional evidence from a physical device or real-world telemetry. This MUST NOT delay normal completion unless an exception below applies.
- `Verification Exception`: synthetic verification cannot faithfully cover a release-critical OS/hardware/security behavior, or production telemetry contradicts synthetic results.

## Blocking exceptions

Physical/manual verification may block completion only when the changed behavior is inherently device/OS/provider specific and cannot be meaningfully simulated, or when synthetic results conflict with production telemetry. Examples include camera-driver defects, OS permission UI behavior, hardware encoder defects, or provider restrictions outside browser control.

The exception MUST be explicit, narrowly scoped, auditable, and must not convert unrelated broadcast work back to manual verification.

## Enforcement

CI/release gates for every broadcast repository MUST treat this policy as inherited. New broadcast services MUST adopt the same contract without copying tenant-specific assumptions. A release may not claim `System Verified` from unit tests, build success, PR merge, or staging deployment alone.

If a synthetic capability is temporarily unavailable, the system MUST first seek an equivalent automated execution path. It MUST NOT silently downgrade to “ask the user to test it” as the default completion path.

Security, authorization, privacy, consent, audit boundaries, and production safeguards remain mandatory and MUST NOT be weakened to make synthetic verification easier.
