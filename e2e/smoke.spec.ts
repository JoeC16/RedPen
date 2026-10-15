import { expect, test } from "@playwright/test";
import { EMAILS, signIn } from "./helpers";

test("unauthenticated visitors are sent to sign in", async ({ page }) => {
  await page.goto("/classes");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Red Pen" })).toBeVisible();
});

test("a wrong password shows an accessible error", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAILS.riversideAdmin);
  await page.getByLabel("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "do not match" })).toBeVisible();
});

test("teacher signs in, sees their classes and pupil names, and signs out", async ({ page }) => {
  await signIn(page, "northgateTeacher1");
  await expect(page.getByText("Demo data")).toBeVisible();
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "My classes" }).click();
  const table = page.getByRole("table", { name: "Classes" });
  await expect(table.getByRole("row")).toHaveCount(3); // header + 2 classes
  await table.getByRole("link", { name: "9S1" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "9S1" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Name" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "NG9S01" })).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/classes");
  await expect(page).toHaveURL(/\/login$/);
});

test("keyboard users reach the skip link first", async ({ page }) => {
  await page.goto("/login");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
});
