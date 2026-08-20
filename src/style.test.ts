import { describe, expect, it } from "vitest";
import stylesheet from "./style.css?raw";

describe("date picker stylesheet", () => {
  it("does not bundle Tailwind global theme or utility layers", () => {
    expect(stylesheet).not.toContain('@import "tailwindcss/theme"');
    expect(stylesheet).not.toContain('@import "tailwindcss/utilities"');
  });
});
