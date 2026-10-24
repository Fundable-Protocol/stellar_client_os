export interface BackerRewardPerk {
  id: string;
  campaignId: string;
  title: string;
  description: string;
  estimatedDeliveryDate: string;
  quantityLimit: number;
  claimedCount: number;
  pledgeAmount?: string;
  shippingType?: 'digital' | 'physical' | 'none';
  createdAt: string;
  updatedAt: string;
}

export interface CreateRewardPerkInput {
  title: string;
  description: string;
  estimatedDeliveryDate: string;
  quantityLimit: number;
  pledgeAmount?: string;
  shippingType?: 'digital' | 'physical' | 'none';
}

export interface UpdateRewardPerkInput extends Partial<CreateRewardPerkInput> {
  claimedCount?: number;
}
