import React from 'react';
import { CampaignBudgetBreakdown as BudgetType, BudgetItem } from '@/services/campaignBudget';

interface CampaignBudgetBreakdownProps {
  budget: BudgetType;
  currency?: string;
}

export const CampaignBudgetBreakdown: React.FC<CampaignBudgetBreakdownProps> = ({
  budget,
  currency = 'XLM',
}) => {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Budget Breakdown & Cost Transparency</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">Verified itemized allocation of raised funds</p>
        </div>
        <div className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          Cost Per Tree: {budget.costPerTree.toFixed(2)} {currency}
        </div>
      </div>

      <div className="space-y-4">
        {budget.items.map((item: BudgetItem) => (
          <div key={item.id} className="space-y-1.5">
            <div className="flex items-center justify-between text-sm font-medium">
              <span className="text-gray-700 dark:text-gray-300">{item.category}</span>
              <span className="text-gray-900 dark:text-white">
                {item.amount.toLocaleString()} {currency} ({item.percentage.toFixed(1)}%)
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                style={{ width: ${Math.min(100, Math.max(0, item.percentage))}% }}
              />
            </div>
            {item.description && (
              <p className="text-xs text-gray-500 dark:text-gray-400">{item.description}</p>
            )}
          </div>
        ))}
      </div>

      <div className="mt-6 border-t border-gray-100 pt-4 dark:border-gray-800 flex justify-between text-sm font-semibold text-gray-900 dark:text-white">
        <span>Total Estimated Budget</span>
        <span>{budget.totalBudget.toLocaleString()} {currency}</span>
      </div>
    </div>
  );
};
