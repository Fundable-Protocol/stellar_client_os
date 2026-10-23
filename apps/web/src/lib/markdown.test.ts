import { describe, expect, it } from "vitest";
import {
  escapeHtml,
  generateMarkdownExcerpt,
  markdownToPlainText,
  renderMarkdown,
  safeUrl,
} from "./markdown";

describe("renderMarkdown", () => {
  it("renders headings, paragraphs and emphasis", () => {
    const html = renderMarkdown("# Field report\n\nWe planted **120** trees this week.");
    expect(html).toContain("<h1>Field report</h1>");
    expect(html).toContain("<strong>120</strong>");
    expect(html).toContain("<p>We planted <strong>120</strong> trees this week.</p>");
  });

  it("renders lists and blockquotes", () => {
    const html = renderMarkdown("- one\n- two\n\n> A quote");
    expect(html).toContain("<ul><li>one</li><li>two</li></ul>");
    expect(html).toContain("<blockquote><p>A quote</p></blockquote>");
  });

  it("renders ordered lists", () => {
    const html = renderMarkdown("1. first\n2. second");
    expect(html).toContain("<ol><li>first</li><li>second</li></ol>");
  });

  it("keeps fenced code blocks verbatim", () => {
    const html = renderMarkdown("```bash\nnpm run build\n```");
    expect(html).toContain('<pre><code class="language-bash">npm run build</code></pre>');
  });

  it("escapes raw HTML so an author cannot inject markup", () => {
    const html = renderMarkdown("<script>alert('xss')</script>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders safe links and drops unsafe ones", () => {
    const html = renderMarkdown("[ok](https://fundable.stellar) [bad](javascript:alert(1))");
    expect(html).toContain('<a href="https://fundable.stellar" rel="noopener noreferrer">ok</a>');
    expect(html).not.toContain("javascript:");
  });

  it("renders images with an alt attribute", () => {
    const html = renderMarkdown("![a tree](https://cdn.example.com/tree.png)");
    expect(html).toContain('<img src="https://cdn.example.com/tree.png" alt="a tree"');
  });

  it("does not interpret inline code as markup", () => {
    const html = renderMarkdown("Use `**not bold**` here");
    expect(html).toContain("<code>**not bold**</code>");
    expect(html).not.toContain("<strong>not bold</strong>");
  });

  it("returns an empty string for empty input", () => {
    expect(renderMarkdown("")).toBe("");
  });
});

describe("escapeHtml", () => {
  it("escapes the unsafe characters", () => {
    expect(escapeHtml(`<a href="x">&'`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&amp;&#39;",
    );
  });
});

describe("safeUrl", () => {
  it("allows http, https, mailto and site-relative paths", () => {
    expect(safeUrl("https://example.com")).toBe("https://example.com");
    expect(safeUrl("http://example.com")).toBe("http://example.com");
    expect(safeUrl("mailto:a@b.com")).toBe("mailto:a@b.com");
    expect(safeUrl("/campaigns/1")).toBe("/campaigns/1");
    expect(safeUrl("#anchor")).toBe("#anchor");
  });

  it("rejects javascript, protocol-relative and unknown schemes", () => {
    expect(safeUrl("javascript:alert(1)")).toBeNull();
    expect(safeUrl("//evil.com")).toBeNull();
    expect(safeUrl("data:text/html;base64,abc")).toBeNull();
    expect(safeUrl("")).toBeNull();
  });
});

describe("markdownToPlainText", () => {
  it("strips markdown syntax", () => {
    const text = markdownToPlainText("# Title\n\nSome **bold** and _italic_ text.");
    expect(text).toBe("Title Some bold and italic text.");
  });
});

describe("generateMarkdownExcerpt", () => {
  it("returns the text when it fits", () => {
    expect(generateMarkdownExcerpt("Short update")).toBe("Short update");
  });

  it("truncates long text", () => {
    const excerpt = generateMarkdownExcerpt("a".repeat(300), 50);
    expect(excerpt.length).toBeLessThanOrEqual(51);
    expect(excerpt.endsWith("…")).toBe(true);
  });
});
