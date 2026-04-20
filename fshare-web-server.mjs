#!/usr/bin/env node

import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_FOLDER_URL,
  extractFolderLinkcode,
  loadCachedSearch,
  runSearch,
} from "./fshare-search.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 4312);
const FOLDER_URL = DEFAULT_FOLDER_URL;
const FOLDER_LINKCODE = extractFolderLinkcode(FOLDER_URL);
const CACHE_FILE = path.join(__dirname, `fshare-items-${FOLDER_LINKCODE}.json`);

const ASSETS = {
  "/": { file: "fshare-web.html", type: "text/html; charset=utf-8" },
  "/fshare-web.css": { file: "fshare-web.css", type: "text/css; charset=utf-8" },
  "/fshare-web.js": { file: "fshare-web.js", type: "application/javascript; charset=utf-8" },
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
  });
  response.end(JSON.stringify(payload));
}

async function serveAsset(response, asset) {
  const filePath = path.join(__dirname, asset.file);
  const content = await readFile(filePath);
  response.writeHead(200, { "Content-Type": asset.type });
  response.end(content);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk.toString("utf8");
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

async function readCacheMeta() {
  try {
    const raw = await readFile(CACHE_FILE, "utf8");
    const payload = JSON.parse(raw);
    return {
      hasCache: Array.isArray(payload.items),
      fetchedAt: payload.fetchedAt || null,
      totalItems: payload.totalItems || (Array.isArray(payload.items) ? payload.items.length : 0),
      recursive: Boolean(payload.recursive),
      outputFile: CACHE_FILE,
      folderUrl: FOLDER_URL,
    };
  } catch {
    return {
      hasCache: false,
      fetchedAt: null,
      totalItems: 0,
      recursive: false,
      outputFile: CACHE_FILE,
      folderUrl: FOLDER_URL,
    };
  }
}

async function handleStatus(response) {
  sendJson(response, 200, await readCacheMeta());
}

async function handleSearch(request, response) {
  const rawBody = await readBody(request);
  let body;

  try {
    body = JSON.parse(rawBody || "{}");
  } catch {
    sendJson(response, 400, { error: "Body JSON không hợp lệ." });
    return;
  }

  try {
    const { payload, outputFile } = await loadCachedSearch({
      url: FOLDER_URL,
      query: body.query || "",
      recursive: false,
      output: CACHE_FILE,
    });

    sendJson(response, 200, {
      fetchedAt: payload.fetchedAt,
      totalItems: payload.totalItems,
      matchedItems: payload.matchedItems,
      outputFile,
      matches: payload.matches,
    });
  } catch (error) {
    sendJson(response, 400, {
      error: error instanceof Error ? error.message : "Không đọc được cache local.",
    });
  }
}

async function handleFetch(response) {
  try {
    const { payload, outputFile } = await runSearch({
      url: FOLDER_URL,
      query: "",
      recursive: false,
      output: CACHE_FILE,
    });

    sendJson(response, 200, {
      fetchedAt: payload.fetchedAt,
      totalItems: payload.totalItems,
      matchedItems: 0,
      outputFile,
      folderUrl: FOLDER_URL,
      message: "Đã fetch và ghi đè cache local thành công.",
    });
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : "Không thể fetch dữ liệu từ Fshare.",
    });
  }
}

const server = http.createServer(async (request, response) => {
  try {
    if (!request.url) {
      response.writeHead(400);
      response.end("Bad request");
      return;
    }

    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      response.end();
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/status") {
      await handleStatus(response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/search") {
      await handleSearch(request, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/fetch") {
      await handleFetch(response);
      return;
    }

    const asset = ASSETS[url.pathname];
    if (request.method === "GET" && asset) {
      await serveAsset(response, asset);
      return;
    }

    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  } catch (error) {
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(error instanceof Error ? error.message : "Internal Server Error");
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Fshare local web is running at http://127.0.0.1:${PORT}`);
  console.log(`Pinned folder: ${FOLDER_URL}`);
});
