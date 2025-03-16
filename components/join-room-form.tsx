"use client"

import type React from "react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AlertCircle } from "lucide-react"

export default function JoinRoomForm() {
  const [roomId, setRoomId] = useState("")
  const [isCreating, setIsCreating] = useState(false)
  const [isJoining, setIsJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!roomId.trim()) return

    setIsJoining(true)
    setError(null)

    try {
      // Validate room before joining
      const response = await fetch(`/api/rooms/validate?roomId=${roomId}`)
      const data = await response.json()

      if (!data.valid) {
        if (data.reason === "expired") {
          setError("This room has expired.")
        } else if (data.reason === "inactive") {
          setError("This room is no longer active.")
        } else {
          setError("Room not found. Please check the room ID and try again.")
        }
        setIsJoining(false)
        return
      }

      // Room is valid, navigate to it
      router.push(`/room/${roomId}`)
    } catch (error) {
      console.error("Error joining room:", error)
      setError("Failed to join room. Please try again.")
      setIsJoining(false)
    }
  }

  const handleCreateRoom = async () => {
    setIsCreating(true)
    setError(null)

    try {
      // Create a new room via API
      const response = await fetch("/api/rooms", {
        method: "POST",
      })

      if (!response.ok) {
        throw new Error("Failed to create room")
      }

      const data = await response.json()
      router.push(`/room/${data.roomId}`)
    } catch (error) {
      console.error("Error creating room:", error)
      setError("Failed to create room. Please try again.")
      setIsCreating(false)
    }
  }

  return (
    <div className="w-full max-w-md mx-auto bg-background rounded-lg p-6 shadow-lg">
      <h2 className="text-xl font-semibold mb-6 text-center">Join a Room</h2>

      {error && (
        <div className="bg-red-900/20 border border-red-800 text-red-300 px-4 py-3 rounded-lg mb-4 flex items-start">
          <AlertCircle className="h-5 w-5 mr-2 mt-0.5 flex-shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      <form onSubmit={handleJoinRoom} className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="roomId" className="text-sm font-medium text-gray-300">
            Room ID
          </label>
          <Input
            id="roomId"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            placeholder="Enter room ID"
            className="bg-[#2a2a2a] border-[#333] text-white placeholder:text-gray-500"
            required
          />
        </div>

        <div className="flex flex-col space-y-3">
          <Button
            type="submit"
            className="bg-green-600 hover:bg-green-700 text-white"
            disabled={!roomId.trim() || isJoining || isCreating}
          >
            {isJoining ? "Joining..." : "Join Room"}
          </Button>

          <div className="relative my-2">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-[#333]" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-[#1e1e1e] px-2 text-gray-400">Or</span>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            className="bg-[#2a2a2a] border-[#333] hover:bg-[#333] text-white"
            onClick={handleCreateRoom}
            disabled={isCreating || isJoining}
          >
            {isCreating ? "Creating..." : "Create New Room"}
          </Button>
        </div>
      </form>
    </div>
  )
}

