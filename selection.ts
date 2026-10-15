type Point = { row: number; col: number; boundary?: boolean; scrollView?: object };
type Rect = { x: number; y: number; width: number; height: number };
type View = { scrollTop: number };
type Box = { rect: Rect; clip: Rect; children: Box[]; scrollView?: View; scrollContentLines?: readonly string[] };
type SelectionRenderer = {
  currentLayout?: { root: Box; primaryScrollView?: View; width: number; height: number };
  getSelectionBounds?: () => { start: Point; end: Point } | undefined;
  getActiveSelectionText?: () => string | undefined;
  getSelectionColumns?: (line: string, row: number, bounds: unknown, min?: number, max?: number) => { start: number; end: number };
  hasOverlay?: () => boolean;
};

function findView(box: Box, view: View): Box | undefined {
  if (box.scrollView === view) return box;
  for (const child of box.children) {
    const match = findView(child, view);
    if (match) return match;
  }
}

/** Recover transcript content when Pi selected screen coordinates, not a scroll view.
 * Private Pi 1.1.0 metadata. A detached snapshot keeps the visible selection untouched.
 */
export function transcriptSelection(receiver: unknown, copiedText: string): string | undefined {
  try {
    const tui = receiver as SelectionRenderer;
    const frame = tui.currentLayout;
    const view = frame?.primaryScrollView;
    if (!frame || !view || !tui.hasOverlay || !tui.getSelectionColumns || tui.hasOverlay()) return undefined;
    const bounds = tui.getSelectionBounds?.();
    if (!bounds || bounds.start.scrollView || bounds.end.scrollView ||
        tui.getActiveSelectionText?.() !== copiedText) return undefined;
    const box = findView(frame.root, view);
    if (!box?.scrollContentLines) return undefined;
    const top = Math.max(0, box.rect.y, box.clip.y);
    const bottom = Math.min(frame.height, box.rect.y + box.rect.height, box.clip.y + box.clip.height);
    const left = Math.max(0, box.rect.x, box.clip.x);
    const right = Math.min(frame.width, box.rect.x + box.rect.width, box.clip.x + box.clip.width);
    const first = Math.max(top, bounds.start.row);
    const last = Math.min(bottom - 1, bounds.end.row);
    if (first > last || left >= right ||
        (first === last && ((bounds.start.row === first && bounds.start.col >= right) ||
          (bounds.end.row === last && bounds.end.col < left)))) return undefined;
    const startCol = bounds.start.row === first ? bounds.start.col : left;
    const endCol = bounds.end.row === last ? bounds.end.col : right;
    const snapshot = Object.create(tui);
    snapshot.selectionAnchor = {
      row: view.scrollTop + first - box.rect.y,
      col: Math.max(left, Math.min(right, startCol)) - box.rect.x,
      scrollView: view,
    };
    snapshot.selectionFocus = {
      row: view.scrollTop + last - box.rect.y,
      col: Math.max(left, Math.min(right, endCol)) - box.rect.x,
      boundary: bounds.end.row !== last || endCol >= right || bounds.end.boundary,
      scrollView: view,
    };
    const nativeColumns = tui.getSelectionColumns;
    snapshot.getSelectionColumns = function (line: string, row: number, selection: unknown) {
      return nativeColumns.call(this, line, row, selection, left - box.rect.x, right - box.rect.x);
    };
    const text = tui.getActiveSelectionText!.call(snapshot);
    return text?.trim() ? text : undefined;
  } catch {
    // Unknown private layout/selection shape: preserve the native payload.
    return undefined;
  }
}
