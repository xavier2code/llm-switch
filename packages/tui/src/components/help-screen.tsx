import React from "react";
import { Box, Text, useInput } from "ink";
import { theme } from "../theme.js";

export interface HelpScreenProps {
  onClose: () => void;
  isActive?: boolean;
}

const BINDINGS: Array<{ key: string; desc: string }> = [
  { key: "j / k", desc: "Move up/down" },
  { key: "h / l or Tab / Shift+Tab", desc: "Switch focus panel" },
  { key: "Enter", desc: "Activate selected profile" },
  { key: "c", desc: "Create new profile for current target" },
  { key: "s", desc: "Save current config as profile" },
  { key: "d", desc: "Delete selected profile" },
  { key: "r", desc: "Restore backup for current target" },
  { key: "/", desc: "Search/filter profiles" },
  { key: "?", desc: "Show this help" },
  { key: "q / Ctrl+C", desc: "Quit" },
];

export function HelpScreen({ onClose, isActive = true }: HelpScreenProps) {
  useInput(
    (_input, key) => {
      if (key.escape || key.return) {
        onClose();
      }
    },
    { isActive },
  );

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      paddingX={2}
      paddingY={1}
      width={60}
      borderColor={theme.border}
    >
      <Text bold color={theme.wizardTitle}>
        Keyboard shortcuts
      </Text>
      <Box marginTop={1} flexDirection="column">
        {BINDINGS.map(({ key, desc }) => (
          <Box key={key} width="100%">
            <Box width={26}>
              <Text color={theme.keyFg}>{key}</Text>
            </Box>
            <Text color={theme.text}>{desc}</Text>
          </Box>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text color={theme.wizardHint}>Press Esc or Enter to close</Text>
      </Box>
    </Box>
  );
}
