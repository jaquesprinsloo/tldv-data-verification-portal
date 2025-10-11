import { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import tldvLogo from "@/assets/tldv-logo.jpg";

interface AdminHeaderProps {
  user: User | null;
}

const AdminHeader = ({ user }: AdminHeaderProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast({
      title: "Logged Out",
      description: "You have been successfully logged out.",
    });
    navigate("/admin/login");
  };

  return (
    <header className="bg-destructive text-white py-4 border-b-4 border-primary sticky top-0 z-50">
      <div className="container mx-auto px-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-full overflow-hidden flex-shrink-0">
              <img src={tldvLogo} alt="TLDV Logo" className="h-full w-full object-cover" />
            </div>
            <div>
              <h1 className="text-2xl font-bold font-poppins">Data & Employee Management Portal</h1>
              <p className="text-sm text-white/90">Employee Verification Management</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden md:block">
              <p className="text-sm font-medium">{user?.email}</p>
              <p className="text-xs text-white/70">Administrator</p>
            </div>
            <Button variant="secondary" size="sm" onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default AdminHeader;
