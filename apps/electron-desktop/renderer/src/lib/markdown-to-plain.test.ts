import { describe, expect, it } from "vitest";

import { markdownToPlainText } from "./markdown-to-plain";

describe("markdownToPlainText", () => {
  it("returns empty string for nullish input", () => {
    expect(markdownToPlainText(null)).toBe("");
    expect(markdownToPlainText(undefined)).toBe("");
    expect(markdownToPlainText("")).toBe("");
  });

  it("strips bold and italic", () => {
    expect(markdownToPlainText("**bold** and *italic*")).toBe("bold and italic");
    expect(markdownToPlainText("__bold__ and _italic_")).toBe("bold and italic");
  });

  it("strips strikethrough", () => {
    expect(markdownToPlainText("~~gone~~ here")).toBe("gone here");
  });

  it("strips headings", () => {
    expect(markdownToPlainText("# Title\n## Subtitle")).toBe("Title Subtitle");
  });

  it("strips inline code but keeps content", () => {
    expect(markdownToPlainText("Use `npm install` please")).toBe("Use npm install please");
  });

  it("strips fenced code blocks keeping inner lines", () => {
    const input = "Run this:\n```bash\nnpm test\n```\nThanks";
    expect(markdownToPlainText(input)).toBe("Run this: npm test Thanks");
  });

  it("replaces links with their label", () => {
    expect(markdownToPlainText("See [docs](https://example.com) for help")).toBe(
      "See docs for help"
    );
  });

  it("replaces images with their alt text", () => {
    expect(markdownToPlainText("![diagram](x.png) caption")).toBe("diagram caption");
  });

  it("drops reference-style link definitions", () => {
    const input = "See [docs][1] now\n\n[1]: https://example.com";
    expect(markdownToPlainText(input)).toBe("See docs now");
  });

  it("unwraps angle-bracket auto-links", () => {
    expect(markdownToPlainText("email me at <mailto:foo@example.com>")).toBe(
      "email me at mailto:foo@example.com"
    );
  });

  it("strips list markers", () => {
    const input = "- first\n- second\n1. third\n2) fourth";
    expect(markdownToPlainText(input)).toBe("first second third fourth");
  });

  it("strips blockquotes", () => {
    expect(markdownToPlainText("> quoted line\n> next")).toBe("quoted line next");
  });

  it("removes horizontal rules", () => {
    expect(markdownToPlainText("before\n---\nafter")).toBe("before after");
  });

  it("removes HTML tags", () => {
    expect(markdownToPlainText("<b>hi</b> <br/> there")).toBe("hi there");
  });

  it("cleans up tables", () => {
    const input = "| a | b |\n| --- | --- |\n| 1 | 2 |";
    expect(markdownToPlainText(input)).toBe("a b 1 2");
  });

  it("unescapes backslash-escaped punctuation", () => {
    expect(markdownToPlainText("literal \\* star")).toBe("literal * star");
  });

  it("collapses multi-line whitespace into a single line", () => {
    expect(markdownToPlainText("one\n\n\ntwo\n   three")).toBe("one two three");
  });

  it("leaves plain text untouched", () => {
    expect(markdownToPlainText("Hello, world!")).toBe("Hello, world!");
  });

  it("handles mixed markdown sentence used in a real agent reply", () => {
    const input = [
      "## Done",
      "",
      "- Added a **new** section",
      "- Fixed `calculateTotal` in [math.ts](math.ts)",
      "",
      "```ts",
      "const x = 1;",
      "```",
    ].join("\n");
    expect(markdownToPlainText(input)).toBe(
      "Done Added a new section Fixed calculateTotal in math.ts const x = 1;"
    );
  });
});
