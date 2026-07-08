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
      audit_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          record_id: string | null
          table_name: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          record_id?: string | null
          table_name?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          record_id?: string | null
          table_name?: string | null
          user_id?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          balance: number
          created_at: string
          credit_limit: number
          id: string
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
          user_id: string
          workshop: string | null
        }
        Insert: {
          balance?: number
          created_at?: string
          credit_limit?: number
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          user_id: string
          workshop?: string | null
        }
        Update: {
          balance?: number
          created_at?: string
          credit_limit?: number
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string
          workshop?: string | null
        }
        Relationships: []
      }
      expenses: {
        Row: {
          account_id: string | null
          amount: number
          created_at: string
          date: string
          id: string
          notes: string | null
          target: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          amount?: number
          created_at?: string
          date?: string
          id?: string
          notes?: string | null
          target: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          created_at?: string
          date?: string
          id?: string
          notes?: string | null
          target?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "expenses_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
        ]
      }
      export_logs: {
        Row: {
          created_at: string
          duration_ms: number | null
          error_message: string | null
          export_type: string
          format: string
          id: string
          notes: string | null
          payload: Json | null
          row_count: number
          status: string
          tables: string[]
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          export_type: string
          format: string
          id?: string
          notes?: string | null
          payload?: Json | null
          row_count?: number
          status?: string
          tables?: string[]
          user_id: string
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          export_type?: string
          format?: string
          id?: string
          notes?: string | null
          payload?: Json | null
          row_count?: number
          status?: string
          tables?: string[]
          user_id?: string
        }
        Relationships: []
      }
      import_logs: {
        Row: {
          created_at: string
          duration_ms: number | null
          error_message: string | null
          file_name: string | null
          format: string
          id: string
          imported_rows: number
          invalid_rows: number
          notes: string | null
          payload: Json | null
          source: string
          status: string
          total_rows: number
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          file_name?: string | null
          format?: string
          id?: string
          imported_rows?: number
          invalid_rows?: number
          notes?: string | null
          payload?: Json | null
          source?: string
          status?: string
          total_rows?: number
          user_id: string
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          file_name?: string | null
          format?: string
          id?: string
          imported_rows?: number
          invalid_rows?: number
          notes?: string | null
          payload?: Json | null
          source?: string
          status?: string
          total_rows?: number
          user_id?: string
        }
        Relationships: []
      }
      invoice_items: {
        Row: {
          cost_price: number
          created_at: string
          id: string
          invoice_id: string
          line_total: number
          product_id: string | null
          product_name: string
          quantity: number
          unit: string
          unit_price: number
          user_id: string
        }
        Insert: {
          cost_price?: number
          created_at?: string
          id?: string
          invoice_id: string
          line_total?: number
          product_id?: string | null
          product_name: string
          quantity?: number
          unit?: string
          unit_price?: number
          user_id: string
        }
        Update: {
          cost_price?: number
          created_at?: string
          id?: string
          invoice_id?: string
          line_total?: number
          product_id?: string | null
          product_name?: string
          quantity?: number
          unit?: string
          unit_price?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          created_at: string
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          discount: number
          id: string
          invoice_number: number
          notes: string | null
          paid: number
          payment_method: string
          payment_method_id: string | null
          remaining: number
          source: string
          status: string
          subtotal: number
          total: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          discount?: number
          id?: string
          invoice_number?: number
          notes?: string | null
          paid?: number
          payment_method?: string
          payment_method_id?: string | null
          remaining?: number
          source?: string
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          discount?: number
          id?: string
          invoice_number?: number
          notes?: string | null
          paid?: number
          payment_method?: string
          payment_method_id?: string | null
          remaining?: number
          source?: string
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "invoices_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          message: string | null
          product_id: string | null
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message?: string | null
          product_id?: string | null
          read?: boolean
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string | null
          product_id?: string | null
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_methods: {
        Row: {
          account_holder: string | null
          account_number: string | null
          bank_name: string | null
          created_at: string
          iban: string | null
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          notes: string | null
          opening_balance: number
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_holder?: string | null
          account_number?: string | null
          bank_name?: string | null
          created_at?: string
          iban?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          notes?: string | null
          opening_balance?: number
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_holder?: string | null
          account_number?: string | null
          bank_name?: string | null
          created_at?: string
          iban?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          notes?: string | null
          opening_balance?: number
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          account_id: string | null
          amount: number
          created_at: string
          id: string
          invoice_id: string | null
          method: string | null
          notes: string | null
          party_id: string
          party_type: string
          purchase_id: string | null
          user_id: string
        }
        Insert: {
          account_id?: string | null
          amount?: number
          created_at?: string
          id?: string
          invoice_id?: string | null
          method?: string | null
          notes?: string | null
          party_id: string
          party_type: string
          purchase_id?: string | null
          user_id: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          created_at?: string
          id?: string
          invoice_id?: string | null
          method?: string | null
          notes?: string | null
          party_id?: string
          party_type?: string
          purchase_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "payments_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      price_history: {
        Row: {
          created_at: string
          id: string
          new_price: number
          old_price: number
          product_id: string
          purchase_id: string | null
          source: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          new_price?: number
          old_price?: number
          product_id: string
          purchase_id?: string | null
          source?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          new_price?: number
          old_price?: number
          product_id?: string
          purchase_id?: string | null
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_history_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          barcode: string | null
          category: string | null
          cost_price: number
          created_at: string
          id: string
          is_active: boolean
          location: string | null
          min_quantity: number
          name: string
          notes: string | null
          quantity: number
          sale_price: number
          unit: string
          updated_at: string
          user_id: string
        }
        Insert: {
          barcode?: string | null
          category?: string | null
          cost_price?: number
          created_at?: string
          id?: string
          is_active?: boolean
          location?: string | null
          min_quantity?: number
          name: string
          notes?: string | null
          quantity?: number
          sale_price?: number
          unit?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          barcode?: string | null
          category?: string | null
          cost_price?: number
          created_at?: string
          id?: string
          is_active?: boolean
          location?: string | null
          min_quantity?: number
          name?: string
          notes?: string | null
          quantity?: number
          sale_price?: number
          unit?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      purchase_items: {
        Row: {
          cost_price: number
          created_at: string
          id: string
          product_id: string | null
          product_name: string
          purchase_id: string
          quantity: number
          total: number
          user_id: string
        }
        Insert: {
          cost_price?: number
          created_at?: string
          id?: string
          product_id?: string | null
          product_name: string
          purchase_id: string
          quantity?: number
          total?: number
          user_id: string
        }
        Update: {
          cost_price?: number
          created_at?: string
          id?: string
          product_id?: string | null
          product_name?: string
          purchase_id?: string
          quantity?: number
          total?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      purchases: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          paid: number
          purchase_number: number
          remaining: number
          status: string
          supplier_id: string | null
          supplier_name: string | null
          total: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          paid?: number
          purchase_number?: number
          remaining?: number
          status?: string
          supplier_id?: string | null
          supplier_name?: string | null
          total?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          paid?: number
          purchase_number?: number
          remaining?: number
          status?: string
          supplier_id?: string | null
          supplier_name?: string | null
          total?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchases_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      returns: {
        Row: {
          created_at: string
          id: string
          invoice_id: string | null
          notes: string | null
          product_id: string | null
          product_name: string
          quantity: number
          reason: string | null
          status: Database["public"]["Enums"]["return_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invoice_id?: string | null
          notes?: string | null
          product_id?: string | null
          product_name: string
          quantity?: number
          reason?: string | null
          status?: Database["public"]["Enums"]["return_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invoice_id?: string | null
          notes?: string | null
          product_id?: string | null
          product_name?: string
          quantity?: number
          reason?: string | null
          status?: Database["public"]["Enums"]["return_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "returns_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "returns_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      store_profile: {
        Row: {
          address: string
          auto_print: boolean
          created_at: string
          currency: string
          id: string
          invoice_footer: string
          invoice_header: string
          logo_url: string | null
          name: string
          phone: string
          print_copies: number
          print_size: string
          show_logo: boolean
          show_qr: boolean
          show_tax: boolean
          tax_number: string
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string
          auto_print?: boolean
          created_at?: string
          currency?: string
          id?: string
          invoice_footer?: string
          invoice_header?: string
          logo_url?: string | null
          name?: string
          phone?: string
          print_copies?: number
          print_size?: string
          show_logo?: boolean
          show_qr?: boolean
          show_tax?: boolean
          tax_number?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string
          auto_print?: boolean
          created_at?: string
          currency?: string
          id?: string
          invoice_footer?: string
          invoice_header?: string
          logo_url?: string | null
          name?: string
          phone?: string
          print_copies?: number
          print_size?: string
          show_logo?: boolean
          show_qr?: boolean
          show_tax?: boolean
          tax_number?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          address: string | null
          balance: number
          created_at: string
          id: string
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          balance?: number
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          balance?: number
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      account_balances: {
        Row: {
          account_id: string | null
          balance: number | null
          bank_name: string | null
          incoming: number | null
          is_active: boolean | null
          is_default: boolean | null
          name: string | null
          opening_balance: number | null
          outgoing_expense: number | null
          outgoing_supplier: number | null
          type: string | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      __test_count_null_auth_tokens: { Args: never; Returns: number }
      __test_create_auth_user: {
        Args: {
          p_confirm: boolean
          p_email: string
          p_null_tokens: boolean
          p_password: string
        }
        Returns: string
      }
      __test_delete_auth_user: { Args: { p_email: string }; Returns: undefined }
      admin_list_users: {
        Args: never
        Returns: {
          created_at: string
          email: string
          user_id: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "seller" | "accountant" | "warehouse"
      return_status: "pending" | "accepted" | "rejected"
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
      app_role: ["admin", "seller", "accountant", "warehouse"],
      return_status: ["pending", "accepted", "rejected"],
    },
  },
} as const
