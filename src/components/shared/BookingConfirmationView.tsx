import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, MapPin, CalendarIcon, Clock, Users, FileText, Loader2 } from "lucide-react";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import tldvLogo from "@/assets/tldv-logo-primary.png";

export interface BookingData {
  bookingReference: string;
  status: string;
  clientName?: string;
  scheduledDate?: string;
  scheduledTime?: string;
  venueType: string;
  venueAddress?: string;
  preferredArea?: string;
  candidates: { name: string; idNumber?: string }[];
  notes?: string;
}

interface BookingConfirmationViewProps {
  open: boolean;
  onClose: () => void;
  data: BookingData | null;
}

const getVenueLabel = (type: string) => {
  switch (type) {
    case "own_location": return "Own Location";
    case "rented_venue": return "Rented Venue";
    case "tldv_venue": return "TLDV Vetted Venue";
    default: return type;
  }
};

const getStatusColor = (status: string) => {
  switch (status) {
    case "confirmed": return "bg-green-100 text-green-800 border-green-300";
    case "scheduled": return "bg-blue-100 text-blue-800 border-blue-300";
    case "assigned": return "bg-green-100 text-green-800 border-green-300";
    case "requested": return "bg-amber-100 text-amber-800 border-amber-300";
    default: return "bg-muted text-muted-foreground";
  }
};

const BookingConfirmationView = ({ open, onClose, data }: BookingConfirmationViewProps) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  if (!data) return null;

  const handleDownload = async () => {
    if (!contentRef.current) return;
    setDownloading(true);
    try {
      const canvas = await html2canvas(contentRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
      });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidth = 210;
      const pdfHeight = 297;
      const imgWidth = pdfWidth - 20;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      const yPos = imgHeight > pdfHeight - 20 ? 10 : (pdfHeight - imgHeight) / 2;
      pdf.addImage(imgData, "PNG", 10, yPos, imgWidth, imgHeight);
      pdf.save(`Booking_Confirmation_${data.bookingReference}.pdf`);
    } catch (error) {
      console.error("Error generating PDF:", error);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto p-0">
        {/* Header with logo */}
        <div className="bg-black text-white p-6 rounded-t-lg">
          <div className="flex items-center justify-between">
            <img src={tldvLogo} alt="True Lie Detectors & Vetting" className="h-12 object-contain" />
            <Badge variant="outline" className={`${getStatusColor(data.status)} text-xs font-semibold px-3 py-1`}>
              {data.status.toUpperCase()}
            </Badge>
          </div>
          <div className="mt-4">
            <p className="text-xs text-white/60 uppercase tracking-wider">Booking Confirmation</p>
            <p className="text-xl font-bold tracking-wide mt-1">{data.bookingReference}</p>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* Client */}
          {data.clientName && (
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Client</p>
              <p className="text-sm font-medium">{data.clientName}</p>
            </div>
          )}

          {/* Appointment Details */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-muted/40 rounded-lg p-3 space-y-1">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <CalendarIcon className="h-3.5 w-3.5" />
                <span className="text-[11px] uppercase tracking-wider font-semibold">Date</span>
              </div>
              <p className="text-sm font-medium">{data.scheduledDate || "To be confirmed"}</p>
            </div>
            <div className="bg-muted/40 rounded-lg p-3 space-y-1">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                <span className="text-[11px] uppercase tracking-wider font-semibold">Time</span>
              </div>
              <p className="text-sm font-medium">{data.scheduledTime || "To be confirmed"}</p>
            </div>
          </div>

          {/* Venue */}
          <div className="bg-muted/40 rounded-lg p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" />
              <span className="text-[11px] uppercase tracking-wider font-semibold">Venue</span>
            </div>
            <p className="text-sm font-medium">{getVenueLabel(data.venueType)}</p>
            {data.venueAddress && <p className="text-xs text-muted-foreground">{data.venueAddress}</p>}
            {data.preferredArea && <p className="text-xs text-muted-foreground">Preferred Area: {data.preferredArea}</p>}
          </div>

          {/* Candidates */}
          <div>
            <div className="flex items-center gap-1.5 text-muted-foreground mb-2">
              <Users className="h-3.5 w-3.5" />
              <span className="text-[11px] uppercase tracking-wider font-semibold">Candidates ({data.candidates.length})</span>
            </div>
            <div className="border rounded-lg divide-y">
              {data.candidates.map((c, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2">
                  <span className="text-sm font-medium">{i + 1}. {c.name}</span>
                  {c.idNumber && <span className="text-xs text-muted-foreground font-mono">{c.idNumber}</span>}
                </div>
              ))}
              {data.candidates.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-3">No candidates listed</p>
              )}
            </div>
          </div>

          {/* Notes */}
          {data.notes && (
            <div>
              <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                <FileText className="h-3.5 w-3.5" />
                <span className="text-[11px] uppercase tracking-wider font-semibold">Notes</span>
              </div>
              <p className="text-sm text-muted-foreground">{data.notes}</p>
            </div>
          )}

          {/* Footer */}
          <div className="border-t pt-3 text-center">
            <p className="text-[10px] text-muted-foreground">
              True Lie Detectors & Vetting (Pty) Ltd · Generated {new Date().toLocaleDateString("en-ZA", { day: "2-digit", month: "long", year: "numeric" })}
            </p>
          </div>
        </div>

        <DialogFooter className="px-6 pb-6">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={handleDownload}>
            <Download className="h-4 w-4 mr-1" /> Download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

function generatePlainText(data: BookingData): string {
  return `
BOOKING CONFIRMATION
====================
True Lie Detectors & Vetting (Pty) Ltd

Booking Reference: ${data.bookingReference}
Status: ${data.status.toUpperCase()}
${data.clientName ? `Client: ${data.clientName}` : ""}

APPOINTMENT DETAILS
-------------------
Date: ${data.scheduledDate || "To be confirmed"}
Time: ${data.scheduledTime || "To be confirmed"}
Venue Type: ${getVenueLabel(data.venueType)}
Venue: ${data.venueAddress || "To be confirmed"}
Preferred Area: ${data.preferredArea || "Not specified"}

CANDIDATES
----------
${data.candidates.length > 0 ? data.candidates.map((c, i) => `${i + 1}. ${c.name}${c.idNumber ? ` (ID: ${c.idNumber})` : ""}`).join("\n") : "No candidates listed"}

Notes: ${data.notes || "None"}

---
Generated: ${new Date().toLocaleDateString("en-ZA", { day: "2-digit", month: "long", year: "numeric" })}
  `.trim();
}

export default BookingConfirmationView;
