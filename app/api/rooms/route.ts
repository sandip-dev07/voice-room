import { type NextRequest, NextResponse } from "next/server"
import { v4 as uuidv4 } from "uuid"
import { addDays } from "date-fns"
import prisma from "@/lib/prisma"

// Create a new room
export async function POST() {
  try {
    // Generate a short room ID (8 characters)
    const roomId = uuidv4().substring(0, 8)

    // Set expiration date to 5 days from now
    const expiresAt = addDays(new Date(), 5)

    // Create room in database
    const room = await prisma.room.create({
      data: {
        roomId,
        expiresAt,
        active: true,
      },
    })

    return NextResponse.json({ roomId: room.roomId })
  } catch (error) {
    console.error("Error creating room:", error)
    return NextResponse.json({ error: "Failed to create room" }, { status: 500 })
  }
}

// Get room by ID
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const roomId = searchParams.get("roomId")

    if (!roomId) {
      return NextResponse.json({ error: "Room ID is required" }, { status: 400 })
    }

    // Find room in database
    const room = await prisma.room.findUnique({
      where: { roomId },
    })

    if (!room) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 })
    }

    // Check if room is expired
    if (new Date() > room.expiresAt || !room.active) {
      return NextResponse.json({ error: "Room has expired", expired: true }, { status: 410 })
    }

    return NextResponse.json({
      roomId: room.roomId,
      expiresAt: room.expiresAt,
    })
  } catch (error) {
    console.error("Error getting room:", error)
    return NextResponse.json({ error: "Failed to get room" }, { status: 500 })
  }
}

