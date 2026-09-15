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
      class_sections: {
        Row: {
          bundle_id: string | null
          capacity: number | null
          closes_at: string
          course_id: number
          created_at: string
          end_time: string
          enrollment_opens_at: string
          id: number
          instructor_id: string | null
          live_tuition: number | null
          start_time: string
          status: string
          target_sessions: number
          term_id: number
          time_block: string | null
          track: string
          tuition: number
        }
        Insert: {
          bundle_id?: string | null
          capacity?: number | null
          closes_at: string
          course_id: number
          created_at?: string
          end_time: string
          enrollment_opens_at: string
          id?: number
          instructor_id?: string | null
          live_tuition?: number | null
          start_time: string
          status?: string
          target_sessions: number
          term_id: number
          time_block?: string | null
          track: string
          tuition: number
        }
        Update: {
          bundle_id?: string | null
          capacity?: number | null
          closes_at?: string
          course_id?: number
          created_at?: string
          end_time?: string
          enrollment_opens_at?: string
          id?: number
          instructor_id?: string | null
          live_tuition?: number | null
          start_time?: string
          status?: string
          target_sessions?: number
          term_id?: number
          time_block?: string | null
          track?: string
          tuition?: number
        }
        Relationships: [
          {
            foreignKeyName: "class_sections_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_sections_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_sections_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_messages: {
        Row: {
          created_at: string
          email: string | null
          id: number
          message: string
          name: string
          phone: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: number
          message: string
          name: string
          phone?: string | null
          status?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: number
          message?: string
          name?: string
          phone?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          code: string
          course_type: string
          id: number
          is_active: boolean
          name: string
          target_score: number | null
        }
        Insert: {
          code: string
          course_type: string
          id?: number
          is_active?: boolean
          name: string
          target_score?: number | null
        }
        Update: {
          code?: string
          course_type?: string
          id?: number
          is_active?: boolean
          name?: string
          target_score?: number | null
        }
        Relationships: []
      }
      enrollment_orders: {
        Row: {
          access_until: string
          activates_on: string
          created_at: string
          id: number
          months: number
          status: string
          user_id: string
          verification_id: number | null
        }
        Insert: {
          access_until: string
          activates_on: string
          created_at?: string
          id?: number
          months: number
          status?: string
          user_id: string
          verification_id?: number | null
        }
        Update: {
          access_until?: string
          activates_on?: string
          created_at?: string
          id?: number
          months?: number
          status?: string
          user_id?: string
          verification_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "enrollment_orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollment_orders_verification_id_fkey"
            columns: ["verification_id"]
            isOneToOne: false
            referencedRelation: "enrollment_verifications"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollment_verifications: {
        Row: {
          candidates: Json | null
          confidence: number | null
          created_at: string
          file_path: string
          id: number
          matched_section: number | null
          ocr_raw: Json | null
          parsed: Json | null
          receipt_no: string | null
          reject_reason: string | null
          result: string | null
          user_id: string
        }
        Insert: {
          candidates?: Json | null
          confidence?: number | null
          created_at?: string
          file_path: string
          id?: number
          matched_section?: number | null
          ocr_raw?: Json | null
          parsed?: Json | null
          receipt_no?: string | null
          reject_reason?: string | null
          result?: string | null
          user_id: string
        }
        Update: {
          candidates?: Json | null
          confidence?: number | null
          created_at?: string
          file_path?: string
          id?: number
          matched_section?: number | null
          ocr_raw?: Json | null
          parsed?: Json | null
          receipt_no?: string | null
          reject_reason?: string | null
          result?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollment_verifications_matched_section_fkey"
            columns: ["matched_section"]
            isOneToOne: false
            referencedRelation: "class_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollment_verifications_matched_section_fkey"
            columns: ["matched_section"]
            isOneToOne: false
            referencedRelation: "section_headcounts"
            referencedColumns: ["section_id"]
          },
          {
            foreignKeyName: "enrollment_verifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollments: {
        Row: {
          created_at: string
          id: number
          mode: string
          order_id: number
          pending_from_section_id: number | null
          section_id: number | null
          status: string
          student_id: string
        }
        Insert: {
          created_at?: string
          id?: number
          mode?: string
          order_id: number
          pending_from_section_id?: number | null
          section_id?: number | null
          status?: string
          student_id: string
        }
        Update: {
          created_at?: string
          id?: number
          mode?: string
          order_id?: number
          pending_from_section_id?: number | null
          section_id?: number | null
          status?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "enrollment_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_pending_from_section_id_fkey"
            columns: ["pending_from_section_id"]
            isOneToOne: false
            referencedRelation: "class_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_pending_from_section_id_fkey"
            columns: ["pending_from_section_id"]
            isOneToOne: false
            referencedRelation: "section_headcounts"
            referencedColumns: ["section_id"]
          },
          {
            foreignKeyName: "enrollments_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "class_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "section_headcounts"
            referencedColumns: ["section_id"]
          },
          {
            foreignKeyName: "enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          department: string | null
          gender: string | null
          id: string
          name: string
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          university: string | null
        }
        Insert: {
          created_at?: string
          department?: string | null
          gender?: string | null
          id: string
          name: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          university?: string | null
        }
        Update: {
          created_at?: string
          department?: string | null
          gender?: string | null
          id?: string
          name?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          university?: string | null
        }
        Relationships: []
      }
      replays: {
        Row: {
          id: number
          published_at: string
          session_date_id: number
          video_url: string
        }
        Insert: {
          id?: number
          published_at?: string
          session_date_id: number
          video_url: string
        }
        Update: {
          id?: number
          published_at?: string
          session_date_id?: number
          video_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "replays_session_date_id_fkey"
            columns: ["session_date_id"]
            isOneToOne: false
            referencedRelation: "session_dates"
            referencedColumns: ["id"]
          },
        ]
      }
      section_live_links: {
        Row: {
          live_url: string
          section_id: number
          updated_at: string
        }
        Insert: {
          live_url: string
          section_id: number
          updated_at?: string
        }
        Update: {
          live_url?: string
          section_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "section_live_links_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: true
            referencedRelation: "class_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "section_live_links_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: true
            referencedRelation: "section_headcounts"
            referencedColumns: ["section_id"]
          },
        ]
      }
      session_dates: {
        Row: {
          date: string
          end_time: string
          id: number
          section_id: number
          seq: number
          start_time: string
        }
        Insert: {
          date: string
          end_time: string
          id?: number
          section_id: number
          seq: number
          start_time: string
        }
        Update: {
          date?: string
          end_time?: string
          id?: number
          section_id?: number
          seq?: number
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_dates_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "class_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_dates_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "section_headcounts"
            referencedColumns: ["section_id"]
          },
        ]
      }
      study_applications: {
        Row: {
          created_at: string
          id: number
          message: string | null
          name: string
          phone: string
          preferred_time: string | null
          status: string
          target_score: number | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: number
          message?: string | null
          name: string
          phone: string
          preferred_time?: string | null
          status?: string
          target_score?: number | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: number
          message?: string | null
          name?: string
          phone?: string
          preferred_time?: string | null
          status?: string
          target_score?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "study_applications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      terms: {
        Row: {
          id: number
          month: number
          year: number
        }
        Insert: {
          id?: number
          month: number
          year: number
        }
        Update: {
          id?: number
          month?: number
          year?: number
        }
        Relationships: []
      }
      textbook_orders: {
        Row: {
          address: string
          address_detail: string | null
          created_at: string
          id: number
          memo: string | null
          phone: string
          postal_code: string | null
          quantity: number
          recipient_name: string
          section_id: number
          status: string
          tracking_no: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address: string
          address_detail?: string | null
          created_at?: string
          id?: number
          memo?: string | null
          phone: string
          postal_code?: string | null
          quantity?: number
          recipient_name: string
          section_id: number
          status?: string
          tracking_no?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string
          address_detail?: string | null
          created_at?: string
          id?: number
          memo?: string | null
          phone?: string
          postal_code?: string | null
          quantity?: number
          recipient_name?: string
          section_id?: number
          status?: string
          tracking_no?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "textbook_orders_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "class_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "textbook_orders_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "section_headcounts"
            referencedColumns: ["section_id"]
          },
          {
            foreignKeyName: "textbook_orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      section_headcounts: {
        Row: {
          course_id: number | null
          end_time: string | null
          live_count: number | null
          onsite_count: number | null
          section_id: number | null
          start_time: string | null
          term_id: number | null
          time_block: string | null
          track: string | null
        }
        Relationships: [
          {
            foreignKeyName: "class_sections_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_sections_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      user_role:
        | "guest"
        | "member"
        | "student"
        | "alumni"
        | "instructor"
        | "admin"
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
    Enums: {
      user_role: [
        "guest",
        "member",
        "student",
        "alumni",
        "instructor",
        "admin",
      ],
    },
  },
} as const
