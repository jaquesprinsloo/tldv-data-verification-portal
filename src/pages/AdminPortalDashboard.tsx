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

    // Animation timer - matches full animation sequence
    const timer = setTimeout(() => setIsAnimating(false), 2500);
    return () => clearTimeout(timer);
  }, [navigate]);

  const portals = [
    {
      title: "Data & Employee Management",
      description: "Manage employees, submissions, and invitations",
      icon: Users,
      path: "/admin/data-employee-management",
      color: "from-red-500/20 to-red-600/20 hover:from-red-500/30 hover:to-red-600/30"
    },
    {
      title: "Polygraph & Vetting",
      description: "Book appointments and request vetting",
      icon: ClipboardCheck,
      path: "/admin/polygraph-vetting",
      color: "from-red-500/20 to-red-600/20 hover:from-red-500/30 hover:to-red-600/30"
    },
    {
      title: "Reports & Accounts",
      description: "View reports and accounts",
      icon: FileText,
      path: "/admin/reports-accounts",
      color: "from-red-500/20 to-red-600/20 hover:from-red-500/30 hover:to-red-600/30"
    }
  ];

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* TV Switch-on Animation with Logo Sequence */}
      <div
        className={`fixed inset-0 bg-black z-50 flex items-center justify-center ${
          isAnimating 
            ? "opacity-100" 
            : "opacity-0 pointer-events-none"
        }`}
      >
        {/* TV Scanline Effect */}
        <div 
          className="absolute inset-0 flex items-center justify-center"
          style={{ 
            animation: isAnimating ? 'scanline 0.5s ease-out' : 'none',
          }}
        >
          <div className="w-1 h-full bg-white/80" 
               style={{ 
                 boxShadow: '0 0 20px rgba(255,255,255,0.8)'
               }} 
          />
        </div>

        {/* Face appears first (0.5s - 0.8s) */}
        <div 
          className="absolute"
          style={{
            animation: isAnimating ? 'faceAppear 0.3s ease-out 0.5s both' : 'none',
          }}
        >
          <div className="w-32 h-32 rounded-full bg-black flex items-center justify-center">
            <div className="w-4 h-4 bg-white rounded-full mb-4"></div>
          </div>
        </div>

        {/* Red circle with heartbeat (0.8s - 1.7s) */}
        <div 
          className="absolute"
          style={{
            animation: isAnimating ? 'circleAppear 0.2s ease-out 0.8s both, heartbeat 0.3s ease-in-out 1s 3' : 'none',
          }}
        >
          <div className="w-40 h-40 rounded-full border-4 border-red-600 flex items-center justify-center">
            <div className="w-32 h-32 rounded-full bg-black flex items-center justify-center">
              <div className="w-4 h-4 bg-white rounded-full mb-4"></div>
            </div>
          </div>
        </div>

        {/* TLDV Text appears (1.7s onwards) */}
        <div 
          className="absolute flex flex-col items-center"
          style={{
            animation: isAnimating ? 'textAppear 0.5s ease-out 1.7s both' : 'none',
          }}
        >
          <h1 className="text-6xl font-bold text-white mb-2 tracking-wider">TLDV</h1>
          <p className="text-white text-lg tracking-widest">True Lie Detectors & Vetting</p>
        </div>
      </div>

      {/* Main Content */}
      <div className={`transition-all duration-1000 delay-700 ${
        isAnimating ? "opacity-0 scale-95" : "opacity-100 scale-100"
      }`}>
        {/* Header with Full Width Blended Logo */}
        <div className="relative w-full h-64 mb-8 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-background/50 to-background"></div>
          <img 
            src={tldvLogo} 
            alt="TLDV Logo" 
            className="w-full h-full object-contain opacity-20 animate-scale-in"
          />
          <h1 className="absolute inset-0 flex items-center justify-center text-5xl font-bold text-foreground animate-fade-in" style={{ animationDelay: '0.2s' }}>
            Management Portal
          </h1>
        </div>

        {/* Portal Cards */}
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-fade-in" style={{ animationDelay: '0.6s' }}>
            {portals.map((portal, index) => (
              <Card
                key={portal.path}
                onClick={() => navigate(portal.path)}
                className={`p-8 cursor-pointer transition-all duration-300 hover:scale-105 hover:shadow-2xl bg-gradient-to-br ${portal.color} border-2 animate-fade-in`}
                style={{ animationDelay: `${0.8 + index * 0.2}s` }}
              >
                <div className="flex flex-col items-center text-center space-y-4">
                  <div className="p-4 rounded-full bg-background/50">
                    <portal.icon className="w-12 h-12 text-primary" />
                  </div>
                  <h2 className="text-2xl font-bold text-foreground">
                    {portal.title}
                  </h2>
                  <p className="text-muted-foreground">
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
          50% {
            opacity: 1;
          }
          100% {
            transform: translateX(100vw);
            opacity: 0;
          }
        }

        @keyframes faceAppear {
          0% {
            opacity: 0;
            transform: scale(0.5);
          }
          100% {
            opacity: 1;
            transform: scale(1);
          }
        }

        @keyframes circleAppear {
          0% {
            opacity: 0;
            transform: scale(0.8);
          }
          100% {
            opacity: 1;
            transform: scale(1);
          }
        }

        @keyframes heartbeat {
          0%, 100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.1);
          }
        }

        @keyframes textAppear {
          0% {
            opacity: 0;
            transform: translateY(20px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
};

export default AdminPortalDashboard;
