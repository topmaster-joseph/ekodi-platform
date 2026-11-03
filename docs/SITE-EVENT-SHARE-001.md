# SITE-EVENT-SHARE-001 — Public event and activity invitation copy

Status: rollout contract; service-by-service deployment and real-host proof required.
Scope: public *events and activities* shared by published EKODI-owned and customer sites. This does not replace products, transaction/referral links, protected or private-by-link participant data.

## User-visible format

```text
{단체명} {행사·활동명} {공개된 행동}
YYYY-MM-DD (요일)
https://ekodi.kr/<site-specific-public-application-deep-link>
```

Example, from a canonical Mission Saturday meeting date and existing RSVP route:

```text
에코디선교회 토요모임 신청하기
2026-11-07 (토)
https://ekodi.kr/ekodimission?meeting=2026-11-07#saturday
```

- Line 1: organization or site display name, activity/event title, and *accurate action* separated by one space. Do not repeat the organization if the source title already includes it.
- Line 2: actual **event date** in Korean weekday format; omit the entire line when an event date is absent or invalid. Never substitute a post creation, review, publication or update timestamp for the event date.
- Last line: exactly one **public canonical deep link**, preserved from the owning service. Maintain event ID, meeting date, fragment, referral attribution and route as appropriate; never add access tokens, personal identifiers or admin state to public links.
- Only actual registration flows may say **신청하기**; other events say **일정 보기** and informational activities say **자세히 보기**, or a service-appropriate truthful equivalent.
- Both Web Share and clipboard fallback use the same three-line message. Pass `navigator.share({text:message})` (without redundant `title`/`url`) where exact messenger copy is the product requirement; OS clients may nevertheless format shared text differently.
- The page's share control remains accessible to guests for public events; authorization is not needed for a link to public content.

## Current implementation scope

1. `space/ekodimission-shell.js`: current Saturday RSVP with the exact `?meeting=YYYY-MM-DD#saturday` URL and activity archive/detail share buttons; changed UI/clipboard copy.
2. `space/ekodimission.js`: existing application-detail `data-share-event` button uses same invitation formatting.
3. `sites/seonammedi/public/calendar-sidebar.js`: public event calendar share and copy, preserving `?schedule={id}&date={day}` and host-specific path.
4. `sites/seonammedi/public/app.js`: public committee activity and timeline/related-news item share copy; no fabricated application CTA.

Sites including EKODI Church, CGMA/청계잇다, Community, Education, event registration, groups and other services are **not** implied to have completed the same UI integration. Each should apply the same display contract using its existing first-party public URL; no shared cross-tenant write API or public auth change is required.

## Deployment and evidence

- Follow EKODI governance: isolated branch → source contract/unit tests → protected PR → orchestration and platform-specific release gates → production host check.
- Run `node --test test/event-share-message-standard.test.mjs test/ekodimission-site.test.mjs test/seonammedi-sidebar-calendar.test.mjs test/seonammedi-calendar-share-native.test.mjs test/seonammedi-item-share-inline-admin-20261019.test.mjs test/ekodimission-share-detail.test.mjs`.
- Verify production text payload and deep link from each owning site. For Seonam Medi the existing Chromium read-only network fixture checks desktop and mobile on `ekodi.kr` and `seonammedi.kr`; it does not prove a real OS share sheet or genuine published-event record.
- Mark a service fully adopted only after protected deploy and actual public UI share/copy and destination verification. Keep its prior share flow until then.
