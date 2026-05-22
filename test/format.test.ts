import { expect } from "chai";
import * as fc from "fast-check";
import { truncateMiddle } from "../src/utils/format";

// Style notes for this file (Goldberg testing best practices):
//   #1.1 — 3-part test names (what / when / expected).
//   #1.2 — AAA structure with explicit Arrange / Act / Assert comments.
//   #1.3 — BDD-style `expect(...).to...` assertions over `assert.equal`.
//   #1.7 — Property-based tests with fast-check for invariants that should
//          hold over the entire input space.
//   #1.11 — Tagged `#cold` (fast, no IO) so a future runner config can grep.

describe("format helpers #cold", function () {
  describe("truncateMiddle", function () {
    // --------- Example-based tests ---------

    it("When input length is below max, then the original string is returned unchanged", function () {
      // Arrange
      const input = "short.pdf";
      const max = 40;

      // Act
      const result = truncateMiddle(input, max);

      // Assert
      expect(result).to.equal(input);
    });

    it("When input length equals max, then the original string is returned unchanged", function () {
      // Arrange
      const input = "x".repeat(10);
      const max = 10;

      // Act
      const result = truncateMiddle(input, max);

      // Assert
      expect(result).to.equal(input);
    });

    it("When max is 3 or less, then the head is returned with no ellipsis (because the ellipsis itself would not fit)", function () {
      // Arrange & Act
      const out3 = truncateMiddle("abcdefgh", 3);
      const out1 = truncateMiddle("abcdefgh", 1);

      // Assert
      expect(out3).to.equal("abc");
      expect(out1).to.equal("a");
      expect(out3).to.not.include("…");
      expect(out1).to.not.include("…");
    });

    it("When input is truncated, then both the head and tail of the original survive around an ellipsis", function () {
      // Arrange — realistic filename (Goldberg #1.6) instead of "foo".
      const filename = "very_long_paper_title_with_authors_and_more_stuff.pdf";
      const max = 30;

      // Act
      const result = truncateMiddle(filename, max);

      // Assert
      expect(result).to.have.lengthOf(max);
      expect(result).to.include("…");
      expect(result.startsWith("very_long_paper")).to.equal(true);
      expect(result.endsWith(".pdf")).to.equal(true);
    });

    it("When max=11 on a 16-char input, then the head/tail split is balanced (5 + ellipsis + 5)", function () {
      // Arrange — the issue-spec'd case: max=11 → keep=10 → head=ceil(5)=5, tail=floor(5)=5.
      const input = "abcdefghijklmnop";
      const max = 11;

      // Act
      const result = truncateMiddle(input, max);

      // Assert
      expect(result).to.equal("abcde…lmnop");
    });

    // --------- Property-based tests (fast-check) ---------
    //
    // Invariants that should hold over the entire input space, not just the
    // hand-picked examples above. fast-check shrinks counter-examples so
    // failures point at the minimum input that breaks the property.

    it("Property: For any string and any max ≥ 1, the result is never longer than max", function () {
      // Arrange / Act / Assert — all inside the property body.
      fc.assert(
        fc.property(fc.string(), fc.integer({ min: 1, max: 200 }), (s, max) => {
          const result = truncateMiddle(s, max);
          expect(result.length).to.be.at.most(max);
        }),
      );
    });

    it("Property: When input.length ≤ max, then the result equals the input", function () {
      fc.assert(
        fc.property(fc.string({ minLength: 0, maxLength: 50 }), (s) => {
          // Use max strictly ≥ s.length so the no-truncate branch is hit.
          const max = s.length + 1;
          const result = truncateMiddle(s, max);
          expect(result).to.equal(s);
        }),
      );
    });

    it("Property: When max ≥ 4 and input is longer than max, then the result always contains the ellipsis character", function () {
      fc.assert(
        fc.property(
          fc.string({ minLength: 5, maxLength: 200 }),
          fc.integer({ min: 4, max: 199 }),
          (s, max) => {
            // Pre-condition: only assert on inputs that will actually be truncated.
            fc.pre(s.length > max);
            const result = truncateMiddle(s, max);
            expect(result).to.include("…");
          },
        ),
      );
    });
  });
});
