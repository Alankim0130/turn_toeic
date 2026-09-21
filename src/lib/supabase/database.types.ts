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
      student_messages: {
        Row: {
          body: string
          created_at: string
          id: number
          kind: string
          read_at: string | null
          related: Json | null
          sender_id: string | null
          sender_name: string
          title: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: never
          kind?: string
          read_at?: string | null
          related?: Json | null
          sender_id?: string | null
          sender_name?: string
          title: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: never
          kind?: string
          read_at?: string | null
          related?: Json | null
          sender_id?: string | null
          sender_name?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      study_checkin_files: {
        Row: {
          checkin_id: number
          content_type: string
          created_at: string
          file_name: string
          file_path: string
          file_size: number
          id: number
        }
        Insert: {
          checkin_id: number
          content_type: string
          created_at?: string
          file_name: string
          file_path: string
          file_size: number
          id?: never
        }
        Update: {
          checkin_id?: number
          content_type?: string
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number
          id?: never
        }
        Relationships: [
          {
            foreignKeyName: "study_checkin_files_checkin_id_fkey"
            columns: ["checkin_id"]
            isOneToOne: false
            referencedRelation: "study_checkins"
            referencedColumns: ["id"]
          },
        ]
      }
      study_checkins: {
        Row: {
          created_at: string
          id: number
          material_id: number
          note: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: never
          material_id: number
          note?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: never
          material_id?: number
          note?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_checkins_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "study_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_checkins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      youtube_channels: {
        Row: {
          access_token: string | null
          access_token_expires_at: string | null
          channel_id: string
          channel_title: string | null
          last_checked_at: string | null
          last_error: string | null
          last_error_at: string | null
          last_live_at: string | null
          linked_at: string
          refresh_token: string
          user_id: string
        }
        Insert: {
          access_token?: string | null
          access_token_expires_at?: string | null
          channel_id: string
          channel_title?: string | null
          last_checked_at?: string | null
          last_error?: string | null
          last_error_at?: string | null
          last_live_at?: string | null
          linked_at?: string
          refresh_token: string
          user_id: string
        }
        Update: {
          access_token?: string | null
          access_token_expires_at?: string | null
          channel_id?: string
          channel_title?: string | null
          last_checked_at?: string | null
          last_error?: string | null
          last_error_at?: string | null
          last_live_at?: string | null
          linked_at?: string
          refresh_token?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "youtube_channels_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      account_merge_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          from_user: string
          id: number
          moved: Json | null
          requested_by: string
          status: string
          to_user: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          from_user: string
          id?: never
          moved?: Json | null
          requested_by: string
          status?: string
          to_user: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          from_user?: string
          id?: never
          moved?: Json | null
          requested_by?: string
          status?: string
          to_user?: string
        }
        Relationships: []
      }
      attendance_events: {
        Row: {
          actor_id: string | null
          class_date: string | null
          created_at: string
          id: number
          kind: string
          method: string | null
          note: string | null
          result: string
          section_id: number | null
          student_id: string | null
        }
        Insert: {
          actor_id?: string | null
          class_date?: string | null
          created_at?: string
          id?: number
          kind: string
          method?: string | null
          note?: string | null
          result: string
          section_id?: number | null
          student_id?: string | null
        }
        Update: {
          actor_id?: string | null
          class_date?: string | null
          created_at?: string
          id?: number
          kind?: string
          method?: string | null
          note?: string | null
          result?: string
          section_id?: number | null
          student_id?: string | null
        }
        Relationships: []
      }
      attendance_stamps: {
        Row: {
          check_in_at: string | null
          check_out_at: string | null
          class_date: string
          created_at: string
          decided_by: string | null
          decided_note: string | null
          id: number
          late: boolean
          method: string | null
          section_id: number
          status: string
          student_id: string
          updated_at: string
        }
        Insert: {
          check_in_at?: string | null
          check_out_at?: string | null
          class_date: string
          created_at?: string
          decided_by?: string | null
          decided_note?: string | null
          id?: number
          late?: boolean
          method?: string | null
          section_id: number
          status: string
          student_id: string
          updated_at?: string
        }
        Update: {
          check_in_at?: string | null
          check_out_at?: string | null
          class_date?: string
          created_at?: string
          decided_by?: string | null
          decided_note?: string | null
          id?: number
          late?: boolean
          method?: string | null
          section_id?: number
          status?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_stamps_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "class_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_stamps_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      class_sections: {
        Row: {
          book_set: string | null
          recorded: boolean
          live_to_replay: boolean
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
          book_set?: string | null
          recorded?: boolean
          live_to_replay?: boolean
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
          book_set?: string | null
          recorded?: boolean
          live_to_replay?: boolean
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
          includes_levels: number[]
          is_active: boolean
          name: string
          program: string
          target_score: number | null
        }
        Insert: {
          code: string
          course_type: string
          id?: number
          includes_levels?: number[]
          is_active?: boolean
          name: string
          program?: string
          target_score?: number | null
        }
        Update: {
          code?: string
          course_type?: string
          id?: number
          includes_levels?: number[]
          is_active?: boolean
          name?: string
          program?: string
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
          file_deleted_at: string | null
          file_hash: string | null
          id: number
          matched_section: number | null
          ocr_raw: Json | null
          parsed: Json | null
          reject_reason: string | null
          requested_section_ids: number[]
          result: string | null
          source: string
          user_id: string
        }
        Insert: {
          candidates?: Json | null
          confidence?: number | null
          created_at?: string
          file_path: string
          file_deleted_at?: string | null
          file_hash?: string | null
          id?: number
          matched_section?: number | null
          ocr_raw?: Json | null
          parsed?: Json | null
          reject_reason?: string | null
          requested_section_ids?: number[]
          source?: string
          result?: string | null
          user_id: string
        }
        Update: {
          candidates?: Json | null
          confidence?: number | null
          created_at?: string
          file_path?: string
          file_deleted_at?: string | null
          file_hash?: string | null
          id?: number
          matched_section?: number | null
          ocr_raw?: Json | null
          parsed?: Json | null
          reject_reason?: string | null
          requested_section_ids?: number[]
          source?: string
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
          class_date: string | null
          created_at: string
          feedback: string | null
          id: number
          level: number
          question: string | null
          status: string
          subject: string
          user_id: string
        }
        Insert: {
          checked_at?: string | null
          checked_by?: string | null
          class_date?: string | null
          created_at?: string
          feedback?: string | null
          id?: number
          level: number
          question?: string | null
          status?: string
          subject: string
          user_id: string
        }
        Update: {
          checked_at?: string | null
          checked_by?: string | null
          class_date?: string | null
          created_at?: string
          feedback?: string | null
          id?: number
          level?: number
          question?: string | null
          status?: string
          subject?: string
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
            foreignKeyName: "homework_submissions_level_fkey"
            columns: ["level"]
            isOneToOne: false
            referencedRelation: "lc_levels"
            referencedColumns: ["level"]
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
      naver_booking_events: {
        Row: {
          created_at: string
          id: number
          kind: string
          new_count: number
          prev_count: number
          slot_at: string
          stock: number | null
        }
        Insert: {
          created_at?: string
          id?: number
          kind: string
          new_count: number
          prev_count: number
          slot_at: string
          stock?: number | null
        }
        Update: {
          created_at?: string
          id?: number
          kind?: string
          new_count?: number
          prev_count?: number
          slot_at?: string
          stock?: number | null
        }
        Relationships: []
      }
      naver_booking_slots: {
        Row: {
          booking_count: number
          is_sale_day: boolean
          slot_at: string
          stock: number
          updated_at: string
        }
        Insert: {
          booking_count?: number
          is_sale_day?: boolean
          slot_at: string
          stock?: number
          updated_at?: string
        }
        Update: {
          booking_count?: number
          is_sale_day?: boolean
          slot_at?: string
          stock?: number
          updated_at?: string
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
      naver_sync_status: {
        Row: {
          consecutive_failures: number
          held_signature: string | null
          id: boolean
          last_error: string | null
          last_error_at: string | null
          last_run_at: string | null
          last_success_at: string | null
          range_to: string | null
          retry_after: string | null
          slots: number
        }
        Insert: {
          consecutive_failures?: number
          held_signature?: string | null
          id?: boolean
          last_error?: string | null
          last_error_at?: string | null
          last_run_at?: string | null
          last_success_at?: string | null
          range_to?: string | null
          retry_after?: string | null
          slots?: number
        }
        Update: {
          consecutive_failures?: number
          held_signature?: string | null
          id?: boolean
          last_error?: string | null
          last_error_at?: string | null
          last_run_at?: string | null
          last_success_at?: string | null
          range_to?: string | null
          retry_after?: string | null
          slots?: number
        }
        Relationships: []
      }
      notification_settings: {
        Row: {
          contact: boolean
          daily_digest: boolean
          live_detected: boolean
          naver_reservation: boolean
          textbook_order: boolean
          updated_at: string
          user_id: string
          verification: boolean
        }
        Insert: {
          contact?: boolean
          daily_digest?: boolean
          live_detected?: boolean
          naver_reservation?: boolean
          textbook_order?: boolean
          updated_at?: string
          user_id: string
          verification?: boolean
        }
        Update: {
          contact?: boolean
          daily_digest?: boolean
          live_detected?: boolean
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
          identity_confirmed_at: string | null
          merged_into: string | null
          name: string
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          test_role: Database["public"]["Enums"]["user_role"] | null
          subject: string | null
          university: string | null
        }
        Insert: {
          created_at?: string
          department?: string | null
          gender?: string | null
          id: string
          identity_confirmed_at?: string | null
          merged_into?: string | null
          name: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          test_role?: Database["public"]["Enums"]["user_role"] | null
          subject?: string | null
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
          test_role?: Database["public"]["Enums"]["user_role"] | null
          subject?: string | null
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
      session_live_links: {
        Row: {
          live_url: string
          promoted_at: string | null
          session_date_id: number
          source: string
          updated_at: string
        }
        Insert: {
          live_url: string
          promoted_at?: string | null
          session_date_id: number
          source?: string
          updated_at?: string
        }
        Update: {
          live_url?: string
          promoted_at?: string | null
          session_date_id?: number
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_live_links_session_date_id_fkey"
            columns: ["session_date_id"]
            isOneToOne: true
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
      textbook_accounts: {
        Row: {
          account_no: string
          active: boolean
          bank_name: string
          created_at: string
          holder: string
          id: number
          label: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          account_no: string
          active?: boolean
          bank_name: string
          created_at?: string
          holder: string
          id?: number
          label?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          account_no?: string
          active?: boolean
          bank_name?: string
          created_at?: string
          holder?: string
          id?: number
          label?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      textbook_items: {
        Row: {
          account_id: number | null
          active: boolean
          created_at: string
          id: number
          level: number | null
          name: string
          note: string | null
          price: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          account_id?: number | null
          active?: boolean
          created_at?: string
          id?: number
          level?: number | null
          name: string
          note?: string | null
          price: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          account_id?: number | null
          active?: boolean
          created_at?: string
          id?: number
          level?: number | null
          name?: string
          note?: string | null
          price?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "textbook_items_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "textbook_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "textbook_items_level_fkey"
            columns: ["level"]
            isOneToOne: false
            referencedRelation: "lc_levels"
            referencedColumns: ["level"]
          },
        ]
      }
      textbook_orders: {
        Row: {
          address_detail: string | null
          address: string
          created_at: string
          depositor_name: string | null
          id: number
          items_total: number
          items: Json
          memo: string | null
          pay_to: Json
          phone: string
          postal_code: string | null
          quantity: number
          recipient_name: string
          section_id: number
          shipping_fee: number
          status: string
          term_id: number | null
          total_amount: number
          tracking_no: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address_detail?: string | null
          address: string
          created_at?: string
          depositor_name?: string | null
          id?: number
          items_total?: number
          items?: Json
          memo?: string | null
          pay_to?: Json
          phone: string
          postal_code?: string | null
          quantity?: number
          recipient_name: string
          section_id: number
          shipping_fee?: number
          status?: string
          term_id?: number | null
          total_amount?: number
          tracking_no?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address_detail?: string | null
          address?: string
          created_at?: string
          depositor_name?: string | null
          id?: number
          items_total?: number
          items?: Json
          memo?: string | null
          pay_to?: Json
          phone?: string
          postal_code?: string | null
          quantity?: number
          recipient_name?: string
          section_id?: number
          shipping_fee?: number
          status?: string
          term_id?: number | null
          total_amount?: number
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
      textbook_settings: {
        Row: {
          default_account_id: number | null
          id: boolean
          notice: string | null
          shipping_fee: number
          updated_at: string
        }
        Insert: {
          default_account_id?: number | null
          id?: boolean
          notice?: string | null
          shipping_fee?: number
          updated_at?: string
        }
        Update: {
          default_account_id?: number | null
          id?: boolean
          notice?: string | null
          shipping_fee?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "textbook_settings_default_account_id_fkey"
            columns: ["default_account_id"]
            isOneToOne: false
            referencedRelation: "textbook_accounts"
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
          program: string
          season: string
          start_time: string
          ttf_recorded: boolean
        }
        Insert: {
          end_time: string
          id?: number
          level: number
          program?: string
          season?: string
          start_time: string
          ttf_recorded?: boolean
        }
        Update: {
          end_time?: string
          id?: number
          level?: number
          program?: string
          season?: string
          start_time?: string
          ttf_recorded?: boolean
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
      cancel_account_merge: { Args: { p_request: number }; Returns: undefined }
      confirm_account_merge: { Args: { p_request: number }; Returns: Json }
      confirm_identity: { Args: { p_name: string; p_phone: string }; Returns: undefined }
      merge_candidates: {
        Args: Record<string, never>
        Returns: {
          email_hint: string
          has_records: boolean
          joined_at: string
          user_id: string
        }[]
      }
      request_account_merge: { Args: { p_keep: string; p_other: string }; Returns: number }
      staff_merge_accounts: { Args: { p_from: string; p_to: string }; Returns: Json }
      student_auth_info: {
        Args: { p_ids: string[] }
        Returns: {
          user_id: string
          email: string | null
          providers: string[]
          last_sign_in_at: string | null
        }[]
      }
      staff_merge_candidates: {
        Args: { p_user: string }
        Returns: {
          user_id: string
          name: string
          phone: string | null
          email_hint: string
          joined_at: string
          role: string
          same_name: boolean
          same_phone: boolean
          has_records: boolean
        }[]
      }
      complete_profile: {
        Args: {
          p_department?: string | null
          p_gender?: string | null
          p_name: string
          p_phone: string
          p_university?: string | null
        }
        Returns: undefined
      }
      my_section_ids: { Args: never; Returns: number[] }
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
      sync_term_instructors: { Args: { p_term_id: number }; Returns: Json }
      recorded_source_section: { Args: { p_section_id: number }; Returns: number | null }
      term_section_includes: {
        Args: { p_term_id: number }
        Returns: {
          included_id: number
          section_id: number
        }[]
      }
      term_recorded_pairs: {
        Args: { p_term_id: number }
        Returns: {
          recorded_id: number
          source_id: number
        }[]
      }
      app_cron_secret: {
        Args: never
        Returns: string
      }
      naver_apply_snapshot: {
        Args: { p_from: string; p_slots: Json; p_to: string }
        Returns: Json
      }
      naver_sync_failed: {
        Args: { p_error: string; p_retry_after?: string }
        Returns: number
      }
      create_textbook_order: {
        Args: { p_address: string; p_address_detail: string; p_depositor: string; p_item_ids: number[]; p_memo: string; p_phone: string; p_postal_code: string; p_recipient: string; p_term_id: number }
        Returns: number
      }
      cancel_textbook_order: {
        Args: { p_id: number }
        Returns: boolean
      }
      live_detect_candidates: {
        Args: never
        Returns: { instructor_id: string; label: string; section_id: number; session_date_id: number; starts_at: string }[]
      }
      register_detected_live: {
        Args: { p_session_date_ids: number[]; p_url: string }
        Returns: number[]
      }
      attendance_display: {
        Args: never
        Returns: Json
      }
      attendance_scan: {
        Args: { p_method?: string; p_token: string }
        Returns: Json
      }
      attendance_set: {
        Args: { p_date: string; p_note: string; p_section: number; p_status: string; p_student: string }
        Returns: boolean
      }
      attendance_roster: {
        Args: { p_date: string }
        Returns: { check_in_at: string | null; check_out_at: string | null; course_name: string; decided_by_name: string | null; decided_note: string | null; late: boolean; phone: string | null; section_id: number; status: string | null; student_id: string; student_name: string; target_score: number | null; tester: boolean; time_block: string | null; track: string }[]
      }
      attendance_poster_token: {
        Args: never
        Returns: Json
      }
      rotate_attendance_poster: {
        Args: never
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
        | "assistant"
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
        "assistant",
        "admin",
      ],
    },
  },
} as const
