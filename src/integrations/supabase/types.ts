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
      candex_ai_usage: {
        Row: {
          application_id: string | null
          created_at: string
          function_name: string
          id: string
          input_tokens: number
          metadata: Json | null
          model: string
          output_tokens: number
          usd_cost: number
        }
        Insert: {
          application_id?: string | null
          created_at?: string
          function_name: string
          id?: string
          input_tokens?: number
          metadata?: Json | null
          model: string
          output_tokens?: number
          usd_cost?: number
        }
        Update: {
          application_id?: string | null
          created_at?: string
          function_name?: string
          id?: string
          input_tokens?: number
          metadata?: Json | null
          model?: string
          output_tokens?: number
          usd_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "candex_ai_usage_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "candex_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      candex_applications: {
        Row: {
          answers: Json | null
          candidate_email: string | null
          candidate_id_number: string | null
          candidate_name: string
          candidate_phone: string | null
          client_id: string
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          deleted_by_name: string | null
          id: string
          invitation_id: string | null
          risk_level: string | null
          risk_score: number | null
          status: string
          submitted_at: string | null
          template_id: string | null
          updated_at: string
        }
        Insert: {
          answers?: Json | null
          candidate_email?: string | null
          candidate_id_number?: string | null
          candidate_name: string
          candidate_phone?: string | null
          client_id: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_by_name?: string | null
          id?: string
          invitation_id?: string | null
          risk_level?: string | null
          risk_score?: number | null
          status?: string
          submitted_at?: string | null
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          answers?: Json | null
          candidate_email?: string | null
          candidate_id_number?: string | null
          candidate_name?: string
          candidate_phone?: string | null
          client_id?: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_by_name?: string | null
          id?: string
          invitation_id?: string | null
          risk_level?: string | null
          risk_score?: number | null
          status?: string
          submitted_at?: string | null
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "candex_applications_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "candex_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candex_applications_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "candex_invitations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candex_applications_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "candex_questionnaire_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      candex_clients: {
        Row: {
          account_id: string | null
          company_name: string | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          template_id: string | null
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          company_name?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          company_name?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "candex_clients_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candex_clients_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "candex_questionnaire_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      candex_invitations: {
        Row: {
          candidate_email: string | null
          candidate_id_number: string | null
          candidate_name: string
          candidate_phone: string | null
          client_id: string
          created_at: string
          created_by: string | null
          id: string
          sent_at: string | null
          status: string
          template_id: string | null
          token: string
          updated_at: string
        }
        Insert: {
          candidate_email?: string | null
          candidate_id_number?: string | null
          candidate_name: string
          candidate_phone?: string | null
          client_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          sent_at?: string | null
          status?: string
          template_id?: string | null
          token?: string
          updated_at?: string
        }
        Update: {
          candidate_email?: string | null
          candidate_id_number?: string | null
          candidate_name?: string
          candidate_phone?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          sent_at?: string | null
          status?: string
          template_id?: string | null
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "candex_invitations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "candex_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candex_invitations_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "candex_questionnaire_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      candex_questionnaire_templates: {
        Row: {
          brief_video_url: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          intro_video_url: string | null
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          brief_video_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          intro_video_url?: string | null
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          brief_video_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          intro_video_url?: string | null
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      candex_risk_request_candidates: {
        Row: {
          application_id: string
          check_results: Json
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          deleted_by_name: string | null
          id: string
          id_verified: boolean | null
          request_id: string
          risk_assessment_result: string | null
          risk_assessment_url: string | null
        }
        Insert: {
          application_id: string
          check_results?: Json
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_by_name?: string | null
          id?: string
          id_verified?: boolean | null
          request_id: string
          risk_assessment_result?: string | null
          risk_assessment_url?: string | null
        }
        Update: {
          application_id?: string
          check_results?: Json
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_by_name?: string | null
          id?: string
          id_verified?: boolean | null
          request_id?: string
          risk_assessment_result?: string | null
          risk_assessment_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "candex_risk_request_candidates_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "candex_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candex_risk_request_candidates_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "candex_risk_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      candex_risk_requests: {
        Row: {
          account_id: string | null
          client_id: string
          created_at: string
          id: string
          notes: string | null
          requested_by: string
          requested_checks: Json
          requested_date: string
          status: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          client_id: string
          created_at?: string
          id?: string
          notes?: string | null
          requested_by: string
          requested_checks?: Json
          requested_date?: string
          status?: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          client_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          requested_by?: string
          requested_checks?: Json
          requested_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "candex_risk_requests_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candex_risk_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "candex_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      candex_section_tables: {
        Row: {
          column_headers: Json
          column_widths: Json | null
          created_at: string
          id: string
          is_repeatable: boolean
          row_input_types: Json | null
          row_labels: Json
          row_video_urls: Json | null
          section_id: string
          sort_order: number
          table_title: string
          video_url: string | null
        }
        Insert: {
          column_headers?: Json
          column_widths?: Json | null
          created_at?: string
          id?: string
          is_repeatable?: boolean
          row_input_types?: Json | null
          row_labels?: Json
          row_video_urls?: Json | null
          section_id: string
          sort_order?: number
          table_title: string
          video_url?: string | null
        }
        Update: {
          column_headers?: Json
          column_widths?: Json | null
          created_at?: string
          id?: string
          is_repeatable?: boolean
          row_input_types?: Json | null
          row_labels?: Json
          row_video_urls?: Json | null
          section_id?: string
          sort_order?: number
          table_title?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "candex_section_tables_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "candex_template_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      candex_template_questions: {
        Row: {
          created_at: string
          id: string
          is_required: boolean
          options: Json | null
          question_text: string
          question_type: string
          section_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_required?: boolean
          options?: Json | null
          question_text: string
          question_type?: string
          section_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_required?: boolean
          options?: Json | null
          question_text?: string
          question_type?: string
          section_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "candex_template_questions_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "candex_template_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      candex_template_sections: {
        Row: {
          created_at: string
          id: string
          sort_order: number
          template_id: string
          title: string
          video_url: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          sort_order?: number
          template_id: string
          title: string
          video_url?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          sort_order?: number
          template_id?: string
          title?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "candex_template_sections_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "candex_questionnaire_templates"
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
      manual_risk_candidates: {
        Row: {
          created_at: string
          credit_notes: string | null
          credit_result: string | null
          criminal_notes: string | null
          criminal_result: string | null
          drivers_license_notes: string | null
          drivers_license_result: string | null
          first_name: string
          id: string
          id_number: string
          id_verification_notes: string | null
          id_verification_result: string | null
          pdp_notes: string | null
          pdp_result: string | null
          qualification_notes: string | null
          qualification_result: string | null
          risk_assessment_notes: string | null
          risk_assessment_result: string | null
          sort_order: number
          submission_id: string
          surname: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          credit_notes?: string | null
          credit_result?: string | null
          criminal_notes?: string | null
          criminal_result?: string | null
          drivers_license_notes?: string | null
          drivers_license_result?: string | null
          first_name: string
          id?: string
          id_number: string
          id_verification_notes?: string | null
          id_verification_result?: string | null
          pdp_notes?: string | null
          pdp_result?: string | null
          qualification_notes?: string | null
          qualification_result?: string | null
          risk_assessment_notes?: string | null
          risk_assessment_result?: string | null
          sort_order?: number
          submission_id: string
          surname: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          credit_notes?: string | null
          credit_result?: string | null
          criminal_notes?: string | null
          criminal_result?: string | null
          drivers_license_notes?: string | null
          drivers_license_result?: string | null
          first_name?: string
          id?: string
          id_number?: string
          id_verification_notes?: string | null
          id_verification_result?: string | null
          pdp_notes?: string | null
          pdp_result?: string | null
          qualification_notes?: string | null
          qualification_result?: string | null
          risk_assessment_notes?: string | null
          risk_assessment_result?: string | null
          sort_order?: number
          submission_id?: string
          surname?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "manual_risk_candidates_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "manual_risk_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      manual_risk_clients: {
        Row: {
          address: string | null
          client_name: string
          contact_person: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          client_name: string
          contact_person?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          client_name?: string
          contact_person?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      manual_risk_settings: {
        Row: {
          created_at: string
          id: string
          singleton: boolean
          terms_and_conditions: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          singleton?: boolean
          terms_and_conditions?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          singleton?: boolean
          terms_and_conditions?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      manual_risk_submissions: {
        Row: {
          client_id: string | null
          created_at: string
          created_by: string | null
          id: string
          indemnity_files: Json
          invoice_file_path: string | null
          invoice_number: string | null
          invoiced_at: string | null
          notes: string | null
          order_number: string
          report_onedrive_item_id: string | null
          report_onedrive_path: string | null
          report_onedrive_web_url: string | null
          requested_checks: string[]
          sent_at: string | null
          status: string
          submission_type: string
          supplier_report_files: Json
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          indemnity_files?: Json
          invoice_file_path?: string | null
          invoice_number?: string | null
          invoiced_at?: string | null
          notes?: string | null
          order_number: string
          report_onedrive_item_id?: string | null
          report_onedrive_path?: string | null
          report_onedrive_web_url?: string | null
          requested_checks?: string[]
          sent_at?: string | null
          status?: string
          submission_type: string
          supplier_report_files?: Json
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          indemnity_files?: Json
          invoice_file_path?: string | null
          invoice_number?: string | null
          invoiced_at?: string | null
          notes?: string | null
          order_number?: string
          report_onedrive_item_id?: string | null
          report_onedrive_path?: string | null
          report_onedrive_web_url?: string | null
          requested_checks?: string[]
          sent_at?: string | null
          status?: string
          submission_type?: string
          supplier_report_files?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "manual_risk_submissions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "manual_risk_clients"
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
      pending_polygraph_uploads: {
        Row: {
          account_id: string | null
          contact_number: string | null
          converted_pdf_url: string | null
          created_at: string
          email: string | null
          examination_date: string | null
          examiner_id: string | null
          extracted_data: Json | null
          first_name: string | null
          id: string
          id_number: string | null
          last_name: string | null
          onedrive_recordings: Json
          original_file_name: string
          original_file_url: string
          overall_result: string | null
          physical_address: string | null
          position_applying_for: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          risk_analysis: Json | null
          risk_level: string | null
          risk_score: number | null
          status: string
          store_id: string | null
          updated_at: string
          uploaded_by: string
        }
        Insert: {
          account_id?: string | null
          contact_number?: string | null
          converted_pdf_url?: string | null
          created_at?: string
          email?: string | null
          examination_date?: string | null
          examiner_id?: string | null
          extracted_data?: Json | null
          first_name?: string | null
          id?: string
          id_number?: string | null
          last_name?: string | null
          onedrive_recordings?: Json
          original_file_name: string
          original_file_url: string
          overall_result?: string | null
          physical_address?: string | null
          position_applying_for?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          risk_analysis?: Json | null
          risk_level?: string | null
          risk_score?: number | null
          status?: string
          store_id?: string | null
          updated_at?: string
          uploaded_by: string
        }
        Update: {
          account_id?: string | null
          contact_number?: string | null
          converted_pdf_url?: string | null
          created_at?: string
          email?: string | null
          examination_date?: string | null
          examiner_id?: string | null
          extracted_data?: Json | null
          first_name?: string | null
          id?: string
          id_number?: string | null
          last_name?: string | null
          onedrive_recordings?: Json
          original_file_name?: string
          original_file_url?: string
          overall_result?: string | null
          physical_address?: string | null
          position_applying_for?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          risk_analysis?: Json | null
          risk_level?: string | null
          risk_score?: number | null
          status?: string
          store_id?: string | null
          updated_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_polygraph_uploads_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_polygraph_uploads_examiner_id_fkey"
            columns: ["examiner_id"]
            isOneToOne: false
            referencedRelation: "examiners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_polygraph_uploads_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      polygraph_admissions: {
        Row: {
          category: string
          confirmed: boolean
          created_at: string
          details: Json | null
          id: string
          notes: string | null
          report_id: string
          time_window:
            | Database["public"]["Enums"]["admission_time_window"]
            | null
        }
        Insert: {
          category: string
          confirmed?: boolean
          created_at?: string
          details?: Json | null
          id?: string
          notes?: string | null
          report_id: string
          time_window?:
            | Database["public"]["Enums"]["admission_time_window"]
            | null
        }
        Update: {
          category?: string
          confirmed?: boolean
          created_at?: string
          details?: Json | null
          id?: string
          notes?: string | null
          report_id?: string
          time_window?:
            | Database["public"]["Enums"]["admission_time_window"]
            | null
        }
        Relationships: [
          {
            foreignKeyName: "polygraph_admissions_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "polygraph_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      polygraph_appointment_candidates: {
        Row: {
          application_id: string
          appointment_id: string
          candidate_id_number: string | null
          candidate_name: string
          created_at: string
          id: string
        }
        Insert: {
          application_id: string
          appointment_id: string
          candidate_id_number?: string | null
          candidate_name: string
          created_at?: string
          id?: string
        }
        Update: {
          application_id?: string
          appointment_id?: string
          candidate_id_number?: string | null
          candidate_name?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "polygraph_appointment_candidates_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "candex_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "polygraph_appointment_candidates_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "polygraph_appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      polygraph_appointments: {
        Row: {
          account_id: string | null
          assigned_examiner_user_id: string | null
          booking_reference: string | null
          client_id: string
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          deleted_by_name: string | null
          examiner_id: string | null
          id: string
          notes: string | null
          preferred_area: string | null
          requested_by: string
          scheduled_date: string | null
          scheduled_time: string | null
          status: string
          store_id: string | null
          updated_at: string
          venue_address: string | null
          venue_id: string | null
          venue_type: string
        }
        Insert: {
          account_id?: string | null
          assigned_examiner_user_id?: string | null
          booking_reference?: string | null
          client_id: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_by_name?: string | null
          examiner_id?: string | null
          id?: string
          notes?: string | null
          preferred_area?: string | null
          requested_by: string
          scheduled_date?: string | null
          scheduled_time?: string | null
          status?: string
          store_id?: string | null
          updated_at?: string
          venue_address?: string | null
          venue_id?: string | null
          venue_type?: string
        }
        Update: {
          account_id?: string | null
          assigned_examiner_user_id?: string | null
          booking_reference?: string | null
          client_id?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_by_name?: string | null
          examiner_id?: string | null
          id?: string
          notes?: string | null
          preferred_area?: string | null
          requested_by?: string
          scheduled_date?: string | null
          scheduled_time?: string | null
          status?: string
          store_id?: string | null
          updated_at?: string
          venue_address?: string | null
          venue_id?: string | null
          venue_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "polygraph_appointments_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "polygraph_appointments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "candex_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "polygraph_appointments_examiner_id_fkey"
            columns: ["examiner_id"]
            isOneToOne: false
            referencedRelation: "examiners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "polygraph_appointments_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "polygraph_appointments_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "polygraph_venues"
            referencedColumns: ["id"]
          },
        ]
      }
      polygraph_batches: {
        Row: {
          created_at: string
          created_by: string | null
          examination_date: string
          examiner_id: string | null
          id: string
          invoice_id: string | null
          name: string | null
          notes: string | null
          processed_reports: number
          status: string
          store_id: string | null
          total_reports: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          examination_date?: string
          examiner_id?: string | null
          id?: string
          invoice_id?: string | null
          name?: string | null
          notes?: string | null
          processed_reports?: number
          status?: string
          store_id?: string | null
          total_reports?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          examination_date?: string
          examiner_id?: string | null
          id?: string
          invoice_id?: string | null
          name?: string | null
          notes?: string | null
          processed_reports?: number
          status?: string
          store_id?: string | null
          total_reports?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "polygraph_batches_examiner_id_fkey"
            columns: ["examiner_id"]
            isOneToOne: false
            referencedRelation: "examiners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "polygraph_batches_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "polygraph_batches_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      polygraph_exam_questions: {
        Row: {
          created_at: string
          finding: Database["public"]["Enums"]["exam_question_finding"] | null
          id: string
          question_number: number
          question_text: string
          report_id: string
          response: boolean | null
        }
        Insert: {
          created_at?: string
          finding?: Database["public"]["Enums"]["exam_question_finding"] | null
          id?: string
          question_number: number
          question_text: string
          report_id: string
          response?: boolean | null
        }
        Update: {
          created_at?: string
          finding?: Database["public"]["Enums"]["exam_question_finding"] | null
          id?: string
          question_number?: number
          question_text?: string
          report_id?: string
          response?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "polygraph_exam_questions_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "polygraph_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      polygraph_reports: {
        Row: {
          batch_id: string | null
          candidate_photo_url: string | null
          contact_number: string | null
          created_at: string
          education_history: Json | null
          email: string | null
          employment_history: Json | null
          examination_date: string
          examiner_id: string | null
          examiner_notes: string | null
          extracted_disclosure: Json | null
          family_criminal_history: Json | null
          financial_circumstances: Json | null
          first_name: string
          friend_criminal_history: Json | null
          id: string
          id_number: string
          last_name: string
          onedrive_recordings: Json
          overall_result:
            | Database["public"]["Enums"]["polygraph_overall_result"]
            | null
          permits_licensing: Json | null
          personal_law_encounters: Json | null
          physical_address: string | null
          position_applying_for: string | null
          post_exam_admissions: string | null
          report_pdf_url: string | null
          risk_analysis: Json | null
          risk_level: string | null
          risk_score: number | null
          status: Database["public"]["Enums"]["polygraph_report_status"]
          store_id: string | null
          updated_at: string
          uploaded_by: string | null
          vetting_types: Json | null
        }
        Insert: {
          batch_id?: string | null
          candidate_photo_url?: string | null
          contact_number?: string | null
          created_at?: string
          education_history?: Json | null
          email?: string | null
          employment_history?: Json | null
          examination_date: string
          examiner_id?: string | null
          examiner_notes?: string | null
          extracted_disclosure?: Json | null
          family_criminal_history?: Json | null
          financial_circumstances?: Json | null
          first_name: string
          friend_criminal_history?: Json | null
          id?: string
          id_number: string
          last_name: string
          onedrive_recordings?: Json
          overall_result?:
            | Database["public"]["Enums"]["polygraph_overall_result"]
            | null
          permits_licensing?: Json | null
          personal_law_encounters?: Json | null
          physical_address?: string | null
          position_applying_for?: string | null
          post_exam_admissions?: string | null
          report_pdf_url?: string | null
          risk_analysis?: Json | null
          risk_level?: string | null
          risk_score?: number | null
          status?: Database["public"]["Enums"]["polygraph_report_status"]
          store_id?: string | null
          updated_at?: string
          uploaded_by?: string | null
          vetting_types?: Json | null
        }
        Update: {
          batch_id?: string | null
          candidate_photo_url?: string | null
          contact_number?: string | null
          created_at?: string
          education_history?: Json | null
          email?: string | null
          employment_history?: Json | null
          examination_date?: string
          examiner_id?: string | null
          examiner_notes?: string | null
          extracted_disclosure?: Json | null
          family_criminal_history?: Json | null
          financial_circumstances?: Json | null
          first_name?: string
          friend_criminal_history?: Json | null
          id?: string
          id_number?: string
          last_name?: string
          onedrive_recordings?: Json
          overall_result?:
            | Database["public"]["Enums"]["polygraph_overall_result"]
            | null
          permits_licensing?: Json | null
          personal_law_encounters?: Json | null
          physical_address?: string | null
          position_applying_for?: string | null
          post_exam_admissions?: string | null
          report_pdf_url?: string | null
          risk_analysis?: Json | null
          risk_level?: string | null
          risk_score?: number | null
          status?: Database["public"]["Enums"]["polygraph_report_status"]
          store_id?: string | null
          updated_at?: string
          uploaded_by?: string | null
          vetting_types?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "polygraph_reports_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "polygraph_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "polygraph_reports_examiner_id_fkey"
            columns: ["examiner_id"]
            isOneToOne: false
            referencedRelation: "examiners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "polygraph_reports_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      polygraph_suitability: {
        Row: {
          alcohol_details: string | null
          breathing_trouble: boolean | null
          created_at: string
          diabetic: boolean | null
          drug_use_details: string | null
          enough_sleep: boolean | null
          health_status: string | null
          heart_conditions: boolean | null
          hospitalized_details: string | null
          hospitalized_recently: boolean | null
          id: string
          medication_details: string | null
          medication_taken: boolean | null
          pregnant: boolean | null
          psychological_disorders: boolean | null
          recent_alcohol_use: boolean | null
          recent_drug_use: boolean | null
          report_id: string
          smoker: boolean | null
          smoking_details: string | null
          suitability_comment: string | null
          suitable_for_exam: boolean | null
        }
        Insert: {
          alcohol_details?: string | null
          breathing_trouble?: boolean | null
          created_at?: string
          diabetic?: boolean | null
          drug_use_details?: string | null
          enough_sleep?: boolean | null
          health_status?: string | null
          heart_conditions?: boolean | null
          hospitalized_details?: string | null
          hospitalized_recently?: boolean | null
          id?: string
          medication_details?: string | null
          medication_taken?: boolean | null
          pregnant?: boolean | null
          psychological_disorders?: boolean | null
          recent_alcohol_use?: boolean | null
          recent_drug_use?: boolean | null
          report_id: string
          smoker?: boolean | null
          smoking_details?: string | null
          suitability_comment?: string | null
          suitable_for_exam?: boolean | null
        }
        Update: {
          alcohol_details?: string | null
          breathing_trouble?: boolean | null
          created_at?: string
          diabetic?: boolean | null
          drug_use_details?: string | null
          enough_sleep?: boolean | null
          health_status?: string | null
          heart_conditions?: boolean | null
          hospitalized_details?: string | null
          hospitalized_recently?: boolean | null
          id?: string
          medication_details?: string | null
          medication_taken?: boolean | null
          pregnant?: boolean | null
          psychological_disorders?: boolean | null
          recent_alcohol_use?: boolean | null
          recent_drug_use?: boolean | null
          report_id?: string
          smoker?: boolean | null
          smoking_details?: string | null
          suitability_comment?: string | null
          suitable_for_exam?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "polygraph_suitability_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "polygraph_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      polygraph_venues: {
        Row: {
          address: string
          city: string | null
          created_at: string
          gps_latitude: number | null
          gps_longitude: number | null
          id: string
          is_active: boolean
          province: string | null
          updated_at: string
          venue_name: string
        }
        Insert: {
          address: string
          city?: string | null
          created_at?: string
          gps_latitude?: number | null
          gps_longitude?: number | null
          id?: string
          is_active?: boolean
          province?: string | null
          updated_at?: string
          venue_name: string
        }
        Update: {
          address?: string
          city?: string | null
          created_at?: string
          gps_latitude?: number | null
          gps_longitude?: number | null
          id?: string
          is_active?: boolean
          province?: string | null
          updated_at?: string
          venue_name?: string
        }
        Relationships: []
      }
      popia_indemnity_settings: {
        Row: {
          id: string
          indemnity_audio_url: string | null
          indemnity_text: string
          popia_audio_url: string | null
          popia_text: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          indemnity_audio_url?: string | null
          indemnity_text: string
          popia_audio_url?: string | null
          popia_text: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          indemnity_audio_url?: string | null
          indemnity_text?: string
          popia_audio_url?: string | null
          popia_text?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      portal_card_order: {
        Row: {
          card_key: string
          id: string
          sort_order: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          card_key: string
          id?: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          card_key?: string
          id?: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
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
        Relationships: []
      }
      report_access_log: {
        Row: {
          access_type: string
          created_at: string
          id: string
          report_id: string
          user_id: string
        }
        Insert: {
          access_type: string
          created_at?: string
          id?: string
          report_id: string
          user_id: string
        }
        Update: {
          access_type?: string
          created_at?: string
          id?: string
          report_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_access_log_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "polygraph_reports"
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
        Relationships: []
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
        Relationships: []
      }
      user_badge_state: {
        Row: {
          badge_key: string
          last_seen_at: string
          seen_ids: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          badge_key: string
          last_seen_at?: string
          seen_ids?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          badge_key?: string
          last_seen_at?: string
          seen_ids?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_permissions: {
        Row: {
          created_at: string
          granted: boolean
          granted_at: string | null
          granted_by: string | null
          id: string
          permission_key: string
          user_id: string
        }
        Insert: {
          created_at?: string
          granted?: boolean
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          permission_key: string
          user_id: string
        }
        Update: {
          created_at?: string
          granted?: boolean
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          permission_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_permissions_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_permissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      assign_user_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      check_user_access: {
        Args: { _permission_key: string; _user_id: string }
        Returns: boolean
      }
      cleanup_old_audit_trail: { Args: never; Returns: undefined }
      constant_time_compare: {
        Args: { a: string; b: string }
        Returns: boolean
      }
      get_candex_invitation_by_token: {
        Args: { _token: string }
        Returns: Json
      }
      get_candex_template_structure: {
        Args: { _template_id: string; _token: string }
        Returns: Json
      }
      get_candex_template_videos_by_token: {
        Args: { _token: string }
        Returns: Json
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
      has_permission: {
        Args: { _permission_key: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_store_access: {
        Args: { _store_id: string; _user_id: string }
        Returns: boolean
      }
      is_active_candex_invitation_token: {
        Args: { _token: string }
        Returns: boolean
      }
      is_master_admin: { Args: { _user_id: string }; Returns: boolean }
      mark_candex_invitation_opened: {
        Args: { _token: string }
        Returns: boolean
      }
      remove_user_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      submit_candex_application: {
        Args: {
          _answers: Json
          _candidate_email: string
          _candidate_id_number: string
          _candidate_name: string
          _candidate_phone: string
          _token: string
        }
        Returns: string
      }
    }
    Enums: {
      admission_time_window:
        | "within_2_years"
        | "2_5_years"
        | "5_plus_years"
        | "never"
      app_role: "admin" | "employee" | "master_admin" | "examiner"
      designation_type:
        | "team_leader"
        | "fdo"
        | "manager"
        | "assistant_manager"
        | "buyer"
        | "sales_person"
        | "cashier"
      exam_question_finding: "SR" | "NSR" | "INC" | "PNC"
      polygraph_candidate_status: "pending_review" | "approved" | "rejected"
      polygraph_overall_result: "passed" | "failed" | "inconclusive"
      polygraph_report_status: "draft" | "completed" | "approved"
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
      admission_time_window: [
        "within_2_years",
        "2_5_years",
        "5_plus_years",
        "never",
      ],
      app_role: ["admin", "employee", "master_admin", "examiner"],
      designation_type: [
        "team_leader",
        "fdo",
        "manager",
        "assistant_manager",
        "buyer",
        "sales_person",
        "cashier",
      ],
      exam_question_finding: ["SR", "NSR", "INC", "PNC"],
      polygraph_candidate_status: ["pending_review", "approved", "rejected"],
      polygraph_overall_result: ["passed", "failed", "inconclusive"],
      polygraph_report_status: ["draft", "completed", "approved"],
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
