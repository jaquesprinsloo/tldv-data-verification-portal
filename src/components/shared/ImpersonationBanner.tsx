import { useNavigate } from "react-router-dom";
import { AlertTriangle, X } from "lucide-react";
import { useImpersonation, stopImpersonation } from "@/hooks/useImpersonation";

/**
 * Persistent banner shown at the top of every page while a master admin
 * is viewing the portal as another user. Clicking Exit clears the
 * impersonation session and returns to Profile Management.
 */
export const ImpersonationBanner = () => {
  const target = useImpersonation();
  const navigate = useNavigate();

  if (!target) return null;

  const roleLabel =
    target.role === "master_admin"
      ? "Master Admin"
      : target.role === "examiner"
      ? "Examiner"
      : "Admin";

  const handleExit = async () => {
    await stopImpersonation();
    // Full navigation so every query/hook remounts under the real user id.
    window.location.href = "/admin/profile-management";
  };

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[100] bg-red-600 text-white shadow-lg"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 px-4 py-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="truncate">
            Viewing as <strong>{target.fullName || target.email}</strong>{" "}
            <span className="opacity-80">({roleLabel})</span> — all data is what
            this user would see. Actions are still logged under your master account.
          </span>
        </div>
        <button
          onClick={handleExit}
          className="inline-flex items-center gap-1 rounded bg-white/20 hover:bg-white/30 px-3 py-1 text-xs font-semibold transition-colors"
        >
          <X className="h-3 w-3" /> Exit view
        </button>
      </div>
    </div>
  );
};

export default ImpersonationBanner;
