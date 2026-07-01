import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme.js";
import type { Profile } from "@xavier2code/llm-switch-core/adapters/types.js";

export interface ProfilePanelProps {
  title: string;
  profiles: Profile[];
  selectedIndex: number;
  focused: boolean;
  pageSize: number;
  profileItemHeight: number;
  isSearching: boolean;
}

export function ProfilePanel({
  title,
  profiles,
  selectedIndex,
  focused,
  pageSize,
  profileItemHeight,
  isSearching,
}: ProfilePanelProps) {
  return (
    <Box
      width={58}
      flexShrink={0}
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.border}
      paddingX={1}
      paddingY={1}
    >
      <Box
        flexDirection="row"
        justifyContent="space-between"
        alignItems="center"
        height={1}
      >
        <Text bold color={theme.panelTitle}>
          {title}
        </Text>
        <Box flexDirection="row" gap={1}>
          <Text color={theme.textMuted}>Search:</Text>
          <Text color={theme.textMuted}>
            {isSearching ? "typing..." : "press /"}
          </Text>
        </Box>
      </Box>

      <Box
        flexDirection="column"
        flexGrow={1}
        justifyContent="center"
        gap={1}
        marginY={1}
        height={pageSize * profileItemHeight}
      >
        {profiles.length === 0 && (
          <Box
            alignItems="center"
            justifyContent="center"
            flexDirection="column"
          >
            <Text color={theme.textMuted}>No profiles yet</Text>
            <Text color={theme.textMuted}>Press `c` to create one</Text>
          </Box>
        )}
        {profiles.map((p, i) => {
          const isSelected = i === selectedIndex;
          return (
            <Box
              key={p.alias}
              flexDirection="row"
              justifyContent="space-between"
              alignItems="center"
              paddingX={2}
              paddingY={1}
              height={3}
            >
              <Box flexDirection="row" alignItems="center" gap={1}>
                <Box
                  width={6}
                  height={3}
                  alignItems="center"
                  justifyContent="center"
                >
                  <Text
                    bold
                    color={theme.detailBadgeFg}
                    backgroundColor={theme.detailBadgeBg}
                  >
                    {p.alias.slice(0, 2).toUpperCase()}
                  </Text>
                </Box>
                <Box flexDirection="column">
                  <Text
                    bold
                    color={
                      isSelected && focused
                        ? theme.profileSelectedFg
                        : theme.profileNormalFg
                    }
                  >
                    {isSelected && focused ? "> " : "  "}
                    {p.alias}
                    {p.active && (
                      <Text color={theme.profileActiveFg}>
                        {" "}
                        {p.drifted ? "[active, drifted]" : "[active]"}
                      </Text>
                    )}
                  </Text>
                </Box>
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
