import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { IDS, signIn } from "./helpers";

// Automated WCAG 2.2 A and AA checks (axe) on every main page, for each role,
// in the light and dark themes. Automated checks find roughly a third of
// problems; they do not replace testing with a screen reader.

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function check(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const summary = violations.map((v) => `${v.id} (${v.impact}): ${v.help}\n    ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join("\n    ")}`);
  expect(summary, `${path}\n${summary.join("\n")}`).toEqual([]);
}

test("public pages", async ({ page }) => {
  for (const p of ["/login", "/trust", "/trust/documents/dpia", "/trust/documents/data-sheet", "/trust/documents/accessibility"]) await check(page, p);
});

test("teacher pages", async ({ page }) => {
  await signIn(page, "northgateTeacher1");
  const a = `/assignments/${IDS.assignmentNorthgateSci}`;
  for (const p of ["/", "/classes", `/classes/${IDS.classNorthgateSci}`, `/classes/${IDS.classNorthgateSci}/import`, `/classes/${IDS.classNorthgateSci}/assignments/new`, "/classes/new", a, `${a}/work`, `${a}/photos`, `${a}/edit`]) {
    await check(page, p);
  }
  await page.goto(a);
  await page.getByRole("link", { name: "NG9S05" }).click();
  await check(page, page.url().replace(/^https?:\/\/[^/]+/, ""));
});

test("school admin pages", async ({ page }) => {
  await signIn(page, "northgateAdmin");
  for (const p of ["/", "/dashboard", "/classes", "/audit", "/data", `/assignments/${IDS.assignmentNorthgateSci}`]) await check(page, p);
});

test("authority admin pages", async ({ page }) => {
  await signIn(page, "authorityAdmin");
  for (const p of ["/", "/dashboard", `/dashboard?school=${IDS.schoolNorthgate}`, "/schools", "/audit", "/data", `/data?school=${IDS.schoolHillcrest}`, "/settings"]) await check(page, p);
});

// On a narrow screen tables scroll sideways, which must work by keyboard. Run
// at phone width so this does not depend on how much data a page happens to have.
test.describe("narrow screens", () => {
  test.use({ viewport: { width: 400, height: 800 } });

  test("tables and forms at phone width", async ({ page }) => {
    await signIn(page, "authorityAdmin");
    for (const p of ["/audit", "/dashboard", "/schools", "/settings", "/trust/documents/dpia"]) await check(page, p);
    await page.goto("/");
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await signIn(page, "northgateTeacher1");
    for (const p of ["/classes", `/assignments/${IDS.assignmentNorthgateSci}`]) await check(page, p);
  });
});
