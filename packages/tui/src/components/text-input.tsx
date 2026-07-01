import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { theme } from "../theme.js";

export interface TextInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  mask?: string;
  focus?: boolean;
}

export function TextInput({
  value,
  onChange,
  onSubmit,
  placeholder,
  mask,
  focus = true,
}: TextInputProps) {
  const [cursor, setCursor] = useState(value.length);

  useEffect(() => {
    setCursor((c) => Math.min(c, value.length));
  }, [value.length]);

  useInput(
    (input, key) => {
      if (key.return) {
        onSubmit?.();
        return;
      }
      if (key.leftArrow) {
        setCursor((c) => Math.max(0, c - 1));
        return;
      }
      if (key.rightArrow) {
        setCursor((c) => Math.min(value.length, c + 1));
        return;
      }
      if (key.backspace || key.delete) {
        if (cursor > 0) {
          const next = value.slice(0, cursor - 1) + value.slice(cursor);
          onChange(next);
          setCursor(cursor - 1);
        }
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        const next = value.slice(0, cursor) + input + value.slice(cursor);
        onChange(next);
        setCursor(cursor + 1);
      }
    },
    { isActive: focus },
  );

  const display =
    value.length > 0
      ? (mask?.repeat(value.length) ?? value)
      : (placeholder ?? "");
  const before = display.slice(0, cursor);
  const at = display[cursor] ?? " ";
  const after = display.slice(cursor + 1);

  return (
    <Box>
      {value.length > 0 || !placeholder ? (
        <>
          <Text color={theme.text}>{before}</Text>
          <Text
            color={theme.inputCursorFg}
            backgroundColor={theme.inputCursorBg}
          >
            {at}
          </Text>
          <Text color={theme.text}>{after}</Text>
        </>
      ) : (
        <Text color={theme.textMuted}>{placeholder}</Text>
      )}
    </Box>
  );
}
