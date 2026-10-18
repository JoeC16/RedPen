import { expect, test, type Browser } from "@playwright/test";
import { IDS, signIn } from "./helpers";

// Acceptance for build step 5: dashboards from real rows with small groups
// hidden, the settings behind them, a teacher deleting work early, and
// deleting everything for a school with two different admins.

async function as(browser: Browser, who: Parameters<typeof signIn>[1]) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, who);
  return { page, close: () => context.close() };
}

test("a teacher approves work, deletes it early, and the marks stay", async ({ page }) => {
  await signIn(page, "northgateTeacher1");
  await page.goto(`/assignments/${IDS.assignmentNorthgateSci}`);
  await page.getByRole("row").filter({ hasText: "NG9S06" }).getByRole("link", { name: "NG9S06" }).click();

  // With no work yet, the typed-work editor starts open.
  await page.getByRole("textbox", { name: "Pupil work" }).fill("Chloroplast. Carbon dioxide and water.");
  await page.getByRole("button", { name: "Save work" }).click();
  await expect(page.getByRole("region", { name: "Pupil work" }).getByText("Chloroplast. Carbon dioxide and water.")).toBeVisible();
  for (const [i, label] of ["Q1", "Q2", "Q3", "Q4", "Q5"].entries()) {
    await page.getByLabel(new RegExp(`^${label}`)).first().fill(i === 0 ? "1" : "0");
  }
  await page.getByLabel("Feedback to the pupil").fill("Good start on Q1.");
  await page.getByRole("button", { name: /^Approve NG9S06/ }).click();
  await page.goto(`/assignments/${IDS.assignmentNorthgateSci}`);
  await page.getByRole("row").filter({ hasText: "NG9S06" }).getByRole("link", { name: "NG9S06" }).click();
  await expect(page.getByText(/will be deleted on/)).toBeVisible();

  await page.getByText("Delete this pupil's work now").click();
  await page.getByRole("button", { name: "Delete work" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Tick the box" })).toBeVisible();
  await page.getByLabel("I understand this permanently deletes the work.").check();
  await page.getByRole("button", { name: "Delete work" }).click();

  await expect(page.getByRole("note").filter({ hasText: "were deleted on" })).toContainText("The approved marks are kept");
  await expect(page.getByText(/Approved by .*: 1 \/ 8/)).toBeVisible();
  await expect(page.getByText("Chloroplast. Carbon dioxide and water.")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reopen marks" })).toHaveCount(0);
});

test("admins see dashboards built from aggregates, with small groups hidden", async ({ page, browser }) => {
  // The school admin sees their school only.
  const admin = await as(browser, "northgateAdmin");
  await admin.page.getByRole("link", { name: "Dashboard" }).first().click();
  await expect(admin.page.getByRole("heading", { level: 1, name: "Northgate High School dashboard" })).toBeVisible();
  await expect(admin.page.getByText("fewer than 5").first()).toBeVisible();
  await expect(admin.page.getByRole("table", { name: /Agreement by work type/ })).toBeVisible();
  await admin.close();

  // The authority admin sees every school, then changes the time-saved assumption.
  await signIn(page, "authorityAdmin");
  await page.getByRole("link", { name: "Dashboard" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Authority dashboard" })).toBeVisible();
  const bySchool = page.getByRole("table", { name: "Figures for each school" });
  for (const name of ["Northgate High School", "Riverside College", "Hillcrest Academy"]) {
    await expect(bySchool.getByRole("link", { name })).toBeVisible();
  }
  await page.getByLabel("Period", { exact: true }).selectOption("13w");
  await page.getByRole("button", { name: "Show" }).click();
  await expect(page).toHaveURL(/period=13w/);
  await expect(page.getByRole("table", { name: /Active teachers and approvals per week, all schools/ }).getByRole("row")).toHaveCount(14);

  await page.getByRole("link", { name: "Change the minutes per script" }).click();
  await page.getByLabel("Essays").fill("12");
  await page.getByRole("button", { name: "Save minutes" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
  await page.getByLabel("Delete pupil work this many days after approval").fill("21");
  await page.getByRole("button", { name: "Save retention" }).click();
  await expect(page.getByRole("status").filter({ hasText: "deleted 21 days after approval" })).toBeVisible();

  await page.goto("/dashboard");
  await expect(page.getByRole("table", { name: "Agreement by work type" }).getByRole("row").filter({ hasText: "Essay" })).toContainText("12");
  await page.goto("/audit?action=settings.");
  await expect(page.getByRole("cell", { name: "settings.retention_changed" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "settings.time_saved_changed" })).toBeVisible();
});

test("deleting everything for a school takes two different admins", async ({ browser }) => {
  const first = await as(browser, "hillcrestAdmin");
  await first.page.getByRole("link", { name: "School data" }).click();
  await expect(first.page.getByRole("heading", { level: 1 })).toContainText("Hillcrest Academy: data and deletion");
  await first.page.getByLabel(/Type the school's name/).fill("Hillcrest");
  await first.page.getByRole("button", { name: "Request deletion" }).click();
  await expect(first.page.getByRole("alert").filter({ hasText: "Type the school's name exactly" })).toBeVisible();
  await first.page.getByLabel(/Type the school's name/).fill("Hillcrest Academy");
  await first.page.getByRole("button", { name: "Request deletion" }).click();
  await expect(first.page.getByRole("status").filter({ hasText: "Deletion requested" })).toContainText("by you");
  // The requester cannot confirm their own request.
  await expect(first.page.getByRole("button", { name: "Confirm and delete everything" })).toHaveCount(0);
  await first.close();

  const second = await as(browser, "authorityAdmin");
  await second.page.goto("/data");
  await second.page.getByRole("row").filter({ hasText: "Hillcrest Academy" }).getByRole("link", { name: "Data and deletion" }).click();
  await expect(second.page.getByRole("status").filter({ hasText: "Deletion requested" })).toContainText("Robin Achebe");
  await second.page.getByLabel(/Type the school's name/).fill("Hillcrest Academy");
  await second.page.getByRole("button", { name: "Confirm and delete everything" }).click();
  await expect(second.page.getByRole("status").filter({ hasText: "Deleted" }).first()).toBeVisible();
  await second.page.goto(`/audit?action=school.`);
  await expect(second.page.getByRole("cell", { name: "school.data_deleted" })).toBeVisible();
  await expect(second.page.getByRole("cell", { name: "school.deletion_requested" })).toBeVisible();
  await second.close();
});
