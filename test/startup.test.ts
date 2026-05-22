import { expect } from "chai";
import { config } from "../package.json";

// Two-level categorization (Goldberg #1.12): suite → unit-under-test → case.
// Test names follow the 3-part pattern (Goldberg #1.1): what / under what
// circumstances / what is the expected result.
describe("Plugin lifecycle #cold", function () {
  describe("addon registration", function () {
    it("When Zotero has finished startup, then the plugin instance is registered on the global Zotero object", function () {
      // Arrange — nothing; the test harness boots Zotero with the plugin
      // already loaded, so registration has happened before we get here.

      // Act
      const pluginInstance = Zotero[config.addonInstance];

      // Assert — BDD style (Goldberg #1.3). `to.exist` reads as the
      // requirement: the instance must be present. `to.not.be.empty` rules
      // out the degenerate case of a registered-but-empty stub.
      expect(pluginInstance).to.exist;
      expect(pluginInstance).to.not.be.empty;
    });
  });
});
