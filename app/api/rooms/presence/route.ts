import { type NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { z } from "zod";

// In-memory cache for faster access
const presenceCache = new Map<
  string,
  {
    userId: string;
    peerId: string;
    timestamp: number;
    lastUpdated: number; // Track when this entry was last updated
  }[]
>();

// Cache for room existence checks to avoid repeated DB queries
const roomExistenceCache = new Map<
  string,
  {
    exists: boolean;
    expiresAt: number; // Cache expiration timestamp
  }
>();

// Schema for presence data
const presenceSchema = z.object({
  roomId: z.string(),
  userId: z.string(),
  peerId: z.string(),
  timestamp: z.number(),
});

// Schema for delete request
const deletePresenceSchema = z.object({
  roomId: z.string(),
  userId: z.string(),
});

// Cache TTL in milliseconds (5 minutes)
const CACHE_TTL = 5 * 60 * 1000;

// Rate limiting map
const rateLimitMap = new Map<string, number>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 120; // 2 requests per second on average

// Check if a room exists (with caching)
async function roomExists(roomId: string): Promise<boolean> {
  // Check cache first
  const cachedResult = roomExistenceCache.get(roomId);
  const now = Date.now();

  if (cachedResult && cachedResult.expiresAt > now) {
    return cachedResult.exists;
  }

  // Cache miss or expired, query the database
  try {
    const room = await prisma.room.findUnique({
      where: { roomId },
      select: { id: true }, // Only select the ID field for efficiency
    });

    const exists = !!room;

    // Cache the result
    roomExistenceCache.set(roomId, {
      exists,
      expiresAt: now + CACHE_TTL,
    });

    return exists;
  } catch (error) {
    console.error("Error checking room existence:", error);
    return false;
  }
}

// Rate limiting function
function checkRateLimit(key: string): boolean {
  const now = Date.now();

  // Clean up old entries
  for (const [entryKey, timestamp] of Array.from(rateLimitMap.entries())) {
    if (now - timestamp > RATE_LIMIT_WINDOW) {
      rateLimitMap.delete(entryKey);
    }
  }

  // Count requests for this key in the current window
  let count = 0;
  for (const [entryKey, timestamp] of Array.from(rateLimitMap.entries())) {
    if (entryKey.startsWith(key) && now - timestamp <= RATE_LIMIT_WINDOW) {
      count++;
    }
  }

  // Check if rate limit exceeded
  if (count >= MAX_REQUESTS_PER_WINDOW) {
    return false;
  }

  // Add this request to the map
  const requestKey = `${key}:${now}`;
  rateLimitMap.set(requestKey, now);
  return true;
}

// Get participants in a room
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const roomId = searchParams.get("roomId");

    if (!roomId) {
      return NextResponse.json(
        { success: false, error: "Room ID is required" },
        { status: 400 }
      );
    }

    // Apply rate limiting
    const clientIp = request.headers.get("x-forwarded-for") || "unknown";
    const rateKey = `get:${clientIp}:${roomId}`;

    if (!checkRateLimit(rateKey)) {
      return NextResponse.json(
        { success: false, error: "Rate limit exceeded" },
        { status: 429 }
      );
    }

    // Get participants from cache
    let participants = presenceCache.get(roomId) || [];

    // Only check room existence if cache is empty (first request)
    if (participants.length === 0) {
      const exists = await roomExists(roomId);
      if (!exists) {
        return NextResponse.json(
          { success: false, error: "Room not found" },
          { status: 404 }
        );
      }
    }

    // Clean up stale participants (older than 2 minutes) and remove duplicates
    const now = Date.now();
    participants = participants
      .filter((p) => now - p.timestamp < 120000)
      .filter((p, index, self) => 
        index === self.findIndex((t) => t.userId === p.userId)
      );

    // Update cache
    presenceCache.set(roomId, participants);

    // Return only necessary data to reduce payload size
    const simplifiedParticipants = participants.map((p) => ({
      userId: p.userId,
      peerId: p.peerId,
      timestamp: p.timestamp,
    }));

    return NextResponse.json({
      success: true,
      participants: simplifiedParticipants,
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
    // Check if request has a body
    const contentType = request.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      return NextResponse.json(
        { success: false, error: "Content-Type must be application/json" },
        { status: 400 }
      );
    }

    // Clone the request to read the body twice if needed
    const clonedRequest = request.clone();
    const body = await clonedRequest.json();

    // Validate request body
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, error: "Invalid request body" },
        { status: 400 }
      );
    }

    const validatedData = presenceSchema.parse(body);

    // Apply rate limiting
    const clientIp = request.headers.get("x-forwarded-for") || "unknown";
    const rateKey = `post:${clientIp}:${validatedData.roomId}:${validatedData.userId}`;

    if (!checkRateLimit(rateKey)) {
      return NextResponse.json(
        { success: false, error: "Rate limit exceeded" },
        { status: 429 }
      );
    }

    // Check if room exists (only on first presence update)
    const roomId = validatedData.roomId;
    const userId = validatedData.userId;

    // Get current participants
    let participants = presenceCache.get(roomId) || [];

    // Remove any existing entries for this user (prevent duplicates)
    participants = participants.filter((p) => p.userId !== userId);

    // Add new presence data
    const now = Date.now();
    participants.push({
      userId: validatedData.userId,
      peerId: validatedData.peerId,
      timestamp: validatedData.timestamp,
      lastUpdated: now,
    });

    // Update cache
    presenceCache.set(roomId, participants);

    return NextResponse.json({ success: true });
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

    // Apply rate limiting
    const clientIp = request.headers.get("x-forwarded-for") || "unknown";
    const rateKey = `delete:${clientIp}:${validatedData.roomId}:${validatedData.userId}`;

    if (!checkRateLimit(rateKey)) {
      return NextResponse.json(
        { success: false, error: "Rate limit exceeded" },
        { status: 429 }
      );
    }

    // Get current participants
    let participants = presenceCache.get(validatedData.roomId) || [];

    // Remove the user's presence
    participants = participants.filter(
      (p) => p.userId !== validatedData.userId
    );

    // Update cache
    presenceCache.set(validatedData.roomId, participants);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing presence:", error);
    return NextResponse.json(
      { success: false, error: "Failed to remove presence" },
      { status: 500 }
    );
  }
}
