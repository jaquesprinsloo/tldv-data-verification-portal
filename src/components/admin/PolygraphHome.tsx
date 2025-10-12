import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, ShieldCheck, FileCheck, UserCheck, Award } from "lucide-react";

interface PolygraphHomeProps {
  onEnterPortal: () => void;
}

const PolygraphHome = ({ onEnterPortal }: PolygraphHomeProps) => {
  const services = [
    { icon: ShieldCheck, name: "Polygraph Examinations", description: "Professional lie detection services" },
    { icon: FileCheck, name: "Risk Assessments", description: "Comprehensive risk evaluation" },
    { icon: UserCheck, name: "ID Verification", description: "Identity verification services" },
    { icon: FileCheck, name: "Qualification Verification", description: "Academic & professional verification" },
  ];

  const locations = [
    { province: "KwaZulu-Natal", city: "Durban" },
    { province: "Mpumalanga", city: "Barberton" },
    { province: "Limpopo", city: "Bela Bela" },
    { province: "Northern Cape", city: "Kuruman" },
    { province: "Free State", city: "Bloemfontein" },
    { province: "Gauteng", city: "Vereeniging" },
    { province: "Gauteng", city: "Centurion" },
  ];

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold">Polygraph & Vetting Services</h1>
        <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
          Professional polygraph examinations and comprehensive vetting services across South Africa
        </p>
      </div>

      {/* Services Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {services.map((service, index) => (
          <Card key={index}>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-lg bg-primary/10">
                  <service.icon className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-xl">{service.name}</CardTitle>
                  <CardDescription>{service.description}</CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>

      {/* Locations */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Service Locations
          </CardTitle>
          <CardDescription>We operate in nine strategic locations across South Africa</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {locations.map((location, index) => (
              <Badge key={index} variant="outline" className="justify-center py-2">
                <MapPin className="h-3 w-3 mr-1" />
                {location.city}, {location.province}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Benefits */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Award className="h-5 w-5 text-primary" />
            Loyalty Program Benefits
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="h-2 w-2 rounded-full bg-primary mt-2" />
            <p className="text-muted-foreground">
              Up to <span className="font-semibold text-foreground">100% discount</span> on certain vetting reports for qualifying customers
            </p>
          </div>
          <div className="flex items-start gap-3">
            <div className="h-2 w-2 rounded-full bg-primary mt-2" />
            <p className="text-muted-foreground">
              Earn <span className="font-semibold text-foreground">credits</span> through our loyalty program
            </p>
          </div>
          <div className="flex items-start gap-3">
            <div className="h-2 w-2 rounded-full bg-primary mt-2" />
            <p className="text-muted-foreground">
              Priority booking for loyalty program members
            </p>
          </div>
        </CardContent>
      </Card>

      {/* CTA */}
      <div className="flex justify-center pt-4">
        <Button size="lg" onClick={onEnterPortal} className="px-8">
          Book Services Now
        </Button>
      </div>
    </div>
  );
};

export default PolygraphHome;
