import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = (await params).id;
    
    // In a real implementation, we would handle multipart/form-data video streaming here.
    // For now (v1), we will accept JSON with a video URL or a mock stream payload, 
    // and return a mock immutable proof (e.g., a transaction hash representing the blockchain anchor).

    const body = await request.json();
    const { videoUrl, verifierId, locationCoordinates } = body;

    if (!videoUrl || !verifierId) {
      return NextResponse.json(
        { error: 'Missing required fields: videoUrl, verifierId' },
        { status: 400 }
      );
    }

    // Mock processing delay for video chunking/streaming
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Mock blockchain transaction hash for immutable proof
    const mockTxHash = `0x${Array.from({length: 64}, () => Math.floor(Math.random()*16).toString(16)).join('')}`;
    const timestamp = new Date().toISOString();

    return NextResponse.json({
      success: true,
      message: 'Video verification stream successfully anchored to blockchain',
      data: {
        campaignId: id,
        verifierId,
        timestamp,
        locationCoordinates: locationCoordinates || 'Unknown',
        blockchainProof: {
          network: 'Stellar',
          transactionHash: mockTxHash,
          status: 'CONFIRMED'
        }
      }
    });
  } catch (error) {
    console.error('Error processing verification stream:', error);
    return NextResponse.json(
      { error: 'Internal server error processing video stream' },
      { status: 500 }
    );
  }
}
