import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, MapPin, User, Phone, Calendar, FileText, Briefcase, Shield, Edit2, Save, X } from "lucide-react";
import { format } from "date-fns";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import POPIAViewDialog from "./POPIAViewDialog";
import { EmploymentDetailsDialog } from "./EmploymentDetailsDialog";
import RiskProfileDialog from "@/components/shared/RiskProfileDialog";

interface SubmissionDetailDialogProps {
  submission: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: () => void;
  readOnly?: boolean;
}

interface Store {
  id: string;
  store_name: string;
  store_code: string;
}

const SubmissionDetailDialog = ({ submission, open, onOpenChange, onUpdate, readOnly = false }: SubmissionDetailDialogProps) => {
  const [status, setStatus] = useState(submission?.status || "pending");
  const [nextOfKin, setNextOfKin] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [proofOfResidenceUrl, setProofOfResidenceUrl] = useState<string | null>(null);
  const [idUrl, setIdUrl] = useState<string | null>(null);
  const [popiaDialogOpen, setPopiaDialogOpen] = useState(false);
  const [employmentDetailsOpen, setEmploymentDetailsOpen] = useState(false);
  const [riskProfileOpen, setRiskProfileOpen] = useState(false);
  const [employeeDetails, setEmployeeDetails] = useState<any>(null);
  
  // Editable fields
  const [isEditingEmployeeNumber, setIsEditingEmployeeNumber] = useState(false);
  const [editableEmployeeNumber, setEditableEmployeeNumber] = useState("");
  const [employmentStatus, setEmploymentStatus] = useState("");
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [availableStores, setAvailableStores] = useState<Store[]>([]);
  const [savingEmployeeNumber, setSavingEmployeeNumber] = useState(false);

  // Location verification state
  const [popiaCoords, setPopiaCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [addressCoords, setAddressCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geocodingAddress, setGeocodingAddress] = useState(false);
  const [calculatedDistance, setCalculatedDistance] = useState<number | null>(null);

  useEffect(() => {
    if (submission && open) {
      const displayStatus = submission.status === "verified" ? "approved" : submission.status;
      setStatus(displayStatus);
      setEditableEmployeeNumber(submission.employee_number || "");
      fetchNextOfKin();
      fetchEmployeeDetails();
      fetchAvailableStores();
      generateSignedUrls();
      fetchPopiaCoords();
      geocodeAddress();
    } else {
      setProofOfResidenceUrl(null);
      setIdUrl(null);
      setIsEditingEmployeeNumber(false);
      setPopiaCoords(null);
      setAddressCoords(null);
      setCalculatedDistance(null);
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

  const fetchEmployeeDetails = async () => {
    if (!submission?.employee_id) return;
    
    const { data } = await supabase
      .from("employees")
      .select(`
        id,
        employee_number,
        designation,
        employment_status,
        store_id,
        dismissed_at,
        dismissal_reason,
        dismissal_document_url,
        store:stores(id, store_name, store_code)
      `)
      .eq("id", submission.employee_id)
      .single();
    
    setEmployeeDetails(data);
    setEmploymentStatus(data?.employment_status || "");
    setSelectedStoreId(data?.store_id || null);
  };

  const fetchAvailableStores = async () => {
    // Fetch stores from accounts that the admin has access to
    const { data: stores, error } = await supabase
      .from("stores")
      .select("id, store_name, store_code")
      .order("store_name");
    
    if (!error && stores) {
      setAvailableStores(stores);
    }
  };

  const generateSignedUrls = async () => {
    if (!submission) return;
    try {
      if (submission.proof_of_residence_url) {
        // The URL stored could be a full path or just the filename
        const path = submission.proof_of_residence_url;
        const { data, error } = await supabase.storage
          .from('proof-of-residence')
          .createSignedUrl(path, 3600);
        
        if (error) {
          console.error('Error creating proof of residence signed URL:', error);
        }
        setProofOfResidenceUrl(data?.signedUrl ?? null);
      } else {
        setProofOfResidenceUrl(null);
      }
      
      if (submission.id_photo_url) {
        const path = submission.id_photo_url;
        const { data, error } = await supabase.storage
          .from('employee-ids')
          .createSignedUrl(path, 3600);
        
        if (error) {
          console.error('Error creating ID photo signed URL:', error);
        }
        setIdUrl(data?.signedUrl ?? null);
      } else {
        setIdUrl(null);
      }
    } catch (e) {
      console.error('Error creating signed URLs:', e);
    }
  };

  const fetchPopiaCoords = async () => {
    if (!submission?.employee_id) return;
    
    const { data } = await supabase
      .from("popia_acceptances")
      .select("gps_latitude, gps_longitude")
      .eq("employee_id", submission.employee_id)
      .order("accepted_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (data?.gps_latitude && data?.gps_longitude) {
      setPopiaCoords({ lat: data.gps_latitude, lng: data.gps_longitude });
    }
  };

  const geocodeAddress = async () => {
    if (!submission) return;
    
    // Construct a clean address from individual fields, filtering out null/N/A/empty values
    const addressParts = [
      submission.house_number,
      submission.street_name,
      submission.complex_name,
      submission.suburb,
      submission.city,
      submission.province,
      submission.postal_code
    ].filter(part => part && part.trim() !== '' && part.trim().toUpperCase() !== 'N/A');

    const cleanAddress = addressParts.join(', ');
    
    if (!cleanAddress) return;
    
    console.log('Geocoding clean address:', cleanAddress);
    
    setGeocodingAddress(true);
    try {
      const response = await supabase.functions.invoke('verify-geofence', {
        body: { address: cleanAddress }
      });
      
      console.log('Geocode response:', response.data);
      
      // The function returns addressCoordinates object
      if (response.data?.addressCoordinates?.lat && response.data?.addressCoordinates?.lng) {
        setAddressCoords({ 
          lat: response.data.addressCoordinates.lat, 
          lng: response.data.addressCoordinates.lng 
        });
      }
    } catch (error) {
      console.error('Error geocoding address:', error);
    } finally {
      setGeocodingAddress(false);
    }
  };

  // Calculate distance between two coordinates using Haversine formula
  const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const R = 6371000; // Earth's radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  useEffect(() => {
    if (popiaCoords && addressCoords) {
      const distance = calculateDistance(
        popiaCoords.lat, popiaCoords.lng,
        addressCoords.lat, addressCoords.lng
      );
      setCalculatedDistance(distance);
    }
  }, [popiaCoords, addressCoords]);

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
      onOpenChange(false);
    } catch (error) {
      console.error("Error updating status:", error);
      toast.error("Failed to update status");
    } finally {
      setLoading(false);
    }
  };

  const handleEmploymentStatusChange = async (newStatus: string) => {
    if (!submission?.employee_id) return;
    
    try {
      const updateData: any = { employment_status: newStatus };
      
      // If changing to dismissed or retrenched, set dismissed_at
      if (newStatus === 'dismissed' || newStatus === 'retrenched' || newStatus === 'absconded') {
        updateData.dismissed_at = new Date().toISOString();
      } else {
        updateData.dismissed_at = null;
        updateData.dismissal_reason = null;
      }
      
      const { error } = await supabase
        .from("employees")
        .update(updateData)
        .eq("id", submission.employee_id);

      if (error) throw error;

      setEmploymentStatus(newStatus);
      toast.success("Employment status updated");
      onUpdate();
      fetchEmployeeDetails();
    } catch (error) {
      console.error("Error updating employment status:", error);
      toast.error("Failed to update employment status");
    }
  };

  const handleStoreChange = async (storeId: string) => {
    if (!submission?.employee_id) return;
    
    try {
      const { error } = await supabase
        .from("employees")
        .update({ store_id: storeId === "none" ? null : storeId })
        .eq("id", submission.employee_id);

      if (error) throw error;

      setSelectedStoreId(storeId === "none" ? null : storeId);
      toast.success("Store assignment updated");
      onUpdate();
      fetchEmployeeDetails();
    } catch (error) {
      console.error("Error updating store:", error);
      toast.error("Failed to update store assignment");
    }
  };

  const handleSaveEmployeeNumber = async () => {
    if (!submission?.employee_id || !editableEmployeeNumber.trim()) return;
    
    setSavingEmployeeNumber(true);
    try {
      // Update employee table
      const { error: empError } = await supabase
        .from("employees")
        .update({ employee_number: editableEmployeeNumber.trim() })
        .eq("id", submission.employee_id);

      if (empError) throw empError;

      // Update submission table
      const { error: subError } = await supabase
        .from("submissions")
        .update({ employee_number: editableEmployeeNumber.trim() })
        .eq("id", submission.id);

      if (subError) throw subError;

      setIsEditingEmployeeNumber(false);
      toast.success("Employee number updated");
      onUpdate();
    } catch (error) {
      console.error("Error updating employee number:", error);
      toast.error("Failed to update employee number");
    } finally {
      setSavingEmployeeNumber(false);
    }
  };

  if (!submission) return null;

  const candidateName = `${submission.first_name} ${submission.last_name}`;

  const cleanAddress = (value?: string | null) => {
    if (!value) return "";
    return value
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p.length > 0)
      .filter((p) => !/^n\/?a$/i.test(p) && p.toLowerCase() !== "na")
      .join(", ");
  };

  const cleanedPhysicalAddress = cleanAddress(submission.physical_address);
  const cleanedNextOfKinAddress = cleanAddress(nextOfKin?.address);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Employee Profile</span>
            <Badge variant={submission.flagged ? "destructive" : "default"}>
              {submission.flagged ? "Flagged" : status}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Status Update and Action Buttons */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            {!readOnly && (
              <div className="flex items-center gap-4">
                <label className="text-sm font-medium">Update Status:</label>
                <Select value={status} onValueChange={handleStatusUpdate} disabled={loading}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                    <SelectItem value="flagged">Flagged</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex gap-2 ml-auto flex-wrap">
              <Button 
                variant="outline" 
                onClick={() => setRiskProfileOpen(true)}
              >
                <Shield className="h-4 w-4 mr-2" />
                Risk Profile
              </Button>
              <Button 
                variant="outline" 
                onClick={() => setPopiaDialogOpen(true)}
              >
                <FileText className="h-4 w-4 mr-2" />
                View POPIA Declaration
              </Button>
              {employeeDetails && (
                <Button 
                  variant="outline" 
                  onClick={() => setEmploymentDetailsOpen(true)}
                >
                  <Briefcase className="h-4 w-4 mr-2" />
                  Employment Details
                </Button>
              )}
            </div>
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
                <div className="flex items-center gap-2">
                  {isEditingEmployeeNumber ? (
                    <>
                      <Input
                        value={editableEmployeeNumber}
                        onChange={(e) => setEditableEmployeeNumber(e.target.value)}
                        className="h-8 w-32"
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={handleSaveEmployeeNumber}
                        disabled={savingEmployeeNumber}
                      >
                        <Save className="h-4 w-4 text-green-600" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => {
                          setIsEditingEmployeeNumber(false);
                          setEditableEmployeeNumber(submission.employee_number || "");
                        }}
                      >
                        <X className="h-4 w-4 text-destructive" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <p className="font-medium">{submission.employee_number}</p>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={() => setIsEditingEmployeeNumber(true)}
                      >
                        <Edit2 className="h-3 w-3" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">ID Number:</span>
                <p className="font-medium">{submission.id_number}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Email:</span>
                <p className="font-medium">{submission.email}</p>
              </div>
              {submission.contact_number && (
                <div>
                  <span className="text-muted-foreground">Contact:</span>
                  <p className="font-medium">{submission.contact_number}</p>
                </div>
              )}
              {employeeDetails?.designation && (
                <div>
                  <span className="text-muted-foreground">Designation:</span>
                  <p className="font-medium capitalize">
                    {employeeDetails.designation.replace(/_/g, ' ')}
                  </p>
                </div>
              )}
              
              {/* Editable Employment Status */}
              <div>
                <Label className="text-muted-foreground">Employment Status:</Label>
                <Select value={employmentStatus} onValueChange={handleEmploymentStatusChange}>
                  <SelectTrigger className="w-full mt-1">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="employed">Employed</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="dismissed">Dismissed</SelectItem>
                    <SelectItem value="retrenched">Retrenched</SelectItem>
                    <SelectItem value="absconded">Absconded</SelectItem>
                    <SelectItem value="resigned">Resigned</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {/* Editable Primary Store */}
              <div>
                <Label className="text-muted-foreground">Primary Store:</Label>
                <Select value={selectedStoreId || "none"} onValueChange={handleStoreChange}>
                  <SelectTrigger className="w-full mt-1">
                    <SelectValue placeholder="Select store" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Store</SelectItem>
                    {availableStores.map((store) => (
                      <SelectItem key={store.id} value={store.id}>
                        {store.store_name} ({store.store_code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {employeeDetails?.dismissed_at && (
                <div className="col-span-2 border-t pt-3">
                  <span className="text-muted-foreground">Date of Dismissal/Retrenchment:</span>
                  <p className="font-medium">{format(new Date(employeeDetails.dismissed_at), 'PPP')}</p>
                  {employeeDetails.dismissal_reason && (
                    <div className="mt-2">
                      <span className="text-muted-foreground">Reason:</span>
                      <p className="font-medium">{employeeDetails.dismissal_reason}</p>
                    </div>
                  )}
                  {employeeDetails.dismissal_document_url && (
                    <div className="mt-2">
                      <a 
                        href={employeeDetails.dismissal_document_url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-primary underline"
                      >
                        View Supporting Document
                      </a>
                    </div>
                  )}
                </div>
              )}
              {cleanedPhysicalAddress && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">Physical Address:</span>
                  <p className="font-medium">{cleanedPhysicalAddress}</p>
                </div>
              )}
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
                {nextOfKin.relationship && (
                  <div>
                    <span className="text-muted-foreground">Relationship:</span>
                    <p className="font-medium capitalize">{nextOfKin.relationship.replace('_', '/')}</p>
                  </div>
                )}
                {nextOfKin.contact_number && (
                  <div>
                    <span className="text-muted-foreground">Contact:</span>
                    <p className="font-medium">{nextOfKin.contact_number}</p>
                  </div>
                )}
                {cleanedNextOfKinAddress && (
                  <div>
                    <span className="text-muted-foreground">Address:</span>
                    <p className="font-medium">{cleanedNextOfKinAddress}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Location Verification */}
          <div className="border rounded-lg p-4 space-y-4">
            <h3 className="font-semibold flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Location Verification
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              {/* Submission Location (POPIA) */}
              <div className="space-y-2 p-3 bg-muted/50 rounded-lg">
                <span className="text-muted-foreground font-medium">Submission Location</span>
                <p className="text-xs text-muted-foreground">Where the employee was when completing their submission</p>
                {popiaCoords ? (
                  <>
                    <p className="font-medium">
                      {popiaCoords.lat.toFixed(6)}, {popiaCoords.lng.toFixed(6)}
                    </p>
                    <a 
                      href={`https://www.google.com/maps?q=${popiaCoords.lat},${popiaCoords.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary text-xs underline inline-flex items-center gap-1"
                    >
                      View on Google Maps
                    </a>
                  </>
                ) : submission.geolocation_lat && submission.geolocation_lng ? (
                  <>
                    <p className="font-medium">
                      {submission.geolocation_lat}, {submission.geolocation_lng}
                    </p>
                    <a 
                      href={`https://www.google.com/maps?q=${submission.geolocation_lat},${submission.geolocation_lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary text-xs underline inline-flex items-center gap-1"
                    >
                      View on Google Maps
                    </a>
                  </>
                ) : (
                  <p className="text-muted-foreground italic">Location not captured</p>
                )}
              </div>

              {/* Address Coordinates */}
              <div className="space-y-2 p-3 bg-muted/50 rounded-lg">
                <span className="text-muted-foreground font-medium">Provided Address Location</span>
                <p className="text-xs text-muted-foreground">Geocoded coordinates of the supplied address</p>
                {geocodingAddress ? (
                  <p className="text-muted-foreground italic">Geocoding address...</p>
                ) : addressCoords ? (
                  <>
                    <p className="font-medium">
                      {addressCoords.lat.toFixed(6)}, {addressCoords.lng.toFixed(6)}
                    </p>
                    <a 
                      href={`https://www.google.com/maps?q=${addressCoords.lat},${addressCoords.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary text-xs underline inline-flex items-center gap-1"
                    >
                      View on Google Maps
                    </a>
                  </>
                ) : (
                  <p className="text-muted-foreground italic">Could not geocode address</p>
                )}
              </div>
            </div>

            {/* Distance Calculation */}
            {calculatedDistance !== null && popiaCoords && addressCoords && (
              <div className="p-3 border rounded-lg bg-background">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-muted-foreground font-medium">Distance Between Locations</span>
                    <p className="text-xs text-muted-foreground">Straight-line distance from submission location to provided address</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-lg font-bold ${calculatedDistance > 500 ? 'text-destructive' : calculatedDistance > 200 ? 'text-orange-500' : 'text-green-600'}`}>
                      {calculatedDistance >= 1000 
                        ? `${(calculatedDistance / 1000).toFixed(2)} km`
                        : `${Math.round(calculatedDistance)} m`}
                    </p>
                    {calculatedDistance > 500 && (
                      <p className="text-xs text-destructive">Significant distance detected</p>
                    )}
                  </div>
                </div>
                <a 
                  href={`https://www.google.com/maps/dir/${popiaCoords.lat},${popiaCoords.lng}/${addressCoords.lat},${addressCoords.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary text-xs underline inline-flex items-center gap-1 mt-2"
                >
                  View route on Google Maps
                </a>
              </div>
            )}

            {submission.flag_reason && (
              <div className="bg-destructive/10 p-3 rounded">
                <span className="text-muted-foreground">Flag Reason:</span>
                <p className="text-destructive font-medium">{submission.flag_reason}</p>
              </div>
            )}
          </div>

          {/* Documents */}
          <div className="border rounded-lg p-4 space-y-3">
            <h3 className="font-semibold">Uploaded Documents</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground mb-2">Proof of Residence</p>
                <p className="text-xs text-muted-foreground mb-2">
                  Should show name, ID number, and physical address
                </p>
                {proofOfResidenceUrl ? (
                  <img 
                    src={proofOfResidenceUrl} 
                    alt="Proof of residence document" 
                    className="w-full h-48 object-cover rounded border cursor-pointer hover:opacity-80"
                    loading="lazy"
                    onClick={() => window.open(proofOfResidenceUrl, '_blank')}
                  />
                ) : (
                  <div className="w-full h-48 flex items-center justify-center rounded border bg-muted">
                    <p className="text-muted-foreground text-sm">No document uploaded</p>
                  </div>
                )}
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-2">ID Photo</p>
                <p className="text-xs text-muted-foreground mb-2">
                  For verification of name, surname, and ID number
                </p>
                {idUrl ? (
                  <img 
                    src={idUrl} 
                    alt="Government ID document photo" 
                    className="w-full h-48 object-cover rounded border cursor-pointer hover:opacity-80"
                    loading="lazy"
                    onClick={() => window.open(idUrl, '_blank')}
                  />
                ) : (
                  <div className="w-full h-48 flex items-center justify-center rounded border bg-muted">
                    <p className="text-muted-foreground text-sm">No document uploaded</p>
                  </div>
                )}
              </div>
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

        {/* POPIA View Dialog */}
        <POPIAViewDialog 
          employeeId={submission.employee_id}
          open={popiaDialogOpen}
          onOpenChange={setPopiaDialogOpen}
        />

        {/* Employment Details Dialog */}
        <EmploymentDetailsDialog
          open={employmentDetailsOpen}
          onOpenChange={setEmploymentDetailsOpen}
          employeeId={submission.employee_id}
          employeeDetails={employeeDetails}
        />

        {/* Risk Profile Dialog */}
        <RiskProfileDialog
          open={riskProfileOpen}
          onOpenChange={setRiskProfileOpen}
          employeeId={submission.employee_id}
          candidateName={candidateName}
        />
      </DialogContent>
    </Dialog>
  );
};

export default SubmissionDetailDialog;