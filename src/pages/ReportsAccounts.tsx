import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import AdminHeader from "@/components/admin/AdminHeader";
import { AccountSelector } from "@/components/reports/AccountSelector";
import { AccountDashboard } from "@/components/reports/AccountDashboard";
import { AccountStoresList } from "@/components/reports/AccountStoresList";
import { SubAccountDetailView } from "@/components/reports/SubAccountDetailView";
import PolygraphReportsSection from "@/components/reports/PolygraphReportsSection";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, FileText, Lock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { usePermissions, PERMISSION_KEYS } from "@/hooks/usePermissions";

type ViewState = "accounts" | "accountDashboard" | "stores" | "storeDashboard";
type UserRole = "admin" | "master_admin";

interface Account {
  id: string;
  name: string;
  code: string;
  contact_email: string | null;
  contact_phone: string | null;
}

interface Store {
  id: string;
  store_name: string;
  store_code: string;
  town: string | null;
  province: string | null;
  center_mall_name?: string | null;
  shop_number?: string | null;
  street_number?: string | null;
  street_name?: string | null;
  postal_code?: string | null;
  contact_number?: string | null;
}

const ReportsAccounts = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [mainTab, setMainTab] = useState("accounts");
  const [view, setView] = useState<ViewState>("accounts");
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const [userRole, setUserRole] = useState<UserRole>("admin");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/admin/login");
        return;
      }

      setUser(session.user);
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

      const isMasterAdmin = roleData.some(r => r.role === "master_admin");
      setUserRole(isMasterAdmin ? "master_admin" : "admin");
    };

    checkAuth();
  }, [navigate]);

  const handleSelectAccount = (account: Account) => {
    setSelectedAccount(account);
    setView("accountDashboard");
  };

  const handleViewStores = () => {
    setView("stores");
  };

  const handleSelectStore = (store: Store) => {
    setSelectedStore(store);
    setView("storeDashboard");
  };

  const handleBackToAccounts = () => {
    setSelectedAccount(null);
    setView("accounts");
  };

  const handleBackToAccountDashboard = () => {
    setSelectedStore(null);
    setView("accountDashboard");
  };

  const handleBackToStores = () => {
    setSelectedStore(null);
    setView("stores");
  };

  const isMasterAdmin = userRole === "master_admin";
  
  // Use permissions hook
  const { hasPermission, isLoading: permissionsLoading } = usePermissions(currentUserId || undefined);
  
  // Permission checks
  const isStillLoadingPermissions = !currentUserId || permissionsLoading;
  const canSelectAccounts = isStillLoadingPermissions ? true : (isMasterAdmin || hasPermission(PERMISSION_KEYS.ACCOUNTS_SELECT_ACCOUNTS));
  const canViewSubAccountDetails = isStillLoadingPermissions ? isMasterAdmin : (isMasterAdmin || hasPermission(PERMISSION_KEYS.ACCOUNTS_VIEW_SUB_ACCOUNTS));

  // "Select-only" mode: can pick accounts/stores for report placement, but cannot view dashboards/financials
  const isSelectOnly = canSelectAccounts && !canViewSubAccountDetails;

  return (
    <div className="min-h-screen bg-background">
      <AdminHeader user={user} title="Reports & Accounts Portal" />
      {/* Desktop-like layout wrapper - scales down on mobile for full view */}
      <div className="md:block">
        <main className="container mx-auto px-2 sm:px-4 md:px-6 lg:px-8 py-2 sm:py-4 md:py-6">
          <Tabs value={mainTab} onValueChange={setMainTab} className="space-y-4 md:space-y-6">
            <TabsList className="grid w-full max-w-md grid-cols-2 h-auto">
              <TabsTrigger value="accounts" className="flex items-center gap-1 md:gap-2 text-xs md:text-sm py-2">
                <Building2 className="h-3 w-3 md:h-4 md:w-4" />
                Accounts
              </TabsTrigger>
              <TabsTrigger value="polygraph" className="flex items-center gap-1 md:gap-2 text-xs md:text-sm py-2">
                <FileText className="h-3 w-3 md:h-4 md:w-4" />
                Polygraph Reports
              </TabsTrigger>
            </TabsList>

          <TabsContent value="accounts">
            {view === "accounts" && (
              <>
                <div className="mb-4 md:mb-8">
                  <h2 className="text-lg md:text-2xl font-bold">Select Account</h2>
                  <p className="text-muted-foreground mt-1 md:mt-2 text-xs md:text-base">
                    {canViewSubAccountDetails
                      ? "Select an account to view sub accounts and examination statistics"
                      : "View your assigned accounts for report selection"
                    }
                  </p>
                </div>

                {canSelectAccounts ? (
                  <AccountSelector 
                    onSelectAccount={handleSelectAccount}
                    canEdit={isMasterAdmin}
                    currentUserId={currentUserId || undefined}
                    isMasterAdmin={isMasterAdmin}
                    viewDetailsEnabled={!isSelectOnly}
                  />
                ) : (
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <Lock className="h-12 w-12 text-muted-foreground mb-4" />
                        <h3 className="text-lg font-semibold mb-2">Access Restricted</h3>
                        <p className="text-muted-foreground max-w-md">
                          Your profile does not have permission to access accounts. 
                          Please contact a Master Admin to request access.
                        </p>
                        <Badge variant="outline" className="mt-4">
                          Permission Required: Select Accounts for Reports
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}

            {view === "accountDashboard" && selectedAccount && (
              <AccountDashboard
                account={selectedAccount}
                onBack={handleBackToAccounts}
                onViewStores={handleViewStores}
                canEdit={isMasterAdmin}
                restrictedMode={isSelectOnly}
              />
            )}

            {view === "stores" && selectedAccount && (
              <AccountStoresList
                account={selectedAccount}
                onBack={handleBackToAccountDashboard}
                onSelectStore={handleSelectStore}
                canEdit={isMasterAdmin}
              />
            )}

            {view === "storeDashboard" && selectedStore && selectedAccount && (
              <SubAccountDetailView
                subAccount={selectedStore}
                accountName={selectedAccount.name}
                onBack={handleBackToStores}
                canEdit={isMasterAdmin}
                restrictedMode={isSelectOnly}
              />
            )}
          </TabsContent>

          <TabsContent value="polygraph">
            <PolygraphReportsSection canEdit={isMasterAdmin} />
          </TabsContent>
        </Tabs>
        </main>
      </div>
    </div>
  );
};

export default ReportsAccounts;
