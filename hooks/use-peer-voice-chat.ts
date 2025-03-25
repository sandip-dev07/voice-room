"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import Peer from "peerjs";

type PeerConnection = {
  peerId: string;
  call: any;
  audio: HTMLAudioElement | null;
  type: "audio";
  connectionQuality: "good" | "fair" | "poor";
  screenStream?: MediaStream | null;
  screenVideo?: HTMLVideoElement | null;
  screenCall?: any;
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
  const [networkQuality, setNetworkQuality] = useState<
    "good" | "fair" | "poor"
  >("good");
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [activeScreenShare, setActiveScreenShare] = useState<{
    userId: string;
    stream: MediaStream;
  } | null>(null);

  const peerRef = useRef<Peer | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const userIdRef = useRef<string>("");
  const peersRef = useRef<Map<string, PeerConnection>>(new Map());
  const roomPrefixRef = useRef<string>(`voicechat-${roomId}-`);
  const audioElementsCallbackRef = useRef<
    ((id: string, audio: HTMLAudioElement) => void) | null
  >(null);
  const presenceIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const participantPollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);
  const maxReconnectAttempts = 3;

  // Initialize userId on client side
  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedUserId = localStorage.getItem(`voicechat-userid-${roomId}`);
      if (!storedUserId) {
        const newUserId = uuidv4().substring(0, 8);
        localStorage.setItem(`voicechat-userid-${roomId}`, newUserId);
        userIdRef.current = newUserId;
      } else {
        userIdRef.current = storedUserId;
      }
    }
  }, [roomId]);

  // Store user ID in localStorage when it's first created
  useEffect(() => {
    if (typeof window !== "undefined" && userIdRef.current) {
      localStorage.setItem(`voicechat-userid-${roomId}`, userIdRef.current);
    }
  }, [roomId]);

  // Toggle mute function
  const toggleMute = useCallback(() => {
    if (!localStreamRef.current) return;

    const audioTracks = localStreamRef.current.getAudioTracks();
    audioTracks.forEach((track) => {
      track.enabled = !isMuted;
    });

    setIsMuted((prev) => !prev);
  }, [isMuted]);

  // Call a peer
  const callPeer = useCallback((peerId: string, userId: string) => {
    if (!peerRef.current || !localStreamRef.current) return;

    // Don't call if we already have a connection
    if (peersRef.current.has(userId)) return;

    console.log(`Calling peer: ${peerId}`);
    const call = peerRef.current.call(peerId, localStreamRef.current);

    // Handle call stream
    call.on("stream", (remoteStream) => {
      console.log(`Received stream from:`, userId);

      // Check if this is a screen share stream
      if (remoteStream.getVideoTracks().length > 0) {
        setActiveScreenShare({ userId, stream: remoteStream });
        return;
      }

      // Handle audio stream as before
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
        connectionQuality: "good",
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
      console.log(`Audio call closed with:`, userId);

      // Clean up audio
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
      console.error(`Audio call error with`, userId, ":", err);
      setError(`Call error: ${err.message || "Unknown error"}`);
    });
  }, []);

  // Fetch participants from server
  const fetchParticipants = useCallback(async () => {
    if (!peerRef.current) return;

    try {
      const response = await fetch(`/api/rooms/presence?roomId=${roomId}`);
      const data = await response.json();

      if (!data.success) {
        console.error("Failed to fetch participants:", data.error);
        return;
      }

      // Update participants list - filter out duplicates and own ID
      const currentParticipants = data.participants
        .filter((p: RoomParticipant) => p.userId !== userIdRef.current) // Remove own ID
        .filter(
          (p: RoomParticipant, index: number, self: RoomParticipant[]) =>
            index === self.findIndex((t) => t.userId === p.userId) // Remove duplicates
        )
        .map((p: RoomParticipant) => p.userId);

      setParticipants(currentParticipants);

      // Call new participants
      currentParticipants.forEach((participantId: string) => {
        const participant = data.participants.find(
          (p: RoomParticipant) => p.userId === participantId
        );
        if (
          participant &&
          participant.peerId !== peerRef.current?.id &&
          !peersRef.current.has(participantId)
        ) {
          callPeer(participant.peerId, participantId);
        }
      });
    } catch (error) {
      console.error("Error fetching participants:", error);
    }
  }, [roomId, callPeer]);

  // Start polling for participants
  const startParticipantPolling = useCallback(() => {
    // Initial fetch
    fetchParticipants();

    // Set up interval for polling
    participantPollingIntervalRef.current = setInterval(
      fetchParticipants,
      10000
    );
  }, [fetchParticipants]);

  // Cleanup function
  const disconnect = useCallback(() => {
    // Cleanup function
    const cleanup = () => {
      // Remove presence from server
      fetch(`/api/rooms/presence`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, userId: userIdRef.current }),
      }).catch((err) => console.error("Error removing presence:", err));

      // Clear intervals
      if (presenceIntervalRef.current)
        clearInterval(presenceIntervalRef.current);
      if (participantPollingIntervalRef.current)
        clearInterval(participantPollingIntervalRef.current);

      // Close all peer connections
      peersRef.current.forEach((peer) => {
        if (peer.audio) {
          peer.audio.srcObject = null;
          peer.audio.pause();
          peer.audio = null;
        }
        if (peer.call) peer.call.close();
      });
      peersRef.current.clear();

      // Close peer connection
      if (peerRef.current) {
        peerRef.current.destroy();
        peerRef.current = null;
      }

      // Stop local stream
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
        localStreamRef.current = null;
      }

      // Close audio context
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }

      // Remove user ID from localStorage
      localStorage.removeItem(`voicechat-userid-${roomId}`);

      // Reset states
      setIsConnected(false);
      setParticipants([]);
      setError(null);
      setIsLoading(false);

      // Stop screen sharing if active
      if (screenStream) {
        screenStream.getTracks().forEach((track) => track.stop());
        setScreenStream(null);
        setIsScreenSharing(false);
        setActiveScreenShare(null);
      }
    };

    cleanup();
  }, [roomId, screenStream]);

  // Register callback for audio elements
  const registerAudioElementsCallback = useCallback(
    (callback: (id: string, audio: HTMLAudioElement) => void) => {
      audioElementsCallbackRef.current = callback;
    },
    []
  );

  // Broadcast presence to server
  const broadcastPresence = useCallback(async () => {
    if (!peerRef.current) return;

    try {
      const presenceData = {
        roomId,
        userId: userIdRef.current,
        peerId: `${roomPrefixRef.current}${userIdRef.current}`,
        timestamp: Date.now(),
      };

      // Send presence to server API
      const response = await fetch("/api/rooms/presence", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(presenceData),
      });

      if (!response.ok) {
        const error = await response.json();
        console.error("Error broadcasting presence:", error);
      } else {
        console.log("Presence broadcast to server");
      }
    } catch (error) {
      console.error("Error broadcasting presence:", error);
    }
  }, [roomId]);

  // Monitor network quality
  const monitorNetworkQuality = useCallback(() => {
    if (!peerRef.current) return;

    const checkConnectionQuality = () => {
      const connections = peerRef.current?.connections;
      if (!connections) return;

      let totalQuality = 0;
      let connectionCount = 0;

      Object.values(connections).forEach((conns: any) => {
        conns.forEach((conn: any) => {
          if (conn.open) {
            const stats = conn.getStats();
            stats.forEach((stat: any) => {
              if (
                stat.type === "candidate-pair" &&
                stat.state === "succeeded"
              ) {
                // Calculate quality based on RTT and packet loss
                const rtt = stat.currentRoundTripTime || 0;
                const packetLoss = stat.packetsLost || 0;
                const totalPackets = stat.packetsSent || 1;
                const lossRate = packetLoss / totalPackets;

                let quality = 1;
                if (rtt > 300) quality -= 0.3; // High latency
                if (lossRate > 0.1) quality -= 0.3; // High packet loss
                if (rtt > 500) quality -= 0.4; // Very high latency
                if (lossRate > 0.2) quality -= 0.4; // Very high packet loss

                totalQuality += Math.max(0, quality);
                connectionCount++;
              }
            });
          }
        });
      });

      if (connectionCount > 0) {
        const averageQuality = totalQuality / connectionCount;
        const newQuality =
          averageQuality > 0.7
            ? "good"
            : averageQuality > 0.4
            ? "fair"
            : "poor";
        setNetworkQuality(newQuality);

        // Adjust audio quality based on network conditions
        if (localStreamRef.current) {
          const audioTrack = localStreamRef.current.getAudioTracks()[0];
          if (audioTrack) {
            const constraints = audioTrack.getConstraints();
            const newConstraints = {
              ...constraints,
              sampleRate:
                newQuality === "poor"
                  ? 22050
                  : newQuality === "fair"
                  ? 32000
                  : 48000,
              channelCount: 1,
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: newQuality !== "poor",
            };
            audioTrack.applyConstraints(newConstraints).catch(console.error);
          }
        }
      }
    };

    // Check quality every 5 seconds
    const qualityInterval = setInterval(checkConnectionQuality, 5000);
    return () => clearInterval(qualityInterval);
  }, []);

  // Function to start screen sharing
  const startScreenShare = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });

      setScreenStream(stream);
      setIsScreenSharing(true);
      setActiveScreenShare({ userId: userIdRef.current, stream });

      // Store screen share calls to track them
      const screenCalls: any[] = [];

      // Share screen with all connected peers
      peersRef.current.forEach((peer, userId) => {
        if (peerRef.current) {
          // Create a new call for screen sharing
          const screenCall = peerRef.current.call(peer.peerId, stream, {
            metadata: { type: "screen", userId: userIdRef.current },
          });
          screenCalls.push(screenCall);

          // Update peer connection with screen info
          peersRef.current.set(userId, {
            ...peer,
            screenStream: stream,
            screenCall: screenCall,
          });
        }
      });

      // Handle screen share stop from browser
      stream.getVideoTracks()[0].onended = () => {
        stopScreenShare(screenCalls);
      };
    } catch (err) {
      console.error("Error starting screen share:", err);
      setError("Failed to start screen sharing");
    }
  }, []);

  // Function to stop screen sharing
  const stopScreenShare = useCallback(
    (screenCallsOrEvent?: any[] | React.MouseEvent) => {
      if (screenStream) {
        // Stop all tracks in the screen stream
        screenStream.getTracks().forEach((track) => track.stop());

        // Close all screen share calls if array is provided
        if (Array.isArray(screenCallsOrEvent)) {
          screenCallsOrEvent.forEach((call) => {
            if (call && typeof call.close === "function") {
              call.close();
            }
          });
        }

        // Notify all peers that screen sharing has stopped
        peersRef.current.forEach((peer) => {
          if (peer.screenStream) {
            peer.screenStream.getTracks().forEach((track) => track.stop());
          }
          // Close any existing screen share call
          if (peer.screenCall && typeof peer.screenCall.close === "function") {
            peer.screenCall.close();
          }
        });

        // Update peer connections to remove screen info
        peersRef.current.forEach((peer, userId) => {
          peersRef.current.set(userId, {
            ...peer,
            screenStream: null,
            screenCall: null,
          });
        });

        setScreenStream(null);
        setIsScreenSharing(false);
        setActiveScreenShare(null);

        // Notify other peers through data channel if available
        if (peerRef.current) {
          peersRef.current.forEach((peer) => {
            try {
              const conn = peerRef.current?.connect(peer.peerId);
              conn?.on("open", () => {
                conn.send({
                  type: "screen-share-stopped",
                  userId: userIdRef.current,
                });
              });
            } catch (err) {
              console.error(
                "Error notifying peer about screen share stop:",
                err
              );
            }
          });
        }
      }
    },
    [screenStream]
  );

  // Handle audio stream creation and setup
  const handleAudioStream = useCallback(
    (remoteStream: MediaStream, callerId: string) => {
      const audio = new Audio();
      audio.srcObject = remoteStream;
      audio.autoplay = true;
      audio.setAttribute("playsinline", "true");
      audio.muted = false;
      audio.volume = 1.0;

      const handlePlayError = async (error: any) => {
        console.error("Error playing audio:", error);
        try {
          if (
            !audioContextRef.current ||
            audioContextRef.current.state === "closed"
          ) {
            audioContextRef.current = new (window.AudioContext ||
              (window as any).webkitAudioContext)();
          }
          if (audioContextRef.current.state === "suspended") {
            await audioContextRef.current.resume();
          }
          await new Promise((resolve) => setTimeout(resolve, 1000));
          await audio.play();
        } catch (e) {
          console.error("Retry error playing audio:", e);
        }
      };

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(handlePlayError);
      }

      return audio;
    },
    []
  );

  // Handle screen share calls
  const handleScreenShare = useCallback((call: any, callerId: string) => {
    call.answer();

    call.on("stream", (remoteStream: MediaStream) => {
      console.log("Received screen share stream from:", callerId);
      setActiveScreenShare({
        userId: call.metadata.userId || callerId,
        stream: remoteStream,
      });
    });

    call.on("close", () => {
      console.log("Screen share call closed from:", callerId);
      setActiveScreenShare(null);
    });
  }, []);

  // Handle audio calls
  const handleAudioCall = useCallback(
    (call: any, callerId: string) => {
      call.answer(localStreamRef.current!);

      call.on("stream", (remoteStream: MediaStream) => {
        if (remoteStream.getVideoTracks().length > 0) return;

        console.log(`Received audio stream from:`, callerId);
        const audio = handleAudioStream(remoteStream, callerId);

        peersRef.current.set(callerId, {
          peerId: call.peer,
          call,
          audio,
          type: "audio",
          connectionQuality: "good",
        });

        setParticipants((prev) => {
          if (!prev.includes(callerId)) {
            return [...prev, callerId];
          }
          return prev;
        });

        if (audioElementsCallbackRef.current) {
          audioElementsCallbackRef.current(callerId, audio);
        }

        // Monitor audio quality
        const audioContext = new (window.AudioContext ||
          (window as any).webkitAudioContext)();
        const analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(remoteStream);

        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.8;
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        let silenceCount = 0;

        const checkAudioQuality = () => {
          analyser.getByteFrequencyData(dataArray);
          const average =
            dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;

          if (average < 5) {
            silenceCount++;
            if (silenceCount > 10) {
              const peer = peersRef.current.get(callerId);
              if (peer) {
                peer.connectionQuality = "poor";
                if (peer.call) {
                  peer.call.peerConnection.restartIce();
                }
              }
            }
          } else {
            silenceCount = 0;
            const peer = peersRef.current.get(callerId);
            if (peer) {
              peer.connectionQuality = "good";
            }
          }

          requestAnimationFrame(checkAudioQuality);
        };

        checkAudioQuality();
      });

      call.on("close", () => {
        console.log(`Audio call closed with:`, callerId);
        const peer = peersRef.current.get(callerId);
        if (peer) {
          if (peer.audio) {
            peer.audio.srcObject = null;
            peer.audio.pause();
            peer.audio = null;
          }
          if (peer.call) peer.call.close();
          peersRef.current.delete(callerId);
        }
        setParticipants((prev) => prev.filter((id) => id !== callerId));
      });

      call.on("error", (err: Error) => {
        console.error(`Audio call error with`, callerId, ":", err);
        setError(`Call error: ${err.message || "Unknown error"}`);
        if (call.peerConnection.connectionState === "failed") {
          call.peerConnection.restartIce();
        }
      });
    },
    [handleAudioStream]
  );

  // Initialize voice chat with optimized setup
  useEffect(() => {
    let mounted = true;

    const initializeVoiceChat = async () => {
      try {
        setIsLoading(true);
        reconnectAttemptsRef.current = 0;

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 48000,
            channelCount: 1,
          },
          video: false,
        });

        if (!mounted) return;

        stream.getAudioTracks().forEach((track) => {
          track.enabled = !isMuted;
        });

        localStreamRef.current = stream;
        const peerId = `${roomPrefixRef.current}${userIdRef.current}`;

        const peer = new Peer(peerId, {
          debug: 3,
          config: {
            iceServers: [
              // Google's public STUN servers
              { urls: "stun:stun.l.google.com:19302" },
              { urls: "stun:stun1.l.google.com:19302" },
              { urls: "stun:stun2.l.google.com:19302" },
              { urls: "stun:stun3.l.google.com:19302" },
              // OpenRelay STUN servers
              { urls: "stun:openrelay.metered.ca:80" },
              { urls: "stun:openrelay.metered.ca:80?transport=tcp" },
              { urls: "stun:openrelay.metered.ca:443" },
              { urls: "stun:openrelay.metered.ca:443?transport=tcp" },
              // Twilio TURN servers
              {
                urls: "turn:global.turn.twilio.com:3478?transport=udp",
                username: "f4b4035eaa76f4a55de5f4351567653ee4ff6fa97b50b6b334fcc1be9c27212d",
                credential: "w1WpauEsFbEK+oFkxC/mEZ48bQlPwjnl1xoQgkA0vTw=",
              },
              {
                urls: "turn:global.turn.twilio.com:3478?transport=tcp",
                username: "f4b4035eaa76f4a55de5f4351567653ee4ff6fa97b50b6b334fcc1be9c27212d",
                credential: "w1WpauEsFbEK+oFkxC/mEZ48bQlPwjnl1xoQgkA0vTw=",
              },
              {
                urls: "turn:global.turn.twilio.com:443?transport=tcp",
                username: "f4b4035eaa76f4a55de5f4351567653ee4ff6fa97b50b6b334fcc1be9c27212d",
                credential: "w1WpauEsFbEK+oFkxC/mEZ48bQlPwjnl1xoQgkA0vTw=",
              }
            ],
            sdpSemantics: "unified-plan",
            iceTransportPolicy: "all",
            bundlePolicy: "max-bundle",
            rtcpMuxPolicy: "require",
            iceCandidatePoolSize: 10
          },
          host: "0.peerjs.com",
          port: 443,
          secure: true,
          path: "/"
        });

        peerRef.current = peer;

        // Handle peer events
        peer.on("open", async (id) => {
          if (!mounted) return;
          console.log("Connected to PeerJS server with ID:", id);
          setIsConnected(true);
          setIsLoading(false);
          reconnectAttemptsRef.current = 0;
          await broadcastPresence();
          startParticipantPolling();
          const cleanupQualityMonitor = monitorNetworkQuality();
          cleanupRef.current = cleanupQualityMonitor || null;
        });

        // Handle incoming calls
        peer.on("call", (call) => {
          const callerId = call.peer.replace(roomPrefixRef.current, "");

          if (call.metadata?.type === "screen") {
            handleScreenShare(call, callerId);
            return;
          }

          handleAudioCall(call, callerId);
        });

        // Handle peer errors and disconnection
        peer.on("error", (err) => {
          console.error("Peer error:", err);
          setError(`Connection error: ${err.message || "Unknown error"}`);
          setIsLoading(false);
        });

        peer.on("disconnected", () => {
          console.log("Disconnected from PeerJS server");
          setIsConnected(false);
          if (reconnectAttemptsRef.current < maxReconnectAttempts) {
            peer.reconnect();
            reconnectAttemptsRef.current++;
          }
        });

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

    initializeVoiceChat();

    // Cleanup function
    return () => {
      mounted = false;
      if (cleanupRef.current) cleanupRef.current();
      disconnect();
    };
  }, [
    roomId,
    broadcastPresence,
    startParticipantPolling,
    monitorNetworkQuality,
    disconnect,
    handleScreenShare,
    handleAudioCall,
  ]);

  // Handle mute/unmute with optimized state updates
  useEffect(() => {
    if (localStreamRef.current) {
      const tracks = localStreamRef.current.getAudioTracks();
      tracks.forEach((track) => {
        track.enabled = !isMuted;
      });
    }
  }, [isMuted]);

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
    networkQuality,
    isScreenSharing,
    startScreenShare,
    stopScreenShare,
    activeScreenShare,
  };
}
