import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import AdminHeader from "@/components/admin/AdminHeader";
import { AccountSelector } from "@/components/reports/AccountSelector";
import { AccountDashboard } from "@/components/reports/AccountDashboard";
import { AccountStoresList } from "@/components/reports/AccountStoresList";
import { SubAccountDetailView } from "@/components/reports/SubAccountDetailView";

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

  return (
    <div className="min-h-screen bg-background">
      <AdminHeader user={user} title="Reports & Accounts Portal" />
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
        {view === "accounts" && (
          <>
            <div className="mb-8">
              <h2 className="text-2xl font-bold">Select Account</h2>
              <p className="text-muted-foreground mt-2">
                {isMasterAdmin 
                  ? "Select an account to view sub accounts and examination statistics"
                  : "View your assigned accounts and examination statistics"
                }
              </p>
            </div>

            <AccountSelector 
              onSelectAccount={handleSelectAccount} 
              canEdit={isMasterAdmin}
              currentUserId={currentUserId || undefined}
              isMasterAdmin={isMasterAdmin}
            />
          </>
        )}

        {view === "accountDashboard" && selectedAccount && (
          <AccountDashboard
            account={selectedAccount}
            onBack={handleBackToAccounts}
            onViewStores={handleViewStores}
            canEdit={isMasterAdmin}
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
          />
        )}
      </main>
    </div>
  );
};

export default ReportsAccounts;
