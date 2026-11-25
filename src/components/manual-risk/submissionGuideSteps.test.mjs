import { describe, expect, test } from "bun:test";
import {
  SUBMISSION_GUIDE_DEMO_CUES,
  SUBMISSION_GUIDE_STEPS,
  getActiveSubmissionDemoAction,
  getActiveSubmissionGuideStep,
} from "./submissionGuideSteps.ts";

describe("submission guide timing map", () => {
  test("maps audio timestamps to the matching form step and target", () => {
    expect(getActiveSubmissionGuideStep(SUBMISSION_GUIDE_STEPS, 0)?.target).toBe("header");
    expect(getActiveSubmissionGuideStep(SUBMISSION_GUIDE_STEPS, 10)?.formStep).toBe(1);
    expect(getActiveSubmissionGuideStep(SUBMISSION_GUIDE_STEPS, 15)?.target).toBe("single-submission");
    expect(getActiveSubmissionGuideStep(SUBMISSION_GUIDE_STEPS, 20)?.formStep).toBe(2);
    expect(getActiveSubmissionGuideStep(SUBMISSION_GUIDE_STEPS, 30)?.formStep).toBe(3);
    expect(getActiveSubmissionGuideStep(SUBMISSION_GUIDE_STEPS, 42)?.target).toBe("candidate-details");
    expect(getActiveSubmissionGuideStep(SUBMISSION_GUIDE_STEPS, 52)?.target).toBe("documents-upload");
    expect(getActiveSubmissionGuideStep(SUBMISSION_GUIDE_STEPS, 57)?.target).toBe("consent-box");
    expect(getActiveSubmissionGuideStep(SUBMISSION_GUIDE_STEPS, 61)?.target).toBe("submit-button");
    expect(getActiveSubmissionGuideStep(SUBMISSION_GUIDE_STEPS, 66)?.formStep).toBe(5);
  });

  test("triggers click animation cues right before advancing steps", () => {
    expect(getActiveSubmissionDemoAction(SUBMISSION_GUIDE_DEMO_CUES, 16.4)).toBe("click-single");
    expect(getActiveSubmissionDemoAction(SUBMISSION_GUIDE_DEMO_CUES, 25.0)).toBeNull();
    expect(getActiveSubmissionDemoAction(SUBMISSION_GUIDE_DEMO_CUES, 62.5)).toBe("click-submit");
  });
});