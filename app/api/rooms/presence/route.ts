import { type NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";

// Types
type ParticipantData = {
  userId: string;
  peerId: string;
  timestamp: number;
};

// Constants
const PRESENCE_TIMEOUT = 120000; // 2 minutes
const ROOM_EXPIRY = 5 * 24 * 60 * 60; // 5 days

// Schema for presence data
const presenceSchema = z.object({
  roomId: z.string(),
  userId: z.string().optional(),
  peerId: z.string(),
  timestamp: z.number(),
});

// Schema for delete request
const deletePresenceSchema = z.object({
  roomId: z.string(),
  userId: z.string(),
});

// Helper functions
const getRoomKey = (roomId: string) => `room:${roomId}:participants`;

const parseParticipantData = (data: string | null): ParticipantData | null => {
  if (!data) return null;
  try {
    return typeof data === 'string' ? JSON.parse(data) : data;
  } catch {
    return null;
  }
};

// Get participants in a room
export async function GET(request: NextRequest) {
  try {
    const roomId = request.nextUrl.searchParams.get("roomId");
    if (!roomId) {
      return NextResponse.json(
        { success: false, error: "Room ID is required" },
        { status: 400 }
      );
    }

    const participants = await redis.hgetall(getRoomKey(roomId)) || {};
    const now = Date.now();

    const activeParticipants = Object.entries(participants as Record<string, string>)
      .map(([userId, data]) => {
        const participant = parseParticipantData(data);
        if (!participant || now - participant.timestamp >= PRESENCE_TIMEOUT) {
          return null;
        }
        return {
          userId,
          peerId: participant.peerId,
          timestamp: participant.timestamp,
        };
      })
      .filter((participant): participant is NonNullable<typeof participant> => participant !== null);

    return NextResponse.json({
      success: true,
      participants: activeParticipants,
    });
  } catch (error) {
    console.error("Error getting room participants:", error);
    return NextResponse.json(
      { success: false, error: "Failed to get room participants" },
      { status: 500 }
    );
  }
}

// Register presence in a room
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = presenceSchema.parse(body);

    const userId = validatedData.userId || uuidv4();
    const roomId = validatedData.roomId;

    const participantData: ParticipantData = {
      userId,
      peerId: validatedData.peerId,
      timestamp: validatedData.timestamp,
    };

    // Use pipeline for atomic operations
    const pipeline = redis.pipeline();
    pipeline.hset(getRoomKey(roomId), { [userId]: JSON.stringify(participantData) });
    pipeline.expire(getRoomKey(roomId), ROOM_EXPIRY);
    await pipeline.exec();

    return NextResponse.json({ 
      success: true,
      userId
    });
  } catch (error) {
    console.error("Error registering presence:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Invalid request data", details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: "Failed to register presence" },
      { status: 500 }
    );
  }
}

// Remove presence from a room
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = deletePresenceSchema.parse(body);

    await redis.hdel(getRoomKey(validatedData.roomId), validatedData.userId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing presence:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Invalid request data", details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: "Failed to remove presence" },
      { status: 500 }
    );
  }
}
