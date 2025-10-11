-- Add 'employed' to employment_status enum
ALTER TYPE employment_status ADD VALUE IF NOT EXISTS 'employed';