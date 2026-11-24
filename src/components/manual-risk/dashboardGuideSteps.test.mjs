import { describe, expect, test } from "bun:test";
import { DASHBOARD_GUIDE_STEPS, getActiveGuideStep } from "./dashboardGuideSteps.ts";

describe("DashboardAudioGuide step synchronization", () => {
  test("maps each section of the explainer audio to the matching dashboard target", () => {
    expect(getActiveGuideStep(DASHBOARD_GUIDE_STEPS, 0)?.target).toBe("overview");
    expect(getActiveGuideStep(DASHBOARD_GUIDE_STEPS, 10)?.target).toBe("date-filters");
    expect(getActiveGuideStep(DASHBOARD_GUIDE_STEPS, 21)?.target).toBe("open-submission");
    expect(getActiveGuideStep(DASHBOARD_GUIDE_STEPS, 28)?.target).toBe("copy-link");
    expect(getActiveGuideStep(DASHBOARD_GUIDE_STEPS, 35)?.target).toBe("kpi-cards");
    expect(getActiveGuideStep(DASHBOARD_GUIDE_STEPS, 45)?.target).toBe("kpi-risk-cards");
    expect(getActiveGuideStep(DASHBOARD_GUIDE_STEPS, 54)?.target).toBe("chart-progress");
    expect(getActiveGuideStep(DASHBOARD_GUIDE_STEPS, 60)?.target).toBe("chart-accounts");
    expect(getActiveGuideStep(DASHBOARD_GUIDE_STEPS, 68)?.target).toBe("in-progress-table");
  });
});