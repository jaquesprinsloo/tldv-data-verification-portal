import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle, XCircle, AlertTriangle, RefreshCw, Bug, Copy, Shield } from "lucide-react";
import { toast } from "sonner";
import { PERMISSION_KEYS, PERMISSION_LABELS, type PermissionKey } from "@/hooks/usePermissions";

interface DiagnosticResult {
  label: string;
  status: "pass" | "fail" | "warn";
  detail: string;
}

interface DebugDiagnosticsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DebugDiagnosticsDialog = ({ open, onOpenChange }: DebugDiagnosticsDialogProps) => {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<DiagnosticResult[]>([]);
  const [userInfo, setUserInfo] = useState<any>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [accountAccess, setAccountAccess] = useState<any[]>([]);

  const runDiagnostics = async () => {
    setRunning(true);
    const diagnostics: DiagnosticResult[] = [];

    try {
      // 1. Check authentication
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (!session) {
        diagnostics.push({ label: "Authentication", status: "fail", detail: "No active session found. User is not logged in." });
        setResults(diagnostics);
        setRunning(false);
        return;
      }
      diagnostics.push({ label: "Authentication", status: "pass", detail: `Logged in as ${session.user.email} (${session.user.id.substring(0, 8)}...)` });
      setUserInfo({ email: session.user.email, id: session.user.id, created: session.user.created_at });

      // 2. Check profile
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .maybeSingle();

      if (profileError) {
        diagnostics.push({ label: "Profile Access", status: "fail", detail: `Error: ${profileError.message}` });
      } else if (!profile) {
        diagnostics.push({ label: "Profile Access", status: "fail", detail: "No profile found for this user. The profile trigger may have failed." });
      } else {
        diagnostics.push({ label: "Profile Access", status: "pass", detail: `Profile: ${profile.full_name || "No name"} (${profile.email})` });
      }

      // 3. Check roles
      const { data: roleData, error: roleError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id);

      let userRoles: string[] = [];

      if (roleError) {
        diagnostics.push({ label: "Role Access", status: "fail", detail: `Error reading roles: ${roleError.message}` });
      } else if (!roleData || roleData.length === 0) {
        diagnostics.push({ label: "Role Access", status: "fail", detail: "No roles assigned. This user cannot access any portal." });
      } else {
        userRoles = roleData.map((role) => role.role);
        setRoles(userRoles);
        diagnostics.push({ label: "Role Access", status: "pass", detail: `Roles: ${userRoles.join(", ")}` });

        if (userRoles.includes("master_admin")) {
          diagnostics.push({ label: "Master Admin", status: "pass", detail: "Full access to all features." });
        }
        if (userRoles.includes("examiner") && !userRoles.includes("admin") && !userRoles.includes("master_admin")) {
          diagnostics.push({ label: "Examiner Only", status: "warn", detail: "This user will be redirected to the Examiner Portal. They cannot access the Admin Portal." });
        }
      }

      // 4. Check permissions
      const { data: permData, error: permError } = await supabase
        .from("user_permissions")
        .select("permission_key, granted")
        .eq("user_id", session.user.id);

      if (permError) {
        diagnostics.push({ label: "Permissions", status: "fail", detail: `Error reading permissions: ${permError.message}` });
      } else {
        const perms: Record<string, boolean> = {};
        permData?.forEach((permission) => {
          perms[permission.permission_key] = permission.granted;
        });
        setPermissions(perms);

        const grantedCount = Object.values(perms).filter(Boolean).length;
        const totalKeys = Object.keys(PERMISSION_KEYS).length;
        const isMasterAdmin = userRoles.includes("master_admin");

        if (isMasterAdmin) {
          diagnostics.push({ label: "Permissions", status: "pass", detail: `Master admin has all ${totalKeys} permissions implicitly.` });
        } else if (grantedCount === 0) {
          diagnostics.push({ label: "Permissions", status: "warn", detail: "No permissions granted. All portal cards will show as locked." });
        } else {
          diagnostics.push({ label: "Permissions", status: "pass", detail: `${grantedCount} of ${totalKeys} permissions granted.` });
        }

        const portalPerms = [
          { key: PERMISSION_KEYS.PORTAL_DATA_MANAGEMENT, name: "Data Management" },
          { key: PERMISSION_KEYS.PORTAL_POLYGRAPH_VETTING, name: "Appointments" },
          { key: PERMISSION_KEYS.PORTAL_REPORTS_ACCOUNTS, name: "Polygraph Reports" },
          { key: PERMISSION_KEYS.PORTAL_CANDEX_PRE_SCREENING, name: "PreAppliCheck" },
          { key: PERMISSION_KEYS.PORTAL_PROFILE_MANAGEMENT, name: "Profile Management" },
        ];

        for (const portalPermission of portalPerms) {
          const granted = isMasterAdmin || perms[portalPermission.key] === true;
          diagnostics.push({
            label: `Portal: ${portalPermission.name}`,
            status: granted ? "pass" : "warn",
            detail: granted ? (isMasterAdmin ? "Access granted via master admin role" : "Access granted") : "No access — card will show locked icon",
          });
        }
      }

      // 5. Check account access
      const { data: accessData, error: accessError } = await supabase
        .from("account_access")
        .select("account_id, accounts(name, code)")
        .eq("user_id", session.user.id);

      if (accessError) {
        diagnostics.push({ label: "Account Access", status: "fail", detail: `Error: ${accessError.message}` });
      } else {
        setAccountAccess(accessData || []);
        if (!accessData || accessData.length === 0) {
          diagnostics.push({ label: "Account Access", status: "warn", detail: "No accounts assigned. Features requiring account context may not work." });
        } else {
          diagnostics.push({ label: "Account Access", status: "pass", detail: `Access to ${accessData.length} account(s)` });
        }
      }

      // 6. Check storage buckets
      const buckets = ["polygraph-reports", "employee-documents", "candex-videos"];
      for (const bucket of buckets) {
        const { data: listData, error: listError } = await supabase.storage
          .from(bucket)
          .list("", { limit: 1 });
        if (listError) {
          diagnostics.push({ label: `Storage: ${bucket}`, status: "warn", detail: `Cannot access: ${listError.message}` });
        } else {
          diagnostics.push({ label: `Storage: ${bucket}`, status: "pass", detail: "Accessible" });
        }
      }

    } catch (err: any) {
      diagnostics.push({ label: "Unexpected Error", status: "fail", detail: err.message });
    }

    setResults(diagnostics);
    setRunning(false);
  };

  useEffect(() => {
    if (open) {
      runDiagnostics();
    }
  }, [open]);

  const copyReport = () => {
    const lines = results.map(r => `[${r.status.toUpperCase()}] ${r.label}: ${r.detail}`);
    if (userInfo) {
      lines.unshift(`User: ${userInfo.email} | ID: ${userInfo.id}`);
      lines.unshift(`Timestamp: ${new Date().toISOString()}`);
    }
    navigator.clipboard.writeText(lines.join("\n"));
    toast.success("Diagnostic report copied to clipboard");
  };

  const statusIcon = (status: DiagnosticResult["status"]) => {
    switch (status) {
      case "pass": return <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />;
      case "fail": return <XCircle className="w-4 h-4 text-red-500 shrink-0" />;
      case "warn": return <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] bg-black border-red-600 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-500">
            <Bug className="w-5 h-5" />
            System Diagnostics
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            Run checks on authentication, roles, permissions, and data access.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 mb-3">
          <Button
            onClick={runDiagnostics}
            disabled={running}
            variant="outline"
            size="sm"
            className="border-red-600 text-red-400 hover:bg-red-600/20"
          >
            <RefreshCw className={`w-4 h-4 mr-1 ${running ? "animate-spin" : ""}`} />
            {running ? "Running..." : "Re-run"}
          </Button>
          <Button
            onClick={copyReport}
            disabled={results.length === 0}
            variant="outline"
            size="sm"
            className="border-gray-600 text-gray-400 hover:bg-gray-600/20"
          >
            <Copy className="w-4 h-4 mr-1" />
            Copy Report
          </Button>
        </div>

        <ScrollArea className="h-[55vh]">
          <div className="space-y-2 pr-4">
            {results.map((r, i) => (
              <div
                key={i}
                className={`flex items-start gap-3 p-2.5 rounded-lg border ${
                  r.status === "fail" ? "border-red-800 bg-red-950/30" :
                  r.status === "warn" ? "border-yellow-800 bg-yellow-950/20" :
                  "border-gray-800 bg-gray-900/30"
                }`}
              >
                {statusIcon(r.status)}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-200">{r.label}</p>
                  <p className="text-xs text-gray-400 break-words">{r.detail}</p>
                </div>
              </div>
            ))}

            {results.length === 0 && !running && (
              <p className="text-gray-500 text-center py-8">Click "Re-run" to start diagnostics</p>
            )}
            {running && (
              <p className="text-gray-400 text-center py-8 animate-pulse">Running diagnostics...</p>
            )}
          </div>

          {accountAccess.length > 0 && (
            <>
              <Separator className="my-4 bg-gray-800" />
              <div>
                <h4 className="text-sm font-medium text-gray-300 mb-2 flex items-center gap-1">
                  <Shield className="w-4 h-4" /> Assigned Accounts
                </h4>
                <div className="space-y-1">
                  {accountAccess.map((a: any) => (
                    <div key={a.account_id} className="text-xs text-gray-400 flex items-center gap-2 p-1.5 bg-gray-900/30 rounded">
                      <Badge variant="outline" className="border-gray-700 text-gray-400 text-[10px]">
                        {(a.accounts as any)?.code}
                      </Badge>
                      {(a.accounts as any)?.name}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default DebugDiagnosticsDialog;
