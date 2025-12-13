import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Mail, Copy, Loader2 } from "lucide-react";

interface InviteEmployeeDialogProps {
  employeeId: string;
  employeeNumber: string;
  employeeEmail?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const InviteEmployeeDialog = ({ employeeId, employeeNumber, employeeEmail, open, onOpenChange }: InviteEmployeeDialogProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState(employeeEmail || "");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [invitationLink, setInvitationLink] = useState("");
  const [otp, setOtp] = useState("");
  const [invitationMethod, setInvitationMethod] = useState<"email" | "whatsapp" | "qr_coupon">("email");
  const [showQRCode, setShowQRCode] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState("");

  // Update email when employeeEmail prop changes or dialog opens
  useEffect(() => {
    if (open && employeeEmail) {
      setEmail(employeeEmail);
    }
  }, [open, employeeEmail]);

  const generateInvitation = async () => {
    // Validate based on invitation method
    if (invitationMethod === "email" && !email) {
      toast({
        title: "Email Required",
        description: "Please enter an email address for email invitations",
        variant: "destructive",
      });
      return;
    }

    if (invitationMethod === "whatsapp" && !phoneNumber) {
      toast({
        title: "Phone Number Required",
        description: "Please enter a phone number for WhatsApp invitations",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      // Generate unique token and OTP
      const token = crypto.randomUUID();
      const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP

      // Create invitation
      const { error: insertError } = await supabase.from("employee_invitations").insert({
        employee_id: employeeId,
        token: token,
        email: invitationMethod === "email" ? email : (phoneNumber || email),
        otp: otp,
        invitation_method: invitationMethod,
      });

      if (insertError) throw insertError;

      // Generate invitation link
      const link = `${window.location.origin}/employee/register?token=${token}`;
      setInvitationLink(link);
      setOtp(otp);

      // Handle different invitation methods
      if (invitationMethod === "email") {
        // Send invitation email
        const { error: emailError } = await supabase.functions.invoke("send-invitation-email", {
          body: {
            email: email,
            employeeNumber: employeeNumber,
            invitationLink: link,
            otp: otp,
          },
        });

        if (emailError) {
          console.error("Failed to send email:", emailError);
          toast({
            title: "Invitation Created",
            description: "Link generated but email failed to send. Please share the link and OTP manually.",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Invitation Sent",
            description: "Invitation email sent successfully",
          });
        }
      } else if (invitationMethod === "qr_coupon") {
        // Generate QR code
        const QRCode = (await import("qrcode")).default;
        const qrDataUrl = await QRCode.toDataURL(link, { width: 300, margin: 2 });
        setQrCodeDataUrl(qrDataUrl);
        setShowQRCode(true);
        
        toast({
          title: "QR Code Generated",
          description: "QR code is ready. You can save or print it.",
        });
      } else if (invitationMethod === "whatsapp") {
        toast({
          title: "Invitation Created",
          description: "Share the link and OTP via WhatsApp manually",
        });
      }
    } catch (error: any) {
      toast({
        title: "Failed to Create Invitation",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(invitationLink);
    toast({
      title: "Link Copied",
      description: "Invitation link copied to clipboard",
    });
  };

  const copyOtp = () => {
    navigator.clipboard.writeText(otp);
    toast({
      title: "OTP Copied",
      description: "OTP copied to clipboard",
    });
  };

  const handleClose = () => {
    setEmail(employeeEmail || "");
    setPhoneNumber("");
    setInvitationLink("");
    setOtp("");
    setInvitationMethod("email");
    setShowQRCode(false);
    setQrCodeDataUrl("");
    onOpenChange(false);
  };

  const handlePrintQR = () => {
    if (!qrCodeDataUrl) return;
    
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Employee Invitation QR Code</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              min-height: 100vh;
              margin: 0;
              background: #f5f5f5;
            }
            .coupon {
              background: white;
              padding: 40px;
              border-radius: 10px;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
              text-align: center;
              max-width: 400px;
            }
            h1 { color: #333; margin-bottom: 10px; font-size: 24px; }
            .qr-code { margin: 20px 0; }
            .otp {
              font-size: 32px;
              font-weight: bold;
              letter-spacing: 4px;
              color: #2563eb;
              margin: 20px 0;
              padding: 15px;
              background: #eff6ff;
              border-radius: 5px;
            }
            .info {
              margin: 20px 0;
              padding: 15px;
              background: #f9f9f9;
              border-radius: 5px;
            }
            @media print {
              body { background: white; }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="coupon">
            <h1>Employee Portal Invitation</h1>
            <p style="color: #666; margin-bottom: 20px;">Scan the QR code or use the details below</p>
            
            <div class="qr-code">
              <img src="${qrCodeDataUrl}" alt="QR Code" />
            </div>
            
            <div class="otp">${otp}</div>
            <p style="color: #666; font-size: 14px; margin-top: -10px;">6-Digit OTP</p>
            
            <div class="info">
              <p><strong>Employee Number:</strong> ${employeeNumber}</p>
            </div>
            
            <button class="no-print" onclick="window.print()" style="
              margin-top: 20px;
              padding: 10px 20px;
              background: #2563eb;
              color: white;
              border: none;
              border-radius: 5px;
              cursor: pointer;
              font-size: 14px;
            ">Print Coupon</button>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite Employee to Portal</DialogTitle>
          <DialogDescription>
            Send an invitation to employee #{employeeNumber} to create an account
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="method">Invitation Method</Label>
            <select
              id="method"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              value={invitationMethod}
              onChange={(e) => setInvitationMethod(e.target.value as "email" | "whatsapp" | "qr_coupon")}
              disabled={loading || !!invitationLink}
            >
              <option value="email">Email</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="qr_coupon">QR Code Coupon</option>
            </select>
          </div>

          {invitationMethod === "email" && (
            <div className="space-y-2">
              <Label htmlFor="email">Employee Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="employee@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading || !!invitationLink}
              />
            </div>
          )}

          {invitationMethod === "whatsapp" && (
            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="+27821234567"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                disabled={loading || !!invitationLink}
              />
            </div>
          )}

          {showQRCode && qrCodeDataUrl && (
            <div className="space-y-2 border rounded-lg p-4 bg-muted">
              <Label>QR Code</Label>
              <div className="flex flex-col items-center gap-4">
                <img src={qrCodeDataUrl} alt="QR Code" className="w-64 h-64" />
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => {
                    const link = document.createElement('a');
                    link.download = `invitation-qr-${employeeNumber}.png`;
                    link.href = qrCodeDataUrl;
                    link.click();
                  }}>
                    Save QR Code
                  </Button>
                  <Button type="button" variant="outline" onClick={handlePrintQR}>
                    Print Coupon
                  </Button>
                </div>
              </div>
            </div>
          )}

          {invitationLink && (
            <>
              <div className="space-y-2">
                <Label>6-Digit OTP</Label>
                <div className="flex gap-2">
                  <Input 
                    value={otp} 
                    readOnly 
                    className="font-mono text-lg font-bold text-center"
                  />
                  <Button type="button" variant="outline" size="sm" onClick={copyOtp}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Employee will use this OTP along with their credentials
                </p>
              </div>
              
              <div className="space-y-2">
                <Label>Invitation Link</Label>
                <div className="flex gap-2">
                  <Input value={invitationLink} readOnly className="font-mono text-xs" />
                  <Button type="button" variant="outline" size="sm" onClick={copyLink}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  This link and OTP expire in 7 days. Share securely with the employee.
                </p>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          {!invitationLink ? (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={generateInvitation} disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Mail className="mr-2 h-4 w-4" />
                Generate Invitation
              </Button>
            </>
          ) : (
            <Button onClick={handleClose}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default InviteEmployeeDialog;
