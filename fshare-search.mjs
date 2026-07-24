#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export const FSHARE_ORIGIN = "https://www.fshare.vn";
export const DEFAULT_SORT = "type,name";
export const DEFAULT_PER_PAGE = 50;
export const DEFAULT_FOLDER_URL = "https://www.fshare.vn/folder/XJNDMQJ8AEUU";

function printUsage() {
  console.log(`Usage:
  node fshare-search.mjs --url <fshare-folder-url> [--query <text>] [--recursive] [--output <file>]

Examples:
  node fshare-search.mjs --url https://www.fshare.vn/folder/ABCDEFGHIJKL --query capcut
  node fshare-search.mjs --url https://www.fshare.vn/folder/ABCDEFGHIJKL --recursive --output ./fshare-items.json
`);
}

function parseArgs(argv) {
  const args = {
    recursive: false,
    output: "",
    query: "",
    url: "",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--url") {
      args.url = argv[i + 1] || "";
      i += 1;
    } else if (arg === "--query") {
      args.query = argv[i + 1] || "";
      i += 1;
    } else if (arg === "--output") {
      args.output = argv[i + 1] || "";
      i += 1;
    } else if (arg === "--recursive") {
      args.recursive = true;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

export function extractFolderLinkcode(folderUrl) {
  const url = new URL(folderUrl);
  const match = url.pathname.match(/\/folder\/([A-Z0-9]+)/i);
  if (!match) {
    throw new Error("URL does not look like an Fshare folder link.");
  }
  return match[1].toUpperCase();
}

function normalizeNextUrl(nextQuery, fallbackLinkcode) {
  if (!nextQuery) {
    return null;
  }

  if (nextQuery.startsWith("http://") || nextQuery.startsWith("https://")) {
    return nextQuery;
  }

  if (nextQuery.startsWith("/v3/")) {
    return new URL(`/api${nextQuery}`, FSHARE_ORIGIN).toString();
  }

  if (nextQuery.startsWith("/")) {
    return new URL(nextQuery, FSHARE_ORIGIN).toString();
  }

  const url = new URL("/api/v3/files/folder", FSHARE_ORIGIN);
  const params = new URLSearchParams(nextQuery);
  if (!params.has("linkcode")) {
    params.set("linkcode", fallbackLinkcode);
  }
  url.search = params.toString();
  return url.toString();
}

function buildFirstPageUrl(linkcode) {
  const url = new URL("/api/v3/files/folder", FSHARE_ORIGIN);
  url.searchParams.set("linkcode", linkcode);
  url.searchParams.set("sort", DEFAULT_SORT);
  return url.toString();
}

function buildFallbackPageUrl(linkcode, page) {
  const url = new URL("/api/v3/files/folder", FSHARE_ORIGIN);
  url.searchParams.set("linkcode", linkcode);
  url.searchParams.set("sort", DEFAULT_SORT);
  url.searchParams.set("page", String(page));
  url.searchParams.set("per-page", String(DEFAULT_PER_PAGE));
  return url.toString();
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "Accept": "application/json, text/plain, */*",
      "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8",
      "User-Agent": "Mozilla/5.0",
      "X-Requested-With": "XMLHttpRequest",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} when fetching ${url}`);
  }

  const text = await response.text();

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid JSON returned by Fshare for ${url}`);
  }
}

async function fetchFolderItems(linkcode, options, state) {
  const allItems = [];
  const seenItemCodes = new Set();
  const seenPageUrls = new Set();
  let page = 1;
  let nextUrl = buildFirstPageUrl(linkcode);

  while (nextUrl && !seenPageUrls.has(nextUrl)) {
    seenPageUrls.add(nextUrl);
    process.stdout.write(`Fetching folder ${linkcode} page ${page}...\n`);
    const data = await fetchJson(nextUrl);
    const items = Array.isArray(data.items) ? data.items : [];

    for (const item of items) {
      if (!seenItemCodes.has(item.linkcode)) {
        seenItemCodes.add(item.linkcode);
        allItems.push({
          id: item.id,
          parentLinkcode: linkcode,
          linkcode: item.linkcode,
          name: item.name,
          type: item.type,
          size: item.size ?? 0,
          mimetype: item.mimetype ?? "",
          path: item.path ?? "",
          created: item.created ?? null,
          modified: item.modified ?? null,
          fileUrl: item.type === 0
            ? `${FSHARE_ORIGIN}/folder/${item.linkcode}`
            : `${FSHARE_ORIGIN}/file/${item.linkcode}`,
        });
      }
    }

    const nextQuery = data?._links?.next ?? "";
    nextUrl = normalizeNextUrl(nextQuery, linkcode);

    // Defensive fallback in case Fshare omits _links.next on a full page.
    if (!nextUrl && items.length >= DEFAULT_PER_PAGE) {
      nextUrl = buildFallbackPageUrl(linkcode, page + 1);
    }

    if (items.length === 0) {
      nextUrl = null;
    }

    page += 1;
  }

  if (options.recursive) {
    const subfolders = allItems.filter((item) => item.type === 0);
    for (const folder of subfolders) {
      if (state.visitedFolders.has(folder.linkcode)) {
        continue;
      }
      state.visitedFolders.add(folder.linkcode);
      const nestedItems = await fetchFolderItems(folder.linkcode, options, state);
      for (const item of nestedItems) {
        if (!state.globalItemCodes.has(item.linkcode)) {
          state.globalItemCodes.add(item.linkcode);
          state.items.push(item);
        }
      }
    }
  }

  return allItems;
}

function formatBytes(size) {
  if (!size || size < 0) {
    return "-";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = size;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export function searchItems(items, query) {
  if (!query) {
    return items;
  }

  const normalizedQuery = query.toLowerCase();
  return items.filter((item) => item.name.toLowerCase().includes(normalizedQuery));
}

export async function runSearch({ url, query = "", recursive = false, output = "" }) {
  const rootLinkcode = extractFolderLinkcode(url);
  const outputFile = output || `./fshare-items-${rootLinkcode}.json`;

  try {
    const cachedRaw = await readFile(outputFile, "utf8");
    const cached = JSON.parse(cachedRaw);
    if (
      cached &&
      cached.rootLinkcode === rootLinkcode &&
      Boolean(cached.recursive) === Boolean(recursive) &&
      Array.isArray(cached.items)
    ) {
      const results = searchItems(cached.items, query);
      cached.matchedItems = results.length;
      cached.matches = results;
      return {
        outputFile,
        payload: cached,
        results,
      };
    }
  } catch {
    // No usable cache yet, continue with live fetch.
  }

  const state = {
    globalItemCodes: new Set(),
    items: [],
    visitedFolders: new Set([rootLinkcode]),
  };

  const rootItems = await fetchFolderItems(rootLinkcode, { recursive }, state);
  for (const item of rootItems) {
    if (!state.globalItemCodes.has(item.linkcode)) {
      state.globalItemCodes.add(item.linkcode);
      state.items.push(item);
    }
  }

  const results = searchItems(state.items, query);

  const payload = {
    fetchedAt: new Date().toISOString(),
    rootFolderUrl: url,
    rootLinkcode,
    recursive,
    totalItems: state.items.length,
    matchedItems: results.length,
    items: state.items,
    matches: results,
  };

  await writeFile(outputFile, JSON.stringify(payload, null, 2), "utf8");

  return {
    outputFile,
    payload,
    results,
  };
}

export async function loadCachedSearch({ url = DEFAULT_FOLDER_URL, query = "", recursive = false, output = "" }) {
  const rootLinkcode = extractFolderLinkcode(url);
  const outputFile = output || `./fshare-items-${rootLinkcode}.json`;
  const cachedRaw = await readFile(outputFile, "utf8");
  const cached = JSON.parse(cachedRaw);

  if (!cached || !Array.isArray(cached.items)) {
    throw new Error("Cache local không hợp lệ. Hãy bấm Fetch mới danh sách app.");
  }

  if (
    cached.rootLinkcode !== rootLinkcode ||
    Boolean(cached.recursive) !== Boolean(recursive)
  ) {
    throw new Error("Cache hiện tại không khớp cấu hình folder. Hãy fetch lại.");
  }

  const results = searchItems(cached.items, query);
  cached.matchedItems = results.length;
  cached.matches = results;

  return {
    outputFile,
    payload: cached,
    results,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || !args.url) {
    printUsage();
    process.exit(args.help ? 0 : 1);
  }
  const { outputFile, payload, results } = await runSearch(args);

  console.log("");
  console.log(`Fetched ${payload.totalItems} items.`);
  console.log(`Saved full list to ${outputFile}`);

  if (args.query) {
    console.log(`Search query: "${args.query}"`);
    console.log(`Matches: ${results.length}`);
  }

  if (results.length === 0) {
    console.log("No matching items found.");
    return;
  }

  console.log("");
  for (const item of results) {
    const kind = item.type === 0 ? "folder" : "file";
    console.log(
      `[${kind}] ${item.name} | ${formatBytes(item.size)} | ${item.fileUrl}`,
    );
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  });
}
