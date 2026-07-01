import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme.js";
import type { TargetConfig } from "@llm-switch/core/config.js";

export interface HeaderProps {
  targets: TargetConfig[];
  selectedTarget: TargetConfig;
  searchQuery: string;
}

export function Header({ targets, selectedTarget, searchQuery }: HeaderProps) {
  return (
    <Box
      marginBottom={2}
      flexDirection="row"
      justifyContent="space-between"
      alignItems="center"
    >
      <Box flexDirection="row" alignItems="center" gap={1}>
        <Text bold color={theme.headerTitle}>
          llm-switch
        </Text>
        <Text color={theme.headerVersion}> v0.9.0</Text>
      </Box>
      <Box flexDirection="row" alignItems="center" gap={1}>
        <Text color={theme.headerStatus}>*</Text>
        <Text color={theme.textMuted}>
          {targets.length} targets · {selectedTarget?.displayName}
        </Text>
        {searchQuery && (
          <Text color={theme.profileActiveFg}> · filter: {searchQuery}</Text>
        )}
      </Box>
    </Box>
  );
}
