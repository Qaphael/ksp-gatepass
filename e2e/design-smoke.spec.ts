import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const credentials = {
  admin: { identifier: "admin", password: "AdminTest!Pass1234", landing: "/dashboard" },
  seller: { identifier: "seller", password: "SellerTest!Pass1234", landing: "/dashboard" },
  verifier: { identifier: "verifier", password: "VerifierTest!Pass1234", landing: "/dashboard" },
  supervisor: { identifier: "supervisor", password: "SupervisorTest!Pass1234", landing: "/dashboard" },
} as const;

const viewports = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
];

const routes: Record<keyof typeof credentials, string[]> = {
  admin: ["/dashboard", "/sales", "/tickets", "/events"],
  seller: ["/sales/new", "/sales", "/tickets"],
  verifier: ["/scanner", "/check-in/manual", "/check-in/recent"],
  supervisor: ["/dashboard", "/scanner", "/check-in/attempts", "/reports"],
};

async function signIn(page: Page, role: keyof typeof credentials) {
  await page.goto("/login");
  await page.getByLabel("Username or email").fill(credentials[role].identifier);
  await page.getByLabel("Password", { exact: true }).fill(credentials[role].password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(new RegExp(`${credentials[role].landing.replaceAll("/", "\\/")}$`));
  await expect(page.getByRole("main").first().locator("[aria-busy='true']")).toHaveCount(0, { timeout: 30_000 });
}

async function expectPageReady(page: Page) {
  const main = page.getByRole("main").first();
  await expect(main).toBeVisible();
  await expect(main.locator("[aria-busy='true']")).toHaveCount(0, { timeout: 30_000 });
}

function summarizeViolations(violations: Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"]) {
  return violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    targets: violation.nodes.map((node) => node.target.join(" ")),
  }));
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
    offenders: [...document.querySelectorAll("body *")]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && (rect.left < -1 || rect.right > document.documentElement.clientWidth + 1);
      })
      .slice(0, 5)
      .map((element) => ({ tag: element.tagName, className: (element as HTMLElement).className, left: Math.round(element.getBoundingClientRect().left), right: Math.round(element.getBoundingClientRect().right) })),
  }));
  expect(overflow.scroll > overflow.viewport + 1, `horizontal overflow at ${page.url()}: ${JSON.stringify(overflow)}`).toBe(false);
}

test.describe("role landing responsive smoke and axe", () => {
  for (const role of Object.keys(credentials) as Array<keyof typeof credentials>) {
    test(`${role} signs in and fits all design widths`, async ({ page }) => {
      await signIn(page, role);
      await expectPageReady(page);

      for (const viewport of viewports) {
        await page.setViewportSize(viewport);
        await expectNoHorizontalOverflow(page);
        const accessibility = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          .analyze();
        expect(summarizeViolations(accessibility.violations), `${role} at ${viewport.width}px`).toEqual([]);

        const screenshotDirectory = path.join(process.cwd(), "test-results", "design-audit");
        await mkdir(screenshotDirectory, { recursive: true });
        await page.screenshot({
          path: path.join(screenshotDirectory, `${role}-${viewport.width}x${viewport.height}.png`),
          fullPage: true,
        });
      }

      // A 180 CSS-pixel viewport approximates 200% browser zoom at a 360 px device width.
      await page.setViewportSize({ width: 180, height: 400 });
      await expectNoHorizontalOverflow(page);
    });

    test(`${role} can reach the main role screens without horizontal overflow`, async ({ page }) => {
      await signIn(page, role);
      for (const route of routes[role]) {
        await page.goto(route);
        await expectPageReady(page);
        for (const width of [360, 1280]) {
          await page.setViewportSize({ width, height: width === 360 ? 800 : 800 });
          await expectNoHorizontalOverflow(page);
          if (width === 360 || route === routes[role][0]) {
            const accessibility = await new AxeBuilder({ page })
              .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
              .analyze();
            expect(summarizeViolations(accessibility.violations), `${role} ${route} at ${width}px`).toEqual([]);
          }
        }
      }
    });
  }
});

test("login supports visible keyboard focus and reduced motion", async ({ page }) => {
  await page.goto("/login");
  await page.keyboard.press("Tab");
  const focusVisible = await page.evaluate(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return false;
    const style = getComputedStyle(active);
    return active.matches(":focus-visible") &&
      (style.outlineStyle !== "none" || style.boxShadow !== "none");
  });
  expect(focusVisible).toBe(true);

  await page.emulateMedia({ reducedMotion: "reduce" });
  const reducedMotionApplied = await page.evaluate(() => {
    const button = document.querySelector("button");
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
      (!button || Number.parseFloat(getComputedStyle(button).transitionDuration) <= 0.001);
  });
  expect(reducedMotionApplied).toBe(true);
});

test("scanner stays lazy and reports layout shift on throttled mobile", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
  const page = await context.newPage();
  await signIn(page, "verifier");
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
    connectionType: "cellular3g",
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.addInitScript(() => {
    (window as Window & { __designCls?: number }).__designCls = 0;
    (window as Window & { __designShiftSources?: string[] }).__designShiftSources = [];
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as Array<PerformanceEntry & { value: number; hadRecentInput: boolean }>) {
        if (!entry.hadRecentInput) {
          (window as Window & { __designCls?: number }).__designCls! += entry.value;
          const shift = entry as PerformanceEntry & { sources?: Array<{ node?: Node | null }> };
          (window as Window & { __designShiftSources?: string[] }).__designShiftSources!.push(
            ...(shift.sources ?? []).map(({ node }) => node instanceof Element
              ? `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ""}.${[...node.classList].slice(0, 3).join(".")}`
              : "unknown"),
          );
        }
      }
    });
    observer.observe({ type: "layout-shift", buffered: true });
  });

  const started = Date.now();
  await page.goto("/scanner", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("main").first()).toBeVisible();
  await page.waitForTimeout(1500);
  const metrics = await page.evaluate(() => ({
    navigationMs: Math.round(performance.getEntriesByType("navigation")[0]?.duration ?? 0),
    cls: Number(((window as Window & { __designCls?: number }).__designCls ?? 0).toFixed(4)),
    imageCount: document.images.length,
    imagesMissingDimensions: [...document.images].filter((image) => !image.hasAttribute("width") && !image.hasAttribute("height")).length,
    zxingLoaded: performance.getEntriesByType("resource").some((entry) => /zxing/i.test(entry.name)),
    shiftSources: (window as Window & { __designShiftSources?: string[] }).__designShiftSources ?? [],
  }));
  console.log(JSON.stringify({ throttledScanner: { ...metrics, elapsedMs: Date.now() - started } }));
  expect(metrics.zxingLoaded).toBe(false);
  expect(metrics.imagesMissingDimensions).toBe(0);
  expect(metrics.cls).toBeLessThanOrEqual(0.1);
  await context.close();
});
