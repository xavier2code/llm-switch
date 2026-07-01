import React, { useEffect, useState, useCallback } from "react";
import { Box, Text, useInput, useApp } from "ink";
import type { ProfileStore } from "@llm-switch/core/store/profile-store.js";
import type { TargetConfig } from "@llm-switch/core/config.js";
import type { Profile } from "@llm-switch/core/adapters/types.js";

export interface AppProps {
  store: ProfileStore;
  targets: TargetConfig[];
}

function useTui(store: ProfileStore, targets: TargetConfig[]) {
  const [selectedTargetIndex, setSelectedTargetIndex] = useState(0);
  const [selectedProfileIndex, setSelectedProfileIndex] = useState(0);
  const [focus, setFocus] = useState<"target" | "profile">("target");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");

  const selectedTarget = targets[selectedTargetIndex] ?? targets[0];

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!selectedTarget) return;
      try {
        const list = await store.listProfiles(selectedTarget);
        if (!cancelled) {
          setProfiles(list);
          setSelectedProfileIndex(0);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [store, selectedTarget]);

  const moveUp = useCallback(() => {
    if (focus === "target") {
      setSelectedTargetIndex((i) => Math.max(0, i - 1));
    } else {
      setSelectedProfileIndex((i) => Math.max(0, i - 1));
    }
  }, [focus]);

  const moveDown = useCallback(() => {
    if (focus === "target") {
      setSelectedTargetIndex((i) => Math.min(targets.length - 1, i + 1));
    } else {
      setSelectedProfileIndex((i) => Math.min(profiles.length - 1, i + 1));
    }
  }, [focus, targets.length, profiles.length]);

  const toggleFocus = useCallback(() => {
    setFocus((f) => (f === "target" ? "profile" : "target"));
  }, []);

  const activateSelected = useCallback(async () => {
    const profile = profiles[selectedProfileIndex];
    if (!profile || !selectedTarget) return;
    try {
      await store.activateProfile(selectedTarget, profile.alias);
      setStatus(`Switched ${selectedTarget.displayName} to ${profile.alias}`);
      const list = await store.listProfiles(selectedTarget);
      setProfiles(list);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    }
  }, [profiles, selectedProfileIndex, selectedTarget, store]);

  return {
    selectedTarget,
    selectedTargetIndex,
    selectedProfileIndex,
    focus,
    profiles,
    error,
    status,
    moveUp,
    moveDown,
    toggleFocus,
    activateSelected,
  };
}

export function App({ store, targets }: AppProps) {
  const { exit } = useApp();
  const {
    selectedTarget,
    selectedTargetIndex,
    selectedProfileIndex,
    focus,
    profiles,
    error,
    status,
    moveUp,
    moveDown,
    toggleFocus,
    activateSelected,
  } = useTui(store, targets);

  useInput((input, key) => {
    if (input === "q") {
      exit();
      return;
    }
    if (key.tab) {
      toggleFocus();
      return;
    }
    if (input === "j" || key.downArrow) {
      moveDown();
      return;
    }
    if (input === "k" || key.upArrow) {
      moveUp();
      return;
    }
    if (key.return) {
      activateSelected();
    }
  });

  if (error) {
    return (
      <Box flexDirection="column">
        <Text color="red">Error: {error}</Text>
      </Box>
    );
  }

  const selectedProfile = profiles[selectedProfileIndex] ?? null;

  return (
    <Box flexDirection="column" height={24}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          llm-switch TUI
        </Text>
        <Text dimColor> — {selectedTarget?.displayName}</Text>
      </Box>
      <Box flexGrow={1}>
        <Box
          width={18}
          flexDirection="column"
          borderStyle={focus === "target" ? "single" : undefined}
          paddingX={1}
        >
          <Text bold underline>
            Targets
          </Text>
          {targets.map((t, i) => (
            <Text
              key={t.id}
              color={i === selectedTargetIndex ? "green" : undefined}
            >
              {i === selectedTargetIndex ? "> " : "  "}
              {t.displayName}
            </Text>
          ))}
        </Box>
        <Box
          width={24}
          flexDirection="column"
          borderStyle={focus === "profile" ? "single" : undefined}
          paddingX={1}
        >
          <Text bold underline>
            Profiles
          </Text>
          {profiles.length === 0 && <Text dimColor>No profiles</Text>}
          {profiles.map((p, i) => (
            <Text
              key={p.alias}
              color={i === selectedProfileIndex ? "green" : undefined}
            >
              {i === selectedProfileIndex ? "> " : "  "}
              {p.active ? "* " : "  "}
              {p.alias}
            </Text>
          ))}
        </Box>
        <Box
          flexGrow={1}
          flexDirection="column"
          borderStyle="single"
          paddingX={1}
        >
          <Text bold underline>
            Details
          </Text>
          {selectedProfile ? (
            <>
              <Text>Alias: {selectedProfile.alias}</Text>
              <Text>Path: {selectedProfile.path}</Text>
              <Text>Active: {selectedProfile.active ? "yes" : "no"}</Text>
            </>
          ) : (
            <Text dimColor>Select a profile to view details.</Text>
          )}
        </Box>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {status && <Text color="yellow">{status}</Text>}
        <Text dimColor>
          j/k move · Tab switch panel · Enter activate · q quit | focus: {focus}
        </Text>
      </Box>
    </Box>
  );
}
