import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { User } from "@supabase/supabase-js";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminHeader from "@/components/admin/AdminHeader";
import TrainingLibrary from "@/components/examiner/TrainingLibrary";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { BookOpen, Users, Search, Loader2 } from "lucide-react";

export default function ExaminerManagement() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [allowed, setAllowed] = useState(false);
  const [search, setSearch] = useState("");
  useEffect(() => {
    let alive = true;
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate("/admin/login", { replace: true }); return; }
      const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "master_admin").maybeSingle();
      if (error || !data) { navigate("/admin/portal", { replace: true }); return; }
      if (alive) { setUser(user); setAllowed(true); }
    };
    void check();
    return () => { alive = false; };
  }, [navigate]);
  const { data: profiles = [], isLoading, error, refetch } = useQuery({
    queryKey: ["active-examiner-profiles", user?.id], enabled: allowed,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_active_examiner_profiles");
      if (error) throw error;
      return data || [];
    }, refetchInterval: 30000,
  });
  if (!allowed) return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>;
  const visible = profiles.filter(p => `${p.full_name} ${p.email}`.toLowerCase().includes(search.toLowerCase()));
  return <div className="min-h-screen bg-background"><AdminHeader user={user} title="Examiner Portal" /><main className="mx-auto max-w-6xl px-4 sm:px-6 py-6 space-y-6">
    <div className="flex flex-wrap justify-between items-center gap-3"><div><h1 className="text-2xl font-bold">Examiner Portal</h1><p className="text-muted-foreground mt-1">True Lie Detectors & Vetting</p></div><Button variant="outline" onClick={() => navigate("/admin/profile-management")}><Users className="h-4 w-4 mr-2" />Manage profiles</Button></div>
    <Tabs defaultValue="profiles"><TabsList className="mb-6"><TabsTrigger value="profiles"><Users className="h-4 w-4 mr-2" />Examiner profiles ({profiles.length})</TabsTrigger><TabsTrigger value="training"><BookOpen className="h-4 w-4 mr-2" />Education & Training</TabsTrigger></TabsList>
      <TabsContent value="profiles" className="space-y-5"><h2 className="text-xl font-semibold">Active examiner profiles</h2><div className="relative max-w-lg"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="Search examiner profiles" placeholder="Search by name or email" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} /></div>
      {isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : error ? <p>Profiles could not be loaded. <Button variant="outline" onClick={() => refetch()}>Retry</Button></p> : visible.length === 0 ? <p className="text-muted-foreground py-8">No examiner profiles found.</p> : <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{visible.map(p => <Card key={p.id}><CardContent className="p-5 space-y-3"><div className="flex justify-between gap-2"><Users className="h-6 w-6 text-primary" /><Badge variant="outline">Active profile</Badge></div><h3 className="font-semibold break-words">{p.full_name || "Examiner"}</h3><p className="text-sm text-muted-foreground break-all">{p.email}</p><p className="text-xs text-muted-foreground">Created {new Date(p.created_at).toLocaleDateString("en-ZA")}</p></CardContent></Card>)}</div>}
      </TabsContent><TabsContent value="training"><TrainingLibrary canManage /></TabsContent>
    </Tabs>
  </main></div>;
}