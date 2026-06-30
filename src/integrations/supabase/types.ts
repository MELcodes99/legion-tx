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
      base_transactions_biweekly: {
        Row: {
          amount: number
          biweek_start: string
          created_at: string
          gas_fee_usd: number | null
          gas_token: string
          id: string
          receiver_address: string
          sender_address: string
          status: string
          token_sent: string
          tx_hash: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          biweek_start: string
          created_at?: string
          gas_fee_usd?: number | null
          gas_token: string
          id?: string
          receiver_address: string
          sender_address: string
          status?: string
          token_sent: string
          tx_hash?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          biweek_start?: string
          created_at?: string
          gas_fee_usd?: number | null
          gas_token?: string
          id?: string
          receiver_address?: string
          sender_address?: string
          status?: string
          token_sent?: string
          tx_hash?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      base_transactions_daily: {
        Row: {
          amount: number
          created_at: string
          gas_fee_usd: number | null
          gas_token: string
          id: string
          period_date: string
          receiver_address: string
          sender_address: string
          status: string
          token_sent: string
          tx_hash: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          gas_fee_usd?: number | null
          gas_token: string
          id?: string
          period_date?: string
          receiver_address: string
          sender_address: string
          status?: string
          token_sent: string
          tx_hash?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          gas_fee_usd?: number | null
          gas_token?: string
          id?: string
          period_date?: string
          receiver_address?: string
          sender_address?: string
          status?: string
          token_sent?: string
          tx_hash?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      base_transactions_monthly: {
        Row: {
          amount: number
          created_at: string
          gas_fee_usd: number | null
          gas_token: string
          id: string
          month_start: string
          receiver_address: string
          sender_address: string
          status: string
          token_sent: string
          tx_hash: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          gas_fee_usd?: number | null
          gas_token: string
          id?: string
          month_start: string
          receiver_address: string
          sender_address: string
          status?: string
          token_sent: string
          tx_hash?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          gas_fee_usd?: number | null
          gas_token?: string
          id?: string
          month_start?: string
          receiver_address?: string
          sender_address?: string
          status?: string
          token_sent?: string
          tx_hash?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      base_transactions_weekly: {
        Row: {
          amount: number
          created_at: string
          gas_fee_usd: number | null
          gas_token: string
          id: string
          receiver_address: string
          sender_address: string
          status: string
          token_sent: string
          tx_hash: string | null
          updated_at: string
          week_start: string
        }
        Insert: {
          amount: number
          created_at?: string
          gas_fee_usd?: number | null
          gas_token: string
          id?: string
          receiver_address: string
          sender_address: string
          status?: string
          token_sent: string
          tx_hash?: string | null
          updated_at?: string
          week_start: string
        }
        Update: {
          amount?: number
          created_at?: string
          gas_fee_usd?: number | null
          gas_token?: string
          id?: string
          receiver_address?: string
          sender_address?: string
          status?: string
          token_sent?: string
          tx_hash?: string | null
          updated_at?: string
          week_start?: string
        }
        Relationships: []
      }
      base_transactions_yearly: {
        Row: {
          amount: number
          created_at: string
          gas_fee_usd: number | null
          gas_token: string
          id: string
          receiver_address: string
          sender_address: string
          status: string
          token_sent: string
          tx_hash: string | null
          updated_at: string
          year_start: string
        }
        Insert: {
          amount: number
          created_at?: string
          gas_fee_usd?: number | null
          gas_token: string
          id?: string
          receiver_address: string
          sender_address: string
          status?: string
          token_sent: string
          tx_hash?: string | null
          updated_at?: string
          year_start: string
        }
        Update: {
          amount?: number
          created_at?: string
          gas_fee_usd?: number | null
          gas_token?: string
          id?: string
          receiver_address?: string
          sender_address?: string
          status?: string
          token_sent?: string
          tx_hash?: string | null
          updated_at?: string
          year_start?: string
        }
        Relationships: []
      }
      chain_period_analytics: {
        Row: {
          chain: string
          created_at: string
          failed_transactions: number
          gas_token_breakdown: Json | null
          id: string
          most_used_gas_token: string | null
          period_end: string
          period_start: string
          period_type: Database["public"]["Enums"]["report_period"]
          successful_transactions: number
          token_breakdown: Json | null
          total_revenue: number
          total_transactions: number
          total_volume: number
          unique_receivers: number
          unique_senders: number
          updated_at: string
        }
        Insert: {
          chain: string
          created_at?: string
          failed_transactions?: number
          gas_token_breakdown?: Json | null
          id?: string
          most_used_gas_token?: string | null
          period_end: string
          period_start: string
          period_type: Database["public"]["Enums"]["report_period"]
          successful_transactions?: number
          token_breakdown?: Json | null
          total_revenue?: number
          total_transactions?: number
          total_volume?: number
          unique_receivers?: number
          unique_senders?: number
          updated_at?: string
        }
        Update: {
          chain?: string
          created_at?: string
          failed_transactions?: number
          gas_token_breakdown?: Json | null
          id?: string
          most_used_gas_token?: string | null
          period_end?: string
          period_start?: string
          period_type?: Database["public"]["Enums"]["report_period"]
          successful_transactions?: number
          token_breakdown?: Json | null
          total_revenue?: number
          total_transactions?: number
          total_volume?: number
          unique_receivers?: number
          unique_senders?: number
          updated_at?: string
        }
        Relationships: []
      }
      chain_rankings: {
        Row: {
          average_transaction_size: number | null
          chain: string
          created_at: string
          id: string
          last_transaction_at: string | null
          most_used_gas_token: string | null
          rank_position: number | null
          total_revenue_all_time: number
          total_transactions_all_time: number
          total_volume_all_time: number
          unique_users: number
          updated_at: string
        }
        Insert: {
          average_transaction_size?: number | null
          chain: string
          created_at?: string
          id?: string
          last_transaction_at?: string | null
          most_used_gas_token?: string | null
          rank_position?: number | null
          total_revenue_all_time?: number
          total_transactions_all_time?: number
          total_volume_all_time?: number
          unique_users?: number
          updated_at?: string
        }
        Update: {
          average_transaction_size?: number | null
          chain?: string
          created_at?: string
          id?: string
          last_transaction_at?: string | null
          most_used_gas_token?: string | null
          rank_position?: number | null
          total_revenue_all_time?: number
          total_transactions_all_time?: number
          total_volume_all_time?: number
          unique_users?: number
          updated_at?: string
        }
        Relationships: []
      }
      daily_reports: {
        Row: {
          chain_breakdown: Json | null
          created_at: string
          gas_token_breakdown: Json | null
          id: string
          most_used_chain: string | null
          most_used_gas_token: string | null
          new_user_count: number
          report_date: string
          total_revenue: number
          total_transactions: number
          updated_at: string
        }
        Insert: {
          chain_breakdown?: Json | null
          created_at?: string
          gas_token_breakdown?: Json | null
          id?: string
          most_used_chain?: string | null
          most_used_gas_token?: string | null
          new_user_count?: number
          report_date: string
          total_revenue?: number
          total_transactions?: number
          updated_at?: string
        }
        Update: {
          chain_breakdown?: Json | null
          created_at?: string
          gas_token_breakdown?: Json | null
          id?: string
          most_used_chain?: string | null
          most_used_gas_token?: string | null
          new_user_count?: number
          report_date?: string
          total_revenue?: number
          total_transactions?: number
          updated_at?: string
        }
        Relationships: []
      }
      ethereum_transactions_biweekly: {
        Row: {
          amount: number
          biweek_start: string
          created_at: string
          gas_fee_usd: number | null
          gas_token: string
          id: string
          receiver_address: string
          sender_address: string
          status: string
          token_sent: string
          tx_hash: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          biweek_start: string
          created_at?: string
          gas_fee_usd?: number | null
          gas_token: string
          id?: string
          receiver_address: string
          sender_address: string
          status?: string
          token_sent: string
          tx_hash?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          biweek_start?: string
          created_at?: string
          gas_fee_usd?: number | null
          gas_token?: string
          id?: string
          receiver_address?: string
          sender_address?: string
          status?: string
          token_sent?: string
          tx_hash?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ethereum_transactions_daily: {
        Row: {
          amount: number
          created_at: string
          gas_fee_usd: number | null
          gas_token: string
          id: string
          period_date: string
          receiver_address: string
          sender_address: string
          status: string
          token_sent: string
          tx_hash: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          gas_fee_usd?: number | null
          gas_token: string
          id?: string
          period_date?: string
          receiver_address: string
          sender_address: string
          status?: string
          token_sent: string
          tx_hash?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          gas_fee_usd?: number | null
          gas_token?: string
          id?: string
          period_date?: string
          receiver_address?: string
          sender_address?: string
          status?: string
          token_sent?: string
          tx_hash?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ethereum_transactions_monthly: {
        Row: {
          amount: number
          created_at: string
          gas_fee_usd: number | null
          gas_token: string
          id: string
          month_start: string
          receiver_address: string
          sender_address: string
          status: string
          token_sent: string
          tx_hash: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          gas_fee_usd?: number | null
          gas_token: string
          id?: string
          month_start: string
          receiver_address: string
          sender_address: string
          status?: string
          token_sent: string
          tx_hash?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          gas_fee_usd?: number | null
          gas_token?: string
          id?: string
          month_start?: string
          receiver_address?: string
          sender_address?: string
          status?: string
          token_sent?: string
          tx_hash?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ethereum_transactions_weekly: {
        Row: {
          amount: number
          created_at: string
          gas_fee_usd: number | null
          gas_token: string
          id: string
          receiver_address: string
          sender_address: string
          status: string
          token_sent: string
          tx_hash: string | null
          updated_at: string
          week_start: string
        }
        Insert: {
          amount: number
          created_at?: string
          gas_fee_usd?: number | null
          gas_token: string
          id?: string
          receiver_address: string
          sender_address: string
          status?: string
          token_sent: string
          tx_hash?: string | null
          updated_at?: string
          week_start: string
        }
        Update: {
          amount?: number
          created_at?: string
          gas_fee_usd?: number | null
          gas_token?: string
          id?: string
          receiver_address?: string
          sender_address?: string
          status?: string
          token_sent?: string
          tx_hash?: string | null
          updated_at?: string
          week_start?: string
        }
        Relationships: []
      }
      ethereum_transactions_yearly: {
        Row: {
          amount: number
          created_at: string
          gas_fee_usd: number | null
          gas_token: string
          id: string
          receiver_address: string
          sender_address: string
          status: string
          token_sent: string
          tx_hash: string | null
          updated_at: string
          year_start: string
        }
        Insert: {
          amount: number
          created_at?: string
          gas_fee_usd?: number | null
          gas_token: string
          id?: string
          receiver_address: string
          sender_address: string
          status?: string
          token_sent: string
          tx_hash?: string | null
          updated_at?: string
          year_start: string
        }
        Update: {
          amount?: number
          created_at?: string
          gas_fee_usd?: number | null
          gas_token?: string
          id?: string
          receiver_address?: string
          sender_address?: string
          status?: string
          token_sent?: string
          tx_hash?: string | null
          updated_at?: string
          year_start?: string
        }
        Relationships: []
      }
      paj_orders: {
        Row: {
          amount_sent: number
          bank_account_name: string | null
          bank_account_number: string | null
          bank_id: string | null
          bank_name: string | null
          created_at: string
          deposit_address: string
          fee_usd: number
          fiat_amount: number | null
          flow: string
          gas_fee_deducted: number
          id: string
          paj_order_id: string | null
          paj_wallet_address: string | null
          rate: number | null
          status: string
          token_mint: string
          token_symbol: string | null
          transaction_type: string
          tx_hash: string | null
          updated_at: string
          usdc_amount: number | null
          user_wallet_address: string
          webhook_payload: Json | null
        }
        Insert: {
          amount_sent: number
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_id?: string | null
          bank_name?: string | null
          created_at?: string
          deposit_address: string
          fee_usd?: number
          fiat_amount?: number | null
          flow: string
          gas_fee_deducted?: number
          id?: string
          paj_order_id?: string | null
          paj_wallet_address?: string | null
          rate?: number | null
          status?: string
          token_mint: string
          token_symbol?: string | null
          transaction_type?: string
          tx_hash?: string | null
          updated_at?: string
          usdc_amount?: number | null
          user_wallet_address: string
          webhook_payload?: Json | null
        }
        Update: {
          amount_sent?: number
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_id?: string | null
          bank_name?: string | null
          created_at?: string
          deposit_address?: string
          fee_usd?: number
          fiat_amount?: number | null
          flow?: string
          gas_fee_deducted?: number
          id?: string
          paj_order_id?: string | null
          paj_wallet_address?: string | null
          rate?: number | null
          status?: string
          token_mint?: string
          token_symbol?: string | null
          transaction_type?: string
          tx_hash?: string | null
          updated_at?: string
          usdc_amount?: number | null
          user_wallet_address?: string
          webhook_payload?: Json | null
        }
        Relationships: []
      }
      paj_profiles: {
        Row: {
          bank_account_name: string
          bank_account_number: string
          bank_id: string
          bank_logo: string | null
          bank_name: string
          created_at: string
          id: string
          paj_bank_account_id: string
          paj_wallet_address: string
          updated_at: string
          user_wallet_address: string
        }
        Insert: {
          bank_account_name: string
          bank_account_number: string
          bank_id: string
          bank_logo?: string | null
          bank_name: string
          created_at?: string
          id?: string
          paj_bank_account_id: string
          paj_wallet_address: string
          updated_at?: string
          user_wallet_address: string
        }
        Update: {
          bank_account_name?: string
          bank_account_number?: string
          bank_id?: string
          bank_logo?: string | null
          bank_name?: string
          created_at?: string
          id?: string
          paj_bank_account_id?: string
          paj_wallet_address?: string
          updated_at?: string
          user_wallet_address?: string
        }
        Relationships: []
      }
      platform_stats: {
        Row: {
          created_at: string
          id: string
          total_fees_earned: number
          total_transactions: number
          total_users: number
          total_volume: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          total_fees_earned?: number
          total_transactions?: number
          total_users?: number
          total_volume?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          total_fees_earned?: number
          total_transactions?: number
          total_users?: number
          total_volume?: number
          updated_at?: string
        }
        Relationships: []
      }
      solana_transactions_biweekly: {
        Row: {
          amount: number
          biweek_start: string
          created_at: string
          gas_fee_usd: number | null
          gas_token: string
          id: string
          receiver_address: string
          sender_address: string
          status: string
          token_sent: string
          tx_hash: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          biweek_start: string
          created_at?: string
          gas_fee_usd?: number | null
          gas_token: string
          id?: string
          receiver_address: string
          sender_address: string
          status?: string
          token_sent: string
          tx_hash?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          biweek_start?: string
          created_at?: string
          gas_fee_usd?: number | null
          gas_token?: string
          id?: string
          receiver_address?: string
          sender_address?: string
          status?: string
          token_sent?: string
          tx_hash?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      solana_transactions_daily: {
        Row: {
          amount: number
          created_at: string
          gas_fee_usd: number | null
          gas_token: string
          id: string
          period_date: string
          receiver_address: string
          sender_address: string
          status: string
          token_sent: string
          tx_hash: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          gas_fee_usd?: number | null
          gas_token: string
          id?: string
          period_date?: string
          receiver_address: string
          sender_address: string
          status?: string
          token_sent: string
          tx_hash?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          gas_fee_usd?: number | null
          gas_token?: string
          id?: string
          period_date?: string
          receiver_address?: string
          sender_address?: string
          status?: string
          token_sent?: string
          tx_hash?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      solana_transactions_monthly: {
        Row: {
          amount: number
          created_at: string
          gas_fee_usd: number | null
          gas_token: string
          id: string
          month_start: string
          receiver_address: string
          sender_address: string
          status: string
          token_sent: string
          tx_hash: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          gas_fee_usd?: number | null
          gas_token: string
          id?: string
          month_start: string
          receiver_address: string
          sender_address: string
          status?: string
          token_sent: string
          tx_hash?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          gas_fee_usd?: number | null
          gas_token?: string
          id?: string
          month_start?: string
          receiver_address?: string
          sender_address?: string
          status?: string
          token_sent?: string
          tx_hash?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      solana_transactions_weekly: {
        Row: {
          amount: number
          created_at: string
          gas_fee_usd: number | null
          gas_token: string
          id: string
          receiver_address: string
          sender_address: string
          status: string
          token_sent: string
          tx_hash: string | null
          updated_at: string
          week_start: string
        }
        Insert: {
          amount: number
          created_at?: string
          gas_fee_usd?: number | null
          gas_token: string
          id?: string
          receiver_address: string
          sender_address: string
          status?: string
          token_sent: string
          tx_hash?: string | null
          updated_at?: string
          week_start: string
        }
        Update: {
          amount?: number
          created_at?: string
          gas_fee_usd?: number | null
          gas_token?: string
          id?: string
          receiver_address?: string
          sender_address?: string
          status?: string
          token_sent?: string
          tx_hash?: string | null
          updated_at?: string
          week_start?: string
        }
        Relationships: []
      }
      solana_transactions_yearly: {
        Row: {
          amount: number
          created_at: string
          gas_fee_usd: number | null
          gas_token: string
          id: string
          receiver_address: string
          sender_address: string
          status: string
          token_sent: string
          tx_hash: string | null
          updated_at: string
          year_start: string
        }
        Insert: {
          amount: number
          created_at?: string
          gas_fee_usd?: number | null
          gas_token: string
          id?: string
          receiver_address: string
          sender_address: string
          status?: string
          token_sent: string
          tx_hash?: string | null
          updated_at?: string
          year_start: string
        }
        Update: {
          amount?: number
          created_at?: string
          gas_fee_usd?: number | null
          gas_token?: string
          id?: string
          receiver_address?: string
          sender_address?: string
          status?: string
          token_sent?: string
          tx_hash?: string | null
          updated_at?: string
          year_start?: string
        }
        Relationships: []
      }
      sui_transactions_biweekly: {
        Row: {
          amount: number
          biweek_start: string
          created_at: string
          gas_fee_usd: number | null
          gas_token: string
          id: string
          receiver_address: string
          sender_address: string
          status: string
          token_sent: string
          tx_hash: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          biweek_start: string
          created_at?: string
          gas_fee_usd?: number | null
          gas_token: string
          id?: string
          receiver_address: string
          sender_address: string
          status?: string
          token_sent: string
          tx_hash?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          biweek_start?: string
          created_at?: string
          gas_fee_usd?: number | null
          gas_token?: string
          id?: string
          receiver_address?: string
          sender_address?: string
          status?: string
          token_sent?: string
          tx_hash?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sui_transactions_daily: {
        Row: {
          amount: number
          created_at: string
          gas_fee_usd: number | null
          gas_token: string
          id: string
          period_date: string
          receiver_address: string
          sender_address: string
          status: string
          token_sent: string
          tx_hash: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          gas_fee_usd?: number | null
          gas_token: string
          id?: string
          period_date?: string
          receiver_address: string
          sender_address: string
          status?: string
          token_sent: string
          tx_hash?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          gas_fee_usd?: number | null
          gas_token?: string
          id?: string
          period_date?: string
          receiver_address?: string
          sender_address?: string
          status?: string
          token_sent?: string
          tx_hash?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sui_transactions_monthly: {
        Row: {
          amount: number
          created_at: string
          gas_fee_usd: number | null
          gas_token: string
          id: string
          month_start: string
          receiver_address: string
          sender_address: string
          status: string
          token_sent: string
          tx_hash: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          gas_fee_usd?: number | null
          gas_token: string
          id?: string
          month_start: string
          receiver_address: string
          sender_address: string
          status?: string
          token_sent: string
          tx_hash?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          gas_fee_usd?: number | null
          gas_token?: string
          id?: string
          month_start?: string
          receiver_address?: string
          sender_address?: string
          status?: string
          token_sent?: string
          tx_hash?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sui_transactions_weekly: {
        Row: {
          amount: number
          created_at: string
          gas_fee_usd: number | null
          gas_token: string
          id: string
          receiver_address: string
          sender_address: string
          status: string
          token_sent: string
          tx_hash: string | null
          updated_at: string
          week_start: string
        }
        Insert: {
          amount: number
          created_at?: string
          gas_fee_usd?: number | null
          gas_token: string
          id?: string
          receiver_address: string
          sender_address: string
          status?: string
          token_sent: string
          tx_hash?: string | null
          updated_at?: string
          week_start: string
        }
        Update: {
          amount?: number
          created_at?: string
          gas_fee_usd?: number | null
          gas_token?: string
          id?: string
          receiver_address?: string
          sender_address?: string
          status?: string
          token_sent?: string
          tx_hash?: string | null
          updated_at?: string
          week_start?: string
        }
        Relationships: []
      }
      sui_transactions_yearly: {
        Row: {
          amount: number
          created_at: string
          gas_fee_usd: number | null
          gas_token: string
          id: string
          receiver_address: string
          sender_address: string
          status: string
          token_sent: string
          tx_hash: string | null
          updated_at: string
          year_start: string
        }
        Insert: {
          amount: number
          created_at?: string
          gas_fee_usd?: number | null
          gas_token: string
          id?: string
          receiver_address: string
          sender_address: string
          status?: string
          token_sent: string
          tx_hash?: string | null
          updated_at?: string
          year_start: string
        }
        Update: {
          amount?: number
          created_at?: string
          gas_fee_usd?: number | null
          gas_token?: string
          id?: string
          receiver_address?: string
          sender_address?: string
          status?: string
          token_sent?: string
          tx_hash?: string | null
          updated_at?: string
          year_start?: string
        }
        Relationships: []
      }
      swaps_daily: {
        Row: {
          chain: string
          created_at: string
          fee_usd: number
          from_amount: number
          from_token: string
          id: string
          period_date: string
          status: string
          to_amount: number
          to_token: string
          tx_hash: string | null
          updated_at: string
          volume_usd: number
          wallet_address: string
        }
        Insert: {
          chain?: string
          created_at?: string
          fee_usd?: number
          from_amount?: number
          from_token: string
          id?: string
          period_date?: string
          status?: string
          to_amount?: number
          to_token: string
          tx_hash?: string | null
          updated_at?: string
          volume_usd?: number
          wallet_address: string
        }
        Update: {
          chain?: string
          created_at?: string
          fee_usd?: number
          from_amount?: number
          from_token?: string
          id?: string
          period_date?: string
          status?: string
          to_amount?: number
          to_token?: string
          tx_hash?: string | null
          updated_at?: string
          volume_usd?: number
          wallet_address?: string
        }
        Relationships: []
      }
      swaps_monthly: {
        Row: {
          chain: string
          created_at: string
          fee_usd: number
          from_amount: number
          from_token: string
          id: string
          month_start: string
          status: string
          to_amount: number
          to_token: string
          tx_hash: string | null
          updated_at: string
          volume_usd: number
          wallet_address: string
        }
        Insert: {
          chain?: string
          created_at?: string
          fee_usd?: number
          from_amount?: number
          from_token: string
          id?: string
          month_start: string
          status?: string
          to_amount?: number
          to_token: string
          tx_hash?: string | null
          updated_at?: string
          volume_usd?: number
          wallet_address: string
        }
        Update: {
          chain?: string
          created_at?: string
          fee_usd?: number
          from_amount?: number
          from_token?: string
          id?: string
          month_start?: string
          status?: string
          to_amount?: number
          to_token?: string
          tx_hash?: string | null
          updated_at?: string
          volume_usd?: number
          wallet_address?: string
        }
        Relationships: []
      }
      swaps_weekly: {
        Row: {
          chain: string
          created_at: string
          fee_usd: number
          from_amount: number
          from_token: string
          id: string
          status: string
          to_amount: number
          to_token: string
          tx_hash: string | null
          updated_at: string
          volume_usd: number
          wallet_address: string
          week_start: string
        }
        Insert: {
          chain?: string
          created_at?: string
          fee_usd?: number
          from_amount?: number
          from_token: string
          id?: string
          status?: string
          to_amount?: number
          to_token: string
          tx_hash?: string | null
          updated_at?: string
          volume_usd?: number
          wallet_address: string
          week_start: string
        }
        Update: {
          chain?: string
          created_at?: string
          fee_usd?: number
          from_amount?: number
          from_token?: string
          id?: string
          status?: string
          to_amount?: number
          to_token?: string
          tx_hash?: string | null
          updated_at?: string
          volume_usd?: number
          wallet_address?: string
          week_start?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount: number
          chain: string
          created_at: string
          gas_fee_amount: number | null
          gas_fee_usd: number | null
          gas_token: string
          id: string
          receiver_address: string
          sender_address: string
          status: string
          token_sent: string
          tx_hash: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          chain: string
          created_at?: string
          gas_fee_amount?: number | null
          gas_fee_usd?: number | null
          gas_token: string
          id?: string
          receiver_address: string
          sender_address: string
          status?: string
          token_sent: string
          tx_hash?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          chain?: string
          created_at?: string
          gas_fee_amount?: number | null
          gas_fee_usd?: number | null
          gas_token?: string
          id?: string
          receiver_address?: string
          sender_address?: string
          status?: string
          token_sent?: string
          tx_hash?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      transfer_rate_limits: {
        Row: {
          created_at: string
          id: string
          request_count: number
          updated_at: string
          wallet_address: string
          window_start: string
        }
        Insert: {
          created_at?: string
          id?: string
          request_count?: number
          updated_at?: string
          wallet_address: string
          window_start?: string
        }
        Update: {
          created_at?: string
          id?: string
          request_count?: number
          updated_at?: string
          wallet_address?: string
          window_start?: string
        }
        Relationships: []
      }
      user_wallets: {
        Row: {
          created_at: string
          id: string
          joined_at: string
          last_transaction_at: string | null
          network: string
          total_fees: number
          total_transactions: number
          total_volume: number
          updated_at: string
          wallet_address: string
        }
        Insert: {
          created_at?: string
          id?: string
          joined_at?: string
          last_transaction_at?: string | null
          network: string
          total_fees?: number
          total_transactions?: number
          total_volume?: number
          updated_at?: string
          wallet_address: string
        }
        Update: {
          created_at?: string
          id?: string
          joined_at?: string
          last_transaction_at?: string | null
          network?: string
          total_fees?: number
          total_transactions?: number
          total_volume?: number
          updated_at?: string
          wallet_address?: string
        }
        Relationships: []
      }
    }
    Views: {
      paj_volume_stats: {
        Row: {
          bucket: string | null
          fees_usd: number | null
          gas_recovered: number | null
          period: string | null
          unique_users: number | null
          volume_ngn: number | null
          volume_usd: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      cleanup_old_rate_limits: { Args: never; Returns: undefined }
      generate_all_chain_analytics: {
        Args: { p_target_date?: string }
        Returns: undefined
      }
      generate_chain_period_analytics: {
        Args: {
          p_chain: string
          p_period_type: Database["public"]["Enums"]["report_period"]
          p_target_date?: string
        }
        Returns: undefined
      }
      generate_daily_report: {
        Args: { target_date?: string }
        Returns: undefined
      }
      insert_chain_transaction: {
        Args: {
          p_amount: number
          p_chain: string
          p_gas_fee_usd: number
          p_gas_token: string
          p_receiver: string
          p_sender: string
          p_status: string
          p_token_sent: string
          p_tx_hash: string
        }
        Returns: undefined
      }
      record_swap_stats: {
        Args: {
          p_chain: string
          p_fee_usd: number
          p_from_amount: number
          p_from_token: string
          p_status?: string
          p_to_amount: number
          p_to_token: string
          p_tx_hash: string
          p_volume_usd: number
          p_wallet_address: string
        }
        Returns: undefined
      }
      record_transaction_stats: {
        Args: {
          p_fee: number
          p_network: string
          p_volume: number
          p_wallet_address: string
        }
        Returns: undefined
      }
      update_chain_rankings: { Args: never; Returns: undefined }
    }
    Enums: {
      report_period: "daily" | "weekly" | "bi_weekly" | "monthly" | "yearly"
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
      report_period: ["daily", "weekly", "bi_weekly", "monthly", "yearly"],
    },
  },
} as const
