import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ShieldCheck, FileCheck, UserCheck, Users, MapPin, Send } from "lucide-react";

const PolygraphBookingForm = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    service: "",
    numberOfPeople: "",
    location: "",
    additionalDetails: "",
  });

  const services = [
    { value: "polygraph", label: "Polygraph Examination", icon: ShieldCheck },
    { value: "risk_assessment", label: "Risk Assessment", icon: FileCheck },
    { value: "id_verification", label: "ID Verification", icon: UserCheck },
    { value: "qualification_verification", label: "Qualification Verification", icon: FileCheck },
  ];

  const locations = [
    { value: "durban", label: "Durban, KwaZulu-Natal" },
    { value: "barberton", label: "Barberton, Mpumalanga" },
    { value: "bela_bela", label: "Bela Bela, Limpopo" },
    { value: "kuruman", label: "Kuruman, Northern Cape" },
    { value: "bloemfontein", label: "Bloemfontein, Free State" },
    { value: "vereeniging", label: "Vereeniging, Gauteng" },
    { value: "centurion", label: "Centurion, Gauteng" },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.service || !formData.numberOfPeople || !formData.location) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error("Not authenticated");
      }

      const serviceName = services.find(s => s.value === formData.service)?.label || formData.service;
      const locationName = locations.find(l => l.value === formData.location)?.label || formData.location;

      const subject = `${serviceName} Booking Request`;
      const message = `
Service: ${serviceName}
Number of People: ${formData.numberOfPeople}
Location: ${locationName}
${formData.additionalDetails ? `\nAdditional Details:\n${formData.additionalDetails}` : ''}
      `.trim();

      const { error: requestError } = await supabase
        .from("profile_requests")
        .insert({
          sender_user_id: user.id,
          request_type: "polygraph_vetting",
          subject,
          message,
          status: "pending",
        });

      if (requestError) throw requestError;

      // Send notification email
      await supabase.functions.invoke("send-request-notification", {
        body: { subject, message },
      });

      toast({
        title: "Booking Request Sent",
        description: "Your request has been submitted and the master admin has been notified.",
      });

      // Reset form
      setFormData({
        service: "",
        numberOfPeople: "",
        location: "",
        additionalDetails: "",
      });

    } catch (error: any) {
      console.error("Error submitting booking:", error);
      toast({
        title: "Submission Failed",
        description: error.message || "Failed to submit booking request",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Book Polygraph & Vetting Services</CardTitle>
        <CardDescription>
          Submit your booking request and our team will get back to you shortly
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="service">Service Type *</Label>
            <Select
              value={formData.service}
              onValueChange={(value) => setFormData({ ...formData, service: value })}
            >
              <SelectTrigger id="service">
                <SelectValue placeholder="Select a service" />
              </SelectTrigger>
              <SelectContent>
                {services.map((service) => (
                  <SelectItem key={service.value} value={service.value}>
                    <div className="flex items-center gap-2">
                      <service.icon className="h-4 w-4" />
                      {service.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="numberOfPeople">Number of People *</Label>
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <Input
                id="numberOfPeople"
                type="number"
                min="1"
                placeholder="e.g., 5"
                value={formData.numberOfPeople}
                onChange={(e) => setFormData({ ...formData, numberOfPeople: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="location">Service Location *</Label>
            <Select
              value={formData.location}
              onValueChange={(value) => setFormData({ ...formData, location: value })}
            >
              <SelectTrigger id="location">
                <SelectValue placeholder="Select a location" />
              </SelectTrigger>
              <SelectContent>
                {locations.map((location) => (
                  <SelectItem key={location.value} value={location.value}>
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      {location.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="additionalDetails">Additional Details (Optional)</Label>
            <Textarea
              id="additionalDetails"
              placeholder="Provide any additional information about your booking..."
              rows={4}
              value={formData.additionalDetails}
              onChange={(e) => setFormData({ ...formData, additionalDetails: e.target.value })}
            />
          </div>

          <div className="flex gap-3">
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? (
                <>Processing...</>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Submit Booking Request
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate("/admin/dashboard")}
            >
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

export default PolygraphBookingForm;
