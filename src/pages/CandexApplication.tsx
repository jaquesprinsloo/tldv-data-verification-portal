import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import preapplicheckLogo from "@/assets/preapplicheck-logo.png";
import SplashScreen from "@/components/candex-application/SplashScreen";
import IntroVideoScreen from "@/components/candex-application/IntroVideoScreen";
import POPIAIndemnityScreen, { type DeviceData } from "@/components/candex-application/POPIAIndemnityScreen";
import PersonalDetailsScreen, { type PersonalDetails } from "@/components/candex-application/PersonalDetailsScreen";
import QuestionnaireScreen from "@/components/candex-application/QuestionnaireScreen";

type Step = "loading" | "invalid" | "completed" | "splash" | "intro_video" | "popia" | "personal_details" | "questionnaire_intro" | "questionnaire";

const CandexApplication = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [step, setStep] = useState<Step>("loading");
  const [invitation, setInvitation] = useState<any>(null);
  const [templateVideos, setTemplateVideos] = useState<{ intro_video_url: string | null; brief_video_url: string | null }>({ intro_video_url: null, brief_video_url: null });
  const [deviceData, setDeviceData] = useState<DeviceData | null>(null);
  const [personalDetails, setPersonalDetails] = useState<PersonalDetails | null>(null);

  useEffect(() => {
    // Kick off the splash video download in parallel with the invitation
    // lookup so it's already buffered by the time SplashScreen mounts.
    try {
      const link = document.createElement("link");
      link.rel = "preload";
      link.as = "video";
      link.href = "/intro/logo-animation.mp4";
      link.type = "video/mp4";
      document.head.appendChild(link);
    } catch {
      /* ignore */
    }

    const loadInvitation = async () => {
      if (!token) { setStep("invalid"); return; }

      const { data: rpcData, error } = await supabase
        .rpc("get_candex_invitation_by_token", { _token: token });

      const data: any = rpcData;
      if (error || !data) { setStep("invalid"); return; }

      if (data.status === "completed") {
        if (data.has_application) {
          setInvitation(data);
          setStep("completed");
          return;
        }
        console.warn("Orphan invitation detected (completed status, no application). Allowing re-submission.");
      }

      setInvitation(data);

      // Fetch template videos if template is assigned
      if (data.template_id) {
        const { data: tplData } = await supabase
          .from("candex_questionnaire_templates")
          .select("*")
          .eq("id", data.template_id)
          .maybeSingle();
        if (tplData) {
          setTemplateVideos({
            intro_video_url: (tplData as any).intro_video_url || null,
            brief_video_url: (tplData as any).brief_video_url || null,
          });
        }
      }

      if (data.status === "sent") {
        await supabase.rpc("mark_candex_invitation_opened", { _token: token });
      }

      setStep("splash");
    };

    loadInvitation();
  }, [token]);

  const handleSplashComplete = useCallback(() => setStep("intro_video"), []);
  const handleIntroComplete = useCallback(() => setStep("popia"), []);

  const handlePOPIAComplete = useCallback((data: DeviceData) => {
    setDeviceData(data);
    setStep("personal_details");
  }, []);

  const handlePersonalComplete = useCallback((details: PersonalDetails) => {
    setPersonalDetails(details);
    setStep("questionnaire_intro");
  }, []);

  const handleQuestionnaireIntroComplete = useCallback(() => setStep("questionnaire"), []);

  const handleQuestionnaireComplete = useCallback(async (answers: Record<string, any>) => {
    try {
      const candidateName = personalDetails
        ? `${personalDetails.firstName} ${personalDetails.secondName ? personalDetails.secondName + " " : ""}${personalDetails.surname}`.trim()
        : invitation.candidate_name;

      // Submission and invitation status are atomically handled server-side
      // via the submit_candex_application RPC (validates token + status).
      const { data: newAppId, error: submitError } = await supabase
        .rpc("submit_candex_application", {
          _token: token!,
          _candidate_name: candidateName,
          _candidate_email: personalDetails?.email || invitation.candidate_email || "",
          _candidate_phone: personalDetails?.cellphone || invitation.candidate_phone || "",
          _candidate_id_number: personalDetails?.idNumber || invitation.candidate_id_number || "",
          _answers: {
            questionnaire: answers,
            personalDetails,
            deviceData,
            popiaAccepted: true,
            indemnityAccepted: true,
          } as any,
        });

      if (submitError || !newAppId) {
        console.error("submit_candex_application failed:", submitError);
        throw submitError || new Error("Submission was not saved. Please try again or contact support.");
      }
      const insertedApp = { id: newAppId as unknown as string };

      // Trigger pre-risk profile generation in background (fire-and-forget)
      if (insertedApp?.id) {
        supabase.functions.invoke("generate-pre-risk-profile", {
          body: { application_id: insertedApp.id, token },
        }).catch((err) => console.error("Pre-risk profile generation error:", err));
      }

      setStep("completed");
      toast.success("PreAppliCheck completed successfully!");
      return true;
    } catch (err) {
      console.error("Submission error:", err);
      toast.error("Failed to submit. Please try again.");
      return false;
    }
  }, [token, invitation, personalDetails, deviceData]);

  if (step === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600" />
      </div>
    );
  }

  if (step === "invalid") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black p-4">
        <Card className="max-w-md w-full text-center bg-zinc-950 border-zinc-800">
          <CardContent className="pt-8 pb-8">
            <AlertTriangle className="h-16 w-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2 text-white">Invalid or Expired Link</h2>
            <p className="text-zinc-400">This invitation link is no longer valid. Please contact the person who invited you for a new link.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === "completed") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black p-4">
        <Card className="max-w-md w-full text-center bg-zinc-950 border-zinc-800">
          <CardContent className="pt-8 pb-8">
            <img src={preapplicheckLogo} alt="PreAppliCheck" className="h-24 w-auto mx-auto mb-6" />
            <h2 className="text-xl font-bold mb-2 text-white">Application Submitted</h2>
            <p className="text-zinc-400">Your PreAppliCheck application has been submitted for review. You may now close this page.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === "splash") {
    return <SplashScreen onComplete={handleSplashComplete} />;
  }

  if (step === "intro_video") {
    return (
      <IntroVideoScreen
        onComplete={handleIntroComplete}
        title="Introduction to PreAppliCheck"
        description="This video explains the PreAppliCheck process. Once the video ends, you will proceed to accept the terms and conditions."
        videoUrl={templateVideos.intro_video_url}
      />
    );
  }

  if (step === "popia") {
    return <POPIAIndemnityScreen onComplete={handlePOPIAComplete} />;
  }

  if (step === "personal_details") {
    return (
      <PersonalDetailsScreen
        prefilled={{
          candidateName: invitation?.candidate_name,
          candidateEmail: invitation?.candidate_email,
          candidatePhone: invitation?.candidate_phone,
          candidateIdNumber: invitation?.candidate_id_number,
        }}
        onComplete={handlePersonalComplete}
      />
    );
  }

  if (step === "questionnaire_intro") {
    return (
      <IntroVideoScreen
        onComplete={handleQuestionnaireIntroComplete}
        title="PreAppliCheck Instructions"
        description="Please watch this instructional video before starting the pre-screening questionnaire."
        videoUrl={templateVideos.brief_video_url}
      />
    );
  }

  if (step === "questionnaire") {
    if (!invitation?.template_id) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-black p-4">
          <Card className="max-w-md w-full text-center bg-zinc-950 border-zinc-800">
            <CardContent className="pt-8 pb-8">
              <AlertTriangle className="h-16 w-16 text-yellow-500 mx-auto mb-4" />
              <h2 className="text-xl font-bold mb-2 text-white">No Template Assigned</h2>
              <p className="text-zinc-400">A questionnaire template has not been assigned to your invitation. Please contact the administrator.</p>
            </CardContent>
          </Card>
        </div>
      );
    }
    return (
      <QuestionnaireScreen
        templateId={invitation.template_id}
        onComplete={handleQuestionnaireComplete}
        invitationToken={token || undefined}
      />
    );
  }

  return null;
};

export default CandexApplication;
