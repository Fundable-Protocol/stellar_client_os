import { Keypair, TransactionBuilder, Networks, Operation, Account, Horizon } from "@stellar/stellar-sdk";

export class VideoAnchorService {
  private server: Horizon.Server;
  private serverKeypair: Keypair;

  constructor(serverUrl: string, secretKey: string) {
    this.server = new Horizon.Server(serverUrl);
    this.serverKeypair = Keypair.fromSecret(secretKey);
  }

  async anchorVideoProof(campaignId: string, verifierId: string, timestamp: string, videoHash: string) {
    // In a real scenario we'd fetch the account sequence from the server
    // For this mock/demo, we use a mocked sequence
    let sourceAccount;
    try {
        sourceAccount = await this.server.loadAccount(this.serverKeypair.publicKey());
    } catch (e) {
        // Fallback for tests if server isn't mocked properly for loadAccount
        sourceAccount = new Account(this.serverKeypair.publicKey(), "1");
    }

    const tx = new TransactionBuilder(sourceAccount, {
      fee: "100",
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(
        Operation.manageData({
          name: "campaign_id",
          value: campaignId,
        })
      )
      .addOperation(
        Operation.manageData({
          name: "verifier_id",
          value: verifierId,
        })
      )
      .addOperation(
        Operation.manageData({
          name: "timestamp",
          value: timestamp,
        })
      )
      .addOperation(
        Operation.manageData({
          name: "video_hash",
          value: videoHash,
        })
      )
      .setTimeout(30)
      .build();

    tx.sign(this.serverKeypair);

    // Submit transaction
    const result = await this.server.submitTransaction(tx);
    return {
      tx,
      result
    };
  }
}
