"use client";

/**
 * Dashboard / Home Page
 * 
 * Main landing page that shows:
 * - Active match status (if any)
 * - Quick stats (placeholder)
 * - Navigation to create new match or resume existing match
 */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signOut } from "firebase/auth";
import { useAuth } from "@/contexts/AuthContext";
import { getActiveMatch } from "@/lib/firebase/matches";
import type { Match } from "@/types/cricket";
import { auth } from "@/lib/firebase/config";

export default function Home() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [activeMatch, setActiveMatch] = useState<Match | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Fetch active match on mount
  useEffect(() => {
    const fetchActiveMatch = async () => {
      if (authLoading) return;

      if (!user) {
        setLoading(false);
        return;
      }

      try {
        const match = await getActiveMatch(user.uid);
        setActiveMatch(match);
      } catch (err) {
        console.error("Error fetching active match:", err);
        setError("Failed to load match data. Please refresh the page.");
      } finally {
        setLoading(false);
      }
  };

    fetchActiveMatch();
  }, [user, authLoading]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/auth");
    }
  }, [authLoading, user, router]);

  const handleResumeMatch = () => {
    if (activeMatch) {
      router.push(`/match/${activeMatch.id}`);
    }
  };

  const handleStartNewMatch = () => {
    router.push("/match/new");
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      router.push("/auth");
    } catch (err) {
      console.error("Sign out failed:", err);
      setError("Failed to sign out. Please try again.");
    }
  };

  // Show loading state
  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-indigo-900 via-purple-900 to-pink-900">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
      </div>
    );
  }

  // Redirect placeholder while router navigates
  if (!authLoading && !user) {
    return null;
  }

  const displayName =
    user?.displayName || user?.email?.split("@")[0] || "User";

  return (
    <div className="min-h-screen bg-linear-to-br from-indigo-900 via-purple-900 to-pink-900 relative overflow-hidden">
      {/* Animated Background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-pink-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-2000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-indigo-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-4000"></div>
      </div>

      <div className="relative z-10 min-h-screen py-12 px-4">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-12">
            <div className="text-center lg:text-left">
              <h1 className="text-5xl font-bold text-white mb-3 tracking-tight">
                Welcome back, {displayName}!
              </h1>
              <p className="text-white/70 text-lg">
                Manage your cricket matches and track scores in real-time
              </p>
            </div>
            <button
              onClick={handleSignOut}
              className="self-center lg:self-auto px-5 py-3 bg-white/10 border border-white/30 rounded-2xl text-white text-sm font-semibold hover:bg-white/20 transition-colors duration-200 backdrop-blur"
            >
              Sign Out
            </button>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 max-w-2xl mx-auto p-4 bg-red-500/20 border border-red-500/50 rounded-xl text-red-100 text-sm animate-shake">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Action Card */}
            <div className="lg:col-span-2">
              {activeMatch ? (
                /* Active Match Card */
                <div className="backdrop-blur-xl bg-white/10 rounded-3xl shadow-2xl border border-white/20 p-8">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="px-3 py-1 bg-green-500/30 border border-green-400/50 rounded-full text-green-200 text-xs font-semibold">
                          LIVE
                        </span>
                        <span className="text-white/50 text-sm">
                          Match in Progress
                        </span>
                      </div>
                      <h2 className="text-2xl font-bold text-white">
                        {activeMatch.teams.a.name} vs {activeMatch.teams.b.name}
                      </h2>
                    </div>
                  </div>

                  {/* Match Details */}
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                      <p className="text-white/70 text-sm mb-1">Current Score</p>
                      <p className="text-3xl font-bold text-white">
                        {activeMatch.live_state.score.runs}/
                        {activeMatch.live_state.score.wickets}
                      </p>
                      <p className="text-white/50 text-xs mt-1">
                        {activeMatch.live_state.score.overs}.
                        {activeMatch.live_state.score.balls} overs
                      </p>
                    </div>
                    <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                      <p className="text-white/70 text-sm mb-1">Batting Team</p>
                      <p className="text-xl font-semibold text-white">
                        {activeMatch.teams[
                          activeMatch.live_state.batting_team_id as "a" | "b"
                        ]?.name || "N/A"}
                      </p>
                      <p className="text-white/50 text-xs mt-1">
                        {activeMatch.config.total_overs} overs match
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={handleResumeMatch}
                    className="w-full py-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transform hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-2"
                  >
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
                        d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    Resume Scoring
                  </button>
                </div>
              ) : (
                /* Start New Match Card */
                <div className="backdrop-blur-xl bg-white/10 rounded-3xl shadow-2xl border border-white/20 p-8">
                  <div className="text-center">
                    <div className="mb-6">
                      <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
                        <svg
                          className="w-10 h-10 text-white"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 4v16m8-8H4"
                          />
                        </svg>
                      </div>
                      <h2 className="text-3xl font-bold text-white mb-2">
                        Start a New Match
                      </h2>
                      <p className="text-white/70">
                        Create a new cricket match and begin scoring
                      </p>
                    </div>

                    <button
                      onClick={handleStartNewMatch}
                      className="w-full py-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transform hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-2"
                    >
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
                          d="M12 4v16m8-8H4"
                        />
                      </svg>
                      Start New Match
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Quick Stats Sidebar */}
            <div className="space-y-6">
              {/* Quick Stats Card */}
              <div className="backdrop-blur-xl bg-white/10 rounded-3xl shadow-2xl border border-white/20 p-6">
                <h3 className="text-xl font-bold text-white mb-4">Quick Stats</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-white/70 text-sm">Total Matches</span>
                    <span className="text-white font-semibold">-</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-white/70 text-sm">Matches Won</span>
                    <span className="text-white font-semibold">-</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-white/70 text-sm">Total Runs</span>
                    <span className="text-white font-semibold">-</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-white/70 text-sm">Best Score</span>
                    <span className="text-white font-semibold">-</span>
                  </div>
                </div>
                <p className="text-white/50 text-xs mt-4 text-center">
                  Stats coming soon
                </p>
              </div>

              {/* Quick Actions Card */}
              <div className="backdrop-blur-xl bg-white/10 rounded-3xl shadow-2xl border border-white/20 p-6">
                <h3 className="text-xl font-bold text-white mb-4">Quick Actions</h3>
                <div className="space-y-3">
                  <Link
                    href="/match/new"
                    className="block w-full py-3 px-4 bg-white/5 border border-white/20 rounded-xl text-white text-sm font-medium hover:bg-white/10 transition-all duration-200 text-center"
                  >
                    Create Match
                  </Link>
                  <button
                    onClick={() => {
                      // Placeholder for future feature
                      alert("Player management coming soon!");
                    }}
                    className="block w-full py-3 px-4 bg-white/5 border border-white/20 rounded-xl text-white text-sm font-medium hover:bg-white/10 transition-all duration-200"
                  >
                    Manage Players
                  </button>
                  <button
                    onClick={() => {
                      // Placeholder for future feature
                      alert("Match history coming soon!");
                    }}
                    className="block w-full py-3 px-4 bg-white/5 border border-white/20 rounded-xl text-white text-sm font-medium hover:bg-white/10 transition-all duration-200"
                  >
                    Match History
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
