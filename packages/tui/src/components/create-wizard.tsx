import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { TargetConfig } from "@llm-switch/core/config.js";
import { validateAlias } from "@llm-switch/core/config.js";
import type { ProfileStore } from "@llm-switch/core/store/profile-store.js";
import { PROVIDERS } from "@llm-switch/core/providers.js";
import {
  validateAnthropic,
  validateOpenAi,
} from "@llm-switch/core/validator.js";
import { theme } from "../theme.js";
import { TextInput } from "./text-input.js";

type Step =
  | { type: "provider" }
  | { type: "alias" }
  | { type: "baseUrl" }
  | { type: "model" }
  | { type: "apiKey" }
  | { type: "validating" }
  | { type: "error"; message: string };

export interface CreateWizardProps {
  target: TargetConfig;
  store: ProfileStore;
  onDone: () => void;
  onCancel: () => void;
  isActive?: boolean;
}

export function CreateWizard({
  target,
  store,
  onDone,
  onCancel,
  isActive = true,
}: CreateWizardProps) {
  const familyProviders = PROVIDERS.filter((p) => p.family === target.family);
  const defaultProvider = familyProviders[0] ?? PROVIDERS[0];

  const [step, setStep] = useState<Step>({ type: "provider" });
  const [providerIndex, setProviderIndex] = useState(0);
  const [alias, setAlias] = useState<string>(defaultProvider?.id ?? "");
  const [baseUrl, setBaseUrl] = useState<string>(
    defaultProvider?.baseUrl ?? "",
  );
  const [model, setModel] = useState<string>(
    defaultProvider?.defaultModel ?? "",
  );
  const [apiKey, setApiKey] = useState<string>("");

  const provider = familyProviders[providerIndex] ?? defaultProvider;

  function cancel() {
    onCancel();
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
      onDone();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStep({ type: "error", message: `Save failed: ${message}` });
    }
  }

  useInput(
    (_input, key) => {
      if (key.escape) {
        if (step.type === "error") {
          cancel();
        } else if (step.type === "provider") {
          cancel();
        } else {
          // Go back one step
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
            case "validating":
              break;
          }
        }
        return;
      }

      if (step.type === "provider") {
        if (key.upArrow) {
          setProviderIndex(
            (i) => (i - 1 + familyProviders.length) % familyProviders.length,
          );
          return;
        }
        if (key.downArrow) {
          setProviderIndex((i) => (i + 1) % familyProviders.length);
          return;
        }
        if (key.return) {
          const p = familyProviders[providerIndex];
          if (p) {
            setBaseUrl(p.baseUrl);
            setModel(p.defaultModel);
            setAlias(p.id);
          }
          setStep({ type: "alias" });
          return;
        }
      }
    },
    { isActive },
  );

  if (step.type === "validating") {
    return (
      <Box
        borderStyle="single"
        paddingX={2}
        paddingY={1}
        borderColor={theme.border}
      >
        <Text color={theme.wizardLoading}>
          Validating and creating profile...
        </Text>
      </Box>
    );
  }

  if (step.type === "error") {
    return (
      <Box
        flexDirection="column"
        borderStyle="single"
        paddingX={2}
        paddingY={1}
        width={60}
        borderColor={theme.statusErrorBorder}
      >
        <Text color={theme.wizardError}>{step.message}</Text>
        <Box marginTop={1}>
          <Text color={theme.wizardHint}>Press Esc to close</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      paddingX={2}
      paddingY={1}
      width={70}
      borderColor={theme.border}
    >
      <Text bold color={theme.wizardTitle}>
        Create profile for {target.displayName}
      </Text>
      <Box marginTop={1} flexDirection="column">
        {step.type === "provider" && (
          <>
            <Text color={theme.text}>Select provider:</Text>
            {familyProviders.map((p, i) => (
              <Text
                key={p.id}
                color={i === providerIndex ? theme.wizardSelection : theme.text}
              >
                {i === providerIndex ? "> " : "  "}
                {p.displayName}
              </Text>
            ))}
            <Box marginTop={1}>
              <Text color={theme.wizardHint}>
                ↑/↓ select · Enter confirm · Esc cancel
              </Text>
            </Box>
          </>
        )}

        {step.type === "alias" && (
          <>
            <Text color={theme.text}>Alias:</Text>
            <TextInput
              value={alias}
              onChange={setAlias}
              onSubmit={() => setStep({ type: "baseUrl" })}
              focus={isActive}
            />
            <Box marginTop={1}>
              <Text color={theme.wizardHint}>
                Enter next · Esc back · Ctrl+C quit
              </Text>
            </Box>
          </>
        )}

        {step.type === "baseUrl" && (
          <>
            <Text color={theme.text}>BASE URL:</Text>
            <TextInput
              value={baseUrl}
              onChange={setBaseUrl}
              onSubmit={() => setStep({ type: "model" })}
              focus={isActive}
            />
            <Box marginTop={1}>
              <Text color={theme.wizardHint}>
                Enter next · Esc back · Ctrl+C quit
              </Text>
            </Box>
          </>
        )}

        {step.type === "model" && (
          <>
            <Text color={theme.text}>Model:</Text>
            <TextInput
              value={model}
              onChange={setModel}
              onSubmit={() => setStep({ type: "apiKey" })}
              focus={isActive}
            />
            <Box marginTop={1}>
              <Text color={theme.wizardHint}>
                Enter next · Esc back · Ctrl+C quit
              </Text>
            </Box>
          </>
        )}

        {step.type === "apiKey" && (
          <>
            <Text color={theme.text}>API key:</Text>
            <TextInput
              value={apiKey}
              onChange={setApiKey}
              onSubmit={submit}
              mask="*"
              focus={isActive}
            />
            <Box marginTop={1}>
              <Text color={theme.wizardHint}>
                Enter submit · Esc back · Ctrl+C quit
              </Text>
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
}
