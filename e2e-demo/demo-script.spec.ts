import { expect, test, type Browser, type Page } from "@playwright/test";
import { DEMO_PASSWORD, EMAILS } from "../scripts/lib/fixtures";

// Rehearses docs/demo-script.md step by step on the full demo dataset, so the
// demo cannot quietly break. If you change the script, change this too.

async function signIn(browser: Browser, email: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { level: 1, name: /Welcome/ })).toBeVisible();
  return page;
}

test.describe.configure({ mode: "serial" });

test("the 15-minute demo, start to finish", async ({ browser }) => {
  test.setTimeout(180_000);

  // Before the meeting: the live class waits, unmarked.
  const teacher = await signIn(browser, EMAILS.northgateTeacher1);
  await teacher.getByRole("link", { name: "My classes" }).click();
  await teacher.getByRole("link", { name: "10M1" }).click();
  await teacher.getByRole("link", { name: "Algebra and area" }).click();
  await expect(teacher.getByRole("heading", { level: 1, name: "Algebra and area" })).toBeVisible();
  await expect(teacher.getByText("Demo data", { exact: true })).toBeVisible();
  await expect(teacher.getByRole("note").filter({ hasText: "Demo mode" })).toBeVisible();
  const queue = teacher.url();

  // 2. The teacher marks the class.
  await teacher.getByRole("button", { name: "Run AI marking (30)" }).click();
  await expect(teacher.getByRole("status").filter({ hasText: "Marking 30 scripts" })).toBeVisible();
  await expect(async () => {
    await teacher.goto(queue);
    await expect(teacher.getByText("Draft marks", { exact: true })).toHaveCount(30, { timeout: 1000 });
  }).toPass({ timeout: 60_000 });
  // Doubt first: the first row is flagged.
  const first = teacher.getByRole("row").nth(1);
  await expect(first).toContainText("to check");
  await first.getByRole("link").first().click();
  const ai = teacher.getByRole("region", { name: "AI suggestion" });
  await expect(ai).toContainText("Check this point");
  await expect(teacher.getByText(/^Evidence:/).first()).toBeVisible();
  await expect(teacher.getByLabel("Feedback to the pupil (AI draft: edit before approving)")).not.toBeEmpty();
  await expect(teacher.getByRole("button", { name: /approve all/i })).toHaveCount(0);
  // Change a mark, edit the feedback, approve one pupil and move on.
  const q3 = teacher.getByLabel(/^Q3/).first();
  await q3.fill(String(Math.min(3, Number(await q3.inputValue()) + 1)));
  const fb = teacher.getByLabel("Feedback to the pupil (AI draft: edit before approving)");
  await fb.fill(`${await fb.inputValue()} Well done.`);
  const firstPupil = (await teacher.getByRole("heading", { level: 1 }).textContent())!;
  await teacher.getByRole("button", { name: /^Approve .* and go to next$/ }).click();
  await expect(teacher.getByRole("status").filter({ hasText: "Approved" })).toBeVisible();
  await expect(teacher.getByRole("heading", { level: 1 })).not.toHaveText(firstPupil);
  for (let i = 0; i < 2; i++) {
    const before = await teacher.getByRole("heading", { level: 1 }).textContent();
    await teacher.getByRole("button", { name: /^Approve .* and go to next$/ }).click();
    await expect(teacher.getByRole("heading", { level: 1 })).not.toHaveText(before!);
  }
  await teacher.goto(queue);
  await expect(teacher.getByText("Approved", { exact: true })).toHaveCount(3);
  const csv = await teacher.request.get(`${queue.replace("/assignments/", "/api/assignments/")}/export?kind=csv`);
  expect(csv.status()).toBe(200);
  // Every pupil is listed; only the three approved have marks.
  const lines = (await csv.text()).trim().split("\n");
  expect(lines).toHaveLength(31);
  expect(lines.filter((l) => l.split(",")[2] === "approved")).toHaveLength(3);

  // 3. The school leader.
  const leader = await signIn(browser, EMAILS.northgateAdmin);
  await leader.getByRole("link", { name: "Dashboard" }).first().click();
  await expect(leader.getByRole("heading", { level: 1, name: "Northgate High School dashboard" })).toBeVisible();
  const byType = leader.getByRole("table", { name: "Agreement by work type" });
  for (const t of ["Short answers", "Maths working", "Essay (feedback draft)"]) await expect(byType.getByRole("row").filter({ hasText: t })).not.toContainText("fewer than 5");
  await leader.goto("/audit?action=submission.");
  await expect(leader.getByRole("cell", { name: "submission.approved" }).first()).toBeVisible();
  await leader.goto("/audit?action=marking.");
  await expect(leader.getByRole("cell", { name: "marking.requested" }).first()).toBeVisible();

  // 4. The authority.
  const authority = await signIn(browser, EMAILS.authorityAdmin);
  await authority.getByRole("link", { name: "Dashboard" }).first().click();
  const schools = authority.getByRole("table", { name: "Figures for each school" });
  for (const name of ["Northgate High School", "Riverside College", "Hillcrest Academy"]) {
    await expect(schools.getByRole("row").filter({ hasText: name })).not.toContainText("fewer than 5");
  }
  const weeks = authority.getByRole("table", { name: "Active teachers and approvals per week, all schools" }).getByRole("row");
  await expect(weeks).toHaveCount(7);
  await authority.getByRole("link", { name: "Settings" }).click();
  await authority.getByLabel("Essays").fill("10");
  await authority.getByRole("button", { name: "Save minutes" }).click();
  await expect(authority.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
  await authority.getByLabel("Essays").fill("8");
  await authority.getByRole("button", { name: "Save minutes" }).click();
  await authority.goto("/audit?action=retention.");
  await expect(authority.getByRole("cell", { name: "retention.deleted" }).first()).toBeVisible();
  await authority.goto("/data");
  await expect(authority.getByRole("heading", { level: 1, name: "School data" })).toBeVisible();

  // 5. Trust.
  await authority.goto("/trust");
  await expect(authority.getByRole("heading", { level: 1, name: "Trust centre" })).toBeVisible();
  await expect(authority.getByRole("main")).toContainText("there is no UK or EU processing option");
});
