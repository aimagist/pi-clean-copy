# pi-clean-copy

Cleaner mouse-selection copy for Pi fullscreen mode. Removes terminal decoration without blindly deleting pipe characters. MIT licensed; no runtime dependencies beyond Pi.

## Install and use

Install the pinned GitHub release:

```sh
pi install git:github.com/aimagist/pi-clean-copy@v0.1.1
```

Alternatively, run `pi install .` from a cloned or unpacked source directory.

Run `/reload` inside Pi, then `/clean-copy` to confirm `on (attached)`. For automatic copy on mouse release, enable `fullscreenCopyOnSelect` in Pi settings:

```json
{ "fullscreenCopyOnSelect": true }
```

Merge that key into existing settings; do not replace the settings file. This package does not change it for you.

Development alternative: put this directory under `~/.pi/agent/extensions/clean-copy/` and reload. Use one installation method only.

Drag **without Shift** to use Pi selection copy. With `fullscreenCopyOnSelect: true`, releasing the mouse copies automatically. With it `false`, select then press Ctrl+X; that selection uses the same cleanup. When automatic copy is enabled, Ctrl+X retains Pi's last-response behavior. This package does not change settings. Shift-drag uses terminal selection and bypasses cleanup.

- `/clean-copy`: status
- `/clean-copy on` or `/clean-copy off`: runtime toggle (default on)
- `/copy`: original last-message/source Markdown copy, unchanged

## Cleanup and limits

When Pi falls back to selecting the rendered viewport (a drag started outside the transcript), recovers the overlapping transcript through its layout/content coordinates. This excludes the right scrollbar, its padding, jump indicator and header/footer instead of deleting pipe characters. Footer-only selections remain native; overlays never reveal underlying transcript content. Unsupported private metadata or a different clipboard payload falls back to the native text.

Normalizes CRLF, removes repeated left quote gutters and turns gutter-only rows into blank lines. Complete Unicode box tables with matching rules and a header separator become tab-separated, space-trimmed cells. Preserves paragraph breaks, Unicode, ASCII pipes, arbitrary prose spacing, and fenced code indentation/literal box drawings (including quoted fences). Uncertain table fragments/diagrams stay intact where distinguishable; an empty or unstable cleanup falls back to the original selection.

No reflow, word joining, outer-margin guessing, ANSI stripping, or exact source Markdown reconstruction. Render wrapping remains. Partial selections may lack fences/table evidence; a literal left `│ ` is indistinguishable from a quote gutter. Pi already strips terminal sequences and trailing selection padding before this hook; table cell padding is removed here.

## Safety and rollback

The extension runs in Pi's process with your user permissions. It transforms only Pi's selection-copy path: no network requests, clipboard reading/monitoring, timers, telemetry, or host-file patches. It still delegates writing to Pi's existing clipboard implementation. Review the source before installing.

`/clean-copy off` immediately restores native selection-copy content for this runtime. For a package install, use `pi remove <the-installed-source>` and `/reload`; for a development-directory install, move the directory outside `extensions/` and reload. Do not install both copies.

## Compatibility and tests

Targets the inspected **Pi 1.1.0** private, writable `TuiAltScreen.prototype.copyTextToClipboard` API and its selection/layout metadata. Peer ranges are not a compatibility guarantee: recheck on upgrades. The host loader must resolve `pi-tui` to the same class used by the active renderer. Unsupported shapes warn once and leave native copy unchanged. Only TUI session start installs the hook; shutdown/reload deactivates it and restores the original only while still owned. Renderer replacements inherit the prototype hook. No widgets, timers, clipboard monitoring, or direct clipboard writes.

Native copy return values, failure notifications, and thrown/rejected errors propagate unchanged; this package does not turn failures into success.

Tested on **Pi 1.1.0, Node 24.12.0, Windows Terminal**. The user manually confirmed successful copying after the viewport fix; other Pi versions and terminals are not certified.

Run `npm test` (or `node --test test/*.test.ts`) with a Node version supporting TypeScript stripping. The package contains **40 passing tests** and needs no dependency install for those tests. Tests use fake native callbacks, never the clipboard. A separate local check also passed against Pi's real loader, Markdown renderer, SGR mouse parser, selection extraction, clipping and lifecycle; that environment-specific check is not bundled as a portable integration test.
