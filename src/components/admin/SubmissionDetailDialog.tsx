import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle, AlertTriangle, MapPin, User, Phone, Home, Calendar } from "lucide-react";
import { format } from "date-fns";
import { useState, useEffect } from "react";
import { toast } from "sonner";

interface SubmissionDetailDialogProps {
  submission: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: () => void;
}

const SubmissionDetailDialog = ({ submission, open, onOpenChange, onUpdate }: SubmissionDetailDialogProps) => {
  const [status, setStatus] = useState(submission?.status || "pending");
  const [nextOfKin, setNextOfKin] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [proofOfResidenceUrl, setProofOfResidenceUrl] = useState<string | null>(null);
  const [idUrl, setIdUrl] = useState<string | null>(null);

  useEffect(() => {
    if (submission && open) {
      // Map database status to UI status (verified -> approved for display)
      const displayStatus = submission.status === "verified" ? "approved" : submission.status;
      setStatus(displayStatus);
      fetchNextOfKin();
      generateSignedUrls();
    } else {
      setProofOfResidenceUrl(null);
      setIdUrl(null);
    }
  }, [submission, open]);

  const fetchNextOfKin = async () => {
    if (!submission) return;
    
    const { data } = await supabase
      .from("next_of_kin")
      .select("*")
      .eq("submission_id", submission.id)
      .single();
    
    setNextOfKin(data);
  };

  const generateSignedUrls = async () => {
    if (!submission) return;
    try {
      if (submission.proof_of_residence_url) {
        const { data } = await supabase.storage
          .from('proof-of-residence')
          .createSignedUrl(submission.proof_of_residence_url, 3600);
        setProofOfResidenceUrl(data?.signedUrl ?? null);
      } else {
        setProofOfResidenceUrl(null);
      }
      if (submission.id_photo_url) {
        const { data } = await supabase.storage
          .from('employee-ids')
          .createSignedUrl(submission.id_photo_url, 3600);
        setIdUrl(data?.signedUrl ?? null);
      } else {
        setIdUrl(null);
      }
    } catch (e) {
      console.error('Error creating signed URLs:', e);
    }
  };

  const handleStatusUpdate = async (newStatus: string) => {
    setLoading(true);
    try {
      // Map "approved" to "verified" in the database
      const dbStatus = newStatus === "approved" ? "verified" : newStatus;
      
      const { error } = await supabase
        .from("submissions")
        .update({ 
          status: dbStatus as any,
          verified_at: dbStatus === "verified" ? new Date().toISOString() : null,
          flagged: dbStatus === "flagged"
        })
        .eq("id", submission.id);

      if (error) throw error;

      setStatus(newStatus);
      toast.success("Status updated successfully");
      onUpdate();
    } catch (error) {
      console.error("Error updating status:", error);
      toast.error("Failed to update status");
    } finally {
      setLoading(false);
    }
  };

  if (!submission) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Submission Details</span>
            <Badge variant={submission.flagged ? "destructive" : "default"}>
              {submission.flagged ? "Flagged" : status}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Status Update */}
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium">Update Status:</label>
            <Select value={status} onValueChange={handleStatusUpdate} disabled={loading}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="flagged">Flagged</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Employee Information */}
          <div className="border rounded-lg p-4 space-y-3">
            <h3 className="font-semibold flex items-center gap-2">
              <User className="h-4 w-4" />
              Employee Information
            </h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Name:</span>
                <p className="font-medium">{submission.first_name} {submission.last_name}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Employee #:</span>
                <p className="font-medium">{submission.employee_number}</p>
              </div>
              <div>
                <span className="text-muted-foreground">ID Number:</span>
                <p className="font-medium">{submission.id_number}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Email:</span>
                <p className="font-medium">{submission.email}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Contact:</span>
                <p className="font-medium">{submission.contact_number || 'N/A'}</p>
              </div>
              <div className="col-span-2">
                <span className="text-muted-foreground">Physical Address:</span>
                <p className="font-medium">{submission.physical_address}</p>
              </div>
              <div className="col-span-2">
                <div className="flex items-center gap-2">
                  {submission.email_verified ? (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                  )}
                  <span className="text-sm">
                    Email {submission.email_verified ? 'Verified' : 'Not Verified'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Next of Kin */}
          {nextOfKin && (
            <div className="border rounded-lg p-4 space-y-3">
              <h3 className="font-semibold flex items-center gap-2">
                <Phone className="h-4 w-4" />
                Next of Kin
              </h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Name:</span>
                  <p className="font-medium">{nextOfKin.first_name} {nextOfKin.last_name}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Contact:</span>
                  <p className="font-medium">{nextOfKin.contact_number}</p>
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">Address:</span>
                  <p className="font-medium">{nextOfKin.address}</p>
                </div>
              </div>
            </div>
          )}

          {/* Location & Geofence */}
          <div className="border rounded-lg p-4 space-y-3">
            <h3 className="font-semibold flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Location & Geofence Verification
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                {submission.geofence_verified ? (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-primary" />
                )}
                <span className="font-medium">
                  {submission.geofence_verified ? "Verified" : "Not Verified"}
                </span>
              </div>
              {submission.geolocation_lat && submission.geolocation_lng && (
                <div>
                  <span className="text-muted-foreground">Coordinates:</span>
                  <p className="font-medium">
                    {submission.geolocation_lat}, {submission.geolocation_lng}
                  </p>
                </div>
              )}
              {submission.geofence_distance_meters && (
                <div>
                  <span className="text-muted-foreground">Distance from address:</span>
                  <p className="font-medium">{submission.geofence_distance_meters}m</p>
                </div>
              )}
              {submission.flag_reason && (
                <div className="bg-destructive/10 p-2 rounded">
                  <span className="text-muted-foreground">Flag Reason:</span>
                  <p className="text-destructive font-medium">{submission.flag_reason}</p>
                </div>
              )}
            </div>
          </div>

          {/* Documents */}
          <div className="border rounded-lg p-4 space-y-3">
            <h3 className="font-semibold">Uploaded Documents</h3>
            <div className="grid grid-cols-2 gap-4">
              {proofOfResidenceUrl && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Proof of Residence</p>
                  <p className="text-xs text-muted-foreground mb-2">
                    Should show name, ID number, and physical address
                  </p>
                  <img 
                    src={proofOfResidenceUrl} 
                    alt="Proof of residence document" 
                    className="w-full h-48 object-cover rounded border cursor-pointer hover:opacity-80"
                    loading="lazy"
                    onClick={() => window.open(proofOfResidenceUrl, '_blank')}
                  />
                </div>
              )}
              {idUrl && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">ID Photo</p>
                  <p className="text-xs text-muted-foreground mb-2">
                    For verification of name, surname, and ID number
                  </p>
                  <img 
                    src={idUrl} 
                    alt="Government ID document photo" 
                    className="w-full h-48 object-cover rounded border cursor-pointer hover:opacity-80"
                    loading="lazy"
                    onClick={() => window.open(idUrl, '_blank')}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Submission Metadata */}
          <div className="border rounded-lg p-4 space-y-2 text-sm">
            <h3 className="font-semibold flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Submission Metadata
            </h3>
            <div>
              <span className="text-muted-foreground">Submitted:</span>
              <p className="font-medium">{format(new Date(submission.submission_timestamp), "PPpp")}</p>
            </div>
            {submission.verified_at && (
              <div>
                <span className="text-muted-foreground">Verified:</span>
                <p className="font-medium">{format(new Date(submission.verified_at), "PPpp")}</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SubmissionDetailDialog;
