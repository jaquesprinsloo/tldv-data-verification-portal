import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Camera, MapPin, Upload, CheckCircle } from "lucide-react";
import { employeeSubmissionSchema } from "@/lib/validationSchemas";
import TLDVHeader from "@/components/employee/TLDVHeader";

const EmployeeSubmissionForm = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [employeeId, setEmployeeId] = useState("");

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

  // Load employee data from authenticated session and polygraph report if available
  useEffect(() => {
    const loadEmployeeData = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: employee } = await supabase
        .from('employees')
        .select('id, employee_number, id_number, email')
        .eq('user_id', session.user.id)
        .single();

      if (employee) {
        setEmployeeId(employee.id);
        
        // Check if this employee came from a polygraph candidate approval
        const { data: candidate } = await supabase
          .from('polygraph_candidates')
          .select(`
            report_id,
            first_name,
            last_name,
            email,
            contact_number,
            physical_address,
            polygraph_reports (
              first_name,
              last_name,
              id_number,
              email,
              contact_number,
              physical_address
            )
          `)
          .eq('employee_id', employee.id)
          .eq('status', 'approved')
          .maybeSingle();

        // Get report data from the candidate's linked report
        const reportData = candidate?.polygraph_reports as any;
        
        // Parse address components from physical_address if available
        const physicalAddress = reportData?.physical_address || candidate?.physical_address || '';
        const addressParts = parsePhysicalAddress(physicalAddress);

        setFormData(prev => ({
          ...prev,
          employeeNumber: employee.employee_number,
          idNumber: employee.id_number,
          // Pre-fill from polygraph report data if available
          firstName: reportData?.first_name || candidate?.first_name || '',
          lastName: reportData?.last_name || candidate?.last_name || '',
          email: reportData?.email || candidate?.email || employee.email || '',
          contactNumber: reportData?.contact_number || candidate?.contact_number || '',
          // Address fields from parsed address
          ...addressParts,
        }));
      }
    };

    loadEmployeeData();
  }, []);

  // Helper function to parse physical address into components
  const parsePhysicalAddress = (address: string): Partial<typeof formData> => {
    if (!address) return {};
    
    // Try to extract common address components
    // This is a basic parser - the address format from polygraph reports may vary
    const parts = address.split(',').map(p => p.trim());
    
    // If we have enough parts, try to map them to fields
    if (parts.length >= 4) {
      // Common format: "123 Street Name, Suburb, City, Province, PostalCode"
      const lastPart = parts[parts.length - 1];
      const postalMatch = lastPart.match(/\d{4}/);
      
      return {
        streetName: parts[0] || '',
        suburb: parts.length > 1 ? parts[1] : '',
        city: parts.length > 2 ? parts[2] : '',
        province: parts.length > 3 ? parts[3].replace(/\d{4}/, '').trim() : '',
        postalCode: postalMatch ? postalMatch[0] : '',
      };
    } else if (parts.length > 0) {
      // Just put the whole address in street name for manual editing
      return {
        streetName: parts[0] || '',
        suburb: parts[1] || '',
        city: parts[2] || '',
      };
    }
    
    return {};
  };

  const [proofOfResidenceFile, setProofOfResidenceFile] = useState<File | null>(null);
  const [idFile, setIdFile] = useState<File | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [capturingLocation, setCapturingLocation] = useState(false);

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
    // Check if geolocation is available
    if (!navigator.geolocation) {
      toast({
        title: "Error",
        description: "Geolocation is not supported by your browser.",
        variant: "destructive",
      });
      return;
    }

    // Check if we're in a secure context (HTTPS or localhost)
    if (!window.isSecureContext) {
      toast({
        title: "Error",
        description: "Location services require a secure connection (HTTPS).",
        variant: "destructive",
      });
      return;
    }

    setCapturingLocation(true);
    
    toast({
      title: "Capturing Location...",
      description: "Getting your precise GPS coordinates. Please wait...",
    });

    const MAX_ACCEPTABLE_ACCURACY = 70; // meters - allow margin above 50m geofence threshold

    // Try high accuracy first with longer timeout
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const accuracy = position.coords.accuracy;
        const capturedLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        
        console.log('GPS coordinates captured (high accuracy):', capturedLocation);
        console.log('Accuracy:', accuracy, 'meters');
        console.log('Altitude:', position.coords.altitude);
        console.log('Altitude Accuracy:', position.coords.altitudeAccuracy);
        console.log('Heading:', position.coords.heading);
        console.log('Speed:', position.coords.speed);
        console.log('Timestamp:', new Date(position.timestamp).toISOString());
        
        // Validate accuracy
        if (accuracy > MAX_ACCEPTABLE_ACCURACY) {
          setCapturingLocation(false);
          toast({
            title: "Poor GPS Accuracy",
            description: `Current accuracy is ±${Math.round(accuracy)}m. For geofence verification (50m), accuracy must be ±${MAX_ACCEPTABLE_ACCURACY}m or better. Please move to a location with better GPS signal (outdoors, near window) and try again.`,
            variant: "destructive",
          });
          console.warn('GPS accuracy too poor:', accuracy, 'meters. Needs to be under', MAX_ACCEPTABLE_ACCURACY);
          return;
        }
        
        setCapturingLocation(false);
        setLocation(capturedLocation);
        toast({
          title: "Location Captured ✓",
          description: `Lat: ${capturedLocation.lat.toFixed(6)}, Lng: ${capturedLocation.lng.toFixed(6)}\nAccuracy: ±${Math.round(accuracy)}m (Good for 50m geofence)`,
        });
      },
      (error) => {
        console.error('High accuracy geolocation failed:', error);
        
        // If high accuracy fails with timeout, try with lower accuracy as fallback
        if (error.code === error.TIMEOUT) {
          toast({
            title: "Retrying...",
            description: "High accuracy timed out. Trying with standard accuracy...",
          });
          
          navigator.geolocation.getCurrentPosition(
            (position) => {
              const accuracy = position.coords.accuracy;
              const capturedLocation = {
                lat: position.coords.latitude,
                lng: position.coords.longitude,
              };
              
              console.log('GPS coordinates captured (standard accuracy):', capturedLocation);
              console.log('Accuracy:', accuracy, 'meters');
              console.log('Timestamp:', new Date(position.timestamp).toISOString());
              
              // Validate accuracy even for fallback
              if (accuracy > MAX_ACCEPTABLE_ACCURACY) {
                setCapturingLocation(false);
                toast({
                  title: "Poor GPS Accuracy",
                  description: `Current accuracy is ±${Math.round(accuracy)}m. For geofence verification (50m), accuracy must be ±${MAX_ACCEPTABLE_ACCURACY}m or better. Please move outdoors or near a window for better GPS signal.`,
                  variant: "destructive",
                });
                console.warn('GPS accuracy too poor:', accuracy, 'meters. Needs to be under', MAX_ACCEPTABLE_ACCURACY);
                return;
              }
              
              setCapturingLocation(false);
              setLocation(capturedLocation);
              toast({
                title: "Location Captured ✓",
                description: `Lat: ${capturedLocation.lat.toFixed(6)}, Lng: ${capturedLocation.lng.toFixed(6)}\nAccuracy: ±${Math.round(accuracy)}m`,
              });
            },
            (fallbackError) => {
              setCapturingLocation(false);
              let errorMessage = "Unable to capture location.";
              
              switch(fallbackError.code) {
                case fallbackError.PERMISSION_DENIED:
                  errorMessage = "Location permission denied. Please enable location access in your browser and device settings.";
                  break;
                case fallbackError.POSITION_UNAVAILABLE:
                  errorMessage = "Location information is unavailable. Please check your device's GPS settings and ensure you have a clear view of the sky.";
                  break;
                case fallbackError.TIMEOUT:
                  errorMessage = "Location request timed out. Please move outdoors or near a window and ensure GPS is enabled on your device.";
                  break;
                default:
                  errorMessage = `Location error: ${fallbackError.message}`;
              }
              
              console.error('Fallback geolocation error:', fallbackError);
              toast({
                title: "Error",
                description: errorMessage,
                variant: "destructive",
              });
            },
            {
              enableHighAccuracy: false,
              timeout: 15000,
              maximumAge: 0
            }
          );
        } else {
          // Handle other errors
          setCapturingLocation(false);
          let errorMessage = "Unable to capture location.";
          
          switch(error.code) {
            case error.PERMISSION_DENIED:
              errorMessage = "Location permission denied. Please enable location access in your browser and device settings.";
              break;
            case error.POSITION_UNAVAILABLE:
              errorMessage = "Location information is unavailable. Please check your device's GPS settings and ensure you have a clear view of the sky.";
              break;
            default:
              errorMessage = `Location error: ${error.message}`;
          }
          
          console.error('Geolocation error:', error);
          toast({
            title: "Error",
            description: errorMessage,
            variant: "destructive",
          });
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 30000,
        maximumAge: 0
      }
    );
  };

  const uploadFile = async (file: File, bucket: string, userId: string) => {
    const fileExt = file.name.split('.').pop();
    // Use timestamp and random string for anonymous uploads
    const randomId = Math.random().toString(36).substring(2, 15);
    const fileName = `${userId || randomId}/${Date.now()}.${fileExt}`;
    
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(fileName, file, {
        upsert: false
      });

    if (error) throw error;
    return fileName;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate form data with Zod
    try {
      employeeSubmissionSchema.parse(formData);
    } catch (error: any) {
      const firstError = error.errors[0];
      toast({
        title: "Validation Error",
        description: firstError.message,
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
      // Use employee ID from sessionStorage (already validated during registration)
      if (!employeeId) {
        toast({
          title: "Session Error",
          description: "Your session has expired. Please log in again.",
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
      const proofUrl = await uploadFile(proofOfResidenceFile, "proof-of-residence", employeeId);
      const idUrl = await uploadFile(idFile, "employee-ids", employeeId);
      
      // Determine status based on geofence
      const isGeofenceFlagged = geofenceData?.flagged || false;
      const submissionStatus = isGeofenceFlagged ? 'flagged' : 'pending';
      
      // Generate verification token
      const verificationToken = crypto.randomUUID();
      
      // Create submission using secure function
      const submissionData = {
        employee_number: formData.employeeNumber,
        id_number: formData.idNumber,
        first_name: formData.firstName,
        last_name: formData.lastName,
        email: formData.email,
        contact_number: formData.contactNumber,
        physical_address: physicalAddress,
        house_number: formData.houseNumber || 'N/A',
        floor_number: formData.floorNumber || 'N/A',
        street_name: formData.streetName || 'N/A',
        complex_name: formData.complexName || 'N/A',
        suburb: formData.suburb || 'N/A',
        city: formData.city || 'N/A',
        province: formData.province || 'N/A',
        postal_code: formData.postalCode || 'N/A',
        geolocation_lat: location.lat.toString(),
        geolocation_lng: location.lng.toString(),
        geofence_verified: (geofenceData?.verified || false).toString(),
        geofence_distance_meters: (geofenceData?.distance || null)?.toString(),
        proof_of_residence_url: proofUrl,
        id_photo_url: idUrl,
        status: submissionStatus,
        flagged: isGeofenceFlagged.toString(),
        verification_token: verificationToken,
        verification_token_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
      };

      const { data: submissionId, error: submissionError } = await supabase
        .rpc('create_verified_submission', {
          submission_data: submissionData
        });

      if (submissionError) {
        console.error("Submission error:", submissionError);
        if (submissionError.message.includes('rate limit')) {
          toast({
            title: "Rate Limit Exceeded",
            description: "You've submitted too many times recently. Please wait and try again.",
            variant: "destructive",
          });
        } else {
          throw submissionError;
        }
        setLoading(false);
        return;
      }

      // Add next of kin using secure function
      const { error: nokError } = await supabase.rpc('add_next_of_kin', {
        _submission_id: submissionId,
        _first_name: formData.nextOfKinFirstName,
        _last_name: formData.nextOfKinLastName,
        _contact_number: formData.nextOfKinContact,
        _address: formData.nextOfKinAddress
      });

      if (nokError) throw nokError;

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

      // Send verification email with token (fire and forget)
      const appUrl = `https://${window.location.hostname}`;
      supabase.functions.invoke("send-verification-email", {
        body: {
          email: formData.email,
          name: `${formData.firstName} ${formData.lastName}`,
          employeeNumber: formData.employeeNumber,
          verificationToken: verificationToken,
          appUrl: appUrl,
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
          description: "Your verification has been submitted. Check your email for confirmation.",
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
      <div className="min-h-screen bg-background">
        <TLDVHeader />
        <div className="flex items-center justify-center p-4 mt-8">
          <Card className="max-w-md text-center border-0 shadow-none">
        <CardContent className="pt-12 pb-12">
          <CheckCircle className="h-16 w-16 text-primary mx-auto mb-6" />
          <h2 className="text-2xl font-bold mb-4">Submission Complete!</h2>
          <p className="text-muted-foreground mb-6">
            Your verification has been submitted successfully to the <strong>Employee Verification Portal</strong>.
          </p>
          
          <div className="bg-primary/10 p-4 rounded-lg mb-6 border-2 border-primary">
            <h3 className="font-semibold mb-2 text-primary">📧 Check Your Email</h3>
            <p className="text-sm text-muted-foreground">
              A confirmation email has been sent to verify your email address. Please check your inbox and click the verification link to complete your submission.
            </p>
          </div>

          <div className="bg-muted p-4 rounded-lg mb-6">
            <h3 className="font-semibold mb-2">📅 Important: Renewal Process</h3>
            <p className="text-sm text-muted-foreground mb-3">
              You will need to resubmit your verification every <strong>6 months</strong> to maintain your active status.
            </p>
            <p className="text-sm text-muted-foreground mb-3">
              <strong>Next Renewal Date:</strong><br />
              {new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}
            </p>
            <p className="text-sm text-muted-foreground">
              <strong>Reminder Emails:</strong> Starting 1 month before your renewal is due (at 5 months), we will send you weekly reminder emails with instructions to request a new invitation link.
            </p>
          </div>
          
            <p className="text-xs text-muted-foreground">
              Please check your email inbox (and spam folder) for the verification email from TLDV.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
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
          <Tabs defaultValue="employee" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="employee">Employee Information</TabsTrigger>
              <TabsTrigger value="nextofkin">Next of Kin</TabsTrigger>
            </TabsList>

            {/* Employee Information Tab */}
            <TabsContent value="employee" className="space-y-6 mt-6">
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
                    <Label htmlFor="contactNumber">Contact Number *</Label>
                    <Input
                      id="contactNumber"
                      type="tel"
                      placeholder="e.g., +27821234567"
                      value={formData.contactNumber}
                      onChange={(e) => setFormData({ ...formData, contactNumber: e.target.value })}
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Address */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold border-b pb-2">Current Physical Address</h3>
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

            </TabsContent>

            {/* Next of Kin Tab */}
            <TabsContent value="nextofkin" className="space-y-6 mt-6">
              <div className="space-y-4">
                <h3 className="text-lg font-semibold border-b pb-2">Next of Kin Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="nextOfKinFirstName">First Name *</Label>
                    <Input
                      id="nextOfKinFirstName"
                      value={formData.nextOfKinFirstName}
                      onChange={(e) => setFormData({ ...formData, nextOfKinFirstName: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="nextOfKinLastName">Last Name *</Label>
                    <Input
                      id="nextOfKinLastName"
                      value={formData.nextOfKinLastName}
                      onChange={(e) => setFormData({ ...formData, nextOfKinLastName: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="nextOfKinContact">Contact Number *</Label>
                    <Input
                      id="nextOfKinContact"
                      type="tel"
                      value={formData.nextOfKinContact}
                      onChange={(e) => setFormData({ ...formData, nextOfKinContact: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="nextOfKinAddress">Physical Address *</Label>
                    <Textarea
                      id="nextOfKinAddress"
                      value={formData.nextOfKinAddress}
                      onChange={(e) => setFormData({ ...formData, nextOfKinAddress: e.target.value })}
                      required
                      rows={3}
                    />
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          {/* Document Upload - Always visible outside tabs */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold border-b pb-2">Document Upload</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="proofOfResidence">Proof of Residence *</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="proofOfResidence"
                    type="file"
                    accept="image/*,.pdf"
                    onChange={(e) => handleFileChange(e, "proof")}
                    required
                    className="cursor-pointer"
                  />
                  <Upload className="h-5 w-5 text-muted-foreground" />
                </div>
                {proofOfResidenceFile && (
                  <p className="text-sm text-green-600">✓ {proofOfResidenceFile.name}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="idPhoto">ID Photo *</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="idPhoto"
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleFileChange(e, "id")}
                    required
                    className="cursor-pointer"
                  />
                  <Camera className="h-5 w-5 text-muted-foreground" />
                </div>
                {idFile && (
                  <p className="text-sm text-green-600">✓ {idFile.name}</p>
                )}
              </div>
            </div>
          </div>

          {/* Location Capture - Always visible outside tabs */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold border-b pb-2">Location Verification</h3>
            <div className="flex items-center gap-4">
              <Button
                type="button"
                variant="outline"
                onClick={captureLocation}
                disabled={capturingLocation}
                className="flex items-center gap-2"
              >
                <MapPin className={`h-4 w-4 ${capturingLocation ? 'animate-pulse' : ''}`} />
                {capturingLocation ? "Capturing..." : "Capture Current Location"}
              </Button>
              {location && (
                <p className="text-sm text-green-600">
                  ✓ Location captured ({location.lat.toFixed(4)}, {location.lng.toFixed(4)})
                </p>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              We need to verify that you are at the address you provided. Please make sure you are at your current physical address before capturing your location.
            </p>
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