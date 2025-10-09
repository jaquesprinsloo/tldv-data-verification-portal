-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'employee');

-- Create enum for submission status
CREATE TYPE public.submission_status AS ENUM ('pending', 'verified', 'flagged', 'approved');

-- Create stores table
CREATE TABLE public.stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_name TEXT NOT NULL,
  store_code TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

-- Create employees table
CREATE TABLE public.employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  employee_number TEXT UNIQUE NOT NULL,
  id_number TEXT NOT NULL,
  store_id UUID REFERENCES public.stores(id),
  unique_link_token TEXT UNIQUE NOT NULL,
  link_expires_at TIMESTAMPTZ,
  email_verified BOOLEAN DEFAULT false,
  last_submission_date TIMESTAMPTZ,
  next_renewal_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create submissions table (current active submission)
CREATE TABLE public.submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE NOT NULL UNIQUE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  id_number TEXT NOT NULL,
  physical_address TEXT NOT NULL,
  email TEXT NOT NULL,
  employee_number TEXT NOT NULL,
  selfie_photo_url TEXT,
  id_photo_url TEXT,
  geolocation_lat DECIMAL(10, 8),
  geolocation_lng DECIMAL(11, 8),
  geofence_verified BOOLEAN DEFAULT false,
  geofence_distance_meters DECIMAL(10, 2),
  submission_timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  status submission_status DEFAULT 'pending',
  flagged BOOLEAN DEFAULT false,
  flag_reason TEXT,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create next_of_kin table
CREATE TABLE public.next_of_kin (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID REFERENCES public.submissions(id) ON DELETE CASCADE NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  address TEXT NOT NULL,
  contact_number TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create submission_history table (24-month audit trail)
CREATE TABLE public.submission_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE NOT NULL,
  submission_data JSONB NOT NULL,
  submission_date TIMESTAMPTZ NOT NULL,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create storage buckets for photos
INSERT INTO storage.buckets (id, name, public) 
VALUES 
  ('employee-selfies', 'employee-selfies', false),
  ('employee-ids', 'employee-ids', false);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.next_of_kin ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submission_history ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- RLS Policies for profiles
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- RLS Policies for user_roles
CREATE POLICY "Admins can view all roles"
  ON public.user_roles FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view own roles"
  ON public.user_roles FOR SELECT
  USING (user_id = auth.uid());

-- RLS Policies for stores
CREATE POLICY "Admins can manage stores"
  ON public.stores FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Employees can view stores"
  ON public.stores FOR SELECT
  USING (true);

-- RLS Policies for employees
CREATE POLICY "Admins can view all employees"
  ON public.employees FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Employees can view own record"
  ON public.employees FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Employees can update own record"
  ON public.employees FOR UPDATE
  USING (user_id = auth.uid());

-- RLS Policies for submissions
CREATE POLICY "Admins can view all submissions"
  ON public.submissions FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Employees can view own submissions"
  ON public.submissions FOR SELECT
  USING (
    employee_id IN (
      SELECT id FROM public.employees WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Employees can insert own submissions"
  ON public.submissions FOR INSERT
  WITH CHECK (
    employee_id IN (
      SELECT id FROM public.employees WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Employees can update own submissions"
  ON public.submissions FOR UPDATE
  USING (
    employee_id IN (
      SELECT id FROM public.employees WHERE user_id = auth.uid()
    )
  );

-- RLS Policies for next_of_kin
CREATE POLICY "Admins can view all next of kin"
  ON public.next_of_kin FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Employees can view own next of kin"
  ON public.next_of_kin FOR SELECT
  USING (
    submission_id IN (
      SELECT s.id FROM public.submissions s
      JOIN public.employees e ON s.employee_id = e.id
      WHERE e.user_id = auth.uid()
    )
  );

CREATE POLICY "Employees can insert own next of kin"
  ON public.next_of_kin FOR INSERT
  WITH CHECK (
    submission_id IN (
      SELECT s.id FROM public.submissions s
      JOIN public.employees e ON s.employee_id = e.id
      WHERE e.user_id = auth.uid()
    )
  );

-- RLS Policies for submission_history
CREATE POLICY "Admins can view all submission history"
  ON public.submission_history FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Employees can view own submission history"
  ON public.submission_history FOR SELECT
  USING (
    employee_id IN (
      SELECT id FROM public.employees WHERE user_id = auth.uid()
    )
  );

-- Storage policies for employee-selfies bucket
CREATE POLICY "Admins can view all selfies"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'employee-selfies' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Employees can view own selfies"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'employee-selfies' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Employees can upload own selfies"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'employee-selfies' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Storage policies for employee-ids bucket
CREATE POLICY "Admins can view all ID photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'employee-ids' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Employees can view own ID photos"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'employee-ids' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Employees can upload own ID photos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'employee-ids' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Create trigger function for updating timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for timestamp updates
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_employees_updated_at
  BEFORE UPDATE ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_submissions_updated_at
  BEFORE UPDATE ON public.submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Function to archive old submission when new one is created
CREATE OR REPLACE FUNCTION public.archive_old_submission()
RETURNS TRIGGER AS $$
BEGIN
  -- Archive existing submission to history
  INSERT INTO public.submission_history (employee_id, submission_data, submission_date)
  SELECT 
    s.employee_id,
    row_to_json(s)::jsonb,
    s.submission_timestamp
  FROM public.submissions s
  WHERE s.employee_id = NEW.employee_id;
  
  -- Delete old submission
  DELETE FROM public.submissions WHERE employee_id = NEW.employee_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to archive before insert
CREATE TRIGGER archive_submission_before_new
  BEFORE INSERT ON public.submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.archive_old_submission();

-- Function to clean up old audit trail (older than 24 months)
CREATE OR REPLACE FUNCTION public.cleanup_old_audit_trail()
RETURNS void AS $$
BEGIN
  DELETE FROM public.submission_history
  WHERE archived_at < now() - INTERVAL '24 months';
END;
$$ LANGUAGE plpgsql;

-- Function to handle new user profile creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  );
  RETURN NEW;
END;
$$;

-- Trigger to create profile on user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();