"use client";

import React, { useState } from "react";

const milestones = [
  { id: 1, title: "Pending", description: "Tree sponsorship confirmed, waiting for planting." },
  { id: 2, title: "Planted", description: "Tree has been planted in the ground." },
  { id: 3, title: "First photo", description: "Initial growth photo captured." },
  { id: 4, title: "Verified", description: "Tree vitality verified by oracle." },
  { id: 5, title: "1-year milestone", description: "Tree has reached 1 year of healthy growth." }
];

export const TreeMilestoneTimeline: React.FC = () => {
  const [currentStep, setCurrentStep] = useState(2); // Example: currently at "First photo" index

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 mb-8">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-white">Tree Lifecycle Timeline</h3>
        <p className="text-sm text-zinc-400">Track your sponsored tree's journey.</p>
      </div>
      <div className="relative">
        <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-zinc-800" />
        <div className="space-y-6">
          {milestones.map((milestone, index) => {
            const isCompleted = index <= currentStep;
            const isCurrent = index === currentStep;
            return (
              <div
                key={milestone.id}
                className={`relative flex items-start pl-12 cursor-pointer transition-opacity ${
                  isCompleted ? "opacity-100" : "opacity-50"
                }`}
                onClick={() => setCurrentStep(index)}
              >
                <div
                  className={`absolute left-2.5 top-1 h-3.5 w-3.5 rounded-full border-2 transform -translate-x-1/2 ${
                    isCompleted
                      ? "bg-green-500 border-green-500"
                      : "bg-zinc-900 border-zinc-600"
                  } ${isCurrent ? "ring-4 ring-green-500/20" : ""}`}
                />
                <div>
                  <h4 className={`text-base font-medium ${isCompleted ? "text-white" : "text-zinc-400"}`}>
                    {milestone.title}
                  </h4>
                  <p className="text-sm text-zinc-500 mt-1">{milestone.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
