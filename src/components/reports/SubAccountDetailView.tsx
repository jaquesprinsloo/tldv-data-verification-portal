import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Building, Users, FileText, DollarSign, ClipboardCheck, ShieldCheck, Edit, Save, X, MapPin, Lock } from "lucide-react";
import { toast } from "sonner";
import { StoreEmployeesList } from "./StoreEmployeesList";
import { StoreStatisticsCards } from "./StoreStatisticsCards";
import { StoreReportsTab } from "./StoreReportsTab";
import { StoreInvoicesTab } from "./StoreInvoicesTab";

interface SubAccount {
  id: string;
  store_name: string;
  store_code: string;
  town?: string | null;
  province?: string | null;
  center_mall_name?: string | null;
  shop_number?: string | null;
  street_number?: string | null;
  street_name?: string | null;
  postal_code?: string | null;
  contact_number?: string | null;
}

interface SubAccountDetailViewProps {
  subAccount: SubAccount;
  accountName: string;
  onBack: () => void;
  canEdit: boolean;
  restrictedMode?: boolean;
}

export const SubAccountDetailView = ({ subAccount, accountName, onBack, canEdit, restrictedMode = false }: SubAccountDetailViewProps) => {
  const [activeTab, setActiveTab] = useState("overview");
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    store_name: subAccount.store_name,
    center_mall_name: subAccount.center_mall_name || "",
    shop_number: subAccount.shop_number || "",
    street_number: subAccount.street_number || "",
    street_name: subAccount.street_name || "",
    town: subAccount.town || "",
    province: subAccount.province || "",
    postal_code: subAccount.postal_code || "",
  });
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState({
    employeesCount: 0,
    polygraphCount: 0,
    riskAssessmentCount: 0,
    totalSpend: 0,
  });
  const handleRestrictedTabClick = (tabName: string) => {
    if (restrictedMode) {
      toast.info(`Access to ${tabName} is restricted. Your profile can only select accounts for report placement.`);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [subAccount.id]);

  const fetchStats = async () => {
    try {
      const [employeesResult, examsResult, riskResult, invoicesResult] = await Promise.all([
        supabase
          .from("employees")
          .select("*", { count: "exact", head: true })
          .eq("store_id", subAccount.id),
        supabase
          .from("examinations")
          .select("*", { count: "exact", head: true })
          .eq("store_id", subAccount.id),
        supabase
          .from("risk_assessments")
          .select("*", { count: "exact", head: true })
          .eq("store_id", subAccount.id),
        supabase
          .from("invoices")
          .select("total_amount")
          .eq("store_id", subAccount.id),
      ]);

      const totalSpend = (invoicesResult.data || []).reduce((sum, inv) => sum + (inv.total_amount || 0), 0);

      setStats({
        employeesCount: employeesResult.count || 0,
        polygraphCount: examsResult.count || 0,
        riskAssessmentCount: riskResult.count || 0,
        totalSpend,
      });
    } catch (error) {
      console.error("Error fetching stats:", error);
    }
  };

  const handleSaveDetails = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("stores")
        .update({
          store_name: formData.store_name,
          center_mall_name: formData.center_mall_name || null,
          shop_number: formData.shop_number || null,
          street_number: formData.street_number || null,
          street_name: formData.street_name || null,
          town: formData.town || null,
          province: formData.province || null,
          postal_code: formData.postal_code || null,
        })
        .eq("id", subAccount.id);

      if (error) throw error;
      toast.success("Store details updated successfully");
      setIsEditing(false);
    } catch (error: any) {
      console.error("Error saving store details:", error);
      toast.error(error.message || "Failed to save store details");
    } finally {
      setSaving(false);
    }
  };

  const getFullAddress = () => {
    const parts = [
      formData.shop_number,
      formData.center_mall_name,
      formData.street_number,
      formData.street_name,
      formData.town,
      formData.province,
      formData.postal_code,
    ].filter(Boolean);
    return parts.join(", ");
  };

  const getGoogleMapsUrl = () => {
    const address = getFullAddress();
    if (!address) return null;
    const encodedAddress = encodeURIComponent(address);
    return `https://www.google.com/maps/embed/v1/place?key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ""}&q=${encodedAddress}&zoom=15`;
  };

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 md:gap-4">
        <div className="flex items-center gap-2 md:gap-4">
          <Button variant="ghost" size="sm" onClick={onBack} className="shrink-0">
            <ArrowLeft className="h-4 w-4 mr-1 md:mr-2" />
            <span className="hidden sm:inline">Back</span>
          </Button>
          <div className="min-w-0">
            <h2 className="text-lg md:text-2xl font-bold flex items-center gap-2 truncate">
              <Building className="h-5 w-5 md:h-6 md:w-6 text-primary shrink-0" />
              <span className="truncate">{formData.store_name}</span>
            </h2>
            <p className="text-xs md:text-sm text-muted-foreground truncate">
              {accountName} • Code: {subAccount.store_code}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 ml-auto sm:ml-0">
          {restrictedMode && (
            <Badge variant="secondary" className="gap-1 text-xs">
              <Lock className="h-3 w-3" />
              <span className="hidden sm:inline">View </span>Restricted
            </Badge>
          )}
          {!canEdit && (
            <Badge variant="secondary" className="text-xs">View Only</Badge>
          )}
        </div>
      </div>
      {/* Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4">
        <Card 
          className="cursor-pointer hover:border-primary transition-colors"
          onClick={() => setActiveTab("employees")}
        >
          <CardHeader className="pb-1 md:pb-2 p-2 md:p-4">
            <CardTitle className="text-xs md:text-sm font-medium flex items-center gap-1 md:gap-2">
              <Users className="h-3 w-3 md:h-4 md:w-4 text-blue-500" />
              <span className="truncate">Employees</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2 md:p-4 pt-0">
            <p className="text-lg md:text-2xl font-bold">{stats.employeesCount}</p>
            <p className="text-[10px] md:text-xs text-muted-foreground hidden sm:block">Assigned to this store</p>
          </CardContent>
        </Card>

        <Card 
          className="cursor-pointer hover:border-primary transition-colors"
          onClick={() => setActiveTab("statistics")}
        >
          <CardHeader className="pb-1 md:pb-2 p-2 md:p-4">
            <CardTitle className="text-xs md:text-sm font-medium flex items-center gap-1 md:gap-2">
              <ClipboardCheck className="h-3 w-3 md:h-4 md:w-4 text-green-500" />
              <span className="truncate">Polygraph</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2 md:p-4 pt-0">
            <p className="text-lg md:text-2xl font-bold">{stats.polygraphCount}</p>
            <p className="text-[10px] md:text-xs text-muted-foreground hidden sm:block">Examinations conducted</p>
          </CardContent>
        </Card>

        <Card 
          className="cursor-pointer hover:border-primary transition-colors"
          onClick={() => setActiveTab("statistics")}
        >
          <CardHeader className="pb-1 md:pb-2 p-2 md:p-4">
            <CardTitle className="text-xs md:text-sm font-medium flex items-center gap-1 md:gap-2">
              <ShieldCheck className="h-3 w-3 md:h-4 md:w-4 text-purple-500" />
              <span className="truncate">Risk</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2 md:p-4 pt-0">
            <p className="text-lg md:text-2xl font-bold">{stats.riskAssessmentCount}</p>
            <p className="text-[10px] md:text-xs text-muted-foreground hidden sm:block">Background checks</p>
          </CardContent>
        </Card>

        <Card 
          className="cursor-pointer hover:border-primary transition-colors"
          onClick={() => !restrictedMode ? setActiveTab("invoices") : handleRestrictedTabClick("Invoices")}
        >
          <CardHeader className="pb-1 md:pb-2 p-2 md:p-4">
            <CardTitle className="text-xs md:text-sm font-medium flex items-center gap-1 md:gap-2">
              <DollarSign className="h-3 w-3 md:h-4 md:w-4 text-yellow-500" />
              <span className="truncate">Spend</span>
              {restrictedMode && <Lock className="h-3 w-3 ml-auto" />}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2 md:p-4 pt-0">
            <p className={`text-lg md:text-2xl font-bold ${restrictedMode ? 'blur-sm select-none' : ''}`}>
              R {stats.totalSpend.toLocaleString()}
            </p>
            <p className="text-[10px] md:text-xs text-muted-foreground hidden sm:block">Total expenses</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(val) => {
        if (restrictedMode && ['employees', 'statistics', 'reports', 'invoices'].includes(val)) {
          handleRestrictedTabClick(val.charAt(0).toUpperCase() + val.slice(1));
          return;
        }
        setActiveTab(val);
      }} className="w-full">
        <TabsList className="w-full overflow-x-auto flex md:grid md:grid-cols-5 h-auto">
          <TabsTrigger value="overview" className="text-xs md:text-sm py-2 px-2 md:px-4 whitespace-nowrap">Details</TabsTrigger>
          <TabsTrigger value="employees" className="gap-1 text-xs md:text-sm py-2 px-2 md:px-4 whitespace-nowrap" disabled={restrictedMode}>
            Employees
            {restrictedMode && <Lock className="h-3 w-3" />}
          </TabsTrigger>
          <TabsTrigger value="statistics" className="gap-1 text-xs md:text-sm py-2 px-2 md:px-4 whitespace-nowrap" disabled={restrictedMode}>
            Stats
            {restrictedMode && <Lock className="h-3 w-3" />}
          </TabsTrigger>
          <TabsTrigger value="reports" className="gap-1 text-xs md:text-sm py-2 px-2 md:px-4 whitespace-nowrap" disabled={restrictedMode}>
            Reports
            {restrictedMode && <Lock className="h-3 w-3" />}
          </TabsTrigger>
          <TabsTrigger value="invoices" className="gap-1 text-xs md:text-sm py-2 px-2 md:px-4 whitespace-nowrap" disabled={restrictedMode}>
            Invoices
            {restrictedMode && <Lock className="h-3 w-3" />}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Store Details</CardTitle>
              {canEdit && (
                <div className="flex gap-2">
                  {isEditing ? (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)}>
                        <X className="h-4 w-4 mr-1" />
                        Cancel
                      </Button>
                      <Button size="sm" onClick={handleSaveDetails} disabled={saving}>
                        <Save className="h-4 w-4 mr-1" />
                        {saving ? "Saving..." : "Save"}
                      </Button>
                    </>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                      <Edit className="h-4 w-4 mr-1" />
                      Edit Details
                    </Button>
                  )}
                </div>
              )}
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-6">
                  {/* Store Name */}
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wide">Store Name</Label>
                    {isEditing ? (
                      <Input
                        value={formData.store_name}
                        onChange={(e) => setFormData({ ...formData, store_name: e.target.value })}
                      />
                    ) : (
                      <p className="text-lg font-medium">{formData.store_name || "-"}</p>
                    )}
                  </div>

                  {/* Building Details */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium text-muted-foreground">Building Details</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Center/Mall</Label>
                        {isEditing ? (
                          <Input
                            value={formData.center_mall_name}
                            onChange={(e) => setFormData({ ...formData, center_mall_name: e.target.value })}
                            placeholder="e.g., Menlyn Park"
                          />
                        ) : (
                          <p className="font-medium">{formData.center_mall_name || "-"}</p>
                        )}
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Shop/Unit Number</Label>
                        {isEditing ? (
                          <Input
                            value={formData.shop_number}
                            onChange={(e) => setFormData({ ...formData, shop_number: e.target.value })}
                            placeholder="e.g., Shop 45"
                          />
                        ) : (
                          <p className="font-medium">{formData.shop_number || "-"}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Street Address */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium text-muted-foreground">Street Address</h4>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Street No.</Label>
                        {isEditing ? (
                          <Input
                            value={formData.street_number}
                            onChange={(e) => setFormData({ ...formData, street_number: e.target.value })}
                            placeholder="123"
                          />
                        ) : (
                          <p className="font-medium">{formData.street_number || "-"}</p>
                        )}
                      </div>
                      <div className="col-span-2 space-y-1">
                        <Label className="text-xs text-muted-foreground">Street Name</Label>
                        {isEditing ? (
                          <Input
                            value={formData.street_name}
                            onChange={(e) => setFormData({ ...formData, street_name: e.target.value })}
                            placeholder="e.g., Main Street"
                          />
                        ) : (
                          <p className="font-medium">{formData.street_name || "-"}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Location */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium text-muted-foreground">Location</h4>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Town/City</Label>
                        {isEditing ? (
                          <Input
                            value={formData.town}
                            onChange={(e) => setFormData({ ...formData, town: e.target.value })}
                            placeholder="Pretoria"
                          />
                        ) : (
                          <p className="font-medium">{formData.town || "-"}</p>
                        )}
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Province</Label>
                        {isEditing ? (
                          <Input
                            value={formData.province}
                            onChange={(e) => setFormData({ ...formData, province: e.target.value })}
                            placeholder="Gauteng"
                          />
                        ) : (
                          <p className="font-medium">{formData.province || "-"}</p>
                        )}
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Postal Code</Label>
                        {isEditing ? (
                          <Input
                            value={formData.postal_code}
                            onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
                            placeholder="0181"
                          />
                        ) : (
                          <p className="font-medium">{formData.postal_code || "-"}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Map */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    <MapPin className="h-4 w-4" />
                    Location
                  </Label>
                  {getFullAddress() ? (
                    <div className="w-full h-64 rounded-lg overflow-hidden border">
                      <iframe
                        width="100%"
                        height="100%"
                        style={{ border: 0 }}
                        loading="lazy"
                        allowFullScreen
                        referrerPolicy="no-referrer-when-downgrade"
                        src={getGoogleMapsUrl() || ""}
                      />
                    </div>
                  ) : (
                    <div className="w-full h-64 rounded-lg border flex items-center justify-center bg-muted">
                      <p className="text-muted-foreground">Add address details to see location</p>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="employees">
          <StoreEmployeesList storeId={subAccount.id} storeName={formData.store_name} canEdit={canEdit} />
        </TabsContent>

        <TabsContent value="statistics">
          <StoreStatisticsCards storeId={subAccount.id} canEdit={canEdit} />
        </TabsContent>

        <TabsContent value="reports">
          <StoreReportsTab storeId={subAccount.id} canEdit={canEdit} />
        </TabsContent>

        <TabsContent value="invoices">
          <StoreInvoicesTab storeId={subAccount.id} canEdit={canEdit} />
        </TabsContent>
      </Tabs>
    </div>
  );
};
