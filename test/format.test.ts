import { assert } from "chai";
import { truncateMiddle, formatDuration } from "../src/utils/format";

describe("format helpers", function () {
  describe("truncateMiddle", function () {
    it("returns the string unchanged when shorter than max", function () {
      assert.strictEqual(truncateMiddle("short.pdf", 40), "short.pdf");
    });

    it("returns the string unchanged when exactly max", function () {
      const s = "x".repeat(10);
      assert.strictEqual(truncateMiddle(s, 10), s);
    });

    it("returns first max characters with no ellipsis when max <= 3", function () {
      assert.strictEqual(truncateMiddle("abcdefgh", 3), "abc");
      assert.strictEqual(truncateMiddle("abcdefgh", 1), "a");
    });

    it("preserves head and tail when truncating", function () {
      const out = truncateMiddle(
        "very_long_paper_title_with_authors_and_more_stuff.pdf",
        30,
      );
      assert.include(out, "…");
      assert.ok(out.startsWith("very_long_paper"), `got: ${out}`);
      assert.ok(out.endsWith(".pdf"), `got: ${out}`);
      assert.strictEqual(out.length, 30);
    });

    it("balanced head and tail", function () {
      // max=11 → keep=10 (1 for "…"), head=5, tail=5
      const out = truncateMiddle("abcdefghijklmnop", 11);
      assert.strictEqual(out.length, 11);
      assert.strictEqual(out, "abcde…lmnop");
    });
  });

  describe("formatDuration", function () {
    it("returns 0s for zero, undefined, NaN, negative", function () {
      assert.strictEqual(formatDuration(0), "0s");
      assert.strictEqual(formatDuration(undefined), "0s");
      assert.strictEqual(formatDuration(NaN), "0s");
      assert.strictEqual(formatDuration(-5), "0s");
    });

    it("formats seconds under a minute", function () {
      assert.strictEqual(formatDuration(42), "42s");
      assert.strictEqual(formatDuration(59), "59s");
    });

    it("formats minutes and seconds", function () {
      assert.strictEqual(formatDuration(60), "1m");
      assert.strictEqual(formatDuration(252), "4m 12s");
    });

    it("formats hours, minutes, seconds", function () {
      assert.strictEqual(formatDuration(3600), "1h 0m");
      assert.strictEqual(formatDuration(3725), "1h 2m 5s");
      assert.strictEqual(formatDuration(7384), "2h 3m 4s");
    });

    it("rounds fractional seconds", function () {
      assert.strictEqual(formatDuration(0.4), "0s");
      assert.strictEqual(formatDuration(1.6), "2s");
      assert.strictEqual(formatDuration(61.6), "1m 2s");
    });
  });
});
