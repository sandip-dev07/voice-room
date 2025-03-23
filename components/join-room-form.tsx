"use client";

import type React from "react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertCircle,
  Plus,
  LogIn,
  RefreshCw,
  History,
  Merge,
} from "lucide-react";
import {
  getClientLastRoom,
  setClientLastRoom,
  removeClientLastRoom,
} from "@/lib/client-cookies";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export default function JoinRoomForm() {
  const [roomId, setRoomId] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRoom, setLastRoom] = useState<{
    id: string;
    name?: string;
  } | null>(null);
  const router = useRouter();

  useEffect(() => {
    // Check for last joined room on component mount
    const savedRoom = getClientLastRoom();
    if (savedRoom) {
      // Validate room before showing it
      fetch(`/api/rooms/validate?roomId=${savedRoom.id}`)
        .then((response) => response.json())
        .then((data) => {
          if (data.valid) {
            setLastRoom({
              id: savedRoom.id,
              name: data.roomName || savedRoom.name,
            });
          } else {
            // If room is invalid, remove it from cookies
            removeClientLastRoom();
          }
        })
        .catch(() => {
          // On error, remove the room from cookies
          removeClientLastRoom();
        });
    }
  }, []);

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomId.trim()) return;

    setIsJoining(true);
    setError(null);

    try {
      // Validate room before joining
      const response = await fetch(`/api/rooms/validate?roomId=${roomId}`);
      const data = await response.json();

      if (!data.valid) {
        if (data.reason === "expired") {
          setError("This room has expired.");
        } else if (data.reason === "inactive") {
          setError("This room is no longer active.");
        } else {
          setError("Room not found. Please check the room ID and try again.");
        }
        setIsJoining(false);
        return;
      }

      // Store the room in cookies
      setClientLastRoom(roomId, data.roomName);

      // Update last room state
      setLastRoom({
        id: roomId,
        name: data.roomName,
      });

      // Room is valid, navigate to it
      router.push(`/room/${roomId}`);
    } catch (error) {
      console.error("Error joining room:", error);
      setError("Failed to join room. Please try again.");
      setIsJoining(false);
    }
  };

  const handleCreateRoom = async () => {
    setIsCreating(true);
    setError(null);

    try {
      // Create a new room via API
      const response = await fetch("/api/rooms", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to create room");
      }

      const data = await response.json();

      // Store the room in cookies
      setClientLastRoom(data.roomId, data.name);

      // Update last room state
      setLastRoom({
        id: data.roomId,
        name: data.name,
      });

      router.push(`/room/${data.roomId}`);
    } catch (error) {
      console.error("Error creating room:", error);
      setError("Failed to create room. Please try again.");
      setIsCreating(false);
    }
  };

  const handleContinueLastRoom = async () => {
    if (!lastRoom) return;

    setIsJoining(true);
    setError(null);

    try {
      // Validate room before continuing
      const response = await fetch(`/api/rooms/validate?roomId=${lastRoom.id}`);
      const data = await response.json();

      if (!data.valid) {
        if (data.reason === "expired") {
          setError("This room has expired.");
        } else if (data.reason === "inactive") {
          setError("This room is no longer active.");
        } else {
          setError("Room not found. Please try another room.");
        }
        // Remove invalid room
        removeClientLastRoom();
        setLastRoom(null);
        setIsJoining(false);
        return;
      }

      router.push(`/room/${lastRoom.id}`);
    } catch (error) {
      console.error("Error continuing to last room:", error);
      setError("Failed to join room. Please try again.");
      setIsJoining(false);
    }
  };

  // Generate avatar URL from room ID or name
  const getAvatarUrl = (id: string, name?: string) => {
    const seed = name || id;
    return `https://avatar.vercel.sh/${encodeURIComponent(seed)}?size=80`;
  };

  return (
    <div className="flex flex-col h-screen ">
      <div className="min-w-[400px] mx-auto flex flex-col justify-center h-full">
        {/* Header with App Logo */}
        <div className="flex justify-between items-center mb-8 bg-[#1e1e1e]/80 backdrop-blur-sm rounded-[8px] p-3 shadow-md border border-green-900/20">
          <div className="flex items-center space-x-3">
            <Avatar
              className={cn(
                "h-7 w-7 rounded-[8px] shadow-md transition-all duration-300 overflow-hidden"
              )}
            >
              <AvatarImage src={"/logo.jpg"} alt={""} />
              <AvatarFallback className="h-8 w-8 rounded-[8px] bg-background">
                M
              </AvatarFallback>
            </Avatar>
            <div className="text-sm font-medium bg-gradient-to-r from-green-400 to-emerald-500 bg-clip-text text-transparent">
              Voice Chat
            </div>
          </div>

          {/* Refresh Button */}
          <Button
            variant="ghost"
            size="sm"
            className="rounded-[8px] h-7 w-7 p-0 flex items-center justify-center hover:bg-gray-700/50"
            onClick={() => window.location.reload()}
          >
            <RefreshCw size={14} />
          </Button>
        </div>

        <div className="w-full bg-[#1e1e1e]/90 backdrop-blur-md rounded-[8px] p-6 shadow-2xl border border-green-900/30">
          <h2 className="text-xl font-bold mb-6 text-center bg-gradient-to-r from-green-400 to-emerald-500 bg-clip-text text-transparent">
            Join a Voice Chat Room
          </h2>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-300 px-4 py-3 rounded-[8px] mb-6 flex items-start">
              <AlertCircle className="h-5 w-5 mr-2 mt-0.5 flex-shrink-0" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          <form onSubmit={handleJoinRoom} className="space-y-5">
            <div className="space-y-2">
              <label
                htmlFor="roomId"
                className="text-sm font-medium text-gray-300"
              >
                Room ID
              </label>
              <Input
                id="roomId"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                placeholder="Enter room ID"
                className="bg-[#252525] border-gray-800 text-white placeholder:text-gray-500 focus:border-green-600/50 focus:ring-green-600/20 rounded-[8px]"
                required
              />
            </div>

            <div className="flex flex-col space-y-4">
              <Button
                type="submit"
                className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-medium py-2 rounded-[8px] shadow-lg transition-all duration-300"
                disabled={!roomId.trim() || isJoining || isCreating}
              >
                {isJoining ? (
                  <div className="flex items-center">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-[8px] animate-spin mr-2"></div>
                    Joining...
                  </div>
                ) : (
                  <div className="flex items-center">
                    <Merge size={16} className="mr-2" />
                    Join Room
                  </div>
                )}
              </Button>

              <div className="relative my-2">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-gray-800" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-[#1e1e1e] px-2 text-gray-400">Or</span>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                className="bg-[#252525] border-gray-800 hover:bg-[#2a2a2a] text-white font-medium py-2 rounded-[8px] shadow-md transition-all duration-300"
                onClick={handleCreateRoom}
                disabled={isCreating || isJoining}
              >
                {isCreating ? (
                  <div className="flex items-center">
                    <div className="w-4 h-4 border-2 border-green-400 border-t-transparent rounded-[8px] animate-spin mr-2"></div>
                    Creating...
                  </div>
                ) : (
                  <div className="flex items-center">
                    <Plus size={16} className="mr-2 text-green-400" />
                    Create New Room
                  </div>
                )}
              </Button>
            </div>
          </form>

          {lastRoom && (
            <div className="mt-6 bg-[#252525] rounded-[8px] p-4 border border-gray-800">
              <p className="text-sm text-gray-400 mb-3">Recent Room</p>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <History size={15} />
                  <div className="text-sm text-gray-300 font-medium">
                    <span>Rejoin : </span>
                    {lastRoom.id}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="bg-green-500/20 text-green-400 hover:bg-green-500/30 hover:text-green-300 rounded-lg px-3"
                  onClick={handleContinueLastRoom}
                  disabled={isJoining || isCreating}
                >
                  Continue
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
