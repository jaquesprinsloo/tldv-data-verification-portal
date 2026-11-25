export type SubmissionGuideTarget =
  | "header"
  | "submission-type"
  | "single-submission"
  | "store-selection"
  | "submitter-details"
  | "candidate-details"
  | "documents-upload"
  | "consent-box"
  | "submit-button"
  | "confirmation-card";

export type SubmissionGuideStep = {
  target: SubmissionGuideTarget;
  label: string;
  formStep: 1 | 2 | 3 | 4 | 5;
  start: number;
  end: number;
};

export type SubmissionDemoAction = "click-single" | "click-submit";

export type SubmissionDemoCue = {
  action: SubmissionDemoAction;
  start: number;
  end: number;
};

export const SUBMISSION_GUIDE_STEPS: SubmissionGuideStep[] = [
  { target: "header", label: "Welcome & overview", formStep: 1, start: 0, end: 8.4 },
  { target: "submission-type", label: "Single or batch submission", formStep: 1, start: 8.4, end: 14.0 },
  { target: "single-submission", label: "Select single submission", formStep: 1, start: 14.0, end: 17.0 },
  { target: "store-selection", label: "Confirm your branch", formStep: 2, start: 17.0, end: 27.3 },
  { target: "submitter-details", label: "Your contact details", formStep: 3, start: 27.3, end: 37.2 },
  { target: "candidate-details", label: "Candidate ID & exact names", formStep: 4, start: 37.2, end: 50.0 },
  { target: "documents-upload", label: "Upload signed indemnity", formStep: 4, start: 50.0, end: 55.9 },
  { target: "consent-box", label: "Confirm candidate consent", formStep: 4, start: 55.9, end: 59.3 },
  { target: "submit-button", label: "Submit your request", formStep: 4, start: 59.3, end: 63.2 },
  { target: "confirmation-card", label: "Order reference confirmation", formStep: 5, start: 63.2, end: 72.0 },
];

export const SUBMISSION_GUIDE_DEMO_CUES: SubmissionDemoCue[] = [
  { action: "click-single", start: 16.0, end: 17.0 },
  { action: "click-submit", start: 62.0, end: 63.2 },
];

export function getActiveSubmissionGuideStep(
  steps: SubmissionGuideStep[],
  currentTime: number,
): SubmissionGuideStep | null {
  if (!Number.isFinite(currentTime) || currentTime < 0) return steps[0] ?? null;
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i];
    if (step && currentTime >= step.start) return step;
  }
  return steps[0] ?? null;
}

export function getActiveSubmissionDemoAction(
  cues: SubmissionDemoCue[],
  currentTime: number,
): SubmissionDemoAction | null {
  if (!Number.isFinite(currentTime) || currentTime < 0) return null;
  for (const cue of cues) {
    if (currentTime >= cue.start && currentTime < cue.end) {
      return cue.action;
    }
  }
  return null;
}