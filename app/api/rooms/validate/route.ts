import { type NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// Mark this route as dynamic to prevent static generation
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const roomId = searchParams.get("roomId");

    if (!roomId) {
      return NextResponse.json(
        { error: "Room ID is required" },
        { status: 400 }
      );
    }

    // Find room in database
    const room = await prisma.room.findUnique({
      where: { roomId },
    });

    if (!room) {
      return NextResponse.json({ valid: false, reason: "not_found" });
    }

    // Check if room is expired
    if (new Date() > room.expiresAt) {
      return NextResponse.json({ valid: false, reason: "expired" });
    }

    // Check if room is active
    if (!room.active) {
      return NextResponse.json({ valid: false, reason: "inactive" });
    }

    return NextResponse.json({
      valid: true,
      roomId: room.roomId,
      expiresAt: room.expiresAt,
    });
  } catch (error) {
    console.error("Error validating room:", error);
    return NextResponse.json(
      { error: "Failed to validate room" },
      { status: 500 }
    );
  }
}
