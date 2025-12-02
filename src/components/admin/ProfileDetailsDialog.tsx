import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Profile {
  id: string;
  email: string;
  full_name: string;
  created_at: string;
}

interface Account {
  id: string;
  name: string;
  code: string;
}

interface ProfileDetailsDialogProps {
  profile: Profile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: () => void;
}

type AppRole = "admin" | "master_admin" | "employee";

export const ProfileDetailsDialog = ({
  profile,
  open,
  onOpenChange,
  onUpdate,
}: ProfileDetailsDialogProps) => {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSavingRoles, setIsSavingRoles] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  
  // Account access state
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [userAccountAccess, setUserAccountAccess] = useState<string[]>([]);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false);
  const [isSavingAccess, setIsSavingAccess] = useState(false);

  useEffect(() => {
    if (profile && open) {
      setFullName(profile.full_name || "");
      setEmail(profile.email);
      fetchUserRoles();
      fetchAccounts();
      fetchUserAccountAccess();
    }
  }, [profile, open]);

  const fetchUserRoles = async () => {
    if (!profile) return;
    
    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", profile.id);

    if (!error && data) {
      setRoles(data.map((r) => r.role as AppRole));
    }
  };

  const fetchAccounts = async () => {
    setIsLoadingAccounts(true);
    try {
      const { data, error } = await supabase
        .from("accounts")
        .select("id, name, code")
        .order("name");

      if (error) throw error;
      setAccounts(data || []);
    } catch (error) {
      console.error("Error fetching accounts:", error);
    } finally {
      setIsLoadingAccounts(false);
    }
  };

  const fetchUserAccountAccess = async () => {
    if (!profile) return;

    try {
      const { data, error } = await supabase
        .from("account_access")
        .select("account_id")
        .eq("user_id", profile.id);

      if (error) throw error;
      setUserAccountAccess(data?.map(a => a.account_id) || []);
    } catch (error) {
      console.error("Error fetching account access:", error);
    }
  };

  const handleAccountAccessToggle = async (accountId: string, checked: boolean) => {
    if (!profile) return;
    setIsSavingAccess(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      if (checked) {
        // Grant access
        const { error } = await supabase
          .from("account_access")
          .insert({
            account_id: accountId,
            user_id: profile.id,
            granted_by: user.id
          });

        if (error) throw error;
        setUserAccountAccess([...userAccountAccess, accountId]);
        toast.success("Account access granted");
      } else {
        // Revoke access
        const { error } = await supabase
          .from("account_access")
          .delete()
          .eq("account_id", accountId)
          .eq("user_id", profile.id);

        if (error) throw error;
        setUserAccountAccess(userAccountAccess.filter(id => id !== accountId));
        toast.success("Account access revoked");
      }
    } catch (error: any) {
      console.error("Error updating account access:", error);
      toast.error(error.message || "Failed to update account access");
    } finally {
      setIsSavingAccess(false);
    }
  };

  const handleUpdateProfile = async () => {
    if (!profile) return;
    setIsLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const { error } = await supabase.functions.invoke('update-admin-profile', {
        body: {
          userId: profile.id,
          fullName,
          email,
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });

      if (error) throw error;

      toast.success("Profile updated successfully");
      onUpdate();
    } catch (error: any) {
      console.error("Error updating profile:", error);
      toast.error(error.message || "Failed to update profile");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!profile || !newPassword) return;
    
    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }

    setIsResettingPassword(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const { error } = await supabase.functions.invoke('reset-admin-password', {
        body: {
          userId: profile.id,
          newPassword,
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });

      if (error) throw error;

      toast.success("Password reset successfully");
      setNewPassword("");
    } catch (error: any) {
      console.error("Error resetting password:", error);
      toast.error(error.message || "Failed to reset password");
    } finally {
      setIsResettingPassword(false);
    }
  };

  const handleRoleToggle = async (role: AppRole, checked: boolean) => {
    if (!profile) return;
    setIsSavingRoles(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      if (checked) {
        const { error } = await supabase.rpc('assign_user_role', {
          _user_id: profile.id,
          _role: role
        });
        if (error) throw error;
        setRoles([...roles, role]);
      } else {
        const { error } = await supabase.rpc('remove_user_role', {
          _user_id: profile.id,
          _role: role
        });
        if (error) throw error;
        setRoles(roles.filter(r => r !== role));
      }

      toast.success(`Role ${checked ? 'assigned' : 'removed'} successfully`);
      onUpdate();
    } catch (error: any) {
      console.error("Error updating role:", error);
      toast.error(error.message || "Failed to update role");
    } finally {
      setIsSavingRoles(false);
    }
  };

  const handleSendPasswordResetEmail = async () => {
    if (!profile) return;
    setIsResettingPassword(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(profile.email, {
        redirectTo: `${window.location.origin}/admin/reset-password`,
      });

      if (error) throw error;

      toast.success("Password reset email sent successfully");
    } catch (error: any) {
      console.error("Error sending reset email:", error);
      toast.error(error.message || "Failed to send reset email");
    } finally {
      setIsResettingPassword(false);
    }
  };

  if (!profile) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-black border-2 border-red-600 text-white max-w-lg max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="text-white text-xl">Manage Profile</DialogTitle>
          <DialogDescription className="text-gray-400">
            Edit profile details, assign roles, and manage account access.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="details" className="w-full">
          <TabsList className="grid w-full grid-cols-4 bg-black border border-red-600">
            <TabsTrigger value="details" className="data-[state=active]:bg-red-600 text-xs">Details</TabsTrigger>
            <TabsTrigger value="roles" className="data-[state=active]:bg-red-600 text-xs">Roles</TabsTrigger>
            <TabsTrigger value="accounts" className="data-[state=active]:bg-red-600 text-xs">Accounts</TabsTrigger>
            <TabsTrigger value="password" className="data-[state=active]:bg-red-600 text-xs">Password</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4 mt-4">
            <div>
              <Label htmlFor="fullName" className="text-white">Full Name</Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="bg-black border-red-600 text-white"
              />
            </div>
            <div>
              <Label htmlFor="email" className="text-white">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-black border-red-600 text-white"
              />
            </div>
            <div className="text-gray-400 text-sm">
              <p>Created: {new Date(profile.created_at).toLocaleString()}</p>
              <p>User ID: {profile.id}</p>
            </div>
            <Button
              onClick={handleUpdateProfile}
              disabled={isLoading}
              className="w-full bg-red-600 hover:bg-red-700"
            >
              {isLoading ? "Saving..." : "Save Changes"}
            </Button>
          </TabsContent>

          <TabsContent value="roles" className="space-y-4 mt-4">
            <p className="text-gray-400 text-sm mb-4">
              Assign roles to this user. Users can have multiple roles.
            </p>
            <div className="space-y-3">
              <div className="flex items-center space-x-3 p-3 border border-red-600/50 rounded-lg">
                <Checkbox
                  id="role-admin"
                  checked={roles.includes("admin")}
                  onCheckedChange={(checked) => handleRoleToggle("admin", checked as boolean)}
                  disabled={isSavingRoles}
                  className="border-red-600 data-[state=checked]:bg-red-600"
                />
                <div>
                  <Label htmlFor="role-admin" className="text-white font-medium">Admin</Label>
                  <p className="text-gray-400 text-xs">Can manage employees, submissions, and stores</p>
                </div>
              </div>
              <div className="flex items-center space-x-3 p-3 border border-red-600/50 rounded-lg">
                <Checkbox
                  id="role-master-admin"
                  checked={roles.includes("master_admin")}
                  onCheckedChange={(checked) => handleRoleToggle("master_admin", checked as boolean)}
                  disabled={isSavingRoles}
                  className="border-red-600 data-[state=checked]:bg-red-600"
                />
                <div>
                  <Label htmlFor="role-master-admin" className="text-white font-medium">Master Admin</Label>
                  <p className="text-gray-400 text-xs">Full access including user management</p>
                </div>
              </div>
              <div className="flex items-center space-x-3 p-3 border border-red-600/50 rounded-lg">
                <Checkbox
                  id="role-employee"
                  checked={roles.includes("employee")}
                  onCheckedChange={(checked) => handleRoleToggle("employee", checked as boolean)}
                  disabled={isSavingRoles}
                  className="border-red-600 data-[state=checked]:bg-red-600"
                />
                <div>
                  <Label htmlFor="role-employee" className="text-white font-medium">Employee</Label>
                  <p className="text-gray-400 text-xs">Can submit and view own data</p>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="accounts" className="space-y-4 mt-4">
            <p className="text-gray-400 text-sm mb-4">
              Select which accounts this user can access in Reports & Accounts.
            </p>
            {isLoadingAccounts ? (
              <p className="text-gray-400">Loading accounts...</p>
            ) : accounts.length === 0 ? (
              <p className="text-gray-400">No accounts found. Create accounts in Reports & Accounts first.</p>
            ) : (
              <ScrollArea className="h-[250px] pr-4">
                <div className="space-y-2">
                  {accounts.map((account) => (
                    <div 
                      key={account.id} 
                      className="flex items-center space-x-3 p-3 border border-red-600/50 rounded-lg hover:bg-red-600/10"
                    >
                      <Checkbox
                        id={`account-${account.id}`}
                        checked={userAccountAccess.includes(account.id)}
                        onCheckedChange={(checked) => handleAccountAccessToggle(account.id, checked as boolean)}
                        disabled={isSavingAccess}
                        className="border-red-600 data-[state=checked]:bg-red-600"
                      />
                      <div className="flex-1">
                        <Label htmlFor={`account-${account.id}`} className="text-white font-medium cursor-pointer">
                          {account.name}
                        </Label>
                        <p className="text-gray-400 text-xs">Code: {account.code}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
            <div className="pt-2 border-t border-red-600/30">
              <p className="text-gray-500 text-xs">
                {userAccountAccess.length} of {accounts.length} accounts assigned
              </p>
            </div>
          </TabsContent>

          <TabsContent value="password" className="space-y-4 mt-4">
            <div className="p-4 border border-yellow-600/50 rounded-lg bg-yellow-600/10">
              <p className="text-yellow-400 text-sm">
                <strong>Note:</strong> Passwords are securely hashed and cannot be viewed. 
                You can set a new password or send a reset email to the user.
              </p>
            </div>
            
            <div className="space-y-3">
              <Label htmlFor="newPassword" className="text-white">Set New Password</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password (min 8 characters)"
                className="bg-black border-red-600 text-white"
              />
              <Button
                onClick={handleResetPassword}
                disabled={isResettingPassword || !newPassword}
                className="w-full bg-red-600 hover:bg-red-700"
              >
                {isResettingPassword ? "Resetting..." : "Set New Password"}
              </Button>
            </div>

            <div className="border-t border-red-600/30 pt-4">
              <p className="text-gray-400 text-sm mb-3">
                Or send a password reset email to the user:
              </p>
              <Button
                onClick={handleSendPasswordResetEmail}
                disabled={isResettingPassword}
                variant="outline"
                className="w-full border-red-600 text-white hover:bg-red-600/20"
              >
                Send Password Reset Email
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
