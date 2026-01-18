import { User } from "@supabase/supabase-js";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { Home } from "lucide-react";
import tldvLogo from "@/assets/tldv-logo.jpg";

interface AdminHeaderProps {
  user: User | null;
  showUserDetails?: boolean;
  showMainPortalButton?: boolean;
  title?: string;
}

const AdminHeader = ({ user, showUserDetails = true, showMainPortalButton = true, title = "Data & Employee Management Portal" }: AdminHeaderProps) => {
  const navigate = useNavigate();
  // Default to hidden until we know whether we're in a regular browser window.
  // This prevents the "PWA header doesn't auto-hide" issue when detection is delayed.
  const [isVisible, setIsVisible] = useState(false);
  const [isPWA, setIsPWA] = useState(false);

  useEffect(() => {
    // Detect if running as installed PWA
    const checkPWA = () => {
      const standaloneMedia = window.matchMedia('(display-mode: standalone)');
      const fullscreenMedia = window.matchMedia('(display-mode: fullscreen)');
      const isStandalone =
        standaloneMedia.matches ||
        fullscreenMedia.matches ||
        (window.navigator as any).standalone === true;

      console.log('PWA Detection:', {
        standalone: standaloneMedia.matches,
        fullscreen: fullscreenMedia.matches,
        navigatorStandalone: (window.navigator as any).standalone,
        isStandalone,
      });

      return isStandalone;
    };

    const isStandalone = checkPWA();
    setIsPWA(isStandalone);

    // In PWA mode we want it hidden by default; in browser mode show it.
    setIsVisible(!isStandalone);

    // Also listen for display mode changes
    const standaloneQuery = window.matchMedia('(display-mode: standalone)');
    const fullscreenQuery = window.matchMedia('(display-mode: fullscreen)');

    const handleChange = () => {
      const isPWANow = checkPWA();
      setIsPWA(isPWANow);
      setIsVisible(!isPWANow);
    };

    // Older Safari/Chromium variants can lack addEventListener on MediaQueryList
    if (standaloneQuery.addEventListener) {
      standaloneQuery.addEventListener('change', handleChange);
      fullscreenQuery.addEventListener('change', handleChange);
      return () => {
        standaloneQuery.removeEventListener('change', handleChange);
        fullscreenQuery.removeEventListener('change', handleChange);
      };
    }

    // Fallback
    // eslint-disable-next-line deprecation/deprecation
    standaloneQuery.addListener(handleChange);
    // eslint-disable-next-line deprecation/deprecation
    fullscreenQuery.addListener(handleChange);
    return () => {
      // eslint-disable-next-line deprecation/deprecation
      standaloneQuery.removeListener(handleChange);
      // eslint-disable-next-line deprecation/deprecation
      fullscreenQuery.removeListener(handleChange);
    };
  }, []);

  const handleMainPortal = () => {
    navigate("/admin/portal");
  };

  const handleMouseEnter = () => {
    if (isPWA) setIsVisible(true);
  };

  const handleMouseLeave = () => {
    if (isPWA) setIsVisible(false);
  };

  return (
    <>
      {/* Hover trigger zone - always visible at top */}
      {isPWA && (
        <div 
          className="fixed top-0 left-0 right-0 h-4 z-[60]"
          onMouseEnter={handleMouseEnter}
        />
      )}
      
      <header 
        className={`bg-black text-white py-4 border-b-4 border-red-600 sticky top-0 z-50 transition-all duration-300 ease-in-out ${
          isPWA ? (isVisible ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0') : ''
        }`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div className="container mx-auto px-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 group cursor-pointer transition-all duration-300 hover:animate-[pulse-glow_2s_ease-in-out_infinite]">
              <div className="h-12 w-12 rounded-full overflow-hidden flex-shrink-0">
                <img src={tldvLogo} alt="TLDV Logo" className="h-full w-full object-cover" />
              </div>
              <div>
                <h1 className="text-2xl font-bold font-poppins">{title}</h1>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {showUserDetails && (
                <div className="text-right hidden md:block">
                  <p className="text-sm font-medium">{user?.email}</p>
                  <p className="text-xs text-white/70">Administrator</p>
                </div>
              )}
              {showMainPortalButton && (
                <button
                  onClick={handleMainPortal}
                  className="bg-black border-[3px] border-red-600 text-white px-6 py-2 rounded-lg hover:border-red-500 hover:shadow-[0_0_60px_rgba(239,68,68,0.7)] transition-all duration-500 flex items-center gap-2 font-medium"
                >
                  <Home className="h-4 w-4" />
                  Main Portal
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <style>{`
        @keyframes pulse-glow {
          0%, 100% {
            filter: drop-shadow(0 0 10px rgba(239, 68, 68, 0.5));
          }
          50% {
            filter: drop-shadow(0 0 20px rgba(239, 68, 68, 0.9)) drop-shadow(0 0 30px rgba(239, 68, 68, 0.6));
          }
        }
      `}</style>
    </>
  );
};

export default AdminHeader;
