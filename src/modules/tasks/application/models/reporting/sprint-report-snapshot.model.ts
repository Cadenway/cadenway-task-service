/**
 * A server-issued history snapshot. On input it must have been authenticated and bound to the
 * organization, actor, sprint and report parameters by the transport boundary.
 */
export type SprintReportSnapshot = string & { readonly __sprintReportSnapshot: unique symbol };
