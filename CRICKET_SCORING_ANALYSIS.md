# 🏏 Cricket Scoring Application - Comprehensive Analysis

## 📋 Executive Summary

This is a **real-time cricket scoring application** built on Next.js 16 with Firebase, implementing an **Event Sourcing (Ledger System)** architecture to ensure data consistency and enable robust "Undo" functionality. The application will handle live match scoring with complex cricket rules, player management, and real-time synchronization.

---

## 🏗️ Architecture Analysis

### 1. Event Sourcing Pattern (Ledger System)

**Core Principle**: The score is **derived**, not stored.

```
Traditional Approach (❌ Problematic):
Score = 45 (stored value)
Undo? → What was it before? → Guess? → Error-prone

Event Sourcing Approach (✅ Our Solution):
Score = Sum of all Ball documents
Ball 1: +4 runs → Total: 4
Ball 2: +6 runs → Total: 10
Ball 3: +1 run → Total: 11
...
Undo? → Delete last Ball → Recalculate → Always accurate
```

**Key Benefits**:
- ✅ **Deterministic Undo**: Always know previous state
- ✅ **Audit Trail**: Complete history of every ball
- ✅ **Data Integrity**: Single source of truth
- ✅ **No Race Conditions**: Each ball is immutable

**Critical Design Decision**: Store `pre_ball_state` snapshot in each Ball document
- This allows us to reconstruct the exact state before that ball
- Makes undo operations strictly deterministic
- No need to query previous balls to reverse state

---

## 🔄 User Journey & Workflow Analysis

### Phase 1: Pre-Match Setup

#### 1.1 Authentication & Dashboard
```
User Login → Check Match Status
├─ Status: 'live' → Show "Resume Match" button
└─ Status: null/'completed' → Show "Create Match" button
```

**Technical Requirements**:
- Query Firestore: `matches` collection where `status === 'live'`
- If found: Load match data and navigate to scoring interface
- If not: Show match creation flow

#### 1.2 Squad Construction (The Pool System)

**Concept**: Two-tier system
1. **Global Pool** (`players` collection) - All players ever added
2. **Match Squad** - Players selected for this specific match

**Workflow**:
```
User searches "Rohit"
├─ Found in Pool → Add to Squad (reuse existing player_id)
└─ Not Found → Create in Pool → Add to Squad
```

**Constraints**:
- Must select **Playing XI** (or N players) for **Team A**
- Must select **Playing XI** (or N players) for **Team B**
- Cannot proceed to toss without both squads complete

**UI Requirements**:
- Search interface (autocomplete/typeahead)
- Player cards with add/remove functionality
- Squad display showing selected players
- Validation: "Select 11 players for each team"

#### 1.3 The Toss

**Options**:
- **Manual**: User selects batting/bowling teams
- **App-assisted**: Random coin flip (optional feature)

**Result**:
- Sets `battingTeam` and `bowlingTeam` in Match document
- Determines which team bats first

#### 1.4 Opening Players Selection

**Required Selections**:
- **Striker** (facing the bowler)
- **Non-Striker** (at the other end)
- **Bowler** (from bowling team)

**Validation**:
- Striker & Non-Striker must be from batting team
- Bowler must be from bowling team
- All must be in respective squads

**State Initialization**:
- Create first innings document
- Set initial `live_score` state
- Ready for first ball

---

### Phase 2: Live Scoring (The Core Loop)

#### 2.1 Scoring Interface

**UI Design Requirements**:
- Mobile-responsive (primary use case)
- Large, tappable buttons
- Current score prominently displayed
- Current over (e.g., "5.4") clearly visible
- Quick action buttons: [0] [1] [2] [3] [4] [6] [W] [WD] [NB] [UNDO]

**Real-time Updates**:
- Firestore listeners on `matches/{id}/live_score`
- All viewers see updates instantly
- No page refresh needed

#### 2.2 Ball Input Flow

**User Action**: Taps [4 Runs]

**System Process**:
```
1. User Input → [4 Runs] button tapped
   ↓
2. Create Ball Document
   - Generate ID: "0_1" (over 0, ball 1)
   - Set runs_scored: 4
   - Set extras: null
   - Set wicket: null
   - Capture pre_ball_state snapshot
   ↓
3. Calculate Updates
   - Match totals: runs += 4
   - Striker stats: runs += 4, balls_faced += 1
   - Bowler stats: runs_conceded += 4, balls_bowled += 1
   - Check strike rotation (4 is even → no rotation)
   - Increment ball count (legal delivery)
   ↓
4. Update Match Document
   - Update live_score.runs
   - Update live_score.overs (e.g., 0.1)
   - Update player stats in teams
   ↓
5. Firestore Write
   - Write Ball document to sub-collection
   - Update Match document
   ↓
6. Real-time Sync
   - Firestore listeners trigger
   - All viewers see updated score
```

**Critical Logic Points**:
- **Legal vs Illegal Delivery**: Only increment ball count if not Wide/No-Ball
- **Strike Rotation**: Based on runs + byes + leg_byes
- **Over Completion**: When ball count reaches 6, swap striker/non-striker
- **Wicket Handling**: Complex logic (see Cricket Rules section)

---

### Phase 3: Undo Workflow (The Safety Net)

#### 3.1 Undo Trigger

**User Action**: Taps [UNDO] button

**System Process**:
```
1. Fetch Last Ball
   - Query: matches/{id}/innings/{innings_id}/balls
   - Order by: id DESC
   - Limit: 1
   ↓
2. Extract pre_ball_state
   - This is the snapshot we stored
   - Contains: striker_id, non_striker_id, bowler_id, total_score
   ↓
3. Reverse Calculations
   - Subtract runs from total
   - Subtract runs from striker stats
   - Subtract runs from bowler stats
   - Decrement ball count (if legal delivery)
   - Revert striker/non-striker if strike rotated
   ↓
4. Handle Wicket Reversal
   - If wicket occurred:
     * Set player status back to "Not Out"
     * Remove from dismissed players
     * Restore previous striker/non-striker
   ↓
5. Update Match Document
   - Restore live_score to pre_ball_state values
   - Update player stats
   ↓
6. Delete Ball Document
   - Remove from Firestore
   - This is the "undo" - the event never happened
   ↓
7. Real-time Sync
   - All viewers see reverted state
```

**Why This Works**:
- Each Ball document is **immutable** (once written, never modified)
- `pre_ball_state` gives us exact previous state
- Deleting the document removes the event from history
- Recalculating from remaining balls gives accurate state

---

## 🗄️ Database Schema Deep Dive

### Collection 1: `players` (Global Pool)

**Purpose**: Master list of all players

**Schema**:
```typescript
interface Player {
  id: string;                    // Auto-generated Firestore ID
  normalized_name: string;       // "virat kohli" (for search)
  display_name: string;          // "Virat Kohli" (for display)
  created_at: Timestamp;
  updated_at: Timestamp;
}
```

**Indexes Needed**:
- `normalized_name` (for case-insensitive search)

**Operations**:
- **Create**: When new player added to pool
- **Read**: Search by normalized_name
- **Update**: Rare (maybe fix typo in display_name)
- **Delete**: Never (preserve history)

---

### Collection 2: `matches` (Match State)

**Purpose**: Current match state (fast reads)

**Schema**:
```typescript
interface Match {
  id: string;                    // Auto-generated
  status: 'live' | 'completed' | 'paused';
  created_by: string;            // User UID
  created_at: Timestamp;
  updated_at: Timestamp;
  
  // Team Information
  teams: {
    team_a: {
      name: string;
      squad: PlayerReference[];  // Array of player IDs
      playing_xi: string[];       // Selected playing XI IDs
    };
    team_b: {
      name: string;
      squad: PlayerReference[];
      playing_xi: string[];
    };
  };
  
  // Toss Result
  toss: {
    won_by: 'team_a' | 'team_b';
    decision: 'bat' | 'bowl';
  };
  
  // Current Match State (Fast Read)
  live_score: {
    current_innings: number;     // 1 or 2
    runs: number;
    wickets: number;
    overs: number;                // e.g., 5.4 (5 overs, 4 balls)
    balls_in_over: number;        // 0-5
    
    // Current Players
    striker_id: string;
    non_striker_id: string;
    bowler_id: string;
    
    // Undo Pointer
    last_ball_id: string;         // "0_4" format for quick lookup
  };
  
  // Calculated Totals (for display)
  innings: {
    [innings_id: string]: {
      total_runs: number;
      total_wickets: number;
      total_overs: number;
      players: {
        [player_id: string]: {
          runs: number;
          balls_faced: number;
          fours: number;
          sixes: number;
          is_out: boolean;
          dismissal_type?: string;
        };
      };
      bowlers: {
        [player_id: string]: {
          overs: number;          // e.g., 5.4
          runs_conceded: number;
          wickets: number;
          maidens: number;
        };
      };
    };
  };
}
```

**Key Design Decisions**:
- `live_score` is **denormalized** for fast reads
- `last_ball_id` enables quick undo lookup
- `innings` sub-object stores calculated stats
- Status field enables match resumption

---

### Sub-Collection: `matches/{id}/innings/{innings_id}/balls` (The Ledger)

**Purpose**: Event log (source of truth)

**Schema**:
```typescript
interface BallDocument {
  id: string;                     // "0_1" format (over_ball)
  timestamp: Timestamp;
  
  // The Event Data
  runs_scored: number;            // 0-6 (or more for overthrows)
  extras: {
    type: 'wide' | 'nb' | 'lb' | 'bye' | null;
    runs: number;                  // Extra runs (e.g., wide + 4 = 5 total)
  } | null;
  
  wicket: {
    is_out: boolean;
    type: 'bowled' | 'caught' | 'lbw' | 'run_out' | 'stumped' | 'hit_wicket' | 'obstructing_field' | 'handled_ball';
    player_id: string;            // Who got out
    dismissed_by?: string;        // Bowler/fielder who took wicket
    is_striker_out: boolean;      // Critical for strike rotation
  } | null;
  
  // CRITICAL: State Snapshot (for Undo)
  pre_ball_state: {
    striker_id: string;
    non_striker_id: string;
    bowler_id: string;
    total_score: number;
    wickets: number;
    overs: number;                // e.g., 5.4
    balls_in_over: number;
  };
  
  // Post-ball state (for verification)
  post_ball_state: {
    striker_id: string;           // After strike rotation
    non_striker_id: string;
    total_score: number;
    wickets: number;
    overs: number;
  };
}
```

**ID Format**: `"{over}_{ball}"`
- Over 0, Ball 1 → `"0_1"`
- Over 5, Ball 4 → `"5_4"`
- Enables easy ordering and lookup

**Why Both pre_ball_state and post_ball_state?**
- `pre_ball_state`: For undo (what was it before?)
- `post_ball_state`: For verification (did our calculation match?)

---

## 🧠 Cricket Rules Engine Analysis

### Rule 1: Legal vs Illegal Delivery

**Legal Delivery** (increments ball count):
- Normal delivery (no extras)
- Bye
- Leg Bye

**Illegal Delivery** (does NOT increment ball count):
- Wide
- No-Ball

**Implementation**:
```typescript
const isLegalDelivery = (ball: BallDocument): boolean => {
  return ball.extras?.type !== 'wide' && ball.extras?.type !== 'nb';
};

if (isLegalDelivery(ball)) {
  balls_in_over++;
  if (balls_in_over === 6) {
    // Over complete
    balls_in_over = 0;
    overs++;
    // Swap striker/non-striker
  }
}
```

---

### Rule 2: Strike Rotation

**Automatic Rotation Occurs When**:
1. **Odd runs** (1, 3, 5): Striker and non-striker swap
2. **Over end**: After 6 legal balls, swap positions
3. **Wicket (Caught)**: New batter comes in as striker (unless over just ended)

**Calculation**:
```typescript
const totalRuns = ball.runs_scored + 
                  (ball.extras?.type === 'bye' ? ball.extras.runs : 0) +
                  (ball.extras?.type === 'lb' ? ball.extras.runs : 0);

const shouldRotateStrike = (totalRuns % 2 !== 0) || (balls_in_over === 6);

if (shouldRotateStrike) {
  [striker_id, non_striker_id] = [non_striker_id, striker_id];
}
```

**Edge Cases**:
- **Run Out**: Depends on which batsman was out
  - If striker out: New batter at striker end
  - If non-striker out: New batter at non-striker end
- **Over End + Wicket**: New batter faces (doesn't swap)

---

### Rule 3: Wicket Logic

**Wicket Types**:
1. **Bowled**: Bowler hits stumps
2. **Caught**: Fielder catches ball
3. **LBW**: Leg Before Wicket
4. **Run Out**: Batsman fails to reach crease
5. **Stumped**: Wicketkeeper removes bails
6. **Hit Wicket**: Batsman hits own stumps
7. **Obstructing Field**: Batsman obstructs fielding
8. **Handled Ball**: Batsman handles ball

**Complex Cases**:

**Case 1: Caught**
```
- Striker is out
- New batter comes in at striker end
- Strike does NOT rotate (new batter faces)
- UNLESS: Over just ended → Then swap first, then new batter at non-striker
```

**Case 2: Run Out**
```
- Determine which batsman was out (striker or non-striker)
- If striker out:
  * New batter at striker end
  * Non-striker stays
- If non-striker out:
  * New batter at non-striker end
  * Striker stays
```

**Case 3: Stumped**
```
- Always striker out
- New batter at striker end
- Similar to caught
```

**Implementation**:
```typescript
if (ball.wicket?.is_out) {
  const isStrikerOut = ball.wicket.player_id === currentStrikerId;
  
  if (ball.wicket.type === 'run_out') {
    // Special handling based on which batsman
    if (isStrikerOut) {
      // New batter at striker end
      striker_id = getNextBatter();
    } else {
      // New batter at non-striker end
      non_striker_id = getNextBatter();
    }
  } else {
    // All other dismissals: striker is out
    striker_id = getNextBatter();
    // Strike doesn't rotate (new batter faces)
  }
  
  wickets++;
}
```

---

### Rule 4: Free Hit

**Trigger**: Previous ball was a No-Ball

**Rules**:
- Next ball is a "Free Hit"
- Can only be out via:
  - Run Out
  - Handling Ball
  - Obstructing Field
- All other dismissals are not out (but runs still count)

**Implementation**:
```typescript
let isFreeHit = false;

// Check previous ball
const previousBall = getLastBall();
if (previousBall?.extras?.type === 'nb') {
  isFreeHit = true;
}

if (isFreeHit && ball.wicket?.is_out) {
  const allowedDismissals = ['run_out', 'handled_ball', 'obstructing_field'];
  if (!allowedDismissals.includes(ball.wicket.type)) {
    // Not out! Runs still count
    ball.wicket.is_out = false;
    // Don't increment wickets
  }
}
```

---

### Rule 5: Over Completion

**When**: 6 legal balls bowled

**Actions**:
1. Reset `balls_in_over` to 0
2. Increment `overs`
3. Swap striker and non-striker
4. Change bowler (if needed - depends on bowling rules)

**Implementation**:
```typescript
if (isLegalDelivery(ball) && balls_in_over === 6) {
  balls_in_over = 0;
  overs++;
  
  // Swap batsmen
  [striker_id, non_striker_id] = [non_striker_id, striker_id];
  
  // Optional: Change bowler (if 10 overs per bowler rule)
  // bowler_id = getNextBowler();
}
```

---

## 🛠️ Technical Implementation Plan

### Task 1: Type Definitions & Core Utilities

**Files to Create**:
- `src/types/cricket.ts` - All TypeScript interfaces
- `src/lib/cricket/rules.ts` - Cricket rules engine
- `src/lib/cricket/calculations.ts` - Score calculation utilities
- `src/lib/cricket/undo.ts` - Undo logic

**Key Functions**:
```typescript
// Calculate score updates from a ball
function calculateBallUpdates(ball: BallDocument, currentState: MatchState): MatchUpdates

// Reverse a ball (for undo)
function reverseBallUpdates(ball: BallDocument): MatchUpdates

// Check if strike should rotate
function shouldRotateStrike(runs: number, ballsInOver: number): boolean

// Validate wicket on free hit
function validateFreeHitWicket(ball: BallDocument, isFreeHit: boolean): boolean
```

---

### Task 2: Firebase Schema & Services

**Files to Create**:
- `src/lib/firebase/players.ts` - Player pool operations
- `src/lib/firebase/matches.ts` - Match CRUD operations
- `src/lib/firebase/balls.ts` - Ball document operations

**Key Functions**:
```typescript
// Player Pool
async function searchPlayers(query: string): Promise<Player[]>
async function addPlayerToPool(name: string): Promise<Player>
async function addPlayerToSquad(matchId: string, team: 'team_a' | 'team_b', playerId: string): Promise<void>

// Matches
async function createMatch(data: CreateMatchData): Promise<Match>
async function getLiveMatch(): Promise<Match | null>
async function updateMatchState(matchId: string, updates: Partial<Match>): Promise<void>

// Balls
async function addBall(matchId: string, inningsId: string, ball: BallDocument): Promise<void>
async function getLastBall(matchId: string, inningsId: string): Promise<BallDocument | null>
async function deleteLastBall(matchId: string, inningsId: string): Promise<void>
```

---

### Task 3: React Hooks & State Management

**Files to Create**:
- `src/hooks/useCricketScorer.ts` - Main scoring hook
- `src/hooks/useMatchState.ts` - Match state management
- `src/hooks/usePlayerPool.ts` - Player search hook

**Key Hook**:
```typescript
function useCricketScorer(matchId: string) {
  const [matchState, setMatchState] = useState<Match | null>(null);
  
  const addBall = async (ballData: BallInput) => {
    // 1. Create ball document with pre_ball_state
    // 2. Calculate updates
    // 3. Update match document
    // 4. Write to Firestore
  };
  
  const undoLastBall = async () => {
    // 1. Fetch last ball
    // 2. Reverse calculations
    // 3. Update match document
    // 4. Delete ball document
  };
  
  return { matchState, addBall, undoLastBall };
}
```

---

### Task 4: UI Components

**Components to Build**:
- `SquadSelector.tsx` - Player search and selection
- `TossSelector.tsx` - Toss interface
- `OpeningPlayersSelector.tsx` - Select striker, non-striker, bowler
- `ScoringInterface.tsx` - Main scoring buttons
- `LiveScoreboard.tsx` - Real-time score display
- `MatchSetupWizard.tsx` - Multi-step setup flow

---

### Task 5: Real-time Synchronization

**Implementation**:
- Firestore listeners on `matches/{id}`
- Real-time updates for all viewers
- Optimistic UI updates
- Conflict resolution (if multiple scorers)

---

## 🎯 Critical Success Factors

### 1. Data Consistency
- ✅ Event sourcing ensures single source of truth
- ✅ Pre-ball state snapshots enable deterministic undo
- ✅ Immutable ball documents prevent corruption

### 2. Performance
- ✅ Denormalized `live_score` for fast reads
- ✅ Firestore listeners for real-time updates
- ✅ Efficient queries (indexed fields)

### 3. User Experience
- ✅ Mobile-first responsive design
- ✅ Large, tappable buttons
- ✅ Clear visual feedback
- ✅ Undo safety net

### 4. Cricket Accuracy
- ✅ Comprehensive rules engine
- ✅ Edge case handling
- ✅ Free hit logic
- ✅ Strike rotation accuracy

---

## 🚨 Potential Challenges & Solutions

### Challenge 1: Concurrent Scoring
**Problem**: Multiple users scoring simultaneously
**Solution**: 
- Single "scorer" role (one active scorer)
- Others are "viewers" (read-only)
- Or: Implement optimistic locking with Firestore transactions

### Challenge 2: Network Failures
**Problem**: Ball added but network fails
**Solution**:
- Optimistic UI updates
- Retry mechanism
- Queue failed operations

### Challenge 3: Complex Wicket Scenarios
**Problem**: Run out logic is complex
**Solution**:
- Clear UI to select which batsman was out
- Store `is_striker_out` flag in wicket object
- Comprehensive testing of edge cases

### Challenge 4: Over Calculation
**Problem**: Overs format (5.4 = 5 overs, 4 balls)
**Solution**:
- Store as `{ overs: 5, balls: 4 }`
- Convert to display format: `${overs}.${balls}`
- Handle carry-over when balls reach 6

---

## 📊 Data Flow Diagram

```
User Input (Tap [4 Runs])
    ↓
useCricketScorer Hook
    ↓
calculateBallUpdates() → Calculate score changes
    ↓
Capture pre_ball_state → Snapshot current state
    ↓
Create Ball Document → { runs: 4, pre_ball_state: {...} }
    ↓
Firestore Write → matches/{id}/innings/{id}/balls/{ball_id}
    ↓
Update Match Document → Increment totals, update stats
    ↓
Firestore Write → matches/{id}
    ↓
Firestore Listeners Trigger → All viewers update
    ↓
UI Updates → Real-time score display
```

---

## 🔐 Security Considerations

1. **Match Ownership**: Only creator can score
2. **Player Pool**: Global but user-specific matches
3. **Data Validation**: Server-side rules (Firestore Security Rules)
4. **Rate Limiting**: Prevent spam scoring

---

## 📱 Mobile Optimization

- Touch-friendly buttons (min 44x44px)
- Large score display
- Swipe gestures for navigation
- Offline capability (PWA)
- Fast loading (code splitting)

---

## 🧪 Testing Strategy

1. **Unit Tests**: Rules engine, calculations
2. **Integration Tests**: Firestore operations
3. **E2E Tests**: Complete scoring flow
4. **Edge Cases**: Free hits, run outs, over ends

---

## 📈 Scalability Considerations

- Firestore sub-collections for efficient queries
- Indexes on frequently queried fields
- Pagination for ball history (if needed)
- Caching for player pool

---

## ✅ Implementation Checklist

### Phase 1: Foundation
- [ ] Type definitions
- [ ] Firebase schema setup
- [ ] Rules engine
- [ ] Calculation utilities

### Phase 2: Match Setup
- [ ] Player pool management
- [ ] Squad selector UI
- [ ] Toss interface
- [ ] Opening players selector

### Phase 3: Scoring
- [ ] Scoring interface UI
- [ ] useCricketScorer hook
- [ ] Ball document creation
- [ ] Match state updates

### Phase 4: Undo
- [ ] Undo button
- [ ] Last ball retrieval
- [ ] State reversal logic
- [ ] Ball document deletion

### Phase 5: Real-time
- [ ] Firestore listeners
- [ ] Live scoreboard
- [ ] Viewer interface

### Phase 6: Polish
- [ ] Mobile optimization
- [ ] Error handling
- [ ] Loading states
- [ ] Animations

---

**Status**: ✅ Analysis Complete - Ready for Implementation

**Next Steps**: Begin with Task 1 (Type Definitions & Utilities)




