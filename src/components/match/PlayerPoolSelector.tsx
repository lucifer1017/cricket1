"use client";

/**
 * Player Pool Selector Component
 *
 * Allows scorers to build the match-specific player pool by searching the
 * global player database, creating new players, and removing players.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  searchPlayers,
  createPlayer,
  addPlayerToPool,
  removePlayerFromPool,
} from "@/lib/firebase/matches";
import type { Player } from "@/types/cricket";

interface PlayerPoolSelectorProps {
  matchId: string;
  currentPool: Player[];
  onPoolUpdated: () => void;
}

export default function PlayerPoolSelector({
  matchId,
  currentPool,
  onPoolUpdated,
}: PlayerPoolSelectorProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Player[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [removingPlayerId, setRemovingPlayerId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const performSearch = useCallback(async (query: string) => {
    if (!query || query.trim().length === 0) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    setIsSearching(true);
    setError("");

    try {
      const results = await searchPlayers(query.trim());
      setSearchResults(results);
      setShowDropdown(true);
    } catch (err) {
      console.error("Pool search error:", err);
      setError(err instanceof Error ? err.message : "Failed to search players");
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
    setError("");

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    const timer = setTimeout(() => {
      performSearch(value);
    }, 500);

    debounceTimerRef.current = timer;
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      performSearch(searchQuery);
    }
  };

  const handleAddToPool = async (player: Player) => {
    if (currentPool.some((p) => p.id === player.id)) {
      setError(`${player.name} is already in the pool`);
      return;
    }

    setIsAdding(true);
    setError("");

    try {
      await addPlayerToPool(matchId, player);
      setSearchQuery("");
      setSearchResults([]);
      setShowDropdown(false);
      onPoolUpdated();
    } catch (err) {
      console.error("Add to pool error:", err);
      setError(err instanceof Error ? err.message : "Failed to add player");
    } finally {
      setIsAdding(false);
    }
  };

  const handleCreateAndAdd = async () => {
    if (!searchQuery.trim()) {
      setError("Please enter a player name");
      return;
    }

    setIsCreating(true);
    setError("");

    try {
      const newPlayer = await createPlayer(searchQuery.trim());
      await addPlayerToPool(matchId, newPlayer);
      setSearchQuery("");
      setSearchResults([]);
      setShowDropdown(false);
      onPoolUpdated();
    } catch (err) {
      console.error("Create pool player error:", err);
      setError(err instanceof Error ? err.message : "Failed to create player");
    } finally {
      setIsCreating(false);
    }
  };

  const handleRemoveFromPool = async (playerId: string) => {
    if (removingPlayerId) return;
    setRemovingPlayerId(playerId);
    setError("");

    try {
      await removePlayerFromPool(matchId, playerId);
      onPoolUpdated();
    } catch (err) {
      console.error("Remove pool player error:", err);
      setError(
        err instanceof Error ? err.message : "Failed to remove player from pool"
      );
    } finally {
      setRemovingPlayerId(null);
    }
  };

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest(".player-pool-selector")) {
        setShowDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return (
    <div className="player-pool-selector space-y-4">
      <div className="text-center">
        <h3 className="text-xl font-semibold text-white mb-1">
          Match Player Pool
        </h3>
        <p className="text-sm text-gray-400">
          {currentPool.length} player{currentPool.length !== 1 ? "s" : ""} in
          pool
        </p>
      </div>

      <div className="relative">
        <input
          type="text"
          value={searchQuery}
          onChange={handleSearchChange}
          onKeyDown={handleSearchKeyDown}
          onFocus={() => {
            if (searchResults.length > 0 || searchQuery.trim()) {
              setShowDropdown(true);
            }
          }}
          placeholder="Search players to add to the pool..."
          className="w-full px-4 py-3 bg-white/5 backdrop-blur-md border border-white/10 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition-all duration-300 pr-12"
        />
        {isSearching && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            <svg
              className="animate-spin h-5 w-5 text-gray-400"
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
          </div>
        )}
      </div>

      {showDropdown && (
        <div className="absolute z-50 w-full mt-2 bg-black/90 backdrop-blur-md border border-white/20 rounded-xl shadow-2xl max-h-64 overflow-y-auto">
          {searchResults.length > 0 ? (
            <div className="py-2">
              {searchResults.map((player) => (
                <button
                  key={player.id}
                  onClick={() => handleAddToPool(player)}
                  disabled={isAdding}
                  className="w-full px-4 py-3 text-left hover:bg-white/10 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-3"
                >
                  <span className="text-white font-medium">{player.name}</span>
                </button>
              ))}
            </div>
          ) : searchQuery.trim().length > 0 && !isSearching ? (
            <div className="py-4 px-4 text-center">
              <p className="text-gray-400 text-sm mb-3">No players found</p>
              <button
                onClick={handleCreateAndAdd}
                disabled={isCreating}
                className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-sm font-semibold rounded-lg hover:shadow-lg transform hover:scale-105 active:scale-95 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
              >
                {isCreating ? "Creating..." : `Create & Add "${searchQuery.trim()}"`}
              </button>
            </div>
          ) : null}
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-xl text-red-100 text-sm animate-fadeIn">
          {error}
        </div>
      )}

      <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-4">
        <h4 className="text-sm font-semibold text-white mb-3">
          Players in Pool
        </h4>
        {currentPool.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-4">
            No players in the pool yet. Search and add players above.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {currentPool.map((player) => (
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
                  onClick={() => handleRemoveFromPool(player.id)}
                  disabled={removingPlayerId === player.id}
                  className="ml-1 w-6 h-6 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-xs text-white/70 hover:text-white hover:bg-white/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Remove player from pool"
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

