/**
 * Allbridge service stub for offramp bridge operations
 */
export const allbridgeService = {
  getBridgeQuote: async () => ({}),
  buildBridgeTransaction: async () => "",
  handleBumpIfNeeded: async () => false,
  submitTransaction: async () => "",
  getTransferStatus: async () => ({ status: "completed" }),
};
