"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { recordBall, undoLastBall } from "@/lib/firebase/scoring";
import { switchToSecondInnings } from "@/lib/firebase/matches";
import type { Match, PlayerStatsState } from "@/types/cricket";
import { WicketType, ExtraType } from "@/types/cricket";
import BowlerStatsSidebar from "@/components/match/BowlerStatsSidebar";

type WicketMode = {
  active: boolean;
  batterSide: "striker" | "non-striker" | null;
  type: WicketType | null;
};

const WICKET_OPTIONS: { label: string; value: WicketType }[] = [
  { label: "Bowled", value: WicketType.BOWLED },
  { label: "Caught", value: WicketType.CAUGHT },
  { label: "LBW", value: WicketType.LBW },
  { label: "Run Out", value: WicketType.RUN_OUT },
  { label: "Stumped", value: WicketType.STUMPED },
  { label: "Hit Wicket", value: WicketType.HIT_WICKET },
  { label: "Retired", value: WicketType.RETIRED },
];

const EXTRA_BUTTONS: { label: string; type: ExtraType; runs: number }[] = [
  { label: "Wide", type: ExtraType.WIDE, runs: 1 },
  { label: "No Ball", type: ExtraType.NO_BALL, runs: 1 },
  { label: "Bye", type: ExtraType.BYE, runs: 1 },
  { label: "Leg Bye", type: ExtraType.LEG_BYE, runs: 1 },
];

export default function MatchScorerPage() {
  const params = useParams();
  const matchId = params?.id as string | undefined;

  const [match, setMatch] = useState<Match | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [wicketState, setWicketState] = useState<WicketMode>({
    active: false,
    batterSide: null,
    type: null,
  });
  const [newBatterId, setNewBatterId] = useState("");
  const [isUpdatingBatter, setIsUpdatingBatter] = useState(false);
  const [newBowlerId, setNewBowlerId] = useState("");
  const [isUpdatingBowler, setIsUpdatingBowler] = useState(false);
  const [showBowlerSelector, setShowBowlerSelector] = useState(false);
  const [showInningsSwitch, setShowInningsSwitch] = useState(false);
  const [secondInningsStrikerId, setSecondInningsStrikerId] = useState("");
  const [secondInningsNonStrikerId, setSecondInningsNonStrikerId] = useState("");
  const [secondInningsBowlerId, setSecondInningsBowlerId] = useState("");
  const [isSwitchingInnings, setIsSwitchingInnings] = useState(false);
  const prevScoreRef = useRef<{ overs: number; balls: number } | null>(null);
  const justSelectedBowlerRef = useRef(false);

  useEffect(() => {
    if (!matchId) return;

    const matchRef = doc(db, "matches", matchId);
    const unsubscribe = onSnapshot(
      matchRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          setError("Match not found");
          setLoading(false);
          return;
        }
        setMatch(snapshot.data() as Match);
        setLoading(false);
      },
      (err) => {
        console.error("Match listener error:", err);
        setError("Failed to load match data");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [matchId]);

  const liveState = match?.live_state;
  const score = liveState?.score;

  // Detect over completion
  useEffect(() => {
    if (!score) {
      return;
    }

    const prevScore = prevScoreRef.current;

    // Initialize prevScore on first render
    if (!prevScore) {
      prevScoreRef.current = { overs: score.overs, balls: score.balls };
      return;
    }

    // Check if innings is complete (reached total overs limit)
    const totalOvers = match?.config?.total_overs ?? 0;
    const inningsComplete = score.overs >= totalOvers;

    // Over completed when:
    // 1. Balls reset to 0 (from any value > 0)
    // 2. Overs increased
    // 3. This is not the initial state (prevScore.balls was > 0)
    // 4. Innings is NOT complete (if innings is complete, don't show bowler selector)
    const overJustCompleted =
      prevScore.balls > 0 &&
      score.balls === 0 &&
      score.overs > prevScore.overs &&
      !inningsComplete;

    // Also detect if we're in an over completion state (balls === 0, overs > 0)
    // This handles cases after undo or if state was restored
    // BUT only if the current bowler is the same as last_bowler_id (meaning we need to change)
    // AND we haven't just selected a bowler (to prevent immediate re-opening)
    // AND innings is NOT complete
    const isInOverCompletionState = 
      score.balls === 0 && 
      score.overs > 0 && 
      !inningsComplete &&
      liveState?.bowler_id &&
      liveState?.last_bowler_id &&
      !showBowlerSelector &&
      !justSelectedBowlerRef.current &&
      liveState.bowler_id === liveState.last_bowler_id;

    // Check if innings is complete and show switch option
    if (inningsComplete && !showInningsSwitch && !showBowlerSelector) {
      setShowInningsSwitch(true);
    }

    if ((overJustCompleted || isInOverCompletionState) && liveState?.bowler_id && !showBowlerSelector && !justSelectedBowlerRef.current && !inningsComplete) {
      setShowBowlerSelector(true);
    }

    // Reset the flag after checking (so it only prevents one cycle)
    if (justSelectedBowlerRef.current) {
      justSelectedBowlerRef.current = false;
    }

    // Update the ref with current score (only when score actually changes)
    if (prevScore.overs !== score.overs || prevScore.balls !== score.balls) {
      prevScoreRef.current = { overs: score.overs, balls: score.balls };
    }
  }, [score, liveState?.bowler_id, showBowlerSelector]);
  const playerStats: PlayerStatsState =
    liveState?.player_stats ?? { batters: {}, bowlers: {} };

  const resolveTeam = (
    teams: Match["teams"],
    teamId?: string
  ) => {
    if (teamId === "a" || teamId === "b") {
      return teams[teamId];
    }
    return null;
  };

  const battingTeam = match
    ? resolveTeam(match.teams, liveState?.batting_team_id)
    : null;
  const bowlingTeam = match
    ? resolveTeam(match.teams, liveState?.bowling_team_id)
    : null;

  // Get teams for second innings (swapped) - defined early so they're available in JSX
  const secondInningsBattingTeam = match
    ? resolveTeam(match.teams, liveState?.bowling_team_id)
    : null;
  const secondInningsBowlingTeam = match
    ? resolveTeam(match.teams, liveState?.batting_team_id)
    : null;

  const striker =
    battingTeam?.players.find((p) => p.id === liveState?.striker_id) || null;
  const nonStriker =
    battingTeam?.players.find((p) => p.id === liveState?.non_striker_id) ||
    null;
  const bowler =
    bowlingTeam?.players.find((p) => p.id === liveState?.bowler_id) || null;

  const strikerStats = striker
    ? playerStats.batters[striker.id] ?? { runs: 0, balls: 0 }
    : null;
  const nonStrikerStats = nonStriker
    ? playerStats.batters[nonStriker.id] ?? { runs: 0, balls: 0 }
    : null;
  const bowlerStats = bowler
    ? playerStats.bowlers[bowler.id] ?? { runs: 0, balls: 0, wickets: 0 }
    : null;

  const crr = useMemo(() => {
    if (!score) return "0.00";
    const totalBalls = score.overs * 6 + score.balls;
    if (totalBalls === 0) return "0.00";
    const runRate = score.runs / (totalBalls / 6);
    return runRate.toFixed(2);
  }, [score]);

  // Calculate Required Run Rate (RRR) for second innings
  const rrr = useMemo(() => {
    // Only show RRR in second innings (when first_innings_total exists)
    // Use == null to check for both undefined and null, but allow 0
    if (!score || liveState?.first_innings_total == null) {
      return null;
    }
    
    const target = liveState.first_innings_total + 1; // Target to win
    const currentScore = score.runs;
    const runsNeeded = target - currentScore;
    
    // If target already achieved or exceeded, show 0.00
    if (runsNeeded <= 0) return "0.00";
    
    const totalOvers = match?.config?.total_overs ?? 0;
    const oversBowled = score.overs + score.balls / 6; // Convert to decimal overs
    const remainingOvers = totalOvers - oversBowled;
    
    // If no overs remaining, return null (match should be over)
    if (remainingOvers <= 0) return null;
    
    const requiredRunRate = runsNeeded / remainingOvers;
    return requiredRunRate.toFixed(2);
  }, [score, liveState?.first_innings_total, match?.config?.total_overs]);

  const handleRecordRun = async (runs: number) => {
    if (!matchId) return;
    
    // Prevent recording if bowler needs to be selected
    if (needsBowlerSelection) {
      setError("Please select a new bowler first");
      return;
    }
    
    try {
      setError("");
      await recordBall(matchId, { runs_off_bat: runs });
      setWicketState({ active: false, batterSide: null, type: null });
    } catch (err) {
      console.error("Record run error:", err);
      setError("Failed to record run");
    }
  };

  const handleRecordExtra = async (
    type: ExtraType,
    runs: number
  ) => {
    if (!matchId) return;
    
    // Prevent recording if bowler needs to be selected
    if (needsBowlerSelection) {
      setError("Please select a new bowler first");
      return;
    }
    
    try {
      setError("");
      await recordBall(matchId, {
        runs_off_bat: 0,
        extras: { type, runs },
      });
      setWicketState({ active: false, batterSide: null, type: null });
    } catch (err) {
      console.error("Record extra error:", err);
      setError("Failed to record extra");
    }
  };

  const handleUndo = async () => {
    if (!matchId) return;
    try {
      setError("");
      await undoLastBall(matchId);
    } catch (err) {
      console.error("Undo error:", err);
      setError("Failed to undo last ball");
    }
  };

  const startWicketFlow = () => {
    setWicketState({ active: true, batterSide: null, type: null });
  };

  const completeWicket = async () => {
    if (!matchId || !wicketState.batterSide || !wicketState.type) {
      setError("Select dismissal side and type");
      return;
    }
    
    // Prevent recording if bowler needs to be selected
    if (needsBowlerSelection) {
      setError("Please select a new bowler first");
      return;
    }
    
    const isStrikerOut = wicketState.batterSide === "striker";
    const batterId = isStrikerOut
      ? liveState?.striker_id
      : liveState?.non_striker_id;
    if (!batterId) {
      setError("Unable to determine batter");
      return;
    }

    try {
      setError("");
      await recordBall(matchId, {
        runs_off_bat: 0,
        wicket: {
          player_id: batterId,
          type: wicketState.type,
          is_striker_out: isStrikerOut,
        },
      });
      setWicketState({ active: false, batterSide: null, type: null });
    } catch (err) {
      console.error("Record wicket error:", err);
      setError("Failed to record wicket");
    }
  };

  const availableNewBatters =
    battingTeam?.players.filter(
      (player) =>
        player.id !== striker?.id && player.id !== nonStriker?.id
    ) ?? [];

  const showNewBatterSelector =
    liveState && liveState.striker_id === "";

  const handleNewBatterSelect = async () => {
    if (!matchId || !newBatterId) return;
    try {
      setIsUpdatingBatter(true);
      setError("");
      await updateDoc(doc(db, "matches", matchId), {
        "live_state.striker_id": newBatterId,
      });
      setNewBatterId("");
    } catch (err) {
      console.error("New batter error:", err);
      setError("Failed to set new batter");
    } finally {
      setIsUpdatingBatter(false);
    }
  };

  // Check if innings is complete
  const totalOvers = match?.config?.total_overs ?? 0;
  const inningsComplete = score && score.overs >= totalOvers;

  const availableNewBowlers =
    bowlingTeam?.players.filter(
      (player) => 
        player.id !== liveState?.bowler_id &&
        // Also exclude the last bowler who completed an over (prevents consecutive overs)
        player.id !== liveState?.last_bowler_id
    ) ?? [];

  // Check if we're in a state where we need to select a bowler
  // This is true when the bowler selector is showing
  // BUT NOT if innings is complete (in that case, we need to switch innings)
  const needsBowlerSelection = showBowlerSelector && !inningsComplete;
  
  // Disable keypad if innings is complete
  const keypadDisabledByInnings = inningsComplete;

  const handleNewBowlerSelect = async () => {
    if (!matchId || !newBowlerId) return;
    
    // Safety check: prevent selecting the bowler who just completed an over
    if (newBowlerId === liveState?.last_bowler_id) {
      setError("This bowler just completed an over. Please select a different bowler.");
      return;
    }
    
    try {
      setIsUpdatingBowler(true);
      setError("");
      await updateDoc(doc(db, "matches", matchId), {
        "live_state.bowler_id": newBowlerId,
        // Keep last_bowler_id to prevent that bowler from bowling consecutive overs
      });
      setNewBowlerId("");
      setShowBowlerSelector(false);
      // Set flag to prevent selector from immediately re-opening
      justSelectedBowlerRef.current = true;
    } catch (err) {
      console.error("New bowler error:", err);
      setError(err instanceof Error ? err.message : "Failed to set new bowler");
    } finally {
      setIsUpdatingBowler(false);
    }
  };

  const handleSwitchInnings = async () => {
    if (!matchId || !secondInningsStrikerId || !secondInningsNonStrikerId || !secondInningsBowlerId) {
      setError("Please select all opening players for the second innings");
      return;
    }

    try {
      setIsSwitchingInnings(true);
      setError("");
      await switchToSecondInnings(matchId, {
        striker_id: secondInningsStrikerId,
        non_striker_id: secondInningsNonStrikerId,
        bowler_id: secondInningsBowlerId,
      });
      setShowInningsSwitch(false);
      setSecondInningsStrikerId("");
      setSecondInningsNonStrikerId("");
      setSecondInningsBowlerId("");
    } catch (err) {
      console.error("Switch innings error:", err);
      setError(err instanceof Error ? err.message : "Failed to switch innings");
    } finally {
      setIsSwitchingInnings(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-indigo-900 via-purple-900 to-pink-900">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
      </div>
    );
  }

  if (!match || !liveState || !score) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-linear-to-br from-indigo-900 via-purple-900 to-pink-900 text-white text-center px-4">
        <p className="text-2xl font-semibold mb-2">Match data unavailable</p>
        <p className="text-white/70"> {error || "Please return to dashboard."}</p>
        <Link
          href="/"
          className="mt-4 px-4 py-2 bg-white/10 border border-white/20 rounded-xl"
        >
          Back to Dashboard
        </Link>
      </div>
    );
  }

  const teamAName = match.teams.a.name;
  const teamBName = match.teams.b.name;
  const tossLabel = match.toss
    ? `${match.teams[match.toss.winner_id].name} chose to ${match.toss.decision}`
    : "Toss pending";

  const keypadDisabled = showNewBatterSelector || needsBowlerSelection || keypadDisabledByInnings;

  return (
    <div className="min-h-screen bg-linear-to-br from-indigo-900 via-purple-900 to-pink-900 relative overflow-hidden py-8 px-4">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-pink-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-2000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-indigo-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-4000"></div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content Area */}
          <div className="lg:col-span-2 space-y-8">
        {/* Navbar */}
        <div className="backdrop-blur-xl bg-white/10 rounded-3xl border border-white/20 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between text-white">
          <div>
            <p className="text-sm uppercase tracking-wide text-white/70">
              Live Match
            </p>
            <h1 className="text-2xl font-semibold">
              {teamAName} vs {teamBName}
            </h1>
          </div>
          <div className="mt-3 sm:mt-0 text-white/80 text-sm">
            {tossLabel}
          </div>
        </div>

        {/* Scoreboard */}
        <div className="backdrop-blur-xl bg-white/10 rounded-3xl border border-white/20 p-8 text-white flex flex-col gap-6">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="uppercase text-white/60 text-xs tracking-[0.2em] mb-2">
                Current Score
              </p>
              <div className="text-6xl font-bold tracking-tight">
                {score.runs}/{score.wickets}
              </div>
              {liveState?.first_innings_total !== undefined && (
                <div className="mt-2">
                  <p className="text-white/70 text-sm">
                    Target: <span className="font-semibold text-yellow-400">{liveState.first_innings_total + 1}</span>
                    {" • "}
                    Need: <span className="font-semibold text-yellow-400">
                      {Math.max(0, liveState.first_innings_total + 1 - score.runs)}
                    </span> runs
                  </p>
                </div>
              )}
            </div>
            <div className="flex gap-6 text-white/80 text-sm mt-4 sm:mt-0">
              <div>
                <p className="text-white/50 text-xs uppercase tracking-widest">
                  Overs
                </p>
                <p className="text-lg font-semibold">
                  {score.overs}.{score.balls}
                </p>
              </div>
              <div>
                <p className="text-white/50 text-xs uppercase tracking-widest">
                  CRR
                </p>
                <p className="text-lg font-semibold">{crr}</p>
              </div>
              {rrr !== null && (
                <div>
                  <p className="text-white/50 text-xs uppercase tracking-widest">
                    RRR
                  </p>
                  <p className="text-lg font-semibold text-yellow-400">{rrr}</p>
                </div>
              )}
            </div>
          </div>

          {/* Player cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-2xl border border-white/20 bg-white/10 shadow-lg">
              <p className="text-xs uppercase tracking-widest text-white/60 mb-2">
                Striker
              </p>
              {striker ? (
                <>
                  <p className="text-xl font-semibold">{striker.name}</p>
                  <p className="text-white/70">
                    {strikerStats?.runs ?? 0} ({strikerStats?.balls ?? 0})
                  </p>
                </>
              ) : (
                <p className="text-white/60">Awaiting batter</p>
              )}
            </div>

            <div className="p-4 rounded-2xl border border-white/10 bg-white/5">
              <p className="text-xs uppercase tracking-widest text-white/60 mb-2">
                Non-Striker
              </p>
              {nonStriker ? (
                <>
                  <p className="text-lg font-semibold">{nonStriker.name}</p>
                  <p className="text-white/70">
                    {nonStrikerStats?.runs ?? 0} (
                    {nonStrikerStats?.balls ?? 0})
                  </p>
                </>
              ) : (
                <p className="text-white/60">Awaiting batter</p>
              )}
            </div>

            <div className="p-4 rounded-2xl border border-white/10 bg-white/5">
              <p className="text-xs uppercase tracking-widest text-white/60 mb-2">
                Bowler
              </p>
              {bowler ? (
                <>
                  <p className="text-lg font-semibold">{bowler.name}</p>
                  <p className="text-white/70">
                    {Math.floor((bowlerStats?.balls ?? 0) / 6)}.
                    {(bowlerStats?.balls ?? 0) % 6} •{" "}
                    {bowlerStats?.runs ?? 0}/{bowlerStats?.wickets ?? 0}
                  </p>
                </>
              ) : (
                <p className="text-white/60">No bowler set</p>
              )}
            </div>
          </div>
        </div>

        {/* New Batter */}
        {showNewBatterSelector && (
          <div className="backdrop-blur-xl bg-white/10 rounded-3xl border border-white/20 p-6 text-white space-y-4">
            <p className="text-lg font-semibold">
              Select New Batter (Striker)
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <select
                value={newBatterId}
                onChange={(e) => setNewBatterId(e.target.value)}
                className="flex-1 px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-400"
              >
                <option value="">Choose batter</option>
                {availableNewBatters.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.name}
                  </option>
                ))}
              </select>
              <button
                onClick={handleNewBatterSelect}
                disabled={!newBatterId || isUpdatingBatter}
                className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isUpdatingBatter ? "Updating..." : "Confirm"}
              </button>
            </div>
          </div>
        )}

        {/* Innings Complete Message */}
        {inningsComplete && !showInningsSwitch && (
          <div className="backdrop-blur-xl bg-gradient-to-r from-green-500/20 to-blue-500/20 rounded-3xl border border-green-400/50 p-6 text-white space-y-4">
            <div className="flex items-center gap-3">
              <svg
                className="w-6 h-6 text-green-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <p className="text-xl font-semibold">
                Innings Complete!
              </p>
            </div>
            <p className="text-white/80">
              {totalOvers} overs have been bowled. The batting team has scored {score?.runs || 0} runs for {score?.wickets || 0} wickets.
            </p>
            <p className="text-white/60 text-sm mb-4">
              Target: {score?.runs || 0} runs
            </p>
            <button
              onClick={() => setShowInningsSwitch(true)}
              className="w-full py-3 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl font-semibold hover:shadow-lg transform hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
            >
              Switch to Second Innings
            </button>
          </div>
        )}

        {/* Second Innings Opening Players Selection */}
        {showInningsSwitch && (
          <div className="backdrop-blur-xl bg-white/10 rounded-3xl border border-white/20 p-6 text-white space-y-6">
            <div>
              <h3 className="text-xl font-semibold mb-2">Second Innings - Select Opening Players</h3>
              <p className="text-white/70 text-sm mb-4">
                {secondInningsBattingTeam?.name} needs to chase {score?.runs || 0} runs
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-white/90 text-sm font-medium mb-2">
                  Striker ({secondInningsBattingTeam?.name})
                </label>
                <select
                  value={secondInningsStrikerId}
                  onChange={(e) => setSecondInningsStrikerId(e.target.value)}
                  className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-400"
                >
                  <option value="">Choose striker</option>
                  {secondInningsBattingTeam?.players.map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-white/90 text-sm font-medium mb-2">
                  Non-Striker ({secondInningsBattingTeam?.name})
                </label>
                <select
                  value={secondInningsNonStrikerId}
                  onChange={(e) => setSecondInningsNonStrikerId(e.target.value)}
                  className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-400"
                >
                  <option value="">Choose non-striker</option>
                  {secondInningsBattingTeam?.players
                    .filter((p) => p.id !== secondInningsStrikerId)
                    .map((player) => (
                      <option key={player.id} value={player.id}>
                        {player.name}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-white/90 text-sm font-medium mb-2">
                  Bowler ({secondInningsBowlingTeam?.name})
                </label>
                <select
                  value={secondInningsBowlerId}
                  onChange={(e) => setSecondInningsBowlerId(e.target.value)}
                  className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-400"
                >
                  <option value="">Choose bowler</option>
                  {secondInningsBowlingTeam?.players.map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowInningsSwitch(false);
                  setSecondInningsStrikerId("");
                  setSecondInningsNonStrikerId("");
                  setSecondInningsBowlerId("");
                }}
                disabled={isSwitchingInnings}
                className="flex-1 px-6 py-3 bg-white/5 border border-white/20 rounded-xl font-semibold hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={handleSwitchInnings}
                disabled={
                  !secondInningsStrikerId ||
                  !secondInningsNonStrikerId ||
                  !secondInningsBowlerId ||
                  isSwitchingInnings
                }
                className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg transform hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
              >
                {isSwitchingInnings ? "Switching..." : "Start Second Innings"}
              </button>
            </div>
          </div>
        )}

        {/* New Bowler Selection (After Over Completion) */}
        {showBowlerSelector && !inningsComplete && (
          <div className="backdrop-blur-xl bg-white/10 rounded-3xl border border-white/20 p-6 text-white space-y-4">
            <p className="text-lg font-semibold">
              Over Complete! Select New Bowler
            </p>
            <p className="text-sm text-white/70">
              Previous bowler: {bowler?.name || "Unknown"}
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <select
                value={newBowlerId}
                onChange={(e) => setNewBowlerId(e.target.value)}
                className="flex-1 px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-400"
              >
                <option value="">Choose bowler</option>
                {availableNewBowlers.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.name}
                  </option>
                ))}
              </select>
              <button
                onClick={handleNewBowlerSelect}
                disabled={!newBowlerId || isUpdatingBowler}
                className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isUpdatingBowler ? "Updating..." : "Confirm"}
              </button>
            </div>
          </div>
        )}

        {/* Action Area */}
        <div className="backdrop-blur-xl bg-white/10 rounded-3xl border border-white/20 p-6 text-white space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-lg font-semibold">
              {wicketState.active ? "Record Wicket" : "Record Ball"}
            </p>
            {wicketState.active ? (
              <button
                onClick={() =>
                  setWicketState({ active: false, batterSide: null, type: null })
                }
                className="text-xs text-white/70 underline"
              >
                Cancel
              </button>
            ) : null}
          </div>

          {!wicketState.active ? (
            <div className="space-y-4">
              {/* Runs */}
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                {[0, 1, 2, 3, 4, 6].map((run) => (
                  <button
                    key={run}
                    disabled={keypadDisabled}
                    onClick={() => handleRecordRun(run)}
                    className="py-4 rounded-2xl bg-white/10 border border-white/20 text-2xl font-semibold hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {run}
                  </button>
                ))}
              </div>

              {/* Extras */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {EXTRA_BUTTONS.map((extra) => (
                  <button
                    key={extra.label}
                    disabled={keypadDisabled}
                    onClick={() =>
                      handleRecordExtra(extra.type, extra.runs)
                    }
                    className="py-3 rounded-2xl bg-white/5 border border-white/15 text-sm font-semibold hover:bg-white/15 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {extra.label}
                  </button>
                ))}
              </div>

              {/* Wicket + Undo */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={startWicketFlow}
                  disabled={keypadDisabled}
                  className="py-4 rounded-2xl bg-red-500/40 border border-red-400/60 text-white font-semibold hover:bg-red-500/60 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  WICKET
                </button>
                <button
                  onClick={handleUndo}
                  className="py-4 rounded-2xl bg-yellow-400/30 border border-yellow-300/60 text-yellow-50 font-semibold hover:bg-yellow-400/50 flex items-center justify-center gap-2"
                >
                  ↺ UNDO
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="text-sm text-white/70 mb-2">
                  Who is out?
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() =>
                      setWicketState((prev) => ({
                        ...prev,
                        batterSide: "striker",
                      }))
                    }
                    className={`py-3 rounded-2xl border ${
                      wicketState.batterSide === "striker"
                        ? "bg-white/30 border-white/60"
                        : "bg-white/5 border-white/20"
                    }`}
                  >
                    Striker
                  </button>
                  <button
                    onClick={() =>
                      setWicketState((prev) => ({
                        ...prev,
                        batterSide: "non-striker",
                      }))
                    }
                    className={`py-3 rounded-2xl border ${
                      wicketState.batterSide === "non-striker"
                        ? "bg-white/30 border-white/60"
                        : "bg-white/5 border-white/20"
                    }`}
                  >
                    Non-Striker
                  </button>
                </div>
              </div>

              <div>
                <p className="text-sm text-white/70 mb-2">
                  Dismissal Type
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {WICKET_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() =>
                        setWicketState((prev) => ({
                          ...prev,
                          type: opt.value,
                        }))
                      }
                      className={`py-3 rounded-2xl border text-sm ${
                        wicketState.type === opt.value
                          ? "bg-white/30 border-white/60"
                          : "bg-white/5 border-white/20"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={completeWicket}
                className="w-full py-4 rounded-2xl bg-red-500/60 border border-red-400 text-white font-semibold hover:bg-red-500"
              >
                Confirm Wicket
              </button>
            </div>
          )}
        </div>

            {/* Error */}
            {error && (
              <div className="backdrop-blur-xl bg-red-500/20 border border-red-500/40 text-white p-4 rounded-2xl">
                {error}
              </div>
            )}
          </div>

          {/* Sidebar - Bowler Statistics */}
          <div className="lg:col-span-1">
            <div className="sticky top-8">
              <BowlerStatsSidebar
                bowlingTeamPlayers={bowlingTeam?.players ?? []}
                playerStats={playerStats}
                currentBowlerId={liveState?.bowler_id}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

