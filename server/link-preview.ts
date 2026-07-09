import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { load } from "cheerio";
import type { LinkMetadata } from "../src/db/types.ts";

const MAX_HTML_BYTES = 1024 * 1024;
const FETCH_TIMEOUT_MS = 5000;
const MAX_REDIRECTS = 5;

export type LinkMetadataFetchResult =
  Partial<LinkMetadata> & Pick<LinkMetadata, "url" | "status">;

const BLOCKED_IPV4_RANGES: [base: string, prefix: number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

const BLOCKED_IPV6_RANGES: [base: string, prefix: number][] = [
  ["::", 128],
  ["::1", 128],
  ["::", 96],
  ["::ffff:0:0", 96],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 32],
  ["2001:2::", 48],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
];

function stripIpBrackets(address: string): string {
  return address.startsWith("[") && address.endsWith("]")
    ? address.slice(1, -1)
    : address;
}

function parseIpv4Address(address: string): number | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;

  const octets = parts.map((part) => {
    if (!/^\d+$/.test(part)) return null;
    const value = Number(part);
    return Number.isInteger(value) && value >= 0 && value <= 255 ? value : null;
  });
  if (octets.some((octet) => octet === null)) return null;

  const [a, b, c, d] = octets as [number, number, number, number];
  return ((a * 256 + b) * 256 + c) * 256 + d;
}

function ipv4InRange(address: number, baseAddress: number, prefix: number): boolean {
  const blockSize = 2 ** (32 - prefix);
  return Math.floor(address / blockSize) === Math.floor(baseAddress / blockSize);
}

function isBlockedIpv4Address(address: string): boolean {
  const parsedAddress = parseIpv4Address(address);
  if (parsedAddress === null) return true;

  return BLOCKED_IPV4_RANGES.some(([base, prefix]) => {
    const parsedBase = parseIpv4Address(base);
    return parsedBase !== null && ipv4InRange(parsedAddress, parsedBase, prefix);
  });
}

function normalizeIpv6Address(address: string): string {
  const zoneIndex = address.indexOf("%");
  const withoutZone = zoneIndex === -1 ? address : address.slice(0, zoneIndex);
  const lastColon = withoutZone.lastIndexOf(":");
  if (lastColon === -1 || !withoutZone.slice(lastColon + 1).includes(".")) {
    return withoutZone.toLowerCase();
  }

  const ipv4 = parseIpv4Address(withoutZone.slice(lastColon + 1));
  if (ipv4 === null) return withoutZone.toLowerCase();
  const high = Math.floor(ipv4 / 65536).toString(16);
  const low = (ipv4 % 65536).toString(16);
  return `${withoutZone.slice(0, lastColon)}:${high}:${low}`.toLowerCase();
}

function parseIpv6Address(address: string): bigint | null {
  const normalized = normalizeIpv6Address(address);
  if (normalized === "") return null;

  const compressedParts = normalized.split("::");
  if (compressedParts.length > 2) return null;

  const headPart = compressedParts[0];
  if (headPart === undefined) return null;
  const tailPart = compressedParts[1] ?? "";
  const head = headPart === "" ? [] : headPart.split(":");
  const tail = compressedParts.length === 1 || tailPart === "" ? [] : tailPart.split(":");
  const missingGroupCount = 8 - head.length - tail.length;
  if (compressedParts.length === 1 && missingGroupCount !== 0) return null;
  if (compressedParts.length === 2 && missingGroupCount < 1) return null;

  const groups = [
    ...head,
    ...Array.from({ length: compressedParts.length === 2 ? missingGroupCount : 0 }, () => "0"),
    ...tail,
  ];
  if (groups.length !== 8) return null;

  let value = 0n;
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/u.test(group)) return null;
    value = (value << 16n) + BigInt(Number.parseInt(group, 16));
  }
  return value;
}

function ipv6InRange(address: bigint, baseAddress: bigint, prefix: number): boolean {
  const shift = BigInt(128 - prefix);
  return (address >> shift) === (baseAddress >> shift);
}

function isBlockedIpv6Address(address: string): boolean {
  const parsedAddress = parseIpv6Address(address);
  if (parsedAddress === null) return true;

  return BLOCKED_IPV6_RANGES.some(([base, prefix]) => {
    const parsedBase = parseIpv6Address(base);
    return parsedBase !== null && ipv6InRange(parsedAddress, parsedBase, prefix);
  });
}

function isBlockedIpAddress(address: string): boolean {
  const normalized = stripIpBrackets(address).toLowerCase();
  const ipVersion = isIP(normalized);
  if (ipVersion === 4) return isBlockedIpv4Address(normalized);
  if (ipVersion === 6) return isBlockedIpv6Address(normalized);
  return true;
}

async function assertPublicHttpUrl(url: URL): Promise<void> {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only HTTP(S) URLs can be previewed");
  }

  const hostname = stripIpBrackets(url.hostname);
  if (isIP(hostname) !== 0) {
    if (isBlockedIpAddress(hostname)) throw new Error("Private IPs cannot be previewed");
    return;
  }

  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (addresses.some((address) => isBlockedIpAddress(address.address))) {
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
