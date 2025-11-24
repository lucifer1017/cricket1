"use client";

import { useMemo } from "react";
import type { Player, PlayerStatsState } from "@/types/cricket";

interface BowlerStatsSidebarProps {
  bowlingTeamPlayers: Player[];
  playerStats: PlayerStatsState;
  currentBowlerId?: string;
}

interface BowlerDisplayStats {
  player: Player;
  overs: number; // Full overs (e.g., 5)
  balls: number; // Balls in current over (0-5)
  totalBalls: number; // Total balls bowled
  runs: number;
  wickets: number;
  economy: number;
  isCurrentBowler: boolean;
}

export default function BowlerStatsSidebar({
  bowlingTeamPlayers,
  playerStats,
  currentBowlerId,
}: BowlerStatsSidebarProps) {
  const bowlerStatsList = useMemo(() => {
    const stats: BowlerDisplayStats[] = [];

    // Get all bowlers who have bowled at least one ball
    Object.entries(playerStats.bowlers || {}).forEach(([playerId, bowlerStats]) => {
      const player = bowlingTeamPlayers.find((p) => p.id === playerId);
      if (!player || bowlerStats.balls === 0) return;

      const totalBalls = bowlerStats.balls;
      const overs = Math.floor(totalBalls / 6);
      const balls = totalBalls % 6;
      const runs = bowlerStats.runs;
      const wickets = bowlerStats.wickets;
      const economy = totalBalls > 0 ? (runs / totalBalls) * 6 : 0;

      stats.push({
        player,
        overs,
        balls,
        totalBalls,
        runs,
        wickets,
        economy,
        isCurrentBowler: playerId === currentBowlerId,
      });
    });

    // Sort by total balls bowled (most overs first), then by economy
    return stats.sort((a, b) => {
      if (b.totalBalls !== a.totalBalls) {
        return b.totalBalls - a.totalBalls;
      }
      return a.economy - b.economy;
    });
  }, [bowlingTeamPlayers, playerStats, currentBowlerId]);

  if (bowlerStatsList.length === 0) {
    return (
      <div className="backdrop-blur-xl bg-white/10 rounded-3xl border border-white/20 p-6 text-white">
        <h3 className="text-lg font-semibold mb-4">Bowler Statistics</h3>
        <p className="text-white/60 text-sm">No bowlers have bowled yet</p>
      </div>
    );
  }

  return (
    <div className="backdrop-blur-xl bg-white/10 rounded-3xl border border-white/20 p-6 text-white">
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          />
        </svg>
        Bowler Statistics
      </h3>

      <div className="space-y-3 max-h-[calc(100vh-300px)] overflow-y-auto pr-2 custom-scrollbar">
        {bowlerStatsList.map((bowlerStat) => (
          <div
            key={bowlerStat.player.id}
            className={`p-4 rounded-2xl border transition-all duration-200 ${
              bowlerStat.isCurrentBowler
                ? "bg-gradient-to-r from-purple-500/20 to-pink-500/20 border-purple-400/50 shadow-lg"
                : "bg-white/5 border-white/20 hover:bg-white/10"
            }`}
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-semibold text-white">
                    {bowlerStat.player.name}
                  </p>
                  {bowlerStat.isCurrentBowler && (
                    <span className="px-2 py-0.5 bg-green-500/30 border border-green-400/50 rounded-full text-green-200 text-xs font-semibold">
                      BOWLING
                    </span>
                  )}
                </div>
                <p className="text-white/60 text-xs">
                  {bowlerStat.overs}.{bowlerStat.balls} overs
                </p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-white">
                  {bowlerStat.runs}/{bowlerStat.wickets}
                </p>
                <p className="text-white/60 text-xs">Runs/Wickets</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-white/10">
              <div>
                <p className="text-white/50 text-xs uppercase tracking-widest mb-1">
                  Economy
                </p>
                <p className="text-white font-semibold">
                  {bowlerStat.economy.toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-white/50 text-xs uppercase tracking-widest mb-1">
                  Wickets
                </p>
                <p className="text-white font-semibold">
                  {bowlerStat.wickets}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

