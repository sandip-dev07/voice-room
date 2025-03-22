"use client";

import { useState, useEffect, useRef } from "react";
import { usePeerVoiceChat } from "@/hooks/use-peer-voice-chat";
import { Avatar } from "@/components/ui/avatar";
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  RefreshCw,
  Settings,
  Copy,
  LogOut,
  Loader,
  Check,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";

interface VoiceChatRoomProps {
  roomId: string;
}

export default function VoiceChatRoom({ roomId }: VoiceChatRoomProps) {
  const {
    isConnected,
    isMuted,
    error,
    participants,
    userId,
    toggleMute,
    disconnect,
    isLoading,
    registerAudioElementsCallback,
  } = usePeerVoiceChat(roomId);

  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(
    null
  );
  const [copied, setCopied] = useState(false);
  const [speakerMuted, setSpeakerMuted] = useState(false);
  const [volume] = useState(1);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speakingStates, setSpeakingStates] = useState<{ [key: string]: boolean }>({});
  const router = useRouter();

  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Check microphone permission
  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then(() => setPermissionGranted(true))
      .catch(() => setPermissionGranted(false));
  }, []);

  // Handle speaker mute/unmute
  useEffect(() => {
    const audioElements = Array.from(audioElementsRef.current.values());

    audioElements.forEach((audio) => {
      if (audio) {
        audio.muted = speakerMuted;
        audio.volume = volume;

        if (!speakerMuted) {
          const playPromise = audio.play();
          if (playPromise !== undefined) {
            playPromise.catch((e) => console.error("Audio play error:", e));
          }
        }
      }
    });
  }, [speakerMuted, volume]);

  // Register callback for audio elements
  useEffect(() => {
    if (isConnected) {
      const handleAudioElement = (id: string, audio: HTMLAudioElement) => {
        audioElementsRef.current.set(id, audio);
        audio.muted = speakerMuted;
        audio.volume = volume;

        // Set up speaking detection for other participants
        if (id !== userId) {
          const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
          const analyser = audioContext.createAnalyser();
          const source = audioContext.createMediaStreamSource(audio.srcObject as MediaStream);
          
          analyser.fftSize = 256;
          analyser.smoothingTimeConstant = 0.8;
          source.connect(analyser);

          const dataArray = new Uint8Array(analyser.frequencyBinCount);

          const checkAudioLevel = () => {
            analyser.getByteFrequencyData(dataArray);
            const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
            setSpeakingStates(prev => ({
              ...prev,
              [id]: average > 20
            }));
            requestAnimationFrame(checkAudioLevel);
          };

          checkAudioLevel();
        }

        if (!speakerMuted) {
          const playPromise = audio.play();
          if (playPromise !== undefined) {
            playPromise.catch((e) => console.error("Audio play error:", e));
          }
        }
      };

      registerAudioElementsCallback(handleAudioElement);
    }
  }, [isConnected, registerAudioElementsCallback, speakerMuted, volume, userId]);

  // Setup audio visualization for speaking detection
  useEffect(() => {
    if (!isConnected || isMuted) {
      setIsSpeaking(false);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    const setupAudioVisualization = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });

        // Create audio context
        const audioContext = new (window.AudioContext ||
          (window as any).webkitAudioContext)();
        const analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(stream);

        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.8;
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        audioContextRef.current = audioContext;
        analyserRef.current = analyser;
        dataArrayRef.current = dataArray;

        // Start visualization loop
        const checkAudioLevel = () => {
          if (!analyserRef.current || !dataArrayRef.current) return;

          analyserRef.current.getByteFrequencyData(dataArrayRef.current);

          // Calculate average volume
          const average =
            dataArrayRef.current.reduce((sum, value) => sum + value, 0) /
            dataArrayRef.current.length;

          // Set speaking state based on threshold
          setIsSpeaking(average > 20);

          // Continue loop
          animationFrameRef.current = requestAnimationFrame(checkAudioLevel);
        };

        checkAudioLevel();
      } catch (error) {
        console.error("Error setting up audio visualization:", error);
      }
    };

    setupAudioVisualization();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [isConnected, isMuted]);

  const copyRoomLink = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const toggleSpeakerMute = () => {
    setSpeakerMuted((prev) => !prev);
  };

  // Generate initials from user ID
  const getInitials = (id: string) => {
    return id.substring(0, 2).toUpperCase();
  };

  // Filter out duplicate participants and own user ID
  const uniqueParticipants = participants.filter(
    (participantId, index, self) => {
      return self.indexOf(participantId) === index && participantId !== userId;
    }
  );

  if (permissionGranted === false) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#121212] text-white p-4">
        <div className="w-full max-w-md bg-[#1e1e1e] rounded-lg p-6 shadow-lg">
          <h2 className="text-xl font-semibold mb-4 text-center">
            Microphone Access Required
          </h2>
          <p className="text-gray-300 mb-6 text-center">
            Please allow microphone access to use the voice chat feature.
          </p>
          <Button
            className="w-full bg-blue-600 hover:bg-blue-700"
            onClick={() => {
              navigator.mediaDevices
                .getUserMedia({ audio: true })
                .then(() => setPermissionGranted(true))
                .catch(() => setPermissionGranted(false));
            }}
          >
            Request Access
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#121212] text-white p-4">
      <div className="max-w-md w-full mx-auto flex flex-col h-full">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center space-x-2">
            <div className="text-sm text-gray-400">
              Room: <span className="text-gray-200">{roomId}</span>
            </div>
            <Button size={"sm"} variant="ghost" onClick={copyRoomLink}>
              {copied ? <Check size={8} /> : <Copy size={8} />}
            </Button>
          </div>
          <div className="flex space-x-4">
            <button className="text-gray-400 hover:text-white">
              <RefreshCw size={18} onClick={() => window.location.reload()} />
            </button>
          </div>
        </div>

        {/* Title */}
        <div className="text-center mb-6">
          <h1 className="text-lg font-bold mb-2">Voice Chat</h1>
          {isLoading ? (
            <div className="inline-flex items-center px-2 py-1 rounded-full bg-[#3a3a3a] text-xs">
              <div className="w-2 h-2 bg-yellow-400 rounded-full mr-2"></div>
              Connecting...
            </div>
          ) : isConnected ? (
            <div className="inline-flex items-center px-2 py-1 rounded-full bg-[#3a3a3a] text-xs">
              <div className="w-2 h-2 bg-green-400 rounded-full mr-2"></div>
              Connected
            </div>
          ) : (
            <div className="inline-flex items-center px-2 py-1 rounded-full bg-[#3a3a3a] text-xs">
              <div className="w-2 h-2 bg-red-400 rounded-full mr-2"></div>
              Disconnected
            </div>
          )}
        </div>

        {/* Participants */}
        <div className="mb-4 flex justify-between items-center">
          <h2 className="text-sm font-medium text-gray-300">Participants</h2>
          <span className="text-xs text-white bg-zinc-600 rounded-full p-1 size-5 flex items-center justify-center ">
            {uniqueParticipants.length + 1}
          </span>
        </div>

        <div className="space-y-2 flex-grow overflow-y-auto">
          {/* Current user */}
          <div className="flex items-center justify-between bg-[#1e1e1e] rounded-[8px] p-3">
            <div className="flex items-center space-x-3">
              <Avatar
                className={cn(
                  "h-8 w-8 bg-[#2a2a2a] flex items-center justify-center",
                  isSpeaking && "border border-green-500"
                )}
              >
                <div className="text-xs">{getInitials(userId)}</div>
              </Avatar>
              <div>
                <div className="text-sm">
                  {userId} <span className="text-gray-400">(You)</span>
                </div>
                <div className="text-xs text-gray-500">
                  {isSpeaking ? "Speaking" : "Not speaking"}
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <button
                className="text-gray-400 hover:text-white"
                onClick={toggleSpeakerMute}
              >
                {speakerMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
              <button
                className={cn(
                  "text-gray-400 hover:text-white",
                  !isMuted && "text-green-600 hover:text-green-700"
                )}
                onClick={toggleMute}
              >
                {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
              </button>
            </div>
          </div>

          {/* Other participants */}
          {uniqueParticipants.map((participantId) => (
            <div
              key={participantId}
              className="flex items-center justify-between bg-[#1e1e1e] rounded-[8px] p-3"
            >
              <div className="flex items-center space-x-3">
                <Avatar className={cn(
                  "h-8 w-8 bg-[#2a2a2a] flex items-center justify-center",
                  speakingStates[participantId] && "border border-green-500"
                )}>
                  <div className="text-xs">{getInitials(participantId)}</div>
                </Avatar>
                <div>
                  <div className="text-sm">{participantId}</div>
                  <div className="text-xs text-gray-500">
                    {speakingStates[participantId] ? "Speaking" : "Not speaking"}
                  </div>
                </div>
              </div>
              <div className="text-xs text-gray-500">Connected</div>
            </div>
          ))}
        </div>

        {/* Leave button */}
        <Button
          className="mt-4 w-full mx-auto bg-red-700 hover:bg-red-800 text-white rounded-[6px]"
          onClick={() => {
            disconnect();
            router.push("/");
          }}
        >
          <LogOut className="h-4 w-4 mr-2" />
          Leave Room
        </Button>
      </div>
    </div>
  );
}
