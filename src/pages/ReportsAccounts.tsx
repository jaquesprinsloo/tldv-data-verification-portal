import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AccountSelector } from "@/components/reports/AccountSelector";
import { AccountStoresList } from "@/components/reports/AccountStoresList";
import { SubAccountDetailView } from "@/components/reports/SubAccountDetailView";

type ViewState = "accounts" | "stores" | "dashboard";
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
    setView("stores");
  };

  const handleSelectStore = (store: Store) => {
    setSelectedStore(store);
    setView("dashboard");
  };

  const handleBackToAccounts = () => {
    setSelectedAccount(null);
    setView("accounts");
  };

  const handleBackToStores = () => {
    setSelectedStore(null);
    setView("stores");
  };

  const isMasterAdmin = userRole === "master_admin";

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="container mx-auto">
        {view === "accounts" && (
          <>
            <Button
              variant="ghost"
              onClick={() => navigate("/admin/portal")}
              className="mb-6"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Portal
            </Button>
            
            <div className="mb-8">
              <h1 className="text-3xl font-bold">Reports & Accounts</h1>
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

        {view === "stores" && selectedAccount && (
          <AccountStoresList
            account={selectedAccount}
            onBack={handleBackToAccounts}
            onSelectStore={handleSelectStore}
            canEdit={isMasterAdmin}
          />
        )}

        {view === "dashboard" && selectedStore && selectedAccount && (
          <SubAccountDetailView
            subAccount={selectedStore}
            accountName={selectedAccount.name}
            onBack={handleBackToStores}
            canEdit={isMasterAdmin}
          />
        )}
      </div>
    </div>
  );
};

export default ReportsAccounts;
