import { useState } from "react";
import type { TargetConfig } from "@xavier2code/llm-switch-core/config.js";
import { validateAlias } from "@xavier2code/llm-switch-core/config.js";
import type { ProfileStore } from "@xavier2code/llm-switch-core/store/profile-store.js";
import { PROVIDERS } from "@xavier2code/llm-switch-core/providers.js";
import type { Provider } from "@xavier2code/llm-switch-core/providers.js";
import {
  validateAnthropic,
  validateOpenAi,
} from "@xavier2code/llm-switch-core/validator.js";

export type WizardStep =
  | { type: "provider" }
  | { type: "alias" }
  | { type: "baseUrl" }
  | { type: "model" }
  | { type: "apiKey" }
  | { type: "validating" }
  | { type: "error"; message: string };

export interface WizardState {
  step: WizardStep;
  provider: Provider;
  alias: string;
  baseUrl: string;
  model: string;
  apiKey: string;
}

export interface CreateWizardProps {
  target: TargetConfig;
  store: ProfileStore;
  onDone: () => void;
  onCancel: () => void;
  isActive?: boolean;
}

export interface UseCreateWizardOptions {
  target: TargetConfig;
  store: ProfileStore;
  onDone: () => void;
  onCancel: () => void;
}

export function useCreateWizard({
  target,
  store,
  onDone,
}: UseCreateWizardOptions) {
  const familyProviders = PROVIDERS.filter((p) => p.family === target.family);
  const defaultProvider = familyProviders[0] ?? PROVIDERS[0];

  const [step, setStep] = useState<WizardStep>({ type: "provider" });
  const [providerIndex, setProviderIndex] = useState(0);
  const [alias, setAlias] = useState<string>(defaultProvider?.id ?? "");
  const [baseUrl, setBaseUrl] = useState(defaultProvider?.baseUrl ?? "");
  const [model, setModel] = useState(defaultProvider?.defaultModel ?? "");
  const [apiKey, setApiKey] = useState("");

  const provider = familyProviders[providerIndex] ?? defaultProvider;

  function moveProviderUp() {
    setProviderIndex(
      (i) => (i - 1 + familyProviders.length) % familyProviders.length,
    );
  }

  function moveProviderDown() {
    setProviderIndex((i) => (i + 1) % familyProviders.length);
  }

  function selectProvider() {
    const p = familyProviders[providerIndex];
    if (p) {
      setBaseUrl(p.baseUrl);
      setModel(p.defaultModel);
      setAlias(p.id);
    }
    setStep({ type: "alias" });
  }

  function goBack() {
    switch (step.type) {
      case "alias":
        setStep({ type: "provider" });
        break;
      case "baseUrl":
        setStep({ type: "alias" });
        break;
      case "model":
        setStep({ type: "baseUrl" });
        break;
      case "apiKey":
        setStep({ type: "model" });
        break;
    }
  }

  async function submit() {
    setStep({ type: "validating" });
    const trimmedAlias = alias.trim();
    const aliasErr = validateAlias(trimmedAlias);
    if (aliasErr) {
      setStep({ type: "error", message: aliasErr });
      return;
    }

    try {
      const validator =
        target.family === "anthropic" ? validateAnthropic : validateOpenAi;
      await validator(baseUrl.trim(), model.trim(), apiKey.trim(), {
        timeoutMs: 10_000,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStep({ type: "error", message: `Validation failed: ${message}` });
      return;
    }

    try {
      await store.writeProfile(target, trimmedAlias, {
        providerId: provider?.id,
        baseUrl: baseUrl.trim(),
        model: model.trim(),
        apiKey: apiKey.trim(),
        extra: {},
      });
      await store.adapter(target).writeActive({
        providerId: provider?.id,
        baseUrl: baseUrl.trim(),
        model: model.trim(),
        apiKey: apiKey.trim(),
        extra: {},
      });
      await store.writeActiveRecord(target, trimmedAlias);
      onDone();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStep({ type: "error", message: `Save failed: ${message}` });
    }
  }

  return {
    familyProviders,
    providerIndex,
    step,
    alias,
    baseUrl,
    model,
    apiKey,
    provider,
    setAlias,
    setBaseUrl,
    setModel,
    setApiKey,
    setStep,
    moveProviderUp,
    moveProviderDown,
    selectProvider,
    goBack,
    submit,
  };
}
