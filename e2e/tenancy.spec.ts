import { expect, test } from "@playwright/test";
import { IDS, signIn } from "./helpers";

test("a teacher cannot open another school's class by URL or API", async ({ page }) => {
  await signIn(page, "northgateTeacher1");
  await page.goto(`/classes/${IDS.classRiversideSci}`);
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  for (const path of [`/api/classes/${IDS.classRiversideSci}`, `/api/classes/${IDS.classRiversideSci}/pupils`, `/api/schools/${IDS.schoolRiverside}`]) {
    const res = await page.request.get(path);
    expect(res.status(), path).toBe(404);
  }
  const classes = await (await page.request.get("/api/classes")).text();
  expect(classes).not.toContain(IDS.classRiversideSci);
  expect((await page.request.get("/api/audit")).status()).toBe(403);
  await page.goto("/audit");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
});

test("a teacher cannot open a colleague's class in the same school", async ({ page }) => {
  await signIn(page, "northgateTeacher2");
  await page.goto(`/classes/${IDS.classNorthgateSci}`);
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
});

test("a school admin sees all their school's classes, codes only, and the school audit log", async ({ page }) => {
  await signIn(page, "northgateAdmin");
  await page.goto("/classes");
  const classes = page.getByRole("table", { name: "Classes" });
  for (const name of ["9S1", "10M2", "8E3"]) await expect(classes.getByRole("link", { name, exact: true })).toBeVisible();
  await expect(classes).not.toContainText("9X"); // Riverside's class
  await page.getByRole("link", { name: "8E3" }).click();
  await expect(page.getByRole("columnheader", { name: "Name" })).toHaveCount(0);
  await expect(page.getByText(/Pupil names are visible to the class teachers only/)).toBeVisible();

  await page.goto("/audit");
  const log = page.getByRole("table", { name: /Audit events/ });
  await expect(log.getByRole("cell", { name: "auth.login", exact: true }).first()).toBeVisible();
  await expect(log.getByRole("cell", { name: "Riverside College" })).toHaveCount(0);

  await page.getByLabel("Action starts with").fill("auth.login_failed");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page).toHaveURL(/action=auth.login_failed/);
  await expect(log.getByRole("cell", { name: "auth.login", exact: true })).toHaveCount(0);
});

test("an authority admin sees schools and the authority audit log but no classes or pupils", async ({ page }) => {
  await signIn(page, "authorityAdmin");
  await page.goto("/schools");
  const schools = page.getByRole("table", { name: "Schools in your authority" });
  await expect(schools.getByRole("row")).toHaveCount(4);
  await expect(schools).not.toContainText("Other Authority School");
  await page.goto("/classes");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await page.goto(`/classes/${IDS.classNorthgateSci}`);
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  expect((await page.request.get(`/api/classes/${IDS.classNorthgateSci}/pupils`)).status()).toBe(403);
  await page.goto("/audit");
  await expect(page.getByText("All schools in your authority.")).toBeVisible();
});

test("cross-site writes to the API are rejected", async ({ request }) => {
  const res = await request.post("/api/classes", { headers: { origin: "https://evil.example" }, data: {} });
  expect(res.status()).toBe(403);
});
