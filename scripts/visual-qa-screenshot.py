#!/usr/bin/env python3
"""
scripts/visual-qa-screenshot.py

Takes screenshots of each screen in the HTML prototype for Monday Beta Visual QA.
Opens docs/ui/matterhorn-customer-ux-refresh/index.html in Playwright,
navigates to each screen via the nav, scrolls to it, and captures a screenshot.

Screenshots are saved to docs/ui/screenshots/ (relative to repo root).
Run from the repo root.
"""

import os
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

REPO_ROOT = Path(__file__).parent.parent.resolve()
HTML_PATH = REPO_ROOT / "docs/ui/matterhorn-customer-ux-refresh/index.html"
OUT_DIR   = REPO_ROOT / "docs/ui/screenshots"
OUT_DIR.mkdir(parents=True, exist_ok=True)

SCREENS = [
    {"id": "screen-1",  "label": "welcome",                  "viewports": ["desktop", "tablet", "mobile"]},
    {"id": "screen-2",  "label": "create-workspace-modal",   "viewports": ["desktop"]},
    {"id": "screen-3",  "label": "session-hub",             "viewports": ["desktop"]},
    {"id": "screen-4",  "label": "bittensor-desk",           "viewports": ["desktop", "tablet", "mobile"]},
    {"id": "screen-5",  "label": "hyperliquid-desk",          "viewports": ["desktop", "tablet", "mobile"]},
    {"id": "screen-6",  "label": "polymarket-desk",          "viewports": ["desktop", "tablet", "mobile"]},
    {"id": "screen-7",  "label": "wellness-desk",            "viewports": ["desktop", "tablet", "mobile"]},
    {"id": "screen-8",  "label": "services",                 "viewports": ["desktop"]},
    {"id": "screen-9",  "label": "chat-composer",             "viewports": ["desktop"]},
    {"id": "screen-10", "label": "error-states",             "viewports": ["desktop"]},
    {"id": "screen-11", "label": "order-preview-panel",       "viewports": ["desktop"]},
    {"id": "screen-12", "label": "external-signer-handoff",  "viewports": ["desktop"]},
    {"id": "screen-13", "label": "receipt-verified",         "viewports": ["desktop"]},
    {"id": "screen-14", "label": "safety-strip-amber",       "viewports": ["desktop"]},
    {"id": "screen-15", "label": "safety-strip-blue",       "viewports": ["desktop"]},
    {"id": "screen-16", "label": "safety-strip-green",      "viewports": ["desktop"]},
]

VIEWPORTS = {
    "desktop": {"width": 1440, "height": 900},
    "tablet":  {"width": 768,  "height": 1024},
    "mobile":  {"width": 390,  "height": 844},
}

def run():
    url = f"file://{HTML_PATH}"
    print(f"\nOpening: {url}\n")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        for screen in SCREENS:
            for vp_name in screen["viewports"]:
                vp = VIEWPORTS[vp_name]
                filename = f"{screen['label']}--{vp_name}.png"
                out_path = OUT_DIR / filename

                context = browser.new_context(viewport={"width": vp["width"], "height": vp["height"]})
                page = context.new_page()

                page.goto(url, wait_until="domcontentloaded")
                page.wait_for_timeout(600)  # let CSS render

                # Click nav link for this screen
                try:
                    nav_link = page.locator(f'a[href="#{screen["id"]}"]').first
                    if nav_link.count() > 0:
                        nav_link.click()
                        page.wait_for_timeout(300)
                except Exception:
                    pass

                # Locate the screen block
                screen_el = page.locator(f'#{screen["id"]}')
                if screen_el.count() == 0:
                    print(f"  [SKIP] {screen['id']} — element not found")
                    page.close()
                    context.close()
                    continue

                screen_el.scroll_into_view_if_needed()
                page.wait_for_timeout(200)

                box = screen_el.bounding_box()
                if box:
                    # Clip: capture from above the element (for header context)
                    clip_x = 0
                    clip_y = max(0.0, box["y"] - 60.0)
                    clip_h = min(box["height"] + 80.0, float(vp["height"]))
                    page.screenshot(
                        path=str(out_path),
                        clip={"x": clip_x, "y": clip_y, "width": float(vp["width"]), "height": clip_h},
                    )
                else:
                    page.screenshot(path=str(out_path))

                print(f"  [OK]   {filename}")
                page.close()
                context.close()

        browser.close()

    print(f"\nScreenshots saved to: {OUT_DIR}")

if __name__ == "__main__":
    run()
