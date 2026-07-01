import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme.js";
import type { TargetConfig } from "@xavier2code/llm-switch-core/config.js";

export interface TargetPanelProps {
  targets: TargetConfig[];
  selectedIndex: number;
  focused: boolean;
}

export function TargetPanel({
  targets,
  selectedIndex,
  focused,
}: TargetPanelProps) {
  return (
    <Box
      width={28}
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.border}
      paddingX={1}
      paddingY={1}
    >
      <Box marginBottom={1}>
        <Text bold color={theme.panelTitle}>
          Targets
        </Text>
      </Box>
      {targets.map((t, i) => {
        const isActive = i === selectedIndex;
        return (
          <Box
            key={t.id}
            flexDirection="row"
            alignItems="center"
            gap={1}
            paddingX={1}
            paddingY={1}
          >
            <Text
              bold
              color={
                isActive && focused
                  ? theme.targetSelectedFg
                  : theme.targetNormalFg
              }
            >
              {isActive && focused ? "> " : "  "}
              {t.displayName}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
