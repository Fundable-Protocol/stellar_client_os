import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from "next/server";
import { POST } from "./route";
import { VideoAnchorService } from "@/services/video-anchor.service";
import crypto from "crypto";

// Mock the VideoAnchorService
vi.mock("@/services/video-anchor.service", () => {
  return {
    VideoAnchorService: vi.fn().mockImplementation(() => {
      return {
        anchorVideoProof: vi.fn().mockResolvedValue({
          tx: { hash: () => Buffer.from("mocked-hash-buffer") }
        })
      };
    })
  };
});

describe("POST /api/campaign-verification/stream", () => {
  let mockStream: ReadableStream;
  const mockVideoData = "dummy-video-data-chunk";
  
  beforeEach(() => {
    // Create a mock readable stream
    mockStream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(mockVideoData));
        controller.close();
      }
    });
    vi.clearAllMocks();
  });

  it("should return 401 if unauthorized", async () => {
    const req = new NextRequest("http://localhost:3000/api/campaign-verification/stream", {
      method: "POST",
      body: mockStream,
      // @ts-ignore
      duplex: "half",
      headers: {
        "authorization": "Bearer invalid-token",
        "x-campaign-id": "camp-123",
        "x-verifier-id": "ver-456",
      }
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Unauthorized");
  });

  it("should return 400 if missing metadata", async () => {
    const req = new NextRequest("http://localhost:3000/api/campaign-verification/stream", {
      method: "POST",
      body: mockStream,
      // @ts-ignore
      duplex: "half",
      headers: {
        "authorization": "Bearer valid-verifier-token",
        "x-campaign-id": "camp-123",
      }
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Missing campaignId or verifierId");
  });

  it("should return 400 if body is empty", async () => {
    const emptyStream = new ReadableStream({
      start(controller) {
        controller.close();
      }
    });
    const req = new NextRequest("http://localhost:3000/api/campaign-verification/stream", {
      method: "POST",
      body: emptyStream,
      // @ts-ignore
      duplex: "half",
      headers: {
        "authorization": "Bearer valid-verifier-token",
        "x-campaign-id": "camp-123",
        "x-verifier-id": "ver-456",
      }
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Empty video stream");
  });

  it("should process stream and submit anchor transaction", async () => {
    const req = new NextRequest("http://localhost:3000/api/campaign-verification/stream", {
      method: "POST",
      body: mockStream,
      // @ts-ignore
      duplex: "half",
      headers: {
        "authorization": "Bearer valid-verifier-token",
        "x-campaign-id": "camp-123",
        "x-verifier-id": "ver-456",
      }
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    
    expect(json.success).toBe(true);
    expect(json.txHash).toBe("6d6f636b65642d686173682d627566666572"); // "mocked-hash-buffer" in hex
    expect(json.proof.campaignId).toBe("camp-123");
    expect(json.proof.verifierId).toBe("ver-456");
    expect(json.proof.videoHash).toBeDefined();
    expect(json.proof.timestamp).toBeDefined();

    const expectedHash = crypto.createHash("sha256").update(mockVideoData).digest("hex");
    expect(json.proof.videoHash).toBe(expectedHash);
  });
});
