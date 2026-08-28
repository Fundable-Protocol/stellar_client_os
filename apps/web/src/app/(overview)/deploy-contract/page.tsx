import DeployContract from "@/components/modules/deploy-contract/DeployContract";

export default function DeployContractPage() {
  return (
    <div className="mx-auto w-full py-6 sm:py-10 h-full overflow-y-auto pb-24 md:pb-6">
      <h1 className="text-2xl sm:text-3xl font-bold text-zinc-50 mb-6 px-4 md:px-0">
        Deploy Smart Contract
      </h1>
      <div className="px-4 md:px-0">
        <DeployContract />
      </div>
    </div>
  );
}
