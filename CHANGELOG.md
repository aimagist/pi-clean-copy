# Changelog

## 0.1.1 — 2026-10-15

- Recover transcript content when Pi's viewport selection includes the scrollbar, padding, jump indicator or header/footer.
- Use layout/content coordinates rather than deleting pipe glyphs. Preserve literal code pipes and indentation.
- Enforce visible column limits on every recovered row; do not recover hidden transcript content behind overlays.
- Preserve native footer-only selections, unknown layouts, clipboard return values and errors.
- Add viewport, reverse-selection, clipping and safe-fallback coverage: 40 tests pass, plus a separate real-host smoke check on Pi 1.1.0.
- Manually confirmed working in Windows Terminal. Compatibility with other Pi versions and terminals remains unverified.

## 0.1.0 — Local prototype

- Clean repeated quote gutters and confirmed complete Unicode tables during fullscreen selection copy.
- Add `/clean-copy [on|off]` and guarded private-hook lifecycle cleanup.
- Preserve fenced code and ambiguous/empty cleanup results; leave `/copy` and terminal Shift-selection unchanged.
