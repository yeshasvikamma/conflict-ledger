// =============================================================================
// shared/types.ts — GENERATED FILE. DO NOT HAND-EDIT.
// =============================================================================
// Regenerate this any time schema.sql changes, and commit it in the SAME commit:
//
//   supabase gen types typescript --project-id <your-project-id> > shared/types.ts
//   # or, against a local/linked project:
//   supabase gen types typescript --linked > shared/types.ts
//
// Until you run that against your real Supabase project, this placeholder keeps
// the repo type-checking. It is a hand-written stand-in that mirrors schema.sql;
// replace the WHOLE file with generated output at kickoff (CP0/CP1).
// =============================================================================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// Minimal hand-written stand-in. Shapes match schema.sql. The real generated
// file will be more detailed (Insert/Update variants, relationships, etc).
export interface Database {
  public: {
    Tables: {
      sources: {
        Row: {
          id: string;
          domain: string;
          name: string | null;
          source_type: string;
          discovered_via: string;
          discovery_tier: string | null;
          tier_reason: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          domain: string;
          name?: string | null;
          source_type?: string;
          discovered_via: string;
          discovery_tier?: string | null;
          tier_reason?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['sources']['Insert']>;
      };
      raw_items: {
        Row: {
          id: string;
          source_id: string;
          headline: string | null;
          raw_text: string;
          url: string;
          published_at: string | null;
          origin_type: string;
          content_shape: string;
          processed: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          source_id: string;
          headline?: string | null;
          raw_text: string;
          url: string;
          published_at?: string | null;
          origin_type: string;
          content_shape?: string;
          processed?: boolean;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['raw_items']['Insert']>;
      };
      claims: {
        Row: {
          id: string;
          raw_item_id: string;
          claim_type: string;
          value: Json;
          raw_quote: string;
          date_occurred: string | null;
          location: string | null;
          lat: number | null;
          lng: number | null;
          geo_confidence: number | null;
          is_unverified_signal: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          raw_item_id: string;
          claim_type: string;
          value: Json;
          raw_quote: string;
          date_occurred?: string | null;
          location?: string | null;
          lat?: number | null;
          lng?: number | null;
          geo_confidence?: number | null;
          is_unverified_signal?: boolean;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['claims']['Insert']>;
      };
      entities: {
        Row: {
          id: string;
          entity_type: string;
          name: string;
          subtype: string | null;
          metadata: Json | null;
          lat: number | null;
          lng: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          entity_type: string;
          name: string;
          subtype?: string | null;
          metadata?: Json | null;
          lat?: number | null;
          lng?: number | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['entities']['Insert']>;
      };
      claim_entities: {
        Row: { claim_id: string; entity_id: string };
        Insert: { claim_id: string; entity_id: string };
        Update: Partial<Database['public']['Tables']['claim_entities']['Insert']>;
      };
      events: {
        Row: {
          id: string;
          title: string | null;
          neutral_summary: string | null;
          location: string | null;
          lat: number | null;
          lng: number | null;
          category: string | null;
          event_date: string | null;
          framing_notes: Json | null;
          has_disagreement: boolean;
          disagreement_note: string | null;
          first_seen_at: string;
          last_updated_at: string;
        };
        Insert: {
          id?: string;
          title?: string | null;
          neutral_summary?: string | null;
          location?: string | null;
          lat?: number | null;
          lng?: number | null;
          category?: string | null;
          event_date?: string | null;
          framing_notes?: Json | null;
          has_disagreement?: boolean;
          disagreement_note?: string | null;
          first_seen_at?: string;
          last_updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['events']['Insert']>;
      };
      event_claims: {
        Row: { event_id: string; claim_id: string };
        Insert: { event_id: string; claim_id: string };
        Update: Partial<Database['public']['Tables']['event_claims']['Insert']>;
      };
      zones: {
        Row: {
          id: string;
          zone_type: string;
          region: string | null;
          geo_json: Json | null;
          date_observed: string | null;
          source_id: string | null;
          raw_quote: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          zone_type: string;
          region?: string | null;
          geo_json?: Json | null;
          date_observed?: string | null;
          source_id?: string | null;
          raw_quote?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['zones']['Insert']>;
      };
      counter_snapshots: {
        Row: {
          id: string;
          counter_key: string;
          as_of_date: string;
          low_value: number | null;
          high_value: number | null;
          primary_source_ids: string[] | null;
          claim_count: number | null;
          computed_at: string;
        };
        Insert: {
          id?: string;
          counter_key: string;
          as_of_date: string;
          low_value?: number | null;
          high_value?: number | null;
          primary_source_ids?: string[] | null;
          claim_count?: number | null;
          computed_at?: string;
        };
        Update: Partial<Database['public']['Tables']['counter_snapshots']['Insert']>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
