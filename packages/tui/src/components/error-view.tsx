import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme.js";

export interface ErrorViewProps {
  error: string;
}

export function ErrorView({ error }: ErrorViewProps) {
  return (
    <Box flexDirection="column" padding={2}>
      <Text color={theme.statusErrorFg}>Error: {error}</Text>
    </Box>
  );
}
