export const theme = {
  text: "black",
  textMuted: "gray",
  background: "white",
  border: "gray",

  headerTitle: "blue",
  headerVersion: "gray",
  headerStatus: "green",

  panelTitle: "black",

  targetSelectedFg: "blue",
  targetSelectedBorder: "blue",
  targetNormalFg: "black",

  profileSelectedFg: "blue",
  profileSelectedBorder: "blue",
  profileNormalFg: "black",
  profileActiveFg: "green",
  profileProviderFg: "blue",
  profileModelFg: "gray",
  profileHintFg: "gray",

  detailBadgeFg: "black",
  detailBadgeBg: "cyan",
  detailLabelFg: "gray",
  detailValueFg: "black",
  detailValueBg: "cyan",

  statusSuccessFg: "green",
  statusSuccessBorder: "green",
  statusErrorFg: "red",
  statusErrorBorder: "red",

  keyFg: "blue",

  wizardTitle: "blue",
  wizardSelection: "blue",
  wizardHint: "gray",
  wizardError: "red",
  wizardLoading: "blue",

  inputCursorFg: "white",
  inputCursorBg: "blue",
} as const;

export type Theme = typeof theme;
