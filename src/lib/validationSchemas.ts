import { z } from "zod";

// South African ID number validation (13 digits)
const saIdNumberRegex = /^\d{13}$/;

// Email validation with length limit
const emailSchema = z.string()
  .trim()
  .email({ message: "Invalid email address" })
  .max(255, { message: "Email must be less than 255 characters" });

// Name validation
const nameSchema = z.string()
  .trim()
  .min(1, { message: "This field is required" })
  .max(100, { message: "Must be less than 100 characters" })
  .regex(/^[a-zA-Z\s'-]+$/, { message: "Only letters, spaces, hyphens and apostrophes allowed" });

// Optional field that allows empty string or N/A
const optionalFieldSchema = (maxLength: number, message: string) => z.string()
  .trim()
  .max(maxLength, { message })
  .optional()
  .or(z.literal(""))
  .or(z.literal("N/A"))
  .or(z.literal("n/a"));

// Employee submission form schema
export const employeeSubmissionSchema = z.object({
  employeeNumber: z.string()
    .trim()
    .min(1, { message: "Employee number is required" })
    .max(50, { message: "Employee number must be less than 50 characters" }),
  
  idNumber: z.string()
    .trim()
    .regex(saIdNumberRegex, { message: "ID number must be exactly 13 digits" }),
  
  firstName: nameSchema,
  
  lastName: nameSchema,
  
  email: emailSchema,
  
  contactNumber: z.string()
    .trim()
    .transform(val => val.replace(/\s+/g, ''))
    .refine(val => /^(\+27|0)[0-9]{9}$/.test(val), { 
      message: "Invalid phone number. Use format: 0123456789 or +27123456789" 
    }),
  
  // Address fields - all optional and allow N/A
  physicalAddress: optionalFieldSchema(500, "Address must be less than 500 characters"),
  houseNumber: optionalFieldSchema(20, "House number must be less than 20 characters"),
  floorNumber: optionalFieldSchema(10, "Floor number must be less than 10 characters"),
  streetName: optionalFieldSchema(200, "Street name must be less than 200 characters"),
  complexName: optionalFieldSchema(200, "Complex name must be less than 200 characters"),
  suburb: optionalFieldSchema(100, "Suburb must be less than 100 characters"),
  city: optionalFieldSchema(100, "City must be less than 100 characters"),
  province: optionalFieldSchema(100, "Province must be less than 100 characters"),
  postalCode: optionalFieldSchema(10, "Postal code must be less than 10 characters"),
  
  // Next of kin fields
  nextOfKinFirstName: nameSchema,
  nextOfKinLastName: nameSchema,
  
  nextOfKinContact: z.string()
    .trim()
    .transform(val => val.replace(/\s+/g, ''))
    .refine(val => /^(\+27|0)[0-9]{9}$/.test(val), { 
      message: "Invalid phone number. Use format: 0123456789 or +27123456789" 
    }),
  
  nextOfKinRelationship: optionalFieldSchema(100, "Relationship must be less than 100 characters"),
  
  // Next of kin address fields - all optional and allow N/A
  nextOfKinHouseNumber: optionalFieldSchema(20, "House number must be less than 20 characters"),
  nextOfKinFloorNumber: optionalFieldSchema(10, "Floor number must be less than 10 characters"),
  nextOfKinStreetName: optionalFieldSchema(200, "Street name must be less than 200 characters"),
  nextOfKinComplexName: optionalFieldSchema(200, "Complex name must be less than 200 characters"),
  nextOfKinSuburb: optionalFieldSchema(100, "Suburb must be less than 100 characters"),
  nextOfKinCity: optionalFieldSchema(100, "City must be less than 100 characters"),
  nextOfKinProvince: optionalFieldSchema(100, "Province must be less than 100 characters"),
  nextOfKinPostalCode: optionalFieldSchema(10, "Postal code must be less than 10 characters"),
});

export type EmployeeSubmissionFormData = z.infer<typeof employeeSubmissionSchema>;
