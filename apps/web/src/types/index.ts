export enum StreamStatus {
  Active = 'Active',
  Paused = 'Paused',
  Canceled = 'Canceled',
  Completed = 'Completed',
}

export interface Stream {
  id: number; // u64 in rust, usually safe as number in JS unless very large, then bigint/string
  sender: string; // Address
  recipient: string; // Address
  token: string; // Address
  total_amount: bigint; // i128
  withdrawn_amount: bigint; // i128
  start_time: number; // u64
  end_time: number; // u64
  status: StreamStatus;
  delegateAddress?: string | null; // Delegate address for withdrawal rights
}

export enum CampaignStatus {
  Draft = 'Draft',
  Active = 'Active',
  Completed = 'Completed',
  Canceled = 'Canceled',
}

export interface Campaign {
  id: number;
  creator: string; // Address
  species: string;
  goal_amount: bigint;
  raised_amount: bigint;
  start_time: number;
  end_time: number;
  status: CampaignStatus;
}

export interface CloneCampaignInput {
  sourceCampaignId: number;
}