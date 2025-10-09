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
    physicalAddress: "",
    email: "",
    nextOfKinFirstName: "",
    nextOfKinLastName: "",
    nextOfKinAddress: "",
    nextOfKinContact: "",
  });

  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [idFile, setIdFile] = useState<File | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: "selfie" | "id") => {
    const file = e.target.files?.[0];
    if (file) {
      if (type === "selfie") {
        setSelfieFile(file);
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

    if (!selfieFile || !idFile) {
      toast({
        title: "Photos Required",
        description: "Please upload both selfie and ID photos.",
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

      // Verify geofence
      toast({
        title: "Verifying Location",
        description: "Checking if you are at the provided address...",
      });

      const { data: geofenceData, error: geofenceError } = await supabase.functions.invoke(
        "verify-geofence",
        {
          body: {
            address: formData.physicalAddress,
            latitude: location.lat,
            longitude: location.lng,
          },
        }
      );

      console.log("Geofence verification result:", geofenceData);

      // Upload photos
      const selfieUrl = await uploadFile(selfieFile, "employee-selfies", employeeData.id);
      const idUrl = await uploadFile(idFile, "employee-ids", employeeData.id);

      // Create a known submission ID to avoid SELECT on anon inserts
      const submissionId = crypto.randomUUID();
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
            physical_address: formData.physicalAddress,
            email: formData.email,
            employee_number: formData.employeeNumber,
            selfie_photo_url: selfieUrl,
            id_photo_url: idUrl,
            geolocation_lat: location.lat,
            geolocation_lng: location.lng,
            geofence_verified: geofenceData?.verified || false,
            geofence_distance_meters: geofenceData?.distance || null,
            flagged: !geofenceData?.verified,
            flag_reason: !geofenceData?.verified
              ? `Location verification failed. Distance from address: ${geofenceData?.distance || "unknown"}m (threshold: 100m)`
              : null,
          } as any,
          { returning: "minimal" } as any
        );

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

      // Send verification email
      await supabase.functions.invoke("send-verification-email", {
        body: {
          email: formData.email,
          name: `${formData.firstName} ${formData.lastName}`,
          employeeNumber: formData.employeeNumber,
        },
      });

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
          description: "Your verification has been submitted and location verified successfully.",
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
                <Label htmlFor="physicalAddress">Current Physical Address *</Label>
                <Textarea
                  id="physicalAddress"
                  value={formData.physicalAddress}
                  onChange={(e) => setFormData({ ...formData, physicalAddress: e.target.value })}
                  rows={3}
                  required
                />
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

          {/* Photo Uploads */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold border-b pb-2">Photo Verification</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="selfie">Selfie Photo *</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="selfie"
                    type="file"
                    accept="image/*"
                    capture="user"
                    onChange={(e) => handleFileChange(e, "selfie")}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => document.getElementById("selfie")?.click()}
                    className="w-full"
                  >
                    <Camera className="mr-2 h-4 w-4" />
                    {selfieFile ? "Change Selfie" : "Take Selfie"}
                  </Button>
                </div>
                {selfieFile && (
                  <p className="text-sm text-muted-foreground">✓ {selfieFile.name}</p>
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
