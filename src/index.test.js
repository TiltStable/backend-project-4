import { afterEach, beforeEach, expect, test, vi } from "vitest";
import nock from "nock";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promises as fs } from "node:fs";
import downloadPage, { nameFromUrl, nameFromResourceUrl } from "./index.js";

const ORIGIN = "https://ru.hexlet.io";
const PAGE_URL = `${ORIGIN}/courses`;
const PAGE_BODY =
  "<!DOCTYPE html><html><head><title>Hexlet: Courses</title></head><body><h1>Courses</h1></body></html>";

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "__fixtures__");
const loadFixture = (name) => fs.readFile(path.join(fixturesDir, name), "utf-8");

// 1x1 transparent PNG
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);
// minimal JPEG-shaped bytes (SOI ... EOI)
const JPG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x01, 0xff, 0xd9]);

let outputDir;

beforeEach(async () => {
  nock.disableNetConnect();
  outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "page-loader-"));
});

afterEach(() => {
  nock.cleanAll();
  vi.restoreAllMocks();
});

test("builds a file name from a url", () => {
  expect(nameFromUrl(PAGE_URL)).toBe("ru-hexlet-io-courses.html");
});

test("builds a file name from a url with dots, dashes and an anchor", () => {
  const url = "https://nodejs.org/dist/latest-v15.x/docs/api/url.html#url_url_protocol";

  expect(nameFromUrl(url)).toBe(
    "nodejs-org-dist-latest-v15-x-docs-api-url-html-url-url-protocol.html",
  );
});

test("downloads a page, saves it and returns the full file path", async () => {
  nock(ORIGIN).get("/courses").reply(200, PAGE_BODY);

  const filePath = await downloadPage(PAGE_URL, outputDir);

  expect(filePath).toBe(path.join(outputDir, "ru-hexlet-io-courses.html"));
  const saved = await fs.readFile(filePath, "utf-8");
  expect(saved).toBe(PAGE_BODY);
});

test("returns an absolute path", async () => {
  nock(ORIGIN).get("/courses").reply(200, PAGE_BODY);

  const filePath = await downloadPage(PAGE_URL, outputDir);

  expect(path.isAbsolute(filePath)).toBe(true);
});

test("saves into process.cwd() when no output dir is given", async () => {
  vi.spyOn(process, "cwd").mockReturnValue(outputDir);
  nock(ORIGIN).get("/courses").reply(200, PAGE_BODY);

  const filePath = await downloadPage(PAGE_URL);

  expect(filePath).toBe(path.join(outputDir, "ru-hexlet-io-courses.html"));
});

test("creates the output directory when it does not exist", async () => {
  const nestedDir = path.join(outputDir, "sub", "dir");
  nock(ORIGIN).get("/courses").reply(200, PAGE_BODY);

  const filePath = await downloadPage(PAGE_URL, nestedDir);

  const saved = await fs.readFile(filePath, "utf-8");
  expect(saved).toBe(PAGE_BODY);
});

test("rejects on an http error", async () => {
  nock(ORIGIN).get("/courses").reply(404, "Not Found");

  await expect(downloadPage(PAGE_URL, outputDir)).rejects.toThrow(
    "Request failed with status code 404",
  );
});

test("rejects (does not throw synchronously) on an invalid url", async () => {
  await expect(downloadPage("not-a-url", outputDir)).rejects.toThrow("Invalid URL");
});

test("rejects when the server does not respond in time", async () => {
  // connection accepted, response never sent
  nock(ORIGIN)
    .get("/courses")
    .reply(200, () => new Promise(() => {}));

  await expect(downloadPage(PAGE_URL, outputDir, { timeout: 100 })).rejects.toThrow(
    "timeout of 100ms exceeded",
  );
});

test("downloads images into a _files directory and rewrites the page html", async () => {
  const before = await loadFixture("courses-before.html");
  const after = await loadFixture("courses-after.html");
  nock(ORIGIN).get("/courses").reply(200, before);
  nock(ORIGIN).get("/assets/professions/nodejs.png").reply(200, PNG_BYTES);

  const filePath = await downloadPage(PAGE_URL, outputDir);

  const savedHtml = await fs.readFile(filePath, "utf-8");
  // cheerio (parse5) drops the whitespace between the doctype and <html>,
  // so both documents are compared through the same normalization
  // (the course hint explicitly accounts for this)
  const { load } = await import("cheerio");
  expect(load(savedHtml).html()).toBe(load(after).html());
  expect(savedHtml).toContain(
    'src="ru-hexlet-io-courses_files/ru-hexlet-io-assets-professions-nodejs.png"',
  );
  const imageBytes = await fs.readFile(
    path.join(
      outputDir,
      "ru-hexlet-io-courses_files",
      "ru-hexlet-io-assets-professions-nodejs.png",
    ),
  );
  expect(Buffer.compare(imageBytes, PNG_BYTES)).toBe(0);
});

test("downloads images from other origins naming them by their absolute url", async () => {
  const html =
    '<!DOCTYPE html><html><head></head><body><img src="https://cdn.example.com/img/logo.jpg" alt="logo"></body></html>';
  nock(ORIGIN).get("/courses").reply(200, html);
  nock("https://cdn.example.com").get("/img/logo.jpg").reply(200, JPG_BYTES);

  await downloadPage(PAGE_URL, outputDir);

  const imageBytes = await fs.readFile(
    path.join(outputDir, "ru-hexlet-io-courses_files", "cdn-example-com-img-logo.jpg"),
  );
  expect(Buffer.compare(imageBytes, JPG_BYTES)).toBe(0);
});

test("downloads a duplicate image once and rewrites every reference", async () => {
  const html =
    "<!DOCTYPE html><html><head></head><body>" +
    '<img src="/assets/common.png" alt="one">' +
    '<img src="/assets/common.png" alt="two">' +
    "</body></html>";
  nock(ORIGIN).get("/courses").reply(200, html);
  let imageRequests = 0;
  nock(ORIGIN)
    .get("/assets/common.png")
    .reply(200, () => {
      imageRequests += 1;
      return PNG_BYTES;
    });

  const filePath = await downloadPage(PAGE_URL, outputDir);

  expect(imageRequests).toBe(1);
  const savedHtml = await fs.readFile(filePath, "utf-8");
  const references = savedHtml.match(/ru-hexlet-io-assets-common\.png/g) ?? [];
  expect(references).toHaveLength(2);
});

test("does not create the resources directory when the page has no images", async () => {
  nock(ORIGIN).get("/courses").reply(200, PAGE_BODY);

  const filePath = await downloadPage(PAGE_URL, outputDir);

  const entries = await fs.readdir(outputDir);
  expect(entries).toEqual(["ru-hexlet-io-courses.html"]);
  expect(filePath).toBe(path.join(outputDir, "ru-hexlet-io-courses.html"));
});

test("rejects and does not save the modified html when an image fails to download", async () => {
  nock(ORIGIN)
    .get("/courses")
    .reply(200, await loadFixture("courses-before.html"));
  nock(ORIGIN).get("/assets/professions/nodejs.png").reply(404, "Not Found");

  await expect(downloadPage(PAGE_URL, outputDir)).rejects.toThrow(
    "Request failed with status code 404",
  );
  const entries = await fs.readdir(outputDir);
  expect(entries).not.toContain("ru-hexlet-io-courses.html");
});

test("caps overly long resource names deterministically keeping the extension", () => {
  const longPath = `/assets/${"x".repeat(300)}.webp`;
  const first = nameFromResourceUrl(`${ORIGIN}${longPath}`);
  const second = nameFromResourceUrl(`${ORIGIN}${longPath}`);

  expect(first).toBe(second);
  expect(first.length).toBeLessThanOrEqual(150);
  expect(first.endsWith(".webp")).toBe(true);
  expect(first).toMatch(/-[0-9a-f]{8}\.webp$/);

  const other = nameFromResourceUrl(`${ORIGIN}/assets/${"y".repeat(300)}.webp`);
  expect(other).not.toBe(first);

  const pathologicalExt = nameFromResourceUrl(`${ORIGIN}/assets/file.${"a".repeat(200)}`);
  expect(pathologicalExt.length).toBeLessThanOrEqual(150);
});

test("keeps case-differing image urls in separate files on a case-insensitive filesystem", async () => {
  const html =
    "<!DOCTYPE html><html><head></head><body>" +
    '<img src="https://cdn.example.com/Assets/X.png" alt="upper">' +
    '<img src="https://cdn.example.com/assets/x.png" alt="lower">' +
    "</body></html>";
  nock(ORIGIN).get("/courses").reply(200, html);
  nock("https://cdn.example.com").get("/Assets/X.png").reply(200, PNG_BYTES);
  nock("https://cdn.example.com").get("/assets/x.png").reply(200, JPG_BYTES);

  await downloadPage(PAGE_URL, outputDir);

  const resourcesDir = path.join(outputDir, "ru-hexlet-io-courses_files");
  const dirEntries = await fs.readdir(resourcesDir);
  expect(dirEntries).toHaveLength(2);
  const upperBytes = await fs.readFile(path.join(resourcesDir, "cdn-example-com-assets-x.png"));
  expect(Buffer.compare(upperBytes, PNG_BYTES)).toBe(0);
  const disambiguated = dirEntries.find((name) => name !== "cdn-example-com-assets-x.png");
  const lowerBytes = await fs.readFile(path.join(resourcesDir, disambiguated));
  expect(Buffer.compare(lowerBytes, JPG_BYTES)).toBe(0);
});

test("gives every colliding image url its own file with intact bytes", async () => {
  const html =
    "<!DOCTYPE html><html><head></head><body>" +
    '<img src="https://cdn.example.com/x.png" alt="one">' +
    '<img src="https://cdn.example.com/X.png" alt="two">' +
    '<img src="https://cdn.example.com/x.PNG" alt="three">' +
    "</body></html>";
  const PAYLOAD_A = Buffer.from([0x01, 0x02, 0x03, 0x04]);
  const PAYLOAD_B = Buffer.from([0xa1, 0xa2, 0xa3, 0xa4]);
  const PAYLOAD_C = Buffer.from([0xc1, 0xc2, 0xc3, 0xc4]);
  nock(ORIGIN).get("/courses").reply(200, html);
  nock("https://cdn.example.com").get("/x.png").reply(200, PAYLOAD_A);
  nock("https://cdn.example.com").get("/X.png").reply(200, PAYLOAD_B);
  nock("https://cdn.example.com").get("/x.PNG").reply(200, PAYLOAD_C);

  await downloadPage(PAGE_URL, outputDir);

  const resourcesDir = path.join(outputDir, "ru-hexlet-io-courses_files");
  const dirEntries = await fs.readdir(resourcesDir);
  expect(dirEntries).toHaveLength(3);
  const savedBytes = await Promise.all(
    dirEntries.map((name) => fs.readFile(path.join(resourcesDir, name))),
  );
  const payloads = [PAYLOAD_A, PAYLOAD_B, PAYLOAD_C];
  for (const payload of payloads) {
    expect(savedBytes.some((saved) => Buffer.compare(saved, payload) === 0)).toBe(true);
  }
  const uniqueBytes = new Set(savedBytes.map((bytes) => bytes.toString("hex")));
  expect(uniqueBytes.size).toBe(3);
});

test("resolves long colliding resource names without hanging", async () => {
  const html =
    "<!DOCTYPE html><html><head></head><body>" +
    `<img src="https://cdn.example.com/a/${"X".repeat(200)}.png" alt="upper">` +
    `<img src="https://cdn.example.com/a/${"x".repeat(200)}.png" alt="lower">` +
    "</body></html>";
  nock(ORIGIN).get("/courses").reply(200, html);
  nock("https://cdn.example.com")
    .get(`/a/${"X".repeat(200)}.png`)
    .reply(200, PNG_BYTES);
  nock("https://cdn.example.com")
    .get(`/a/${"x".repeat(200)}.png`)
    .reply(200, JPG_BYTES);

  const filePath = await downloadPage(PAGE_URL, outputDir);

  const savedHtml = await fs.readFile(filePath, "utf-8");
  expect(savedHtml).toContain('alt="upper"');
  const resourcesDir = path.join(outputDir, "ru-hexlet-io-courses_files");
  const dirEntries = await fs.readdir(resourcesDir);
  expect(dirEntries).toHaveLength(2);
  const bytesList = await Promise.all(
    dirEntries.map((name) => fs.readFile(path.join(resourcesDir, name))),
  );
  const unique = new Set(bytesList.map((bytes) => bytes.toString("hex")));
  expect(unique.size).toBe(2);
});

test("skips fragment-only and whitespace-only image sources", async () => {
  const html =
    "<!DOCTYPE html><html><head></head><body>" +
    '<img src="#" alt="anchor">' +
    '<img src="   " alt="spaces">' +
    "</body></html>";
  nock(ORIGIN).get("/courses").reply(200, html);

  const filePath = await downloadPage(PAGE_URL, outputDir);

  const entries = await fs.readdir(outputDir);
  expect(entries).toEqual(["ru-hexlet-io-courses.html"]);
  const savedHtml = await fs.readFile(filePath, "utf-8");
  expect(savedHtml).toContain('src="#"');
});

test("rejects with a helpful message when an image src is not a valid url", async () => {
  const html =
    '<!DOCTYPE html><html><head></head><body><img src="http://[bad" alt="broken"></body></html>';
  nock(ORIGIN).get("/courses").reply(200, html);

  await expect(downloadPage(PAGE_URL, outputDir)).rejects.toThrow(
    'Invalid image src "http://[bad"',
  );
});
