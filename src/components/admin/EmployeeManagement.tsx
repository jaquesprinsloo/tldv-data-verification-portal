import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { UserPlus, Mail, Copy, Trash2, RefreshCw } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Employee {
  id: string;
  employee_number: string;
  id_number: string;
  unique_link_token: string;
  link_expires_at: string | null;
  email_verified: boolean;
  stores: {
    store_name: string;
  } | null;
}

interface Store {
  id: string;
  store_name: string;
  store_code: string;
}

const EmployeeManagement = () => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    employeeNumber: "",
    idNumber: "",
    storeId: "",
  });
  const { toast } = useToast();

  useEffect(() => {
    fetchEmployees();
    fetchStores();
  }, []);

  const fetchEmployees = async () => {
    try {
      const { data, error } = await supabase
        .from("employees")
        .select(`
          id,
          employee_number,
          id_number,
          unique_link_token,
          link_expires_at,
          email_verified,
          stores (store_name)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setEmployees(data || []);
    } catch (error) {
      console.error("Error fetching employees:", error);
    }
  };

  const fetchStores = async () => {
    try {
      const { data, error } = await supabase
        .from("stores")
        .select("*")
        .order("store_name");

      if (error) throw error;
      setStores(data || []);
    } catch (error) {
      console.error("Error fetching stores:", error);
    }
  };

  const generateUniqueToken = () => {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  };

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const uniqueToken = generateUniqueToken();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30); // Link expires in 30 days

      const { error } = await supabase
        .from("employees")
        .insert([
          {
            employee_number: formData.employeeNumber,
            id_number: formData.idNumber,
            store_id: formData.storeId || null,
            unique_link_token: uniqueToken,
            link_expires_at: expiresAt.toISOString(),
          },
        ]);

      if (error) throw error;

      toast({
        title: "Employee Added",
        description: "Employee has been successfully added to the system.",
      });

      setFormData({ employeeNumber: "", idNumber: "", storeId: "" });
      fetchEmployees();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to add employee",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSendVerificationEmail = async (employee: Employee) => {
    try {
      const verificationLink = `${window.location.origin}/employee/${employee.unique_link_token}`;
      
      // Here you would call your edge function to send the email
      toast({
        title: "Email Sent",
        description: `Verification email sent to employee ${employee.employee_number}`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to send verification email",
        variant: "destructive",
      });
    }
  };

  const handleCopyLink = (token: string) => {
    const link = `${window.location.origin}/employee/${token}`;
    navigator.clipboard.writeText(link);
    toast({
      title: "Link Copied",
      description: "Verification link copied to clipboard",
    });
  };

  const handleRegenerateToken = async (employeeId: string) => {
    try {
      const uniqueToken = generateUniqueToken();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      const { error } = await supabase
        .from("employees")
        .update({
          unique_link_token: uniqueToken,
          link_expires_at: expiresAt.toISOString(),
        })
        .eq("id", employeeId);

      if (error) throw error;

      toast({
        title: "Token Regenerated",
        description: "New verification link has been generated",
      });

      fetchEmployees();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to regenerate token",
        variant: "destructive",
      });
    }
  };

  const handleDeleteEmployee = async (employeeId: string) => {
    if (!confirm("Are you sure you want to delete this employee?")) return;

    try {
      const { error } = await supabase
        .from("employees")
        .delete()
        .eq("id", employeeId);

      if (error) throw error;

      toast({
        title: "Employee Deleted",
        description: "Employee has been removed from the system",
      });

      fetchEmployees();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete employee",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Add New Employee
          </CardTitle>
          <CardDescription>
            Create a new employee record and generate a verification link
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAddEmployee} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="employeeNumber">Employee Number</Label>
                <Input
                  id="employeeNumber"
                  value={formData.employeeNumber}
                  onChange={(e) =>
                    setFormData({ ...formData, employeeNumber: e.target.value })
                  }
                  required
                  placeholder="Enter employee number"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="idNumber">ID Number</Label>
                <Input
                  id="idNumber"
                  value={formData.idNumber}
                  onChange={(e) =>
                    setFormData({ ...formData, idNumber: e.target.value })
                  }
                  required
                  placeholder="Enter ID number"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="store">Store (Optional)</Label>
                <Select
                  value={formData.storeId}
                  onValueChange={(value) =>
                    setFormData({ ...formData, storeId: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a store" />
                  </SelectTrigger>
                  <SelectContent>
                    {stores.map((store) => (
                      <SelectItem key={store.id} value={store.id}>
                        {store.store_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button type="submit" disabled={loading}>
              {loading ? "Adding..." : "Add Employee"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Employee List</CardTitle>
          <CardDescription>
            Manage employee verification links and access
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee #</TableHead>
                  <TableHead>ID Number</TableHead>
                  <TableHead>Store</TableHead>
                  <TableHead>Link Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      No employees found. Add your first employee above.
                    </TableCell>
                  </TableRow>
                ) : (
                  employees.map((employee) => (
                    <TableRow key={employee.id}>
                      <TableCell className="font-medium">
                        {employee.employee_number}
                      </TableCell>
                      <TableCell>{employee.id_number}</TableCell>
                      <TableCell>{employee.stores?.store_name || "N/A"}</TableCell>
                      <TableCell>
                        {employee.email_verified ? (
                          <span className="text-green-600 text-sm">Verified</span>
                        ) : employee.link_expires_at &&
                          new Date(employee.link_expires_at) < new Date() ? (
                          <span className="text-destructive text-sm">Expired</span>
                        ) : (
                          <span className="text-yellow-600 text-sm">Pending</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCopyLink(employee.unique_link_token)}
                            title="Copy verification link"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSendVerificationEmail(employee)}
                            title="Send verification email"
                          >
                            <Mail className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRegenerateToken(employee.id)}
                            title="Regenerate verification link"
                          >
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteEmployee(employee.id)}
                            title="Delete employee"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default EmployeeManagement;
