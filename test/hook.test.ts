import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { attachCleaner, registerCleanCopy } from "../hook.ts";

test("delegates clean text, receiver, extra arguments and exact native promises/results", async () => {
  for (const result of [true, false, "native clipboard error"]) {
    const promise = Promise.resolve(result);
    const target = {
      copyTextToClipboard(this: unknown, text: string, extra: unknown) {
        assert.equal(this, renderer);
        assert.equal(text, "hello");
        assert.equal(extra, 42);
        return promise;
      },
    };
    const renderer = Object.create(target);
    const original = Object.getOwnPropertyDescriptor(target, "copyTextToClipboard");
    const hook = attachCleaner(target, () => true)!;
    const returned = renderer.copyTextToClipboard("│ hello", 42);
    assert.equal(returned, promise);
    assert.equal(await returned, result);
    hook.dispose();
    assert.deepEqual(Object.getOwnPropertyDescriptor(target, "copyTextToClipboard"), original);
  }
});

test("native rejection and synchronous throw propagate unchanged", async () => {
  const error = new Error("native failure");
  const target = { copyTextToClipboard: (_text: string) => Promise.reject(error) };
  const hook = attachCleaner(target, () => true)!;
  await assert.rejects(target.copyTextToClipboard("│ hello"), (caught) => caught === error);
  hook.dispose();
  const throwing = { copyTextToClipboard(_text: string) { throw error; } };
  const otherHook = attachCleaner(throwing, () => true)!;
  assert.throws(() => throwing.copyTextToClipboard("│ hello"), (caught) => caught === error);
  otherHook.dispose();
});

test("on/off is passthrough without repeated wrapping; replacement renderers inherit hook", () => {
  let enabled = true;
  const texts: string[] = [];
  const target = { copyTextToClipboard(text: string) { texts.push(text); return true; } };
  const hook = attachCleaner(target, () => enabled)!;
  const wrapper = target.copyTextToClipboard;
  const firstRenderer = Object.create(target);
  firstRenderer.copyTextToClipboard("│ first");
  enabled = false;
  Object.create(target).copyTextToClipboard("│ original");
  enabled = true;
  Object.create(target).copyTextToClipboard("│ replacement");
  assert.equal(target.copyTextToClipboard, wrapper);
  assert.deepEqual(texts, ["first", "│ original", "replacement"]);
  hook.dispose();
});

test("unsupported targets remain entirely unchanged", () => {
  const readonly = {};
  Object.defineProperty(readonly, "copyTextToClipboard", { value: () => true, writable: false });
  const getter = { get copyTextToClipboard() { throw new Error("must not read accessor"); } };
  for (const target of [{}, { copyTextToClipboard: "unsupported" }, readonly, getter]) {
    const before = Object.getOwnPropertyDescriptors(target);
    assert.equal(attachCleaner(target, () => true), undefined);
    assert.deepEqual(Object.getOwnPropertyDescriptors(target), before);
  }
});

test("reload unwraps once; stale disposal never removes the new hook", () => {
  const native = (text: string) => text;
  const target = { copyTextToClipboard: native };
  let count = 0;
  const first = attachCleaner(target, () => { count++; return true; })!;
  const firstWrapper = target.copyTextToClipboard;
  const second = attachCleaner(target, () => { count++; return true; })!;
  const secondWrapper = target.copyTextToClipboard;
  first.dispose();
  assert.equal(target.copyTextToClipboard, secondWrapper);
  assert.equal(target.copyTextToClipboard("│ text"), "text");
  assert.equal(count, 1);
  assert.equal(firstWrapper("│ retained old wrapper"), "│ retained old wrapper");
  second.dispose();
  assert.equal(target.copyTextToClipboard, native);
  assert.equal(secondWrapper("│ retained new wrapper"), "│ retained new wrapper");
});

test("shutdown preserves a newer adapter and deactivates our wrapper inside its chain", () => {
  const native = (text: string) => text;
  const target = { copyTextToClipboard: native };
  const hook = attachCleaner(target, () => true)!;
  const ours = target.copyTextToClipboard;
  const newer = (text: string) => ours(text);
  target.copyTextToClipboard = newer;
  assert.equal(target.copyTextToClipboard("│ before"), "before");
  assert.equal(hook.isAttached(), false);
  hook.dispose();
  assert.equal(target.copyTextToClipboard, newer);
  assert.equal(target.copyTextToClipboard("│ after"), "│ after");
});

type Context = { mode: string; ui: { notify: (message: string, level: string) => void } };
function fakeAPI() {
  const handlers = new Map<string, (event: unknown, ctx: Context) => unknown>();
  let command!: (args: string, ctx: Context) => Promise<void>;
  const notifications: [string, string][] = [];
  const api = {
    on(name: string, handler: (event: unknown, ctx: Context) => unknown) { handlers.set(name, handler); },
    registerCommand(name: string, config: { handler: typeof command }) {
      assert.equal(name, "clean-copy");
      command = config.handler;
    },
  } as unknown as ExtensionAPI;
  const context = (mode = "tui"): Context => ({ mode, ui: { notify: (message, level) => notifications.push([message, level]) } });
  return { api, context, notifications, event: (name: string, ctx = context()) => handlers.get(name)!({}, ctx), command: (args: string, ctx = context()) => command(args, ctx) };
}

test("registration/nonTUI does not patch; TUI lifecycle supports status, toggles and shutdown", async () => {
  const native = (text: string) => text;
  const target = { copyTextToClipboard: native };
  const fake = fakeAPI();
  registerCleanCopy(fake.api, target);
  assert.equal(target.copyTextToClipboard, native);
  for (const mode of ["rpc", "json", "print"]) {
    fake.event("session_start", fake.context(mode));
    fake.event("session_shutdown", fake.context(mode));
    assert.equal(target.copyTextToClipboard, native);
  }
  assert.equal(fake.notifications.length, 0);
  fake.event("session_start");
  const wrapper = target.copyTextToClipboard;
  assert.notEqual(wrapper, native);
  assert.equal(wrapper("│ quote"), "quote");
  await fake.command("");
  assert.deepEqual(fake.notifications.at(-1), ["Clean copy: on (attached)", "info"]);
  await fake.command("off");
  assert.equal(target.copyTextToClipboard("│ quote"), "│ quote");
  assert.equal(target.copyTextToClipboard, wrapper);
  await fake.command("unexpected arg");
  assert.equal(fake.notifications.at(-1)?.[1], "error");
  assert.equal(target.copyTextToClipboard("│ quote"), "│ quote");
  await fake.command(" on ");
  assert.equal(target.copyTextToClipboard("│ quote"), "quote");
  fake.event("session_shutdown");
  assert.equal(target.copyTextToClipboard, native);
  assert.equal(wrapper("│ retained"), "│ retained");
});

test("session reloads restore hooks; separate extension registrations take ownership safely", () => {
  const native = (text: string) => text;
  const target = { copyTextToClipboard: native };
  const first = fakeAPI();
  registerCleanCopy(first.api, target);
  first.event("session_start");
  first.event("session_start");
  assert.equal(target.copyTextToClipboard("│ hello"), "hello");
  const second = fakeAPI();
  registerCleanCopy(second.api, target);
  second.event("session_start");
  const newest = target.copyTextToClipboard;
  first.event("session_shutdown");
  assert.equal(target.copyTextToClipboard, newest);
  second.event("session_shutdown");
  assert.equal(target.copyTextToClipboard, native);
});

test("unsupported lifecycle warns once with no prototype mutation", () => {
  const target = { copyTextToClipboard: undefined };
  const fake = fakeAPI();
  const before = Object.getOwnPropertyDescriptors(target);
  registerCleanCopy(fake.api, target);
  fake.event("session_start");
  fake.event("session_start");
  fake.event("session_shutdown");
  assert.deepEqual(Object.getOwnPropertyDescriptors(target), before);
  assert.equal(fake.notifications.length, 1);
  assert.equal(fake.notifications[0][1], "warning");
});
