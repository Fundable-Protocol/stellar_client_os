import FeatureCard from "./FeatureCard";

const FeatureCards = () => {
  const stream =
    "Set up automated crypto payments once, run forever. Handle subscriptions, salaries, and recurring transfers automatically on Stellar.";

  const balances =
    "View all your Stellar token balances in one place. Track your XLM and custom tokens with real-time updates and easy-to-read formatting.";

  const referrals =
    "Invite planters to the platform and earn 2 XLM for each referred planter who completes their first job. Share your unique link to get started.";

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(20rem,1fr))] gap-4 md:gap-8">
      <FeatureCard
        title="Payment Stream"
        linkText="Create Stream"
        description={stream}
        link="/payment-stream"
      />
      <FeatureCard
        title="My Balances"
        linkText="View Balances"
        description={balances}
        link="/balances"
      />
      <FeatureCard
        title="Referrals"
        linkText="Invite Planters"
        description={referrals}
        link="/social"
      />
    </div>
  );
};

export default FeatureCards;
