#!/usr/bin/env node

import { program } from "commander";
import downloadPage from "../src/index.js";

program
  .name("page-loader")
  .description("Downloads a web page and saves it locally")
  .option("-o, --output <dir>", "output directory (default: current directory)")
  .argument("<url>", "page url to download")
  .parse();

const [url] = program.args;
const { output } = program.opts();

downloadPage(url, output)
  .then((filePath) => console.log(filePath))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
