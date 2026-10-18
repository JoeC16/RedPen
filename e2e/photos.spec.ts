import { expect, test, type Page } from "@playwright/test";
import { EMAILS, IDS, signIn } from "./helpers";

// Acceptance for build step 4: upload photos (bulk, matched by pupil code),
// confirm names are cropped, mark from photos, and see the transcription next
// to the photo. Uses real JPEGs drawn in the browser, one with GPS metadata.

async function makeJpeg(page: Page, text: string): Promise<Buffer> {
  const dataUrl = await page.evaluate((t) => {
    const c = document.createElement("canvas");
    c.width = 400;
    c.height = 300;
    const g = c.getContext("2d")!;
    g.fillStyle = "#fff";
    g.fillRect(0, 0, 400, 300);
    g.fillStyle = "#000";
    g.font = "28px sans-serif";
    g.fillText(t, 20, 150);
    return c.toDataURL("image/jpeg", 0.8);
  }, text);
  return Buffer.from(dataUrl.split(",")[1]!, "base64");
}

/** Insert an EXIF segment with a GPS marker straight after the JPEG start. */
function withGps(jpeg: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from("Exif\0\0MM\0*\0\0\0\x08\0\0", "binary"), Buffer.from("GPS 54.5973N 5.9301W")]);
  const head = Buffer.from([0xff, 0xe1, 0, 0]);
  head.writeUInt16BE(body.length + 2, 2);
  return Buffer.concat([jpeg.subarray(0, 2), head, body, jpeg.subarray(2)]);
}

test("a teacher bulk-uploads photos by pupil code, marks from them and checks the transcription", async ({ page, browser }) => {
  await signIn(page, "northgateTeacher1");
  await page.goto(`/assignments/${IDS.assignmentNorthgateSci}/photos`);
  const p1 = withGps(await makeJpeg(page, "Q1 chloroplast"));
  const p2 = await makeJpeg(page, "Q2 CO2 + water");

  await page.getByLabel("Photos (file names start with the pupil code)").setInputFiles([
    { name: "NG9S04.jpg", mimeType: "image/jpeg", buffer: p1 },
    { name: "NG9S04-2.jpg", mimeType: "image/jpeg", buffer: p2 },
    { name: "IMG_2041.jpg", mimeType: "image/jpeg", buffer: p2 },
  ]);
  await page.getByRole("button", { name: "Upload photos" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "confirm pupil names are cropped out" })).toBeVisible();

  await page.getByLabel(/I confirm pupil names are cropped out/).check();
  await page.getByRole("button", { name: "Upload photos" }).click();
  const status = page.getByRole("status").filter({ hasText: "uploaded" });
  await expect(status).toContainText("2 of 3 uploaded.");
  await expect(status).toContainText("NG9S04.jpg → NG9S04, page 1");
  await expect(status).toContainText("NG9S04-2.jpg → NG9S04, page 2");
  await expect(status).toContainText("Not uploaded: IMG_2041.jpg (IMG_2041.jpg: the file name does not start with a pupil code");

  // The queue shows the photos as the pupil's work.
  await page.goto(`/assignments/${IDS.assignmentNorthgateSci}`);
  const row = page.getByRole("row").filter({ hasText: "NG9S04" });
  await expect(row).toContainText("2 photos");
  await row.getByRole("link", { name: "NG9S04" }).click();

  // Both photos display (so stripping the GPS data left a valid JPEG).
  const imgs = page.getByRole("img", { name: /Page \d of NG9S04's work/ });
  await expect(imgs).toHaveCount(2);
  for (const img of await imgs.all()) {
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBe(400);
  }

  // The served file has no GPS data.
  const src = (await imgs.first().getAttribute("src"))!;
  const served = await page.request.get(src);
  expect(served.status()).toBe(200);
  expect(served.headers()["content-type"]).toBe("image/jpeg");
  expect((await served.body()).toString("binary")).not.toContain("GPS");

  // Mark from the photos; the transcription appears next to them.
  await page.getByRole("button", { name: "Mark with AI" }).click();
  await expect(page.getByRole("heading", { name: "AI transcription" })).toBeVisible();
  await expect(page.getByText(/the 2 photos were not read/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("region", { name: "AI suggestion" })).toContainText("photos are not read in demo mode");

  // A signed link is personal: the school admin cannot use the teacher's link.
  const other = await browser.newContext();
  const adminPage = await other.newPage();
  await adminPage.goto("/login");
  await adminPage.getByLabel("Email").fill(EMAILS.northgateAdmin);
  await adminPage.getByLabel("Password").fill("redpen-demo-2026");
  await adminPage.getByRole("button", { name: "Sign in" }).click();
  await adminPage.waitForURL("/");
  expect((await adminPage.request.get(src)).status()).toBe(403);
  // A colleague signed out of the app cannot use it either.
  const anon = await browser.newContext();
  expect((await anon.request.get(new URL(src, page.url()).toString())).status()).toBe(401);
  await other.close();
  await anon.close();

  // Removing a page.
  await page.getByRole("button", { name: "Remove page 2" }).click();
  await expect(imgs).toHaveCount(1);
  // The transcription was made from two photos, so the teacher is told it may be out of date.
  await expect(page.getByRole("note").filter({ hasText: "The photos have changed since the AI read them" })).toBeVisible();
});
