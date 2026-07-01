import { describe, it, expect, beforeEach, afterEach } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { App } from "../src/app.js";
import { ProfileStore } from "@llm-switch/core/store/profile-store.js";
import { TARGETS, getTarget } from "@llm-switch/core/config.js";

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
});

describe("App", () => {
  it("renders TUI header and target list", () => {
    const { lastFrame } = render(<App store={store} targets={TARGETS} />);
    const frame = lastFrame();
    expect(frame).toContain("llm-switch TUI");
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
    await new Promise((r) => setTimeout(r, 50));
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
    await new Promise((r) => setTimeout(r, 50));
    stdin.write("\t"); // focus profile panel
    await new Promise((r) => setTimeout(r, 20));
    stdin.write("\r"); // enter
    await new Promise((r) => setTimeout(r, 50));
    expect(lastFrame()).toContain("Switched Claude Code to glm");
    const active = await store.adapter(claude).readActive();
    expect(active).not.toBeNull();
    expect(active?.baseUrl).toBe("https://x");
  });

  it("navigates targets with j/k", async () => {
    const { lastFrame, stdin } = render(
      <App store={store} targets={TARGETS} />,
    );
    await new Promise((r) => setTimeout(r, 50));
    stdin.write("j");
    await new Promise((r) => setTimeout(r, 20));
    expect(lastFrame()).toContain("> OpenCode");
  });

  it("switches focus between panels with tab", async () => {
    const { lastFrame, stdin } = render(
      <App store={store} targets={TARGETS} />,
    );
    await new Promise((r) => setTimeout(r, 50));
    stdin.write("\t");
    await new Promise((r) => setTimeout(r, 20));
    expect(lastFrame()).toContain("focus: profile");
  });
});
