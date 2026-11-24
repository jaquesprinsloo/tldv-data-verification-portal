export type DashboardGuideTarget =
  | "overview"
  | "date-filters"
  | "open-submission"
  | "copy-link"
  | "kpi-cards"
  | "kpi-risk-cards"
  | "chart-progress"
  | "chart-accounts"
  | "in-progress-table";

export type GuideStep = {
  target: DashboardGuideTarget;
  label: string;
  start: number;
  end: number;
};

export const DASHBOARD_GUIDE_STEPS: GuideStep[] = [
  { target: "overview", label: "Dashboard overview", start: 0, end: 8.0 },
  { target: "date-filters", label: "Date range & presets", start: 8.0, end: 19.8 },
  { target: "open-submission", label: "Open submission page", start: 19.8, end: 24.3 },
  { target: "copy-link", label: "Copy shareable store link", start: 24.3, end: 32.8 },
  { target: "kpi-cards", label: "Key vetting totals", start: 32.8, end: 40.6 },
  { target: "kpi-risk-cards", label: "Risk & invalid ID flags", start: 40.6, end: 50.5 },
  { target: "chart-progress", label: "Progress by check type", start: 50.5, end: 58.1 },
  { target: "chart-accounts", label: "Busiest accounts", start: 58.1, end: 63.2 },
  { target: "in-progress-table", label: "Checks still in progress", start: 63.2, end: 75.0 },
];

export function getActiveGuideStep(steps: GuideStep[], currentTime: number): GuideStep | null {
  if (!Number.isFinite(currentTime) || currentTime < 0) return steps[0] ?? null;
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i];
    if (step && currentTime >= step.start) return step;
  }
  return steps[0] ?? null;
}