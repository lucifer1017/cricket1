import type { Timestamp } from "firebase/firestore";

/**
 * Cricket Scoring System - Type Definitions
 * 
 * This file defines the complete data model for the cricket scoring application.
 * We use Event Sourcing pattern where the score is derived from Ball events,
 * not stored as a counter. This enables safe, deterministic "Undo" operations.
 */

// ============================================================================
// ENUMS
// ============================================================================

/**
 * Match Status Enum
 * Tracks the current state of a cricket match
 */
export enum MatchStatus {
  SCHEDULED = 'scheduled',
  LIVE = 'live',
  COMPLETED = 'completed',
  ABANDONED = 'abandoned',
}

/**
 * Wicket Type Enum
 * All possible ways a batsman can be dismissed
 */
export enum WicketType {
  BOWLED = 'bowled',
  CAUGHT = 'caught',
  LBW = 'lbw',
  RUN_OUT = 'run_out',
  STUMPED = 'stumped',
  HIT_WICKET = 'hit_wicket',
  RETIRED = 'retired',
}

/**
 * Extra Type Enum
 * Types of extras that can be awarded
 */
export enum ExtraType {
  WIDE = 'wide',
  NO_BALL = 'no_ball',
  BYE = 'bye',
  LEG_BYE = 'leg_bye',
  PENALTY = 'penalty',
}

// ============================================================================
// CORE ENTITIES
// ============================================================================

/**
 * Player Entity
 * Represents a cricket player in the global pool
 * Players can be reused across multiple matches
 */
export interface Player {
  id: string;
  name: string; // Display name (e.g., "Virat Kohli")
  normalized_name: string; // Lowercase for case-insensitive search (e.g., "virat kohli")
  team_id?: string; // Optional: team association if player is team-specific
}

/**
 * Team Entity
 * Represents a cricket team with its squad of players
 */
export interface Team {
  id: string;
  name: string; // Team name (e.g., "India", "Mumbai Indians")
  players: Player[]; // The squad selected for this match
}

/**
 * Match Configuration
 * Match-specific rules and settings
 */
export interface MatchConfig {
  total_overs: number; // Total overs per innings (e.g., 20 for T20, 50 for ODI)
  wide_runs: number; // Runs awarded for a wide (typically 1)
  no_ball_runs: number; // Runs awarded for a no-ball (typically 1)
}

/**
 * Toss Result
 * Records which team won the toss and their decision
 */
export interface TossResult {
  winner_id: TeamId; // Team ID that won the toss ('a' or 'b')
  decision: 'bat' | 'bowl'; // What the winning team chose to do
}

/**
 * Score Object
 * Current score state for quick display
 */
export interface Score {
  runs: number; // Total runs scored
  wickets: number; // Number of wickets fallen
  overs: number; // Completed overs (e.g., 5)
  balls: number; // Balls in current over (0-5)
}

export interface BatterStats {
  runs: number;
  balls: number;
}

export interface BowlerStats {
  runs: number;
  balls: number;
  wickets: number;
}

export interface PlayerStatsState {
  batters: Record<string, BatterStats>;
  bowlers: Record<string, BowlerStats>;
}

/**
 * Match Live State
 * The current state of the match (denormalized for fast reads)
 * This is what viewers see on the live scoreboard
 */
export interface MatchLiveState {
  batting_team_id: string; // Which team is currently batting ('a' or 'b')
  bowling_team_id: string; // Which team is currently bowling ('a' or 'b')
  striker_id: string; // Player ID of the batsman facing the bowler
  non_striker_id: string; // Player ID of the batsman at the other end
  bowler_id: string; // Player ID of the current bowler
  score: Score; // Current score (runs, wickets, overs, balls)
  this_over?: OverBall[]; // Recent deliveries for display
  player_stats?: PlayerStatsState;
  is_free_hit?: boolean;
  last_ball_id?: string;
  last_bowler_id?: string; // Player ID of the bowler who just completed an over (prevents consecutive overs)
  first_innings_total?: number; // Total runs scored in first innings (for RRR calculation in second innings)
}

/**
 * Match Entity (The "Header" Document)
 * Main match document stored in Firestore 'matches' collection
 * Contains all match metadata and current live state
 */
export interface Match {
  id: string; // Firestore document ID
  owner_id: string; // User UID who created this match
  status: MatchStatus; // Current match status
  config: MatchConfig; // Match configuration (overs, rules)
  player_pool: Player[]; // Players available for this match
  teams: {
    a: Team; // Team A
    b: Team; // Team B
  };
  toss: TossResult | null; // Toss result (null if toss not done yet)
  live_state: MatchLiveState; // Current live state (denormalized for fast reads)
  created_at: number; // Timestamp when match was created
  updated_at: number; // Timestamp when match was last updated
}

// ============================================================================
// THE LEDGER (Event Sourcing)
// ============================================================================

/**
 * Extras Object
 * Records any extras awarded on a ball
 */
export interface Extras {
  type: ExtraType | null; // Type of extra (null if no extras)
  runs: number; // Additional runs from extras (e.g., wide + 4 = 5 total runs)
}

/**
 * Wicket Object
 * Records wicket information if a batsman was dismissed
 */
export interface Wicket {
  is_out: boolean; // Whether a wicket was taken
  type: WicketType | null; // Type of dismissal (null if not out)
  player_id: string | null; // ID of the player who was dismissed
  dismissed_by?: string; // Optional: Player ID who took the wicket (bowler/fielder)
  is_striker_out?: boolean; // Whether the striker was out (critical for strike rotation)
}

export interface OverBall {
  id: string;
  runs_off_bat: number;
  extras: Extras | null;
  wicket: Wicket | null;
}

/**
 * Ball Event (The Ledger Entry)
 * 
 * This is the MOST CRITICAL interface in our Event Sourcing architecture.
 * Each ball bowled is recorded as an immutable document in the sub-collection:
 * matches/{match_id}/innings/{innings_id}/balls/{ball_id}
 * 
 * KEY DESIGN DECISION: We store pre_ball_state snapshot
 * 
 * Why pre_ball_state?
 * - Enables deterministic "Undo" operations
 * - We can always reconstruct the exact state before this ball
 * - No need to query previous balls to reverse calculations
 * - Makes undo operations safe and reliable
 * 
 * Undo Process:
 * 1. Fetch the last BallEvent document
 * 2. Extract pre_ball_state (the state before this ball)
 * 3. Restore match state to pre_ball_state values
 * 4. Delete the BallEvent document
 * 5. Recalculate derived stats from remaining balls
 * 
 * This approach ensures data consistency and eliminates guesswork.
 */
export interface BallEvent {
  // Document Identity
  id: string; // Format: "{over}_{ball}" (e.g., "5_4" = Over 5, Ball 4)
  match_id: string; // Reference to the match document
  innings_id: string; // Which innings (e.g., "1" for first innings)
  timestamp: Timestamp | null; // Firestore timestamp for ordering

  // The Event Data (What happened on this ball)
  runs_off_bat: number; // Runs scored off the bat (0-6, or more for overthrows)
  extras: Extras | null; // Any extras awarded (wide, no-ball, bye, leg-bye, penalty)
  wicket: Wicket | null; // Wicket information if a dismissal occurred

  // The Snapshot (CRITICAL FOR UNDO)
  /**
   * Pre-Ball State Snapshot
   * 
   * This captures the EXACT state of the match BEFORE this ball was bowled.
   * It includes:
   * - Who was batting (striker/non-striker)
   * - Who was bowling
   * - Current score (runs, wickets, overs, balls)
   * 
   * When we undo:
   * 1. We restore live_state to this pre_ball_state
   * 2. We reverse any calculations (subtract runs, etc.)
   * 3. We delete this BallEvent document
   * 
   * This makes undo operations strictly deterministic - we always know
   * exactly what the state was before this ball, without needing to
   * query or recalculate from previous balls.
   */
  pre_ball_state: MatchLiveState;

  // Optional: Post-ball state for verification
  /**
   * Post-Ball State (Optional, for verification)
   * 
   * This can be used to verify that our calculations were correct.
   * After processing the ball, we can compare the calculated state
   * with this stored value to ensure data integrity.
   */
  post_ball_state?: MatchLiveState;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * Innings Reference
 * Helper type for innings identification
 */
export type InningsId = string; // Typically "1" or "2"

/**
 * Team Reference
 * Helper type for team identification
 */
export type TeamId = 'a' | 'b';

/**
 * Player Reference
 * Helper type for player identification
 */
export type PlayerId = string;

/**
 * Match Reference
 * Helper type for match identification
 */
export type MatchId = string;

// ============================================================================
// INPUT TYPES (For UI/API)
// ============================================================================

/**
 * Ball Input (From UI)
 * What the scorer inputs when recording a ball
 */
export interface BallInput {
  runs_off_bat: number;
  extras?: {
    type: ExtraType;
    runs: number;
  };
  wicket?: {
    type: WicketType;
    player_id: string;
    dismissed_by?: string;
    is_striker_out: boolean;
  };
}

/**
 * Match Creation Input
 * Data required to create a new match
 */
export interface CreateMatchInput {
  team_a_name: string;
  team_b_name: string;
  config: MatchConfig;
}

/**
 * Squad Selection Input
 * Players selected for a team's squad
 */
export interface SquadSelectionInput {
  team_id: TeamId;
  player_ids: string[];
}

/**
 * Toss Input
 * Result of the toss
 */
export interface TossInput {
  winner_id: TeamId;
  decision: 'bat' | 'bowl';
}

/**
 * Opening Players Input
 * Initial striker, non-striker, and bowler selection
 */
export interface OpeningPlayersInput {
  striker_id: string;
  non_striker_id: string;
  bowler_id: string;
}

// ============================================================================
// CALCULATION TYPES
// ============================================================================

/**
 * Ball Update Result
 * Result of processing a ball event
 * Contains all the updates that need to be applied to the match state
 */
export interface BallUpdateResult {
  score_delta: {
    runs: number;
    wickets: number;
    overs: number;
    balls: number;
  };
  striker_updates: {
    runs: number;
    balls_faced: number;
    fours?: number;
    sixes?: number;
  };
  bowler_updates: {
    runs_conceded: number;
    balls_bowled: number;
    wickets?: number;
  };
  strike_rotated: boolean;
  over_completed: boolean;
  is_legal_delivery: boolean; // false if wide or no-ball
}

/**
 * Undo Result
 * Result of undoing a ball event
 * Contains the state to restore
 */
export interface UndoResult {
  restored_state: MatchLiveState;
  deleted_ball_id: string;
}



