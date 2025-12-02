import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarDays, History } from "lucide-react";
import PolygraphBookingForm from "../PolygraphBookingForm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";

interface BookingRequest {
  id: string;
  subject: string;
  message: string;
  status: string;
  created_at: string;
}

const PolygraphPortal = () => {
  const [activeTab, setActiveTab] = useState("book");
  const [bookingHistory, setBookingHistory] = useState<BookingRequest[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (activeTab === "history") {
      fetchBookingHistory();
    }
  }, [activeTab]);

  const fetchBookingHistory = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("profile_requests")
        .select("*")
        .eq("sender_user_id", user.id)
        .eq("request_type", "polygraph_vetting")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setBookingHistory(data || []);
    } catch (error) {
      console.error("Error fetching booking history:", error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="secondary">Pending</Badge>;
      case "in_progress":
        return <Badge variant="default">In Progress</Badge>;
      case "replied":
        return <Badge variant="outline">Replied</Badge>;
      case "closed":
        return <Badge variant="secondary">Closed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="book" className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            Book Services
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Booking History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="book" className="mt-6">
          <PolygraphBookingForm />
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Your Booking Requests</CardTitle>
              <CardDescription>
                View the status of your polygraph and vetting service requests
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                </div>
              ) : bookingHistory.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CalendarDays className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No booking requests yet</p>
                  <p className="text-sm">Submit a booking request to get started</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {bookingHistory.map((request) => (
                    <Card key={request.id} className="bg-muted/30">
                      <CardContent className="pt-4">
                        <div className="flex items-start justify-between">
                          <div className="space-y-1">
                            <h4 className="font-medium">{request.subject}</h4>
                            <p className="text-sm text-muted-foreground whitespace-pre-line">
                              {request.message}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Submitted: {new Date(request.created_at).toLocaleDateString()}
                            </p>
                          </div>
                          {getStatusBadge(request.status)}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default PolygraphPortal;
