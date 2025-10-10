import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface POPIADeclarationProps {
  employeeId: string;
  onAccept: () => void;
}

const POPIA_TEXT = `
PROTECTION OF PERSONAL INFORMATION ACT (POPIA) DECLARATION

I, the undersigned employee, hereby acknowledge and consent to the following:

1. PURPOSE OF DATA COLLECTION
I understand that my personal information is being collected for the purposes of:
   - Employee verification and identification
   - Compliance with employment and tax regulations
   - Communication regarding employment matters
   - Record-keeping as required by law

2. TYPES OF INFORMATION COLLECTED
I consent to the collection and processing of the following personal information:
   - Full name, ID number, and employee number
   - Contact details (email address, phone number, physical address)
   - Geographic location data (GPS coordinates)
   - Proof of residence documentation
   - ID photo and verification documents
   - Next of kin information
   - IP address and device information

3. DATA PROCESSING AND STORAGE
I understand that:
   - My personal information will be stored securely in electronic format
   - Access to my information is restricted to authorized personnel only
   - My information will be retained for the duration of my employment plus the legally required retention period
   - My information may be shared with relevant authorities when required by law

4. MY RIGHTS
I acknowledge that I have the right to:
   - Access my personal information held by the company
   - Request correction of any inaccurate information
   - Object to the processing of my information in certain circumstances
   - Lodge a complaint with the Information Regulator if I believe my rights have been violated

5. CONSENT TO GEOLOCATION AND IP TRACKING
I specifically consent to:
   - The collection of my GPS coordinates at the time of this declaration and during submissions
   - The recording of my IP address for security and verification purposes
   - The use of this location data to verify the authenticity of my submissions

6. ELECTRONIC SIGNATURE
By accepting this declaration electronically, I confirm that:
   - I have read and understood the contents of this declaration
   - My acceptance is legally binding
   - The combination of my IP address, GPS coordinates, and timestamp serves as my electronic signature

7. UPDATES TO THIS DECLARATION
I understand that I may be required to re-accept this declaration if there are material changes to how my personal information is processed.

DECLARATION OF ACCEPTANCE
I hereby declare that I have read, understood, and agree to all terms and conditions outlined in this POPIA Declaration.
`;

export default function POPIADeclaration({ employeeId, onAccept }: POPIADeclarationProps) {
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);

  const getIPAddress = async (): Promise<string> => {
    try {
      const response = await fetch('https://api.ipify.org?format=json');
      const data = await response.json();
      return data.ip;
    } catch (error) {
      console.error('Error fetching IP:', error);
      return 'unknown';
    }
  };

  const getGPSCoordinates = (): Promise<{ latitude: number; longitude: number }> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation not supported'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        (error) => {
          console.error('GPS error:', error);
          resolve({ latitude: 0, longitude: 0 }); // Fallback to 0,0 if GPS fails
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });
  };

  const getDeviceInfo = () => {
    return {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      screenResolution: `${window.screen.width}x${window.screen.height}`,
      timestamp: new Date().toISOString(),
    };
  };

  const handleAccept = async () => {
    if (!accepted) {
      toast({
        title: "Please accept the declaration",
        description: "You must check the acceptance box to continue.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      // Gather all required data
      const [ipAddress, gpsCoordinates] = await Promise.all([
        getIPAddress(),
        getGPSCoordinates(),
      ]);

      const deviceInfo = getDeviceInfo();

      // Save to database
      const { error } = await supabase.from('popia_acceptances').insert({
        employee_id: employeeId,
        ip_address: ipAddress,
        gps_latitude: gpsCoordinates.latitude,
        gps_longitude: gpsCoordinates.longitude,
        device_info: deviceInfo,
        declaration_text: POPIA_TEXT,
      });

      if (error) throw error;

      toast({
        title: "POPIA Declaration Accepted",
        description: "Thank you for accepting the declaration.",
      });

      onAccept();
    } catch (error) {
      console.error('Error saving POPIA acceptance:', error);
      toast({
        title: "Error",
        description: "Failed to save your acceptance. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle>POPIA Declaration</CardTitle>
        <CardDescription>
          Please read and accept the Protection of Personal Information Act declaration before proceeding.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ScrollArea className="h-[400px] w-full rounded-md border p-4">
          <div className="whitespace-pre-wrap text-sm">{POPIA_TEXT}</div>
        </ScrollArea>

        <div className="flex items-center space-x-2">
          <Checkbox
            id="popia-accept"
            checked={accepted}
            onCheckedChange={(checked) => setAccepted(checked as boolean)}
            disabled={loading}
          />
          <label
            htmlFor="popia-accept"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            I have read, understood, and agree to all terms and conditions outlined in this POPIA Declaration.
          </label>
        </div>

        <div className="bg-muted p-4 rounded-md text-sm">
          <p className="font-semibold mb-2">Electronic Signature Notice:</p>
          <p>
            By clicking "Accept Declaration" below, your IP address, GPS coordinates, device information, and
            the current timestamp will be recorded as your electronic signature. This serves as legal proof of
            your consent to the terms outlined above.
          </p>
        </div>

        <Button onClick={handleAccept} disabled={!accepted || loading} className="w-full">
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Processing...
            </>
          ) : (
            "Accept Declaration"
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
