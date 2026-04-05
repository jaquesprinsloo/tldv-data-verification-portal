import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Shield, FileText } from "lucide-react";
import { toast } from "sonner";
import preapplicheckLogo from "@/assets/preapplicheck-logo.jpg";

interface POPIAIndemnityScreenProps {
  onComplete: (deviceData: DeviceData) => void;
}

export interface DeviceData {
  ipAddress: string;
  gpsLatitude: number;
  gpsLongitude: number;
  userAgent: string;
  platform: string;
  language: string;
  screenResolution: string;
  timestamp: string;
}

const POPIA_TEXT = `POPIA DECLARATION

The purpose of the POPIA is to protect personal information of individuals and businesses and to give effect to their right of privacy as provided for in the Constitution. By signing this form, you consent to your personal information to be processed by True Lie Detectors & Vetting and consent is effective immediately and will remain effective until such consent is withdrawn.

I hereby give my consent to True Lie Detectors & Vetting to collect, process and distribute my personal information where True Lie Detectors & Vetting is legally required to do so. I understand my right to privacy and the right to have my personal information processed in accordance with the conditions for the lawful processing of personal information.

I understand the purposes for which my personal information is required and for which it will be used.

I understand that, should I refuse to provide True Lie Detectors & Vetting with the required consent and/or information, True Lie Detectors & Vetting will be unable to conduct this scheduled examination.

I declare that all my personal information supplied to True Lie Detectors & Vetting is accurate, up to date, not misleading and that it is complete in all respects and will be held and/or stored securely for the purpose for which it was collected and that I will immediately advise True Lie Detectors & Vetting of any changes to my Personal Information should any of these details change.

I also understand that I have the right to request that my personal information be corrected or deleted, if it is inaccurate, irrelevant, excessive, out of date, incomplete, misleading, or obtained unlawfully or that the personal information or record be destroyed or deleted if the responsible party is no longer authorised to retain it.`;

const INDEMNITY_TEXT = `CONSENT FOR THE USE OF PERSONAL INFORMATION

DEFINITIONS

1.1. Candidate means the person completing this document and/or the data subject for the purposes of POPI.

1.2. Employer means the Company considering the Candidate for purposes of employment/appointment or continuation of employment/appointment.

1.3. Company refers to the TRUE LIE DETECTORS & VETTING client, whether it be a recruitment agency or an Employer or otherwise.

1.4. Consent means any voluntary, specific and informed expression of will in terms of which permission is given for the processing of personal information.

1.5. Consumer Credit Information shall have the meaning ascribed to it in section 70 of the NCA.

1.6. FAIS Act shall mean the Financial Advisory and Intermediary Services Act of 2002.

1.7. "Fair Comment" means comments that are matters of public interest.

1.8. FSB refers to the Financial Services Board.

1.9. NCA shall mean the National Credit Act, No 34 of 2005, as amended from time to time, including any regulations made under the Act.

1.10. Operator means a person who processes personal information for a responsible party in terms of a contract or mandate, without coming under the direct authority of that party.

1.11. Personal Information shall have the meaning ascribed to it in Chapter 1 of POPI and includes, but is not limited to a name, address, email address, telephone or fax number, fingerprints, criminal history and education or other personal credentials provided, or which is collected from the candidate or other third parties, before and/or during the background screening process and/or thereafter.

1.12. Privacy and Data Protection Conditions refers to the 8 (eight) statutory prescribed conditions for the lawful Processing of Personal Information.

1.13. Responsible Parties have meaning to the Company and TRUE LIE DETECTORS & VETTING together.

1.14. Regulator means the Information Regulator established in terms of section 39.

1.15. Verification Information Suppliers shall mean third parties acting on behalf of TRUE LIE DETECTORS & VETTING, including, but not limited to, criminal record bureaus, credit bureaus, governmental bodies, and any educational, training, and fraud prevention organisations.

CONSENT

2.1. I hereby authorize the Company's duly authorized verification agent, TRUE LIE DETECTORS & VETTING (Pty) Ltd, "TLDV" to access my Personal Information and conduct background screening checks including, but not limited to, credit, qualifications, employment references, criminal record, fraud prevention, ID verification, social media searches and drivers' licence.

2.2. I consent to requests for consumer credit information to be released for the below prescribed purposes only:

2.2.1. for employment and/or appointment in a position of trust and honesty that may entail the handling of cash or finances of the Company as well as any instances of material decision making responsibilities relevant to the finances of the Company.

2.2.2. fraud prevention or detection.

2.3. I understand that verification requests form part of the background screening process.

2.4. I acknowledge that any Personal Information supplied to the Company is provided voluntarily and that the Company may not be able to comply with its obligations if the correct Personal Information is not supplied to the Company.

2.5. I understand that privacy is important to the Responsible Parties and the Responsible Parties will use reasonable efforts in order to ensure that any Personal Information in their possession or processed on their behalf is kept confidential, stored in a secure manner and processed in terms of South African law and for the purposes I have authorised.

2.6. I warrant that all information, including Personal Information, supplied to the Company is accurate and current and agree to correct and update such information when necessary.

2.7. By submitting any Personal Information to the Company in any form I acknowledge that such conduct constitutes a reasonable unconditional, specific and voluntary consent to the processing of such Personal Information.

2.8. Personal Information may be shared by the Company with TLDV and may be further shared by TLDV with the Verification Information Suppliers for verification or other legitimate purposes.

2.9. Personal Information may be shared by the Verification Information Suppliers with TLDV and be further shared by TLDV with the Company and TLDV's other clients for purposes of continued or future employment or for other legitimate purposes as per the NCA.

2.10. I consent to the further processing of my personal information insofar as this is in accordance and compatible with the purpose for which the information has been collected.

2.11. I understand that the information derived from my social media accounts form a part of the verification information required for background screening.

2.12. Personal Information may be stored for a reasonable period by the Company, TLDV and/or the Verification Information Suppliers.

2.13. Personal Information may be transferred cross-border to countries, which do not necessarily have data-protection laws similar to South Africa, for verification or storage purposes.

2.14. I take note that if the Responsible Party has utilized the Personal Information contrary to the Privacy and Data Protection Conditions, I may first resolve any concerns with that Responsible Party. If I am not satisfied with such process, I have the right to lodge a complaint with the Information Regulator.

2.15. A copy of Personal Information kept by the Responsible Parties will be furnished to me upon request in terms of the provisions of POPI or the NCA.

2.16. I unconditionally agree to indemnify the Responsible Parties, and Verification Information Suppliers, acting in good faith in taking reasonable steps to process my personal information lawfully, against any liability that may result from the processing of my personal information.

2.17. I unconditionally indemnify TLDV and its verification information suppliers against any liability that may result from furnishing information in this regard.`;

export default function POPIAIndemnityScreen({ onComplete }: POPIAIndemnityScreenProps) {
  const [popiaAccepted, setPopiaAccepted] = useState(false);
  const [indemnityAccepted, setIndemnityAccepted] = useState(false);
  const [loading, setLoading] = useState(false);

  const getIPAddress = async (): Promise<string> => {
    try {
      const res = await fetch("https://api.ipify.org?format=json");
      const data = await res.json();
      return data.ip;
    } catch {
      return "unknown";
    }
  };

  const getGPS = (): Promise<{ lat: number; lng: number }> =>
    new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve({ lat: 0, lng: 0 });
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve({ lat: 0, lng: 0 }),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    });

  const handleAccept = async () => {
    if (!popiaAccepted || !indemnityAccepted) {
      toast.error("Please accept both the POPIA Declaration and the Indemnity Consent.");
      return;
    }
    setLoading(true);
    try {
      const [ip, gps] = await Promise.all([getIPAddress(), getGPS()]);
      const deviceData: DeviceData = {
        ipAddress: ip,
        gpsLatitude: gps.lat,
        gpsLongitude: gps.lng,
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language,
        screenResolution: `${window.screen.width}x${window.screen.height}`,
        timestamp: new Date().toISOString(),
      };
      onComplete(deviceData);
    } catch {
      toast.error("Failed to collect device data. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black">
      {/* Header */}
      <div className="border-b border-zinc-800 bg-zinc-950">
        <div className="container mx-auto px-4 py-3 flex items-center gap-3">
          <img src={preapplicheckLogo} alt="PreAppliCheck" className="h-8" />
        </div>
      </div>

      <main className="container mx-auto px-4 py-6 max-w-3xl">
        <Card className="bg-zinc-950 border-zinc-800 text-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Shield className="h-5 w-5 text-red-500" />
              POPIA Declaration & Indemnity Consent
            </CardTitle>
            <p className="text-sm text-zinc-400">
              Please read both documents carefully and accept the terms to proceed.
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            <Tabs defaultValue="popia" className="w-full">
              <TabsList className="w-full bg-zinc-900 border border-zinc-800">
                <TabsTrigger value="popia" className="flex-1 data-[state=active]:bg-red-600 data-[state=active]:text-white">
                  <FileText className="h-4 w-4 mr-1" /> POPIA Declaration
                </TabsTrigger>
                <TabsTrigger value="indemnity" className="flex-1 data-[state=active]:bg-red-600 data-[state=active]:text-white">
                  <FileText className="h-4 w-4 mr-1" /> Indemnity & Consent
                </TabsTrigger>
              </TabsList>

              <TabsContent value="popia" className="mt-4 space-y-4">
                <ScrollArea className="h-[350px] w-full rounded-lg border border-zinc-800 bg-zinc-900 p-4">
                  <div className="whitespace-pre-wrap text-sm text-zinc-300 leading-relaxed">{POPIA_TEXT}</div>
                </ScrollArea>
                <div className="flex items-start space-x-3 p-3 rounded-lg bg-zinc-900 border border-zinc-800">
                  <Checkbox
                    id="popia"
                    checked={popiaAccepted}
                    onCheckedChange={(c) => setPopiaAccepted(c as boolean)}
                    disabled={loading}
                    className="mt-0.5 border-zinc-600 data-[state=checked]:bg-red-600 data-[state=checked]:border-red-600"
                  />
                  <label htmlFor="popia" className="text-sm text-zinc-300 cursor-pointer">
                    I have read, understood, and agree to the POPIA Declaration.
                  </label>
                </div>
              </TabsContent>

              <TabsContent value="indemnity" className="mt-4 space-y-4">
                <ScrollArea className="h-[350px] w-full rounded-lg border border-zinc-800 bg-zinc-900 p-4">
                  <div className="whitespace-pre-wrap text-sm text-zinc-300 leading-relaxed">{INDEMNITY_TEXT}</div>
                </ScrollArea>
                <div className="flex items-start space-x-3 p-3 rounded-lg bg-zinc-900 border border-zinc-800">
                  <Checkbox
                    id="indemnity"
                    checked={indemnityAccepted}
                    onCheckedChange={(c) => setIndemnityAccepted(c as boolean)}
                    disabled={loading}
                    className="mt-0.5 border-zinc-600 data-[state=checked]:bg-red-600 data-[state=checked]:border-red-600"
                  />
                  <label htmlFor="indemnity" className="text-sm text-zinc-300 cursor-pointer">
                    I have read, understood, and agree to the Indemnity & Consent terms.
                  </label>
                </div>
              </TabsContent>
            </Tabs>

            {/* Electronic signature notice */}
            <div className="p-4 rounded-lg bg-red-950/30 border border-red-900/50 text-sm">
              <p className="font-semibold text-red-400 mb-1">Electronic Signature Notice</p>
              <p className="text-zinc-400">
                By clicking "Accept & Continue" below, your IP address, GPS coordinates, device information,
                and the current timestamp will be recorded as your electronic signature.
              </p>
            </div>

            {/* Status indicators */}
            <div className="flex gap-4 text-xs text-zinc-500">
              <span className={popiaAccepted ? "text-green-500" : ""}>
                ● POPIA {popiaAccepted ? "Accepted" : "Pending"}
              </span>
              <span className={indemnityAccepted ? "text-green-500" : ""}>
                ● Indemnity {indemnityAccepted ? "Accepted" : "Pending"}
              </span>
            </div>

            <Button
              onClick={handleAccept}
              disabled={!popiaAccepted || !indemnityAccepted || loading}
              className="w-full bg-red-600 hover:bg-red-700 text-white disabled:opacity-40"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Collecting device data...
                </>
              ) : (
                "Accept & Continue"
              )}
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
