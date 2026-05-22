import { expect } from "chai";
import * as fc from "fast-check";
import {
  buildFrontmatter,
  stripExistingFrontmatter,
} from "../src/utils/frontmatter";
import { academicPaperFactory, itemFactory } from "./_factories";

// See test/format.test.ts for the style notes (Goldberg #1.1, #1.2, #1.3,
// #1.6, #1.7, #1.11). This file adds:
//   #1.9 — Test data factories so each test surfaces only what it cares
//          about. `academicPaperFactory()` returns a fully-populated item;
//          `itemFactory({ fields: { title: "X" } })` returns one with just
//          the override applied.
//   #1.10 — When an error is expected, use `expect(() => ...).to.throw(...)`
//           rather than try/catch. (Not exercised here; documented for the
//           next test that needs it.)

describe("frontmatter helpers #cold", function () {
  describe("buildFrontmatter", function () {
    it("When the parent item is null, then the function returns an empty string", function () {
      // Arrange
      const parent = null;

      // Act
      const result = buildFrontmatter(parent);

      // Assert
      expect(result).to.equal("");
    });

    it("When the item has no metadata and no library key, then no frontmatter block is emitted", function () {
      // Arrange — empty everything; key:"" suppresses the zotero_key line.
      const parent = itemFactory({ key: "" });

      // Act
      const result = buildFrontmatter(parent);

      // Assert
      expect(result).to.equal("");
    });

    it("When the title contains double quotes, then they are escaped inside the YAML scalar", function () {
      // Arrange
      const parent = itemFactory({
        fields: { title: 'Title with "quotes"' },
      });

      // Act
      const result = buildFrontmatter(parent);

      // Assert
      expect(result).to.include('title: "Title with \\"quotes\\""');
    });

    it("When the title contains a backslash, then the backslash is escaped inside the YAML scalar", function () {
      // Arrange
      const parent = itemFactory({ fields: { title: "back\\slash" } });

      // Act
      const result = buildFrontmatter(parent);

      // Assert
      expect(result).to.include('title: "back\\\\slash"');
    });

    it("When the item has multiple authors, then they are emitted as a YAML inline list in Last, First form", function () {
      // Arrange
      const parent = itemFactory({
        creators: [
          { firstName: "Alice", lastName: "Smith" },
          { firstName: "Bob", lastName: "Jones" },
        ],
      });

      // Act
      const result = buildFrontmatter(parent);

      // Assert
      expect(result).to.include('authors: ["Smith, Alice", "Jones, Bob"]');
    });

    it("When a creator has only a last name, then the single name is emitted with no 'undefined' leak", function () {
      // Arrange
      const parent = itemFactory({ creators: [{ lastName: "Anon" }] });

      // Act
      const result = buildFrontmatter(parent);

      // Assert
      expect(result).to.include('authors: ["Anon"]');
      expect(result).to.not.include("undefined");
    });

    it("When the date field is free-form ('April 2024'), then the four-digit year is extracted", function () {
      // Arrange
      const parent = itemFactory({ fields: { date: "April 2024" } });

      // Act
      const result = buildFrontmatter(parent);

      // Assert
      expect(result).to.include("year: 2024");
    });

    it("When a citationKey field is present on the item, then citation_key is emitted from it directly", function () {
      // Arrange
      const parent = itemFactory({
        fields: { title: "T", citationKey: "smith2024paper" },
      });

      // Act
      const result = buildFrontmatter(parent);

      // Assert
      expect(result).to.include('citation_key: "smith2024paper"');
    });

    it("When citationKey is empty but the extra field carries a 'Citation Key: ...' line, then citation_key is extracted from extra", function () {
      // Arrange
      const parent = itemFactory({
        fields: {
          title: "T",
          extra: "Citation Key: smith2024paper\nOther: stuff",
        },
      });

      // Act
      const result = buildFrontmatter(parent);

      // Assert
      expect(result).to.include('citation_key: "smith2024paper"');
    });

    it("When a realistic academic paper is passed, then title, authors, year, doi, url, zotero_key, and citation_key are all emitted", function () {
      // Arrange — realistic input (Goldberg #1.6) via the academic-paper factory.
      const parent = academicPaperFactory();

      // Act
      const result = buildFrontmatter(parent);

      // Assert
      expect(result).to.include('title: "Attention Is All You Need"');
      expect(result).to.include('"Vaswani, Ashish"');
      expect(result).to.include("year: 2017");
      expect(result).to.include('doi: "10.48550/arXiv.1706.03762"');
      expect(result).to.include('url: "https://arxiv.org/abs/1706.03762"');
      expect(result).to.include('zotero_key: "VASWANI17"');
      expect(result).to.include('citation_key: "vaswani2017attention"');
    });
  });

  describe("stripExistingFrontmatter", function () {
    it("When the markdown begins with a YAML block ending in LF, then the leading block is removed and the body is returned", function () {
      // Arrange
      const md = "---\nfoo: bar\n---\nbody";

      // Act
      const result = stripExistingFrontmatter(md);

      // Assert
      expect(result).to.equal("body");
    });

    it("When the markdown begins with a YAML block delimited by CRLF, then the leading block is removed and the body is returned", function () {
      // Arrange
      const md = "---\r\nfoo: bar\r\n---\r\nbody";

      // Act
      const result = stripExistingFrontmatter(md);

      // Assert
      expect(result).to.equal("body");
    });

    it("When the markdown has no opening fence, then the input is returned unchanged", function () {
      // Arrange
      const md = "no frontmatter here\nbody";

      // Act
      const result = stripExistingFrontmatter(md);

      // Assert
      expect(result).to.equal(md);
    });

    it("When the markdown opens with --- but has no closing fence, then the input is returned unchanged", function () {
      // Arrange
      const md = "---\nfoo: bar\nbody but no close";

      // Act
      const result = stripExistingFrontmatter(md);

      // Assert
      expect(result).to.equal(md);
    });

    // --------- Property-based tests ---------

    it("Property: For any body string, prefixing it with a valid YAML block always strips back to the original body", function () {
      fc.assert(
        fc.property(
          // Realistic-ish body: arbitrary text excluding the specific
          // sequence that could re-form a closing fence at the start.
          fc
            .string({ minLength: 0, maxLength: 100 })
            .filter((s) => !s.startsWith("---")),
          (body) => {
            // Arrange
            const md = `---\nkey: value\n---\n${body}`;

            // Act
            const result = stripExistingFrontmatter(md);

            // Assert
            expect(result).to.equal(body);
          },
        ),
      );
    });

    it("Property: For any string that does not start with '---', the function is a no-op", function () {
      fc.assert(
        fc.property(
          fc.string().filter((s) => !s.startsWith("---")),
          (s) => {
            // Arrange / Act
            const result = stripExistingFrontmatter(s);

            // Assert
            expect(result).to.equal(s);
          },
        ),
      );
    });
  });
});
