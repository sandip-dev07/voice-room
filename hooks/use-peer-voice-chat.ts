"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import Peer from "peerjs";

type PeerConnection = {
  peerId: string;
  call: any;
  audio: HTMLAudioElement | null;
  type: "audio";
};

type RoomParticipant = {
  userId: string;
  peerId: string;
  timestamp: number;
};

export function usePeerVoiceChat(roomId: string) {
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [participants, setParticipants] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const peerRef = useRef<Peer | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const userIdRef = useRef<string>(uuidv4().substring(0, 8));
  const peersRef = useRef<Map<string, PeerConnection>>(new Map());
  const roomPrefixRef = useRef<string>(`voicechat-${roomId}-`);
  const audioElementsCallbackRef = useRef<
    ((id: string, audio: HTMLAudioElement) => void) | null
  >(null);
  const presenceIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const participantPollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize PeerJS and WebRTC connections
  useEffect(() => {
    let mounted = true;

    const initializeVoiceChat = async () => {
      try {
        setIsLoading(true);

        // Get local audio stream
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });

        if (!mounted) return;
        localStreamRef.current = stream;

        // Create a unique peer ID for this user in this room
        const peerId = `${roomPrefixRef.current}${userIdRef.current}`;

        // Initialize PeerJS
        const peer = new Peer(peerId, {
          debug: 3, // Increase debug level for more verbose logging
          config: {
            iceServers: [
              { urls: "stun:stun.l.google.com:19302" },
              { urls: "stun:stun1.google.com:19302" },
              { urls: "stun:stun2.google.com:19302" },
              // Add TURN servers for better NAT traversal
              {
                urls: "turn:global.turn.twilio.com:3478?transport=udp",
                username:
                  "f4b4035eaa76f4a55de5f4351567653ee4ff6fa97b50b6b334fcc1be9c27212d",
                credential: "w1WpauEsFbEK+oFkxC/mEZ48bQlPwjnl1xoQgkA0vTw=",
              },
            ],
            sdpSemantics: "unified-plan",
          },
        });

        peerRef.current = peer;

        // Handle peer open event
        peer.on("open", (id) => {
          console.log("Connected to PeerJS server with ID:", id);
          setIsConnected(true);
          setIsLoading(false);

          // Announce presence to other peers via server
          broadcastPresence();

          // Start polling for participants
          startParticipantPolling();
        });

        // Handle incoming calls
        peer.on("call", (call) => {
          console.log(
            "Received call from:",
            call.peer,
            "with metadata:",
            call.metadata
          );

          // Answer with our audio stream
          console.log("Answering audio call with local stream");
          call.answer(localStreamRef.current!);

          // Extract the user ID from the peer ID
          let callerId = call.peer.replace(roomPrefixRef.current, "");

          // Handle incoming stream
          call.on("stream", (remoteStream) => {
            console.log(`Received audio stream from:`, callerId);

            // Handle incoming audio
            const audio = new Audio();
            audio.srcObject = remoteStream;
            audio.autoplay = true;
            audio.setAttribute("playsinline", "true");
            audio.muted = false;

            // Try to play immediately
            const playPromise = audio.play();
            if (playPromise !== undefined) {
              playPromise.catch((err) => {
                console.error("Error playing audio:", err);
                // Try again after a short delay
                setTimeout(() => {
                  audio
                    .play()
                    .catch((e) =>
                      console.error("Retry error playing audio:", e)
                    );
                }, 1000);
              });
            }

            // Store the peer connection
            peersRef.current.set(callerId, {
              peerId: call.peer,
              call,
              audio,
              type: "audio",
            });

            // Add to participants
            setParticipants((prev) => {
              if (!prev.includes(callerId)) {
                return [...prev, callerId];
              }
              return prev;
            });

            // Register audio element for volume control
            if (audioElementsCallbackRef.current) {
              audioElementsCallbackRef.current(callerId, audio);
            }
          });

          // Handle call close
          call.on("close", () => {
            console.log(`Audio call closed with:`, callerId);

            // Clean up audio
            const peer = peersRef.current.get(callerId);
            if (peer && peer.audio) {
              peer.audio.srcObject = null;
            }
            peersRef.current.delete(callerId);

            // Remove from participants
            setParticipants((prev) => prev.filter((id) => id !== callerId));
          });

          // Handle call errors
          call.on("error", (err) => {
            console.error(`Audio call error with`, callerId, ":", err);
            setError(`Call error: ${err.message || "Unknown error"}`);
          });
        });

        // Handle peer errors
        peer.on("error", (err) => {
          console.error("Peer error:", err);
          setError(`Connection error: ${err.message || "Unknown error"}`);
          setIsLoading(false);
        });

        // Handle peer disconnection
        peer.on("disconnected", () => {
          console.log("Disconnected from PeerJS server");
          setIsConnected(false);

          // Try to reconnect
          peer.reconnect();
        });

        // Handle peer close
        peer.on("close", () => {
          console.log("PeerJS connection closed");
          setIsConnected(false);
        });
      } catch (err) {
        console.error("Error initializing voice chat:", err);
        setError(
          `Failed to initialize voice chat: ${
            err instanceof Error ? err.message : "Unknown error"
          }`
        );
        setIsLoading(false);
      }
    };

    // Broadcast presence to server
    const broadcastPresence = async () => {
      if (!peerRef.current) return;

      try {
        // Send presence to server API
        await fetch("/api/rooms/presence", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            roomId,
            userId: userIdRef.current,
            peerId: `${roomPrefixRef.current}${userIdRef.current}`,
            timestamp: Date.now(),
          }),
        });

        console.log("Presence broadcast to server");
      } catch (error) {
        console.error("Error broadcasting presence:", error);
      }
    };

    // Poll for participants from server
    const startParticipantPolling = () => {
      // Initial fetch
      fetchParticipants();

      // Set up interval for polling - increase to 10 seconds from 5 seconds
      participantPollingIntervalRef.current = setInterval(
        fetchParticipants,
        10000
      );
    };

    // Fetch participants from server
    const fetchParticipants = async () => {
      if (!peerRef.current) return;

      // Add timestamp to prevent browser caching
      const timestamp = Date.now();

      try {
        const response = await fetch(
          `/api/rooms/presence?roomId=${encodeURIComponent(
            roomId
          )}&_t=${timestamp}`
        );
        if (!response.ok) {
          throw new Error("Failed to fetch participants");
        }

        const data = await response.json();

        if (data.success && Array.isArray(data.participants)) {
          // Filter out our own ID and get only userIds
          const otherParticipants = data.participants
            .filter((p: RoomParticipant) => p.userId !== userIdRef.current)
            .map((p: RoomParticipant) => p.userId);

          // Only call new peers we're not already connected to
          otherParticipants.forEach((participantId: string) => {
            if (!peersRef.current.has(participantId)) {
              const participantData = data.participants.find(
                (p: RoomParticipant) => p.userId === participantId
              );

              if (participantData) {
                callPeer(participantData.peerId, participantData.userId);
              }
            }
          });
        }
      } catch (error) {
        console.error("Error fetching participants:", error);
      }
    };

    // Call a peer
    const callPeer = (peerId: string, userId: string) => {
      if (!peerRef.current || !localStreamRef.current) return;

      console.log("Calling peer:", peerId);

      // Call the peer
      const call = peerRef.current.call(peerId, localStreamRef.current);

      // Handle incoming stream
      call.on("stream", (remoteStream) => {
        console.log("Received stream from:", userId);

        // Create audio element for remote stream
        const audio = new Audio();
        audio.srcObject = remoteStream;
        audio.autoplay = true;
        audio.setAttribute("playsinline", "true");
        audio.muted = false;

        // Try to play immediately
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch((err) => {
            console.error("Error playing audio:", err);
            // Try again after a short delay
            setTimeout(() => {
              audio
                .play()
                .catch((e) => console.error("Retry error playing audio:", e));
            }, 1000);
          });
        }

        // Store the peer connection
        peersRef.current.set(userId, {
          peerId,
          call,
          audio,
          type: "audio",
        });

        // Add to participants
        setParticipants((prev) => {
          if (!prev.includes(userId)) {
            return [...prev, userId];
          }
          return prev;
        });

        // Register audio element for volume control
        if (audioElementsCallbackRef.current) {
          audioElementsCallbackRef.current(userId, audio);
        }
      });

      // Handle call close
      call.on("close", () => {
        console.log("Call closed with:", userId);

        // Clean up
        const peer = peersRef.current.get(userId);
        if (peer && peer.audio) {
          peer.audio.srcObject = null;
        }
        peersRef.current.delete(userId);

        // Remove from participants
        setParticipants((prev) => prev.filter((id) => id !== userId));
      });

      // Handle call errors
      call.on("error", (err) => {
        console.error("Call error with", userId, ":", err);
      });
    };

    // Start the voice chat
    initializeVoiceChat();

    // Periodically broadcast presence to server
    presenceIntervalRef.current = setInterval(broadcastPresence, 60000);

    return () => {
      mounted = false;

      // Clean up
      if (presenceIntervalRef.current) {
        clearInterval(presenceIntervalRef.current);
      }

      if (participantPollingIntervalRef.current) {
        clearInterval(participantPollingIntervalRef.current);
      }

      // Remove presence from server
      fetch(`/api/rooms/presence`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          roomId,
          userId: userIdRef.current,
        }),
      }).catch((err) => console.error("Error removing presence:", err));

      // Close PeerJS connection
      if (peerRef.current) {
        peerRef.current.destroy();
      }

      // Stop local stream
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }

      // Close all peer connections
      peersRef.current.forEach((peer) => {
        if (peer.call) {
          peer.call.close();
        }
        if (peer.audio) {
          peer.audio.srcObject = null;
        }
      });

      peersRef.current.clear();
    };
  }, [roomId]);

  // Handle mute/unmute
  useEffect(() => {
    if (localStreamRef.current) {
      const tracks = localStreamRef.current.getAudioTracks();
      tracks.forEach((track) => {
        const wasEnabled = track.enabled;
        track.enabled = !isMuted;
        console.log(
          `Audio track ${track.id} changed from ${wasEnabled} to ${!isMuted}`
        );
      });

      if (tracks.length === 0) {
        console.warn("No audio tracks found in local stream");
      }
    } else {
      console.warn("Local stream not available for mute/unmute");
    }
  }, [isMuted]);

  // Toggle mute
  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const newMuted = !prev;
      console.log(`Setting microphone muted: ${newMuted}`);

      // Immediately apply to all audio tracks
      if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach((track) => {
          track.enabled = !newMuted;
          console.log(`Audio track ${track.id} enabled: ${!newMuted}`);
        });
      }

      return newMuted;
    });
  }, []);

  // Disconnect from the room
  const disconnect = useCallback(() => {
    // Remove presence from server
    fetch(`/api/rooms/presence`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        roomId,
        userId: userIdRef.current,
      }),
    }).catch((err) => console.error("Error removing presence:", err));

    // Clear intervals
    if (presenceIntervalRef.current) {
      clearInterval(presenceIntervalRef.current);
    }

    if (participantPollingIntervalRef.current) {
      clearInterval(participantPollingIntervalRef.current);
    }

    // Close PeerJS connection
    if (peerRef.current) {
      peerRef.current.destroy();
    }

    // Stop local stream
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    // Close all peer connections
    peersRef.current.forEach((peer) => {
      if (peer.call) {
        peer.call.close();
      }
      if (peer.audio) {
        peer.audio.srcObject = null;
      }
    });

    peersRef.current.clear();
    setIsConnected(false);
    setParticipants([]);
  }, [roomId]);

  // Register callback for audio elements
  const registerAudioElementsCallback = useCallback(
    (callback: (id: string, audio: HTMLAudioElement) => void) => {
      audioElementsCallbackRef.current = callback;

      // Register existing audio elements
      peersRef.current.forEach((peer, id) => {
        if (peer.type === "audio" && peer.audio) {
          callback(id, peer.audio);
        }
      });
    },
    []
  );

  return {
    isConnected,
    isMuted,
    error,
    participants,
    userId: userIdRef.current,
    toggleMute,
    disconnect,
    isLoading,
    registerAudioElementsCallback,
  };
}
