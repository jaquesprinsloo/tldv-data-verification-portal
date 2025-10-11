import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Printer, FileText } from "lucide-react";
import { format } from "date-fns";
import { useState, useEffect } from "react";
import { toast } from "sonner";

interface POPIAViewDialogProps {
  employeeId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const POPIAViewDialog = ({ employeeId, open, onOpenChange }: POPIAViewDialogProps) => {
  const [popiaData, setPopiaData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open && employeeId) {
      fetchPopiaData();
    }
  }, [open, employeeId]);

  const fetchPopiaData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("popia_acceptances")
        .select("*")
        .eq("employee_id", employeeId)
        .order("accepted_at", { ascending: false })
        .limit(1)
        .single();

      if (error) throw error;
      setPopiaData(data);
    } catch (error) {
      console.error("Error fetching POPIA data:", error);
      toast.error("Failed to load POPIA declaration");
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (!popiaData && !loading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              POPIA Declaration
            </DialogTitle>
          </DialogHeader>
          <div className="p-8 text-center">
            <p className="text-muted-foreground">No POPIA declaration found for this employee.</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="print:hidden">
          <DialogTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              POPIA Declaration
            </span>
            <Button onClick={handlePrint} variant="outline" size="sm">
              <Printer className="h-4 w-4 mr-2" />
              Print
            </Button>
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="p-8 text-center">
            <p className="text-muted-foreground">Loading POPIA declaration...</p>
          </div>
        ) : (
          <div className="space-y-6 print:space-y-4">
            {/* Print Header */}
            <div className="hidden print:block text-center border-b-2 border-primary pb-4 mb-6">
              <h1 className="text-2xl font-bold">Employee Verification Portal</h1>
              <h2 className="text-xl font-semibold mt-2">POPIA Declaration & Electronic Signature</h2>
            </div>

            {/* Declaration Text */}
            <div className="border rounded-lg p-6 bg-muted/50 print:border-2 print:border-black">
              <h3 className="font-bold text-lg mb-4 print:text-xl">Protection of Personal Information Act (POPIA) Declaration</h3>
              <div className="prose prose-sm max-w-none text-justify whitespace-pre-wrap">
                {popiaData.declaration_text}
              </div>
            </div>

            {/* Electronic Signature Details */}
            <div className="border-2 border-primary rounded-lg p-6 print:border-black print:mt-6">
              <h3 className="font-bold text-lg mb-4 flex items-center gap-2 print:text-xl">
                <FileText className="h-5 w-5 print:hidden" />
                Electronic Signature & Acceptance Details
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                {/* Timestamp */}
                <div className="col-span-full border-b pb-3">
                  <span className="text-muted-foreground font-semibold">Acceptance Date & Time:</span>
                  <p className="font-bold text-base mt-1">
                    {format(new Date(popiaData.accepted_at), "EEEE, MMMM d, yyyy 'at' h:mm:ss a")}
                  </p>
                </div>

                {/* IP Address */}
                <div>
                  <span className="text-muted-foreground font-semibold">IP Address:</span>
                  <p className="font-medium">{popiaData.ip_address}</p>
                </div>

                {/* GPS Coordinates */}
                <div>
                  <span className="text-muted-foreground font-semibold">GPS Coordinates:</span>
                  <p className="font-medium">
                    {popiaData.gps_latitude && popiaData.gps_longitude
                      ? `${popiaData.gps_latitude}, ${popiaData.gps_longitude}`
                      : "Not captured"}
                  </p>
                </div>

                {/* Device Information */}
                {popiaData.device_info && (
                  <>
                    <div>
                      <span className="text-muted-foreground font-semibold">Browser:</span>
                      <p className="font-medium">{popiaData.device_info.userAgent || "N/A"}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground font-semibold">Platform:</span>
                      <p className="font-medium">{popiaData.device_info.platform || "N/A"}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground font-semibold">Screen Resolution:</span>
                      <p className="font-medium">
                        {popiaData.device_info.screenWidth && popiaData.device_info.screenHeight
                          ? `${popiaData.device_info.screenWidth}x${popiaData.device_info.screenHeight}`
                          : "N/A"}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground font-semibold">Language:</span>
                      <p className="font-medium">{popiaData.device_info.language || "N/A"}</p>
                    </div>
                  </>
                )}
              </div>

              {/* Digital Signature Notice */}
              <div className="mt-6 pt-4 border-t">
                <p className="text-xs text-muted-foreground italic">
                  This electronic signature is legally binding and constitutes acceptance of the POPIA declaration. 
                  The signature was captured using secure digital verification methods including IP address tracking, 
                  GPS location verification, and device fingerprinting to ensure authenticity and non-repudiation.
                </p>
              </div>
            </div>

            {/* Record ID (for reference) */}
            <div className="text-xs text-muted-foreground text-center print:mt-8">
              <p>Record ID: {popiaData.id}</p>
              <p>Generated: {format(new Date(), "PPpp")}</p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default POPIAViewDialog;
