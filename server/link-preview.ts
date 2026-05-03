import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_HTML_BYTES = 1024 * 1024;
const FETCH_TIMEOUT_MS = 5000;

export type OgImageResult =
  | { status: "found"; imageUrl: string }
  | { status: "missing" | "error"; imageUrl: null };

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

function decodeHtmlEntities(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function attrValue(tag: string, attr: string): string | null {
  const match = new RegExp(`${attr}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  return match?.[2] ?? match?.[3] ?? match?.[4] ?? null;
}

export function extractOgImage(html: string, pageUrl: string): string | null {
  const metaTags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of metaTags) {
    const property = attrValue(tag, "property") ?? attrValue(tag, "name");
    if (property?.toLowerCase() !== "og:image") continue;
    const content = attrValue(tag, "content");
    if (content === null || content.trim() === "") continue;
    try {
      return new URL(decodeHtmlEntities(content.trim()), pageUrl).toString();
    } catch {
      return null;
    }
  }
  return null;
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

export async function fetchOgImage(url: string): Promise<OgImageResult> {
  try {
    const pageUrl = new URL(url);
    await assertPublicHttpUrl(pageUrl);

    const response = await fetch(pageUrl, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        "User-Agent": "Keeper/0.0 link-preview",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
    if (!response.ok) return { status: "error", imageUrl: null };

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("text/html")) {
      return { status: "missing", imageUrl: null };
    }

    const html = await readLimitedText(response);
    const imageUrl = extractOgImage(html, response.url);
    return imageUrl === null
      ? { status: "missing", imageUrl: null }
      : { status: "found", imageUrl };
  } catch {
    return { status: "error", imageUrl: null };
  }
}
