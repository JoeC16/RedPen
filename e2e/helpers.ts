import { expect, type Page } from "@playwright/test";
import { DEMO_PASSWORD, EMAILS } from "../scripts/lib/fixtures";

export { EMAILS, IDS } from "../scripts/lib/fixtures";

export async function signIn(page: Page, who: keyof typeof EMAILS) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAILS[who]);
  await page.getByLabel("Password").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { level: 1, name: /Welcome/ })).toBeVisible();
}
