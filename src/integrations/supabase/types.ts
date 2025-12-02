export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      account_access: {
        Row: {
          account_id: string
          created_at: string
          granted_at: string
          granted_by: string | null
          id: string
          user_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          user_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_access_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts: {
        Row: {
          address: string | null
          code: string
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          code: string
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          code?: string
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          changed_at: string
          changed_by: string | null
          changes_summary: string | null
          id: string
          new_data: Json | null
          old_data: Json | null
          record_id: string
          table_name: string
        }
        Insert: {
          action: string
          changed_at?: string
          changed_by?: string | null
          changes_summary?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id: string
          table_name: string
        }
        Update: {
          action?: string
          changed_at?: string
          changed_by?: string | null
          changes_summary?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string
          table_name?: string
        }
        Relationships: []
      }
      employee_invitations: {
        Row: {
          created_at: string
          created_by: string | null
          email: string
          employee_id: string
          expires_at: string
          failed_attempts: number
          id: string
          invitation_method: string | null
          locked_until: string | null
          otp: string | null
          token: string
          used: boolean
          used_at: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email: string
          employee_id: string
          expires_at?: string
          failed_attempts?: number
          id?: string
          invitation_method?: string | null
          locked_until?: string | null
          otp?: string | null
          token: string
          used?: boolean
          used_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string
          employee_id?: string
          expires_at?: string
          failed_attempts?: number
          id?: string
          invitation_method?: string | null
          locked_until?: string | null
          otp?: string | null
          token?: string
          used?: boolean
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_invitations_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_store_assignments: {
        Row: {
          assigned_at: string
          created_at: string
          employee_id: string
          id: string
          store_id: string
        }
        Insert: {
          assigned_at?: string
          created_at?: string
          employee_id: string
          id?: string
          store_id: string
        }
        Update: {
          assigned_at?: string
          created_at?: string
          employee_id?: string
          id?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_store_assignments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_store_assignments_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          created_at: string
          designation: Database["public"]["Enums"]["designation_type"] | null
          dismissal_document_url: string | null
          dismissal_reason: string | null
          dismissed_at: string | null
          email: string | null
          employee_number: string
          employment_status: Database["public"]["Enums"]["employment_status"]
          id: string
          id_number: string
          last_reminder_sent: string | null
          last_submission_date: string | null
          next_renewal_date: string | null
          store_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          designation?: Database["public"]["Enums"]["designation_type"] | null
          dismissal_document_url?: string | null
          dismissal_reason?: string | null
          dismissed_at?: string | null
          email?: string | null
          employee_number: string
          employment_status?: Database["public"]["Enums"]["employment_status"]
          id?: string
          id_number: string
          last_reminder_sent?: string | null
          last_submission_date?: string | null
          next_renewal_date?: string | null
          store_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          designation?: Database["public"]["Enums"]["designation_type"] | null
          dismissal_document_url?: string | null
          dismissal_reason?: string | null
          dismissed_at?: string | null
          email?: string | null
          employee_number?: string
          employment_status?: Database["public"]["Enums"]["employment_status"]
          id?: string
          id_number?: string
          last_reminder_sent?: string | null
          last_submission_date?: string | null
          next_renewal_date?: string | null
          store_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      examinations: {
        Row: {
          admission_after_exam: string | null
          admission_before_exam: string | null
          created_at: string
          employee_id: string | null
          examination_date: string
          examination_type: Database["public"]["Enums"]["examination_type"]
          examiner_id: string | null
          id: string
          notes: string | null
          report_url: string | null
          result: Database["public"]["Enums"]["examination_result"]
          store_id: string
          updated_at: string
        }
        Insert: {
          admission_after_exam?: string | null
          admission_before_exam?: string | null
          created_at?: string
          employee_id?: string | null
          examination_date: string
          examination_type: Database["public"]["Enums"]["examination_type"]
          examiner_id?: string | null
          id?: string
          notes?: string | null
          report_url?: string | null
          result?: Database["public"]["Enums"]["examination_result"]
          store_id: string
          updated_at?: string
        }
        Update: {
          admission_after_exam?: string | null
          admission_before_exam?: string | null
          created_at?: string
          employee_id?: string | null
          examination_date?: string
          examination_type?: Database["public"]["Enums"]["examination_type"]
          examiner_id?: string | null
          id?: string
          notes?: string | null
          report_url?: string | null
          result?: Database["public"]["Enums"]["examination_result"]
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "examinations_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "examinations_examiner_id_fkey"
            columns: ["examiner_id"]
            isOneToOne: false
            referencedRelation: "examiners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "examinations_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      examiners: {
        Row: {
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      invoice_examinations: {
        Row: {
          created_at: string
          examination_id: string
          id: string
          invoice_id: string
          line_amount: number | null
        }
        Insert: {
          created_at?: string
          examination_id: string
          id?: string
          invoice_id: string
          line_amount?: number | null
        }
        Update: {
          created_at?: string
          examination_id?: string
          id?: string
          invoice_id?: string
          line_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_examinations_examination_id_fkey"
            columns: ["examination_id"]
            isOneToOne: false
            referencedRelation: "examinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_examinations_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          accommodation_amount: number | null
          created_at: string
          discount_amount: number
          extracted_data: Json | null
          id: string
          invoice_date: string
          invoice_number: string
          invoice_url: string | null
          other_amount: number | null
          polygraph_amount: number | null
          risk_assessment_amount: number | null
          store_id: string
          subtotal: number
          tolls_amount: number | null
          total_amount: number
          travel_amount: number | null
          updated_at: string
          vat_amount: number
        }
        Insert: {
          accommodation_amount?: number | null
          created_at?: string
          discount_amount?: number
          extracted_data?: Json | null
          id?: string
          invoice_date: string
          invoice_number: string
          invoice_url?: string | null
          other_amount?: number | null
          polygraph_amount?: number | null
          risk_assessment_amount?: number | null
          store_id: string
          subtotal?: number
          tolls_amount?: number | null
          total_amount?: number
          travel_amount?: number | null
          updated_at?: string
          vat_amount?: number
        }
        Update: {
          accommodation_amount?: number | null
          created_at?: string
          discount_amount?: number
          extracted_data?: Json | null
          id?: string
          invoice_date?: string
          invoice_number?: string
          invoice_url?: string | null
          other_amount?: number | null
          polygraph_amount?: number | null
          risk_assessment_amount?: number | null
          store_id?: string
          subtotal?: number
          tolls_amount?: number | null
          total_amount?: number
          travel_amount?: number | null
          updated_at?: string
          vat_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      next_of_kin: {
        Row: {
          address: string
          contact_number: string
          created_at: string
          first_name: string
          id: string
          last_name: string
          submission_id: string
        }
        Insert: {
          address: string
          contact_number: string
          created_at?: string
          first_name: string
          id?: string
          last_name: string
          submission_id: string
        }
        Update: {
          address?: string
          contact_number?: string
          created_at?: string
          first_name?: string
          id?: string
          last_name?: string
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "next_of_kin_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_document_uploads: {
        Row: {
          account_id: string
          approved_at: string | null
          approved_by: string | null
          confidence_score: number | null
          created_at: string
          document_type: string
          extracted_data: Json | null
          extracted_store_name: string | null
          file_name: string
          file_url: string
          id: string
          matched_store_id: string | null
          rejection_reason: string | null
          status: string
          updated_at: string
          uploaded_by: string
        }
        Insert: {
          account_id: string
          approved_at?: string | null
          approved_by?: string | null
          confidence_score?: number | null
          created_at?: string
          document_type: string
          extracted_data?: Json | null
          extracted_store_name?: string | null
          file_name: string
          file_url: string
          id?: string
          matched_store_id?: string | null
          rejection_reason?: string | null
          status?: string
          updated_at?: string
          uploaded_by: string
        }
        Update: {
          account_id?: string
          approved_at?: string | null
          approved_by?: string | null
          confidence_score?: number | null
          created_at?: string
          document_type?: string
          extracted_data?: Json | null
          extracted_store_name?: string | null
          file_name?: string
          file_url?: string
          id?: string
          matched_store_id?: string | null
          rejection_reason?: string | null
          status?: string
          updated_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_document_uploads_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_document_uploads_matched_store_id_fkey"
            columns: ["matched_store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      popia_acceptances: {
        Row: {
          accepted_at: string
          created_at: string
          declaration_text: string
          device_info: Json | null
          employee_id: string
          gps_latitude: number | null
          gps_longitude: number | null
          id: string
          ip_address: string
        }
        Insert: {
          accepted_at?: string
          created_at?: string
          declaration_text: string
          device_info?: Json | null
          employee_id: string
          gps_latitude?: number | null
          gps_longitude?: number | null
          id?: string
          ip_address: string
        }
        Update: {
          accepted_at?: string
          created_at?: string
          declaration_text?: string
          device_info?: Json | null
          employee_id?: string
          gps_latitude?: number | null
          gps_longitude?: number | null
          id?: string
          ip_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "popia_acceptances_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_requests: {
        Row: {
          created_at: string
          id: string
          message: string
          request_type: Database["public"]["Enums"]["request_type"]
          sender_user_id: string
          status: Database["public"]["Enums"]["request_status"]
          subject: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          request_type: Database["public"]["Enums"]["request_type"]
          sender_user_id: string
          status?: Database["public"]["Enums"]["request_status"]
          subject: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          request_type?: Database["public"]["Enums"]["request_type"]
          sender_user_id?: string
          status?: Database["public"]["Enums"]["request_status"]
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      renewal_requests: {
        Row: {
          created_at: string
          employee_id: string
          id: string
          processed_at: string | null
          processed_by: string | null
          requested_at: string
          requested_via: string
          status: Database["public"]["Enums"]["renewal_request_status"]
        }
        Insert: {
          created_at?: string
          employee_id: string
          id?: string
          processed_at?: string | null
          processed_by?: string | null
          requested_at?: string
          requested_via?: string
          status?: Database["public"]["Enums"]["renewal_request_status"]
        }
        Update: {
          created_at?: string
          employee_id?: string
          id?: string
          processed_at?: string | null
          processed_by?: string | null
          requested_at?: string
          requested_via?: string
          status?: Database["public"]["Enums"]["renewal_request_status"]
        }
        Relationships: [
          {
            foreignKeyName: "renewal_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      request_replies: {
        Row: {
          created_at: string
          id: string
          message: string
          request_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          request_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          request_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_replies_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "profile_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      risk_assessments: {
        Row: {
          assessment_date: string
          assessor_name: string | null
          created_at: string
          criminal_check_status: string | null
          employee_id: string | null
          id: string
          id_verification_status: string | null
          notes: string | null
          report_url: string | null
          result: Database["public"]["Enums"]["risk_assessment_result"]
          store_id: string
          updated_at: string
        }
        Insert: {
          assessment_date: string
          assessor_name?: string | null
          created_at?: string
          criminal_check_status?: string | null
          employee_id?: string | null
          id?: string
          id_verification_status?: string | null
          notes?: string | null
          report_url?: string | null
          result?: Database["public"]["Enums"]["risk_assessment_result"]
          store_id: string
          updated_at?: string
        }
        Update: {
          assessment_date?: string
          assessor_name?: string | null
          created_at?: string
          criminal_check_status?: string | null
          employee_id?: string | null
          id?: string
          id_verification_status?: string | null
          notes?: string | null
          report_url?: string | null
          result?: Database["public"]["Enums"]["risk_assessment_result"]
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "risk_assessments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "risk_assessments_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          account_id: string | null
          center_mall_name: string | null
          contact_number: string | null
          created_at: string
          id: string
          postal_code: string | null
          province: string | null
          shop_number: string | null
          store_code: string
          store_name: string
          street_name: string | null
          street_number: string | null
          town: string | null
        }
        Insert: {
          account_id?: string | null
          center_mall_name?: string | null
          contact_number?: string | null
          created_at?: string
          id?: string
          postal_code?: string | null
          province?: string | null
          shop_number?: string | null
          store_code: string
          store_name: string
          street_name?: string | null
          street_number?: string | null
          town?: string | null
        }
        Update: {
          account_id?: string | null
          center_mall_name?: string | null
          contact_number?: string | null
          created_at?: string
          id?: string
          postal_code?: string | null
          province?: string | null
          shop_number?: string | null
          store_code?: string
          store_name?: string
          street_name?: string | null
          street_number?: string | null
          town?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stores_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      submission_history: {
        Row: {
          archived_at: string
          employee_id: string
          id: string
          submission_data: Json
          submission_date: string
        }
        Insert: {
          archived_at?: string
          employee_id: string
          id?: string
          submission_data: Json
          submission_date: string
        }
        Update: {
          archived_at?: string
          employee_id?: string
          id?: string
          submission_data?: Json
          submission_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "submission_history_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      submissions: {
        Row: {
          city: string | null
          complex_name: string | null
          contact_number: string | null
          created_at: string
          document_verification_details: Json | null
          document_verification_status: string | null
          email: string
          email_verified: boolean | null
          employee_id: string
          employee_number: string
          first_name: string
          flag_reason: string | null
          flagged: boolean | null
          floor_number: string | null
          geofence_distance_meters: number | null
          geofence_verified: boolean | null
          geolocation_lat: number | null
          geolocation_lng: number | null
          house_number: string | null
          id: string
          id_number: string
          id_photo_url: string | null
          id_verification_details: Json | null
          id_verification_status: string | null
          last_name: string
          physical_address: string
          postal_code: string | null
          proof_of_residence_url: string | null
          province: string | null
          status: Database["public"]["Enums"]["submission_status"] | null
          street_name: string | null
          submission_timestamp: string
          suburb: string | null
          updated_at: string
          verification_method: string | null
          verification_token: string | null
          verification_token_expires_at: string | null
          verified_at: string | null
          whatsapp_verified: boolean | null
        }
        Insert: {
          city?: string | null
          complex_name?: string | null
          contact_number?: string | null
          created_at?: string
          document_verification_details?: Json | null
          document_verification_status?: string | null
          email: string
          email_verified?: boolean | null
          employee_id: string
          employee_number: string
          first_name: string
          flag_reason?: string | null
          flagged?: boolean | null
          floor_number?: string | null
          geofence_distance_meters?: number | null
          geofence_verified?: boolean | null
          geolocation_lat?: number | null
          geolocation_lng?: number | null
          house_number?: string | null
          id?: string
          id_number: string
          id_photo_url?: string | null
          id_verification_details?: Json | null
          id_verification_status?: string | null
          last_name: string
          physical_address: string
          postal_code?: string | null
          proof_of_residence_url?: string | null
          province?: string | null
          status?: Database["public"]["Enums"]["submission_status"] | null
          street_name?: string | null
          submission_timestamp?: string
          suburb?: string | null
          updated_at?: string
          verification_method?: string | null
          verification_token?: string | null
          verification_token_expires_at?: string | null
          verified_at?: string | null
          whatsapp_verified?: boolean | null
        }
        Update: {
          city?: string | null
          complex_name?: string | null
          contact_number?: string | null
          created_at?: string
          document_verification_details?: Json | null
          document_verification_status?: string | null
          email?: string
          email_verified?: boolean | null
          employee_id?: string
          employee_number?: string
          first_name?: string
          flag_reason?: string | null
          flagged?: boolean | null
          floor_number?: string | null
          geofence_distance_meters?: number | null
          geofence_verified?: boolean | null
          geolocation_lat?: number | null
          geolocation_lng?: number | null
          house_number?: string | null
          id?: string
          id_number?: string
          id_photo_url?: string | null
          id_verification_details?: Json | null
          id_verification_status?: string | null
          last_name?: string
          physical_address?: string
          postal_code?: string | null
          proof_of_residence_url?: string | null
          province?: string | null
          status?: Database["public"]["Enums"]["submission_status"] | null
          street_name?: string | null
          submission_timestamp?: string
          suburb?: string | null
          updated_at?: string
          verification_method?: string | null
          verification_token?: string | null
          verification_token_expires_at?: string | null
          verified_at?: string | null
          whatsapp_verified?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "submissions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: true
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_next_of_kin: {
        Args: {
          _address: string
          _contact_number: string
          _first_name: string
          _last_name: string
          _submission_id: string
        }
        Returns: string
      }
      assign_user_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      can_access_submission: {
        Args: { _employee_id: string }
        Returns: boolean
      }
      check_submission_rate_limit: {
        Args: { _employee_number: string }
        Returns: boolean
      }
      cleanup_expired_invitation_locks: { Args: never; Returns: undefined }
      cleanup_old_audit_trail: { Args: never; Returns: undefined }
      constant_time_compare: {
        Args: { a: string; b: string }
        Returns: boolean
      }
      create_verified_submission: {
        Args: { submission_data: Json }
        Returns: string
      }
      get_employees_by_store: {
        Args: { _store_id: string }
        Returns: {
          designation: Database["public"]["Enums"]["designation_type"]
          employee_id: string
          employee_number: string
          employment_status: Database["public"]["Enums"]["employment_status"]
          full_name: string
          id_number: string
          is_primary_assignment: boolean
        }[]
      }
      get_master_admin_email: { Args: never; Returns: string }
      get_user_roles: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"][]
      }
      has_account_access: {
        Args: { _account_id: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_master_admin: { Args: { _user_id: string }; Returns: boolean }
      link_employee_to_user: {
        Args: { _employee_id: string; _user_id: string }
        Returns: boolean
      }
      remove_user_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      validate_invitation_token:
        | {
            Args: {
              _employee_number: string
              _id_number: string
              _otp: string
              _token: string
            }
            Returns: {
              email: string
              employee_id: string
              is_valid: boolean
            }[]
          }
        | {
            Args: {
              _employee_number: string
              _id_number: string
              _token: string
            }
            Returns: {
              email: string
              employee_id: string
              is_valid: boolean
            }[]
          }
      validate_invitation_token_and_create_user: {
        Args: {
          _email: string
          _employee_number: string
          _id_number: string
          _otp: string
          _password: string
          _token: string
        }
        Returns: {
          email: string
          employee_id: string
          is_valid: boolean
          user_created: boolean
        }[]
      }
      verify_employee_credentials: {
        Args: { _employee_number: string; _id_number: string }
        Returns: {
          employee_id: string
          is_valid: boolean
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "employee" | "master_admin"
      designation_type:
        | "team_leader"
        | "fdo"
        | "manager"
        | "assistant_manager"
        | "buyer"
        | "sales_person"
        | "cashier"
      employment_status:
        | "active"
        | "dismissed"
        | "suspended"
        | "resigned"
        | "retrenched"
        | "employed"
      examination_result: "pass" | "fail" | "inconclusive" | "pending"
      examination_type: "periodic_screening" | "pre_employment" | "specific"
      renewal_request_status: "pending" | "sent" | "cancelled"
      request_status: "pending" | "in_progress" | "replied" | "closed"
      request_type:
        | "data_management"
        | "polygraph_vetting"
        | "reports_accounts"
        | "general"
      risk_assessment_result: "clear" | "flagged" | "pending"
      submission_status: "pending" | "verified" | "flagged" | "approved"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "employee", "master_admin"],
      designation_type: [
        "team_leader",
        "fdo",
        "manager",
        "assistant_manager",
        "buyer",
        "sales_person",
        "cashier",
      ],
      employment_status: [
        "active",
        "dismissed",
        "suspended",
        "resigned",
        "retrenched",
        "employed",
      ],
      examination_result: ["pass", "fail", "inconclusive", "pending"],
      examination_type: ["periodic_screening", "pre_employment", "specific"],
      renewal_request_status: ["pending", "sent", "cancelled"],
      request_status: ["pending", "in_progress", "replied", "closed"],
      request_type: [
        "data_management",
        "polygraph_vetting",
        "reports_accounts",
        "general",
      ],
      risk_assessment_result: ["clear", "flagged", "pending"],
      submission_status: ["pending", "verified", "flagged", "approved"],
    },
  },
} as const
