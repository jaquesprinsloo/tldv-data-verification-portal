import { z } from "zod";

// South African ID number validation (13 digits)
const saIdNumberRegex = /^\d{13}$/;

// Phone number validation (South African format)
const phoneRegex = /^(\+27|0)[0-9]{9}$/;

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

// Address validation
const addressSchema = z.string()
  .trim()
  .min(5, { message: "Address must be at least 5 characters" })
  .max(500, { message: "Address must be less than 500 characters" });

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
    .regex(phoneRegex, { message: "Invalid phone number. Use format: 0123456789 or +27123456789" }),
  
  physicalAddress: z.string()
    .trim()
    .min(1, { message: "Physical address is required" })
    .max(500, { message: "Address must be less than 500 characters" }),
  
  houseNumber: z.string()
    .trim()
    .max(20, { message: "House number must be less than 20 characters" })
    .optional(),
  
  floorNumber: z.string()
    .trim()
    .max(10, { message: "Floor number must be less than 10 characters" })
    .optional(),
  
  streetName: z.string()
    .trim()
    .max(200, { message: "Street name must be less than 200 characters" })
    .optional(),
  
  complexName: z.string()
    .trim()
    .max(200, { message: "Complex name must be less than 200 characters" })
    .optional(),
  
  suburb: z.string()
    .trim()
    .max(100, { message: "Suburb must be less than 100 characters" })
    .optional(),
  
  city: z.string()
    .trim()
    .max(100, { message: "City must be less than 100 characters" })
    .optional(),
  
  province: z.string()
    .trim()
    .max(100, { message: "Province must be less than 100 characters" })
    .optional(),
  
  postalCode: z.string()
    .trim()
    .max(10, { message: "Postal code must be less than 10 characters" })
    .optional(),
  
  nextOfKinFirstName: nameSchema,
  
  nextOfKinLastName: nameSchema,
  
  nextOfKinContact: z.string()
    .trim()
    .regex(phoneRegex, { message: "Invalid phone number. Use format: 0123456789 or +27123456789" }),
  
  nextOfKinAddress: addressSchema,
});

export type EmployeeSubmissionFormData = z.infer<typeof employeeSubmissionSchema>;
