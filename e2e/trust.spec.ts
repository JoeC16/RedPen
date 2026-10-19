import { expect, test } from "@playwright/test";
import { CLAIMS } from "../src/content/claims";
import { DOCUMENTS } from "../src/app/trust/doc-list";
import { signIn } from "./helpers";

// Acceptance for build step 6: a public trust centre and printable documents
// that state only checked claims, and say plainly what is not yet confirmed.
// (The retention period is matched as any number: another test changes it.)

const unconfirmed = CLAIMS.filter((c) => c.status === "unconfirmed");

test("the trust centre is public and states only confirmed claims", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("link", { name: /trust centre/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Trust centre" })).toBeVisible();
  const main = page.getByRole("main");

  // The honest answer on where the AI runs, and on demo mode.
  await expect(main).toContainText("there is no UK or EU processing option");
  await expect(main).toContainText("This installation is in demo mode");
  // Company details not yet decided are visible placeholders, not inventions.
  await expect(main.getByText("[To be confirmed: hosting provider]").first()).toBeVisible();
  // Open questions are listed as questions; their unconfirmed statements never appear.
  await expect(main.getByText("Still being checked").first()).toBeVisible();
  for (const c of unconfirmed) {
    await expect(main).toContainText(c.question!);
    await expect(main).not.toContainText(c.statement);
  }
  // Sources are linked.
  await expect(main.getByRole("link", { name: /Anthropic Commercial Terms of Service/ }).first()).toHaveAttribute("href", "https://www.anthropic.com/legal/commercial-terms");
});

test("every document renders, with blanks and placeholders, and no unconfirmed statements", async ({ page }) => {
  for (const d of DOCUMENTS) {
    const res = await page.goto(`/trust/documents/${d.slug}`);
    expect(res?.status(), d.slug).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: d.title })).toBeVisible();
    for (const c of unconfirmed) await expect(page.getByRole("main")).not.toContainText(c.statement);
  }
  await page.goto("/trust/documents/dpia");
  await expect(page.getByRole("note").filter({ hasText: "Template." })).toBeVisible();
  await expect(page.getByRole("table", { name: "Risks and measures" }).getByRole("row")).toHaveCount(11);
  expect((await page.goto("/trust/documents/nonsense"))?.status()).toBe(404);
});

test("a signed-in admin's documents are filled in with their authority's details", async ({ page }) => {
  await signIn(page, "authorityAdmin");
  await page.getByRole("link", { name: "Trust centre" }).click();
  await expect(page.getByRole("main")).toContainText(/Your authority deletes pupil work \d+ days after a teacher approves it\./);
  await page.getByRole("link", { name: "Data protection impact assessment (template)" }).click();
  await expect(page.getByRole("main")).toContainText("part of Demo Education Authority");
  await expect(page.getByRole("main")).toContainText(/\d+ days after approval \(the authority's setting\)/);
});
