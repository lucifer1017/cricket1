"use client";

import { useMemo } from "react";
import type { Player, PlayerStatsState } from "@/types/cricket";

interface BatterStatsSidebarProps {
  battingTeamPlayers: Player[];
  playerStats: PlayerStatsState;
  strikerId?: string;
  nonStrikerId?: string;
}

type BatterRow = {
  player: Player;
  runs: number;
  balls: number;
  strikeRate: string;
  status: "on-strike" | "non-strike" | "completed" | "yet";
};

const STATUS_ORDER: BatterRow["status"][] = [
  "on-strike",
  "non-strike",
  "completed",
  "yet",
];

export default function BatterStatsSidebar({
  battingTeamPlayers,
  playerStats,
  strikerId,
  nonStrikerId,
}: BatterStatsSidebarProps) {
  const batterRows = useMemo<BatterRow[]>(() => {
    return battingTeamPlayers.map((player) => {
      const stats = playerStats.batters[player.id] ?? { runs: 0, balls: 0 };
      const strikeRate =
        stats.balls > 0 ? ((stats.runs / stats.balls) * 100).toFixed(1) : "0.0";

      let status: BatterRow["status"] = "yet";
      if (player.id === strikerId) {
        status = "on-strike";
      } else if (player.id === nonStrikerId) {
        status = "non-strike";
      } else if (stats.balls > 0) {
        status = "completed";
      }

      return {
        player,
        runs: stats.runs,
        balls: stats.balls,
        strikeRate,
        status,
      };
    });
  }, [battingTeamPlayers, playerStats.batters, strikerId, nonStrikerId]);

  const orderedRows = useMemo(() => {
    return [...batterRows].sort((a, b) => {
      const statusDiff =
        STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
      if (statusDiff !== 0) return statusDiff;
      return b.runs - a.runs;
    });
  }, [batterRows]);

  const getStatusLabel = (status: BatterRow["status"]) => {
    switch (status) {
      case "on-strike":
        return "On strike";
      case "non-strike":
        return "Non-striker";
      case "completed":
        return "Completed";
      default:
        return "Yet to bat";
    }
  };

  return (
    <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-3xl p-5 text-white space-y-4">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-white/60">
          Batting Card
        </p>
        <p className="text-lg font-semibold mt-1">Batter Progress</p>
      </div>
      <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
        {orderedRows.map((row) => (
          <div
            key={row.player.id}
            className={`flex items-center justify-between px-3 py-2 rounded-2xl border border-white/10 bg-white/5 ${
              row.status === "on-strike" || row.status === "non-strike"
                ? "border-purple-300/60 bg-purple-500/10"
                : ""
            }`}
          >
            <div>
              <p className="text-sm font-semibold">{row.player.name}</p>
              <p className="text-xs text-white/60">
                {getStatusLabel(row.status)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-lg font-semibold">
                {row.runs} <span className="text-white/60 text-sm">({row.balls})</span>
              </p>
              <p className="text-xs text-white/60">SR {row.strikeRate}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

