"use client";

/**
 * Squad Selector Component
 *
 * Handles drafting players from the match player pool into a specific team's squad.
 * Assumes the pool has already been built in a prior step.
 */

import { useMemo, useState } from "react";
import { addPlayerToSquad, removePlayerFromSquad } from "@/lib/firebase/matches";
import type { Player } from "@/types/cricket";

interface SquadSelectorProps {
  matchId: string;
  teamId: "a" | "b";
  teamName: string;
  currentPlayers: Player[];
  otherTeamPlayers: Player[];
  playerPool: Player[];
  targetCount: number;
  onPlayerAdded: () => void;
}

export default function SquadSelector({
  matchId,
  teamId,
  teamName,
  currentPlayers,
  otherTeamPlayers,
  playerPool,
  targetCount,
  onPlayerAdded,
}: SquadSelectorProps) {
  const [addingPlayerId, setAddingPlayerId] = useState<string | null>(null);
  const [removingPlayerId, setRemovingPlayerId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const poolReady = targetCount > 0;

  const availablePlayers = useMemo(() => {
    return playerPool.filter(
      (player) =>
        !currentPlayers.some((p) => p.id === player.id) &&
        !otherTeamPlayers.some((p) => p.id === player.id)
    );
  }, [playerPool, currentPlayers, otherTeamPlayers]);

  const handleAddPlayer = async (player: Player) => {
    if (currentPlayers.length >= targetCount) {
      setError(`You already selected ${targetCount} players`);
      return;
    }

    setAddingPlayerId(player.id);
    setError("");

    try {
      await addPlayerToSquad(matchId, teamId, player);
      onPlayerAdded();
    } catch (err) {
      console.error("Add player error:", err);
      setError(err instanceof Error ? err.message : "Failed to add player");
    } finally {
      setAddingPlayerId(null);
    }
  };

  const handleRemovePlayer = async (playerId: string) => {
    setRemovingPlayerId(playerId);
    setError("");

    try {
      await removePlayerFromSquad(matchId, teamId, playerId);
      onPlayerAdded();
    } catch (err) {
      console.error("Remove player error:", err);
      setError(err instanceof Error ? err.message : "Failed to remove player");
    } finally {
      setRemovingPlayerId(null);
    }
  };

  const playersNeeded = Math.max(targetCount - currentPlayers.length, 0);

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h3 className="text-xl font-semibold text-white mb-1">{teamName}</h3>
        <p className="text-sm text-gray-400">
          {currentPlayers.length} / {targetCount} players selected
        </p>
        {!poolReady && (
          <p className="text-xs text-yellow-300 mt-1">
            Waiting for player pool to be ready...
          </p>
        )}
      </div>

      {error && (
        <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-xl text-red-100 text-sm animate-fadeIn">
          {error}
        </div>
      )}

      <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-white">Available Players</h4>
          <span className="text-xs text-white/60">
            Need {playersNeeded} more
          </span>
        </div>

        {availablePlayers.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-4">
            No available players in the pool.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {availablePlayers.map((player) => (
              <button
                key={player.id}
                onClick={() => handleAddPlayer(player)}
                disabled={
                  !poolReady ||
                  addingPlayerId === player.id ||
                  currentPlayers.length >= targetCount
                }
                className="flex items-center justify-between px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white text-left hover:bg-white/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="font-medium">{player.name}</span>
                {addingPlayerId === player.id ? (
                  <svg
                    className="animate-spin h-4 w-4 text-purple-300"
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
                ) : (
                  <span className="text-xs text-white/70">Add</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-4">
        <h4 className="text-sm font-semibold text-white mb-3">Selected Players</h4>
        {currentPlayers.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-4">
            No players selected yet.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {currentPlayers.map((player) => (
              <div
                key={player.id}
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/10 border border-white/20 rounded-full text-white text-sm"
              >
                <div className="w-6 h-6 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center text-xs font-semibold">
                  {player.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .toUpperCase()
                    .slice(0, 2)}
                </div>
                <span className="font-medium">{player.name}</span>
                <button
                  onClick={() => handleRemovePlayer(player.id)}
                  disabled={removingPlayerId === player.id}
                  className="ml-1 w-6 h-6 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-xs text-white/70 hover:text-white hover:bg-white/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {removingPlayerId === player.id ? (
                    <svg
                      className="animate-spin h-3 w-3"
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
                  ) : (
                    "×"
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}



