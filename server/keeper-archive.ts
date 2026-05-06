export interface ArchiveEntry {
  path: string;
  data: Buffer;
}

interface CentralDirectoryEntry {
  path: string;
  data: Buffer;
  crc32: number;
  localHeaderOffset: number;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const crcTable = makeCrcTable();

export function createKeeperArchive(entries: ArchiveEntry[]): Buffer {
  const localParts: Buffer[] = [];
  const centralEntries: CentralDirectoryEntry[] = [];
  let offset = 0;

  for (const entry of entries) {
    assertArchivePath(entry.path);
    const pathBuffer = Buffer.from(encoder.encode(entry.path));
    const crc32 = calculateCrc32(entry.data);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc32, 14);
    localHeader.writeUInt32LE(entry.data.byteLength, 18);
    localHeader.writeUInt32LE(entry.data.byteLength, 22);
    localHeader.writeUInt16LE(pathBuffer.byteLength, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, pathBuffer, entry.data);
    centralEntries.push({
      path: entry.path,
      data: entry.data,
      crc32,
      localHeaderOffset: offset,
    });
    offset += localHeader.byteLength + pathBuffer.byteLength + entry.data.byteLength;
  }

  const centralParts: Buffer[] = [];
  let centralSize = 0;
  for (const entry of centralEntries) {
    const pathBuffer = Buffer.from(encoder.encode(entry.path));
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(entry.crc32, 16);
    centralHeader.writeUInt32LE(entry.data.byteLength, 20);
    centralHeader.writeUInt32LE(entry.data.byteLength, 24);
    centralHeader.writeUInt16LE(pathBuffer.byteLength, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(entry.localHeaderOffset, 42);

    centralParts.push(centralHeader, pathBuffer);
    centralSize += centralHeader.byteLength + pathBuffer.byteLength;
  }

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(centralEntries.length, 8);
  end.writeUInt16LE(centralEntries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, ...centralParts, end]);
}

export function readKeeperArchive(buffer: Buffer): Map<string, Buffer> {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  if (eocdOffset === -1) {
    throw new Error("Backup archive is not a valid ZIP file");
  }

  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralOffset = buffer.readUInt32LE(eocdOffset + 16);
  const entries = new Map<string, Buffer>();
  let offset = centralOffset;

  for (let i = 0; i < entryCount; i++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error("Backup archive central directory is invalid");
    }

    const compression = buffer.readUInt16LE(offset + 10);
    if (compression !== 0) {
      throw new Error("Backup archive uses unsupported compression");
    }

    const crc32 = buffer.readUInt32LE(offset + 16);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    if (compressedSize !== uncompressedSize) {
      throw new Error("Backup archive entry size is invalid");
    }

    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const path = decoder.decode(buffer.subarray(offset + 46, offset + 46 + nameLength));
    assertArchivePath(path);

    if (buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
      throw new Error(`Backup archive entry ${path} has an invalid local header`);
    }

    const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const data = buffer.subarray(dataStart, dataStart + compressedSize);
    if (calculateCrc32(data) !== crc32) {
      throw new Error(`Backup archive entry ${path} failed checksum validation`);
    }

    entries.set(path, Buffer.from(data));
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

function assertArchivePath(path: string) {
  if (
    path === "" ||
    path.startsWith("/") ||
    path.includes("\\") ||
    path.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new Error(`Invalid backup archive path: ${path}`);
  }
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  const minOffset = Math.max(0, buffer.byteLength - 0xffff - 22);
  for (let offset = buffer.byteLength - 22; offset >= minOffset; offset--) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  return -1;
}

function calculateCrc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = (crc >>> 8) ^ (crcTable[(crc ^ byte) & 0xff] ?? 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeCrcTable(): number[] {
  const table: number[] = [];
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc & 1) === 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    table.push(crc >>> 0);
  }
  return table;
}
