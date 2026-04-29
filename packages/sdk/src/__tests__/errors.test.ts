import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  parseContractError,
  FundableStellarError,
  executeWithErrorHandling,
  CONTRACT_ERRORS,
} from "../utils/errors";
import { xdr } from '@stellar/stellar-sdk';

describe("Error Handling Utilities", () => {
  describe("parseTransactionResultXdr", () => {
    it("parses contract error from transaction result XDR", () => {
      // Mock a transaction result with contract error
      const mockResult = xdr.TransactionResult.fromXDR(
        "AAAAAgAAAAEAAAACAAAAZAAACgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAEAAAAAAAAAA==",
        "base64"
      );
      
      const error = parseContractError({ resultXdr: mockResult.toXDR('base64') });
      
      expect(error.type).toBe("transaction_error");
      expect(error.message).toContain("Transaction execution failed");
      expect(error.suggestion).toBeDefined();
    });

    it("handles malformed XDR gracefully", () => {
      const error = parseContractError({ resultXdr: "invalid_xdr_string" });
      
      expect(error.type).toBe("transaction_error");
      expect(error.message).toContain("Failed to parse transaction result");
      expect(error.suggestion).toContain("corrupted or in an unexpected format");
    });
  });

  describe("parseSimulationError", () => {
    it("parses insufficient fee errors", () => {
      const error = parseContractError(new Error("insufficient fee for transaction"));
      
      expect(error.type).toBe("simulation_error");
      expect(error.message).toContain("Insufficient transaction fee");
      expect(error.suggestion).toContain("Increase the transaction fee");
    });

    it("parses insufficient balance errors", () => {
      const error = parseContractError(new Error("insufficient balance"));
      
      expect(error.type).toBe("simulation_error");
      expect(error.message).toContain("Insufficient account balance");
      expect(error.suggestion).toContain("enough XLM to cover fees");
    });

    it("parses XDR encoding errors", () => {
      const error = parseContractError(new Error("XDR decoding failed"));
      
      expect(error.type).toBe("simulation_error");
      expect(error.message).toContain("XDR encoding/decoding error");
      expect(error.suggestion).toContain("Check transaction format");
    });

    it("parses timeout errors", () => {
      const error = parseContractError(new Error("simulation timeout"));
      
      expect(error.type).toBe("simulation_error");
      expect(error.message).toContain("Simulation timeout");
      expect(error.suggestion).toContain("operation may be too complex");
    });
  });

  describe("parseContractError", () => {
    describe("with Error objects", () => {
      it("parses contract error code from Error message", () => {
        const error = new Error("Error: 5");
        const parsed = parseContractError(error);

        expect(parsed.type).toBe("contract_error");
        expect(parsed.code).toBe(5);
        expect(parsed.message).toBe(CONTRACT_ERRORS[5]);
      });

      it("handles various error code formats", () => {
        const testCases = [
          { message: "Error: 7", expectedCode: 7 },
          { message: "code: 7", expectedCode: 7 },
          { message: "exit: 7", expectedCode: 7 },
          { message: "Status code: 7", expectedCode: 7 },
        ];

        testCases.forEach(({ message, expectedCode }) => {
          const error = new Error(message);
          const parsed = parseContractError(error);
          expect(parsed.code).toBe(expectedCode);
          expect(parsed.type).toBe("contract_error");
        });
      });

      it("identifies simulation errors", () => {
        const error = new Error("Simulation failed: XDR decoding error");
        const parsed = parseContractError(error);

        expect(parsed.type).toBe("simulation_error");
        expect(parsed.message).toContain("simulation");
      });

      it("identifies transaction errors", () => {
        const error = new Error("Transaction execution failed");
        const parsed = parseContractError(error);

        expect(parsed.type).toBe("transaction_error");
        expect(parsed.message).toContain("execution");
      });

      it("returns unknown for unrecognized errors", () => {
        const error = new Error("Some random error");
        const parsed = parseContractError(error);

        expect(parsed.type).toBe("unknown");
        expect(parsed.message).toBe("Some random error");
      });
    });

    describe("with string errors", () => {
      it("parses contract error code from string", () => {
        const parsed = parseContractError("Error: 3");

        expect(parsed.type).toBe("contract_error");
        expect(parsed.code).toBe(3);
        expect(parsed.message).toContain("Unauthorized");
      });

      it("handles string with just error code", () => {
        const parsed = parseContractError("10");

        expect(parsed.type).toBe("contract_error");
        expect(parsed.code).toBe(10);
        expect(parsed.message).toContain("InsufficientWithdrawable");
      });
    });

    describe("with object errors", () => {
      it("parses error from object with code property", () => {
        const error = { code: 4, message: "Invalid amount provided" };
        const parsed = parseContractError(error);

        expect(parsed.type).toBe("contract_error");
        expect(parsed.code).toBe(4);
        expect(parsed.message).toContain("InvalidAmount");
      });

      it("parses transaction error from resultXdr", () => {
        const error = {
          resultXdr: "AAAACoAAAAB...",
        };
        const parsed = parseContractError(error);

        expect(parsed.type).toBe("transaction_error");
        expect(parsed.details).toContain("AAAACoAAAAB");
      });

      it("parses error from object message property", () => {
        const error = { message: "Error: 6" };
        const parsed = parseContractError(error);

        expect(parsed.type).toBe("contract_error");
        expect(parsed.code).toBe(6);
      });
    });

    describe("with null/undefined", () => {
      it("handles null gracefully", () => {
        const parsed = parseContractError(null);

        expect(parsed.type).toBe("unknown");
        expect(parsed.message).toContain("unknown");
      });

      it("handles undefined gracefully", () => {
        const parsed = parseContractError(undefined);

        expect(parsed.type).toBe("unknown");
        expect(parsed.message).toContain("unknown");
      });
    });
  });

  describe("FundableStellarError", () => {
    it("creates error from parsed error", () => {
      const parsed = parseContractError("Error: 5");
      const error = new FundableStellarError(parsed);

      expect(error).toBeInstanceOf(FundableStellarError);
      expect(error).toBeInstanceOf(Error);
      expect(error.code).toBe(5);
      expect(error.type).toBe("contract_error");
    });

    it("provides user-friendly message", () => {
      const parsed = parseContractError("Error: 5");
      const error = new FundableStellarError(parsed);

      const userMessage = error.getUserMessage();
      expect(userMessage).toContain("InvalidTimeRange");
      expect(userMessage).not.toContain("Code:");
    });

    it("provides user-friendly message with suggestion", () => {
      const parsed = parseContractError("Error: 5");
      const error = new FundableStellarError(parsed);

      const userMessage = error.getUserMessageWithSuggestion();
      expect(userMessage).toContain("InvalidTimeRange");
      expect(userMessage).toContain("💡");
      expect(userMessage).toContain("Verify that the end time is after the start time");
    });

    it("provides formatted toString output", () => {
      const parsed = parseContractError("Error: 5");
      const error = new FundableStellarError(parsed);

      const formatted = error.toString();
      expect(formatted).toContain("FundableStellarError");
      expect(formatted).toContain("InvalidTimeRange");
      expect(formatted).toContain("[Code: 5]");
      expect(formatted).toContain("Suggestion:");
    });

    it("includes operation context when available", () => {
      const parsed = parseContractError("Error: 3", "Create stream");
      const error = new FundableStellarError(parsed);

      const formatted = error.toString();
      expect(formatted).toContain("[Operation: Create stream]");
    });

    it("includes details in toString when available", () => {
      const parsed = parseContractError(new Error("Error: 5 - Extra details"));
      const error = new FundableStellarError(parsed);

      const formatted = error.toString();
      expect(formatted).toContain("Details:");
    });
  });

  describe("executeWithErrorHandling", () => {
    it("returns result on successful execution", async () => {
      const operation = async () => "success";

      const result = await executeWithErrorHandling(operation);

      expect(result).toBe("success");
    });

    it("wraps thrown errors as FundableStellarError", async () => {
      const operation = async () => {
        throw new Error("Error: 7");
      };

      try {
        await executeWithErrorHandling(operation);
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(FundableStellarError);
        expect((error as FundableStellarError).code).toBe(7);
      }
    });

    it("preserves error context", async () => {
      const operation = async () => {
        throw new Error("Error: 3");
      };

      try {
        await executeWithErrorHandling(operation, "Authorize operation");
        expect.fail("Should have thrown");
      } catch (error) {
        const fundableError = error as FundableStellarError;
        expect(fundableError.type).toBe("contract_error");
        expect(fundableError.message).toContain("Unauthorized");
        expect(fundableError.operation).toBe("Authorize operation");
      }
    });

    it("handles rejection with non-Error values", async () => {
      const operation = async () => {
        throw "string error";
      };

      try {
        await executeWithErrorHandling(operation);
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(FundableStellarError);
      }
    });

    it("provides operation context in error", async () => {
      const operation = async () => {
        throw new Error("Simulation failed");
      };

      try {
        await executeWithErrorHandling(operation, "Create stream");
        expect.fail("Should have thrown");
      } catch (error) {
        const fundableError = error as FundableStellarError;
        expect(fundableError.operation).toBe("Create stream");
        expect(fundableError.suggestion).toBeDefined();
      }
    });
  });

  describe("CONTRACT_ERRORS mapping", () => {
    it("contains all expected contract error codes", () => {
      // Verify all contract error codes are present
      for (let i = 1; i <= 16; i++) {
        expect(CONTRACT_ERRORS[i]).toBeDefined();
        expect(typeof CONTRACT_ERRORS[i]).toBe("string");
      }
    });

    it("has descriptive messages for each error", () => {
      for (const [code, message] of Object.entries(CONTRACT_ERRORS)) {
        expect(message.length).toBeGreaterThan(0);
        // Messages should include both code name and description
        expect(message).toMatch(/^[A-Za-z]+\s*-\s*/);
      }
    });

    it("maps specific errors correctly", () => {
      expect(CONTRACT_ERRORS[1]).toContain("AlreadyInitialized");
      expect(CONTRACT_ERRORS[3]).toContain("Unauthorized");
      expect(CONTRACT_ERRORS[5]).toContain("InvalidTimeRange");
      expect(CONTRACT_ERRORS[10]).toContain("InsufficientWithdrawable");
      expect(CONTRACT_ERRORS[15]).toContain("ArithmeticOverflow");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Integration tests with realistic scenarios
  // ─────────────────────────────────────────────────────────────────────────

  describe("Integration scenarios", () => {
    it("handles payment stream authorization error", () => {
      const error = parseContractError(new Error("Error: 3"), "Create stream");

      expect(error.code).toBe(3);
      expect(error.message).toContain("Unauthorized");
      expect(error.type).toBe("contract_error");
      expect(error.operation).toBe("Create stream");
      expect(error.suggestion).toContain("correct account with proper permissions");
    });

    it("handles invalid amount error in distribution", () => {
      const error = parseContractError(new Error("Error: 4"), "Distribute tokens");

      expect(error.code).toBe(4);
      expect(error.message).toContain("InvalidAmount");
      expect(error.suggestion).toContain("positive and within valid range");
    });

    it("handles stream not found error", () => {
      const error = parseContractError(new Error("Error: 6"), "Get stream details");

      expect(error.code).toBe(6);
      expect(error.message).toContain("StreamNotFound");
      expect(error.suggestion).toContain("stream ID is correct");
    });

    it("handles multiple consecutive errors", () => {
      const errors = [
        new Error("Error: 1"),
        new Error("Error: 7"),
        new Error("Error: 12"),
      ];

      const parsed = errors.map((e) => parseContractError(e));

      expect(parsed[0].code).toBe(1);
      expect(parsed[1].code).toBe(7);
      expect(parsed[2].code).toBe(12);

      expect(parsed[0].message).toContain("AlreadyInitialized");
      expect(parsed[1].message).toContain("StreamNotActive");
      expect(parsed[2].message).toContain("FeeTooHigh");
    });

    it("handles XDR parsing errors gracefully", () => {
      const error = parseContractError({
        resultXdr: "AAAA...invalid_xdr",
        message: "Transaction failed",
      });

      expect(error.type).toBe("transaction_error");
      expect(error.message).toContain("Failed to parse transaction result");
      expect(error.suggestion).toBeDefined();
    });
  });
});
