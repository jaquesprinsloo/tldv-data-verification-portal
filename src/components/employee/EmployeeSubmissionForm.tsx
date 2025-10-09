import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Camera, MapPin, Upload, CheckCircle } from "lucide-react";

const EmployeeSubmissionForm = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const [formData, setFormData] = useState({
    employeeNumber: "",
    firstName: "",
    lastName: "",
    idNumber: "",
    email: "",
    contactNumber: "",
    houseNumber: "",
    floorNumber: "",
    streetName: "",
    complexName: "",
    suburb: "",
    city: "",
    province: "",
    postalCode: "",
    nextOfKinFirstName: "",
    nextOfKinLastName: "",
    nextOfKinAddress: "",
    nextOfKinContact: "",
  });

  const [proofOfResidenceFile, setProofOfResidenceFile] = useState<File | null>(null);
  const [idFile, setIdFile] = useState<File | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: "proof" | "id") => {
    const file = e.target.files?.[0];
    if (file) {
      if (type === "proof") {
        setProofOfResidenceFile(file);
      } else {
        setIdFile(file);
      }
    }
  };

  const captureLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
          toast({
            title: "Location Captured",
            description: "Your current location has been recorded.",
          });
        },
        (error) => {
          toast({
            title: "Location Error",
            description: "Unable to capture your location. Please enable location services.",
            variant: "destructive",
          });
        }
      );
    } else {
      toast({
        title: "Not Supported",
        description: "Geolocation is not supported by your browser.",
        variant: "destructive",
      });
    }
  };

  const uploadFile = async (file: File, bucket: string, userId: string) => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${userId}/${Date.now()}.${fileExt}`;
    
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(fileName, file);

    if (error) throw error;
    return fileName;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.employeeNumber) {
      toast({
        title: "Employee Number Required",
        description: "Please enter your employee number",
        variant: "destructive",
      });
      return;
    }

    if (!location) {
      toast({
        title: "Location Required",
        description: "Please capture your current location before submitting.",
        variant: "destructive",
      });
      return;
    }

    if (!proofOfResidenceFile || !idFile) {
      toast({
        title: "Documents Required",
        description: "Please upload both proof of residence and ID photo.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      // Verify employee number exists
      const { data: employeeData, error: employeeError } = await supabase
        .from("employees")
        .select("id, employee_number, id_number")
        .eq("employee_number", formData.employeeNumber)
        .maybeSingle();

      if (employeeError) throw employeeError;

      if (!employeeData) {
        toast({
          title: "Invalid Employee Number",
          description: "Employee number not found in the system. Please contact your administrator.",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      // Build full address from components
      const physicalAddress = [
        formData.houseNumber,
        formData.floorNumber,
        formData.streetName,
        formData.complexName,
        formData.suburb,
        formData.city,
        formData.province,
        formData.postalCode
      ].filter(Boolean).join(", ");

      // Verify geofence
      toast({
        title: "Verifying Location",
        description: "Checking if you are at the provided address...",
      });

      const { data: geofenceData, error: geofenceError } = await supabase.functions.invoke(
        "verify-geofence",
        {
          body: {
            address: physicalAddress,
            latitude: location.lat,
            longitude: location.lng,
          },
        }
      );

      console.log("Geofence verification result:", geofenceData);

      // Upload documents
      const proofUrl = await uploadFile(proofOfResidenceFile, "proof-of-residence", employeeData.id);
      const idUrl = await uploadFile(idFile, "employee-ids", employeeData.id);

      // Create a known submission ID to avoid SELECT on anon inserts
      const submissionId = crypto.randomUUID();
      
      // Determine status based on geofence
      const isGeofenceFlagged = geofenceData?.flagged || false;
      const submissionStatus = isGeofenceFlagged ? 'flagged' : 'pending';
      
      // Create submission with geofence data
      const { error: submissionError } = await supabase
        .from("submissions")
        .insert(
          {
            id: submissionId,
            employee_id: employeeData.id,
            first_name: formData.firstName,
            last_name: formData.lastName,
            id_number: formData.idNumber,
            physical_address: physicalAddress,
            house_number: formData.houseNumber || 'N/A',
            floor_number: formData.floorNumber || 'N/A',
            street_name: formData.streetName || 'N/A',
            complex_name: formData.complexName || 'N/A',
            suburb: formData.suburb || 'N/A',
            city: formData.city || 'N/A',
            province: formData.province || 'N/A',
            postal_code: formData.postalCode || 'N/A',
            email: formData.email,
            contact_number: formData.contactNumber,
            employee_number: formData.employeeNumber,
            proof_of_residence_url: proofUrl,
            id_photo_url: idUrl,
            geolocation_lat: location.lat,
            geolocation_lng: location.lng,
            geofence_verified: geofenceData?.verified || false,
            geofence_distance_meters: geofenceData?.distance || null,
            flagged: isGeofenceFlagged,
            flag_reason: isGeofenceFlagged
              ? `Location verification failed. Distance from address: ${geofenceData?.distance || "unknown"}m (threshold: 15m)`
              : null,
            status: submissionStatus,
            email_verified: false,
            whatsapp_verified: false
          } as any,
          { returning: "minimal" } as any
        );

      if (submissionError) throw submissionError;

      // Add next of kin
      const { error: nokError } = await supabase
        .from("next_of_kin")
        .insert({
          submission_id: submissionId,
          first_name: formData.nextOfKinFirstName,
          last_name: formData.nextOfKinLastName,
          address: formData.nextOfKinAddress,
          contact_number: formData.nextOfKinContact,
        });

      if (nokError) throw nokError;

      // Send WhatsApp verification (fire and forget)
      if (formData.contactNumber) {
        supabase.functions.invoke('send-whatsapp-verification', {
          body: { 
            submissionId: submissionId,
            contactNumber: formData.contactNumber
          }
        }).catch(err => console.error("WhatsApp verification error:", err));
      }

      // Trigger AI document verification (fire and forget)
      if (proofUrl) {
        supabase.functions.invoke('verify-document', {
          body: { 
            submissionId: submissionId,
            documentUrl: proofUrl,
            physicalAddress: physicalAddress
          }
        }).catch(err => console.error("Document verification error:", err));
      }

      // Trigger AI ID verification (fire and forget)
      if (idUrl) {
        supabase.functions.invoke('verify-id-photo', {
          body: { 
            submissionId: submissionId,
            idPhotoUrl: idUrl,
            firstName: formData.firstName,
            lastName: formData.lastName,
            idNumber: formData.idNumber
          }
        }).catch(err => console.error("ID verification error:", err));
      }

      // Send verification email (fire and forget)
      supabase.functions.invoke("send-verification-email", {
        body: {
          email: formData.email,
          name: `${formData.firstName} ${formData.lastName}`,
          employeeNumber: formData.employeeNumber,
        },
      }).catch(err => console.error("Email verification error:", err));

      setSubmitted(true);

      if (!geofenceData?.verified) {
        toast({
          title: "Submission Received - Location Flagged",
          description: `Your submission was recorded but flagged because you appear to be ${geofenceData?.distance}m from the provided address.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Submission Successful",
          description: "Your verification has been submitted. Check your WhatsApp for a verification link.",
        });
      }
    } catch (error: any) {
      console.error("Submission error:", error);
      toast({
        title: "Submission Failed",
        description: error.message || "There was an error submitting your verification.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <Card className="max-w-md mx-auto text-center">
        <CardContent className="pt-12 pb-12">
          <CheckCircle className="h-16 w-16 text-primary mx-auto mb-6" />
          <h2 className="text-2xl font-bold mb-4">Submission Complete!</h2>
          <p className="text-muted-foreground mb-6">
            Your verification has been submitted successfully. You will receive a confirmation email shortly.
          </p>
          <p className="text-sm text-muted-foreground">
            Please remember to resubmit your verification in 6 months.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle className="text-2xl">Employee Verification Form</CardTitle>
        <CardDescription>
          Please complete all fields accurately. This information will be used for verification purposes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Personal Information */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold border-b pb-2">Personal Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="employeeNumber">Employee Number *</Label>
                <Input
                  id="employeeNumber"
                  value={formData.employeeNumber}
                  onChange={(e) => setFormData({ ...formData, employeeNumber: e.target.value })}
                  required
                  placeholder="Enter your employee number"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="idNumber">ID Number *</Label>
                <Input
                  id="idNumber"
                  value={formData.idNumber}
                  onChange={(e) => setFormData({ ...formData, idNumber: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name *</Label>
                <Input
                  id="firstName"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name *</Label>
                <Input
                  id="lastName"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="email">Email Address *</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="contactNumber">Contact Number (WhatsApp) *</Label>
                <Input
                  id="contactNumber"
                  type="tel"
                  placeholder="e.g., +27821234567"
                  value={formData.contactNumber}
                  onChange={(e) => setFormData({ ...formData, contactNumber: e.target.value })}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Include country code (e.g., +27 for South Africa). You'll receive a verification link via WhatsApp.
                </p>
              </div>
              <div className="md:col-span-2 space-y-4">
                <h4 className="text-sm font-semibold">Current Physical Address *</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="houseNumber">House Number</Label>
                    <Input
                      id="houseNumber"
                      value={formData.houseNumber}
                      onChange={(e) => setFormData({ ...formData, houseNumber: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="floorNumber">Floor Number</Label>
                    <Input
                      id="floorNumber"
                      value={formData.floorNumber}
                      onChange={(e) => setFormData({ ...formData, floorNumber: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="streetName">Street Name *</Label>
                    <Input
                      id="streetName"
                      value={formData.streetName}
                      onChange={(e) => setFormData({ ...formData, streetName: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="complexName">Complex Name</Label>
                    <Input
                      id="complexName"
                      value={formData.complexName}
                      onChange={(e) => setFormData({ ...formData, complexName: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="suburb">Suburb *</Label>
                    <Input
                      id="suburb"
                      value={formData.suburb}
                      onChange={(e) => setFormData({ ...formData, suburb: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="city">City *</Label>
                    <Input
                      id="city"
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="province">Province *</Label>
                    <Input
                      id="province"
                      value={formData.province}
                      onChange={(e) => setFormData({ ...formData, province: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="postalCode">Postal Code *</Label>
                    <Input
                      id="postalCode"
                      value={formData.postalCode}
                      onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
                      required
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Next of Kin */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold border-b pb-2">Next of Kin</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="nokFirstName">First Name *</Label>
                <Input
                  id="nokFirstName"
                  value={formData.nextOfKinFirstName}
                  onChange={(e) => setFormData({ ...formData, nextOfKinFirstName: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nokLastName">Last Name *</Label>
                <Input
                  id="nokLastName"
                  value={formData.nextOfKinLastName}
                  onChange={(e) => setFormData({ ...formData, nextOfKinLastName: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nokContact">Contact Number *</Label>
                <Input
                  id="nokContact"
                  value={formData.nextOfKinContact}
                  onChange={(e) => setFormData({ ...formData, nextOfKinContact: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="nokAddress">Address *</Label>
                <Textarea
                  id="nokAddress"
                  value={formData.nextOfKinAddress}
                  onChange={(e) => setFormData({ ...formData, nextOfKinAddress: e.target.value })}
                  rows={2}
                  required
                />
              </div>
            </div>
          </div>

          {/* Document Uploads */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold border-b pb-2">Document Verification</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="proofOfResidence">Proof of Residence *</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Upload one of the following (not older than 3 months):
                  <br />• Valid rental contract
                  <br />• Municipal bill
                  <br />• SAPS stamped address letter
                  <br />Must show your name, ID number, and physical address
                </p>
                <div className="flex items-center gap-2">
                  <Input
                    id="proofOfResidence"
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={(e) => handleFileChange(e, "proof")}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => document.getElementById("proofOfResidence")?.click()}
                    className="w-full"
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    {proofOfResidenceFile ? "Change Document" : "Upload Document"}
                  </Button>
                </div>
                {proofOfResidenceFile && (
                  <p className="text-sm text-muted-foreground">✓ {proofOfResidenceFile.name}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="idPhoto">ID Photo *</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="idPhoto"
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => handleFileChange(e, "id")}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => document.getElementById("idPhoto")?.click()}
                    className="w-full"
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    {idFile ? "Change ID Photo" : "Upload ID Photo"}
                  </Button>
                </div>
                {idFile && (
                  <p className="text-sm text-muted-foreground">✓ {idFile.name}</p>
                )}
              </div>
            </div>
          </div>

          {/* Location Capture */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold border-b pb-2">Location Verification</h3>
            <Button
              type="button"
              onClick={captureLocation}
              variant={location ? "secondary" : "default"}
              className="w-full"
            >
              <MapPin className="mr-2 h-4 w-4" />
              {location ? "Location Captured ✓" : "Capture Current Location"}
            </Button>
            {location && (
              <p className="text-sm text-muted-foreground text-center">
                Location: {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
              </p>
            )}
          </div>

          <Button type="submit" className="w-full" size="lg" disabled={loading}>
            {loading ? "Submitting..." : "Submit Verification"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default EmployeeSubmissionForm;
