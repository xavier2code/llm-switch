import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme.js";
import type { Profile } from "@xavier2code/llm-switch-core/adapters/types.js";

export interface DetailPanelProps {
  profile: Profile | null;
}

export function DetailPanel({ profile }: DetailPanelProps) {
  return (
    <Box
      width={42}
      flexShrink={0}
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.border}
      paddingX={2}
      paddingY={1}
      gap={1}
    >
      {profile ? (
        <>
          <Box flexDirection="row" alignItems="center" gap={1} marginBottom={1}>
            <Box
              width={8}
              height={4}
              alignItems="center"
              justifyContent="center"
            >
              <Text
                bold
                color={theme.detailBadgeFg}
                backgroundColor={theme.detailBadgeBg}
              >
                {profile.alias.slice(0, 2).toUpperCase()}
              </Text>
            </Box>
            <Box flexDirection="column">
              <Text bold color={theme.profileNormalFg}>
                {profile.alias}
              </Text>
              <Text color={theme.textMuted}>
                {profile.active
                  ? profile.drifted
                    ? "Active profile (drifted)"
                    : "Active profile"
                  : "Saved profile"}
              </Text>
            </Box>
          </Box>

          <Box flexDirection="column" gap={1}>
            <Text color={theme.detailLabelFg}>Base URL</Text>
            <Text
              color={theme.detailValueFg}
              backgroundColor={theme.detailValueBg}
            >
              {" "}
              {profile.baseUrl ?? "-"}
            </Text>
          </Box>

          <Box flexDirection="column" gap={1}>
            <Text color={theme.detailLabelFg}>API Key</Text>
            <Text color={theme.textMuted} backgroundColor={theme.detailValueBg}>
              {" "}
              ••••••••••••
            </Text>
          </Box>

          <Box flexDirection="column" gap={1}>
            <Text color={theme.detailLabelFg}>Path</Text>
            <Text
              color={theme.detailValueFg}
              backgroundColor={theme.detailValueBg}
              wrap="wrap"
            >
              {" "}
              {profile.path}
            </Text>
          </Box>
        </>
      ) : (
        <Box
          flexGrow={1}
          alignItems="center"
          justifyContent="center"
          flexDirection="column"
        >
          <Text color={theme.textMuted}>Select a profile to view details</Text>
        </Box>
      )}
    </Box>
  );
}
