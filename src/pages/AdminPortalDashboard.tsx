import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { FileText, Users, ClipboardCheck, Mail } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { NotificationsDialog } from "@/components/admin/NotificationsDialog";
import tldvLogo from "@/assets/tldv-logo-primary.png";
import { useQuery } from "@tanstack/react-query";

const AdminPortalDashboard = () => {
  const navigate = useNavigate();
  
  // Check if animation has already played this session
  const hasSeenAnimation = sessionStorage.getItem('portal_animation_played') === 'true';
  // Cache user role to prevent layout shift on return navigation
  const cachedIsMasterAdmin = sessionStorage.getItem('user_is_master_admin') === 'true';
  const cachedUserName = sessionStorage.getItem('user_display_name') || "";
  
  const [isAnimating, setIsAnimating] = useState(!hasSeenAnimation);
  const [isExiting, setIsExiting] = useState(false);
  const [userName, setUserName] = useState(cachedUserName);

  const [isMasterAdmin, setIsMasterAdmin] = useState(cachedIsMasterAdmin);
  const [currentUserId, setCurrentUserId] = useState<string>("");

  const { data: pendingRequests } = useQuery({
    queryKey: ['pending-requests-count'],
    queryFn: async () => {
      const { count } = await supabase
        .from('profile_requests')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');
      return count || 0;
    },
    enabled: isMasterAdmin
  });

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/admin/login");
        return;
      }

      setCurrentUserId(session.user.id);

      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .in("role", ["admin", "master_admin"]);

      if (!roleData || roleData.length === 0) {
        await supabase.auth.signOut();
        navigate("/admin/login");
        return;
      }

      // Check if user is master admin
      const isMaster = roleData.some(r => r.role === "master_admin");
      setIsMasterAdmin(isMaster);
      sessionStorage.setItem('user_is_master_admin', isMaster ? 'true' : 'false');

      // Fetch user profile for name
      const { data: profileData } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", session.user.id)
        .single();

      if (profileData?.full_name) {
        setUserName(profileData.full_name);
        sessionStorage.setItem('user_display_name', profileData.full_name);
      }
    };

    checkAuth();

    // Only run animation timer if animation hasn't been seen
    if (!hasSeenAnimation) {
      // Animation timer - matches full animation sequence (2s scanline + 2s logo fade in + 1.5s hold + 1s fade out = 6.5s)
      const timer = setTimeout(() => {
        setIsAnimating(false);
        sessionStorage.setItem('portal_animation_played', 'true');
      }, 6500);
      return () => clearTimeout(timer);
    }
  }, [navigate, hasSeenAnimation]);

  const handleSignOut = async () => {
    setIsExiting(true);
    
    // Clear all session storage flags so they reset on next login
    sessionStorage.removeItem('portal_animation_played');
    sessionStorage.removeItem('user_is_master_admin');
    sessionStorage.removeItem('user_display_name');
    
    // Wait for exit animation to complete
    setTimeout(async () => {
      await supabase.auth.signOut();
      navigate("/admin/login");
    }, 2000);
  };

  const portals = [
    {
      title: "Data & Employee Management",
      description: "Manage employees, submissions, and invitations",
      icon: Users,
      path: "/admin/data-employee-management",
      color: "from-red-600/10 via-red-500/5 to-transparent hover:from-red-600/20 hover:via-red-500/10",
      badge: null
    },
    {
      title: "Polygraph & Vetting",
      description: "Book appointments and request vetting",
      icon: ClipboardCheck,
      path: "/admin/polygraph-vetting",
      color: "from-red-600/10 via-red-500/5 to-transparent hover:from-red-600/20 hover:via-red-500/10",
      badge: null
    },
    {
      title: "Reports & Accounts",
      description: "View reports and accounts",
      icon: FileText,
      path: "/admin/reports-accounts",
      color: "from-red-600/10 via-red-500/5 to-transparent hover:from-red-600/20 hover:via-red-500/10",
      badge: null
    },
    ...(isMasterAdmin ? [{
      title: "Profile Management",
      description: "Create and manage admin profiles",
      icon: Users,
      path: "/admin/profile-management",
      color: "from-red-600/10 via-red-500/5 to-transparent hover:from-red-600/20 hover:via-red-500/10",
      badge: null
    }, {
      title: "Request Inbox",
      description: "View and respond to profile requests",
      icon: Mail,
      path: "/admin/request-inbox",
      color: "from-red-600/10 via-red-500/5 to-transparent hover:from-red-600/20 hover:via-red-500/10",
      badge: pendingRequests
    }] : [])
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
          <div className="w-1 h-full bg-red-600" 
               style={{ 
                 boxShadow: '0 0 40px rgba(239,68,68,0.8), 0 0 80px rgba(239,68,68,0.5)'
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
          {userName && (
            <h2 className="text-3xl font-semibold text-red-500 mt-8 tracking-wide">
              Welcome, {userName}
            </h2>
          )}
          <h1 className="text-4xl font-bold text-white mt-4 tracking-wider">
            Management Portal
          </h1>
          <p className="text-xl text-gray-400 mt-6 italic">
            "Excellence in every detail"
          </p>
        </div>
      </div>

      {/* Exit Portal Animation */}
      <div
        className={`fixed inset-0 bg-black z-50 transition-opacity duration-500 ${
          isExiting 
            ? "opacity-100" 
            : "opacity-0 pointer-events-none"
        }`}
      >
        <div 
          className="absolute inset-0 flex items-center justify-center"
          style={{ 
            animation: isExiting ? 'portalExit 2s ease-in-out forwards' : 'none',
          }}
        >
          <div className="relative">
            <div 
              className="w-96 h-96 rounded-full border-4 border-red-600"
              style={{
                boxShadow: '0 0 60px rgba(239,68,68,0.8), inset 0 0 60px rgba(239,68,68,0.5)',
                animation: isExiting ? 'portalShrink 2s ease-in-out forwards' : 'none',
              }}
            />
            <p className="absolute inset-0 flex items-center justify-center text-white text-2xl font-bold">
              Exiting Portal...
            </p>
          </div>
        </div>
      </div>

      {/* Main Content - Portals */}
      <div className={`min-h-screen flex items-center justify-center ${
        !hasSeenAnimation ? "transition-all duration-1000" : ""
      } ${isAnimating ? "opacity-0" : "opacity-100"}`}>
        <div className="container mx-auto px-4 max-w-6xl relative">
          <div className="absolute top-0 right-4 flex gap-3">
            {!isMasterAdmin && <NotificationsDialog />}
            <button
              onClick={handleSignOut}
              className="px-6 py-3 bg-red-600/20 border-2 border-red-600 text-white rounded-lg hover:bg-red-600/40 hover:shadow-[0_0_20px_rgba(239,68,68,0.6)] transition-all duration-300"
            >
              Sign Out
            </button>
          </div>
          
          <h1 className="text-4xl font-bold text-white text-center mb-12">
            {isMasterAdmin ? "Master Profile - Portal Selection" : "Portal Selection"}
          </h1>
          <div className={`grid grid-cols-1 ${isMasterAdmin ? 'md:grid-cols-2 lg:grid-cols-4' : 'md:grid-cols-3'} gap-6`}>
            {portals.map((portal) => (
              <Card
                key={portal.path}
                onClick={() => navigate(portal.path)}
                className={`p-8 cursor-pointer transition-all duration-500 hover:scale-105 bg-black border-[3px] border-red-600 hover:border-red-500 hover:shadow-[0_0_40px_rgba(239,68,68,0.5)] relative`}
              >
                {portal.badge !== null && portal.badge !== undefined && portal.badge > 0 && (
                  <Badge className="absolute top-4 right-4 bg-red-600 text-white">
                    {portal.badge}
                  </Badge>
                )}
                <div className="flex flex-col items-center text-center space-y-4">
                  <div className="p-6 rounded-full bg-red-600/30 border-2 border-red-600 shadow-[0_0_20px_rgba(239,68,68,0.4)]">
                    <portal.icon className="w-16 h-16 text-red-500" strokeWidth={2.5} />
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

        @keyframes portalExit {
          0% {
            opacity: 0;
          }
          20% {
            opacity: 1;
          }
          100% {
            opacity: 1;
          }
        }

        @keyframes portalShrink {
          0% {
            transform: scale(1);
            opacity: 1;
          }
          50% {
            transform: scale(1.2);
            opacity: 1;
          }
          100% {
            transform: scale(0);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
};

export default AdminPortalDashboard;
