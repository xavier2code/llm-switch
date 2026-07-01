import React from "react";
import { Box, Text, useInput, useApp, useStdout } from "ink";
import type { ProfileStore } from "@llm-switch/core/store/profile-store.js";
import type { TargetConfig } from "@llm-switch/core/config.js";
import { theme } from "./theme.js";
import { TextInput } from "./components/text-input.js";
import { CreateWizard } from "./components/create-wizard.js";
import { ConfirmDialog } from "./components/confirm-dialog.js";
import { HelpScreen } from "./components/help-screen.js";
import { TargetPanel } from "./components/target-panel.js";
import { ProfilePanel } from "./components/profile-panel.js";
import { DetailPanel } from "./components/detail-panel.js";
import { Header } from "./components/header.js";
import { StatusBar } from "./components/status-bar.js";
import { KeyBar } from "./components/key-bar.js";
import { ErrorView } from "./components/error-view.js";
import { useTui, type Modal } from "./hooks/use-tui.js";

export interface AppProps {
  store: ProfileStore;
  targets: TargetConfig[];
}

function useTerminalSize() {
  const { stdout } = useStdout();
  const [size, setSize] = React.useState({
    columns: stdout.columns,
    rows: stdout.rows,
  });

  React.useEffect(() => {
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
    setStatus,
    modal,
    setModal,
    searchQuery,
    saveAlias,
    setSearchQuery,
    setSaveAlias,
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
  } = useTui({ store, targets });

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
    return <ErrorView error={error} />;
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
        <Header
          targets={targets}
          selectedTarget={selectedTarget}
          searchQuery={searchQuery}
        />

        <Box flexGrow={1} gap={3}>
          <TargetPanel
            targets={targets}
            selectedIndex={selectedTargetIndex}
            focused={focus === "target"}
          />
          <ProfilePanel
            title={`${selectedTarget?.displayName} Profiles`}
            profiles={filteredProfiles}
            selectedIndex={selectedProfileIndex}
            focused={focus === "profile"}
            pageSize={pageSize}
            profileItemHeight={profileItemHeight}
            isSearching={modal.type === "search"}
          />
          <DetailPanel profile={selectedProfile} />
        </Box>

        <StatusBar status={status} />

        <KeyBar modal={modal} selectedProfile={Boolean(selectedProfile)} />

        {modal.type === "search" && (
          <Box marginTop={1} flexDirection="row" gap={1} alignItems="center">
            <TextInput
              value={searchQuery}
              onChange={setSearchQuery}
              onSubmit={closeModal}
              focus
            />
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
            <Box borderStyle="single" paddingX={2} paddingY={1} width={50}>
              <Text bold color={theme.wizardTitle}>
                Save current config as profile
              </Text>
              <Box marginTop={1}>
                <TextInput
                  value={saveAlias}
                  onChange={setSaveAlias}
                  onSubmit={confirmSave}
                  focus
                />
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
