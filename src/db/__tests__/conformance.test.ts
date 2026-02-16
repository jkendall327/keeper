import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "./test-db.ts";
import { createKeeperDB } from "../db-impl.ts";
import { createMockDB } from "../../__tests__/mock-db.ts";
import type { KeeperDB } from "../types.ts";

/**
 * Conformance tests: run identical operations against both mock DB and real
 * SQLite DB. If they produce different results, the mock is lying and every
 * UI test using it is compromised.
 */
describe("Mock ↔ Real DB conformance: updateTagIcon", () => {
  let realDb: KeeperDB;
  let mockDb: KeeperDB;
  let idCounter: number;

  beforeEach(() => {
    idCounter = 0;
    realDb = createKeeperDB({
      db: createTestDb(),
      generateId: () => `n${String(++idCounter)}`,
      now: () => "2025-01-15 12:00:00",
    });

    // Reset counter so both DBs generate matching IDs
    idCounter = 0;
    mockDb = createMockDB();
  });

  it("updateTagIcon(star) → getAllTags returns icon:star in both", async () => {
    // Identical operations on both DBs
    for (const db of [realDb, mockDb]) {
      await db.createNote({ body: "test" });
      await db.addTag("n1", "work");
    }

    const realTags = await realDb.getAllTags();
    const mockTags = await mockDb.getAllTags();
    const realTagId = realTags[0]?.id;
    const mockTagId = mockTags[0]?.id;
    if (realTagId === undefined || mockTagId === undefined) {
      throw new Error("Expected tag to exist in both DBs");
    }

    await realDb.updateTagIcon(realTagId, "star");
    await mockDb.updateTagIcon(mockTagId, "star");

    const realResult = await realDb.getAllTags();
    const mockResult = await mockDb.getAllTags();

    expect(realResult).toHaveLength(1);
    expect(mockResult).toHaveLength(1);
    expect(realResult[0]?.icon).toBe("star");
    expect(mockResult[0]?.icon).toBe("star");
    expect(realResult[0]?.icon).toBe(mockResult[0]?.icon);
  });

  it("updateTagIcon(null) after star → getAllTags returns icon:null in both", async () => {
    for (const db of [realDb, mockDb]) {
      await db.createNote({ body: "test" });
      await db.addTag("n1", "work");
    }

    const realTagId = (await realDb.getAllTags())[0]?.id;
    const mockTagId = (await mockDb.getAllTags())[0]?.id;
    if (realTagId === undefined || mockTagId === undefined) {
      throw new Error("Expected tag to exist in both DBs");
    }

    // Set to star, then clear
    await realDb.updateTagIcon(realTagId, "star");
    await mockDb.updateTagIcon(mockTagId, "star");
    await realDb.updateTagIcon(realTagId, null);
    await mockDb.updateTagIcon(mockTagId, null);

    const realResult = await realDb.getAllTags();
    const mockResult = await mockDb.getAllTags();

    expect(realResult[0]).toEqual({ id: realTagId, name: "work", icon: null });
    expect(mockResult[0]).toEqual({ id: mockTagId, name: "work", icon: null });
    expect(realResult[0]?.icon).toBe(mockResult[0]?.icon);
  });

  it("updateTagIcon(briefcase) → getNote has tag.icon:briefcase in both", async () => {
    for (const db of [realDb, mockDb]) {
      await db.createNote({ body: "test" });
      await db.addTag("n1", "work");
    }

    const realTagId = (await realDb.getAllTags())[0]?.id;
    const mockTagId = (await mockDb.getAllTags())[0]?.id;
    if (realTagId === undefined || mockTagId === undefined) {
      throw new Error("Expected tag to exist in both DBs");
    }

    await realDb.updateTagIcon(realTagId, "briefcase");
    await mockDb.updateTagIcon(mockTagId, "briefcase");

    const realNote = await realDb.getNote("n1");
    const mockNote = await mockDb.getNote("n1");

    if (realNote === null || mockNote === null) {
      throw new Error("Expected note to exist in both DBs");
    }

    expect(realNote.tags[0]?.icon).toBe("briefcase");
    expect(mockNote.tags[0]?.icon).toBe("briefcase");
    expect(realNote.tags[0]?.icon).toBe(mockNote.tags[0]?.icon);
  });

  it("two notes share a tag, updateTagIcon → both notes updated in both DBs", async () => {
    for (const db of [realDb, mockDb]) {
      await db.createNote({ body: "first" });
      await db.createNote({ body: "second" });
      await db.addTag("n1", "shared");
      await db.addTag("n2", "shared");
    }

    const realTagId = (await realDb.getAllTags())[0]?.id;
    const mockTagId = (await mockDb.getAllTags())[0]?.id;
    if (realTagId === undefined || mockTagId === undefined) {
      throw new Error("Expected tag to exist in both DBs");
    }

    await realDb.updateTagIcon(realTagId, "folder");
    await mockDb.updateTagIcon(mockTagId, "folder");

    const realNote1 = await realDb.getNote("n1");
    const realNote2 = await realDb.getNote("n2");
    const mockNote1 = await mockDb.getNote("n1");
    const mockNote2 = await mockDb.getNote("n2");

    if (
      realNote1 === null ||
      realNote2 === null ||
      mockNote1 === null ||
      mockNote2 === null
    ) {
      throw new Error("Expected all notes to exist");
    }

    // Both notes have updated icon in real DB
    expect(realNote1.tags[0]?.icon).toBe("folder");
    expect(realNote2.tags[0]?.icon).toBe("folder");

    // Both notes have updated icon in mock DB
    expect(mockNote1.tags[0]?.icon).toBe("folder");
    expect(mockNote2.tags[0]?.icon).toBe("folder");

    // Real and mock agree
    expect(realNote1.tags[0]?.icon).toBe(mockNote1.tags[0]?.icon);
    expect(realNote2.tags[0]?.icon).toBe(mockNote2.tags[0]?.icon);
  });

  it("updateTagIcon then renameTag → icon preserved in both", async () => {
    for (const db of [realDb, mockDb]) {
      await db.createNote({ body: "test" });
      await db.addTag("n1", "old");
    }

    const realTagId = (await realDb.getAllTags())[0]?.id;
    const mockTagId = (await mockDb.getAllTags())[0]?.id;
    if (realTagId === undefined || mockTagId === undefined) {
      throw new Error("Expected tag to exist in both DBs");
    }

    await realDb.updateTagIcon(realTagId, "rocket_launch");
    await mockDb.updateTagIcon(mockTagId, "rocket_launch");
    await realDb.renameTag("old", "new");
    await mockDb.renameTag("old", "new");

    const realTags = await realDb.getAllTags();
    const mockTags = await mockDb.getAllTags();

    expect(realTags[0]?.name).toBe("new");
    expect(realTags[0]?.icon).toBe("rocket_launch");
    expect(mockTags[0]?.name).toBe("new");
    expect(mockTags[0]?.icon).toBe("rocket_launch");

    expect(realTags[0]?.icon).toBe(mockTags[0]?.icon);
    expect(realTags[0]?.name).toBe(mockTags[0]?.name);
  });

  it("updateTagIcon on non-existent tag → no error, existing tags untouched", async () => {
    // Create a real tag so we can verify it's not corrupted
    for (const db of [realDb, mockDb]) {
      await db.createNote({ body: "test" });
      await db.addTag("n1", "work");
    }

    const realTagId = (await realDb.getAllTags())[0]?.id;
    const mockTagId = (await mockDb.getAllTags())[0]?.id;
    if (realTagId === undefined || mockTagId === undefined) {
      throw new Error("Expected tag to exist in both DBs");
    }

    // Set a known icon on the real tag
    await realDb.updateTagIcon(realTagId, "star");
    await mockDb.updateTagIcon(mockTagId, "star");

    // Updating a non-existent tag ID should not throw and should not corrupt existing tags
    await realDb.updateTagIcon(999, "broken");
    await mockDb.updateTagIcon(999, "broken");

    const realTags = await realDb.getAllTags();
    const mockTags = await mockDb.getAllTags();
    expect(realTags).toHaveLength(1);
    expect(realTags[0]).toEqual({ id: realTagId, name: "work", icon: "star" });
    expect(mockTags).toHaveLength(1);
    expect(mockTags[0]).toEqual({ id: mockTagId, name: "work", icon: "star" });
  });
});
