"use client";

import React, { useState, useEffect } from "react";
import { Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface CampaignCountdownProps {
  endDate: string;
}

export function CampaignCountdown({ endDate }: CampaignCountdownProps) {
  const [timeLeft, setTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
  } | null>(null);

  useEffect(() => {
    const calculateTimeLeft = () => {
      const end = new Date(endDate).getTime();
      const now = Date.now();
      const difference = end - now;

      if (difference <= 0) {
        return { days: 0, hours: 0, minutes: 0, seconds: 0 };
      }

      return {
        days: Math.floor(difference / (1000 * 60 * 60 * 24)),
        hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
        minutes: Math.floor((difference / 1000 / 60) % 60),
        seconds: Math.floor((difference / 1000) % 60),
      };
    };

    setTimeLeft(calculateTimeLeft());

    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 1000);

    return () => clearInterval(timer);
  }, [endDate]);

  if (!timeLeft) return null;

  const isExpired =
    timeLeft.days === 0 &&
    timeLeft.hours === 0 &&
    timeLeft.minutes === 0 &&
    timeLeft.seconds === 0;

  if (isExpired) {
    return (
      <Badge variant="outline" className="border-rose-500/40 text-rose-400 text-[10px]">
        <Clock className="mr-1 h-3 w-3 inline" /> Expired
      </Badge>
    );
  }

  const isUrgent = timeLeft.days < 3; // Highlight urgency if less than 3 days

  return (
    <Badge
      variant="outline"
      className={`${
        isUrgent
          ? "border-amber-500/40 text-amber-400"
          : "border-blue-500/40 text-blue-400"
      } text-[10px]`}
    >
      <Clock className="mr-1 h-3 w-3 inline" />
      {timeLeft.days > 0 ? (
        <span>
          {timeLeft.days}d {timeLeft.hours}h left
        </span>
      ) : (
        <span>
          {timeLeft.hours}h {timeLeft.minutes}m left
        </span>
      )}
    </Badge>
  );
}
