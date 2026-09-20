# EKODI Non-Disruptive Remote Execution

## Goal

EKODI remote work must not make the enrolled computer unusable for the person sitting at it. The normal user desktop, mouse, keyboard, clipboard and ordinary browser profile remain user-owned foreground resources.

## Routing order

1. Official/provider API when the task can be completed without a local UI.
2. A verified background browser worker using a dedicated EKODI automation profile.
3. A verified isolated desktop session such as a secondary Windows session, VM or sandbox.
4. Foreground takeover only as an explicit privileged exception with local consent. It is never an automatic fallback.

## Background browser contract

A background browser is eligible only when all of the following are true:

- it is online and verified;
- it uses a dedicated automation profile rather than the user's active browser profile;
- rendering is headless or otherwise off-screen;
- window/input focus is isolated from the user's foreground session;
- clipboard sharing is disabled by default;
- synthetic input is not injected into the user's desktop;
- task-scoped authorization and audit are preserved.

The user's active Chrome/Edge/Opera profile must never be concurrently controlled by EKODI automation.

## Isolated desktop contract

A GUI task that cannot run in a background browser may use only a verified secondary Windows session, VM or sandbox. A window that is merely minimized on the same interactive desktop is not isolation and is not sufficient.

## Foreground takeover

CAPTCHA, hardware-backed authentication, OS consent UI or another task that truly requires the user's interactive desktop must stop at the privileged gate. EKODI may request a short takeover, but must not silently move the mouse, type, change tabs or steal focus while the user is working.

## Current rollout

The provider contract exposes `computer.browser.execute` and `computer.desktop.session.execute`, but the Windows Device Agent must advertise the corresponding capabilities only after a real background worker or isolated session executor passes canary verification. Until then, those operations fail closed.

Production activation requires heartbeat, lease, receipt, recovery and audit evidence on an approved desktop canary.