import React from "react";
import { Box, Text, useInput } from "ink";
import { theme } from "../theme.js";
import {
  ProviderStep,
  FieldStep,
  ValidatingStep,
  ErrorStep,
} from "./wizard-steps.js";
import type { CreateWizardProps } from "../hooks/use-create-wizard.js";
import { useCreateWizard } from "../hooks/use-create-wizard.js";

export type { CreateWizardProps };

export function CreateWizard({
  target,
  store,
  onDone,
  onCancel,
  isActive = true,
}: CreateWizardProps) {
  const {
    familyProviders,
    providerIndex,
    step,
    alias,
    baseUrl,
    model,
    apiKey,
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
  } = useCreateWizard({ target, store, onDone, onCancel });

  useInput(
    (_input, key) => {
      if (key.escape) {
        if (step.type === "error" || step.type === "provider") {
          onCancel();
        } else {
          goBack();
        }
        return;
      }

      if (step.type === "provider") {
        if (key.upArrow) {
          moveProviderUp();
          return;
        }
        if (key.downArrow) {
          moveProviderDown();
          return;
        }
        if (key.return) {
          selectProvider();
          return;
        }
      }
    },
    { isActive },
  );

  if (step.type === "validating") {
    return <ValidatingStep />;
  }

  if (step.type === "error") {
    return <ErrorStep message={step.message} />;
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
          <ProviderStep
            providers={familyProviders}
            selectedIndex={providerIndex}
          />
        )}
        {step.type === "alias" && (
          <FieldStep
            label="Alias"
            value={alias}
            onChange={setAlias}
            onSubmit={() => setStep({ type: "baseUrl" })}
            focus={isActive}
          />
        )}
        {step.type === "baseUrl" && (
          <FieldStep
            label="BASE URL"
            value={baseUrl}
            onChange={setBaseUrl}
            onSubmit={() => setStep({ type: "model" })}
            focus={isActive}
          />
        )}
        {step.type === "model" && (
          <FieldStep
            label="Model"
            value={model}
            onChange={setModel}
            onSubmit={() => setStep({ type: "apiKey" })}
            focus={isActive}
          />
        )}
        {step.type === "apiKey" && (
          <FieldStep
            label="API key"
            value={apiKey}
            onChange={setApiKey}
            onSubmit={submit}
            focus={isActive}
            mask="*"
          />
        )}
      </Box>
    </Box>
  );
}
