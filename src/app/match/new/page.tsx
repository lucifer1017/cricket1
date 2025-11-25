"use client";

/**
 * Match Setup Wizard
 * 
 * Multi-step wizard for creating and configuring a new cricket match.
 * Steps: Setup -> Squad A -> Squad B -> Toss -> Openers
 */

import { useState, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { doc, onSnapshot, Unsubscribe } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuth } from "@/contexts/AuthContext";
import {
  createMatch,
  updateToss,
  startMatch,
  getMatchById,
} from "@/lib/firebase/matches";
import PlayerPoolSelector from "@/components/match/PlayerPoolSelector";
import SquadSelector from "@/components/match/SquadSelector";
import type {
  Match,
  CreateMatchInput,
  TossInput,
  OpeningPlayersInput,
  Player,
  MatchConfig,
} from "@/types/cricket";
import { MatchStatus } from "@/types/cricket";

type Step = "setup" | "pool" | "squad-a" | "squad-b" | "toss" | "openers";

const STEPS: Step[] = ["setup", "pool", "squad-a", "squad-b", "toss", "openers"];
const STEP_LABELS: Record<Step, string> = {
  setup: "Match Setup",
  pool: "Player Pool",
  "squad-a": "Team A Squad",
  "squad-b": "Team B Squad",
  toss: "The Toss",
  openers: "Opening Players",
};

export default function NewMatchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rematchMatchId = searchParams.get("matchId");
  const continuingExistingMatch = useMemo(() => !!rematchMatchId, [rematchMatchId]);
  const { user, loading: authLoading } = useAuth();
  const [currentStep, setCurrentStep] = useState<Step>("setup");
  const [matchId, setMatchId] = useState<string | null>(rematchMatchId);
  const [matchData, setMatchData] = useState<Match | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Form state for Step 1 (Setup)
  const [teamAName, setTeamAName] = useState("");
  const [teamBName, setTeamBName] = useState("");
  const [totalOvers, setTotalOvers] = useState(20);

  // Form state for Step 4 (Toss)
  const [tossWinner, setTossWinner] = useState<"a" | "b" | null>(null);
  const [tossDecision, setTossDecision] = useState<"bat" | "bowl" | null>(null);

  // Form state for Step 5 (Openers)
  const [strikerId, setStrikerId] = useState("");
  const [nonStrikerId, setNonStrikerId] = useState("");
  const [bowlerId, setBowlerId] = useState("");

  // Real-time listener for match document
  useEffect(() => {
    if (!matchId) return;

    const matchRef = doc(db, "matches", matchId);
    const unsubscribe: Unsubscribe = onSnapshot(
      matchRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setMatchData({
            id: snapshot.id,
            ...snapshot.data(),
          } as Match);
        }
      },
      (err) => {
        console.error("Match listener error:", err);
        setError("Failed to sync match data. Please refresh the page.");
      }
    );

    return () => unsubscribe();
  }, [matchId]);

  useEffect(() => {
    if (rematchMatchId && !matchId) {
      setMatchId(rematchMatchId);
    }
  }, [rematchMatchId, matchId]);

  useEffect(() => {
    if (!matchData) return;
    setTeamAName(matchData.teams.a.name);
    setTeamBName(matchData.teams.b.name);
    setTotalOvers(matchData.config.total_overs);
  }, [matchData]);

  useEffect(() => {
    if (!continuingExistingMatch || !matchData) return;
    if (!matchData.player_pool?.length) return;

    if (!matchData.toss) {
      setCurrentStep("toss");
      return;
    }

    const hasOpeners =
      !!matchData.live_state?.striker_id &&
      !!matchData.live_state?.non_striker_id &&
      !!matchData.live_state?.bowler_id;

    if (!hasOpeners) {
      setCurrentStep("openers");
    }
  }, [continuingExistingMatch, matchData]);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/auth");
    }
  }, [user, authLoading, router]);

  // Handle Step 1: Create Match
  const handleCreateMatch = async () => {
    if (continuingExistingMatch) {
      setError("This match has already been created. Please continue from the remaining steps.");
      return;
    }

    if (!teamAName.trim() || !teamBName.trim()) {
      setError("Please enter both team names");
      return;
    }

    if (totalOvers < 1 || totalOvers > 50) {
      setError("Overs must be between 1 and 50");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const config: MatchConfig = {
        total_overs: totalOvers,
        wide_runs: 1,
        no_ball_runs: 1,
      };

      const input: CreateMatchInput = {
        team_a_name: teamAName.trim(),
        team_b_name: teamBName.trim(),
        config,
      };

      const newMatchId = await createMatch(input);
      setMatchId(newMatchId);
      setCurrentStep("pool");
    } catch (err) {
      console.error("Create match error:", err);
      setError(err instanceof Error ? err.message : "Failed to create match");
    } finally {
      setLoading(false);
    }
  };

  // Handle Step 4: Update Toss
  const handleUpdateToss = async () => {
    if (!tossWinner || !tossDecision || !matchId) {
      setError("Please complete the toss selection");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const toss: TossInput = {
        winner_id: tossWinner,
        decision: tossDecision,
      };

      await updateToss(matchId, toss);
      setCurrentStep("openers");
    } catch (err) {
      console.error("Update toss error:", err);
      setError(err instanceof Error ? err.message : "Failed to update toss");
    } finally {
      setLoading(false);
    }
  };

  // Handle Step 5: Start Match
  const handleStartMatch = async () => {
    if (!strikerId || !nonStrikerId || !bowlerId || !matchId) {
      setError("Please select all opening players");
      return;
    }

    if (strikerId === nonStrikerId) {
      setError("Striker and Non-Striker must be different players");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const openers: OpeningPlayersInput = {
        striker_id: strikerId,
        non_striker_id: nonStrikerId,
        bowler_id: bowlerId,
      };

      await startMatch(matchId, openers);
      router.push(`/match/${matchId}`);
    } catch (err) {
      console.error("Start match error:", err);
      setError(err instanceof Error ? err.message : "Failed to start match");
    } finally {
      setLoading(false);
    }
  };

  // Get available players for dropdowns
  const getBattingTeamPlayers = (): Player[] => {
    if (!matchData || !matchData.toss) return [];
    const battingTeamId = matchData.live_state.batting_team_id;
    return matchData.teams[battingTeamId as "a" | "b"]?.players || [];
  };

  const getBowlingTeamPlayers = (): Player[] => {
    if (!matchData || !matchData.toss) return [];
    const bowlingTeamId = matchData.live_state.bowling_team_id;
    return matchData.teams[bowlingTeamId as "a" | "b"]?.players || [];
  };

  // Validation helpers
  const poolSize = matchData?.player_pool?.length ?? 0;
  const playersPerTeam = Math.floor(poolSize / 2);

  const canProceedFromPool = (): boolean => {
    return poolSize >= 2 && poolSize % 2 === 0;
  };

  const canProceedToSquadB = (): boolean => {
    if (!matchData) return false;
    return playersPerTeam > 0 && matchData.teams.a.players.length === playersPerTeam;
  };

  const canProceedToToss = (): boolean => {
    if (!matchData) return false;
    return playersPerTeam > 0 && matchData.teams.b.players.length === playersPerTeam;
  };

  const canProceedToOpeners = (): boolean => {
    return tossWinner !== null && tossDecision !== null;
  };

  const canStartMatch = (): boolean => {
    return strikerId !== "" && nonStrikerId !== "" && bowlerId !== "";
  };

  // Refresh match data (for pool/squad updates)
  const refreshMatchData = async () => {
    if (!matchId) return;
    try {
      const updated = await getMatchById(matchId);
      if (updated) {
        setMatchData(updated);
      }
    } catch (err) {
      console.error("Error refreshing match data:", err);
    }
  };

  const currentStepIndex = STEPS.indexOf(currentStep);
  const progress = ((currentStepIndex + 1) / STEPS.length) * 100;

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-indigo-900 via-purple-900 to-pink-900">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-indigo-900 via-purple-900 to-pink-900 relative overflow-hidden py-12 px-4">
      {/* Animated Background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-pink-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-2000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-indigo-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-4000"></div>
      </div>

      <div className="relative z-10 max-w-4xl mx-auto">
        {/* Progress Indicator */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-3xl font-bold text-white">
              {STEP_LABELS[currentStep]}
            </h1>
            <span className="text-white/70 text-sm">
              Step {currentStepIndex + 1} of {STEPS.length}
            </span>
          </div>
          <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-500"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>

        {/* Main Content Card */}
        <div className="backdrop-blur-xl bg-white/10 rounded-3xl shadow-2xl border border-white/20 p-8">
          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-500/20 border border-red-500/50 rounded-xl text-red-100 text-sm animate-shake">
              {error}
            </div>
          )}

          {/* Step 1: Setup */}
          {currentStep === "setup" && (
            <div className="space-y-6">
              {continuingExistingMatch && (
                <div className="p-4 bg-white/5 border border-white/20 rounded-xl text-white/80 text-sm">
                  This match was pre-created for a rematch. Review the details below, then proceed to the Toss step.
                </div>
              )}
              <div>
                <label className="block text-white/90 text-sm font-medium mb-2">
                  Team A Name
                </label>
                <input
                  type="text"
                  value={teamAName}
                  onChange={(e) => setTeamAName(e.target.value)}
                  placeholder="Enter Team A name"
                  disabled={continuingExistingMatch}
                  className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition-all duration-300 backdrop-blur-sm disabled:opacity-60 disabled:cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-white/90 text-sm font-medium mb-2">
                  Team B Name
                </label>
                <input
                  type="text"
                  value={teamBName}
                  onChange={(e) => setTeamBName(e.target.value)}
                  placeholder="Enter Team B name"
                  disabled={continuingExistingMatch}
                  className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition-all duration-300 backdrop-blur-sm disabled:opacity-60 disabled:cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-white/90 text-sm font-medium mb-2">
                  Total Overs per Innings
                </label>
                <input
                  type="number"
                  value={totalOvers}
                  onChange={(e) => setTotalOvers(parseInt(e.target.value) || 20)}
                  min="1"
                  max="50"
                  disabled={continuingExistingMatch}
                  className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition-all duration-300 backdrop-blur-sm disabled:opacity-60 disabled:cursor-not-allowed"
                />
              </div>

              <button
                onClick={handleCreateMatch}
                disabled={
                  continuingExistingMatch ||
                  loading ||
                  !teamAName.trim() ||
                  !teamBName.trim()
                }
                className="w-full py-3.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transform hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <svg
                      className="animate-spin h-5 w-5"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    <span>Creating Match...</span>
                  </>
                ) : (
                  "Create Match"
                )}
              </button>
            </div>
          )}

      {/* Step 2: Player Pool */}
      {currentStep === "pool" && matchData && (
        <div className="space-y-6">
          <PlayerPoolSelector
            matchId={matchId!}
            currentPool={matchData.player_pool}
            onPoolUpdated={refreshMatchData}
          />

          <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-white/80 text-sm">
            <p>
              Add players to the match pool. Each team will draft{" "}
              {playersPerTeam} player{playersPerTeam !== 1 ? "s" : ""} from this
              pool. Make sure the pool size is even.
            </p>
            <p className="mt-2">
              Current pool size: {poolSize} player
              {poolSize !== 1 ? "s" : ""} ({playersPerTeam} per team)
            </p>
            {poolSize % 2 === 1 && (
              <p className="mt-2 text-yellow-300">
                Pool size is odd. Add or remove one player to make it even.
              </p>
            )}
          </div>

          <div className="flex gap-4">
            <button
              onClick={() => setCurrentStep("setup")}
              className="flex-1 py-3 bg-white/10 border border-white/20 text-white font-semibold rounded-xl hover:bg-white/20 transition-all duration-200"
            >
              Back
            </button>
            <button
              onClick={() => setCurrentStep("squad-a")}
              disabled={!canProceedFromPool()}
              className="flex-1 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transform hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            >
              Next: Team A Squad
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Squad A */}
          {currentStep === "squad-a" && matchData && (
            <div className="space-y-6">
              <SquadSelector
                matchId={matchId!}
                teamId="a"
                teamName={matchData.teams.a.name}
                currentPlayers={matchData.teams.a.players}
                otherTeamPlayers={matchData.teams.b.players}
            playerPool={matchData.player_pool}
            targetCount={playersPerTeam}
            onPlayerAdded={refreshMatchData}
              />

              <div className="flex gap-4">
                <button
                  onClick={() => setCurrentStep("setup")}
                  className="flex-1 py-3 bg-white/10 border border-white/20 text-white font-semibold rounded-xl hover:bg-white/20 transition-all duration-200"
                >
                  Back
                </button>
                <button
                  onClick={() => setCurrentStep("squad-b")}
                  disabled={!canProceedToSquadB()}
                  className="flex-1 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transform hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                >
                  Next: Team B Squad
                </button>
              </div>
            </div>
          )}

      {/* Step 4: Squad B */}
          {currentStep === "squad-b" && matchData && (
            <div className="space-y-6">
              <SquadSelector
                matchId={matchId!}
                teamId="b"
                teamName={matchData.teams.b.name}
                currentPlayers={matchData.teams.b.players}
                otherTeamPlayers={matchData.teams.a.players}
            playerPool={matchData.player_pool}
            targetCount={playersPerTeam}
            onPlayerAdded={refreshMatchData}
              />

              <div className="flex gap-4">
                <button
                  onClick={() => setCurrentStep("squad-a")}
                  className="flex-1 py-3 bg-white/10 border border-white/20 text-white font-semibold rounded-xl hover:bg-white/20 transition-all duration-200"
                >
                  Back
                </button>
                <button
                  onClick={() => setCurrentStep("toss")}
                  disabled={!canProceedToToss()}
                  className="flex-1 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transform hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                >
                  Next: The Toss
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Toss */}
          {currentStep === "toss" && matchData && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-white mb-4">
                  Who won the toss?
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => {
                      setTossWinner("a");
                      setTossDecision(null);
                    }}
                    className={`py-4 px-6 rounded-xl font-semibold transition-all duration-200 ${
                      tossWinner === "a"
                        ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg"
                        : "bg-white/10 border border-white/20 text-white hover:bg-white/20"
                    }`}
                  >
                    {matchData.teams.a.name}
                  </button>
                  <button
                    onClick={() => {
                      setTossWinner("b");
                      setTossDecision(null);
                    }}
                    className={`py-4 px-6 rounded-xl font-semibold transition-all duration-200 ${
                      tossWinner === "b"
                        ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg"
                        : "bg-white/10 border border-white/20 text-white hover:bg-white/20"
                    }`}
                  >
                    {matchData.teams.b.name}
                  </button>
                </div>
              </div>

              {tossWinner && (
                <div>
                  <h3 className="text-lg font-semibold text-white mb-4">
                    What did {matchData.teams[tossWinner].name} choose?
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      onClick={() => setTossDecision("bat")}
                      className={`py-4 px-6 rounded-xl font-semibold transition-all duration-200 ${
                        tossDecision === "bat"
                          ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg"
                          : "bg-white/10 border border-white/20 text-white hover:bg-white/20"
                      }`}
                    >
                      Bat
                    </button>
                    <button
                      onClick={() => setTossDecision("bowl")}
                      className={`py-4 px-6 rounded-xl font-semibold transition-all duration-200 ${
                        tossDecision === "bowl"
                          ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg"
                          : "bg-white/10 border border-white/20 text-white hover:bg-white/20"
                      }`}
                    >
                      Bowl
                    </button>
                  </div>
                </div>
              )}

              <div className="flex gap-4">
                <button
                  onClick={() => setCurrentStep("squad-b")}
                  className="flex-1 py-3 bg-white/10 border border-white/20 text-white font-semibold rounded-xl hover:bg-white/20 transition-all duration-200"
                >
                  Back
                </button>
                <button
                  onClick={handleUpdateToss}
                  disabled={!canProceedToOpeners() || loading}
                  className="flex-1 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transform hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <svg
                        className="animate-spin h-5 w-5"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                      <span>Updating...</span>
                    </>
                  ) : (
                    "Next: Opening Players"
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Step 5: Openers */}
          {currentStep === "openers" && matchData && (
            <div className="space-y-6">
              <p className="text-white/70 text-sm mb-4">
                Select the opening players for the match. The striker and
                non-striker must be from the batting team, and the bowler must
                be from the bowling team.
              </p>

              <div>
                <label className="block text-white/90 text-sm font-medium mb-2">
                  Striker (Batting Team)
                </label>
                <select
                  value={strikerId}
                  onChange={(e) => setStrikerId(e.target.value)}
                  className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition-all duration-300 backdrop-blur-sm"
                >
                  <option value="">Select Striker</option>
                  {getBattingTeamPlayers().map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-white/90 text-sm font-medium mb-2">
                  Non-Striker (Batting Team)
                </label>
                <select
                  value={nonStrikerId}
                  onChange={(e) => setNonStrikerId(e.target.value)}
                  className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition-all duration-300 backdrop-blur-sm"
                >
                  <option value="">Select Non-Striker</option>
                  {getBattingTeamPlayers()
                    .filter((p) => p.id !== strikerId)
                    .map((player) => (
                      <option key={player.id} value={player.id}>
                        {player.name}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-white/90 text-sm font-medium mb-2">
                  Bowler (Bowling Team)
                </label>
                <select
                  value={bowlerId}
                  onChange={(e) => setBowlerId(e.target.value)}
                  className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition-all duration-300 backdrop-blur-sm"
                >
                  <option value="">Select Bowler</option>
                  {getBowlingTeamPlayers().map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={() => setCurrentStep("toss")}
                  className="flex-1 py-3 bg-white/10 border border-white/20 text-white font-semibold rounded-xl hover:bg-white/20 transition-all duration-200"
                >
                  Back
                </button>
                <button
                  onClick={handleStartMatch}
                  disabled={!canStartMatch() || loading}
                  className="flex-1 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transform hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <svg
                        className="animate-spin h-5 w-5"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                      <span>Starting Match...</span>
                    </>
                  ) : (
                    "Start Match"
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}



