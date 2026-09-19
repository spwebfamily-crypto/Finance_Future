import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { catalogs, supportedLocales } from "./I18nContext";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "test" ? [] : sourceFiles(file);
    return /\.(ts|tsx)$/.test(entry.name) &&
      !entry.name.endsWith(".test.tsx") &&
      !entry.name.endsWith(".test.ts")
      ? [file]
      : [];
  });
}

describe("translation catalogs", () => {
  it("has a translation for every literal compatibility key still used by the UI", () => {
    const literals = new Set<string>();
    for (const file of sourceFiles(join(process.cwd(), "src"))) {
      if (file.endsWith("i18n/I18nContext.tsx")) continue;
      const contents = readFileSync(file, "utf8");
      for (const match of contents.matchAll(/\bt\(\s*(["'])((?:\\.|(?!\1).)*)\1/g)) {
        literals.add(match[2].replace(/\\(["'])/g, "$1"));
      }
    }

    const missing = [...literals].filter((key) =>
      supportedLocales.some((locale) => !catalogs[locale][key]),
    );
    expect(missing).toEqual([]);
  });
});
