import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ShieldCheck, Users, MapPin, FileCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import TLDVHeader from "@/components/employee/TLDVHeader";

const Home = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <TLDVHeader />
      
      <main className="container mx-auto px-6 py-12">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold mb-4">Employee Verification System</h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Secure residential address verification for fraud prevention and employee accountability
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          <Card>
            <CardContent className="pt-6 text-center">
              <ShieldCheck className="h-12 w-12 text-primary mx-auto mb-4" />
              <h3 className="font-semibold mb-2">Secure Verification</h3>
              <p className="text-sm text-muted-foreground">
                Advanced security measures to protect employee data
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6 text-center">
              <MapPin className="h-12 w-12 text-primary mx-auto mb-4" />
              <h3 className="font-semibold mb-2">Geolocation Tracking</h3>
              <p className="text-sm text-muted-foreground">
                GPS verification ensures accurate location data
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6 text-center">
              <FileCheck className="h-12 w-12 text-primary mx-auto mb-4" />
              <h3 className="font-semibold mb-2">Document Verification</h3>
              <p className="text-sm text-muted-foreground">
                Photo ID and selfie verification for identity confirmation
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6 text-center">
              <Users className="h-12 w-12 text-primary mx-auto mb-4" />
              <h3 className="font-semibold mb-2">1200+ Employees</h3>
              <p className="text-sm text-muted-foreground">
                Comprehensive verification across all stores
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-center gap-4">
          <Button size="lg" onClick={() => navigate("/admin/login")}>
            <ShieldCheck className="mr-2 h-5 w-5" />
            Admin Login
          </Button>
        </div>

        <div className="mt-12 text-center text-sm text-muted-foreground">
          <p>Employees: Please use the unique verification link sent to your email</p>
        </div>
      </main>
    </div>
  );
};

export default Home;
