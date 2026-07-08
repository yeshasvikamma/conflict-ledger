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
      claim_entities: {
        Row: {
          claim_id: string
          entity_id: string
        }
        Insert: {
          claim_id: string
          entity_id: string
        }
        Update: {
          claim_id?: string
          entity_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "claim_entities_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_entities_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      claims: {
        Row: {
          claim_type: string
          created_at: string
          date_occurred: string | null
          geo_confidence: number | null
          id: string
          is_unverified_signal: boolean
          lat: number | null
          lng: number | null
          location: string | null
          raw_item_id: string
          raw_quote: string
          value: Json
        }
        Insert: {
          claim_type: string
          created_at?: string
          date_occurred?: string | null
          geo_confidence?: number | null
          id?: string
          is_unverified_signal?: boolean
          lat?: number | null
          lng?: number | null
          location?: string | null
          raw_item_id: string
          raw_quote: string
          value: Json
        }
        Update: {
          claim_type?: string
          created_at?: string
          date_occurred?: string | null
          geo_confidence?: number | null
          id?: string
          is_unverified_signal?: boolean
          lat?: number | null
          lng?: number | null
          location?: string | null
          raw_item_id?: string
          raw_quote?: string
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "claims_raw_item_id_fkey"
            columns: ["raw_item_id"]
            isOneToOne: false
            referencedRelation: "raw_items"
            referencedColumns: ["id"]
          },
        ]
      }
      counter_snapshots: {
        Row: {
          as_of_date: string
          claim_count: number | null
          computed_at: string
          counter_key: string
          high_value: number | null
          id: string
          low_value: number | null
          primary_source_ids: string[] | null
        }
        Insert: {
          as_of_date: string
          claim_count?: number | null
          computed_at?: string
          counter_key: string
          high_value?: number | null
          id?: string
          low_value?: number | null
          primary_source_ids?: string[] | null
        }
        Update: {
          as_of_date?: string
          claim_count?: number | null
          computed_at?: string
          counter_key?: string
          high_value?: number | null
          id?: string
          low_value?: number | null
          primary_source_ids?: string[] | null
        }
        Relationships: []
      }
      entities: {
        Row: {
          created_at: string
          entity_type: string
          id: string
          lat: number | null
          lng: number | null
          metadata: Json | null
          name: string
          subtype: string | null
        }
        Insert: {
          created_at?: string
          entity_type: string
          id?: string
          lat?: number | null
          lng?: number | null
          metadata?: Json | null
          name: string
          subtype?: string | null
        }
        Update: {
          created_at?: string
          entity_type?: string
          id?: string
          lat?: number | null
          lng?: number | null
          metadata?: Json | null
          name?: string
          subtype?: string | null
        }
        Relationships: []
      }
      event_claims: {
        Row: {
          claim_id: string
          event_id: string
        }
        Insert: {
          claim_id: string
          event_id: string
        }
        Update: {
          claim_id?: string
          event_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_claims_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_claims_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          category: string | null
          disagreement_note: string | null
          event_date: string | null
          first_seen_at: string
          framing_notes: Json | null
          has_disagreement: boolean
          id: string
          last_updated_at: string
          lat: number | null
          lng: number | null
          location: string | null
          neutral_summary: string | null
          title: string | null
        }
        Insert: {
          category?: string | null
          disagreement_note?: string | null
          event_date?: string | null
          first_seen_at?: string
          framing_notes?: Json | null
          has_disagreement?: boolean
          id?: string
          last_updated_at?: string
          lat?: number | null
          lng?: number | null
          location?: string | null
          neutral_summary?: string | null
          title?: string | null
        }
        Update: {
          category?: string | null
          disagreement_note?: string | null
          event_date?: string | null
          first_seen_at?: string
          framing_notes?: Json | null
          has_disagreement?: boolean
          id?: string
          last_updated_at?: string
          lat?: number | null
          lng?: number | null
          location?: string | null
          neutral_summary?: string | null
          title?: string | null
        }
        Relationships: []
      }
      raw_items: {
        Row: {
          content_shape: string
          created_at: string
          headline: string | null
          id: string
          origin_type: string
          processed: boolean
          published_at: string | null
          raw_text: string
          source_id: string
          url: string
        }
        Insert: {
          content_shape?: string
          created_at?: string
          headline?: string | null
          id?: string
          origin_type: string
          processed?: boolean
          published_at?: string | null
          raw_text: string
          source_id: string
          url: string
        }
        Update: {
          content_shape?: string
          created_at?: string
          headline?: string | null
          id?: string
          origin_type?: string
          processed?: boolean
          published_at?: string | null
          raw_text?: string
          source_id?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "raw_items_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      sources: {
        Row: {
          created_at: string
          discovered_via: string
          discovery_tier: string | null
          domain: string
          id: string
          name: string | null
          source_type: string
          tier_reason: string | null
        }
        Insert: {
          created_at?: string
          discovered_via: string
          discovery_tier?: string | null
          domain: string
          id?: string
          name?: string | null
          source_type?: string
          tier_reason?: string | null
        }
        Update: {
          created_at?: string
          discovered_via?: string
          discovery_tier?: string | null
          domain?: string
          id?: string
          name?: string | null
          source_type?: string
          tier_reason?: string | null
        }
        Relationships: []
      }
      zones: {
        Row: {
          created_at: string
          date_observed: string | null
          geo_json: Json | null
          id: string
          raw_quote: string | null
          region: string | null
          source_id: string | null
          zone_type: string
        }
        Insert: {
          created_at?: string
          date_observed?: string | null
          geo_json?: Json | null
          id?: string
          raw_quote?: string | null
          region?: string | null
          source_id?: string | null
          zone_type: string
        }
        Update: {
          created_at?: string
          date_observed?: string | null
          geo_json?: Json | null
          id?: string
          raw_quote?: string | null
          region?: string | null
          source_id?: string | null
          zone_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "zones_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
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
    Enums: {},
  },
} as const
