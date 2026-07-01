import React from "react";
import { Box, Text, useInput } from "ink";
import { theme } from "../theme.js";

export interface ConfirmDialogProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  isActive?: boolean;
}

export function ConfirmDialog({
  message,
  onConfirm,
  onCancel,
  isActive = true,
}: ConfirmDialogProps) {
  useInput(
    (_input, key) => {
      if (key.return) {
        onConfirm();
        return;
      }
      if (key.escape) {
        onCancel();
        return;
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
      width={message.length + 6}
      borderColor={theme.border}
    >
      <Text bold color={theme.text}>
        {message}
      </Text>
      <Box marginTop={1}>
        <Text color={theme.wizardHint}>Enter yes · Esc no</Text>
      </Box>
    </Box>
  );
}
