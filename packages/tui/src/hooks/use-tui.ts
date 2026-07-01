import { useEffect, useState, useCallback, useMemo } from "react";
import type { ProfileStore } from "@llm-switch/core/store/profile-store.js";
import type { TargetConfig } from "@llm-switch/core/config.js";
import { getBackupPath } from "@llm-switch/core/config.js";
import { exists } from "@llm-switch/core/fs-utils.js";
import { restoreBackup } from "@llm-switch/core/backup.js";
import type { Profile } from "@llm-switch/core/adapters/types.js";

export type Focus = "target" | "profile";
export type Modal =
  | { type: "none" }
  | { type: "create" }
  | { type: "save" }
  | { type: "delete"; alias: string }
  | { type: "activate"; alias: string }
  | { type: "restore" }
  | { type: "search" }
  | { type: "help" };

export interface UseTuiDependencies {
  store: ProfileStore;
  targets: TargetConfig[];
}

export interface TuiState {
  selectedTarget: TargetConfig;
  selectedTargetIndex: number;
  selectedProfileIndex: number;
  focus: Focus;
  setFocus: (focus: Focus) => void;
  profiles: Profile[];
  filteredProfiles: Profile[];
  error: string | null;
  status: string;
  setStatus: (status: string) => void;
  modal: Modal;
  setModal: (modal: Modal) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  saveAlias: string;
  setSaveAlias: (alias: string) => void;
  moveUp: () => void;
  moveDown: () => void;
  toggleFocus: () => void;
  openActivate: () => void;
  confirmActivate: () => Promise<void>;
  openSearch: () => void;
  closeModal: () => void;
  openCreate: () => void;
  openSave: () => void;
  confirmSave: () => Promise<void>;
  openDelete: () => void;
  confirmDelete: () => Promise<void>;
  openRestore: () => void;
  confirmRestore: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useTui({ store, targets }: UseTuiDependencies): TuiState {
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
      await store.writeActiveRecord(selectedTarget, saveAlias.trim());
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
      await store.clearActiveRecord(selectedTarget);
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
    setStatus,
    modal,
    setModal,
    searchQuery,
    setSearchQuery,
    saveAlias,
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
  };
}
