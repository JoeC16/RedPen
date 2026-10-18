import { expect, test, type Page } from "@playwright/test";
import { IDS, signIn } from "./helpers";

// Acceptance for build step 2: a teacher marks a class by hand, end to end.
test("a teacher sets up a class and marks it by hand, end to end", async ({ page }) => {
  await signIn(page, "northgateTeacher1");

  // 1. Create a class and import pupils.
  await page.goto("/classes");
  await page.getByRole("link", { name: "New class" }).click();
  await page.getByLabel("Class name").fill("E2E 9Z");
  await page.getByLabel("Year group").selectOption("9");
  await page.getByLabel("Subject").fill("Science");
  await page.getByRole("button", { name: "Create class" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "E2E 9Z" })).toBeVisible();

  await page.getByRole("link", { name: "Import pupils" }).click();
  await page.getByLabel("Or paste the class list").fill("code,name\nE2E01,Ivy Example\nE2E02,\nE2E03,Rowan Sample");
  await page.getByRole("button", { name: "Import pupils" }).click();
  await expect(page.getByRole("status")).toContainText("Imported 3 pupils");
  await expect(page.getByRole("cell", { name: "Ivy Example" })).toBeVisible();

  // 2. Create an assignment; the form refuses lines that do not add up.
  await page.getByRole("link", { name: "New assignment" }).click();
  await page.getByLabel("Title").fill("Cells quiz");
  await page.getByLabel("Questions and mark scheme").fill("Q1 Where does photosynthesis happen? (1) Chloroplast\nQ2 Two plant-only structures (2)");
  await page.getByLabel("Total marks").fill("3");
  await page.getByLabel("Line 1 max marks").fill("1");
  await page.getByRole("button", { name: "Add line" }).click();
  await page.getByLabel("Line 2 max marks").fill("1");
  await expect(page.getByText("Lines add up to 2 of 3 (must match the total)")).toBeVisible();
  await page.getByRole("button", { name: "Create assignment" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "add up to 2, but the total is 3" })).toBeVisible();
  await page.getByLabel("Line 2 max marks").fill("2");
  await page.getByRole("button", { name: "Create assignment" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Cells quiz" })).toBeVisible();
  const assignmentUrl = page.url();

  // 3. Add typed work for two pupils at once.
  await page.getByRole("link", { name: "Add typed work" }).click();
  await page.getByLabel("E2E01 · Ivy Example").fill("Chloroplast\nCell wall and vacuole");
  await page.getByLabel("E2E02").fill("=HYPERLINK(\"x\") Mitochondria\nCell wall");
  await page.getByRole("button", { name: "Save work" }).click();
  await expect(page.getByRole("status")).toContainText("Saved work for 2 pupils");

  // 4. Mark the first pupil and approve; the app moves on to the next.
  await page.getByRole("link", { name: "Mark next pupil" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("E2E01");
  await expect(page.getByText("Draft. Not final until you approve it.")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Approve/ })).toBeDisabled();
  await page.getByLabel(/Q1/).first().fill("1");
  await page.getByLabel(/^Q2/).fill("2");
  await expect(page.getByText("Total: 3 / 3")).toBeVisible();
  await page.getByLabel("Feedback to the pupil").fill("Both structures correct. Next: explain why plants need light.");
  await page.getByRole("button", { name: "Approve E2E01 and go to next" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Approved" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("E2E02");

  // 5. Save a draft for the second, then approve with a half mark.
  await page.getByLabel(/Q1/).first().fill("0");
  await page.getByLabel(/^Q2/).fill("1.5");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Draft saved. Not yet approved." })).toBeVisible();
  await page.getByRole("button", { name: "Approve E2E02 and go to next" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("E2E03");

  // 6. The third pupil was absent.
  await page.getByRole("button", { name: "Mark absent" }).click();
  await expect(page.getByText("Marked absent for this assignment.")).toBeVisible();

  // 7. The queue shows everyone, and the export has approved marks only.
  await page.goto(assignmentUrl);
  await expect(page.getByText("2 of 3 approved, 1 absent.")).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Export approved marks (CSV)" }).click();
  const csv = await readDownload(await download);
  expect(csv).toContain("E2E01,Ivy Example,approved,1,2,3,");
  expect(csv).toContain("E2E02,,approved,0,1.5,1.5,");
  expect(csv).toContain("E2E03,Rowan Sample,absent,,,,");

  // 8. Reopen an approved mark with a reason; it is logged.
  await page.getByRole("link", { name: "E2E01" }).click();
  await expect(page.getByText(/Approved by Aoife Byrne .*: 3 \/ 3. Marks are locked./)).toBeVisible();
  await expect(page.getByLabel(/^Q2/)).toBeDisabled();
  await page.getByLabel(/Reason for reopening/).fill("Pupil query about Q2");
  await page.getByRole("button", { name: "Reopen marks" }).click();
  await expect(page.getByText("Draft. Not final until you approve it.")).toBeVisible();
  await expect(page.getByLabel(/^Q2/)).toBeEnabled();
  await expect(page.getByText(/reopened .*: Pupil query about Q2/)).toBeVisible();

  // 9. Feedback sheets: one printable page per approved pupil.
  await page.goto(assignmentUrl);
  await page.getByRole("link", { name: "Feedback sheets (PDF)" }).click();
  await expect(page.getByRole("button", { name: "Print or save as PDF" })).toBeVisible();
  const sheets = page.getByRole("article");
  await expect(sheets).toHaveCount(1); // E2E01 was reopened, so only E2E02 is approved now
  await expect(sheets.first()).toContainText("E2E02");
  await expect(sheets.first()).toContainText("Total");
  await expect(sheets.first()).toContainText("1.5 / 3");
  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("button", { name: "Sign out" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Print or save as PDF" })).toBeHidden();
  await page.emulateMedia({ media: "screen" });
});

async function readDownload(d: import("@playwright/test").Download): Promise<string> {
  const stream = await d.createReadStream();
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function expectNotFound(page: Page, path: string) {
  await page.goto(path);
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
}

test("marking pages are closed to colleagues and other schools; writing pages to the school admin", async ({ page }) => {
  // Four sign-ins and twenty page loads: allow for a busy CI machine.
  test.setTimeout(90_000);
  const writePaths = [
    `/assignments/${IDS.assignmentNorthgateSci}/work`,
    `/assignments/${IDS.assignmentNorthgateSci}/edit`,
    `/assignments/${IDS.assignmentNorthgateSci}/feedback`,
    `/classes/${IDS.classNorthgateSci}/assignments/new`,
  ];
  const paths = [`/assignments/${IDS.assignmentNorthgateSci}`, ...writePaths];
  for (const who of ["northgateTeacher2", "riversideTeacher", "riversideAdmin", "northgateAdmin"] as const) {
    await signIn(page, who);
    for (const p of who === "northgateAdmin" ? writePaths : paths) await expectNotFound(page, p);
    const res = await page.request.get(`/api/assignments/${IDS.assignmentNorthgateSci}/export`);
    expect([403, 404]).toContain(res.status());
    await page.goto("/");
    await page.getByRole("button", { name: "Sign out" }).click();
  }
});

test("the school admin reads work and marks without names or controls, and the viewing is audited", async ({ page }) => {
  await signIn(page, "northgateAdmin");
  await page.goto("/classes");
  await page.getByRole("link", { name: "E2E 9Z" }).click();
  await page.getByRole("link", { name: "Cells quiz" }).click();
  await expect(page.getByText(/Read-only view/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Mark next pupil" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Export/ })).toHaveCount(0);
  await expect(page.getByRole("columnheader", { name: "Name" })).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("Ivy Example");

  await page.getByRole("link", { name: "E2E02" }).click();
  await expect(page.getByText("Mitochondria")).toBeVisible();
  await expect(page.getByLabel(/^Q2/)).toBeDisabled();
  await expect(page.getByRole("button", { name: "Reopen marks" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Mark absent/ })).toHaveCount(0);

  await page.goto("/audit?action=submission.");
  await expect(page.getByRole("cell", { name: "submission.approved", exact: true }).first()).toBeVisible();
  await expect(page.getByRole("cell", { name: "submission.reopened", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "submission.viewed", exact: true }).first()).toBeVisible();
});
