type Fence = { marker: string; length: number; quotes: number };

function unquote(line: string, limit = Infinity): { line: string; depth: number } {
  let depth = 0;
  while (depth < limit && line.startsWith("│ ")) {
    line = line.slice(2);
    depth++;
  }
  if (depth < limit && line === "│") {
    line = "";
    depth++;
  }
  return { line, depth };
}

// Require the complete box, matching rules, and a header separator. Partial
// selections and diagrams without this evidence are deliberately left alone.
function tableAt(lines: string[], start: number, quotes: number, top: string) {
  if (!/^┌─+(?:┬─+)*┐$/.test(top)) return undefined;
  const middle = top.replace("┌", "├").replaceAll("┬", "┼").replace("┐", "┤");
  const bottom = top.replace("┌", "└").replaceAll("┬", "┴").replace("┐", "┘");
  const columns = top.split("┬").length;
  const rows: string[] = [];
  let separator = false;
  for (let end = start + 1; end < lines.length; end++) {
    const stripped = unquote(lines[end], quotes);
    if (stripped.depth !== quotes) return undefined;
    const line = stripped.line;
    if (line === bottom) {
      return rows.length && separator ? { end, rows } : undefined;
    }
    if (line === middle) {
      if (!rows.length) return undefined;
      separator = true;
      continue;
    }
    if (!line.startsWith("│ ") || !line.endsWith(" │")) return undefined;
    const cells = line.slice(2, -2).split(" │ ");
    if (cells.length !== columns) return undefined;
    // Trim render padding (ASCII spaces only), not Unicode text or controls.
    rows.push(cells.map((cell) => cell.replace(/^ +| +$/g, "")).join("\t"));
  }
  return undefined;
}

function cleanOnce(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const output: string[] = [];
  let fence: Fence | undefined;
  for (let i = 0; i < lines.length; i++) {
    if (fence) {
      const line = unquote(lines[i], fence.quotes).line;
      output.push(line);
      const close = /^[ \t]*(`{3,}|~{3,})[ \t]*$/.exec(line);
      if (close && close[1][0] === fence.marker && close[1].length >= fence.length) {
        fence = undefined;
      }
      continue;
    }
    const stripped = unquote(lines[i]);
    const table = tableAt(lines, i, stripped.depth, stripped.line);
    if (table) {
      output.push(...table.rows);
      i = table.end;
      continue;
    }
    if (/^┌─+(?:┬─+)*┐$/.test(stripped.line)) {
      // An incomplete table or a box diagram: retain its rules and cells,
      // removing only quote prefixes established by the top border.
      const middle = stripped.line.replace("┌", "├").replaceAll("┬", "┼").replace("┐", "┤");
      const bottom = stripped.line.replace("┌", "└").replaceAll("┬", "┴").replace("┐", "┘");
      output.push(stripped.line);
      while (i + 1 < lines.length) {
        const next = unquote(lines[i + 1], stripped.depth);
        if (next.depth !== stripped.depth ||
            !(next.line.startsWith("│") || next.line === middle || next.line === bottom)) break;
        i++;
        output.push(next.line);
        if (next.line === bottom) break;
      }
      continue;
    }
    // An unconfirmed table/box row must not be mistaken for a quote gutter.
    const line = lines[i].endsWith("│") && stripped.line !== "" ? lines[i] : stripped.line;
    const open = /^[ \t]*(`{3,}|~{3,})(.*)$/.exec(line);
    if (open && (open[1][0] !== "`" || !open[2].includes("`"))) {
      fence = { marker: open[1][0], length: open[1].length, quotes: stripped.depth };
    }
    output.push(line);
  }
  return output.join("\n");
}

/** Conservative render-to-plain cleanup; never reconstructs source Markdown. */
export function cleanSelection(text: string): string {
  const cleaned = cleanOnce(text);
  if ((!cleaned.trim() && text.trim()) || (text.length > 0 && cleaned.length === 0)) return text;
  // A cell can itself contain gutter-like text. Don't expose another cleanup
  // pass to it: retain ambiguous input rather than sacrificing idempotence.
  return cleanOnce(cleaned) === cleaned ? cleaned : text;
}
