import assert from "node:assert/strict";
import test from "node:test";
import { cleanSelection } from "../clean.ts";

const table = [
  "┌────────┬──────┐",
  "│ Name   │ Qty  │",
  "├────────┼──────┤",
  "│ apples │ 2    │",
  "├────────┼──────┤",
  "│ pears  │ 3    │",
  "└────────┴──────┘",
].join("\n");

const fixtures: [string, string][] = [
  ["│ Screenshot-like quote\r\n│ │ Nested quote\r\n│\r\n│ Next paragraph", "Screenshot-like quote\nNested quote\n\nNext paragraph"],
  [table, "Name\tQty\napples\t2\npears\t3"],
  [table.split("\n").map((line) => `│ │ ${line}`).join("\n"), "Name\tQty\napples\t2\npears\t3"],
  ["First paragraph\n\nsecond  paragraph | x || y, ∑ α → β\n👩‍💻 e\u0301 \u202eRTL\u202c", "First paragraph\n\nsecond  paragraph | x || y, ∑ α → β\n👩‍💻 e\u0301 \u202eRTL\u202c"],
  ["  meaningful margin\n    further indent\n\nASCII | pipes + --- separators", "  meaningful margin\n    further indent\n\nASCII | pipes + --- separators"],
  ["```ts\n    const x = '│ literal ┌─┐';  \n\t│ code\n    \\x1b[31m\n```", "```ts\n    const x = '│ literal ┌─┐';  \n\t│ code\n    \\x1b[31m\n```"],
  ["│ │   ```ts\n│ │     const x = '│ ├─┤';\n│ │ │ literal code\n│ │ \u001b[31m literal escape\n│ │   ```\n│ after", "  ```ts\n    const x = '│ ├─┤';\n│ literal code\n\u001b[31m literal escape\n  ```\nafter"],
  ["~~~~ language-name\n  indented\n~~~\n│ literal inside long tilde fence\n~~~~\n│ quote", "~~~~ language-name\n  indented\n~~~\n│ literal inside long tilde fence\n~~~~\nquote"],
  ["`````md\n```\n│ literal\n````\n│ still literal\n`````\n│ after", "`````md\n```\n│ literal\n````\n│ still literal\n`````\nafter"],
  ["```ts\n│ literal in unclosed fence", "```ts\n│ literal in unclosed fence"],
  ["    codeOnly();\n\treturn '┌─┐';", "    codeOnly();\n\treturn '┌─┐';"],
  ["│ partial │ cell │\n├────┼────┤", "│ partial │ cell │\n├────┼────┤"],
  ["┌────────┬──────┐\n│ Name   │ Qty  │\n├────────┼──────┤", "┌────────┬──────┐\n│ Name   │ Qty  │\n├────────┼──────┤"],
  ["┌──────┐\n│ node │\n└──────┘\n  │\n  └──→ next", "┌──────┐\n│ node │\n└──────┘\n  │\n  └──→ next"],
  ["┌──────┐\n│ node\n└──────┘", "┌──────┐\n│ node\n└──────┘"],
  ["├─ not a table ─┤\nα ─ β\nx | y\n---", "├─ not a table ─┤\nα ─ β\nx | y\n---"],
  ["", ""],
  ["│ ", "│ "],
  ["│\n│", "│\n│"],
  ["\n\n", "\n\n"],
];

test("conservative cleanup fixtures and idempotence", async (t) => {
  for (const [input, expected] of fixtures) {
    await t.test(JSON.stringify(input.slice(0, 55)), () => {
      assert.equal(cleanSelection(input), expected);
      assert.equal(cleanSelection(cleanSelection(input)), expected);
      if (input.length) assert.ok(cleanSelection(input).length);
    });
  }
});

test("incomplete boxes stop before unrelated tables, quote depths and code", () => {
  const mixed = "│ ┌───┐\n\n┌───┐\n│ h │\n├───┤\n│ v │\n└───┘";
  assert.equal(cleanSelection(mixed), "┌───┐\n\nh\nv");
  const changedDepth = "│ ┌────┐\n│ │ node\nOutside\n│ Quote";
  assert.equal(cleanSelection(changedDepth), "┌────┐\n│ node\nOutside\nQuote");
  const followedByCode = "┌───┐\n\n```text\n│ literal\n```\n│ quote";
  assert.equal(cleanSelection(followedByCode), "┌───┐\n\n```text\n│ literal\n```\nquote");
});

test("table rules must match; do not clean a mismatched box", () => {
  const malformed = table.replace("└────────┴──────┘", "└────┴──────┘");
  assert.equal(cleanSelection(malformed), malformed);
});

test("empty table output and newly exposed gutter text fall back to original", () => {
  const empty = "┌──┐\n│  │\n├──┤\n│  │\n└──┘";
  assert.equal(cleanSelection(empty), empty);
  const ambiguous = "┌──────────┐\n│ │ literal │\n├──────────┤\n│ value    │\n└──────────┘";
  assert.equal(cleanSelection(ambiguous), ambiguous);
  assert.equal(cleanSelection(cleanSelection(ambiguous)), ambiguous);
});

test("code fences protect tables and close only with matching marker/length", () => {
  const input = `│ ~~~~ js\n${table.split("\n").map((line) => `│ ${line}`).join("\n")}\n│ ~~~\n│ \`\`\`\n│ │ literal\n│ ~~~~\n│ prose`;
  const expected = `~~~~ js\n${table}\n~~~\n\`\`\`\n│ literal\n~~~~\nprose`;
  assert.equal(cleanSelection(input), expected);
  assert.equal(cleanSelection(expected), expected);
});
