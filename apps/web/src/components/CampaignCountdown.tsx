import React, { useState, useEffect } from 'react';

interface CampaignCountdownProps {
  targetDate: string | Date;
}

export const CampaignCountdown: React.FC<CampaignCountdownProps> = ({ targetDate }) => {
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
    isExpired: false,
  });

  useEffect(() => {
    const calculateTimeLeft = () => {
      const difference = new Date(targetDate).getTime() - new Date().getTime();

      if (difference <= 0) {
        return { days: 0, hours: 0, minutes: 0, seconds: 0, isExpired: true };
      }

      return {
        days: Math.floor(difference / (1000 * 60 * 60 * 24)),
        hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
        minutes: Math.floor((difference / 1000 / 60) % 60),
        seconds: Math.floor((difference / 1000) % 60),
        isExpired: false,
      };
    };

    setTimeLeft(calculateTimeLeft());
    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 1000);

    return () => clearInterval(timer);
  }, [targetDate]);

  if (timeLeft.isExpired) {
    return (
      <div className="font-bold text-gray-500 bg-gray-100 p-4 rounded-md text-center">
        Campaign Ended
      </div>
    );
  }

  const isUrgent = timeLeft.days === 0 && timeLeft.hours < 24;

  return (
    <div className={`p-4 rounded-md text-center ${isUrgent ? 'text-red-600 font-bold bg-red-50' : 'text-gray-800 bg-blue-50'}`}>
      <div className="text-sm uppercase tracking-wide mb-1">Time Remaining</div>
      <div className="flex justify-center gap-4 text-2xl">
        <div>
          <span>{timeLeft.days}</span>
          <span className="text-xs block text-gray-500">Days</span>
        </div>
        <div>
          <span>{timeLeft.hours.toString().padStart(2, '0')}</span>
          <span className="text-xs block text-gray-500">Hours</span>
        </div>
        <div>
          <span>{timeLeft.minutes.toString().padStart(2, '0')}</span>
          <span className="text-xs block text-gray-500">Mins</span>
        </div>
        <div>
          <span>{timeLeft.seconds.toString().padStart(2, '0')}</span>
          <span className="text-xs block text-gray-500">Secs</span>
        </div>
      </div>
    </div>
  );
};
