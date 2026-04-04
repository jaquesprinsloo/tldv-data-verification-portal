import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
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
  const [deviceData, setDeviceData] = useState<DeviceData | null>(null);
  const [personalDetails, setPersonalDetails] = useState<PersonalDetails | null>(null);

  useEffect(() => {
    const loadInvitation = async () => {
      if (!token) { setStep("invalid"); return; }

      const { data, error } = await supabase
        .from("candex_invitations")
        .select("*")
        .eq("token", token)
        .maybeSingle();

      if (error || !data) { setStep("invalid"); return; }

      if (data.status === "completed") {
        setInvitation(data);
        setStep("completed");
        return;
      }

      setInvitation(data);

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
      // Update invitation to completed
      await supabase
        .from("candex_invitations")
        .update({ status: "completed" })
        .eq("token", token!);

      // Create application record
      await supabase.from("candex_applications").insert({
        invitation_id: invitation.id,
        client_id: invitation.client_id,
        candidate_name: personalDetails
          ? `${personalDetails.firstName} ${personalDetails.secondName ? personalDetails.secondName + " " : ""}${personalDetails.surname}`.trim()
          : invitation.candidate_name,
        candidate_email: personalDetails?.email || invitation.candidate_email,
        candidate_phone: personalDetails?.cellphone || invitation.candidate_phone,
        candidate_id_number: personalDetails?.idNumber || invitation.candidate_id_number,
        template_id: invitation.template_id,
        status: "completed",
        submitted_at: new Date().toISOString(),
        answers: {
          questionnaire: answers,
          personalDetails,
          deviceData,
          popiaAccepted: true,
          indemnityAccepted: true,
        },
      });

      setStep("completed");
      toast.success("CanDex Pre-Screening completed successfully!");
    } catch (err) {
      console.error("Submission error:", err);
      toast.error("Failed to submit. Please try again.");
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
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2 text-white">CanDex Pre-Screening Complete</h2>
            <p className="text-zinc-400">Your application has been submitted successfully. Thank you for completing the CanDex Pre-Screening process. You may now close this page.</p>
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
        title="Introduction to CanDex Pre-Screening"
        description="This video explains the CanDex Pre-Screening process. Once the video ends, you will proceed to accept the terms and conditions."
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
        title="CanDex Pre-Screening Instructions"
        description="Please watch this instructional video before starting the pre-screening questionnaire."
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
      />
    );
  }

  return null;
};

export default CandexApplication;
