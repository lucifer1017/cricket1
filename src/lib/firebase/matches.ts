/**
 * Match Setup & Player Pool Services
 * 
 * This module handles all Firestore operations for:
 * - Player pool management (search, create)
 * - Match initialization and setup
 * - Pre-game logic (toss, starting match)
 * 
 * Uses Event Sourcing pattern - matches are the "header" documents,
 * while individual balls are stored in sub-collections as events.
 */

import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  doc,
  updateDoc,
  getDoc,
  limit,
  serverTimestamp,
  arrayUnion,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { auth } from "@/lib/firebase/config";
import type {
  Player,
  Match,
  MatchLiveState,
  Score,
  Team,
  CreateMatchInput,
  TossInput,
  OpeningPlayersInput,
  TossResult,
} from "@/types/cricket";
import { MatchStatus } from "@/types/cricket";

// ============================================================================
// COLLECTION REFERENCES
// ============================================================================

const playersCollection = () => collection(db, "players");
const matchesCollection = () => collection(db, "matches");

// ============================================================================
// A. PLAYER POOL MANAGEMENT
// ============================================================================

/**
 * Search Players
 * 
 * Searches the global player pool by normalized name (case-insensitive prefix search).
 * Used for autocomplete/typeahead functionality in squad selection.
 * 
 * @param query - Search query string (e.g., "virat")
 * @returns Array of matching players (max 5 results)
 */
export async function searchPlayers(searchQuery: string): Promise<Player[]> {
  try {
    if (!searchQuery || searchQuery.trim().length === 0) {
      return [];
    }

    const normalizedQuery = searchQuery.toLowerCase().trim();
    const playersRef = playersCollection();

    // Prefix search using Firestore range queries
    const q = query(
      playersRef,
      where("normalized_name", ">=", normalizedQuery),
      where("normalized_name", "<=", normalizedQuery + "\uf8ff"),
      limit(5)
    );

    const querySnapshot = await getDocs(q);
    const players: Player[] = [];

    querySnapshot.forEach((doc) => {
      players.push({
        id: doc.id,
        ...doc.data(),
      } as Player);
    });

    return players;
  } catch (error) {
    console.error("Error searching players:", error);
    throw new Error("Failed to search players. Please try again.");
  }
}

/**
 * Create Player
 * 
 * Adds a new player to the global pool.
 * Prevents duplicates by checking if a player with the same normalized name exists.
 * 
 * @param name - Player's display name (e.g., "Virat Kohli")
 * @returns The newly created Player object
 */
export async function createPlayer(name: string): Promise<Player> {
  try {
    if (!name || name.trim().length === 0) {
      throw new Error("Player name cannot be empty");
    }

    const normalizedName = name.toLowerCase().trim();

    // Check if player already exists
    const existingPlayers = await searchPlayers(normalizedName);
    const duplicate = existingPlayers.find(
      (p) => p.normalized_name === normalizedName
    );

    if (duplicate) {
      throw new Error(`Player "${name}" already exists in the pool`);
    }

    // Create new player document
    const playersRef = playersCollection();
    const newPlayer: Omit<Player, "id"> = {
      name: name.trim(),
      normalized_name: normalizedName,
    };

    const docRef = await addDoc(playersRef, newPlayer);

    return {
      id: docRef.id,
      ...newPlayer,
    };
  } catch (error: unknown) {
    console.error("Error creating player:", error);
    if (error instanceof Error && error.message.includes("already exists")) {
      throw error;
    }
    throw new Error("Failed to create player. Please try again.");
  }
}

// ============================================================================
// B. MATCH INITIALIZATION (The Singleton Rule)
// ============================================================================

/**
 * Get Active Match
 * 
 * Retrieves the currently active (live) match, if one exists.
 * Implements the singleton rule: only one live match at a time.
 * 
 * @returns The active Match object, or null if no live match exists
 */
export async function getActiveMatch(): Promise<Match | null> {
  try {
    const matchesRef = matchesCollection();
    const q = query(
      matchesRef,
      where("status", "==", "live")
    );

    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      return null;
    }

    // Should only be one live match (singleton rule)
    const matchDoc = querySnapshot.docs[0];
    return {
      id: matchDoc.id,
      ...matchDoc.data(),
    } as Match;
  } catch (error) {
    console.error("Error getting active match:", error);
    throw new Error("Failed to retrieve active match. Please try again.");
  }
}

/**
 * Create Match
 * 
 * Creates a new match document in Firestore.
 * Enforces singleton rule: throws error if a live match already exists.
 * 
 * Initial state:
 * - status: 'scheduled'
 * - live_state: Empty/default values (no players selected yet)
 * - teams: Created with empty squads
 * 
 * @param data - Match creation input (team names, config)
 * @returns The newly created match ID
 */
export async function createMatch(data: CreateMatchInput): Promise<string> {
  try {
    // Step 1: Check for active match (singleton rule)
    const activeMatch = await getActiveMatch();
    if (activeMatch) {
      throw new Error("A match is already in progress. Please complete or abandon it first.");
    }

    // Step 2: Get current user
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error("You must be logged in to create a match");
    }

    // Step 3: Construct initial Match object
    const now = Date.now();

    // Create empty teams with initial structure
    const teamA: Team = {
      id: "a",
      name: data.team_a_name.trim(),
      players: [],
    };

    const teamB: Team = {
      id: "b",
      name: data.team_b_name.trim(),
      players: [],
    };

    // Create default empty live state
    const defaultScore: Score = {
      runs: 0,
      wickets: 0,
      overs: 0,
      balls: 0,
    };

    const defaultLiveState: MatchLiveState = {
      batting_team_id: "", // Will be set after toss
      bowling_team_id: "", // Will be set after toss
      striker_id: "", // Will be set when match starts
      non_striker_id: "", // Will be set when match starts
      bowler_id: "", // Will be set when match starts
      score: defaultScore,
      this_over: [], // Empty array for current over
    };

    const newMatch: Omit<Match, "id"> = {
      owner_id: currentUser.uid,
      status: MatchStatus.SCHEDULED,
      config: data.config,
      player_pool: [],
      teams: {
        a: teamA,
        b: teamB,
      },
      toss: null, // Will be set later
      live_state: defaultLiveState,
      created_at: now,
      updated_at: now,
    };

    // Step 4: Add document to Firestore
    const matchesRef = matchesCollection();
    const docRef = await addDoc(matchesRef, {
      ...newMatch,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    });

    return docRef.id;
  } catch (error: unknown) {
    console.error("Error creating match:", error);
    if (
      error instanceof Error &&
      (error.message.includes("already in progress") ||
        error.message.includes("logged in"))
    ) {
      throw error;
    }
    throw new Error("Failed to create match. Please try again.");
  }
}

// ============================================================================
// C. PRE-GAME LOGIC
// ============================================================================

/**
 * Update Toss
 * 
 * Records the toss result and updates the match state accordingly.
 * 
 * Critical: Also sets batting_team_id and bowling_team_id in live_state
 * based on the toss decision.
 * 
 * @param matchId - The match document ID
 * @param toss - Toss result (winner and decision)
 */
export async function updateToss(
  matchId: string,
  toss: TossInput
): Promise<void> {
  try {
    const matchRef = doc(db, "matches", matchId);
    const matchSnap = await getDoc(matchRef);

    if (!matchSnap.exists()) {
      throw new Error("Match not found");
    }

    // Determine batting and bowling teams based on toss
    let battingTeamId: "a" | "b";
    let bowlingTeamId: "a" | "b";

    if (toss.decision === "bat") {
      // Winner chose to bat
      battingTeamId = toss.winner_id;
      bowlingTeamId = toss.winner_id === "a" ? "b" : "a";
    } else {
      // Winner chose to bowl
      bowlingTeamId = toss.winner_id;
      battingTeamId = toss.winner_id === "a" ? "b" : "a";
    }

    // Construct toss result
    const tossResult: TossResult = {
      winner_id: toss.winner_id,
      decision: toss.decision,
    };

    // Update match document
    await updateDoc(matchRef, {
      toss: tossResult,
      "live_state.batting_team_id": battingTeamId,
      "live_state.bowling_team_id": bowlingTeamId,
      updated_at: serverTimestamp(),
    });
  } catch (error: unknown) {
    console.error("Error updating toss:", error);
    if (error instanceof Error && error.message.includes("not found")) {
      throw error;
    }
    throw new Error("Failed to update toss. Please try again.");
  }
}

/**
 * Add Player to Squad
 * 
 * Adds a player to a specific team's squad in the match.
 * Prevents duplicates and validates match state.
 * 
 * @param matchId - The match document ID
 * @param teamId - Team identifier ('a' or 'b')
 * @param player - The player to add to the squad
 */
export async function addPlayerToSquad(
  matchId: string,
  teamId: "a" | "b",
  player: Player
): Promise<void> {
  try {
    const matchRef = doc(db, "matches", matchId);
    const matchSnap = await getDoc(matchRef);

    if (!matchSnap.exists()) {
      throw new Error("Match not found");
    }

    const matchData = matchSnap.data() as Match;

    // Validate match is not completed or abandoned
    if (
      matchData.status === MatchStatus.COMPLETED ||
      matchData.status === MatchStatus.ABANDONED
    ) {
      throw new Error("Cannot add players to a completed or abandoned match");
    }

    // Check if player already exists in the team's squad
    const team = matchData.teams[teamId];
    const playerExists = team.players.some((p) => p.id === player.id);

    if (playerExists) {
      throw new Error(`Player "${player.name}" is already in ${team.name}'s squad`);
    }

  // Ensure player is not already in the opposite team
  const oppositeTeamId = teamId === "a" ? "b" : "a";
  const oppositeTeam = matchData.teams[oppositeTeamId];
  const inOppositeTeam = oppositeTeam.players.some((p) => p.id === player.id);

  if (inOppositeTeam) {
    throw new Error(
      `Player "${player.name}" is already in ${oppositeTeam.name}'s squad`
    );
  }

    // Update the specific team's players array using arrayUnion
    // This is efficient and atomic - only updates the nested field
    await updateDoc(matchRef, {
      [`teams.${teamId}.players`]: arrayUnion(player),
      updated_at: serverTimestamp(),
    });
  } catch (error: unknown) {
    console.error("Error adding player to squad:", error);
    if (
      error instanceof Error &&
      (error.message.includes("not found") ||
        error.message.includes("Cannot add") ||
        error.message.includes("already in"))
    ) {
      throw error;
    }
    throw new Error("Failed to add player to squad. Please try again.");
  }
}

/**
 * Add Player to Match Pool
 *
 * Adds a player to the general pool for this match. Pool players are the source
 * from which each team drafts their squads.
 */
export async function addPlayerToPool(
  matchId: string,
  player: Player
): Promise<void> {
  try {
    const matchRef = doc(db, "matches", matchId);
    const matchSnap = await getDoc(matchRef);

    if (!matchSnap.exists()) {
      throw new Error("Match not found");
    }

    const matchData = matchSnap.data() as Match;

    // Prevent duplicates in the pool
    const alreadyInPool = matchData.player_pool.some(
      (existing) => existing.id === player.id
    );

    if (alreadyInPool) {
      throw new Error(`Player "${player.name}" is already in the pool`);
    }

    await updateDoc(matchRef, {
      player_pool: arrayUnion(player),
      updated_at: serverTimestamp(),
    });
  } catch (error: unknown) {
    console.error("Error adding player to pool:", error);
    if (error instanceof Error && error.message.includes("already in")) {
      throw error;
    }
    throw new Error("Failed to add player to pool. Please try again.");
  }
}

/**
 * Remove Player from Match Pool
 */
export async function removePlayerFromPool(
  matchId: string,
  playerId: string
): Promise<void> {
  try {
    const matchRef = doc(db, "matches", matchId);
    const matchSnap = await getDoc(matchRef);

    if (!matchSnap.exists()) {
      throw new Error("Match not found");
    }

    const matchData = matchSnap.data() as Match;
    const playerExists = matchData.player_pool.some(
      (player) => player.id === playerId
    );

    if (!playerExists) {
      throw new Error("Player is not in the pool");
    }

    const updatedPool = matchData.player_pool.filter(
      (player) => player.id !== playerId
    );

    await updateDoc(matchRef, {
      player_pool: updatedPool,
      updated_at: serverTimestamp(),
    });
  } catch (error: unknown) {
    console.error("Error removing player from pool:", error);
    if (
      error instanceof Error &&
      (error.message.includes("not found") ||
        error.message.includes("not in the pool"))
    ) {
      throw error;
    }
    throw new Error("Failed to remove player from pool. Please try again.");
  }
}

/**
 * Remove Player from Squad
 *
 * Removes a player from a team's squad. Ensures the match isn't completed
 * and the player actually exists in the squad before updating Firestore.
 *
 * @param matchId - The match document ID
 * @param teamId - Team identifier ('a' or 'b')
 * @param playerId - ID of the player to remove
 */
export async function removePlayerFromSquad(
  matchId: string,
  teamId: "a" | "b",
  playerId: string
): Promise<void> {
  try {
    const matchRef = doc(db, "matches", matchId);
    const matchSnap = await getDoc(matchRef);

    if (!matchSnap.exists()) {
      throw new Error("Match not found");
    }

    const matchData = matchSnap.data() as Match;

    if (
      matchData.status === MatchStatus.COMPLETED ||
      matchData.status === MatchStatus.ABANDONED
    ) {
      throw new Error("Cannot modify squads for a completed or abandoned match");
    }

    const team = matchData.teams[teamId];
    const playerExists = team.players.some((player) => player.id === playerId);

    if (!playerExists) {
      throw new Error("Player is not in this squad");
    }

    const updatedPlayers = team.players.filter((player) => player.id !== playerId);

    await updateDoc(matchRef, {
      [`teams.${teamId}.players`]: updatedPlayers,
      updated_at: serverTimestamp(),
    });
  } catch (error: unknown) {
    console.error("Error removing player from squad:", error);
    if (
      error instanceof Error &&
      (error.message.includes("not found") ||
        error.message.includes("Cannot modify") ||
        error.message.includes("not in this squad"))
    ) {
      throw error;
    }
    throw new Error("Failed to remove player. Please try again.");
  }
}

/**
 * Start Match
 * 
 * Transitions match from 'scheduled' to 'live' status.
 * Sets the opening players (striker, non-striker, bowler).
 * 
 * @param matchId - The match document ID
 * @param openers - Opening players selection
 */
export async function startMatch(
  matchId: string,
  openers: OpeningPlayersInput
): Promise<void> {
  try {
    const matchRef = doc(db, "matches", matchId);
    const matchSnap = await getDoc(matchRef);

    if (!matchSnap.exists()) {
      throw new Error("Match not found");
    }

    const matchData = matchSnap.data() as Match;

    // Validate match is in correct state
    if (matchData.status !== MatchStatus.SCHEDULED) {
      throw new Error("Match must be in 'scheduled' status to start");
    }

    // Validate toss has been done
    if (!matchData.toss) {
      throw new Error("Toss must be completed before starting the match");
    }

    // Validate teams have players
    if (
      matchData.teams.a.players.length === 0 ||
      matchData.teams.b.players.length === 0
    ) {
      throw new Error("Both teams must have players selected before starting");
    }

    // Update match document
    await updateDoc(matchRef, {
      status: MatchStatus.LIVE,
      "live_state.striker_id": openers.striker_id,
      "live_state.non_striker_id": openers.non_striker_id,
      "live_state.bowler_id": openers.bowler_id,
      "live_state.this_over": [], // Initialize empty over array
      updated_at: serverTimestamp(),
    });
  } catch (error: unknown) {
    console.error("Error starting match:", error);
    if (
      error instanceof Error &&
      (error.message.includes("not found") ||
        error.message.includes("must be") ||
        error.message.includes("must have"))
    ) {
      throw error;
    }
    throw new Error("Failed to start match. Please try again.");
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get Match by ID
 * 
 * Retrieves a specific match document by its ID.
 * 
 * @param matchId - The match document ID
 * @returns The Match object, or null if not found
 */
export async function getMatchById(matchId: string): Promise<Match | null> {
  try {
    const matchRef = doc(db, "matches", matchId);
    const matchSnap = await getDoc(matchRef);

    if (!matchSnap.exists()) {
      return null;
    }

    return {
      id: matchSnap.id,
      ...matchSnap.data(),
    } as Match;
  } catch (error) {
    console.error("Error getting match by ID:", error);
    throw new Error("Failed to retrieve match. Please try again.");
  }
}

