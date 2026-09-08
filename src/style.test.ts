/// <reference types="node" />

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import stylesheet from "./style.css?raw";

const inputTagStylesheet = readFileSync(
  resolve(process.cwd(), "src/components/InputTag/input-tag.css"),
  "utf8",
);

describe("date picker stylesheet", () => {
  it("does not bundle Tailwind global theme or utility layers", () => {
    expect(stylesheet).not.toContain('@import "tailwindcss/theme"');
    expect(stylesheet).not.toContain('@import "tailwindcss/utilities"');
  });
});

describe("InputTag stylesheet", () => {
  it("does not create a stacking layer for the control root", () => {
    expect(inputTagStylesheet).not.toContain(
      ".rc-input-tag {\n  position: relative;\n  z-index: 20;",
    );
  });

  it("uses the admin-template focus treatment only for keyboard focus", () => {
    expect(inputTagStylesheet).toContain(
      ".rc-input-tag__combobox:focus-visible .rc-input-tag__surface",
    );
    expect(inputTagStylesheet).not.toContain(
      ".rc-input-tag__combobox:focus .rc-input-tag__surface",
    );
  });

  it("keeps portalled menus above application modals", () => {
    expect(inputTagStylesheet).toContain(".rc-input-tag__menu--portal {");
    // The layer is the application's to choose; the fallback only has to clear
    // a typical app overlay when it chooses nothing. See src/lib/layering.ts.
    expect(inputTagStylesheet).toContain(
      "z-index: var(--rc-z-popup, 100000);",
    );
    expect(inputTagStylesheet).not.toContain("z-index: 100000;");
  });
});
