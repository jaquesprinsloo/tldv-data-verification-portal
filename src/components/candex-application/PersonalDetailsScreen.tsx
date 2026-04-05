import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { User, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import preapplicheckLogo from "@/assets/preapplicheck-logo.jpg";

interface PersonalDetailsScreenProps {
  prefilled?: {
    candidateName?: string;
    candidateEmail?: string;
    candidatePhone?: string;
    candidateIdNumber?: string;
  };
  onComplete: (details: PersonalDetails) => void;
}

export interface PersonalDetails {
  firstName: string;
  secondName: string;
  surname: string;
  idNumber: string;
  houseNumber: string;
  floorNumber: string;
  streetName: string;
  complexName: string;
  suburb: string;
  city: string;
  province: string;
  postalCode: string;
  cellphone: string;
  email: string;
}

type NAFields = Partial<Record<keyof PersonalDetails, boolean>>;

const optionalAddressFields: (keyof PersonalDetails)[] = [
  "secondName", "houseNumber", "floorNumber", "complexName",
];

export default function PersonalDetailsScreen({ prefilled, onComplete }: PersonalDetailsScreenProps) {
  const nameParts = (prefilled?.candidateName || "").split(" ");
  
  const [form, setForm] = useState<PersonalDetails>({
    firstName: nameParts[0] || "",
    secondName: nameParts.length > 2 ? nameParts.slice(1, -1).join(" ") : "",
    surname: nameParts.length > 1 ? nameParts[nameParts.length - 1] : "",
    idNumber: prefilled?.candidateIdNumber || "",
    houseNumber: "",
    floorNumber: "",
    streetName: "",
    complexName: "",
    suburb: "",
    city: "",
    province: "",
    postalCode: "",
    cellphone: prefilled?.candidatePhone || "",
    email: prefilled?.candidateEmail || "",
  });

  const [naFields, setNaFields] = useState<NAFields>({});

  const set = (key: keyof PersonalDetails, val: string) =>
    setForm((p) => ({ ...p, [key]: val }));

  const toggleNA = (key: keyof PersonalDetails) => {
    setNaFields((p) => {
      const next = { ...p, [key]: !p[key] };
      if (next[key]) setForm((f) => ({ ...f, [key]: "N/A" }));
      else setForm((f) => ({ ...f, [key]: "" }));
      return next;
    });
  };

  const handleSubmit = () => {
    const required: (keyof PersonalDetails)[] = [
      "firstName", "surname", "idNumber", "streetName",
      "suburb", "city", "province", "postalCode", "cellphone", "email",
    ];
    for (const key of required) {
      if (!form[key] || form[key].trim() === "") {
        toast.error(`Please fill in ${key.replace(/([A-Z])/g, " $1").toLowerCase()}`);
        return;
      }
    }
    onComplete(form);
  };

  const renderField = (
    key: keyof PersonalDetails,
    label: string,
    type = "text",
    isOptional = false
  ) => (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={key} className="text-zinc-300 text-sm">{label}</Label>
        {(isOptional || optionalAddressFields.includes(key)) && (
          <div className="flex items-center gap-1.5">
            <Checkbox
              id={`na-${key}`}
              checked={naFields[key] || false}
              onCheckedChange={() => toggleNA(key)}
              className="h-3.5 w-3.5 border-zinc-600 data-[state=checked]:bg-red-600 data-[state=checked]:border-red-600"
            />
            <label htmlFor={`na-${key}`} className="text-xs text-zinc-500 cursor-pointer">N/A</label>
          </div>
        )}
      </div>
      <Input
        id={key}
        type={type}
        value={form[key]}
        onChange={(e) => set(key, e.target.value)}
        disabled={naFields[key]}
        className="bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-600 disabled:opacity-50"
        placeholder={naFields[key] ? "N/A" : `Enter ${label.toLowerCase()}`}
      />
    </div>
  );

  return (
    <div className="min-h-screen bg-black">
      <div className="border-b border-zinc-800 bg-zinc-950">
        <div className="container mx-auto px-4 py-3">
          <img src={candexLogo} alt="PreAppliCheck" className="h-8" />
        </div>
      </div>

      <main className="container mx-auto px-4 py-6 max-w-2xl">
        <Card className="bg-zinc-950 border-zinc-800 text-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <User className="h-5 w-5 text-red-500" />
              Personal Details
            </CardTitle>
            <p className="text-sm text-zinc-400">
              Please complete your personal information below. Use the N/A checkbox if a field is not applicable.
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Names */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Full Names</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {renderField("firstName", "First Name")}
                {renderField("secondName", "Second Name / Middle Name", "text", true)}
              </div>
              {renderField("surname", "Surname")}
            </div>

            {/* ID */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Identification</h3>
              {renderField("idNumber", "ID Number")}
            </div>

            {/* Address */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Physical Address</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {renderField("houseNumber", "House Number", "text", true)}
                {renderField("floorNumber", "Floor Number", "text", true)}
              </div>
              {renderField("streetName", "Street Name")}
              {renderField("complexName", "Complex Name", "text", true)}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {renderField("suburb", "Suburb")}
                {renderField("city", "City")}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {renderField("province", "Province")}
                {renderField("postalCode", "Postal Code")}
              </div>
            </div>

            {/* Contact */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Contact Information</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {renderField("cellphone", "Cellphone Number", "tel")}
                {renderField("email", "Email Address", "email")}
              </div>
            </div>

            <Button
              onClick={handleSubmit}
              className="w-full bg-red-600 hover:bg-red-700 text-white"
            >
              Proceed to Start PreAppliCheck
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
