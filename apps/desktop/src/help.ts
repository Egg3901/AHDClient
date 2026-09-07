/** Mobile help stays in the trusted game webview; desktop opens GitHub. */
export function reportIssueRoute(mobile: boolean):
  | "help.suggestions"
  | "help.report-issue" {
  return mobile ? "help.suggestions" : "help.report-issue";
}
