import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import AdminHeader from "@/components/admin/AdminHeader";
import { User } from "@supabase/supabase-js";
import { ShieldCheck } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CandexStatistics from "@/components/candex/CandexStatistics";
import CandexBuilder from "@/components/candex/CandexBuilder";
import CandexClients from "@/components/candex/CandexClients";
import CandexClientPortal from "@/components/candex/CandexClientPortal";

const CanDexPreScreening = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isMasterAdmin, setIsMasterAdmin] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          navigate("/admin/login");
          return;
        }

        const { data: roleData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", session.user.id)
          .in("role", ["admin", "master_admin"]);

        if (!roleData || roleData.length === 0) {
          navigate("/admin/login");
          return;
        }

        const isMaster = roleData.some(r => r.role === "master_admin");
        setIsMasterAdmin(isMaster);
        setUser(session.user);
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
      <AdminHeader user={user} />

      <main className="container mx-auto px-4 sm:px-6 py-8">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <ShieldCheck className="h-8 w-8 text-primary" />
            <h1 className="text-2xl sm:text-3xl font-bold">CanDex Pre Screening</h1>
          </div>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            {isMasterAdmin
              ? "Pre-employment screening and candidate indexing portal"
              : "Manage candidate invitations, reviews, and risk assessments"}
          </p>
        </div>

        {isMasterAdmin ? (
          <Tabs defaultValue="statistics" className="space-y-6">
            <TabsList className="grid w-full grid-cols-3 max-w-md mx-auto">
              <TabsTrigger value="statistics">Statistics</TabsTrigger>
              <TabsTrigger value="builder">CanDex Builder</TabsTrigger>
              <TabsTrigger value="clients">Clients</TabsTrigger>
            </TabsList>

            <TabsContent value="statistics">
              <CandexStatistics />
            </TabsContent>

            <TabsContent value="builder">
              <CandexBuilder />
            </TabsContent>

            <TabsContent value="clients">
              <CandexClients />
            </TabsContent>
          </Tabs>
        ) : (
          <CandexClientPortal userId={user?.id || ""} />
        )}
      </main>
    </div>
  );
};

export default CanDexPreScreening;
