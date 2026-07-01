import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Box, Text, useInput, useApp, useStdout } from "ink";
import type { ProfileStore } from "@llm-switch/core/store/profile-store.js";
import type { TargetConfig } from "@llm-switch/core/config.js";
import type { Profile } from "@llm-switch/core/adapters/types.js";
import { getBackupPath } from "@llm-switch/core/config.js";
import { exists } from "@llm-switch/core/fs-utils.js";
import { restoreBackup } from "@llm-switch/core/backup.js";
import { theme } from "./theme.js";
import { TextInput } from "./components/text-input.js";
import { CreateWizard } from "./components/create-wizard.js";
import { ConfirmDialog } from "./components/confirm-dialog.js";
import { HelpScreen } from "./components/help-screen.js";

export interface AppProps {
  store: ProfileStore;
  targets: TargetConfig[];
}

type Focus = "target" | "profile";
type Modal =
  | { type: "none" }
  | { type: "create" }
  | { type: "save" }
  | { type: "delete"; alias: string }
  | { type: "activate"; alias: string }
  | { type: "restore" }
  | { type: "search" }
  | { type: "help" };

function useTerminalSize() {
  const { stdout } = useStdout();
  const [size, setSize] = useState({
    columns: stdout.columns,
    rows: stdout.rows,
  });

  useEffect(() => {
    const handleResize = () => {
      setSize({ columns: stdout.columns, rows: stdout.rows });
    };
    stdout.on("resize", handleResize);
    return () => {
      stdout.off("resize", handleResize);
    };
  }, [stdout]);

  return size;
}

function useTui(store: ProfileStore, targets: TargetConfig[]) {
  const [selectedTargetIndex, setSelectedTargetIndex] = useState(0);
  const [selectedProfileIndex, setSelectedProfileIndex] = useState(0);
  const [focus, setFocus] = useState<Focus>("target");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [modal, setModal] = useState<Modal>({ type: "none" });
  const [searchQuery, setSearchQuery] = useState("");
  const [saveAlias, setSaveAlias] = useState("");

  const selectedTarget = targets[selectedTargetIndex] ?? targets[0];

  const filteredProfiles = useMemo(() => {
    if (!searchQuery.trim()) return profiles;
    const q = searchQuery.toLowerCase();
    return profiles.filter((p) => p.alias.toLowerCase().includes(q));
  }, [profiles, searchQuery]);

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

  const refresh = useCallback(async () => {
    if (!selectedTarget) return;
    const list = await store.listProfiles(selectedTarget);
    setProfiles(list);
    setSelectedProfileIndex((i) => Math.min(i, Math.max(0, list.length - 1)));
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
      setSelectedProfileIndex((i) =>
        Math.min(filteredProfiles.length - 1, i + 1),
      );
    }
  }, [focus, targets.length, filteredProfiles.length]);

  const toggleFocus = useCallback(() => {
    setFocus((f) => (f === "target" ? "profile" : "target"));
  }, []);

  const activateSelected = useCallback(async () => {
    const profile = filteredProfiles[selectedProfileIndex];
    if (!profile || !selectedTarget) return;
    if (profile.active) {
      setStatus(
        `${profile.alias} is already active on ${selectedTarget.displayName}`,
      );
      return;
    }
    try {
      await store.activateProfile(selectedTarget, profile.alias);
      setStatus(`Switched ${selectedTarget.displayName} to ${profile.alias}`);
      await refresh();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    }
  }, [filteredProfiles, selectedProfileIndex, selectedTarget, store, refresh]);

  const closeModal = useCallback(() => {
    setModal({ type: "none" });
    setSaveAlias("");
  }, []);

  const openActivate = useCallback(() => {
    const profile = filteredProfiles[selectedProfileIndex];
    if (!profile || !selectedTarget || profile.active) return;
    setModal({ type: "activate", alias: profile.alias });
  }, [filteredProfiles, selectedProfileIndex, selectedTarget]);

  const confirmActivate = useCallback(async () => {
    await activateSelected();
    closeModal();
  }, [activateSelected, closeModal]);

  const openSearch = useCallback(() => {
    setSearchQuery("");
    setModal({ type: "search" });
  }, []);

  const openCreate = useCallback(() => {
    if (!selectedTarget) return;
    setModal({ type: "create" });
  }, [selectedTarget]);

  const openSave = useCallback(() => {
    if (!selectedTarget) return;
    setSaveAlias("");
    setModal({ type: "save" });
  }, [selectedTarget]);

  const confirmSave = useCallback(async () => {
    if (!selectedTarget || !saveAlias.trim()) return;
    try {
      const adapter = store.adapter(selectedTarget);
      const active = await adapter.readActive();
      if (!active) {
        setStatus(`No active config to save for ${selectedTarget.displayName}`);
        closeModal();
        return;
      }
      await store.writeProfile(selectedTarget, saveAlias.trim(), active);
      setStatus(`Saved ${selectedTarget.displayName} as '${saveAlias.trim()}'`);
      await refresh();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    }
    closeModal();
  }, [selectedTarget, saveAlias, store, closeModal, refresh]);

  const openDelete = useCallback(() => {
    const profile = filteredProfiles[selectedProfileIndex];
    if (!profile || !selectedTarget) return;
    setModal({ type: "delete", alias: profile.alias });
  }, [filteredProfiles, selectedProfileIndex, selectedTarget]);

  const confirmDelete = useCallback(async () => {
    if (!selectedTarget) return;
    const profile = filteredProfiles[selectedProfileIndex];
    if (!profile) return;
    try {
      await store.deleteProfile(selectedTarget, profile.alias);
      setStatus(
        `Deleted '${profile.alias}' from ${selectedTarget.displayName}`,
      );
      await refresh();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    }
    closeModal();
  }, [
    filteredProfiles,
    selectedProfileIndex,
    selectedTarget,
    store,
    closeModal,
    refresh,
  ]);

  const openRestore = useCallback(() => {
    if (!selectedTarget) return;
    setModal({ type: "restore" });
  }, [selectedTarget]);

  const confirmRestore = useCallback(async () => {
    if (!selectedTarget) return;
    const backupPath = getBackupPath(selectedTarget);
    if (!(await exists(backupPath))) {
      setStatus(`No backup found for ${selectedTarget.displayName}`);
      closeModal();
      return;
    }
    try {
      const activePath = store.adapter(selectedTarget).activePath();
      await restoreBackup(activePath, backupPath);
      setStatus(`Restored ${selectedTarget.displayName} from backup`);
      await refresh();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    }
    closeModal();
  }, [selectedTarget, store, closeModal, refresh]);

  return {
    selectedTarget,
    selectedTargetIndex,
    selectedProfileIndex,
    focus,
    setFocus,
    profiles,
    filteredProfiles,
    error,
    status,
    modal,
    setModal,
    searchQuery,
    saveAlias,
    setSearchQuery,
    setSaveAlias,
    setStatus,
    moveUp,
    moveDown,
    toggleFocus,
    openActivate,
    confirmActivate,
    openSearch,
    closeModal,
    openCreate,
    openSave,
    confirmSave,
    openDelete,
    confirmDelete,
    openRestore,
    confirmRestore,
    refresh,
  };
}

function modalIsOpen(modal: Modal): boolean {
  return modal.type !== "none";
}

export function App({ store, targets }: AppProps) {
  const { exit } = useApp();
  const { rows, columns } = useTerminalSize();
  const profileItemHeight = 3;
  const headerHeight = 3;
  const footerHeight = 1;
  const panelPaddingY = 2;
  const panelGapY = 1;
  const availableRows = Math.max(
    10,
    rows - headerHeight - footerHeight - panelPaddingY * 2 - panelGapY * 2 - 2,
  );
  const pageSize = Math.max(
    1,
    Math.floor((availableRows - footerHeight - panelGapY) / profileItemHeight),
  );

  const {
    selectedTarget,
    selectedTargetIndex,
    selectedProfileIndex,
    focus,
    setFocus,
    filteredProfiles,
    error,
    status,
    modal,
    setModal,
    searchQuery,
    saveAlias,
    setSearchQuery,
    setSaveAlias,
    setStatus,
    moveUp,
    moveDown,
    toggleFocus,
    openActivate,
    confirmActivate,
    openSearch,
    closeModal,
    openCreate,
    openSave,
    confirmSave,
    openDelete,
    confirmDelete,
    openRestore,
    confirmRestore,
    refresh,
  } = useTui(store, targets);

  const selectedProfile =
    focus === "profile"
      ? (filteredProfiles[selectedProfileIndex] ?? null)
      : null;

  useInput(
    (input, key) => {
      if (key.ctrl && input === "c") {
        exit();
        return;
      }
      if (input === "q" && !modalIsOpen(modal)) {
        exit();
        return;
      }
      if (modal.type === "search") {
        if (key.escape || key.return) {
          closeModal();
        }
        return;
      }
      if (modal.type === "activate" || modal.type === "delete") {
        if (key.return) {
          if (modal.type === "activate") {
            confirmActivate();
          } else {
            confirmDelete();
          }
        } else if (key.escape) {
          closeModal();
        }
        return;
      }
      if (modalIsOpen(modal)) {
        return;
      }

      if (input === "/") {
        openSearch();
        return;
      }
      if (input === "c") {
        openCreate();
        return;
      }
      if (input === "s") {
        openSave();
        return;
      }
      if (input === "d") {
        openDelete();
        return;
      }
      if (input === "r") {
        openRestore();
        return;
      }
      if (input === "?") {
        setModal({ type: "help" });
        return;
      }
      if (key.tab) {
        toggleFocus();
        return;
      }
      if (input === "h" || key.leftArrow || (key.shift && key.tab)) {
        setFocus("target");
        return;
      }
      if (input === "l" || key.rightArrow || key.tab) {
        setFocus("profile");
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
        if (focus === "profile") {
          openActivate();
        }
        return;
      }
    },
    { isActive: modal.type !== "create" && modal.type !== "save" },
  );

  if (error) {
    return (
      <Box flexDirection="column" padding={2}>
        <Text color={theme.statusErrorFg}>Error: {error}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" width={columns} height={rows}>
      <Box
        flexDirection="column"
        paddingX={2}
        paddingY={1}
        flexGrow={1}
        justifyContent="center"
      >
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
              <Text color={theme.profileActiveFg}>
                {" "}
                · filter: {searchQuery}
              </Text>
            )}
          </Box>
        </Box>

        <Box flexGrow={1} gap={3}>
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
              const isActive = i === selectedTargetIndex;
              const isFocused = focus === "target";
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
                      isActive && isFocused
                        ? theme.targetSelectedFg
                        : theme.targetNormalFg
                    }
                  >
                    {isActive && isFocused ? "> " : "  "}
                    {t.displayName}
                  </Text>
                </Box>
              );
            })}
          </Box>

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
                {selectedTarget?.displayName} Profiles
              </Text>
              <Box flexDirection="row" gap={1}>
                <Text color={theme.textMuted}>Search:</Text>
                <Text color={theme.textMuted}>
                  {modal.type === "search" ? "typing..." : "press /"}
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
              {filteredProfiles.length === 0 && (
                <Box
                  alignItems="center"
                  justifyContent="center"
                  flexDirection="column"
                >
                  <Text color={theme.textMuted}>No profiles yet</Text>
                  <Text color={theme.textMuted}>Press `c` to create one</Text>
                </Box>
              )}
              {filteredProfiles.map((p, i) => {
                const isSelected = i === selectedProfileIndex;
                const isFocused = focus === "profile";
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
                            isSelected && isFocused
                              ? theme.profileSelectedFg
                              : theme.profileNormalFg
                          }
                        >
                          {isSelected && isFocused ? "> " : "  "}
                          {p.alias}
                          {p.active && (
                            <Text color={theme.profileActiveFg}> [active]</Text>
                          )}
                        </Text>
                    </Box>
                  </Box>
                  </Box>
                );
              })}
            </Box>
          </Box>

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
            {selectedProfile ? (
              <>
                <Box
                  flexDirection="row"
                  alignItems="center"
                  gap={1}
                  marginBottom={1}
                >
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
                      {selectedProfile.alias.slice(0, 2).toUpperCase()}
                    </Text>
                  </Box>
                  <Box flexDirection="column">
                    <Text bold color={theme.profileNormalFg}>
                      {selectedProfile.alias}
                    </Text>
                    <Text color={theme.textMuted}>
                      {selectedProfile.active
                        ? "Active profile"
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
                    {selectedProfile.baseUrl ?? "-"}
                  </Text>
                </Box>

                <Box flexDirection="column" gap={1}>
                  <Text color={theme.detailLabelFg}>API Key</Text>
                  <Text
                    color={theme.textMuted}
                    backgroundColor={theme.detailValueBg}
                  >
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
                    {selectedProfile.path}
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
                <Text color={theme.textMuted}>
                  Select a profile to view details
                </Text>
              </Box>
            )}
          </Box>
        </Box>

        {status && (
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
              status.includes("Error")
                ? theme.statusErrorBorder
                : theme.statusSuccessBorder
            }
          >
            <Text
              color={
                status.includes("Error")
                  ? theme.statusErrorFg
                  : theme.statusSuccessFg
              }
            >
              {status.includes("Error") ? "x" : "ok"}
            </Text>
            <Text color={theme.text}>{status}</Text>
          </Box>
        )}

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

        {modal.type === "search" && (
          <Box marginTop={1} flexDirection="row" gap={1} alignItems="center">
            <Text color={theme.keyFg}>/</Text>
            <TextInput
              value={searchQuery}
              onChange={setSearchQuery}
              onSubmit={closeModal}
              focus
            />
            <Text color={theme.textMuted}>Esc/Enter close</Text>
          </Box>
        )}

        {modal.type === "create" && selectedTarget && (
          <Box marginTop={1}>
            <CreateWizard
              target={selectedTarget}
              store={store}
              onDone={() => {
                closeModal();
                refresh();
                setStatus(
                  `Created and activated profile on ${selectedTarget.displayName}`,
                );
              }}
              onCancel={closeModal}
              isActive
            />
          </Box>
        )}

        {modal.type === "save" && (
          <Box marginTop={1}>
            <Box
              borderStyle="single"
              paddingX={2}
              paddingY={1}
              width={50}
              borderColor={theme.border}
            >
              <Text bold color={theme.wizardTitle}>
                Save current config as profile
              </Text>
              <Box marginTop={1}>
                <Text color={theme.text}>Alias:</Text>
                <TextInput
                  value={saveAlias}
                  onChange={setSaveAlias}
                  onSubmit={confirmSave}
                  focus
                />
              </Box>
              <Box marginTop={1}>
                <Text color={theme.wizardHint}>Enter save · Esc cancel</Text>
              </Box>
            </Box>
          </Box>
        )}

        {modal.type === "restore" && (
          <Box marginTop={1}>
            <ConfirmDialog
              message={`Restore ${selectedTarget?.displayName ?? ""} from backup?`}
              onConfirm={confirmRestore}
              onCancel={closeModal}
              isActive
            />
          </Box>
        )}

        {modal.type === "help" && (
          <Box marginTop={1}>
            <HelpScreen onClose={closeModal} isActive />
          </Box>
        )}
      </Box>
    </Box>
  );
}
