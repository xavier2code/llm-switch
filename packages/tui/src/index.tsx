import React from "react";
import { render } from "ink";
import type { ProfileStore } from "@llm-switch/core/store/profile-store.js";
import type { TargetConfig } from "@llm-switch/core/config.js";
import { App } from "./app.js";

export async function runTui(
  store: ProfileStore,
  targets: TargetConfig[],
): Promise<void> {
  const instance = render(<App store={store} targets={targets} />);
  await instance.waitUntilExit();
}

export { App } from "./app.js";
export type { AppProps } from "./app.js";
