import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Copy, Download, QrCode, Trash2, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import InvitationDetailsDialog from "./InvitationDetailsDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import QRCode from "qrcode";

interface Invitation {
  id: string;
  employee_id: string;
  email: string;
  token: string;
  otp: string;
  invitation_method: string;
  created_at: string;
  expires_at: string;
  used: boolean;
  used_at?: string;
  employees: {
    employee_number: string;
    id_number: string;
  };
}

const InvitationsList = () => {
  const { toast } = useToast();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedInvitations, setSelectedInvitations] = useState<Set<string>>(new Set());
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [selectedInvitation, setSelectedInvitation] = useState<Invitation | null>(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);

  useEffect(() => {
    fetchInvitations();
  }, []);

  const fetchInvitations = async () => {
    try {
      const { data, error } = await supabase
        .from("employee_invitations")
        .select(`
          *,
          employees (
            employee_number,
            id_number
          )
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setInvitations(data || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: `${label} copied to clipboard`,
    });
  };

  const generateQRCoupon = async (invitation: Invitation) => {
    try {
      const link = `${window.location.origin}/employee/register?token=${invitation.token}`;
      const qrDataUrl = await QRCode.toDataURL(link, { width: 300, margin: 2 });

      // Create a printable coupon
      const printWindow = window.open("", "_blank");
      if (!printWindow) return;

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Employee Invitation Coupon</title>
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
              .logo {
                margin-bottom: 20px;
              }
              h1 {
                color: #333;
                margin-bottom: 10px;
                font-size: 24px;
              }
              .qr-code {
                margin: 20px 0;
              }
              .info {
                margin: 20px 0;
                padding: 15px;
                background: #f9f9f9;
                border-radius: 5px;
              }
              .info-row {
                display: flex;
                justify-content: space-between;
                margin: 10px 0;
                padding: 8px;
                background: white;
                border-radius: 3px;
              }
              .label {
                font-weight: bold;
                color: #666;
              }
              .value {
                font-family: monospace;
                color: #333;
              }
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
              @media print {
                body {
                  background: white;
                }
                .no-print {
                  display: none;
                }
              }
            </style>
          </head>
          <body>
            <div class="coupon">
              <div class="logo">
                <img src="/tldv-logo.png" alt="TLDV Logo" style="max-width: 150px;">
              </div>
              <h1>Employee Portal Invitation</h1>
              <p style="color: #666; margin-bottom: 20px;">Scan the QR code or use the details below</p>
              
              <div class="qr-code">
                <img src="${qrDataUrl}" alt="QR Code" />
              </div>
              
              <div class="otp">${invitation.otp}</div>
              <p style="color: #666; font-size: 14px; margin-top: -10px;">6-Digit OTP</p>
              
              <div class="info">
                <div class="info-row">
                  <span class="label">Employee Number:</span>
                  <span class="value">${invitation.employees.employee_number}</span>
                </div>
                <div class="info-row">
                  <span class="label">ID Number:</span>
                  <span class="value">${invitation.employees.id_number}</span>
                </div>
                <div class="info-row">
                  <span class="label">Expires:</span>
                  <span class="value">${new Date(invitation.expires_at).toLocaleDateString()}</span>
                </div>
              </div>
              
              <p style="color: #999; font-size: 12px; margin-top: 20px;">
                For support, contact your HR department
              </p>
              
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
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to generate QR coupon",
        variant: "destructive",
      });
    }
  };

  const getMethodBadge = (method: string) => {
    const variants: Record<string, "default" | "secondary" | "outline"> = {
      email: "default",
      whatsapp: "secondary",
      qr_coupon: "outline",
    };
    return <Badge variant={variants[method] || "default"}>{method.replace("_", " ").toUpperCase()}</Badge>;
  };

  const toggleSelection = (invitationId: string) => {
    const newSelection = new Set(selectedInvitations);
    if (newSelection.has(invitationId)) {
      newSelection.delete(invitationId);
    } else {
      newSelection.add(invitationId);
    }
    setSelectedInvitations(newSelection);
  };

  const toggleSelectAll = () => {
    if (selectedInvitations.size === invitations.length) {
      setSelectedInvitations(new Set());
    } else {
      setSelectedInvitations(new Set(invitations.map(inv => inv.id)));
    }
  };

  const handleDeleteClick = () => {
    if (selectedInvitations.size === 0) {
      toast({
        title: "No Selection",
        description: "Please select at least one invitation to delete",
        variant: "destructive",
      });
      return;
    }
    setShowDeleteDialog(true);
  };

  const handleDelete = async () => {
    if (adminPassword !== "Admin123") {
      toast({
        title: "Access Denied",
        description: "Incorrect administrator password",
        variant: "destructive",
      });
      return;
    }

    try {
      const { error } = await supabase
        .from("employee_invitations")
        .delete()
        .in("id", Array.from(selectedInvitations));

      if (error) throw error;

      toast({
        title: "Deleted",
        description: `${selectedInvitations.size} invitation(s) deleted successfully`,
      });

      setSelectedInvitations(new Set());
      setAdminPassword("");
      setShowDeleteDialog(false);
      fetchInvitations();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return <div className="flex justify-center p-8">Loading invitations...</div>;
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Employee Invitations</CardTitle>
          {selectedInvitations.size > 0 && (
            <Button variant="destructive" onClick={handleDeleteClick}>
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Selected ({selectedInvitations.size})
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox
                    checked={selectedInvitations.size === invitations.length && invitations.length > 0}
                    onCheckedChange={toggleSelectAll}
                  />
                </TableHead>
                <TableHead>Employee #</TableHead>
              <TableHead>ID Number</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>OTP</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invitations.map((invitation) => (
              <TableRow key={invitation.id}>
                <TableCell>
                  <Checkbox
                    checked={selectedInvitations.has(invitation.id)}
                    onCheckedChange={() => toggleSelection(invitation.id)}
                  />
                </TableCell>
                <TableCell className="font-mono">{invitation.employees.employee_number}</TableCell>
                <TableCell className="font-mono text-xs">{invitation.employees.id_number}</TableCell>
                <TableCell>{invitation.email}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold">{invitation.otp}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(invitation.otp, "OTP")}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </TableCell>
                <TableCell>{getMethodBadge(invitation.invitation_method)}</TableCell>
                <TableCell>
                  {invitation.used ? (
                    <Badge variant="secondary">Used</Badge>
                  ) : new Date(invitation.expires_at) < new Date() ? (
                    <Badge variant="destructive">Expired</Badge>
                  ) : (
                    <Badge variant="default">Active</Badge>
                  )}
                </TableCell>
                <TableCell className="text-xs">
                  {new Date(invitation.created_at).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedInvitation(invitation);
                        setShowDetailsDialog(true);
                      }}
                      title="View Details"
                    >
                      <Eye className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        copyToClipboard(
                          `${window.location.origin}/employee/register?token=${invitation.token}`,
                          "Link"
                        )
                      }
                      title="Copy Link"
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => generateQRCoupon(invitation)}
                      title="Generate QR Coupon"
                    >
                      <QrCode className="h-3 w-3" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>

    <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirm Deletion</AlertDialogTitle>
          <AlertDialogDescription>
            You are about to delete {selectedInvitations.size} invitation(s). This action cannot be undone.
            Please enter the administrator password to confirm.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="my-4">
          <Input
            type="password"
            placeholder="Enter administrator password"
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setAdminPassword("")}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <InvitationDetailsDialog
      open={showDetailsDialog}
      onOpenChange={setShowDetailsDialog}
      invitation={selectedInvitation}
    />
  </>
  );
};

export default InvitationsList;
