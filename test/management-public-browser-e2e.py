#!/usr/bin/env python3
"""Anonymous, read-only EKODI Management browser acceptance.

Runs exclusively in a fresh, isolated CI Chromium context. No user's Opera,
cookies, credentials, saved profiles, financial mutations, or secret files.
Authenticated owner/staff acceptance remains a separate evidence requirement.
"""

from __future__ import annotations

import sys
from playwright.sync_api import sync_playwright

BASE = "https://ekodi.kr/management/"
VIEWPORTS = (320, 390, 768, 1366, 1440)
MAX_HORIZONTAL_OVERFLOW_PX = 4


def ensure(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def check_public_viewport(browser, width: int) -> None:
    context = browser.new_context(
        viewport={"width": width, "height": 850},
        device_scale_factor=1,
        locale="ko-KR",
        color_scheme="light",
        accept_downloads=False,
        service_workers="block",
    )
    page = context.new_page()
    try:
        response = page.goto(BASE, wait_until="domcontentloaded", timeout=25000)
        ensure(response is not None and response.status == 200,
               f"{width}px: canonical page did not return HTTP 200")
        ensure(page.url.startswith(BASE), f"{width}px: unexpected canonical path")
        page.locator("#publicModuleGrid .module-card").first.wait_for(
            state="visible", timeout=20000
        )
        ensure("에코디경영" in page.title(), f"{width}px: official brand missing")
        ensure(page.locator(".topbar .brand").is_visible(),
               f"{width}px: management brand is not visible")
        ensure(page.locator("#guestGuide").is_visible(),
               f"{width}px: public entry hidden")
        ensure(page.locator("#memberApp").is_hidden(),
               f"{width}px: private member workbench exposed to guest")
        count = page.locator("#publicModuleGrid .module-card").count()
        ensure(count >= 4, f"{width}px: public specialist catalog incomplete")
        cta = page.locator(".cta-row .button").get_attribute("href") or ""
        ensure("https://ekodi.kr/auth/" in cta and "site=management" in cta,
               f"{width}px: canonical authentication return missing")
        metrics = page.evaluate("""() => ({
            viewport: window.innerWidth,
            html: document.documentElement.scrollWidth,
            body: document.body.scrollWidth,
            columns: getComputedStyle(document.querySelector('#publicModuleGrid'))
                .gridTemplateColumns.split(' ').filter(Boolean).length,
            memberVisible: getComputedStyle(document.querySelector('#memberApp'))
                .display !== 'none'
        })""")
        overflow = max(metrics["html"], metrics["body"]) - metrics["viewport"]
        ensure(overflow <= MAX_HORIZONTAL_OVERFLOW_PX,
               f"{width}px: horizontal document overflow {overflow}px")
        ensure(not metrics["memberVisible"],
               f"{width}px: hidden member panel is displayed")
        ensure(metrics["columns"] == 1 if width < 600 else True,
               f"{width}px: small-screen specialist cards do not reflow")
        ensure(metrics["columns"] >= 2 if width >= 768 else True,
               f"{width}px: mid/large specialist grid did not reflow")
        print(f"PASS anonymous browser {width}px: {count} modules, "
              f"{metrics['columns']} columns, overflow={overflow}px")
    finally:
        page.close()
        context.close()


def check_guest_api_wall(browser) -> None:
    context = browser.new_context(accept_downloads=False, service_workers="block")
    try:
        for endpoint in (
            "api/spaces",
            "api/store-summary?slug=jadam",
            "api/store-business-summary?slug=jadam",
        ):
            response = context.request.get(BASE + endpoint, timeout=15000)
            ensure(response.status == 401,
                   f"guest private GET {endpoint}: expected 401, got {response.status}")
            payload = response.json()
            ensure(isinstance(payload, dict) and payload.get("error"),
                   f"guest private GET {endpoint}: no structured access-denied error")
            ensure("orders" not in payload and "sales" not in payload,
                   f"guest private GET {endpoint}: financial projection exposed")
            print(f"PASS anonymous API 401: {endpoint}")
    finally:
        context.close()


def main() -> int:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        try:
            for width in VIEWPORTS:
                check_public_viewport(browser, width)
            check_guest_api_wall(browser)
        finally:
            browser.close()
    print("PASS: public/mobile + guest API checks only; authenticated E2E NOT VERIFIED")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        print(f"FAIL management isolated public browser: {exc}", file=sys.stderr)
        sys.exit(1)
