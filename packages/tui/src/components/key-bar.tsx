import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme.js";
import type { Modal } from "../hooks/use-tui.js";

export interface KeyBarProps {
  modal: Modal;
  selectedProfile: boolean;
}

export function KeyBar({ modal, selectedProfile }: KeyBarProps) {
  return (
    <Box
      marginTop={1}
      flexDirection="row"
      justifyContent="space-between"
      alignItems="center"
      paddingX={1}
      height={1}
    >
      {modal.type === "activate" || modal.type === "delete" ? (
        <Box flexDirection="row" gap={2}>
          <Text bold color={theme.text}>
            {modal.type === "activate"
              ? `Activate '${modal.alias}'?`
              : `Delete '${modal.alias}'?`}
          </Text>
          <Text color={theme.profileActiveFg}>Enter yes</Text>
          <Text color={theme.textMuted}>Esc no</Text>
        </Box>
      ) : (
        <>
          <Box flexDirection="row" gap={2}>
            <Text color={theme.keyFg}>[c] Create</Text>
            <Text color={theme.keyFg}>[r] Restore</Text>
            <Text color={theme.keyFg}>[s] Save</Text>
          </Box>
          <Box flexDirection="row" gap={2}>
            {selectedProfile ? (
              <>
                <Text color={theme.profileHintFg}>Enter activate</Text>
                <Text color={theme.profileHintFg}>d delete</Text>
              </>
            ) : (
              <>
                <Text color={theme.textMuted}>j/k navigate</Text>
                <Text color={theme.textMuted}>Tab switch</Text>
                <Text color={theme.textMuted}>? help</Text>
                <Text color={theme.textMuted}>q quit</Text>
              </>
            )}
          </Box>
        </>
      )}
    </Box>
  );
}
