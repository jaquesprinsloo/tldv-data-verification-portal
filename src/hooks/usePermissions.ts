import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Permission keys for the application
export const PERMISSION_KEYS = {
  // Portal cards access
  PORTAL_DATA_MANAGEMENT: "portal.data_management",
  PORTAL_POLYGRAPH_VETTING: "portal.polygraph_vetting",
  PORTAL_REPORTS_ACCOUNTS: "portal.reports_accounts",
  PORTAL_PROFILE_MANAGEMENT: "portal.profile_management",
  
  // Reports & Accounts permissions
  ACCOUNTS_SELECT_ACCOUNTS: "accounts.select_accounts",
  ACCOUNTS_VIEW_SUB_ACCOUNTS: "accounts.view_sub_accounts",
  ACCOUNTS_ADD_ACCOUNTS: "accounts.add_accounts",
  ACCOUNTS_VIEW_REPORTS: "accounts.view_reports",
  ACCOUNTS_BATCHES: "accounts.batches",
  ACCOUNTS_BATCH_UPLOAD: "accounts.batch_upload",
  ACCOUNTS_SINGLE_UPLOAD: "accounts.single_upload",
  ACCOUNTS_STATISTICS: "accounts.statistics",
  ACCOUNTS_ACCOUNT_OVERVIEW: "accounts.account_overview",
  ACCOUNTS_EXPENSE_BREAKDOWN: "accounts.expense_breakdown",
  ACCOUNTS_INVOICES: "accounts.invoices",
  
  // Data Management permissions
  DATA_VIEW_EMPLOYEES: "data.view_employees",
  DATA_ADD_EMPLOYEES: "data.add_employees",
  DATA_EDIT_EMPLOYEES: "data.edit_employees",
  DATA_DELETE_EMPLOYEES: "data.delete_employees",
  DATA_VIEW_SUBMISSIONS: "data.view_submissions",
  DATA_MANAGE_INVITATIONS: "data.manage_invitations",
  DATA_MANAGE_STORES: "data.manage_stores",
  
  // Polygraph & Vetting permissions
  POLYGRAPH_VIEW_BOOKINGS: "polygraph.view_bookings",
  POLYGRAPH_CREATE_BOOKINGS: "polygraph.create_bookings",
} as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[keyof typeof PERMISSION_KEYS];

export const PERMISSION_LABELS: Record<PermissionKey, { label: string; description: string; category: string }> = {
  // Portal cards
  [PERMISSION_KEYS.PORTAL_DATA_MANAGEMENT]: {
    label: "Data Management Portal",
    description: "Access to the Data Management portal card",
    category: "Portal Access",
  },
  [PERMISSION_KEYS.PORTAL_POLYGRAPH_VETTING]: {
    label: "Polygraph & Vetting Portal",
    description: "Access to the Polygraph & Vetting portal card",
    category: "Portal Access",
  },
  [PERMISSION_KEYS.PORTAL_REPORTS_ACCOUNTS]: {
    label: "Reports & Accounts Portal",
    description: "Access to the Reports & Accounts portal card",
    category: "Portal Access",
  },
  [PERMISSION_KEYS.PORTAL_PROFILE_MANAGEMENT]: {
    label: "Profile Management Portal",
    description: "Access to the Profile Management portal card (Master Admin only)",
    category: "Portal Access",
  },
  
  // Reports & Accounts
  [PERMISSION_KEYS.ACCOUNTS_SELECT_ACCOUNTS]: {
    label: "Select Accounts for Reports",
    description: "Select main and sub-accounts when loading reports (no access to account details)",
    category: "Reports & Accounts",
  },
  [PERMISSION_KEYS.ACCOUNTS_VIEW_SUB_ACCOUNTS]: {
    label: "View Sub Account Details",
    description: "View detailed sub-account/store information and dashboards",
    category: "Reports & Accounts",
  },
  [PERMISSION_KEYS.ACCOUNTS_ADD_ACCOUNTS]: {
    label: "Add Accounts",
    description: "Create new accounts and sub-accounts",
    category: "Reports & Accounts",
  },
  [PERMISSION_KEYS.ACCOUNTS_VIEW_REPORTS]: {
    label: "View Reports",
    description: "View polygraph and risk assessment reports",
    category: "Reports & Accounts",
  },
  [PERMISSION_KEYS.ACCOUNTS_BATCHES]: {
    label: "Batches",
    description: "View and manage report batches",
    category: "Reports & Accounts",
  },
  [PERMISSION_KEYS.ACCOUNTS_BATCH_UPLOAD]: {
    label: "Batch Upload",
    description: "Upload multiple documents at once",
    category: "Reports & Accounts",
  },
  [PERMISSION_KEYS.ACCOUNTS_SINGLE_UPLOAD]: {
    label: "Single Upload",
    description: "Upload individual documents",
    category: "Reports & Accounts",
  },
  [PERMISSION_KEYS.ACCOUNTS_STATISTICS]: {
    label: "Statistics",
    description: "View examination and assessment statistics",
    category: "Reports & Accounts",
  },
  [PERMISSION_KEYS.ACCOUNTS_ACCOUNT_OVERVIEW]: {
    label: "Account Overview",
    description: "View account overview dashboards",
    category: "Reports & Accounts",
  },
  [PERMISSION_KEYS.ACCOUNTS_EXPENSE_BREAKDOWN]: {
    label: "Expense Breakdown",
    description: "View expense breakdown and charts",
    category: "Reports & Accounts",
  },
  [PERMISSION_KEYS.ACCOUNTS_INVOICES]: {
    label: "Invoices",
    description: "View and manage invoices",
    category: "Reports & Accounts",
  },
  
  // Data Management
  [PERMISSION_KEYS.DATA_VIEW_EMPLOYEES]: {
    label: "View Employees",
    description: "View employee records and profiles",
    category: "Data Management",
  },
  [PERMISSION_KEYS.DATA_ADD_EMPLOYEES]: {
    label: "Add Employees",
    description: "Create new employee records",
    category: "Data Management",
  },
  [PERMISSION_KEYS.DATA_EDIT_EMPLOYEES]: {
    label: "Edit Employees",
    description: "Modify employee records",
    category: "Data Management",
  },
  [PERMISSION_KEYS.DATA_DELETE_EMPLOYEES]: {
    label: "Delete Employees",
    description: "Remove employee records",
    category: "Data Management",
  },
  [PERMISSION_KEYS.DATA_VIEW_SUBMISSIONS]: {
    label: "View Submissions",
    description: "View employee submissions",
    category: "Data Management",
  },
  [PERMISSION_KEYS.DATA_MANAGE_INVITATIONS]: {
    label: "Manage Invitations",
    description: "Create and manage employee invitations",
    category: "Data Management",
  },
  [PERMISSION_KEYS.DATA_MANAGE_STORES]: {
    label: "Manage Stores",
    description: "Create and manage stores",
    category: "Data Management",
  },
  
  // Polygraph & Vetting
  [PERMISSION_KEYS.POLYGRAPH_VIEW_BOOKINGS]: {
    label: "View Bookings",
    description: "View polygraph bookings and history",
    category: "Polygraph & Vetting",
  },
  [PERMISSION_KEYS.POLYGRAPH_CREATE_BOOKINGS]: {
    label: "Create Bookings",
    description: "Create new polygraph bookings",
    category: "Polygraph & Vetting",
  },
};

export const usePermissions = (userId?: string) => {
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isMasterAdmin, setIsMasterAdmin] = useState(false);

  const fetchPermissions = useCallback(async () => {
    if (!userId) {
      setIsLoading(false);
      return;
    }

    try {
      // Check if user is master admin
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "master_admin")
        .maybeSingle();

      const isMaster = !!roleData;
      setIsMasterAdmin(isMaster);

      // If master admin, they have all permissions
      if (isMaster) {
        const allPermissions: Record<string, boolean> = {};
        Object.values(PERMISSION_KEYS).forEach((key) => {
          allPermissions[key] = true;
        });
        setPermissions(allPermissions);
        setIsLoading(false);
        return;
      }

      // Fetch user permissions
      const { data: permData, error } = await supabase
        .from("user_permissions")
        .select("permission_key, granted")
        .eq("user_id", userId);

      if (error) throw error;

      const userPermissions: Record<string, boolean> = {};
      permData?.forEach((p) => {
        userPermissions[p.permission_key] = p.granted;
      });

      setPermissions(userPermissions);
    } catch (error) {
      console.error("Error fetching permissions:", error);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  const hasPermission = useCallback(
    (permissionKey: PermissionKey): boolean => {
      if (isMasterAdmin) return true;
      return permissions[permissionKey] === true;
    },
    [permissions, isMasterAdmin]
  );

  const checkAccessWithNotification = useCallback(
    (permissionKey: PermissionKey, featureName: string): boolean => {
      if (isMasterAdmin) return true;
      
      const hasAccess = permissions[permissionKey] === true;
      
      if (!hasAccess) {
        toast.error(`Access Denied`, {
          description: `Your profile does not have access to "${featureName}". Please contact the Master Admin to request access.`,
          duration: 5000,
        });
      }
      
      return hasAccess;
    },
    [permissions, isMasterAdmin]
  );

  return {
    permissions,
    isLoading,
    isMasterAdmin,
    hasPermission,
    checkAccessWithNotification,
    refetch: fetchPermissions,
  };
};

// Hook for fetching permissions for a specific user (used in profile management)
export const useUserPermissions = (userId: string | null) => {
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const fetchPermissions = useCallback(async () => {
    if (!userId) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("user_permissions")
        .select("permission_key, granted")
        .eq("user_id", userId);

      if (error) throw error;

      const perms: Record<string, boolean> = {};
      data?.forEach((p) => {
        perms[p.permission_key] = p.granted;
      });
      setPermissions(perms);
    } catch (error) {
      console.error("Error fetching user permissions:", error);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  const setPermission = async (permissionKey: string, granted: boolean) => {
    if (!userId) return;

    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Upsert the permission
      const { error } = await supabase
        .from("user_permissions")
        .upsert(
          {
            user_id: userId,
            permission_key: permissionKey,
            granted,
            granted_by: user.id,
            granted_at: new Date().toISOString(),
          },
          { onConflict: "user_id,permission_key" }
        );

      if (error) throw error;

      setPermissions((prev) => ({ ...prev, [permissionKey]: granted }));
      toast.success(granted ? "Permission granted" : "Permission revoked");
    } catch (error: any) {
      console.error("Error updating permission:", error);
      toast.error(error.message || "Failed to update permission");
    } finally {
      setIsSaving(false);
    }
  };

  const setAllPermissions = async (granted: boolean) => {
    if (!userId) return;

    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const permissionRecords = Object.values(PERMISSION_KEYS).map((key) => ({
        user_id: userId,
        permission_key: key,
        granted,
        granted_by: user.id,
        granted_at: new Date().toISOString(),
      }));

      const { error } = await supabase
        .from("user_permissions")
        .upsert(permissionRecords, { onConflict: "user_id,permission_key" });

      if (error) throw error;

      const allPerms: Record<string, boolean> = {};
      Object.values(PERMISSION_KEYS).forEach((key) => {
        allPerms[key] = granted;
      });
      setPermissions(allPerms);

      toast.success(granted ? "All permissions granted" : "All permissions revoked");
    } catch (error: any) {
      console.error("Error updating all permissions:", error);
      toast.error(error.message || "Failed to update permissions");
    } finally {
      setIsSaving(false);
    }
  };

  return {
    permissions,
    isLoading,
    isSaving,
    setPermission,
    setAllPermissions,
    refetch: fetchPermissions,
  };
};
