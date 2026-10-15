import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { TuiAltScreen } from "@earendil-works/pi-tui";
import { registerCleanCopy } from "./hook.ts";

export default function cleanCopy(pi: ExtensionAPI) {
  registerCleanCopy(pi, TuiAltScreen.prototype);
}
