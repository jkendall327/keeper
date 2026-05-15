import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { load } from "cheerio";
import type { LinkMetadata } from "../src/db/types.ts";

const MAX_HTML_BYTES = 1024 * 1024;
const FETCH_TIMEOUT_MS = 5000;
const MAX_REDIRECTS = 5;

export type LinkMetadataFetchResult =
  Partial<LinkMetadata> & Pick<LinkMetadata, "url" | "status">;

function isPrivateIp(address: string): boolean {
  if (address === "::1") return true;
  if (address.startsWith("fc") || address.startsWith("fd")) return true;
  if (address.startsWith("fe80:")) return true;

  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    return false;
  }
  const a = parts[0] ?? 0;
  const b = parts[1] ?? 0;
  return (
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

async function assertPublicHttpUrl(url: URL): Promise<void> {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only HTTP(S) URLs can be previewed");
  }

  if (isIP(url.hostname) !== 0) {
    if (isPrivateIp(url.hostname)) throw new Error("Private IPs cannot be previewed");
    return;
  }

  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (addresses.some((address) => isPrivateIp(address.address))) {
    throw new Error("Private network URLs cannot be previewed");
  }
}

function resolveUrl(value: string | undefined, pageUrl: string): string | null {
  if (value === undefined || value.trim() === "") return null;
  try {
    return new URL(value.trim(), pageUrl).toString();
  } catch {
    return null;
  }
}

function parseInteger(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function firstText(...values: (string | undefined)[]): string | null {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed !== undefined && trimmed !== "") return trimmed;
  }
  return null;
}

export function extractLinkMetadata(
  html: string,
  requestedUrl: string,
  pageUrl: string = requestedUrl,
): LinkMetadataFetchResult {
  const $ = load(html);
  const meta = (key: string) =>
    $(`meta[property="${key}"], meta[name="${key}"]`).first().attr("content");

  const imageUrl =
    resolveUrl(meta("og:image"), pageUrl) ??
    resolveUrl(meta("og:image:secure_url"), pageUrl) ??
    resolveUrl(meta("twitter:image"), pageUrl) ??
    resolveUrl(meta("twitter:image:src"), pageUrl);
  const title = firstText(meta("og:title"), meta("twitter:title"), $("title").first().text());
  const siteName = firstText(meta("og:site_name"));
  const canonicalUrl = resolveUrl(meta("og:url"), pageUrl);
  const type = firstText(meta("og:type"));

  return {
    url: requestedUrl,
    status: imageUrl === null ? "missing" : "found",
    image_url: imageUrl,
    image_alt: firstText(meta("og:image:alt")),
    image_width: parseInteger(meta("og:image:width")),
    image_height: parseInteger(meta("og:image:height")),
    title,
    site_name: siteName,
    canonical_url: canonicalUrl,
    type,
  };
}

export function extractOgImage(html: string, pageUrl: string): string | null {
  return extractLinkMetadata(html, pageUrl).image_url ?? null;
}

async function readLimitedText(response: Response): Promise<string> {
  const contentLength = Number(response.headers.get("content-length"));
  if (contentLength > MAX_HTML_BYTES) {
    throw new Error("Preview response is too large");
  }

  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > MAX_HTML_BYTES) {
    throw new Error("Preview response is too large");
  }
  return new TextDecoder().decode(bytes);
}

function isRedirect(response: Response): boolean {
  return response.status >= 300 && response.status < 400 && response.status !== 304;
}

async function fetchPublicHtmlUrl(url: URL): Promise<{ response: Response; pageUrl: string }> {
  let currentUrl = url;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
    await assertPublicHttpUrl(currentUrl);

    const response = await fetch(currentUrl, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        "User-Agent": "Keeper/0.0 link-preview",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "manual",
    });

    if (!isRedirect(response)) {
      return { response, pageUrl: response.url !== "" ? response.url : currentUrl.toString() };
    }

    const location = response.headers.get("location");
    if (location === null || location.trim() === "") {
      throw new Error("Preview redirect is missing a Location header");
    }

    currentUrl = new URL(location, currentUrl);
  }

  throw new Error("Preview redirect limit exceeded");
}

export async function fetchLinkMetadata(url: string): Promise<LinkMetadataFetchResult> {
  try {
    const pageUrl = new URL(url);
    const { response, pageUrl: finalPageUrl } = await fetchPublicHtmlUrl(pageUrl);
    if (!response.ok) {
      return { url, status: "error", image_url: null, failure_reason: `HTTP ${String(response.status)}` };
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("text/html")) {
      return { url, status: "missing", image_url: null };
    }

    const html = await readLimitedText(response);
    return extractLinkMetadata(html, url, finalPageUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to fetch link metadata";
    return { url, status: "error", image_url: null, failure_reason: message };
  }
}
