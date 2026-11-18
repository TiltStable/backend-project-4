import { afterEach, beforeEach, expect, test, vi } from "vitest";
import nock from "nock";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import downloadPage, { nameFromUrl } from "./index.js";

const ORIGIN = "https://ru.hexlet.io";
const PAGE_URL = `${ORIGIN}/courses`;
const PAGE_BODY =
  "<!DOCTYPE html><html><head><title>Hexlet: Courses</title></head><body><h1>Courses</h1></body></html>";

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
