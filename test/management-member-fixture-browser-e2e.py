#!/usr/bin/env python3
"""Isolated browser fixture checks for EKODI Management member UX.

This is NOT a real authenticated production test. All session identity, membership
and API responses are synthetic, restricted to a loopback-only server. Neither
production credentials nor financial/customer records are accessed or mutated.
"""

from __future__ import annotations

import json
import sys
import threading
import time
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
WIDTHS = (320, 390, 768, 1366, 1440)
WORKSPACE = {
    "id": "fixture-space-1",
    "slug": "fixture-safe-store",
    "name": "격리 시험 공간",
    "role": "store_owner",
    "kind": "store",
    "status": "active",
}


class FixtureState:
    def __init__(self):
        self.role = "store_owner"
        self.revoke = False
        self.fail_next = False
        self.hold_next = False
        self.request_started = threading.Event()
        self.release = threading.Event()
        self.requests = []

    def reset(self, role="store_owner"):
        self.role = role
        self.revoke = False
        self.fail_next = False
        self.hold_next = False
        self.request_started.clear()
        self.release.set()
        self.requests.clear()


@contextmanager
def loopback_server(fixture):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            # Never print fake token headers or any user data.
            return

        def reply(self, status, body, content_type="application/json; charset=utf-8"):
            payload = body if isinstance(body, bytes) else json.dumps(body, ensure_ascii=False).encode()
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def do_POST(self):
            self.reply(405, {"error": "fixture_read_only"})

        def do_GET(self):
            path = urlparse(self.path).path
            if path == "/":
                return self.reply(200, (ROOT / "management/index.html").read_bytes(), "text/html; charset=utf-8")
            if path == "/styles.css":
                return self.reply(200, (ROOT / "management/styles.css").read_bytes(), "text/css; charset=utf-8")
            if path == "/app.js":
                return self.reply(200, (ROOT / "management/app.js").read_bytes(), "application/javascript; charset=utf-8")
            if path == "/config.js":
                return self.reply(200, b"window.EKODI_MANAGEMENT_CONFIG={};", "application/javascript")
            if path == "/api/catalog":
                return self.reply(200, {"modules": [
                    {"id": "chief", "name": "경영비서 AI", "state": "foundation"},
                    {"id": "marketing", "name": "마케팅 AI", "state": "foundation"},
                    {"id": "growth", "name": "AI 성장·홍보 관리", "state": "foundation"},
                ]})
            if path.startswith("/api/"):
                fixture.requests.append(path)
                if self.headers.get("Authorization") != "Bearer isolated-fixture-token":
                    return self.reply(401, {"error": "unauthorized"})
                if path == "/api/spaces":
                    if fixture.hold_next:
                        fixture.hold_next = False
                        fixture.request_started.set()
                        fixture.release.wait(timeout=8)
                    if fixture.fail_next:
                        fixture.fail_next = False
                        return self.reply(503, {"error": "fixture_unavailable"})
                    spaces = [] if fixture.revoke else [{**WORKSPACE, "role": fixture.role}]
                    return self.reply(200, {"spaces": spaces, "scope": "authenticated-member-only"})
                # No fixture financial endpoints are implemented: never provide fake
                # sales or customer records to the UI.
                return self.reply(403, {"error": "fixture_no_financial_data"})
            return self.reply(404, {"error": "not_found"})

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    server.daemon_threads = True
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}/"
    finally:
        fixture.release.set()
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


def check(condition, message):
    if not condition:
        raise AssertionError(message)


def new_fixture_page(browser, base, width):
    context = browser.new_context(
        viewport={"width": width, "height": 850},
        locale="ko-KR",
        service_workers="block",
        accept_downloads=False,
    )
    # Session is a local test fixture only. No production login or token.
    session = json.dumps({
        "accessToken": "isolated-fixture-token",
        "refreshToken": "isolated-fixture-refresh",
        "expiresAt": int(time.time()) + 3600,
        "user": {"id": "fixture-member", "email": "very-long-verified-fixture-member-address-1234567890@example.invalid"},
    })
    context.add_init_script(f"sessionStorage.setItem('ekodi-management-session', {json.dumps(session)});")
    page = context.new_page()

    def local_only(route):
        url = route.request.url
        if url.startswith(base):
            route.continue_()
        else:
            route.abort()

    page.route("**/*", local_only)
    response = page.goto(base, wait_until="domcontentloaded", timeout=20000)
    check(response is not None and response.status == 200, f"{width}px: loopback fixture failed")
    page.locator("#verifiedSpacesList .verified-space").first.wait_for(timeout=15000)
    return context, page


def choose_and_enable_growth(page):
    page.locator("#verifiedSpacesList .space-select").first.click()
    check("격리 시험 공간" in page.locator("#workbenchScope").inner_text(), "verified fixture selection missing")
    page.locator("#viewAi").click()
    page.locator("#memberModuleGrid input[value='growth']").check()
    page.locator("#saveSelection").click()
    page.locator("#viewGrowth").click()
    check(page.locator("#growthWorkspaceDetails").locator("dl").count() > 0, "growth guidance unavailable")


def check_viewports(browser, base, fixture):
    for width in WIDTHS:
        fixture.reset()
        context, page = new_fixture_page(browser, base, width)
        try:
            check(page.locator("#memberApp").is_visible(), f"{width}px: member workbench not visible")
            check("에코디 회원" in page.locator("#memberMeta").inner_text(), "unverified plan label")
            check(page.locator("#verifiedSpacesList .verified-space").count() == 1, "not one verified space")
            metrics = page.evaluate("""() => ({
                overflow: Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth,
                tabs: Array.from(document.querySelectorAll('#managementViewNav [role=tab]'))
                  .map(el=>({visible:el.getBoundingClientRect().width>0,
                    left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right}))
            })""")
            check(metrics["overflow"] <= 4, f"{width}px: horizontal overflow {metrics['overflow']}")
            check(len(metrics["tabs"]) == 4 and all(t["visible"] and t["left"] >= -1 and t["right"] <= width + 1
                for t in metrics["tabs"]), f"{width}px: four workbench tabs overflow")
            choose_and_enable_growth(page)
            check(page.locator("#growthWorkspaceDetails").get_by_text("공식 완료 주문·매출 조회").count() == 1,
                  "owner financial read control missing")
            page.locator("#viewSpaces").click()
            page.locator("#viewSpaces").focus()
            page.keyboard.press("ArrowRight")
            check(page.locator("#viewAi").get_attribute("aria-selected") == "true",
                  f"{width}px: keyboard navigation not accessible")
            print(f"PASS isolated member fixture {width}px: verified scope, tabs, no horizontal overflow")
        finally:
            context.close()


def check_role_and_refresh(browser, base, fixture):
    fixture.reset()
    context, page = new_fixture_page(browser, base, 390)
    try:
        choose_and_enable_growth(page)
        check(page.locator("#growthWorkspaceDetails").get_by_text("공식 완료 주문·매출 조회").count() == 1,
              "owner control initially missing")
        fixture.role = "store_staff"
        fixture.hold_next = True
        fixture.request_started.clear()
        fixture.release.clear()
        page.locator("#viewSpaces").click()
        page.locator("#refreshSpaces").click()
        check(fixture.request_started.wait(timeout=8), "delayed recheck did not reach fixture server")
        check(page.locator("#growthWorkspaceDetails").locator("dl").count() == 0,
              "previous tenant growth details remained visible during recheck")
        check("재확인 중" in page.locator("#workbenchScope").inner_text(), "pending scope not announced")
        fixture.release.set()
        page.wait_for_function("document.querySelector('#spacesStatus').textContent.includes('확인 완료')",
                               timeout=12000)
        check("미선택" in page.locator("#workbenchScope").inner_text(),
              "role downgrade reselected previous owner scope")
        page.locator("#verifiedSpacesList .space-select").first.click()
        page.locator("#viewGrowth").click()
        check(page.locator("#growthWorkspaceDetails").get_by_text("공식 완료 주문·매출 조회").count() == 0,
              "store staff can see owner-only financial control")
        print("PASS isolated member fixture: pending sensitive-view clearing and owner-to-staff downgrade")
        page.locator("#logoutButton").click()
        check(page.locator("#memberApp").is_hidden(), "logout retained workbench")
        check(page.evaluate("sessionStorage.getItem('ekodi-management-session')") is None,
              "logout retained fixture session")
        print("PASS isolated member fixture: logout clears member session")
    finally:
        fixture.release.set()
        context.close()


def main():
    fixture = FixtureState()
    with loopback_server(fixture) as base:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(
                headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"]
            )
            try:
                check_viewports(browser, base, fixture)
                check_role_and_refresh(browser, base, fixture)
            finally:
                browser.close()
    print("PASS isolated synthetic member fixtures; real production authentication remains NOT VERIFIED")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"FAIL management isolated member fixture: {exc}", file=sys.stderr)
        sys.exit(1)
