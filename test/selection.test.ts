import assert from "node:assert/strict";
import test from "node:test";
import { transcriptSelection } from "../selection.ts";

function fixture() {
  const raw = "UI header\ncontent                     ┃\nfooter";
  const view = { scrollTop: 3 };
  const box = {
    rect: { x: 5, y: 2, width: 30, height: 5 },
    clip: { x: 5, y: 2, width: 30, height: 5 },
    children: [], scrollView: view,
    scrollContentLines: Array.from({ length: 12 }, (_, i) => `content ${i}`),
  };
  const snapshots: any[] = [];
  const tui: any = {
    currentLayout: {
      root: { children: [box] }, primaryScrollView: view, width: 60, height: 10,
    },
    selectionAnchor: { row: 0, col: 0 }, selectionFocus: { row: 9, col: 59 },
    hasOverlay: () => false,
    getSelectionBounds() { return { start: this.selectionAnchor, end: this.selectionFocus }; },
    getSelectionColumns(_line: string, _row: number, _bounds: unknown, min = 0, max = 100) {
      return { start: min, end: max };
    },
    getActiveSelectionText() {
      if (this === tui) return raw;
      snapshots.push(this);
      return "transcript content";
    },
  };
  return { raw, view, box, tui, snapshots };
}

test("screen selection maps to clipped transcript/content coordinates without mutating renderer", () => {
  const { raw, view, tui, snapshots } = fixture();
  const anchor = tui.selectionAnchor;
  const focus = tui.selectionFocus;
  assert.equal(transcriptSelection(tui, raw), "transcript content");
  const snapshot = snapshots[0];
  assert.equal(Object.getPrototypeOf(snapshot), tui);
  assert.deepEqual(snapshot.selectionAnchor, { row: 3, col: 0, scrollView: view });
  assert.deepEqual(snapshot.selectionFocus, { row: 7, col: 30, boundary: true, scrollView: view });
  assert.equal(tui.selectionAnchor, anchor);
  assert.equal(tui.selectionFocus, focus);
});

test("partial endpoint columns, boundary and clipping remain aligned", () => {
  const { raw, view, tui, snapshots, box } = fixture();
  tui.selectionAnchor = { row: 3, col: 8 };
  tui.selectionFocus = { row: 4, col: 12, boundary: true };
  assert.equal(transcriptSelection(tui, raw), "transcript content");
  assert.deepEqual(snapshots[0].selectionAnchor, { row: 4, col: 3, scrollView: view });
  assert.deepEqual(snapshots[0].selectionFocus, { row: 5, col: 7, boundary: true, scrollView: view });
  box.clip = { x: 9, y: 4, width: 10, height: 2 };
  tui.selectionAnchor = { row: 0, col: 0 };
  tui.selectionFocus = { row: 9, col: 59 };
  transcriptSelection(tui, raw);
  assert.deepEqual(snapshots[1].selectionAnchor, { row: 5, col: 4, scrollView: view });
  assert.deepEqual(snapshots[1].selectionFocus, { row: 6, col: 14, boundary: true, scrollView: view });
});

test("all snapshot rows constrain native column extraction to the visible clip", () => {
  const { raw, tui, snapshots, box } = fixture();
  box.clip = { x: 9, y: 2, width: 10, height: 5 };
  transcriptSelection(tui, raw);
  const snapshot = snapshots[0];
  assert.deepEqual(snapshot.getSelectionColumns("hidden on both sides", 5, {}), { start: 4, end: 14 });
  assert.deepEqual(tui.getSelectionColumns("unchanged native", 5, {}), { start: 0, end: 100 });
});

test("normal scroll-view selections, footer-only selections and off-column selections use original payload", () => {
  const { raw, view, tui, snapshots } = fixture();
  tui.selectionAnchor.scrollView = view;
  tui.selectionFocus.scrollView = view;
  assert.equal(transcriptSelection(tui, raw), undefined);
  tui.selectionAnchor = { row: 8, col: 0 };
  tui.selectionFocus = { row: 9, col: 50 };
  assert.equal(transcriptSelection(tui, raw), undefined);
  tui.selectionAnchor = { row: 3, col: 40 };
  tui.selectionFocus = { row: 3, col: 50 };
  assert.equal(transcriptSelection(tui, raw), undefined);
  tui.selectionAnchor = { row: 3, col: 0 };
  tui.selectionFocus = { row: 3, col: 3 };
  assert.equal(transcriptSelection(tui, raw), undefined);
  assert.equal(snapshots.length, 0);
});

test("overlays and different clipboard payloads never reveal underlying transcript", () => {
  const { raw, tui, snapshots } = fixture();
  tui.hasOverlay = () => true;
  assert.equal(transcriptSelection(tui, raw), undefined);
  tui.hasOverlay = () => false;
  assert.equal(transcriptSelection(tui, "another extension's payload"), undefined);
  assert.equal(snapshots.length, 0);
});

test("unsupported metadata, native snapshot errors and whitespace-only results preserve native payload", () => {
  assert.equal(transcriptSelection(undefined, "text"), undefined);
  assert.equal(transcriptSelection({}, "text"), undefined);
  const { raw, tui } = fixture();
  tui.getActiveSelectionText = function () { if (this === tui) return raw; throw new Error("private state unsupported"); };
  assert.equal(transcriptSelection(tui, raw), undefined);
  tui.getActiveSelectionText = function () { return this === tui ? raw : "\n  "; };
  assert.equal(transcriptSelection(tui, raw), undefined);
  tui.currentLayout.root = { children: [] };
  assert.equal(transcriptSelection(tui, raw), undefined);
});
