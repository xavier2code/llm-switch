import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme.js";

export interface StatusBarProps {
  status: string;
}

export function StatusBar({ status }: StatusBarProps) {
  if (!status) return null;
  const isError = status.includes("Error");
  return (
    <Box
      marginTop={1}
      flexDirection="row"
      alignItems="center"
      gap={1}
      alignSelf="center"
      paddingX={2}
      paddingY={1}
      borderStyle="round"
      borderColor={
        isError ? theme.statusErrorBorder : theme.statusSuccessBorder
      }
    >
      <Text color={isError ? theme.statusErrorFg : theme.statusSuccessFg}>
        {isError ? "x" : "ok"}
      </Text>
      <Text color={theme.text}>{status}</Text>
    </Box>
  );
}
