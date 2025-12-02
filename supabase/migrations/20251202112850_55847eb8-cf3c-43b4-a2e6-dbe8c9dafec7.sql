-- Create accounts/clients table (e.g., Cash Crusaders)
CREATE TABLE public.accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    contact_email TEXT,
    contact_phone TEXT,
    address TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add account_id to stores table
ALTER TABLE public.stores ADD COLUMN account_id UUID REFERENCES public.accounts(id);

-- Create examiners table
CREATE TABLE public.examiners (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create examination types enum
CREATE TYPE public.examination_type AS ENUM ('periodic_screening', 'pre_employment', 'specific');

-- Create examination result enum
CREATE TYPE public.examination_result AS ENUM ('pass', 'fail', 'inconclusive', 'pending');

-- Create examinations table
CREATE TABLE public.examinations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID REFERENCES public.stores(id) NOT NULL,
    examiner_id UUID REFERENCES public.examiners(id),
    employee_id UUID REFERENCES public.employees(id),
    examination_type examination_type NOT NULL,
    examination_date DATE NOT NULL,
    result examination_result NOT NULL DEFAULT 'pending',
    admission_before_exam TEXT,
    admission_after_exam TEXT,
    notes TEXT,
    report_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create invoices table
CREATE TABLE public.invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID REFERENCES public.stores(id) NOT NULL,
    invoice_number TEXT NOT NULL,
    invoice_date DATE NOT NULL,
    subtotal DECIMAL(10,2) NOT NULL DEFAULT 0,
    vat_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    total_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    invoice_url TEXT,
    extracted_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Link invoices to examinations
CREATE TABLE public.invoice_examinations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID REFERENCES public.invoices(id) ON DELETE CASCADE NOT NULL,
    examination_id UUID REFERENCES public.examinations(id) ON DELETE CASCADE NOT NULL,
    line_amount DECIMAL(10,2),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(invoice_id, examination_id)
);

-- Enable RLS
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.examiners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.examinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_examinations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for accounts
CREATE POLICY "Admins can view all accounts" ON public.accounts FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can insert accounts" ON public.accounts FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update accounts" ON public.accounts FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete accounts" ON public.accounts FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for examiners
CREATE POLICY "Admins can view all examiners" ON public.examiners FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can insert examiners" ON public.examiners FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update examiners" ON public.examiners FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete examiners" ON public.examiners FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for examinations
CREATE POLICY "Admins can view all examinations" ON public.examinations FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can insert examinations" ON public.examinations FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update examinations" ON public.examinations FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete examinations" ON public.examinations FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for invoices
CREATE POLICY "Admins can view all invoices" ON public.invoices FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can insert invoices" ON public.invoices FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update invoices" ON public.invoices FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete invoices" ON public.invoices FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for invoice_examinations
CREATE POLICY "Admins can view all invoice_examinations" ON public.invoice_examinations FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can insert invoice_examinations" ON public.invoice_examinations FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update invoice_examinations" ON public.invoice_examinations FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete invoice_examinations" ON public.invoice_examinations FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

-- Add triggers for updated_at
CREATE TRIGGER update_accounts_updated_at BEFORE UPDATE ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_examiners_updated_at BEFORE UPDATE ON public.examiners FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_examinations_updated_at BEFORE UPDATE ON public.examinations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add audit triggers
CREATE TRIGGER audit_accounts AFTER INSERT OR UPDATE OR DELETE ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.log_audit_trail();
CREATE TRIGGER audit_examiners AFTER INSERT OR UPDATE OR DELETE ON public.examiners FOR EACH ROW EXECUTE FUNCTION public.log_audit_trail();
CREATE TRIGGER audit_examinations AFTER INSERT OR UPDATE OR DELETE ON public.examinations FOR EACH ROW EXECUTE FUNCTION public.log_audit_trail();
CREATE TRIGGER audit_invoices AFTER INSERT OR UPDATE OR DELETE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.log_audit_trail();