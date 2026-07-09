import { lookup } from "node:dns/promises";
import { load } from "cheerio";
import type { LinkMetadata } from "../src/db/types.ts";
import {
  isBlockedIpAddress,
  isHttpUrl,
  isIpAddressLiteral,
  isPublicHttpUrlByProtocolAndHost,
} from "../src/utils/url-safety.ts";

const MAX_HTML_BYTES = 1024 * 1024;
const FETCH_TIMEOUT_MS = 5000;
const MAX_REDIRECTS = 5;

export type LinkMetadataFetchResult =
  Partial<LinkMetadata> & Pick<LinkMetadata, "url" | "status">;

async function assertPublicHttpUrl(url: URL): Promise<void> {
  if (!isHttpUrl(url)) {
    throw new Error("Only HTTP(S) URLs can be previewed");
  }

  if (isIpAddressLiteral(url.hostname)) {
    if (isBlockedIpAddress(url.hostname)) throw new Error("Private IPs cannot be previewed");
    return;
  }

  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (addresses.some((address) => isBlockedIpAddress(address.address))) {
    throw new Error("Private network URLs cannot be previewed");
  }
}

function resolveUrl(value: string | undefined, pageUrl: string): URL | null {
  if (value === undefined || value.trim() === "") return null;
  try {
    return new URL(value.trim(), pageUrl);
  } catch {
    return null;
  }
}

function resolveHttpUrl(value: string | undefined, pageUrl: string): string | null {
  const url = resolveUrl(value, pageUrl);
  if (url === null || !isHttpUrl(url)) return null;
  return url.toString();
}

function resolvePublicHttpUrl(value: string | undefined, pageUrl: string): string | null {
  const url = resolveUrl(value, pageUrl);
  if (url === null || !isPublicHttpUrlByProtocolAndHost(url)) return null;
  return url.toString();
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
  return extractLinkMetadataParts(html, requestedUrl, pageUrl).metadata;
}

function extractLinkMetadataParts(
  html: string,
  requestedUrl: string,
  pageUrl: string,
): {
  metadata: LinkMetadataFetchResult;
  imageCandidates: string[];
} {
  const $ = load(html);
  const meta = (key: string) =>
    $(`meta[property="${key}"], meta[name="${key}"]`).first().attr("content");

  const imageCandidates = [
    resolvePublicHttpUrl(meta("og:image"), pageUrl),
    resolvePublicHttpUrl(meta("og:image:secure_url"), pageUrl),
    resolvePublicHttpUrl(meta("twitter:image"), pageUrl),
    resolvePublicHttpUrl(meta("twitter:image:src"), pageUrl),
  ].filter((url): url is string => url !== null);
  const imageUrl = imageCandidates[0] ?? null;
  const title = firstText(meta("og:title"), meta("twitter:title"), $("title").first().text());
  const siteName = firstText(meta("og:site_name"));
  const canonicalUrl = resolveHttpUrl(meta("og:url"), pageUrl);
  const type = firstText(meta("og:type"));

  return {
    metadata: {
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
    },
    imageCandidates,
  };
}

export function extractOgImage(html: string, pageUrl: string): string | null {
  return extractLinkMetadata(html, pageUrl).image_url ?? null;
}

async function firstPublicImageUrl(candidates: string[]): Promise<string | null> {
  for (const candidate of candidates) {
    try {
      await assertPublicHttpUrl(new URL(candidate));
      return candidate;
    } catch {
      // Skip metadata images that would make the browser reach local or private networks.
    }
  }
  return null;
}

async function extractValidatedLinkMetadata(
  html: string,
  requestedUrl: string,
  pageUrl: string,
): Promise<LinkMetadataFetchResult> {
  const { metadata, imageCandidates } = extractLinkMetadataParts(html, requestedUrl, pageUrl);
  const imageUrl = await firstPublicImageUrl(imageCandidates);

  if (imageUrl === null) {
    return {
      ...metadata,
      status: "missing",
      image_url: null,
      image_alt: null,
      image_width: null,
      image_height: null,
    };
  }

  return {
    ...metadata,
    status: "found",
    image_url: imageUrl,
  };
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
    return await extractValidatedLinkMetadata(html, url, finalPageUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to fetch link metadata";
    return { url, status: "error", image_url: null, failure_reason: message };
  }
}
