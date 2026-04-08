export interface Opts {
  carry: boolean;
  birdieReverse: boolean;
  truncate: boolean;
  push: boolean;
  olympic: boolean;
  handicap: boolean;
}

export interface Group {
  id: string;
  name: string;
  member_names: string[];
  mode: 3 | 4;
}

export interface LeaderboardEntry {
  player_name: string;
  total_pts: number;
  session_count: number;
  last_played: string | null;
}
