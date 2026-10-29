import {
  Address,
  Operation,
  TransactionBuilder,
  nativeToScVal,
  xdr,
} from "@stellar/stellar-sdk";
import { Api, Server as RpcServer, assembleTransaction } from "@stellar/stellar-sdk/rpc";

import { getStellarServerOptions } from "@/utils/rpc-connection-options";

interface ClaimCampaignRefundParams {
  contractId: string;
  contributor: string;
  campaignId: bigint;
  networkPassphrase: string;
  rpcUrl: string;
  signTransaction: (xdr: string) => Promise<string>;
}

export async function claimCampaignRefund({
  contractId,
  contributor,
  campaignId,
  networkPassphrase,
  rpcUrl,
  signTransaction,
}: ClaimCampaignRefundParams): Promise<string> {
  const server = new RpcServer(rpcUrl, getStellarServerOptions(rpcUrl));
  const account = await server.getAccount(contributor);
  const transaction = new TransactionBuilder(account, {
    fee: "1000",
    networkPassphrase,
  })
    .addOperation(
      Operation.invokeHostFunction({
        func: xdr.HostFunction.hostFunctionTypeInvokeContract(
          new xdr.InvokeContractArgs({
            contractAddress: new Address(contractId).toScAddress(),
            functionName: "claim_refund",
            args: [
              new Address(contributor).toScVal(),
              nativeToScVal(campaignId, { type: "u64" }),
            ],
          }),
        ),
        auth: [],
      }),
    )
    .setTimeout(60)
    .build();

  const simulation = await server.simulateTransaction(transaction);
  if (Api.isSimulationError(simulation)) {
    throw new Error(`Refund simulation failed: ${simulation.error}`);
  }

  const preparedTransaction = assembleTransaction(transaction, simulation).build();
  const signedXdr = await signTransaction(preparedTransaction.toXDR());
  const signedTransaction = TransactionBuilder.fromXDR(signedXdr, networkPassphrase);
  const submitted = await server.sendTransaction(signedTransaction);
  if (submitted.status === "ERROR") {
    throw new Error("Refund transaction submission failed.");
  }

  let result = await server.getTransaction(submitted.hash);
  for (let attempt = 0; result.status === Api.GetTransactionStatus.NOT_FOUND && attempt < 30; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    result = await server.getTransaction(submitted.hash);
  }

  if (result.status !== Api.GetTransactionStatus.SUCCESS) {
    throw new Error(`Refund transaction failed with status ${result.status}.`);
  }
  return submitted.hash;
}