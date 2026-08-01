/**
 * Hand-maintained mirror of supabase/migrations/0001_init.sql.
 *
 * Regenerate with `supabase gen types typescript --linked > src/lib/supabase/types.ts`
 * once the project is linked; kept by hand here so the app typechecks without
 * a live database connection.
 */

import type { ScoutingReport } from "@/lib/chess/types";

export type Platform = "chesscom" | "lichess";
export type GameColor = "white" | "black";
export type GameResult = "win" | "loss" | "draw";
export type SyncStatus = "idle" | "syncing" | "error";

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type ProfileRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  created_at: string;
  updated_at: string;
};

export type OpponentRow = {
  id: string;
  platform: Platform;
  handle: string;
  display_handle: string;
  title: string | null;
  country: string | null;
  avatar_url: string | null;
  ratings: Record<string, number> | null;
  last_synced_at: string | null;
  last_game_at: string | null;
  games_count: number;
  sync_status: SyncStatus;
  sync_error: string | null;
  sync_started_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SavedOpponentRow = {
  id: string;
  user_id: string;
  opponent_id: string;
  label: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type GameRow = {
  id: number;
  opponent_id: string;
  platform: Platform;
  game_id: string;
  played_at: string;
  color: GameColor;
  result: GameResult;
  player_rating: number | null;
  rival_rating: number | null;
  rival_handle: string | null;
  time_class: string;
  time_control: string | null;
  rated: boolean;
  eco: string | null;
  opening_name: string | null;
  opening_slug: string | null;
  move_count: number;
  termination: string | null;
  url: string | null;
  moves_san: string | null;
  created_at: string;
};

export type ReportRow = {
  opponent_id: string;
  payload: ScoutingReport;
  games_analyzed: number;
  generated_at: string;
};

type Mutable<T, Optional extends keyof T> = Omit<T, Optional> & Partial<Pick<T, Optional>>;

/**
 * Foreign keys are declared so PostgREST embedded selects
 * (`opponent:opponents(*)`) resolve. Keys onto `auth.users` are omitted —
 * they live outside the exposed `public` schema.
 */
type SavedOpponentFk = {
  foreignKeyName: "saved_opponents_opponent_id_fkey";
  columns: ["opponent_id"];
  isOneToOne: false;
  referencedRelation: "opponents";
  referencedColumns: ["id"];
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: Mutable<ProfileRow, "created_at" | "updated_at" | "email" | "display_name">;
        Update: Partial<ProfileRow>;
        Relationships: [];
      };
      opponents: {
        Row: OpponentRow;
        Insert: Mutable<
          OpponentRow,
          | "id"
          | "title"
          | "country"
          | "avatar_url"
          | "ratings"
          | "last_synced_at"
          | "last_game_at"
          | "games_count"
          | "sync_status"
          | "sync_error"
          | "sync_started_at"
          | "created_at"
          | "updated_at"
        >;
        Update: Partial<OpponentRow>;
        Relationships: [];
      };
      saved_opponents: {
        Row: SavedOpponentRow;
        Insert: Mutable<
          SavedOpponentRow,
          "id" | "label" | "notes" | "created_at" | "updated_at"
        >;
        Update: Partial<SavedOpponentRow>;
        Relationships: [SavedOpponentFk];
      };
      games: {
        Row: GameRow;
        Insert: Omit<GameRow, "id" | "created_at"> & { id?: never; created_at?: string };
        Update: Partial<GameRow>;
        Relationships: [
          {
            foreignKeyName: "games_opponent_id_fkey";
            columns: ["opponent_id"];
            isOneToOne: false;
            referencedRelation: "opponents";
            referencedColumns: ["id"];
          },
        ];
      };
      reports: {
        Row: ReportRow;
        Insert: Mutable<ReportRow, "games_analyzed" | "generated_at">;
        Update: Partial<ReportRow>;
        Relationships: [
          {
            foreignKeyName: "reports_opponent_id_fkey";
            columns: ["opponent_id"];
            isOneToOne: true;
            referencedRelation: "opponents";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      stale_saved_opponents: {
        Args: { ttl_hours?: number; max_rows?: number };
        Returns: {
          id: string;
          platform: Platform;
          handle: string;
          last_synced_at: string | null;
          saver_count: number;
        }[];
      };
    };
    Enums: {
      platform: Platform;
      game_color: GameColor;
      game_result: GameResult;
      sync_status: SyncStatus;
    };
    CompositeTypes: Record<string, never>;
  };
}
