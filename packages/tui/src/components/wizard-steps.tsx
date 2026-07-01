import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme.js";
import { TextInput } from "./text-input.js";
import type { Provider } from "@xavier2code/llm-switch-core/providers.js";

export interface ProviderStepProps {
  providers: Provider[];
  selectedIndex: number;
}

export function ProviderStep({ providers, selectedIndex }: ProviderStepProps) {
  return (
    <>
      <Text color={theme.text}>Select provider:</Text>
      {providers.map((p, i) => (
        <Text
          key={p.id}
          color={i === selectedIndex ? theme.wizardSelection : theme.text}
        >
          {i === selectedIndex ? "> " : "  "}
          {p.displayName}
        </Text>
      ))}
      <Box marginTop={1}>
        <Text color={theme.wizardHint}>
          ↑/↓ select · Enter confirm · Esc cancel
        </Text>
      </Box>
    </>
  );
}

export interface FieldStepProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  focus: boolean;
  mask?: string;
}

export function FieldStep({
  label,
  value,
  onChange,
  onSubmit,
  focus,
  mask,
}: FieldStepProps) {
  return (
    <>
      <Text color={theme.text}>{label}:</Text>
      <TextInput
        value={value}
        onChange={onChange}
        onSubmit={onSubmit}
        focus={focus}
        mask={mask}
      />
      <Box marginTop={1}>
        <Text color={theme.wizardHint}>
          Enter next · Esc back · Ctrl+C quit
        </Text>
      </Box>
    </>
  );
}

export interface ValidatingStepProps {
  message?: string;
}

export function ValidatingStep({
  message = "Validating and creating profile...",
}: ValidatingStepProps) {
  return (
    <Box
      borderStyle="single"
      paddingX={2}
      paddingY={1}
      borderColor={theme.border}
    >
      <Text color={theme.wizardLoading}>{message}</Text>
    </Box>
  );
}

export interface ErrorStepProps {
  message: string;
  hint?: string;
}

export function ErrorStep({
  message,
  hint = "Press Esc to close",
}: ErrorStepProps) {
  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      paddingX={2}
      paddingY={1}
      width={60}
      borderColor={theme.statusErrorBorder}
    >
      <Text color={theme.wizardError}>{message}</Text>
      <Box marginTop={1}>
        <Text color={theme.wizardHint}>{hint}</Text>
      </Box>
    </Box>
  );
}
