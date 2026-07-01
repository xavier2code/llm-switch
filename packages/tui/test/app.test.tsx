import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { App } from "../src/app.js";
import { ProfileStore } from "@xavier2code/llm-switch-core/store/profile-store.js";
import { TARGETS, getTarget } from "@xavier2code/llm-switch-core/config.js";

let tmpDir: string;
let store: ProfileStore;
const claude = getTarget("claude");

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "llm-switch-tui-"));
  process.env.CLAUDE_CONFIG_DIR = tmpDir;
  store = new ProfileStore(path.join(tmpDir, "llm-switch"));
});

afterEach(async () => {
  delete process.env.CLAUDE_CONFIG_DIR;
  await fs.rm(tmpDir, { recursive: true, force: true });
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function mockFetch(ok = true, status = 200) {
  const fn = vi.fn().mockResolvedValue({ ok, status, text: async () => "" });
  vi.stubGlobal("fetch", fn);
  return fn;
}

async function tick(ms = 20) {
  await new Promise((r) => setTimeout(r, ms));
}

async function waitForFrame(
  lastFrame: () => string,
  predicate: (frame: string) => boolean,
  timeout = 1000,
) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (predicate(lastFrame())) return;
    await tick(20);
  }
  throw new Error(`Timeout waiting for frame: ${lastFrame()}`);
}

describe("App", () => {
  it("renders TUI header and target list", () => {
    const { lastFrame } = render(<App store={store} targets={TARGETS} />);
    const frame = lastFrame();
    expect(frame).toContain("llm-switch");
    expect(frame).toContain("Claude Code");
  });

  it("lists profiles for the selected target", async () => {
    await store.writeProfile(claude, "glm", {
      baseUrl: "https://x",
      model: "m",
      apiKey: "k",
      extra: {},
    });
    const { lastFrame } = render(<App store={store} targets={TARGETS} />);
    await tick(50);
    expect(lastFrame()).toContain("glm");
  });

  it("activates a profile with enter", async () => {
    await store.writeProfile(claude, "glm", {
      baseUrl: "https://x",
      model: "m",
      apiKey: "k",
      extra: {},
    });
    const { lastFrame, stdin } = render(
      <App store={store} targets={TARGETS} />,
    );
    await tick(50);
    stdin.write("\t"); // focus profile panel
    await tick(20);
    stdin.write("\r"); // enter opens confirm
    await tick(50);
    expect(lastFrame()).toContain("Activate 'glm'?");
    stdin.write("\r"); // confirm
    await tick(50);
    expect(lastFrame()).toContain("Switched Claude Code to glm");
    const active = await store.adapter(claude).readActive();
    expect(active).not.toBeNull();
    expect(active?.baseUrl).toBe("https://x");
  });

  it("navigates targets with j/k", async () => {
    const { lastFrame, stdin } = render(
      <App store={store} targets={TARGETS} />,
    );
    await tick(50);
    stdin.write("j");
    await tick(20);
    expect(lastFrame()).toContain("OpenCode Profiles");
  });

  it("switches focus between panels with tab", async () => {
    await store.writeProfile(claude, "glm", {
      baseUrl: "https://x",
      model: "m",
      apiKey: "k",
      extra: {},
    });
    const { lastFrame, stdin } = render(
      <App store={store} targets={TARGETS} />,
    );
    await tick(50);
    stdin.write("\t");
    await tick(50);
    expect(lastFrame()).toContain("Enter activate");
  });

  it("filters profiles with /", async () => {
    await store.writeProfile(claude, "alpha", {
      baseUrl: "https://a",
      model: "m",
      apiKey: "k",
      extra: {},
    });
    await store.writeProfile(claude, "beta", {
      baseUrl: "https://b",
      model: "m",
      apiKey: "k",
      extra: {},
    });
    const { lastFrame, stdin } = render(
      <App store={store} targets={TARGETS} />,
    );
    await tick(50);
    stdin.write("/");
    await tick(20);
    stdin.write("al");
    await tick(50);
    expect(lastFrame()).toContain("alpha");
    expect(lastFrame()).not.toContain("beta");
  });

  it("shows help screen with ? and closes with escape", async () => {
    const { lastFrame, stdin } = render(
      <App store={store} targets={TARGETS} />,
    );
    await tick(50);
    stdin.write("?");
    await tick(50);
    expect(lastFrame()).toContain("Keyboard shortcuts");
    stdin.write("\u001b");
    await tick(50);
    expect(lastFrame()).not.toContain("Keyboard shortcuts");
  });

  it("saves current active config as a profile", async () => {
    await store.adapter(claude).writeActive({
      baseUrl: "https://saved.example.com",
      model: "saved-model",
      apiKey: "sk-saved",
      extra: {},
    });
    const { lastFrame, stdin } = render(
      <App store={store} targets={TARGETS} />,
    );
    await tick(50);
    stdin.write("s");
    await tick(50);
    stdin.write("my-save");
    await tick(50);
    stdin.write("\r");
    await waitForFrame(lastFrame, (f) =>
      f.includes("Saved Claude Code as 'my-save'"),
    );
    const saved = await store.readProfile(claude, "my-save");
    expect(saved).not.toBeNull();
    expect(saved?.baseUrl).toBe("https://saved.example.com");
  });

  it("deletes a profile after confirmation", async () => {
    await store.writeProfile(claude, "to-delete", {
      baseUrl: "https://x",
      model: "m",
      apiKey: "k",
      extra: {},
    });
    const { lastFrame, stdin } = render(
      <App store={store} targets={TARGETS} />,
    );
    await tick(50);
    stdin.write("\t");
    await tick(20);
    stdin.write("d");
    await tick(50);
    expect(lastFrame()).toContain("Delete 'to-delete'");
    stdin.write("\r");
    await waitForFrame(lastFrame, (f) => f.includes("Deleted 'to-delete'"));
    expect(await store.readProfile(claude, "to-delete")).toBeNull();
  });

  it("restores active config from backup", async () => {
    await store.adapter(claude).writeActive({
      baseUrl: "https://original.example.com",
      model: "original",
      apiKey: "sk-original",
      extra: {},
    });
    await store.adapter(claude).writeActive({
      baseUrl: "https://changed.example.com",
      model: "changed",
      apiKey: "sk-changed",
      extra: {},
    });
    const { lastFrame, stdin } = render(
      <App store={store} targets={TARGETS} />,
    );
    await tick(50);
    stdin.write("r");
    await tick(50);
    expect(lastFrame()).toContain("Restore Claude Code from backup?");
    stdin.write("\r");
    await waitForFrame(lastFrame, (f) =>
      f.includes("Restored Claude Code from backup"),
    );
    const active = await store.adapter(claude).readActive();
    expect(active?.baseUrl).toBe("https://original.example.com");
  });

  it("creates and activates a profile via wizard", async () => {
    mockFetch();
    const { lastFrame, stdin } = render(
      <App store={store} targets={TARGETS} />,
    );
    await tick(50);
    stdin.write("c");
    await tick(50);
    expect(lastFrame()).toContain("Create profile for Claude Code");
    stdin.write("\r"); // confirm provider (default GLM)
    await tick(50);
    stdin.write("\r"); // confirm default alias "glm"
    await tick(50);
    stdin.write("\r"); // confirm baseUrl
    await tick(50);
    stdin.write("\r"); // confirm model
    await tick(50);
    stdin.write("sk-new");
    await tick(50);
    stdin.write("\r"); // submit
    await tick(200);
    const active = await store.adapter(claude).readActive();
    expect(active?.apiKey).toBe("sk-new");
    expect(await store.readProfile(claude, "glm")).not.toBeNull();
  });
});
