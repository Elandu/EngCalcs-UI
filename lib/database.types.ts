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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      api_key_secrets: {
        Row: {
          api_key_id: string
          created_at: string
          key_hash: string
        }
        Insert: {
          api_key_id: string
          created_at?: string
          key_hash: string
        }
        Update: {
          api_key_id?: string
          created_at?: string
          key_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_key_secrets_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: true
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          key_prefix: string
          last_used_at: string | null
          name: string
          organisation_id: string
          revoked_at: string | null
          scopes: string[]
        }
        Insert: {
          created_at?: string
          created_by: string
          expires_at?: string | null
          id?: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          organisation_id: string
          revoked_at?: string | null
          scopes?: string[]
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          organisation_id?: string
          revoked_at?: string | null
          scopes?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          actor_user_id: string
          created_at: string
          entity_id: string | null
          entity_type: string
          event_type: string
          id: string
          metadata_json: Json
          organisation_id: string
          project_id: string | null
        }
        Insert: {
          actor_user_id: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          event_type: string
          id?: string
          metadata_json?: Json
          organisation_id: string
          project_id?: string | null
        }
        Update: {
          actor_user_id?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          event_type?: string
          id?: string
          metadata_json?: Json
          organisation_id?: string
          project_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      calculation_links: {
        Row: {
          created_at: string
          created_by: string
          id: string
          source_calculation_id: string
          source_output_path: string
          target_calculation_id: string
          target_input_path: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          source_calculation_id: string
          source_output_path: string
          target_calculation_id: string
          target_input_path: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          source_calculation_id?: string
          source_output_path?: string
          target_calculation_id?: string
          target_input_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "calculation_links_source_calculation_id_fkey"
            columns: ["source_calculation_id"]
            isOneToOne: false
            referencedRelation: "calculations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calculation_links_target_calculation_id_fkey"
            columns: ["target_calculation_id"]
            isOneToOne: false
            referencedRelation: "calculations"
            referencedColumns: ["id"]
          },
        ]
      }
      calculation_overrides: {
        Row: {
          applied_run_id: string | null
          calculation_id: string
          created_at: string
          created_by: string
          direction: string | null
          id: string
          is_active: boolean
          original_value: number | null
          override_value: number
          reason: string
          source_reference: string | null
          source_run_id: string
          superseded_at: string | null
          superseded_by_id: string | null
          variable: string
          workflow_instance_id: string
        }
        Insert: {
          applied_run_id?: string | null
          calculation_id: string
          created_at?: string
          created_by: string
          direction?: string | null
          id?: string
          is_active?: boolean
          original_value?: number | null
          override_value: number
          reason: string
          source_reference?: string | null
          source_run_id: string
          superseded_at?: string | null
          superseded_by_id?: string | null
          variable: string
          workflow_instance_id: string
        }
        Update: {
          applied_run_id?: string | null
          calculation_id?: string
          created_at?: string
          created_by?: string
          direction?: string | null
          id?: string
          is_active?: boolean
          original_value?: number | null
          override_value?: number
          reason?: string
          source_reference?: string | null
          source_run_id?: string
          superseded_at?: string | null
          superseded_by_id?: string | null
          variable?: string
          workflow_instance_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calculation_overrides_applied_run_id_fkey"
            columns: ["applied_run_id"]
            isOneToOne: false
            referencedRelation: "calculation_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calculation_overrides_calculation_id_fkey"
            columns: ["calculation_id"]
            isOneToOne: false
            referencedRelation: "calculations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calculation_overrides_source_run_id_fkey"
            columns: ["source_run_id"]
            isOneToOne: false
            referencedRelation: "calculation_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calculation_overrides_superseded_by_id_fkey"
            columns: ["superseded_by_id"]
            isOneToOne: false
            referencedRelation: "calculation_overrides"
            referencedColumns: ["id"]
          },
        ]
      }
      calculation_run_reviews: {
        Row: {
          review_note: string | null
          reviewed_at: string | null
          reviewer_id: string | null
          run_id: string
          status: string
          submitted_at: string
          submitted_by: string
          updated_at: string
        }
        Insert: {
          review_note?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          run_id: string
          status?: string
          submitted_at?: string
          submitted_by: string
          updated_at?: string
        }
        Update: {
          review_note?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          run_id?: string
          status?: string
          submitted_at?: string
          submitted_by?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calculation_run_reviews_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: true
            referencedRelation: "calculation_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      calculation_runs: {
        Row: {
          calculation_definition_id: string
          calculation_definition_version: string
          calculation_id: string
          created_at: string
          created_by: string
          engine_plugin_id: string
          engine_plugin_version: string
          id: string
          input_hash: string | null
          input_json: Json
          parent_run_id: string | null
          provenance_json: Json
          result_json: Json
          run_sequence: number
          standard_reference_json: Json | null
          warnings_json: Json
        }
        Insert: {
          calculation_definition_id: string
          calculation_definition_version: string
          calculation_id: string
          created_at?: string
          created_by: string
          engine_plugin_id: string
          engine_plugin_version: string
          id?: string
          input_hash?: string | null
          input_json: Json
          parent_run_id?: string | null
          provenance_json?: Json
          result_json: Json
          run_sequence?: number
          standard_reference_json?: Json | null
          warnings_json?: Json
        }
        Update: {
          calculation_definition_id?: string
          calculation_definition_version?: string
          calculation_id?: string
          created_at?: string
          created_by?: string
          engine_plugin_id?: string
          engine_plugin_version?: string
          id?: string
          input_hash?: string | null
          input_json?: Json
          parent_run_id?: string | null
          provenance_json?: Json
          result_json?: Json
          run_sequence?: number
          standard_reference_json?: Json | null
          warnings_json?: Json
        }
        Relationships: [
          {
            foreignKeyName: "calculation_runs_calculation_id_fkey"
            columns: ["calculation_id"]
            isOneToOne: false
            referencedRelation: "calculations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calculation_runs_parent_run_id_fkey"
            columns: ["parent_run_id"]
            isOneToOne: false
            referencedRelation: "calculation_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      calculations: {
        Row: {
          calculation_definition_id: string
          created_at: string
          created_by: string
          id: string
          project_id: string
          sort_order: number
          stage_key: string | null
          state: string
          title: string
          updated_at: string
          workflow_instance_id: string | null
        }
        Insert: {
          calculation_definition_id: string
          created_at?: string
          created_by: string
          id?: string
          project_id: string
          sort_order?: number
          stage_key?: string | null
          state?: string
          title: string
          updated_at?: string
          workflow_instance_id?: string | null
        }
        Update: {
          calculation_definition_id?: string
          created_at?: string
          created_by?: string
          id?: string
          project_id?: string
          sort_order?: number
          stage_key?: string | null
          state?: string
          title?: string
          updated_at?: string
          workflow_instance_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calculations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      engineering_sources: {
        Row: {
          id: string
          project_id: string
          storage_path: string | null
          storage_byte_size: number | null
          storage_mime_type: string | null
          source_kind: string
          title: string
          revision_label: string
          source_reference: string
          content_sha256: string | null
          created_by: string
          created_at: string
        }
        Insert: {
          id?: string
          project_id: string
          storage_path?: string | null
          storage_byte_size?: number | null
          storage_mime_type?: string | null
          source_kind: string
          title: string
          revision_label?: string
          source_reference: string
          content_sha256?: string | null
          created_by?: string
          created_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          storage_path?: string | null
          storage_byte_size?: number | null
          storage_mime_type?: string | null
          source_kind?: string
          title?: string
          revision_label?: string
          source_reference?: string
          content_sha256?: string | null
          created_by?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "engineering_sources_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      engineering_input_proposals: {
        Row: {
          id: string
          project_id: string
          source_id: string
          target_calculation_id: string | null
          target_input_path: string
          proposed_value_json: Json
          source_location: string
          rationale: string
          proposal_origin: string
          model_identifier: string | null
          created_by: string
          created_at: string
        }
        Insert: {
          id?: string
          project_id: string
          source_id: string
          target_calculation_id?: string | null
          target_input_path: string
          proposed_value_json: Json
          source_location: string
          rationale: string
          proposal_origin?: string
          model_identifier?: string | null
          created_by?: string
          created_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          source_id?: string
          target_calculation_id?: string | null
          target_input_path?: string
          proposed_value_json?: Json
          source_location?: string
          rationale?: string
          proposal_origin?: string
          model_identifier?: string | null
          created_by?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "engineering_input_proposals_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engineering_input_proposals_source_id_project_id_fkey"
            columns: ["source_id", "project_id"]
            isOneToOne: false
            referencedRelation: "engineering_sources"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "engineering_input_proposals_target_calculation_id_project_id_fkey"
            columns: ["target_calculation_id", "project_id"]
            isOneToOne: false
            referencedRelation: "calculations"
            referencedColumns: ["id", "project_id"]
          },
        ]
      }
      engineering_proposal_decisions: {
        Row: {
          id: string
          proposal_id: string
          project_id: string
          decision: string
          review_note: string
          reviewed_by: string
          reviewed_at: string
        }
        Insert: {
          id?: string
          proposal_id: string
          project_id: string
          decision: string
          review_note: string
          reviewed_by?: string
          reviewed_at?: string
        }
        Update: {
          id?: string
          proposal_id?: string
          project_id?: string
          decision?: string
          review_note?: string
          reviewed_by?: string
          reviewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "engineering_proposal_decisions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engineering_proposal_decisions_proposal_id_project_id_fkey"
            columns: ["proposal_id", "project_id"]
            isOneToOne: true
            referencedRelation: "engineering_input_proposals"
            referencedColumns: ["id", "project_id"]
          },
        ]
      }
      organisation_members: {
        Row: {
          created_at: string
          organisation_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          organisation_id: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          organisation_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organisation_members_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      organisations: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
          slug: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name: string
          slug?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          slug?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      project_defaults: {
        Row: {
          key: string
          project_id: string
          source: string | null
          updated_at: string
          updated_by: string
          value_json: Json
        }
        Insert: {
          key: string
          project_id: string
          source?: string | null
          updated_at?: string
          updated_by: string
          value_json: Json
        }
        Update: {
          key?: string
          project_id?: string
          source?: string | null
          updated_at?: string
          updated_by?: string
          value_json?: Json
        }
        Relationships: [
          {
            foreignKeyName: "project_defaults_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          address: string | null
          created_at: string
          created_by: string
          id: string
          name: string
          organisation_id: string
          project_number: string | null
          standards_region: string
          status: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          created_by: string
          id?: string
          name: string
          organisation_id: string
          project_number?: string | null
          standards_region?: string
          status?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          organisation_id?: string
          project_number?: string | null
          standards_region?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          calculation_run_id: string | null
          created_at: string
          id: string
          issued_at: string
          issued_by: string
          metadata_json: Json
          project_id: string
          report_hash: string | null
          report_type: string
          revision: number
          status: string
          storage_path: string
          supersedes_report_id: string | null
          title: string | null
          workflow_instance_id: string | null
        }
        Insert: {
          calculation_run_id?: string | null
          created_at?: string
          id?: string
          issued_at?: string
          issued_by: string
          metadata_json?: Json
          project_id: string
          report_hash?: string | null
          report_type: string
          revision?: number
          status?: string
          storage_path: string
          supersedes_report_id?: string | null
          title?: string | null
          workflow_instance_id?: string | null
        }
        Update: {
          calculation_run_id?: string | null
          created_at?: string
          id?: string
          issued_at?: string
          issued_by?: string
          metadata_json?: Json
          project_id?: string
          report_hash?: string | null
          report_type?: string
          revision?: number
          status?: string
          storage_path?: string
          supersedes_report_id?: string | null
          title?: string | null
          workflow_instance_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reports_calculation_run_id_fkey"
            columns: ["calculation_run_id"]
            isOneToOne: false
            referencedRelation: "calculation_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_supersedes_report_id_fkey"
            columns: ["supersedes_report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
