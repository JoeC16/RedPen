// The S3 driver against a real S3 API (Adobe S3Mock locally and in CI).
// Skipped unless S3_TEST_ENDPOINT is set.
import { describe, expect, it } from "vitest";
import { S3Storage } from "@/server/storage/s3";

const endpoint = process.env.S3_TEST_ENDPOINT;

describe.skipIf(!endpoint)("S3Storage", () => {
  const store = new S3Storage({
    bucket: process.env.S3_TEST_BUCKET ?? "redpen-test",
    region: "eu-west-2",
    endpoint,
    forcePathStyle: true,
    accessKeyId: "test",
    secretAccessKey: "test",
  });

  it("puts, gets and deletes an object", async () => {
    const key = `school/${crypto.randomUUID()}.jpg`;
    await store.put(key, Buffer.from("photo bytes"), "image/jpeg");
    expect((await store.get(key)).toString()).toBe("photo bytes");
    await store.delete(key);
    await expect(store.get(key)).rejects.toThrow();
  });
});
