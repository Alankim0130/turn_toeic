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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
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
          end_time: string | null
          enrollment_opens_at: string
          id: number
          instructor_id: string | null
          live_tuition: number | null
          start_time: string | null
          status: string
          target_sessions: number
          term_id: number
          time_block: string | null
          track: string
          tuition: number | null
        }
        Insert: {
          bundle_id?: string | null
          capacity?: number | null
          closes_at: string
          course_id: number
          created_at?: string
          end_time?: string | null
          enrollment_opens_at: string
          id?: number
          instructor_id?: string | null
          live_tuition?: number | null
          start_time?: string | null
          status?: string
          target_sessions: number
          term_id: number
          time_block?: string | null
          track: string
          tuition?: number | null
        }
        Update: {
          bundle_id?: string | null
          capacity?: number | null
          closes_at?: string
          course_id?: number
          created_at?: string
          end_time?: string | null
          enrollment_opens_at?: string
          id?: number
          instructor_id?: string | null
          live_tuition?: number | null
          start_time?: string | null
          status?: string
          target_sessions?: number
          term_id?: number
          time_block?: string | null
          track?: string
          tuition?: number | null
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
      homework_files: {
        Row: {
          content_type: string | null
          created_at: string
          file_name: string
          file_path: string
          file_size: number | null
          id: number
          submission_id: number
        }
        Insert: {
          content_type?: string | null
          created_at?: string
          file_name: string
          file_path: string
          file_size?: number | null
          id?: number
          submission_id: number
        }
        Update: {
          content_type?: string | null
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: number
          submission_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "homework_files_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "homework_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      homework_submissions: {
        Row: {
          checked_at: string | null
          checked_by: string | null
          created_at: string
          id: number
          material_id: number
          status: string
          user_id: string
        }
        Insert: {
          checked_at?: string | null
          checked_by?: string | null
          created_at?: string
          id?: number
          material_id: number
          status?: string
          user_id: string
        }
        Update: {
          checked_at?: string | null
          checked_by?: string | null
          created_at?: string
          id?: number
          material_id?: number
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "homework_submissions_checked_by_fkey"
            columns: ["checked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homework_submissions_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "study_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homework_submissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lc_audio_tracks: {
        Row: {
          book_id: number
          content_type: string | null
          created_at: string
          day: number
          file_name: string
          file_path: string
          file_size: number | null
          id: number
          kind: string
          label: string | null
          sort_order: number
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          book_id: number
          content_type?: string | null
          created_at?: string
          day: number
          file_name: string
          file_path: string
          file_size?: number | null
          id?: number
          kind?: string
          label?: string | null
          sort_order?: number
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          book_id?: number
          content_type?: string | null
          created_at?: string
          day?: number
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: number
          kind?: string
          label?: string | null
          sort_order?: number
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lc_audio_tracks_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "lc_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lc_audio_tracks_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lc_books: {
        Row: {
          book_set: string
          cover_name: string | null
          cover_path: string | null
          cover_size: number | null
          cover_type: string | null
          description: string | null
          id: number
          lesson_offset: number
          level: number
          title: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          book_set: string
          cover_name?: string | null
          cover_path?: string | null
          cover_size?: number | null
          cover_type?: string | null
          description?: string | null
          id?: number
          lesson_offset?: number
          level: number
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          book_set?: string
          cover_name?: string | null
          cover_path?: string | null
          cover_size?: number | null
          cover_type?: string | null
          description?: string | null
          id?: number
          lesson_offset?: number
          level?: number
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lc_books_level_fkey"
            columns: ["level"]
            isOneToOne: false
            referencedRelation: "lc_levels"
            referencedColumns: ["level"]
          },
          {
            foreignKeyName: "lc_books_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lc_levels: {
        Row: {
          level: number
          sort_order: number
        }
        Insert: {
          level: number
          sort_order?: number
        }
        Update: {
          level?: number
          sort_order?: number
        }
        Relationships: []
      }
      lecture_signups: {
        Row: {
          created_at: string
          id: number
          lecture_id: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: number
          lecture_id: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: number
          lecture_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lecture_signups_lecture_id_fkey"
            columns: ["lecture_id"]
            isOneToOne: false
            referencedRelation: "special_lectures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lecture_signups_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lecturers: {
        Row: {
          id: number
          name: string
          sort_order: number
        }
        Insert: {
          id?: number
          name: string
          sort_order?: number
        }
        Update: {
          id?: number
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      naver_reservations: {
        Row: {
          booking_number: string | null
          customer_name: string | null
          dedupe_key: string
          id: number
          item_name: string | null
          parsed: boolean
          raw_text: string | null
          received_at: string
          reserved_date: string | null
          reserved_time: string | null
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          booking_number?: string | null
          customer_name?: string | null
          dedupe_key: string
          id?: number
          item_name?: string | null
          parsed?: boolean
          raw_text?: string | null
          received_at?: string
          reserved_date?: string | null
          reserved_time?: string | null
          source?: string
          status?: string
          updated_at?: string
        }
        Update: {
          booking_number?: string | null
          customer_name?: string | null
          dedupe_key?: string
          id?: number
          item_name?: string | null
          parsed?: boolean
          raw_text?: string | null
          received_at?: string
          reserved_date?: string | null
          reserved_time?: string | null
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      notification_settings: {
        Row: {
          contact: boolean
          daily_digest: boolean
          naver_reservation: boolean
          textbook_order: boolean
          updated_at: string
          user_id: string
          verification: boolean
        }
        Insert: {
          contact?: boolean
          daily_digest?: boolean
          naver_reservation?: boolean
          textbook_order?: boolean
          updated_at?: string
          user_id: string
          verification?: boolean
        }
        Update: {
          contact?: boolean
          daily_digest?: boolean
          naver_reservation?: boolean
          textbook_order?: boolean
          updated_at?: string
          user_id?: string
          verification?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "notification_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
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
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: number
          last_sent_at: string | null
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: number
          last_sent_at?: string | null
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: number
          last_sent_at?: string | null
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
          end_time: string | null
          id: number
          section_id: number
          seq: number
          start_time: string | null
        }
        Insert: {
          date: string
          end_time?: string | null
          id?: number
          section_id: number
          seq: number
          start_time?: string | null
        }
        Update: {
          date?: string
          end_time?: string | null
          id?: number
          section_id?: number
          seq?: number
          start_time?: string | null
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
      special_lectures: {
        Row: {
          applied_count: number
          capacity: number | null
          content: string | null
          created_at: string
          date: string
          id: number
          kinds: string[]
          lecturer_id: number
          signup: boolean
          signup_opens_at: string | null
          term_id: number
        }
        Insert: {
          applied_count?: number
          capacity?: number | null
          content?: string | null
          created_at?: string
          date: string
          id?: number
          kinds?: string[]
          lecturer_id: number
          signup?: boolean
          signup_opens_at?: string | null
          term_id: number
        }
        Update: {
          applied_count?: number
          capacity?: number | null
          content?: string | null
          created_at?: string
          date?: string
          id?: number
          kinds?: string[]
          lecturer_id?: number
          signup?: boolean
          signup_opens_at?: string | null
          term_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "special_lectures_lecturer_id_fkey"
            columns: ["lecturer_id"]
            isOneToOne: false
            referencedRelation: "lecturers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "special_lectures_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      studies: {
        Row: {
          created_at: string
          id: number
          kind: string
          notice: string | null
          status: string
          term_id: number
        }
        Insert: {
          created_at?: string
          id?: number
          kind: string
          notice?: string | null
          status?: string
          term_id: number
        }
        Update: {
          created_at?: string
          id?: number
          kind?: string
          notice?: string | null
          status?: string
          term_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "studies_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      study_materials: {
        Row: {
          content_type: string | null
          created_at: string
          date: string
          file_name: string
          file_path: string
          file_size: number | null
          id: number
          study_id: number
          title: string | null
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          content_type?: string | null
          created_at?: string
          date: string
          file_name: string
          file_path: string
          file_size?: number | null
          id?: number
          study_id: number
          title?: string | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          content_type?: string | null
          created_at?: string
          date?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: number
          study_id?: number
          title?: string | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "study_materials_study_id_fkey"
            columns: ["study_id"]
            isOneToOne: false
            referencedRelation: "studies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_materials_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      study_signups: {
        Row: {
          created_at: string
          id: number
          slot_id: number | null
          study_id: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: number
          slot_id?: number | null
          study_id: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: number
          slot_id?: number | null
          study_id?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_signups_slot_id_study_id_fkey"
            columns: ["slot_id", "study_id"]
            isOneToOne: false
            referencedRelation: "study_slots"
            referencedColumns: ["id", "study_id"]
          },
          {
            foreignKeyName: "study_signups_study_id_fkey"
            columns: ["study_id"]
            isOneToOne: false
            referencedRelation: "studies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_signups_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      study_slots: {
        Row: {
          applied_count: number
          capacity: number | null
          created_at: string
          end_time: string
          id: number
          start_time: string
          study_id: number
        }
        Insert: {
          applied_count?: number
          capacity?: number | null
          created_at?: string
          end_time: string
          id?: number
          start_time: string
          study_id: number
        }
        Update: {
          applied_count?: number
          capacity?: number | null
          created_at?: string
          end_time?: string
          id?: number
          start_time?: string
          study_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "study_slots_study_id_fkey"
            columns: ["study_id"]
            isOneToOne: false
            referencedRelation: "studies"
            referencedColumns: ["id"]
          },
        ]
      }
      term_class_dates: {
        Row: {
          date: string
          term_id: number
          track: string
        }
        Insert: {
          date: string
          term_id: number
          track: string
        }
        Update: {
          date?: string
          term_id?: number
          track?: string
        }
        Relationships: [
          {
            foreignKeyName: "term_class_dates_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      terms: {
        Row: {
          closes_at: string | null
          enrollment_opens_at: string | null
          id: number
          month: number
          year: number
        }
        Insert: {
          closes_at?: string | null
          enrollment_opens_at?: string | null
          id?: number
          month: number
          year: number
        }
        Update: {
          closes_at?: string | null
          enrollment_opens_at?: string | null
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
      timetable_levels: {
        Row: {
          level: number
          note: string | null
          sort_order: number
        }
        Insert: {
          level: number
          note?: string | null
          sort_order?: number
        }
        Update: {
          level?: number
          note?: string | null
          sort_order?: number
        }
        Relationships: []
      }
      timetable_slots: {
        Row: {
          end_time: string
          id: number
          level: number
          start_time: string
        }
        Insert: {
          end_time: string
          id?: number
          level: number
          start_time: string
        }
        Update: {
          end_time?: string
          id?: number
          level?: number
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "timetable_slots_level_fkey"
            columns: ["level"]
            isOneToOne: false
            referencedRelation: "timetable_levels"
            referencedColumns: ["level"]
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
      save_term_schedule: {
        Args: {
          p_closes: string | null
          p_lectures: Json
          p_month: number
          p_mwf: string[]
          p_opens: string | null
          p_parts?: string[] | null
          p_ttf: string[]
          p_year: number
        }
        Returns: Json
      }
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
  graphql_public: {
    Enums: {},
  },
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
