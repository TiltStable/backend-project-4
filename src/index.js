import { createRequire } from "node:module";
import * as cheerio from "cheerio";
import debug from "debug";
import Listr from "listr";
import path from "node:path";
import { promises as fs } from "node:fs";

// axios-debug-log patches the axios instance it can require (the CJS build).
// In an ESM project a plain `import axios` loads a SECOND instance the logging
// never sees, so the whole library uses the CJS instance — the ESM recipe
// from the axios-debug-log README.
const require_ = createRequire(import.meta.url);
const axios = require_("axios");
const axiosDebugLog = require_("axios-debug-log");

const log = debug("page-loader");

// the "axios" namespace is created inside axios-debug-log itself; its options
// API accepts only request/response/error handlers
axiosDebugLog({
  request: (d, config) => d(`${(config.method || "get").toUpperCase()} ${config.url}`),
  response: (d, response) => d(`${response.status} ${response.config && response.config.url}`),
  error: (d, error) =>
    d(`error ${error.message} on ${(error.config && error.config.url) || "unknown url"}`),
});

const DEFAULT_TIMEOUT = 30000;
const RESOURCE_ATTRIBUTES = [
  ["img", "src"],
  ["link", "href"],
  ["script", "src"],
];
const MAX_RESOURCE_NAME_LENGTH = 150;
const RESOURCE_DOWNLOAD_CONCURRENCY = 5;

export const nameFromUrl = (url) => {
  const withoutProtocol = url.replace(/^[a-zA-Z]+:\/\//, "");
  const normalized = withoutProtocol.replace(/[^a-zA-Z0-9]/g, "-");
  return `${normalized}.html`;
};

const shortHash = (value) => {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash + value.charCodeAt(i)) % 0xffffffff;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

export const nameFromResourceUrl = (url) => {
  const { origin, pathname } = new URL(url);
  const extension = pathname.match(/\.([a-zA-Z0-9]{1,12})$/);
  const withoutExtension = extension ? pathname.slice(0, -extension[0].length) : pathname;
  const withoutProtocol = `${origin}${withoutExtension}`.replace(/^[a-zA-Z]+:\/\//, "");
  const normalized = withoutProtocol.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();
  // resources without an extension (e.g. a canonical link to the page itself)
  // are saved as html, like the course fixture requires
  const extensionSuffix = extension ? `.${extension[1]}` : ".html";
  const fullName = `${normalized}${extensionSuffix}`;
  if (fullName.length <= MAX_RESOURCE_NAME_LENGTH) {
    return fullName;
  }
  const hashSuffix = `-${shortHash(fullName)}`;
  const cutAt = Math.max(0, MAX_RESOURCE_NAME_LENGTH - hashSuffix.length - extensionSuffix.length);
  return `${normalized.slice(0, cutAt)}${hashSuffix}${extensionSuffix}`;
};

const resourcesDirName = (pageUrl) => nameFromUrl(pageUrl).replace(/\.html$/, "_files");

const wrapError = (error, message) =>
  new Error(`${message}: ${error instanceof Error ? error.message : String(error)}`, {
    cause: error,
  });

const resolveResourceUrl = (rawSource, pageUrl, context) => {
  try {
    return new URL(rawSource, pageUrl).href;
  } catch {
    throw new Error(`Invalid resource ${context} "${rawSource}"`);
  }
};

// the course fixture overrides the "subdomains" wording: only the exact
// same hostname counts as local (cdn2.hexlet.io is ignored for ru.hexlet.io)
const isLocalResource = (resourceUrl, pageUrl) =>
  new URL(resourceUrl).hostname === new URL(pageUrl).hostname;

const localizeResources = (html, pageUrl) => {
  const $ = cheerio.load(html);
  const resourcesDir = resourcesDirName(pageUrl);
  const namesByResourceUrl = new Map();
  const claimedNames = new Set();

  // case-insensitive filesystems treat names differing only in case as one file,
  // so every claimed name reserves room for its suffix: the attempt counter always
  // survives the length cap, which guarantees the loop terminates
  const claimUniqueName = (baseName, resourceUrl) => {
    let candidate = baseName;
    let attempt = 0;
    while (claimedNames.has(candidate.toLowerCase())) {
      attempt += 1;
      if (attempt > 100) {
        throw new Error(`Cannot build a unique name for resource ${resourceUrl}`);
      }
      const dotIndex = baseName.lastIndexOf(".");
      const extension = dotIndex > 0 ? baseName.slice(dotIndex) : "";
      const base = dotIndex > 0 ? baseName.slice(0, dotIndex) : baseName;
      const suffix = `-${shortHash(resourceUrl)}${attempt > 1 ? attempt : ""}`;
      const room = Math.max(0, MAX_RESOURCE_NAME_LENGTH - suffix.length - extension.length);
      candidate = `${base.slice(0, room)}${suffix}${extension}`;
    }
    claimedNames.add(candidate.toLowerCase());
    return candidate;
  };

  for (const [tag, attribute] of RESOURCE_ATTRIBUTES) {
    $(tag).each((_, element) => {
      const rawSource = $(element).attr(attribute);
      if (!rawSource || !rawSource.trim() || rawSource.startsWith("#")) {
        return;
      }
      const resourceUrl = resolveResourceUrl(rawSource, pageUrl, `${tag}[${attribute}]`);
      if (!isLocalResource(resourceUrl, pageUrl)) {
        return;
      }
      if (namesByResourceUrl.has(resourceUrl)) {
        $(element).attr(attribute, `${resourcesDir}/${namesByResourceUrl.get(resourceUrl)}`);
        return;
      }
      const name = claimUniqueName(nameFromResourceUrl(resourceUrl), resourceUrl);
      namesByResourceUrl.set(resourceUrl, name);
      $(element).attr(attribute, `${resourcesDir}/${namesByResourceUrl.get(resourceUrl)}`);
    });
  }

  return {
    html: $.html(),
    resources: [...namesByResourceUrl].map(([resourceUrl, name]) => ({ url: resourceUrl, name })),
  };
};

const fetchResource = (url, requestOptions) =>
  axios
    .get(url, { timeout: DEFAULT_TIMEOUT, ...requestOptions, responseType: "arraybuffer" })
    .then((response) => Buffer.from(response.data));

const saveResources = (localized, resourcesDirPath, requestOptions) => {
  if (localized.resources.length === 0) {
    return Promise.resolve(localized);
  }
  return fs
    .mkdir(resourcesDirPath, { recursive: true })
    .catch((error) => {
      throw wrapError(error, `Failed to create resources directory "${resourcesDirPath}"`);
    })
    .then(() => {
      const tasks = new Listr(
        localized.resources.map((resource) => ({
          title: resource.url,
          task: () =>
            fetchResource(resource.url, requestOptions)
              .catch((error) => {
                throw wrapError(error, `Failed to download resource "${resource.url}"`);
              })
              .then((data) =>
                fs
                  .writeFile(path.join(resourcesDirPath, resource.name), data)
                  .catch((error) => {
                    throw wrapError(error, `Failed to save resource "${resource.name}"`);
                  })
                  .then(() => {
                    log("saved %s", resource.name);
                  }),
              ),
        })),
        {
          concurrent: RESOURCE_DOWNLOAD_CONCURRENCY,
          exitOnError: true,
          nonTTYRenderer: "silent",
        },
      );
      return (
        tasks
          .run()
          // exitOnError: true → run() rejects with the first task error as-is;
          // the errors[] branch covers exitOnError: false
          .catch((error) => {
            throw Array.isArray(error.errors) && error.errors.length > 0 ? error.errors[0] : error;
          })
          .then(() => localized)
      );
    });
};

const downloadPage = (url, outputDir = process.cwd(), requestOptions = {}) => {
  const htmlPath = path.join(outputDir, nameFromUrl(url));
  const resourcesDirPath = path.join(outputDir, resourcesDirName(url));
  log("downloading %s into %s", url, outputDir);

  return (
    Promise.resolve()
      .then(() => new URL(url))
      // the destination directory is created only if its parent exists:
      // a missing parent is an error (the course spec forbids auto-creating
      // missing destination paths), an existing directory is fine,
      // an existing non-directory path is an error too
      .then(() =>
        fs.mkdir(outputDir).catch((error) => {
          if (error.code !== "EEXIST") {
            throw wrapError(error, `Failed to create output directory "${outputDir}"`);
          }
          return fs.stat(outputDir).then((stat) => {
            if (!stat.isDirectory()) {
              throw new Error(`Output path "${outputDir}" exists and is not a directory`);
            }
          });
        }),
      )
      .then(() =>
        axios
          .get(url, { timeout: DEFAULT_TIMEOUT, ...requestOptions, responseType: "text" })
          .catch((error) => {
            throw wrapError(error, `Failed to download page "${url}"`);
          }),
      )
      .then((response) => localizeResources(response.data, url))
      .then((localized) => {
        log("found %d local resources", localized.resources.length);
        return localized;
      })
      .then((localized) => saveResources(localized, resourcesDirPath, requestOptions))
      .then((localized) =>
        fs.writeFile(htmlPath, localized.html).catch((error) => {
          throw wrapError(error, `Failed to save page "${htmlPath}"`);
        }),
      )
      .then(() => {
        log("page saved to %s", htmlPath);
        return path.resolve(htmlPath);
      })
      .catch((error) => {
        log(
          "failed to download %s: %s",
          url,
          error instanceof Error ? error.message : String(error),
        );
        throw error;
      })
  );
};

export default downloadPage;
