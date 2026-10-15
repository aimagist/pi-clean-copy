import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { cleanSelection } from "./clean.ts";
import { transcriptSelection } from "./selection.ts";

const ownerKey = Symbol.for("pi-clean-copy.prototype-owner.v1");
type OwnedCopy = ((this: unknown, text: string, ...args: unknown[]) => unknown) & {
  [ownerKey]?: { dispose: () => void };
};

/** Private Pi 1.1.0 seam. Never touches a clipboard itself. */
export function attachCleaner(target: object, isEnabled: () => boolean) {
  let descriptor = Object.getOwnPropertyDescriptor(target, "copyTextToClipboard");
  if (!descriptor?.writable || typeof descriptor.value !== "function") return undefined;
  const previous = descriptor.value as OwnedCopy;
  previous[ownerKey]?.dispose();
  descriptor = Object.getOwnPropertyDescriptor(target, "copyTextToClipboard");
  if (!descriptor?.writable || typeof descriptor.value !== "function") return undefined;
  const native = descriptor.value as OwnedCopy;
  let active = true;
  const wrapper: OwnedCopy = function (text, ...args) {
    const cleaned = active && isEnabled() ? cleanSelection(transcriptSelection(this, text) ?? text) : text;
    return Reflect.apply(native, this, [cleaned, ...args]);
  };
  const isAttached = () => Object.getOwnPropertyDescriptor(target, "copyTextToClipboard")?.value === wrapper;
  const dispose = () => {
    // Deactivate even if a newer adapter retains our wrapper in its chain.
    active = false;
    if (isAttached()) Object.defineProperty(target, "copyTextToClipboard", descriptor!);
  };
  wrapper[ownerKey] = { dispose };
  Object.defineProperty(target, "copyTextToClipboard", { ...descriptor, value: wrapper });
  return { dispose, isAttached };
}

// Kept separate from the runtime host import so lifecycle tests need no host or
// clipboard. Merely registering the extension never changes the prototype.
export function registerCleanCopy(pi: ExtensionAPI, target: object) {
  let enabled = true;
  let warned = false;
  let hook: ReturnType<typeof attachCleaner>;
  pi.on("session_start", (_event, ctx) => {
    hook?.dispose();
    hook = undefined;
    if (ctx.mode !== "tui") return;
    hook = attachCleaner(target, () => enabled);
    if (!hook && !warned) {
      warned = true;
      ctx.ui.notify("Clean copy: unsupported private API; native selection copy unchanged.", "warning");
    }
  });
  pi.on("session_shutdown", () => {
    hook?.dispose();
    hook = undefined;
  });
  pi.registerCommand("clean-copy", {
    description: "Selection cleanup status, or on/off",
    handler: async (args, ctx) => {
      const arg = args.trim();
      if (arg && arg !== "on" && arg !== "off") {
        ctx.ui.notify("Usage: /clean-copy [on|off]", "error");
        return;
      }
      if (arg) enabled = arg === "on";
      const status = !enabled ? "off" : hook?.isAttached() ? "on (attached)" : "on (unavailable; TUI fullscreen only)";
      ctx.ui.notify(`Clean copy: ${status}`, "info");
    },
  });
}
