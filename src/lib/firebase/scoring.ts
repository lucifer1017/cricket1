import {
  runTransaction,
  doc,
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  getDoc,
  serverTimestamp,
  deleteField,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase/config";
import type {
  BallEvent,
  BallInput,
  Match,
  MatchLiveState,
  MatchResult,
  OverBall,
  TeamId,
} from "@/types/cricket";
import { ExtraType, MatchStatus, WicketType } from "@/types/cricket";

const getInningsId = (matchData: Match): string => {
  // Determine innings based on which team is batting
  // First innings: team that won toss and chose to bat
  // Second innings: the other team
  if (!matchData.toss) return "1";
  
  const tossWinner = matchData.toss.winner_id;
  const tossDecision = matchData.toss.decision;
  const currentBattingTeam = matchData.live_state.batting_team_id;
  
  // If toss winner chose to bat, first innings is when they bat
  if (tossDecision === "bat") {
    return currentBattingTeam === tossWinner ? "1" : "2";
  } else {
    // If toss winner chose to bowl, first innings is when the other team bats
    return currentBattingTeam === tossWinner ? "2" : "1";
  }
};

const getBallsCollection = (matchId: string, inningsId: string) =>
  collection(db, "matches", matchId, "innings", inningsId, "balls");

const deepCloneState = (state: MatchLiveState): MatchLiveState =>
  JSON.parse(JSON.stringify(state));

const requireAuthenticatedUser = () => {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error("You must be logged in to score this match.");
  }
  return currentUser;
};

const assertScoringAccess = (match: Match, uid: string) => {
  const isOwner = match.owner_id === uid;
  const isAuthorized =
    match.authorized_user_ids?.includes(uid) ?? false;
  if (!isOwner && !isAuthorized) {
    throw new Error("You do not have permission to score this match.");
  }
};

export const calculateRuns = (ballInput: BallInput): number => {
  const extrasRuns = ballInput.extras?.runs ?? 0;
  return ballInput.runs_off_bat + extrasRuns;
};

export const isLegalDelivery = (
  extras?: BallInput["extras"]
): boolean => {
  if (!extras) return true;
  return ![ExtraType.WIDE, ExtraType.NO_BALL].includes(extras.type);
};

const wicketCountsForBowler = (type?: WicketType | null): boolean => {
  if (!type) return false;
  return ![WicketType.RUN_OUT, WicketType.RETIRED].includes(type);
};

const clonePlayerStats = (state: MatchLiveState["player_stats"]) => ({
  batters: { ...(state?.batters ?? {}) },
  bowlers: { ...(state?.bowlers ?? {}) },
});

export async function recordBall(
  matchId: string,
  ballInput: BallInput
): Promise<void> {
  const currentUser = requireAuthenticatedUser();

  await runTransaction(db, async (transaction) => {
    const matchRef = doc(db, "matches", matchId);
    const matchSnap = await transaction.get(matchRef);

    if (!matchSnap.exists()) {
      throw new Error("Match not found.");
    }

    const matchData = matchSnap.data() as Match;
    assertScoringAccess(matchData, currentUser.uid);

    if (matchData.status !== MatchStatus.LIVE) {
      throw new Error("Match is not live. Cannot record ball.");
    }

    const inningsId = getInningsId(matchData);
    const preBallState = deepCloneState(matchData.live_state);
    const liveState = deepCloneState(matchData.live_state);
    const score = { ...liveState.score };
    const playerStats = clonePlayerStats(liveState.player_stats);
    const battingTeamId = liveState.batting_team_id as TeamId | undefined;
    const battingTeam =
      battingTeamId != null ? matchData.teams[battingTeamId] : undefined;
    const battingTeamSize = battingTeam?.players.length ?? 0;
    const maxWicketsBeforeAllOut = Math.max(battingTeamSize - 1, 0);
    const dismissedBatters = new Set(liveState.dismissed_batter_ids ?? []);
    liveState.dismissed_batter_ids = Array.from(dismissedBatters);

    if (
      maxWicketsBeforeAllOut > 0 &&
      score.wickets >= maxWicketsBeforeAllOut
    ) {
      throw new Error(
        "Innings complete. All available batters have been dismissed."
      );
    }

    const ensureBatterEligible = (batterId?: string | null, label = "Batter") => {
      if (batterId && dismissedBatters.has(batterId)) {
        throw new Error(`${label} has already been dismissed. Please select a new batter.`);
      }
    };

    ensureBatterEligible(liveState.striker_id, "Striker");
    ensureBatterEligible(liveState.non_striker_id, "Non-striker");

    // VALIDATION: Prevent recording if innings is complete (reached total overs limit)
    const totalOvers = matchData.config?.total_overs ?? 0;
    if (score.overs >= totalOvers) {
      throw new Error(`Innings complete! ${totalOvers} overs have been bowled. Please switch to the next innings.`);
    }

    // VALIDATION: Prevent recording if over is complete AND we haven't selected a new bowler
    // This prevents the race condition where a ball can be recorded between
    // over completion detection and UI state update
    // Only block if: balls === 0, overs > 0, AND current bowler is same as last bowler
    // (meaning we're still waiting for bowler selection)
    if (score.balls === 0 && score.overs > 0 && 
        liveState.bowler_id && liveState.last_bowler_id &&
        liveState.bowler_id === liveState.last_bowler_id) {
      throw new Error("Over is complete. Please select a new bowler before recording the next ball.");
    }

    // VALIDATION: Prevent same bowler from bowling consecutive overs
    // This enforces cricket rules where a bowler cannot bowl two consecutive overs
    if (liveState.bowler_id && liveState.last_bowler_id && 
        liveState.bowler_id === liveState.last_bowler_id) {
      throw new Error("A bowler cannot bowl consecutive overs. Please select a different bowler.");
    }

    const totalRuns = calculateRuns(ballInput);
    const legalDelivery = isLegalDelivery(ballInput.extras);

    score.runs += totalRuns;

    if (ballInput.wicket?.player_id) {
      if (dismissedBatters.has(ballInput.wicket.player_id)) {
        throw new Error("This batter has already been dismissed.");
      }
      score.wickets += 1;
      dismissedBatters.add(ballInput.wicket.player_id);
    }

    let overCompleted = false;
    if (legalDelivery) {
      score.balls += 1;
      if (score.balls >= 6) {
        score.overs += 1;
        score.balls = 0;
        overCompleted = true;
        // Track the bowler who just completed the over
        // This prevents them from bowling the next over
        liveState.last_bowler_id = liveState.bowler_id;
      }
    }

    const strikerId = preBallState.striker_id;
    const bowlerId = preBallState.bowler_id;

    const incrementStrikerBall =
      ballInput.extras?.type !== ExtraType.WIDE &&
      ballInput.extras?.type !== ExtraType.NO_BALL;

    if (strikerId) {
      const existingBatter = playerStats.batters[strikerId] ?? {
        runs: 0,
        balls: 0,
      };
      const batterStats = {
        runs: existingBatter.runs + ballInput.runs_off_bat,
        balls: existingBatter.balls + (incrementStrikerBall ? 1 : 0),
      };
      playerStats.batters[strikerId] = batterStats;
    }

    if (bowlerId) {
      const existingBowler = playerStats.bowlers[bowlerId] ?? {
        runs: 0,
        balls: 0,
        wickets: 0,
      };
      const creditedRuns =
        ballInput.extras?.type === ExtraType.BYE ||
        ballInput.extras?.type === ExtraType.LEG_BYE
          ? 0
          : totalRuns;
      const bowlerStats = {
        runs: existingBowler.runs + creditedRuns,
        balls: existingBowler.balls + (legalDelivery ? 1 : 0),
        wickets:
          existingBowler.wickets +
          (ballInput.wicket?.player_id &&
          wicketCountsForBowler(ballInput.wicket.type ?? null)
            ? 1
            : 0),
      };
      playerStats.bowlers[bowlerId] = bowlerStats;
    }

    liveState.score = score;
    liveState.player_stats = playerStats;

    if (ballInput.wicket?.player_id) {
      if (ballInput.wicket.is_striker_out ?? true) {
        liveState.striker_id = "";
      } else {
        liveState.non_striker_id = "";
      }
      liveState.dismissed_batter_ids = Array.from(dismissedBatters);
    }

    const shouldRotate =
      (ballInput.runs_off_bat % 2 === 1 || overCompleted) &&
      liveState.striker_id &&
      liveState.non_striker_id;

    if (shouldRotate) {
      const temp = liveState.striker_id;
      liveState.striker_id = liveState.non_striker_id;
      liveState.non_striker_id = temp;
    }

    liveState.is_free_hit = ballInput.extras?.type === ExtraType.NO_BALL;

    const preOvers = preBallState.score.overs;
    const preBalls = preBallState.score.balls;
    const illegalSuffix = legalDelivery ? "" : `_x${Date.now()}`;
    const ballIdentifier = `${preOvers}_${preBalls}${illegalSuffix}`;
    liveState.last_ball_id = ballIdentifier;

    const ballEvent: BallEvent = {
      id: ballIdentifier,
      match_id: matchId,
      innings_id: inningsId,
      timestamp: null,
      runs_off_bat: ballInput.runs_off_bat,
      extras: ballInput.extras
        ? {
            type: ballInput.extras.type,
            runs: ballInput.extras.runs,
          }
        : null,
      wicket: ballInput.wicket
        ? {
            is_out: true,
            type: ballInput.wicket.type,
            player_id: ballInput.wicket.player_id,
          }
        : null,
      pre_ball_state: preBallState,
      post_ball_state: liveState,
    };

    const ballsCollection = getBallsCollection(matchId, inningsId);
    const ballDoc = doc(ballsCollection);

    const overEntry: OverBall = {
      id: ballEvent.id,
      runs_off_bat: ballEvent.runs_off_bat,
      extras: ballEvent.extras,
      wicket: ballEvent.wicket,
    };

    liveState.this_over = [
      ...((liveState.this_over ?? []) as OverBall[]),
      overEntry,
    ].slice(-6);

    const matchResultPayload: MatchResult | null = (() => {
      const isSecondInnings = liveState.current_innings === 2;
      const firstInningsRuns = liveState.first_innings_total;
      if (!isSecondInnings || firstInningsRuns == null) {
        return null;
      }

      const target = firstInningsRuns + 1;
      const chasingRuns = liveState.score.runs;
      const wicketsLost = liveState.score.wickets;
      const chasingTeamId =
        (liveState.second_batting_team_id ??
          liveState.batting_team_id) as TeamId | undefined;
      const defendingTeamId =
        (liveState.first_batting_team_id ??
          liveState.bowling_team_id) as TeamId | undefined;
      const chasingTeamData = chasingTeamId
        ? matchData.teams[chasingTeamId]
        : undefined;
      const chasingTeamSize = chasingTeamData?.players.length ?? 0;
      const maxChasingWickets = Math.max(chasingTeamSize - 1, 1);
      const wicketsRemaining = Math.max(0, maxChasingWickets - wicketsLost);
      const totalBalls = matchData.config.total_overs * 6;
      const ballsBowled =
        liveState.score.overs * 6 + liveState.score.balls;
      const ballsRemaining = Math.max(0, totalBalls - ballsBowled);

      const chasingTeamName = chasingTeamId
        ? matchData.teams[chasingTeamId].name
        : "Chasing team";
      const defendingTeamName = defendingTeamId
        ? matchData.teams[defendingTeamId].name
        : "Defending team";

      const oversComplete =
        liveState.score.overs >= matchData.config.total_overs &&
        liveState.score.balls === 0;
      const allOut = wicketsRemaining === 0;

      if (chasingRuns >= target) {
        const margin =
          wicketsRemaining > 0
            ? `${wicketsRemaining} wicket${wicketsRemaining === 1 ? "" : "s"}`
            : `${ballsRemaining} ball${ballsRemaining === 1 ? "" : "s"}`;
        return {
          type: "win",
          winner_team_id: chasingTeamId,
          loser_team_id: defendingTeamId,
          margin,
          summary: `${chasingTeamName} won by ${margin}`,
          first_innings_runs: firstInningsRuns,
          second_innings_runs: chasingRuns,
        };
      }

      if (allOut || oversComplete) {
        if (chasingRuns === firstInningsRuns) {
          return {
            type: "tie",
            summary: `Match tied! Both teams scored ${chasingRuns} runs`,
            first_innings_runs: firstInningsRuns,
            second_innings_runs: chasingRuns,
          };
        }

        const margin = firstInningsRuns - chasingRuns;
        return {
          type: "win",
          winner_team_id: defendingTeamId,
          loser_team_id: chasingTeamId,
          margin: `${margin} run${margin === 1 ? "" : "s"}`,
          summary: `${defendingTeamName} won by ${margin} run${margin === 1 ? "" : "s"}`,
          first_innings_runs: firstInningsRuns,
          second_innings_runs: chasingRuns,
        };
      }

      return null;
    })();

    transaction.set(ballDoc, {
      ...ballEvent,
      timestamp: serverTimestamp(),
    });

    const updatePayload: Record<string, unknown> = {
      live_state: liveState,
      updated_at: serverTimestamp(),
    };

    if (matchResultPayload) {
      updatePayload.status = MatchStatus.COMPLETED;
      updatePayload.result = matchResultPayload;
    }

    transaction.update(matchRef, updatePayload);
  });
}

export async function undoLastBall(matchId: string): Promise<void> {
  const currentUser = requireAuthenticatedUser();
  const matchRef = doc(db, "matches", matchId);
  const matchSnap = await getDoc(matchRef);

  if (!matchSnap.exists()) {
    throw new Error("Match not found.");
  }

  const matchData = matchSnap.data() as Match;
  assertScoringAccess(matchData, currentUser.uid);
  const inningsId = getInningsId(matchData);
  const ballsCollection = getBallsCollection(matchId, inningsId);
  const lastBallQuery = query(
    ballsCollection,
    orderBy("timestamp", "desc"),
    limit(1)
  );

  const snapshot = await getDocs(lastBallQuery);

  if (snapshot.empty) {
    throw new Error("No balls recorded yet. Cannot undo.");
  }

  const lastBallDoc = snapshot.docs[0];

  await runTransaction(db, async (transaction) => {
    const matchRef = doc(db, "matches", matchId);
    const matchSnap = await transaction.get(matchRef);

    if (!matchSnap.exists()) {
      throw new Error("Match not found.");
    }

    const latestMatchData = matchSnap.data() as Match;
    assertScoringAccess(latestMatchData, currentUser.uid);
    const ballSnap = await transaction.get(lastBallDoc.ref);

    if (!ballSnap.exists()) {
      throw new Error("Ball already removed. Please try again.");
    }

    const ballData = ballSnap.data() as BallEvent;
    const restoredState = deepCloneState(ballData.pre_ball_state);

    // If undoing takes us to a state where balls === 0 and overs > 0,
    // we're at the start of a new over, so clear last_bowler_id
    // This allows a new bowler to be selected
    if (restoredState.score.balls === 0 && restoredState.score.overs > 0) {
      restoredState.last_bowler_id = undefined;
    }

    transaction.update(matchRef, {
      live_state: restoredState,
      status: MatchStatus.LIVE,
      result: deleteField(),
      updated_at: serverTimestamp(),
    });

    transaction.delete(lastBallDoc.ref);
  });
}

