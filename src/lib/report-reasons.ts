/** Why someone gets reported. Shared by the report form (client) and the report route and library (server). */
export const REPORT_REASONS = ["harassment", "spam", "impersonation", "adult", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
