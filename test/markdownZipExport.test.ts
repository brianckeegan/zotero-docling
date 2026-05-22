import { assert } from "chai";
import {
  zipBaseName,
  zipUniqueName,
  todayIsoDate,
} from "../src/modules/markdownZipExport";

// Minimal Zotero.Item-shaped factory for the zipBaseName tests. Mirrors
// the same shape `itemFactory` would emit but is duplicated here so this
// test file doesn't depend on the test/_factories.ts module (which lands
// in a separate PR).
function mockItem(
  fields: Record<string, string | undefined>,
  key: string,
): Zotero.Item {
  return {
    key,
    getField: (name: string) => fields[name] ?? "",
    getCreators: () => [],
  } as unknown as Zotero.Item;
}

describe("markdownZipExport pure helpers", function () {
  describe("zipBaseName", function () {
    it('returns "unknown" when parent is null', function () {
      assert.strictEqual(zipBaseName(null), "unknown");
    });

    it("uses citationKey field when present", function () {
      const item = mockItem({ citationKey: "smith2024paper" }, "ABCD1234");
      assert.strictEqual(zipBaseName(item), "smith2024paper");
    });

    it("falls back to Citation Key line in extra field", function () {
      const item = mockItem(
        { extra: "Citation Key: smith2024paper\nMore: stuff" },
        "ABCD1234",
      );
      assert.strictEqual(zipBaseName(item), "smith2024paper");
    });

    it("falls back to the Zotero key when nothing else is available", function () {
      const item = mockItem({}, "ABCD1234");
      assert.strictEqual(zipBaseName(item), "ABCD1234");
    });

    it('returns "unknown" when key is empty and no citation info', function () {
      const item = mockItem({}, "");
      assert.strictEqual(zipBaseName(item), "unknown");
    });

    it("strips filesystem-hostile characters", function () {
      const item = mockItem({ citationKey: "a/b:c*d?e" }, "K");
      assert.strictEqual(zipBaseName(item), "a_b_c_d_e");
    });
  });

  describe("zipUniqueName", function () {
    it("returns base.md for a fresh name", function () {
      const taken = new Set<string>();
      assert.strictEqual(zipUniqueName("paper", taken), "paper.md");
      assert.isTrue(taken.has("paper.md"));
    });

    it("disambiguates collisions with .1, .2, ...", function () {
      const taken = new Set<string>();
      assert.strictEqual(zipUniqueName("paper", taken), "paper.md");
      assert.strictEqual(zipUniqueName("paper", taken), "paper.1.md");
      assert.strictEqual(zipUniqueName("paper", taken), "paper.2.md");
    });

    it("disambiguation is per-base — different bases do not interfere", function () {
      const taken = new Set<string>();
      zipUniqueName("a", taken);
      zipUniqueName("a", taken);
      assert.strictEqual(zipUniqueName("b", taken), "b.md");
    });

    it("mutates the taken set so repeated calls remain stable", function () {
      const taken = new Set<string>();
      const names = [
        zipUniqueName("x", taken),
        zipUniqueName("x", taken),
        zipUniqueName("x", taken),
      ];
      assert.deepStrictEqual(names, ["x.md", "x.1.md", "x.2.md"]);
      assert.strictEqual(taken.size, 3);
    });
  });

  describe("todayIsoDate", function () {
    it("returns a YYYY-MM-DD string from a given Date", function () {
      const d = new Date("2026-05-21T14:30:00Z");
      assert.strictEqual(todayIsoDate(d), "2026-05-21");
    });

    it("returns 10 characters when called with no args", function () {
      const out = todayIsoDate();
      assert.strictEqual(out.length, 10);
      assert.match(out, /^\d{4}-\d{2}-\d{2}$/);
    });
  });
});
