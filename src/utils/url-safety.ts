const BLOCKED_IPV4_RANGES: [base: string, prefix: number][] = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

const BLOCKED_IPV6_RANGES: [base: string, prefix: number][] = [
  ['::', 128],
  ['::1', 128],
  ['::', 96],
  ['::ffff:0:0', 96],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001::', 32],
  ['2001:2::', 48],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
];

function stripIpBrackets(address: string): string {
  return address.startsWith('[') && address.endsWith(']')
    ? address.slice(1, -1)
    : address;
}

function normalizeHostname(hostname: string): string {
  const normalized = stripIpBrackets(hostname).toLowerCase();
  return normalized.endsWith('.') ? normalized.slice(0, -1) : normalized;
}

function parseIpv4Address(address: string): number | null {
  const parts = address.split('.');
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
  const zoneIndex = address.indexOf('%');
  const withoutZone = zoneIndex === -1 ? address : address.slice(0, zoneIndex);
  const lastColon = withoutZone.lastIndexOf(':');
  if (lastColon === -1 || !withoutZone.slice(lastColon + 1).includes('.')) {
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
  if (normalized === '') return null;

  const compressedParts = normalized.split('::');
  if (compressedParts.length > 2) return null;

  const headPart = compressedParts[0];
  if (headPart === undefined) return null;
  const tailPart = compressedParts[1] ?? '';
  const head = headPart === '' ? [] : headPart.split(':');
  const tail = compressedParts.length === 1 || tailPart === '' ? [] : tailPart.split(':');
  const missingGroupCount = 8 - head.length - tail.length;
  if (compressedParts.length === 1 && missingGroupCount !== 0) return null;
  if (compressedParts.length === 2 && missingGroupCount < 1) return null;

  const groups = [
    ...head,
    ...Array.from({ length: compressedParts.length === 2 ? missingGroupCount : 0 }, () => '0'),
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

export function isHttpUrl(url: URL): boolean {
  return url.protocol === 'http:' || url.protocol === 'https:';
}

export function isIpAddressLiteral(address: string): boolean {
  const normalized = normalizeHostname(address);
  return parseIpv4Address(normalized) !== null || parseIpv6Address(normalized) !== null;
}

export function isBlockedIpAddress(address: string): boolean {
  const normalized = normalizeHostname(address);
  if (parseIpv4Address(normalized) !== null) return isBlockedIpv4Address(normalized);
  if (parseIpv6Address(normalized) !== null) return isBlockedIpv6Address(normalized);
  return true;
}

function isLocalNetworkHostname(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  return normalized === 'localhost' || normalized.endsWith('.localhost') || normalized.endsWith('.local');
}

export function isPublicHttpUrlByProtocolAndHost(url: URL): boolean {
  if (!isHttpUrl(url)) return false;
  if (isLocalNetworkHostname(url.hostname)) return false;
  if (!isIpAddressLiteral(url.hostname)) return true;
  return !isBlockedIpAddress(url.hostname);
}
