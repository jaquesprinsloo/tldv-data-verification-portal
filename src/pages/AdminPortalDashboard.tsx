import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { FileText, Users, ClipboardCheck } from "lucide-react";
import tldvLogo from "@/assets/tldv-logo-primary.png";
import tldvIcon from "@/assets/tldv-icon.jpg";

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

    // Animation timer - matches full animation sequence (2s scanline + 2s black + 1.5s icon + 1s heartbeat + 1s text = 7.5s)
    const timer = setTimeout(() => setIsAnimating(false), 7500);
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
        className={`fixed inset-0 bg-black z-50 transition-opacity duration-1000 ${
          isAnimating 
            ? "opacity-100" 
            : "opacity-0 pointer-events-none"
        }`}
      >
        {/* TV Scanline Effect (0s - 2s) */}
        <div 
          className="absolute inset-0 flex items-center justify-center"
          style={{ 
            animation: isAnimating ? 'scanline 2s ease-out' : 'none',
          }}
        >
          <div className="w-1 h-full bg-white/80" 
               style={{ 
                 boxShadow: '0 0 20px rgba(255,255,255,0.8)'
               }} 
          />
        </div>

        {/* Red circle with face icon appears middle left (4s - 4.5s) */}
        <div 
          className="absolute left-[20%] top-1/2 -translate-y-1/2"
          style={{
            animation: isAnimating ? 'iconAppear 0.5s ease-out 4s both' : 'none',
          }}
        >
          <img src={tldvIcon} alt="TLDV Icon" className="w-32 h-32" />
        </div>

        {/* Heartbeat line moving right (4.5s - 5.5s) */}
        <div 
          className="absolute left-[20%] top-1/2 -translate-y-1/2"
          style={{
            animation: isAnimating ? 'heartbeatLine 1s ease-out 4.5s both' : 'none',
          }}
        >
          <svg width="400" height="100" className="ml-16">
            <polyline 
              points="0,50 50,50 70,20 90,80 110,50 400,50" 
              fill="none" 
              stroke="#ef4444" 
              strokeWidth="3"
              style={{
                strokeDasharray: '1000',
                strokeDashoffset: '1000',
                animation: isAnimating ? 'drawLine 1s ease-out 4.5s forwards' : 'none',
              }}
            />
          </svg>
        </div>

        {/* TLDV Text appears (5.5s - 6s) */}
        <div 
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center"
          style={{
            animation: isAnimating ? 'tldvAppear 0.5s ease-out 5.5s both' : 'none',
          }}
        >
          <h1 className="text-6xl font-bold text-white mb-2 tracking-wider">TLDV</h1>
        </div>

        {/* Subtitle fades in (6s - 6.5s) */}
        <div 
          className="absolute top-[55%] left-1/2 -translate-x-1/2 flex flex-col items-center"
          style={{
            animation: isAnimating ? 'subtitleFade 0.5s ease-out 6s both' : 'none',
          }}
        >
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
          10% {
            opacity: 1;
          }
          100% {
            transform: translateX(100vw);
            opacity: 0;
          }
        }

        @keyframes iconAppear {
          0% {
            opacity: 0;
            transform: scale(0.5);
          }
          100% {
            opacity: 1;
            transform: scale(1);
          }
        }

        @keyframes heartbeatLine {
          0% {
            opacity: 0;
          }
          100% {
            opacity: 1;
          }
        }

        @keyframes drawLine {
          to {
            strokeDashoffset: 0;
          }
        }

        @keyframes tldvAppear {
          0% {
            opacity: 0;
            transform: translate(-50%, -50%) translateX(-20px);
          }
          100% {
            opacity: 1;
            transform: translate(-50%, -50%) translateX(0);
          }
        }

        @keyframes subtitleFade {
          0% {
            opacity: 0;
          }
          100% {
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
};

export default AdminPortalDashboard;
