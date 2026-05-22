// Shared test factories.
//
// Each factory accepts an `overrides` object so individual tests can spell
// out only the fields that matter to the case (Goldberg #1.9: "copy code,
// but only what's necessary"). The full default is returned otherwise so the
// caller doesn't have to know every required field.

/**
 * Minimal subset of Zotero.Item that the pure helpers we test (currently
 * `buildFrontmatter`) actually touch. Adding to this list is fine — keep it
 * lean so tests don't grow a hidden dependency surface.
 */
interface MockCreator {
  firstName?: string;
  lastName?: string;
  name?: string;
}

interface ItemFactoryOverrides {
  /** Map of field name → string value, e.g. `{ title: "T", DOI: "10..." }`. */
  fields?: Record<string, string | undefined>;
  creators?: MockCreator[];
  /** The stable Zotero library key. Empty string opts out of zotero_key emission. */
  key?: string;
}

/**
 * Build a minimal Zotero.Item-shaped object suitable for passing to
 * `buildFrontmatter`. Defaults to a realistic-but-empty record so the caller
 * surfaces only what the test cares about.
 *
 * Example:
 *   itemFactory({ fields: { title: 'Realistic Paper Title' } })
 */
export function itemFactory(overrides: ItemFactoryOverrides = {}): Zotero.Item {
  const fields = overrides.fields ?? {};
  const creators = overrides.creators ?? [];
  const key = overrides.key ?? "ITMKEY42";
  return {
    key,
    getField: (name: string): string => fields[name] ?? "",
    getCreators: () => creators,
  } as unknown as Zotero.Item;
}

/**
 * A realistic-looking academic-paper item. Used for the happy-path
 * `buildFrontmatter` case so the expectations read against plausible input
 * rather than `"Foo"`-style placeholders (Goldberg #1.6).
 */
export function academicPaperFactory(
  overrides: ItemFactoryOverrides = {},
): Zotero.Item {
  return itemFactory({
    fields: {
      title: "Attention Is All You Need",
      DOI: "10.48550/arXiv.1706.03762",
      url: "https://arxiv.org/abs/1706.03762",
      date: "June 2017",
      citationKey: "vaswani2017attention",
      ...(overrides.fields ?? {}),
    },
    creators: overrides.creators ?? [
      { firstName: "Ashish", lastName: "Vaswani" },
      { firstName: "Noam", lastName: "Shazeer" },
      { firstName: "Niki", lastName: "Parmar" },
    ],
    key: overrides.key ?? "VASWANI17",
  });
}
