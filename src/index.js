import axios from "axios";
import path from "node:path";
import { promises as fs } from "node:fs";

export const nameFromUrl = (url) => {
  const withoutProtocol = url.replace(/^[a-zA-Z]+:\/\//, "");
  const normalized = withoutProtocol.replace(/[^a-zA-Z0-9]/g, "-");
  return `${normalized}.html`;
};

const DEFAULT_TIMEOUT = 10000;

const downloadPage = (url, outputDir = process.cwd(), requestOptions = {}) =>
  Promise.resolve()
    .then(() => new URL(url))
    .then(() => fs.mkdir(outputDir, { recursive: true }))
    .then(() =>
      axios.get(url, { responseType: "text", timeout: DEFAULT_TIMEOUT, ...requestOptions }),
    )
    .then((response) => {
      const filePath = path.join(outputDir, nameFromUrl(url));
      return fs.writeFile(filePath, response.data).then(() => path.resolve(filePath));
    });

export default downloadPage;
