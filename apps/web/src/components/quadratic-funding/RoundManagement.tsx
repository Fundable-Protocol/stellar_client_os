"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

interface RoundManagementProps {
  adminToken: string;
}

/**
 * Admin interface for creating and managing quadratic funding rounds.
 */
export function RoundManagement({ adminToken }: RoundManagementProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({
    token: "",
    matchingPool: "",
    startTime: "",
    endTime: "",
    minContribution: "",
  });

  const handleCreateRound = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);

    try {
      const startTimestamp = new Date(formData.startTime).getTime() / 1000;
      const endTimestamp = new Date(formData.endTime).getTime() / 1000;

      const response = await fetch("/api/quadratic-funding/rounds", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          token: formData.token,
          matchingPool: formData.matchingPool,
          startTime: startTimestamp,
          endTime: endTimestamp,
          minContribution: formData.minContribution,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create round");
      }

      const data = await response.json();
      alert(`Round created successfully! ID: ${data.roundId}`);

      // Reset form
      setFormData({
        token: "",
        matchingPool: "",
        startTime: "",
        endTime: "",
        minContribution: "",
      });
    } catch (error) {
      console.error("Failed to create round:", error);
      alert("Failed to create funding round");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="rounded-lg border bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-xl font-bold">Create Quadratic Funding Round</h2>

      <form onSubmit={handleCreateRound} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Token Contract Address
          </label>
          <input
            type="text"
            required
            value={formData.token}
            onChange={(e) =>
              setFormData({ ...formData, token: e.target.value })
            }
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
            placeholder="GXXXXXX..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Matching Pool Amount (stroops)
          </label>
          <input
            type="text"
            required
            value={formData.matchingPool}
            onChange={(e) =>
              setFormData({ ...formData, matchingPool: e.target.value })
            }
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
            placeholder="10000000000"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Start Time
          </label>
          <input
            type="datetime-local"
            required
            value={formData.startTime}
            onChange={(e) =>
              setFormData({ ...formData, startTime: e.target.value })
            }
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            End Time
          </label>
          <input
            type="datetime-local"
            required
            value={formData.endTime}
            onChange={(e) =>
              setFormData({ ...formData, endTime: e.target.value })
            }
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Minimum Contribution (stroops)
          </label>
          <input
            type="text"
            required
            value={formData.minContribution}
            onChange={(e) =>
              setFormData({ ...formData, minContribution: e.target.value })
            }
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
            placeholder="1000000"
          />
        </div>

        <Button type="submit" disabled={isCreating} className="w-full">
          {isCreating ? "Creating..." : "Create Round"}
        </Button>
      </form>
    </div>
  );
}
