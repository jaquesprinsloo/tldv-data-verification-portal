import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import AdminHeader from "@/components/admin/AdminHeader";
import AppointmentsSchedule from "@/components/admin/AppointmentsSchedule";
import AppointmentsCalendar from "@/components/admin/AppointmentsCalendar";
import BookingConfirmationsTab from "@/components/admin/booking/BookingConfirmationsTab";
import BookingListsManager from "@/components/admin/booking/BookingListsManager";
import VenueManagement from "@/components/admin/VenueManagement";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { User } from "@supabase/supabase-js";

const PolygraphVetting = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isMasterAdmin, setIsMasterAdmin] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
          navigate("/admin/login");
          return;
        }

        const { data: roleData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .in("role", ["admin", "master_admin"]);

        if (!roleData || roleData.length === 0) {
          await supabase.auth.signOut();
          navigate("/admin/login");
          return;
        }

        setIsMasterAdmin(roleData.some(r => r.role === "master_admin"));
        setUser(user);
      } catch (error) {
        console.error("Auth error:", error);
        navigate("/admin/login");
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, [navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AdminHeader user={user} title="Appointments" />
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
        <Button
          variant="ghost"
          onClick={() => navigate("/admin/portal")}
          className="mb-6"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Button>

        <Tabs defaultValue="schedule" className="space-y-6">
          <TabsList className="flex w-full flex-wrap h-auto justify-start">
            <TabsTrigger value="schedule">Schedule</TabsTrigger>
            <TabsTrigger value="confirmations">Booking Confirmations</TabsTrigger>
            <TabsTrigger value="requests">Requests</TabsTrigger>
            <TabsTrigger value="lists">Booking Lists</TabsTrigger>
            {isMasterAdmin && <TabsTrigger value="venues">Pre-Approved Venues</TabsTrigger>}
          </TabsList>
          <TabsContent value="schedule">
            <AppointmentsCalendar />
          </TabsContent>
          <TabsContent value="confirmations">
            <BookingConfirmationsTab isMasterAdmin={isMasterAdmin} />
          </TabsContent>
          <TabsContent value="requests">
            <AppointmentsSchedule isMasterAdmin={isMasterAdmin} />
          </TabsContent>
          <TabsContent value="lists">
            <BookingListsManager />
          </TabsContent>
          {isMasterAdmin && (
            <TabsContent value="venues">
              <VenueManagement />
            </TabsContent>
          )}
        </Tabs>
      </main>
    </div>
  );
};

export default PolygraphVetting;
