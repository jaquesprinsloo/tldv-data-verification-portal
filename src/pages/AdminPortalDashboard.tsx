import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { FileText, Users, ClipboardCheck } from "lucide-react";
import tldvLogo from "@/assets/tldv-logo-primary.png";

const AdminPortalDashboard = () => {
  const navigate = useNavigate();
  const [isAnimating, setIsAnimating] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/admin/login");
        return;
      }

      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .eq("role", "admin")
        .single();

      if (!roleData) {
        await supabase.auth.signOut();
        navigate("/admin/login");
      }
    };

    checkAuth();

    // Animation timer - matches full animation sequence (2s scanline + 2s logo fade in + 1.5s hold + 1s fade out = 6.5s)
    const timer = setTimeout(() => setIsAnimating(false), 6500);
    return () => clearTimeout(timer);
  }, [navigate]);

  const portals = [
    {
      title: "Data & Employee Management",
      description: "Manage employees, submissions, and invitations",
      icon: Users,
      path: "/admin/data-employee-management",
      color: "from-red-600/10 via-red-500/5 to-transparent hover:from-red-600/20 hover:via-red-500/10"
    },
    {
      title: "Polygraph & Vetting",
      description: "Book appointments and request vetting",
      icon: ClipboardCheck,
      path: "/admin/polygraph-vetting",
      color: "from-red-600/10 via-red-500/5 to-transparent hover:from-red-600/20 hover:via-red-500/10"
    },
    {
      title: "Reports & Accounts",
      description: "View reports and accounts",
      icon: FileText,
      path: "/admin/reports-accounts",
      color: "from-red-600/10 via-red-500/5 to-transparent hover:from-red-600/20 hover:via-red-500/10"
    }
  ];

  return (
    <div className="min-h-screen bg-black relative overflow-hidden">
      {/* TV Switch-on Animation with Logo Sequence */}
      <div
        className={`fixed inset-0 bg-black z-50 ${
          isAnimating 
            ? "opacity-100" 
            : "opacity-0 pointer-events-none"
        }`}
      >
        {/* TV Scanline Effect (0s - 2s) */}
        <div 
          className="absolute inset-0 flex items-center justify-center"
          style={{ 
            animation: isAnimating ? 'scanline 2s ease-out forwards' : 'none',
            opacity: 0,
          }}
        >
          <div className="w-1 h-full bg-white/80" 
               style={{ 
                 boxShadow: '0 0 20px rgba(255,255,255,0.8)'
               }} 
          />
        </div>

        {/* Full Logo fades in (2s - 4s), holds (4s - 5.5s), fades out (5.5s - 6.5s) */}
        <div 
          className="absolute inset-0 flex flex-col items-center justify-center"
          style={{
            animation: isAnimating ? 'logoSequence 4.5s ease-in-out 2s both' : 'none',
          }}
        >
          <img 
            src={tldvLogo} 
            alt="TLDV Logo" 
            className="w-1/2 max-w-2xl object-contain"
          />
          <h1 className="text-4xl font-bold text-white mt-12 tracking-wider">
            Management Portal
          </h1>
        </div>
      </div>

      {/* Main Content - Portals */}
      <div className={`min-h-screen flex items-center justify-center transition-all duration-1000 ${
        isAnimating ? "opacity-0" : "opacity-100"
      }`}>
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {portals.map((portal) => (
              <Card
                key={portal.path}
                onClick={() => navigate(portal.path)}
                className={`p-8 cursor-pointer transition-all duration-500 hover:scale-105 bg-black border-2 border-red-600 hover:border-red-500 hover:shadow-[0_0_30px_rgba(239,68,68,0.3)]`}
              >
                <div className="flex flex-col items-center text-center space-y-4">
                  <div className="p-4 rounded-full bg-red-600/20 border border-red-600">
                    <portal.icon className="w-12 h-12 text-red-500" />
                  </div>
                  <h2 className="text-2xl font-bold text-white">
                    {portal.title}
                  </h2>
                  <p className="text-gray-300">
                    {portal.description}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes scanline {
          0% {
            transform: translateX(-100vw);
            opacity: 0;
          }
          10% {
            opacity: 1;
          }
          90% {
            opacity: 1;
          }
          100% {
            transform: translateX(100vw);
            opacity: 0;
          }
        }

        @keyframes logoSequence {
          0% {
            opacity: 0;
            transform: scale(0.95);
          }
          10% {
            opacity: 1;
            transform: scale(1);
          }
          80% {
            opacity: 1;
            transform: scale(1);
          }
          100% {
            opacity: 0;
            transform: scale(1.05);
          }
        }
      `}</style>
    </div>
  );
};

export default AdminPortalDashboard;
