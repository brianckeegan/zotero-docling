import { assert } from "chai";
import {
  buildFrontmatter,
  stripExistingFrontmatter,
} from "../src/utils/frontmatter";

// Minimal mock matching the subset of Zotero.Item that buildFrontmatter
// touches. Avoids pulling in a full Zotero shim.
function mockItem(
  fields: Record<string, string | undefined>,
  creators: Array<{
    firstName?: string;
    lastName?: string;
    name?: string;
  }> = [],
  key = "ABCD1234",
): Zotero.Item {
  return {
    key,
    getField: (name: string) => fields[name] ?? "",
    getCreators: () => creators,
  } as unknown as Zotero.Item;
}

describe("frontmatter helpers", function () {
  describe("buildFrontmatter", function () {
    it("returns empty string for null parent", function () {
      assert.strictEqual(buildFrontmatter(null), "");
    });

    it("returns empty string for an item with no metadata", function () {
      // No fields, no creators, no key — exercises the true "no metadata"
      // path (a key alone would have emitted a zotero_key line).
      const item = mockItem({}, [], "");
      assert.strictEqual(buildFrontmatter(item), "");
    });

    it("emits title with double-quote escaping", function () {
      const item = mockItem({ title: 'Title with "quotes"' });
      const out = buildFrontmatter(item);
      assert.include(out, 'title: "Title with \\"quotes\\""');
    });

    it("escapes backslashes in title", function () {
      const item = mockItem({ title: "back\\slash" });
      const out = buildFrontmatter(item);
      assert.include(out, 'title: "back\\\\slash"');
    });

    it("emits multiple authors as a YAML inline list", function () {
      const item = mockItem({}, [
        { firstName: "Alice", lastName: "Smith" },
        { firstName: "Bob", lastName: "Jones" },
      ]);
      const out = buildFrontmatter(item);
      assert.include(out, 'authors: ["Smith, Alice", "Jones, Bob"]');
    });

    it("handles creator with only lastName (no undefined leak)", function () {
      const item = mockItem({}, [{ lastName: "Anon" }]);
      const out = buildFrontmatter(item);
      assert.include(out, 'authors: ["Anon"]');
      assert.notInclude(out, "undefined");
    });

    it("extracts year from free-form date 'April 2024'", function () {
      const item = mockItem({ date: "April 2024" });
      const out = buildFrontmatter(item);
      assert.include(out, "year: 2024");
    });

    it("emits doi, url, zotero_key when present", function () {
      const item = mockItem(
        {
          title: "T",
          DOI: "10.1234/abc",
          url: "https://example.org",
        },
        [],
        "ZKEY123",
      );
      const out = buildFrontmatter(item);
      assert.include(out, 'doi: "10.1234/abc"');
      assert.include(out, 'url: "https://example.org"');
      assert.include(out, 'zotero_key: "ZKEY123"');
    });

    it("emits citation_key from explicit citationKey field", function () {
      const item = mockItem({ title: "T", citationKey: "smith2024paper" });
      const out = buildFrontmatter(item);
      assert.include(out, 'citation_key: "smith2024paper"');
    });

    it("falls back to extra-field 'Citation Key:' for citation_key", function () {
      const item = mockItem({
        title: "T",
        extra: "Citation Key: smith2024paper\nOther: stuff",
      });
      const out = buildFrontmatter(item);
      assert.include(out, 'citation_key: "smith2024paper"');
    });
  });

  describe("stripExistingFrontmatter", function () {
    it("strips a leading YAML block (LF)", function () {
      const md = "---\nfoo: bar\n---\nbody";
      assert.strictEqual(stripExistingFrontmatter(md), "body");
    });

    it("strips a leading YAML block (CRLF)", function () {
      const md = "---\r\nfoo: bar\r\n---\r\nbody";
      assert.strictEqual(stripExistingFrontmatter(md), "body");
    });

    it("returns markdown unchanged when there is no opening ---", function () {
      const md = "no frontmatter here\nbody";
      assert.strictEqual(stripExistingFrontmatter(md), md);
    });

    it("returns markdown unchanged when there is no closing ---", function () {
      const md = "---\nfoo: bar\nbody but no close";
      assert.strictEqual(stripExistingFrontmatter(md), md);
    });
  });
});
