import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { FileText, Users, ClipboardCheck, Lock, FileCheck, GripVertical, ShieldCheck, Bug } from "lucide-react";
import { PermissionKey } from "@/hooks/usePermissions";
import { Badge } from "@/components/ui/badge";
import DebugDiagnosticsDialog from "@/components/admin/DebugDiagnosticsDialog";
import tldvLogo from "@/assets/tldv-logo-primary.png";
import preapplicheckLogo from "@/assets/preapplicheck-logo-mark.png";
import { useQuery } from "@tanstack/react-query";
import { usePermissions, PERMISSION_KEYS } from "@/hooks/usePermissions";
import { usePreAppliCheckedNotifications } from "@/hooks/usePreAppliCheckedNotifications";
import { useBadgeLastSeen } from "@/hooks/useBadgeLastSeen";
import { toast } from "sonner";

interface PortalCard {
  key: string;
  title: string;
  description: string;
  icon: any;
  path: string;
  color: string;
  badge: number | null;
  permissionKey: PermissionKey;
  requiresMasterAdmin: boolean;
}

const AdminPortalDashboard = () => {
  const navigate = useNavigate();
  
  const hasSeenAnimation = sessionStorage.getItem('portal_animation_played') === 'true';
  const cachedIsMasterAdmin = sessionStorage.getItem('user_is_master_admin') === 'true';
  const cachedUserName = sessionStorage.getItem('user_display_name') || "";
  
  const [isAnimating, setIsAnimating] = useState(!hasSeenAnimation);
  const [isExiting, setIsExiting] = useState(false);
  const [userName, setUserName] = useState(cachedUserName);
  const [isMasterAdmin, setIsMasterAdmin] = useState(cachedIsMasterAdmin);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [orderedPortals, setOrderedPortals] = useState<PortalCard[]>([]);
  const [portalsInitialized, setPortalsInitialized] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [authResolved, setAuthResolved] = useState(false);

  const {
    hasPermission,
    checkAccessWithNotification,
    isLoading: permissionsLoading,
    isMasterAdmin: permissionsMasterAdmin,
  } = usePermissions(currentUserId);

  const hasFullAccess = isMasterAdmin || permissionsMasterAdmin;

  // Per-user "last seen" trackers so badges clear once the admin opens the relevant portal,
  // even if the underlying records are still in their pending state.
  const { lastSeen: pendingPolygraphLastSeen, markSeen: markPendingPolygraphSeen } =
    useBadgeLastSeen(currentUserId, "pending-polygraph-review");

  const { data: pendingPolygraphCount } = useQuery({
    queryKey: ['pending-polygraph-count', pendingPolygraphLastSeen],
    queryFn: async () => {
      const { count } = await supabase
        .from('pending_polygraph_uploads')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending')
        .gt('created_at', pendingPolygraphLastSeen);
      return count || 0;
    },
    enabled: isMasterAdmin
  });

  // Per-admin unread count for newly-approved PreAppliCheck applications.
  // Toast surfaces here (the dashboard) so admins are alerted regardless of which portal they're in next.
  const { unreadCount: preAppliCheckedUnread, markSeen: markPreAppliCheckedSeen } =
    usePreAppliCheckedNotifications(currentUserId, { showToast: true });

  // Fetch saved card order
  const { data: savedOrder } = useQuery({
    queryKey: ['portal-card-order'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('portal_card_order')
        .select('card_key, sort_order')
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  // Build the base portals list using useMemo to avoid unnecessary rebuilds
  const allPortals: PortalCard[] = useMemo(() => [
    {
      key: "polygraph-vetting",
      title: "Appointments",
      description: "View and manage polygraph appointments",
      icon: ClipboardCheck,
      path: "/admin/polygraph-vetting",
      color: "from-red-600/10 via-red-500/5 to-transparent hover:from-red-600/20 hover:via-red-500/10",
      badge: null,
      permissionKey: PERMISSION_KEYS.PORTAL_POLYGRAPH_VETTING,
      requiresMasterAdmin: false
    },
    {
      key: "reports-accounts",
      title: "Polygraph Reports",
      description: "Upload, review, and manage polygraph reports",
      icon: FileText,
      path: "/admin/reports-accounts",
      color: "from-red-600/10 via-red-500/5 to-transparent hover:from-red-600/20 hover:via-red-500/10",
      badge: null,
      permissionKey: PERMISSION_KEYS.PORTAL_REPORTS_ACCOUNTS,
      requiresMasterAdmin: false
    },
    {
      key: "profile-management",
      title: "Profile Management",
      description: "Create and manage admin profiles",
      icon: Users,
      path: "/admin/profile-management",
      color: "from-red-600/10 via-red-500/5 to-transparent hover:from-red-600/20 hover:via-red-500/10",
      badge: null,
      permissionKey: PERMISSION_KEYS.PORTAL_PROFILE_MANAGEMENT,
      requiresMasterAdmin: true
    },
    {
      key: "candex-pre-screening",
      title: "PreAppliCheck",
      description: "Pre-employment screening and applicant checks",
      icon: ShieldCheck,
      path: "/admin/candex-pre-screening",
      color: "from-red-600/10 via-red-500/5 to-transparent hover:from-red-600/20 hover:via-red-500/10",
      badge: preAppliCheckedUnread > 0 ? preAppliCheckedUnread : null,
      permissionKey: PERMISSION_KEYS.PORTAL_CANDEX_PRE_SCREENING,
      requiresMasterAdmin: false
    },
    {
      key: "pending-polygraph-review",
      title: "Pending Polygraph Review",
      description: "Review and approve polygraph report uploads",
      icon: FileCheck,
      path: "/admin/pending-polygraph-review",
      color: "from-red-600/10 via-red-500/5 to-transparent hover:from-red-600/20 hover:via-red-500/10",
      badge: pendingPolygraphCount || null,
      permissionKey: PERMISSION_KEYS.PORTAL_PROFILE_MANAGEMENT,
      requiresMasterAdmin: true
    }
  ], [pendingPolygraphCount, preAppliCheckedUnread]);

  // Compute ordered portals whenever dependencies change
  useEffect(() => {
    const preAppliCheckKey = "candex-pre-screening";

    const visiblePortals = allPortals.filter((portal) => !portal.requiresMasterAdmin || hasFullAccess);

    console.log("[Portal Debug] hasFullAccess:", hasFullAccess, "| allPortals:", allPortals.length, "| visiblePortals:", visiblePortals.length);
    console.log("[Portal Debug] PreAppliCheck in allPortals:", allPortals.some((portal) => portal.key === preAppliCheckKey));
    console.log("[Portal Debug] PreAppliCheck in visiblePortals:", visiblePortals.some((portal) => portal.key === preAppliCheckKey));

    if (savedOrder && savedOrder.length > 0) {
      const orderMap = new Map(savedOrder.map((item) => [item.card_key, item.sort_order]));
      const maxSavedOrder = Math.max(...savedOrder.map((item) => item.sort_order), -1);
      let nextFallback = maxSavedOrder + 1;
      const fallbackMap = new Map<string, number>();

      visiblePortals.forEach((portal) => {
        if (!orderMap.has(portal.key)) {
          fallbackMap.set(portal.key, nextFallback++);
        }
      });

      visiblePortals.sort((a, b) => {
        const orderA = orderMap.get(a.key) ?? fallbackMap.get(a.key) ?? 999;
        const orderB = orderMap.get(b.key) ?? fallbackMap.get(b.key) ?? 999;
        return orderA - orderB;
      });
    }

    const preAppliCheckPortal = visiblePortals.find((portal) => portal.key === preAppliCheckKey)
      ?? allPortals.find((portal) => portal.key === preAppliCheckKey);

    const remainingPortals = visiblePortals.filter((portal) => portal.key !== preAppliCheckKey);
    const newPortals = preAppliCheckPortal ? [preAppliCheckPortal, ...remainingPortals] : visiblePortals;

    console.log("[Portal Debug] Final orderedPortals:", newPortals.map((portal) => portal.key));

    setOrderedPortals(newPortals);
    setPortalsInitialized(true);
  }, [hasFullAccess, allPortals, savedOrder]);

  useEffect(() => {
    const checkAuth = async () => {
      try {
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
          .in("role", ["admin", "master_admin", "examiner"]);

        if (!roleData || roleData.length === 0) {
          await supabase.auth.signOut();
          navigate("/admin/login");
          return;
        }

        const isExaminer = roleData.some((role) => role.role === "examiner");
        const isAdminOrMaster = roleData.some((role) => role.role === "admin" || role.role === "master_admin");
        if (isExaminer && !isAdminOrMaster) {
          navigate("/examiner");
          return;
        }

        const isMaster = roleData.some((role) => role.role === "master_admin");
        setIsMasterAdmin(isMaster);
        sessionStorage.setItem('user_is_master_admin', isMaster ? 'true' : 'false');

        const { data: profileData } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", session.user.id)
          .single();

        if (profileData?.full_name) {
          setUserName(profileData.full_name);
          sessionStorage.setItem('user_display_name', profileData.full_name);
        }
      } catch (error) {
        console.error("[Portal Debug] Failed to resolve auth state:", error);
      } finally {
        setAuthResolved(true);
      }
    };

    checkAuth();

    if (!hasSeenAnimation) {
      const timer = setTimeout(() => {
        setIsAnimating(false);
        sessionStorage.setItem('portal_animation_played', 'true');
      }, 6500);
      return () => clearTimeout(timer);
    }
  }, [navigate, hasSeenAnimation]);

  const handleSignOut = async () => {
    setIsExiting(true);
    sessionStorage.removeItem('portal_animation_played');
    sessionStorage.removeItem('user_is_master_admin');
    sessionStorage.removeItem('user_display_name');
    
    setTimeout(async () => {
      await supabase.auth.signOut();
      navigate("/admin/login");
    }, 2000);
  };

  // Only block on auth + portal init. Don't block on permissions — cards render with lock icons until access resolves.
  const isStillLoadingAccess = !authResolved || !currentUserId || !portalsInitialized;

  const handlePortalClick = (portal: PortalCard) => {
    if (isStillLoadingAccess) {
      return;
    }

    // Clear the per-user badge as soon as the admin opens the portal.
    if (portal.key === "pending-polygraph-review") {
      markPendingPolygraphSeen();
    } else if (portal.key === "candex-pre-screening") {
      markPreAppliCheckedSeen();
    }

    if (hasFullAccess) {
      navigate(portal.path);
      return;
    }

    if (checkAccessWithNotification(portal.permissionKey, portal.title)) {
      navigate(portal.path);
    }
  };

  // Drag and drop handlers (master admin only)
  const handleDragStart = (e: React.DragEvent, index: number) => {
    if (!isMasterAdmin) return;
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    // Make the drag image semi-transparent
    if (e.currentTarget instanceof HTMLElement) {
      e.dataTransfer.setDragImage(e.currentTarget, e.currentTarget.offsetWidth / 2, e.currentTarget.offsetHeight / 2);
    }
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (!isMasterAdmin || draggedIndex === null) return;
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = async (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (!isMasterAdmin || draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const newOrder = [...orderedPortals];
    const [draggedItem] = newOrder.splice(draggedIndex, 1);
    newOrder.splice(dropIndex, 0, draggedItem);
    setOrderedPortals(newOrder);
    setDraggedIndex(null);
    setDragOverIndex(null);

    // Persist the new order
    try {
      // Upsert all card orders
      const upsertData = newOrder.map((portal, idx) => ({
        card_key: portal.key,
        sort_order: idx,
        updated_at: new Date().toISOString(),
        updated_by: currentUserId,
      }));

      for (const item of upsertData) {
        const { error } = await supabase
          .from('portal_card_order')
          .upsert(item, { onConflict: 'card_key' });
        if (error) throw error;
      }

      toast.success("Card order saved");
    } catch (error) {
      console.error("Failed to save card order:", error);
      toast.error("Failed to save card order");
    }
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

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

        <div 
          className="absolute inset-0 flex flex-col items-center justify-center px-4"
          style={{
            animation: isAnimating ? 'logoSequence 4.5s ease-in-out 2s both' : 'none',
          }}
        >
          <img 
            src={tldvLogo} 
            alt="TLDV Logo" 
            className="w-3/4 sm:w-1/2 max-w-2xl object-contain"
          />
          {userName && (
            <h2 className="text-xl sm:text-2xl md:text-3xl font-semibold text-red-500 mt-4 sm:mt-8 tracking-wide text-center">
              Welcome, {userName}
            </h2>
          )}
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mt-2 sm:mt-4 tracking-wider text-center">
            Management Portal
          </h1>
          <p className="text-base sm:text-lg md:text-xl text-gray-400 mt-3 sm:mt-6 italic text-center">
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
          className="absolute inset-0 flex items-center justify-center px-4"
          style={{ 
            animation: isExiting ? 'portalExit 2s ease-in-out forwards' : 'none',
          }}
        >
          <div className="relative">
            <div 
              className="w-48 h-48 sm:w-72 sm:h-72 md:w-96 md:h-96 rounded-full border-4 border-red-600"
              style={{
                boxShadow: '0 0 60px rgba(239,68,68,0.8), inset 0 0 60px rgba(239,68,68,0.5)',
                animation: isExiting ? 'portalShrink 2s ease-in-out forwards' : 'none',
              }}
            />
            <p className="absolute inset-0 flex items-center justify-center text-white text-lg sm:text-xl md:text-2xl font-bold">
              Exiting Portal...
            </p>
          </div>
        </div>
      </div>

      {/* Main Content - Portals */}
      <div className={`min-h-screen flex items-center justify-center py-6 sm:py-8 pb-12 ${
        !hasSeenAnimation ? "transition-all duration-1000" : ""
      } ${isAnimating ? "opacity-0" : "opacity-100"}`}>
        <div className="container mx-auto px-3 sm:px-4 max-w-6xl relative">
          <div className="absolute top-2 sm:top-0 right-2 sm:right-4 flex gap-2 sm:gap-3">
            <button
              onClick={() => setDebugOpen(true)}
              className="px-2 sm:px-3 py-2 sm:py-3 text-sm bg-gray-800/50 border-2 border-gray-700 text-gray-400 rounded-lg hover:bg-gray-700/50 hover:text-white transition-all duration-300"
              title="System Diagnostics"
            >
              <Bug className="w-4 h-4" />
            </button>
            <button
              onClick={handleSignOut}
              className="px-3 sm:px-6 py-2 sm:py-3 text-sm sm:text-base bg-red-600/20 border-2 border-red-600 text-white rounded-lg hover:bg-red-600/40 hover:shadow-[0_0_20px_rgba(239,68,68,0.6)] transition-all duration-300"
            >
              Sign Out
            </button>
          </div>
          
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white text-center mb-6 sm:mb-8 md:mb-12 mt-12 sm:mt-8">
            {hasFullAccess ? "Master Profile - Portal Selection" : "Portal Selection"}
          </h1>

          {hasFullAccess && (
            <p className="text-center text-xs text-gray-500 mb-3 -mt-4">
              Drag cards to reorder — changes apply to all profiles
            </p>
          )}

          {isStillLoadingAccess ? (
            <div className="flex min-h-[16rem] items-center justify-center rounded-xl border-2 border-gray-800 bg-black/60">
              <div className="text-center">
                <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-b-2 border-primary" />
                <p className="text-sm text-gray-400">Loading portal access...</p>
              </div>
            </div>
          ) : (
          <div className={`grid grid-cols-1 sm:grid-cols-2 ${hasFullAccess ? 'xl:grid-cols-4' : 'lg:grid-cols-3'} gap-3 sm:gap-4 md:gap-6`}>
            {orderedPortals.map((portal, index) => {
              const hasAccess = hasFullAccess || hasPermission(portal.permissionKey);
              
              return (
                <Card
                  key={portal.key}
                  draggable={hasFullAccess}
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, index)}
                  onDragEnd={handleDragEnd}
                  onClick={() => handlePortalClick(portal)}
                  className={`p-3 sm:p-5 md:p-8 cursor-pointer transition-all duration-500 hover:scale-105 bg-black border-2 sm:border-[3px] ${
                    hasAccess 
                      ? 'border-red-600 hover:border-red-500 hover:shadow-[0_0_40px_rgba(239,68,68,0.5)]' 
                      : 'border-gray-600 hover:border-gray-500'
                  } relative ${
                    draggedIndex === index ? 'opacity-40 scale-95' : ''
                  } ${
                    dragOverIndex === index && draggedIndex !== index ? 'ring-2 ring-red-400 ring-offset-2 ring-offset-black' : ''
                  }`}
                >
                  {hasFullAccess && (
                    <div className="absolute top-1 left-1/2 -translate-x-1/2 cursor-grab active:cursor-grabbing">
                      <GripVertical className="w-4 h-4 text-gray-600 hover:text-gray-400 transition-colors" />
                    </div>
                  )}
                  {portal.badge !== null && portal.badge !== undefined && portal.badge > 0 && (
                    <Badge className="absolute top-2 right-2 sm:top-4 sm:right-4 bg-red-600 text-white text-xs">
                      {portal.badge}
                    </Badge>
                  )}
                  {!hasAccess && (
                    <div className="absolute top-2 left-2 sm:top-4 sm:left-4">
                      <Lock className="w-3 h-3 sm:w-5 sm:h-5 text-gray-500" />
                    </div>
                  )}
                  <div className="flex flex-col items-center text-center space-y-2 sm:space-y-3 md:space-y-4">
                    {portal.key === "candex-pre-screening" ? (
                      <div className={`p-2 sm:p-3 md:p-4 rounded-full border-2 shadow-[0_0_20px_rgba(239,68,68,0.4)] ${
                        hasAccess ? 'bg-white border-red-600' : 'bg-gray-600/30 border-gray-600'
                      }`}>
                        <img src={preapplicheckLogo} alt="PreAppliCheck" className="w-14 h-14 sm:w-20 sm:h-20 md:w-28 md:h-28 object-contain" />
                      </div>
                    ) : (
                      <div className={`p-3 sm:p-4 md:p-6 rounded-full border-2 shadow-[0_0_20px_rgba(239,68,68,0.4)] ${
                        hasAccess 
                          ? 'bg-red-600/30 border-red-600' 
                          : 'bg-gray-600/30 border-gray-600'
                      }`}>
                        <portal.icon className={`w-8 h-8 sm:w-10 sm:h-10 md:w-16 md:h-16 ${hasAccess ? 'text-red-500' : 'text-gray-500'}`} strokeWidth={2.5} />
                      </div>
                    )}
                    <h2 className={`text-sm sm:text-lg md:text-2xl font-bold leading-tight ${hasAccess ? 'text-white' : 'text-gray-500'}`}>
                      {portal.title}
                    </h2>
                    <p className={`text-xs sm:text-sm hidden sm:block ${hasAccess ? 'text-gray-300' : 'text-gray-600'}`}>
                      {portal.description}
                    </p>
                    {!hasAccess && (
                      <p className="text-[10px] sm:text-xs text-yellow-500/80 italic hidden sm:block">
                        Contact Master Admin for access
                      </p>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes scanline {
          0% { transform: translateX(-100vw); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateX(100vw); opacity: 0; }
        }
        @keyframes logoSequence {
          0% { opacity: 0; transform: scale(0.95); }
          10% { opacity: 1; transform: scale(1); }
          80% { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(1.05); }
        }
        @keyframes portalExit {
          0% { opacity: 0; }
          20% { opacity: 1; }
          100% { opacity: 1; }
        }
        @keyframes portalShrink {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.2); opacity: 1; }
          100% { transform: scale(0); opacity: 0; }
        }
      `}</style>

      <DebugDiagnosticsDialog open={debugOpen} onOpenChange={setDebugOpen} />
    </div>
  );
};

export default AdminPortalDashboard;
