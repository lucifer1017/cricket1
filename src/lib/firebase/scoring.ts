import {
  runTransaction,
  doc,
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import type {
  BallEvent,
  BallInput,
  Match,
  MatchLiveState,
  OverBall,
} from "@/types/cricket";
import { ExtraType, MatchStatus, WicketType } from "@/types/cricket";

const INNINGS_ID = "1";

const getBallsCollection = (matchId: string) =>
  collection(db, "matches", matchId, "innings", INNINGS_ID, "balls");

const deepCloneState = (state: MatchLiveState): MatchLiveState =>
  JSON.parse(JSON.stringify(state));

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
  await runTransaction(db, async (transaction) => {
    const matchRef = doc(db, "matches", matchId);
    const matchSnap = await transaction.get(matchRef);

    if (!matchSnap.exists()) {
      throw new Error("Match not found.");
    }

    const matchData = matchSnap.data() as Match;

    if (matchData.status !== MatchStatus.LIVE) {
      throw new Error("Match is not live. Cannot record ball.");
    }

    const preBallState = deepCloneState(matchData.live_state);
    const liveState = deepCloneState(matchData.live_state);
    const score = { ...liveState.score };
    const playerStats = clonePlayerStats(liveState.player_stats);

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
      score.wickets += 1;
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
      innings_id: INNINGS_ID,
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

    const ballsCollection = getBallsCollection(matchId);
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

    transaction.set(ballDoc, {
      ...ballEvent,
      timestamp: serverTimestamp(),
    });
    transaction.update(matchRef, {
      live_state: liveState,
      updated_at: serverTimestamp(),
    });
  });
}

export async function undoLastBall(matchId: string): Promise<void> {
  const ballsCollection = getBallsCollection(matchId);
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
      updated_at: serverTimestamp(),
    });

    transaction.delete(lastBallDoc.ref);
  });
}

