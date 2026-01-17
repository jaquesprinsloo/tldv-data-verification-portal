import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ProfileDetailsDialog } from "./ProfileDetailsDialog";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Profile {
  id: string;
  email: string;
  full_name: string;
  created_at: string;
  roles?: string[];
}

export const ProfileManagement = () => {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [selectedRole, setSelectedRole] = useState<"admin" | "master_admin">("admin");
  const [isLoading, setIsLoading] = useState(false);
  const [searchFilter, setSearchFilter] = useState("");
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: profiles, isLoading: isLoadingProfiles } = useQuery({
    queryKey: ['admin-profiles'],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) throw new Error("Not authenticated");

      // Check if current user is master admin
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userData.user.id)
        .eq("role", "master_admin")
        .single();

      if (!roleData) throw new Error("Not authorized");

      // Fetch all profiles with admin or master_admin roles
      const { data: allRoles } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("role", ["admin", "master_admin"]);

      if (!allRoles || allRoles.length === 0) return [];

      // Get unique user IDs
      const userIds = [...new Set(allRoles.map(r => r.user_id))];
      
      // Create a map of user_id to roles
      const userRolesMap: Record<string, string[]> = {};
      allRoles.forEach(r => {
        if (!userRolesMap[r.user_id]) {
          userRolesMap[r.user_id] = [];
        }
        userRolesMap[r.user_id].push(r.role);
      });

      const { data: profilesData } = await supabase
        .from("profiles")
        .select("*")
        .in("id", userIds);

      // Add roles to each profile
      const profilesWithRoles = (profilesData || []).map(profile => ({
        ...profile,
        roles: userRolesMap[profile.id] || []
      }));

      return profilesWithRoles as Profile[];
    }
  });

  const handleCreateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }

    setIsLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const { data, error } = await supabase.functions.invoke('create-admin-user', {
        body: {
          email,
          firstName,
          lastName,
          password,
          role: selectedRole,
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });

      if (error) throw error;

      toast.success(`${selectedRole === 'master_admin' ? 'Master Admin' : 'Admin'} created successfully! Login credentials have been sent to their email.`);
      setFirstName("");
      setLastName("");
      setEmail("");
      setPassword("");
      setConfirmPassword("");
      setSelectedRole("admin");
      queryClient.invalidateQueries({ queryKey: ['admin-profiles'] });
    } catch (error: any) {
      console.error("Error creating profile:", error);
      const errorMessage = error.message || "Failed to create profile";
      if (errorMessage.includes("already been registered")) {
        toast.error("A user with this email address already exists. Please use a different email.");
      } else {
        toast.error(errorMessage);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleProfileClick = (profile: Profile) => {
    setSelectedProfile(profile);
    setDialogOpen(true);
  };

  const handleDialogUpdate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-profiles'] });
  };

  const filteredProfiles = profiles?.filter(profile => 
    (profile.full_name?.toLowerCase() || '').includes(searchFilter.toLowerCase()) ||
    profile.email.toLowerCase().includes(searchFilter.toLowerCase())
  ) || [];

  return (
    <div className="min-h-screen bg-black p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold text-white mb-8">Master Profile - User Management</h1>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Create Profile Form */}
          <Card className="p-6 bg-black border-2 border-red-600">
            <h2 className="text-2xl font-bold text-white mb-6">Create New Profile</h2>
            <form onSubmit={handleCreateProfile} className="space-y-4">
              <div>
                <Label htmlFor="firstName" className="text-white">First Name</Label>
                <Input
                  id="firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  className="bg-black border-red-600 text-white"
                />
              </div>
              <div>
                <Label htmlFor="lastName" className="text-white">Last Name</Label>
                <Input
                  id="lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  className="bg-black border-red-600 text-white"
                />
              </div>
              <div>
                <Label htmlFor="email" className="text-white">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="bg-black border-red-600 text-white"
                />
              </div>
              <div>
                <Label htmlFor="password" className="text-white">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  className="bg-black border-red-600 text-white"
                  placeholder="Minimum 8 characters"
                />
              </div>
              <div>
                <Label htmlFor="confirmPassword" className="text-white">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="bg-black border-red-600 text-white"
                />
              </div>
              <div>
                <Label htmlFor="role" className="text-white">Role</Label>
                <Select value={selectedRole} onValueChange={(value: "admin" | "master_admin") => setSelectedRole(value)}>
                  <SelectTrigger className="bg-black border-red-600 text-white">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent className="bg-black border-red-600">
                    <SelectItem value="admin" className="text-white hover:bg-red-600/20">Admin</SelectItem>
                    <SelectItem value="master_admin" className="text-white hover:bg-red-600/20">Master Admin</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-gray-500 text-xs mt-1">
                  {selectedRole === 'master_admin' 
                    ? 'Master Admins have full access including user management' 
                    : 'Admins have access based on assigned permissions'}
                </p>
              </div>
              <p className="text-gray-400 text-sm">
                Login credentials will be emailed to the user securely.
              </p>
              <Button
                type="submit"
                disabled={isLoading}
                className="w-full bg-red-600 hover:bg-red-700 text-white"
              >
                {isLoading ? "Creating..." : "Create Profile"}
              </Button>
            </form>
          </Card>

          {/* Profiles List */}
          <Card className="p-6 bg-black border-2 border-red-600">
            <h2 className="text-2xl font-bold text-white mb-6">Admin Profiles</h2>
            <div className="mb-4">
              <Label htmlFor="search" className="text-white">Search Profiles</Label>
              <Input
                id="search"
                placeholder="Filter by name or email..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="bg-black border-red-600 text-white"
              />
            </div>
            <p className="text-gray-400 text-sm mb-4">
              Click on a profile to manage details, roles, and password.
            </p>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {isLoadingProfiles ? (
                <p className="text-gray-400">Loading profiles...</p>
              ) : filteredProfiles.length === 0 ? (
                <p className="text-gray-400">No profiles found</p>
              ) : (
                filteredProfiles.map((profile) => (
                  <div
                    key={profile.id}
                    onClick={() => handleProfileClick(profile)}
                    className="p-4 border border-red-600/50 rounded-lg hover:bg-red-600/10 transition-colors cursor-pointer"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-white font-semibold">{profile.full_name || 'No name'}</p>
                        <p className="text-gray-400 text-sm">{profile.email}</p>
                      </div>
                      <div className="flex gap-1 flex-wrap justify-end">
                        {profile.roles?.map(role => (
                          <Badge 
                            key={role} 
                            variant="outline" 
                            className={`text-xs ${
                              role === 'master_admin' 
                                ? 'border-yellow-500 text-yellow-500' 
                                : 'border-red-500 text-red-500'
                            }`}
                          >
                            {role === 'master_admin' ? 'Master' : 'Admin'}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <p className="text-gray-500 text-xs mt-1">
                      Created: {new Date(profile.created_at).toLocaleDateString()}
                    </p>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>

      <ProfileDetailsDialog
        profile={selectedProfile}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onUpdate={handleDialogUpdate}
      />
    </div>
  );
};
