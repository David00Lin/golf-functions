export interface Opts {
  carry: boolean;
  birdieReverse: boolean;
  truncate: boolean;
  push: boolean;
  olympic: boolean;
}

export interface Group {
  id: string;
  name: string;
  member_names: string[];
  mode: 3 | 4;
}
