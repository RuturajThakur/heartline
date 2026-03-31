import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useSessionProfile } from "../hooks/useSessionProfile";
import { ApiError, apiFetch } from "../lib/api";

type ConversationSummary = {
  id: string;
  matchId: string;
  otherUserId: string;
  otherUserName: string;
  otherUserPhotoUrl: string | null;
  otherUserPhotoUrls?: string[];
  updatedAt: string;
  lastMessage: string | null;
  lastMessageAt: string | null;
  lastMessageSenderUserId: string | null;
  lastMessageHasAttachments?: boolean;
  unreadCount: number;
};

type MessageAttachment = {
  id: string;
  name: string;
  mimeType: string;
  kind: "image" | "video" | "audio" | "file";
  size: number;
  url: string;
};

type ConversationMessage = {
  id: string;
  senderUserId: string;
  content: string;
  createdAt: string;
  attachments?: MessageAttachment[];
};

type ReportReason =
  | "spam"
  | "harassment"
  | "fake_profile"
  | "inappropriate_content"
  | "other";

const panelClass =
  "rounded-[28px] border border-white/80 bg-[rgba(255,251,246,0.76)] p-7 shadow-[0_28px_70px_rgba(87,49,31,0.18)] backdrop-blur-[14px]";
const labelClass = "mb-2 text-[0.72rem] uppercase tracking-[0.14em] text-[#db5b43]";
const starterPrompts = [
  "What made you swipe right on my profile?",
  "What does your ideal weekend usually look like?",
  "What are you looking forward to this month?"
] as const;

async function getConversations() {
  return apiFetch<{
    items: ConversationSummary[];
    totalUnreadCount: number;
  }>("/api/conversations");
}

async function getConversationMessages(conversationId: string) {
  const data = await apiFetch<{ items: ConversationMessage[] }>(
    `/api/conversations/${conversationId}/messages`
  );
  return data.items;
}

function formatTimestamp(value: string | null) {
  if (!value) {
    return "No messages yet";
  }

  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function formatFileSize(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${Math.round(size / 102.4) / 10} KB`;
  }

  return `${Math.round(size / 104857.6) / 10} MB`;
}

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0:00";
  }

  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function renderMessageText(content: string) {
  const parts = content.split(/(https?:\/\/[^\s]+)/g);

  return parts.map((part, index) => {
    if (/^https?:\/\/[^\s]+$/.test(part)) {
      return (
        <a
          className="underline decoration-current/40 underline-offset-4"
          href={part}
          key={`${part}-${index}`}
          rel="noreferrer"
          target="_blank"
        >
          {part}
        </a>
      );
    }

    return <span key={`${part}-${index}`}>{part}</span>;
  });
}

function Avatar({
  src,
  label,
  className
}: {
  src: string | null;
  label: string;
  className: string;
}) {
  if (src) {
    return <img alt={label} className={className} src={src} />;
  }

  return (
    <div
      aria-label={label}
      className={`${className} flex items-center justify-center bg-[#db5b43]/14 text-lg font-semibold uppercase text-[#db5b43]`}
    >
      {label.slice(0, 1)}
    </div>
  );
}

function AudioNoteCard({
  attachment,
  isOwnMessage
}: {
  attachment: MessageAttachment;
  isOwnMessage: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [waveformBars, setWaveformBars] = useState([
    20, 32, 24, 44, 28, 18, 36, 26, 40, 22, 34, 16, 30, 24, 38, 20
  ]);

  useEffect(() => {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    const audioElement = audio;

    function handleTimeUpdate() {
      setCurrentTime(audioElement.currentTime);
    }

    function handleLoadedMetadata() {
      setDuration(audioElement.duration || 0);
    }

    function handleEnded() {
      setIsPlaying(false);
      setCurrentTime(0);
    }

    function handlePause() {
      setIsPlaying(false);
    }

    function handlePlay() {
      setIsPlaying(true);
    }

    audioElement.addEventListener("timeupdate", handleTimeUpdate);
    audioElement.addEventListener("loadedmetadata", handleLoadedMetadata);
    audioElement.addEventListener("ended", handleEnded);
    audioElement.addEventListener("pause", handlePause);
    audioElement.addEventListener("play", handlePlay);

    return () => {
      audioElement.removeEventListener("timeupdate", handleTimeUpdate);
      audioElement.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audioElement.removeEventListener("ended", handleEnded);
      audioElement.removeEventListener("pause", handlePause);
      audioElement.removeEventListener("play", handlePlay);
    };
  }, []);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const speedOptions = [1, 1.5, 2];
  const playedBars = Math.round((progress / 100) * waveformBars.length);

  useEffect(() => {
    let isCancelled = false;

    async function generateWaveform() {
      try {
        const response = await fetch(attachment.url);
        const audioBuffer = await response.arrayBuffer();
        const AudioContextClass =
          window.AudioContext ||
          (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

        if (!AudioContextClass) {
          return;
        }

        const audioContext = new AudioContextClass();
        const decoded = await audioContext.decodeAudioData(audioBuffer.slice(0));
        const channelData = decoded.getChannelData(0);
        const samples = 28;
        const blockSize = Math.floor(channelData.length / samples);
        const bars: number[] = [];

        for (let index = 0; index < samples; index += 1) {
          const start = index * blockSize;
          const end = Math.min(start + blockSize, channelData.length);
          let sum = 0;

          for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
            sum += Math.abs(channelData[sampleIndex] ?? 0);
          }

          const average = end > start ? sum / (end - start) : 0;
          bars.push(Math.max(14, Math.min(100, Math.round(average * 220))));
        }

        await audioContext.close();

        if (!isCancelled && bars.some((value) => value > 16)) {
          setWaveformBars(bars);
        }
      } catch {
        // Keep the decorative fallback bars when decoding fails.
      }
    }

    void generateWaveform();

    return () => {
      isCancelled = true;
    };
  }, [attachment.url]);

  return (
    <div
      className={
        isOwnMessage
          ? "w-full max-w-[18.5rem] rounded-[20px] border border-white/10 bg-[#2b1f23] px-3 py-3"
          : "w-full max-w-[18.5rem] rounded-[20px] border border-[#24162d]/10 bg-white px-3 py-3"
      }
    >
      <audio preload="metadata" ref={audioRef} src={attachment.url} />
      <div className="flex items-center gap-2.5">
        <button
          className={
            isOwnMessage
              ? "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white"
              : "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#24162d] text-white"
          }
          onClick={async () => {
            const audio = audioRef.current;

            if (!audio) {
              return;
            }

            if (audio.paused) {
              await audio.play();
              return;
            }

            audio.pause();
          }}
          type="button"
        >
          {isPlaying ? (
            <span aria-hidden="true" className="text-xs font-semibold">❚❚</span>
          ) : (
            <span aria-hidden="true" className="ml-0.5 text-sm">▶</span>
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <span
              className={
                isOwnMessage
                  ? "text-[0.7rem] text-white/70"
                  : "text-[0.7rem] text-[#65556c]"
              }
            >
              {formatDuration(currentTime)} / {formatDuration(duration)}
            </span>
          </div>

          <div className="mt-2">
            <div className="relative">
              <div className="flex h-8 items-center gap-[3px] overflow-hidden">
                {waveformBars.map((height, index) => (
                  <span
                    className={
                      isOwnMessage
                        ? index < playedBars
                          ? "w-[3px] rounded-full bg-white/85"
                          : "w-[3px] rounded-full bg-white/20"
                        : index < playedBars
                          ? "w-[3px] rounded-full bg-[#db5b43]"
                          : "w-[3px] rounded-full bg-[#24162d]/12"
                    }
                    key={`${attachment.id}-${index}`}
                    style={{ height: `${Math.max(28, height * 0.72)}%` }}
                  />
                ))}
              </div>
              <input
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                max={duration || 0}
                min={0}
                onChange={(event) => {
                  const audio = audioRef.current;

                  if (!audio) {
                    return;
                  }

                  const nextTime = Number(event.target.value);
                  audio.currentTime = nextTime;
                  setCurrentTime(nextTime);
                }}
                step="0.01"
                type="range"
                value={Math.min(currentTime, duration || 0)}
              />
            </div>
          </div>

          <div className="mt-2 flex items-center justify-between gap-3">
            <div />
            <button
              className={
                isOwnMessage
                  ? "rounded-full border border-white/12 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-white/80"
                  : "rounded-full border border-[#24162d]/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-[#24162d]"
              }
              onClick={() => {
                const nextIndex = (speedOptions.indexOf(playbackRate) + 1) % speedOptions.length;
                const nextRate = speedOptions[nextIndex] ?? 1;
                const audio = audioRef.current;

                if (audio) {
                  audio.playbackRate = nextRate;
                }

                setPlaybackRate(nextRate);
              }}
              type="button"
            >
              {playbackRate}x
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function InboxPage() {
  const queryClient = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const conversationMenuRef = useRef<HTMLDivElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const discardRecordingRef = useRef(false);
  const [pendingBlockId, setPendingBlockId] = useState<string | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isConversationMenuOpen, setIsConversationMenuOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isRecordingPaused, setIsRecordingPaused] = useState(false);
  const [recordingElapsedSeconds, setRecordingElapsedSeconds] = useState(0);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<{
    userId: string;
    userName: string;
  } | null>(null);
  const [reportReason, setReportReason] = useState<ReportReason>("spam");
  const [reportDetails, setReportDetails] = useState("");
  const { sessionQuery, profileQuery, hasCompleteProfile } = useSessionProfile();

  const conversationsQuery = useQuery({
    queryKey: ["conversations"],
    queryFn: getConversations,
    refetchInterval: 12_000
  });
  const messagesQuery = useQuery({
    queryKey: ["conversation-messages", selectedConversationId],
    queryFn: () => getConversationMessages(selectedConversationId!),
    enabled: Boolean(selectedConversationId),
    refetchInterval: selectedConversationId ? 8_000 : false
  });
  const conversationItems = Array.isArray(conversationsQuery.data?.items)
    ? conversationsQuery.data.items
    : [];

  const sendMessageMutation = useMutation({
    mutationFn: (conversationId: string) => {
      const formData = new FormData();

      formData.set("content", messageInput);

      for (const file of selectedFiles) {
        formData.append("attachment", file);
      }

      return apiFetch<{ message: ConversationMessage }>(
        `/api/conversations/${conversationId}/messages`,
        {
          method: "POST",
          body: formData
        }
      );
    },
    onSuccess: async (_, conversationId) => {
      setMessageInput("");
      setSelectedFiles([]);
      await queryClient.invalidateQueries({
        queryKey: ["conversation-messages", conversationId]
      });
      await queryClient.invalidateQueries({
        queryKey: ["conversations"]
      });
    }
  });
  const blockMutation = useMutation({
    mutationFn: (targetUserId: string) =>
      apiFetch<{ ok: boolean }>("/api/blocks", {
        method: "POST",
        body: JSON.stringify({
          targetUserId
        })
      }),
    onMutate: (targetUserId) => {
      setPendingBlockId(targetUserId);
    },
    onSuccess: async () => {
      setSelectedConversationId(null);
      setIsConversationMenuOpen(false);
      await queryClient.invalidateQueries({
        queryKey: ["matches"]
      });
      await queryClient.invalidateQueries({
        queryKey: ["conversations"]
      });
      await queryClient.invalidateQueries({
        queryKey: ["discovery-feed"]
      });
    },
    onSettled: () => {
      setPendingBlockId(null);
    }
  });
  const unmatchMutation = useMutation({
    mutationFn: (targetUserId: string) =>
      apiFetch<{ ok: boolean }>("/api/unmatch", {
        method: "POST",
        body: JSON.stringify({
          targetUserId
        })
      }),
    onSuccess: async () => {
      setSelectedConversationId(null);
      setIsConversationMenuOpen(false);
      await queryClient.invalidateQueries({
        queryKey: ["matches"]
      });
      await queryClient.invalidateQueries({
        queryKey: ["conversations"]
      });
      await queryClient.invalidateQueries({
        queryKey: ["discovery-feed"]
      });
    }
  });
  const reportMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ ok: boolean }>("/api/reports", {
        method: "POST",
        body: JSON.stringify({
          targetUserId: reportTarget?.userId,
          reason: reportReason,
          details: reportDetails
        })
      }),
    onSuccess: () => {
      setReportTarget(null);
      setReportReason("spam");
      setReportDetails("");
      setIsConversationMenuOpen(false);
    }
  });

  useEffect(() => {
    if (!conversationsQuery.data?.items.length) {
      setSelectedConversationId(null);
      return;
    }

    const hasSelectedConversation = conversationsQuery.data.items.some(
      (conversation) => conversation.id === selectedConversationId
    );

    if (!selectedConversationId || !hasSelectedConversation) {
      setSelectedConversationId(conversationsQuery.data.items[0].id);
    }
  }, [conversationsQuery.data, selectedConversationId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end"
    });
  }, [messagesQuery.data, selectedConversationId]);

  useEffect(() => {
    setIsConversationMenuOpen(false);
  }, [selectedConversationId]);

  useEffect(() => {
    if (!isConversationMenuOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!conversationMenuRef.current?.contains(event.target as Node)) {
        setIsConversationMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [isConversationMenuOpen]);

  useEffect(() => {
    if (selectedConversationId && messagesQuery.data) {
      queryClient.invalidateQueries({
        queryKey: ["conversations"]
      });
    }
  }, [messagesQuery.data, queryClient, selectedConversationId]);

  useEffect(() => {
    if (!isRecording || isRecordingPaused) {
      return;
    }

    const timer = window.setInterval(() => {
      setRecordingElapsedSeconds((current) => current + 1);
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [isRecording, isRecordingPaused]);

  useEffect(() => {
    return () => {
      mediaRecorderRef.current?.stop();

      if (mediaStreamRef.current) {
        for (const track of mediaStreamRef.current.getTracks()) {
          track.stop();
        }
      }
    };
  }, []);

  if (sessionQuery.isError) {
    return <Navigate to="/" />;
  }

  if (
    sessionQuery.isLoading ||
    sessionQuery.isPending ||
    (sessionQuery.isSuccess && profileQuery.isPending && !profileQuery.data)
  ) {
    return (
      <section className="grid gap-6">
        <div className={panelClass}>
          <p className={labelClass}>Inbox</p>
          <h2 className="font-serif text-[clamp(1.8rem,3vw,2.8rem)] leading-tight text-[#24162d]">
            Loading your chats.
          </h2>
        </div>
      </section>
    );
  }

  if (profileQuery.isSuccess && !hasCompleteProfile) {
    return <Navigate to="/onboarding" />;
  }

  const selectedConversation =
    conversationItems.find((conversation) => conversation.id === selectedConversationId) ?? null;
  const hasStartedConversation = Boolean(selectedConversation?.lastMessage);

  function openReportModal(target: { userId: string; userName: string }) {
    setReportTarget(target);
    setReportReason("spam");
    setReportDetails("");
  }

  async function startRecording() {
    setRecordingError(null);

    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setRecordingError("Voice recording is not available in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true
      });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const recorder = new MediaRecorder(stream, {
        mimeType
      });

      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      recordingChunksRef.current = [];
      discardRecordingRef.current = false;
      setRecordingElapsedSeconds(0);
      setIsRecordingPaused(false);

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) {
          recordingChunksRef.current.push(event.data);
        }
      });

      recorder.addEventListener("stop", () => {
        if (!discardRecordingRef.current) {
          const blob = new Blob(recordingChunksRef.current, {
            type: recorder.mimeType || "audio/webm"
          });

          if (blob.size > 0) {
            const extension = recorder.mimeType.includes("ogg") ? "ogg" : "webm";
            const file = new File([blob], `voice-note-${Date.now()}.${extension}`, {
              type: recorder.mimeType || "audio/webm"
            });

            setSelectedFiles((current) => [...current, file].slice(0, 5));
          }
        }

        recordingChunksRef.current = [];
        discardRecordingRef.current = false;

        if (mediaStreamRef.current) {
          for (const track of mediaStreamRef.current.getTracks()) {
            track.stop();
          }
        }

        mediaStreamRef.current = null;
        mediaRecorderRef.current = null;
        setIsRecording(false);
        setIsRecordingPaused(false);
        setRecordingElapsedSeconds(0);
      });

      recorder.start();
      setIsRecording(true);
    } catch {
      setRecordingError("Microphone access was denied or unavailable.");
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  }

  function finalizeRecording() {
    discardRecordingRef.current = false;
    stopRecording();
  }

  function pauseRecording() {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.pause();
      setIsRecordingPaused(true);
    }
  }

  function resumeRecording() {
    if (mediaRecorderRef.current?.state === "paused") {
      mediaRecorderRef.current.resume();
      setIsRecordingPaused(false);
    }
  }

  function deleteRecording() {
    discardRecordingRef.current = true;

    if (mediaRecorderRef.current?.state && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      return;
    }

    if (mediaStreamRef.current) {
      for (const track of mediaStreamRef.current.getTracks()) {
        track.stop();
      }
    }

    mediaStreamRef.current = null;
    mediaRecorderRef.current = null;
    recordingChunksRef.current = [];
    setIsRecording(false);
    setIsRecordingPaused(false);
    setRecordingElapsedSeconds(0);
  }

  return (
      <section className="grid gap-6">
        <div className="grid gap-6 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
          <section className={`${panelClass} flex h-full flex-col overflow-hidden lg:h-[calc(100vh-10rem)] lg:min-h-0`}>
            <p className={labelClass}>Chats</p>
            
            <div className="mt-5 grid gap-4 overflow-y-auto pr-2 lg:min-h-0">
            {conversationsQuery.isLoading ? (
              <p className="text-base leading-7 text-[#65556c]">Loading conversations...</p>
            ) : null}

            {conversationsQuery.data?.items.length ? (
              conversationsQuery.data.items.map((conversation) => (
                <button
                  className={
                    selectedConversationId === conversation.id
                      ? "grid gap-2 rounded-[24px] border border-[#24162d] bg-white px-5 py-4 text-left shadow-[0_20px_55px_rgba(87,49,31,0.12)]"
                      : "grid gap-2 rounded-[24px] border border-[#24162d]/10 bg-white/60 px-5 py-4 text-left transition hover:-translate-y-0.5"
                  }
                  key={conversation.id}
                  onClick={() => setSelectedConversationId(conversation.id)}
                  type="button"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <Avatar
                        className="h-14 w-14 rounded-[18px] object-cover"
                        label={conversation.otherUserName}
                        src={conversation.otherUserPhotoUrl}
                      />
                        <div>
                          <h3 className="font-serif text-xl text-[#24162d]">
                            {conversation.otherUserName}
                          </h3>
                          {!conversation.lastMessage ? (
                            <p className="mt-1 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#db5b43]">
                              Start the conversation
                            </p>
                          ) : null}
                        </div>
                      {conversation.lastMessageSenderUserId && conversation.unreadCount > 0 ? (
                        <span className="rounded-full bg-[#db5b43] px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-white">
                          {conversation.unreadCount}
                        </span>
                      ) : null}
                    </div>
                    <span className="text-xs uppercase tracking-[0.12em] text-[#db5b43]">
                      {formatTimestamp(conversation.lastMessageAt ?? conversation.updatedAt)}
                    </span>
                  </div>
                  <p className="text-sm leading-6 text-[#65556c]">
                    {conversation.lastMessage
                      ? conversation.lastMessageSenderUserId === sessionQuery.data?.user.id
                        ? `You: ${conversation.lastMessage}`
                        : conversation.lastMessage
                        : "Say hi and get the conversation started."}
                    </p>
                  </button>
                ))
              ) : (
                <p className="text-base leading-7 text-[#65556c]">
                  No chats yet. Once two people like each other, the conversation will appear here automatically.
                </p>
              )}
            </div>
        </section>

          <section className={`${panelClass} flex h-full flex-col overflow-hidden lg:h-[calc(100vh-10rem)] lg:min-h-0`}>
            {selectedConversation ? (
              <div className="flex h-full min-h-0 flex-1 flex-col">
              <div className="-mx-7 -mt-7 mb-5 flex items-center gap-4 rounded-t-[28px] border-b border-[#24162d]/10 bg-[rgba(255,251,246,0.94)] px-7 py-4">
                <Avatar
                  className="h-12 w-12 rounded-full object-cover"
                  label={selectedConversation.otherUserName}
                  src={selectedConversation.otherUserPhotoUrl}
                />
                <div className="min-w-0">
                  <p className="truncate font-serif text-xl text-[#24162d]">
                    {selectedConversation.otherUserName}
                  </p>
                  {!hasStartedConversation ? (
                    <p className="text-xs leading-5 text-[#65556c]">
                      Keep the conversation warm, specific, and easy to reply to.
                    </p>
                  ) : null}
                </div>
                <div className="relative ml-auto" ref={conversationMenuRef}>
                  <button
                    aria-expanded={isConversationMenuOpen}
                    aria-haspopup="menu"
                    className="flex h-10 w-10 items-center justify-center rounded-full text-[1.35rem] leading-none font-semibold text-[#24162d] transition hover:bg-[#24162d]/6"
                    onClick={() => setIsConversationMenuOpen((current) => !current)}
                    type="button"
                  >
                    <span aria-hidden="true" className="-translate-y-[1px]">
                      ...
                    </span>
                  </button>

                  {isConversationMenuOpen ? (
                    <div className="absolute right-0 top-14 z-20 grid min-w-44 gap-2 rounded-[20px] border border-white/80 bg-[#fff7ee] p-3 shadow-[0_20px_55px_rgba(87,49,31,0.18)]">
                      <button
                        className="rounded-2xl border border-[#24162d]/10 bg-white/70 px-4 py-3 text-left text-sm font-semibold text-[#24162d]"
                        onClick={() => unmatchMutation.mutate(selectedConversation.otherUserId)}
                        type="button"
                      >
                        {unmatchMutation.isPending ? "Unmatching..." : "Unmatch"}
                      </button>
                      <button
                        className="rounded-2xl border border-[#b53c27]/20 bg-[#fff1ed] px-4 py-3 text-left text-sm font-semibold text-[#b53c27]"
                        onClick={() => blockMutation.mutate(selectedConversation.otherUserId)}
                        type="button"
                      >
                        {pendingBlockId === selectedConversation.otherUserId ? "Blocking..." : "Block"}
                      </button>
                      <button
                        className="rounded-2xl border border-[#24162d]/10 bg-white/70 px-4 py-3 text-left text-sm font-semibold text-[#24162d]"
                        onClick={() =>
                          openReportModal({
                            userId: selectedConversation.otherUserId,
                            userName: selectedConversation.otherUserName
                          })
                        }
                        type="button"
                      >
                        Report
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="mt-5 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-2">
                {messagesQuery.isLoading ? (
                  <p className="text-base leading-7 text-[#65556c]">Loading messages...</p>
                ) : null}

                {messagesQuery.data?.length ? (
                  messagesQuery.data.map((message) => {
                      const isOwnMessage = message.senderUserId === sessionQuery.data?.user.id;
                      const hasAttachments = Boolean(message.attachments?.length);
                      const hasTextContent = Boolean(message.content.trim());

                      return (
                        <article
                          className={
                            isOwnMessage
                              ? hasAttachments
                                ? "ml-auto w-fit max-w-[82%] rounded-[22px] rounded-br-md bg-[#2b1f23] px-3.5 py-2.5 text-white shadow-[0_16px_34px_rgba(43,31,35,0.14)]"
                                : "ml-auto w-fit max-w-[82%] rounded-[22px] rounded-br-md bg-[#2b1f23] px-4 py-2.5 text-white shadow-[0_14px_32px_rgba(43,31,35,0.14)]"
                              : hasAttachments
                                ? "w-fit max-w-[82%] rounded-[22px] rounded-bl-md bg-white px-3.5 py-2.5 text-[#24162d] shadow-[0_14px_30px_rgba(87,49,31,0.05)]"
                                : "w-fit max-w-[82%] rounded-[22px] rounded-bl-md bg-white px-4 py-2.5 text-[#24162d] shadow-[0_14px_28px_rgba(87,49,31,0.05)]"
                          }
                          key={message.id}
                        >
                          {hasTextContent ? (
                            <p className="text-sm leading-5 break-words">{renderMessageText(message.content)}</p>
                          ) : null}
                          {hasAttachments ? (
                            <div
                              className={
                                hasTextContent ? "mt-2 grid gap-2 justify-items-start" : "grid gap-2 justify-items-start"
                              }
                            >
                              {message.attachments?.map((attachment) =>
                                attachment.kind === "image" ? (
                                <a
                                  className={
                                    isOwnMessage
                                        ? "block overflow-hidden rounded-[18px] border border-white/10 bg-[#2b1f23] shadow-[0_14px_34px_rgba(43,31,35,0.14)]"
                                        : "block overflow-hidden rounded-[18px] border border-white/80 bg-white shadow-[0_14px_34px_rgba(87,49,31,0.07)]"
                                  }
                                  href={attachment.url}
                                  key={attachment.id}
                                  rel="noreferrer"
                                  target="_blank"
                                >
                                  <img
                                    alt={attachment.name}
                                      className="max-h-[18rem] w-auto max-w-[15rem] object-cover sm:max-w-[18rem]"
                                    src={attachment.url}
                                  />
                                  <div
                                    className={
                                      isOwnMessage
                                        ? "flex items-center justify-between gap-3 border-t border-white/10 bg-[#2b1f23] px-3 py-2.5 text-white"
                                        : "flex items-center justify-between gap-3 border-t border-[#24162d]/8 bg-white px-3 py-2.5 text-[#24162d]"
                                    }
                                  >
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-semibold">
                                        {attachment.name}
                                      </p>
                                      <p
                                        className={
                                          isOwnMessage
                                            ? "mt-1 text-xs text-white/70"
                                            : "mt-1 text-xs text-[#65556c]"
                                        }
                                      >
                                        {formatFileSize(attachment.size)}
                                      </p>
                                    </div>
                                    <span
                                      className={
                                        isOwnMessage
                                          ? "text-xs font-semibold uppercase tracking-[0.1em] text-white/70"
                                          : "text-xs font-semibold uppercase tracking-[0.1em] text-[#db5b43]"
                                      }
                                    >
                                      Open
                                    </span>
                                  </div>
                                </a>
                              ) : attachment.kind === "video" ? (
                                <div
                                  className={
                                    isOwnMessage
                                      ? "overflow-hidden rounded-[18px] border border-white/10 bg-[#2b1f23] shadow-[0_14px_34px_rgba(43,31,35,0.14)]"
                                      : "overflow-hidden rounded-[18px] border border-white/80 bg-white shadow-[0_14px_34px_rgba(87,49,31,0.07)]"
                                  }
                                  key={attachment.id}
                                >
                                  <video
                                      className="max-h-[18rem] w-auto max-w-[15rem] bg-black object-cover sm:max-w-[18rem]"
                                    controls
                                    preload="metadata"
                                    src={attachment.url}
                                  />
                                  <div
                                    className={
                                      isOwnMessage
                                        ? "flex items-center justify-between gap-3 border-t border-white/10 bg-[#2b1f23] px-3 py-2.5 text-white"
                                        : "flex items-center justify-between gap-3 border-t border-[#24162d]/8 bg-white px-3 py-2.5 text-[#24162d]"
                                    }
                                  >
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-semibold">
                                        {attachment.name}
                                      </p>
                                      <p
                                        className={
                                          isOwnMessage
                                            ? "mt-1 text-xs text-white/70"
                                            : "mt-1 text-xs text-[#65556c]"
                                        }
                                      >
                                        {formatFileSize(attachment.size)}
                                      </p>
                                    </div>
                                    <a
                                      className={
                                        isOwnMessage
                                          ? "text-xs font-semibold uppercase tracking-[0.1em] text-white/70"
                                          : "text-xs font-semibold uppercase tracking-[0.1em] text-[#db5b43]"
                                      }
                                      href={attachment.url}
                                      rel="noreferrer"
                                      target="_blank"
                                    >
                                      Open
                                    </a>
                                  </div>
                                </div>
                              ) : attachment.kind === "audio" ? (
                                <AudioNoteCard
                                  attachment={attachment}
                                  isOwnMessage={isOwnMessage}
                                  key={attachment.id}
                                />
                              ) : (
                                <a
                                  className={
                                    isOwnMessage
                                      ? "flex items-center justify-between gap-3 rounded-[16px] border border-white/10 bg-[#2b1f23] px-3 py-2.5"
                                      : "flex items-center justify-between gap-3 rounded-[16px] border border-[#24162d]/10 bg-white px-3 py-2.5"
                                  }
                                  href={attachment.url}
                                  key={attachment.id}
                                  rel="noreferrer"
                                  target="_blank"
                                >
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold">
                                      {attachment.name}
                                    </p>
                                    <p
                                    className={
                                      isOwnMessage
                                        ? "mt-1 text-xs text-white/70"
                                        : "mt-1 text-xs text-[#65556c]"
                                    }
                                  >
                                      {formatFileSize(attachment.size)}
                                    </p>
                                  </div>
                                  <span
                                  className={
                                    isOwnMessage
                                      ? "text-xs font-semibold uppercase tracking-[0.1em] text-white/70"
                                      : "text-xs font-semibold uppercase tracking-[0.1em] text-[#db5b43]"
                                  }
                                >
                                    Open
                                  </span>
                                </a>
                              )
                            )}
                          </div>
                        ) : null}
                          <p
                            className={
                              isOwnMessage
                                ? "mt-1.5 text-[0.62rem] text-white/50 text-right"
                                : "mt-1.5 text-[0.62rem] text-[#db5b43]/75 text-left"
                            }
                          >
                          {formatTimestamp(message.createdAt)}
                        </p>
                      </article>
                    );
                  })
                ) : (
                  <p className="text-base leading-7 text-[#65556c]">
                    No messages yet. Send the first one and turn the match into a real conversation.
                  </p>
                )}
                <div ref={messagesEndRef} />
              </div>

              {!hasStartedConversation ? (
                <div className="mt-5 flex flex-wrap gap-2">
                  {starterPrompts.map((prompt) => (
                    <button
                      className="rounded-full border border-[#24162d]/10 bg-white/60 px-3 py-2 text-sm text-[#24162d] transition hover:-translate-y-0.5"
                      key={prompt}
                      onClick={() => setMessageInput(prompt)}
                      type="button"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              ) : null}

              <form
                className="-mx-7 -mb-7 mt-auto grid shrink-0 gap-4 border-t border-[#24162d]/10 bg-[rgba(255,251,246,0.94)] px-7 py-5"
                onSubmit={(event) => {
                  event.preventDefault();

                  if (!selectedConversationId || (!messageInput.trim() && selectedFiles.length === 0)) {
                    return;
                  }

                  sendMessageMutation.mutate(selectedConversationId);
                }}
              >
                {selectedFiles.length ? (
                  <div className="flex flex-wrap gap-3">
                    {selectedFiles.map((file) => {
                      const previewUrl = file.type.startsWith("image/")
                        ? URL.createObjectURL(file)
                        : null;

                      return (
                        <div
                          className="relative rounded-[22px] border border-[#24162d]/10 bg-white px-3 py-3"
                          key={`${file.name}-${file.size}-${file.lastModified}`}
                        >
                          <button
                            className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-[#24162d] text-xs text-white"
                            onClick={() =>
                              setSelectedFiles((current) =>
                                current.filter(
                                  (item) =>
                                    !(
                                      item.name === file.name &&
                                      item.size === file.size &&
                                      item.lastModified === file.lastModified
                                    )
                                )
                              )
                            }
                            type="button"
                          >
                            ×
                          </button>
                          {previewUrl ? (
                            <img
                              alt={file.name}
                              className="h-24 w-24 rounded-[16px] object-cover"
                              onLoad={() => URL.revokeObjectURL(previewUrl)}
                              src={previewUrl}
                            />
                          ) : (
                            <div className="grid min-w-44 gap-1 pr-7">
                              <p className="truncate text-sm font-semibold text-[#24162d]">
                                {file.name}
                              </p>
                              <p className="text-xs text-[#65556c]">{formatFileSize(file.size)}</p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : null}

                {sendMessageMutation.error instanceof ApiError ? (
                  <p className="text-sm text-[#b53c27]">{sendMessageMutation.error.message}</p>
                ) : null}
                {recordingError ? (
                  <p className="text-sm text-[#b53c27]">{recordingError}</p>
                ) : null}
                <div className="rounded-[26px] border border-white/80 bg-[rgba(255,251,246,0.92)] px-3 py-2 shadow-[0_18px_45px_rgba(87,49,31,0.12)]">
                  <div className="flex items-center gap-2">
                    <label className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-[1.8rem] leading-none text-[#24162d] transition hover:bg-[#24162d]/6">
                      <input
                        accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.csv,.xlsx,.xls"
                        className="hidden"
                        multiple
                        onChange={(event) => {
                          const files = Array.from(event.target.files ?? []);
                          setSelectedFiles((current) => [...current, ...files].slice(0, 5));
                          event.target.value = "";
                        }}
                        type="file"
                      />
                      <span aria-hidden="true" className="-translate-y-[1px]">+</span>
                    </label>

                    {isRecording ? (
                      <div className="flex min-h-[2.5rem] flex-1 items-center justify-between gap-3 px-1 py-[0.45rem]">
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <span className="h-2.5 w-2.5 rounded-full bg-[#db5b43]" />
                          <span className="shrink-0 text-sm font-semibold text-[#24162d]">
                            {formatDuration(recordingElapsedSeconds)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 self-center">
                          <button
                            className="inline-flex h-10 items-center justify-center rounded-full border border-[#24162d]/10 bg-white px-3 text-xs font-semibold uppercase tracking-[0.08em] text-[#24162d]"
                            onClick={() => {
                              if (isRecordingPaused) {
                                resumeRecording();
                                return;
                              }

                              pauseRecording();
                            }}
                            type="button"
                          >
                            {isRecordingPaused ? "Resume" : "Pause"}
                          </button>
                          <button
                            className="inline-flex h-10 items-center justify-center rounded-full border border-[#db5b43]/20 bg-[#fff1ed] px-3 text-xs font-semibold uppercase tracking-[0.08em] text-[#db5b43]"
                            onClick={deleteRecording}
                            type="button"
                          >
                            Delete
                          </button>
                          {isRecordingPaused ? (
                            <button
                              className="inline-flex h-10 items-center justify-center rounded-full bg-[#24162d] px-3 text-xs font-semibold uppercase tracking-[0.08em] text-white"
                              onClick={finalizeRecording}
                              type="button"
                            >
                              Send
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ) : (
                      <textarea
                        className="max-h-32 min-h-[2.5rem] flex-1 resize-none bg-transparent px-1 py-[0.45rem] text-[0.98rem] leading-6 text-[#24162d] outline-none placeholder:text-transparent"
                        onChange={(event) => setMessageInput(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && !event.shiftKey) {
                            event.preventDefault();

                            if (
                              !selectedConversationId ||
                              (!messageInput.trim() && selectedFiles.length === 0)
                            ) {
                              return;
                            }

                            sendMessageMutation.mutate(selectedConversationId);
                          }
                        }}
                        placeholder=""
                        rows={1}
                        value={messageInput}
                      />
                    )}

                    <div className="flex items-center gap-2">
                      <button
                        className={
                          isRecording
                            ? "flex h-10 w-10 items-center justify-center rounded-full bg-[#db5b43] text-white shadow-[0_12px_28px_rgba(219,91,67,0.26)]"
                            : "flex h-10 w-10 items-center justify-center rounded-full border border-[#24162d]/10 bg-white/70 text-[#24162d] transition hover:bg-white"
                        }
                        onClick={() => {
                          if (isRecording) {
                            stopRecording();
                            return;
                          }

                          void startRecording();
                        }}
                        type="button"
                      >
                        <svg
                          aria-hidden="true"
                          className="h-4 w-4"
                          fill="none"
                          viewBox="0 0 16 16"
                        >
                          <rect
                            fill="currentColor"
                            height="7"
                            rx="3.5"
                            width="6"
                            x="5"
                            y="1"
                          />
                          <path
                            d="M3.5 7.5a4.5 4.5 0 0 0 9 0"
                            stroke="currentColor"
                            strokeLinecap="round"
                            strokeWidth="1.5"
                          />
                          <path
                            d="M8 12v2.5"
                            stroke="currentColor"
                            strokeLinecap="round"
                            strokeWidth="1.5"
                          />
                          <path
                            d="M5.5 14.5h5"
                            stroke="currentColor"
                            strokeLinecap="round"
                            strokeWidth="1.5"
                          />
                        </svg>
                      </button>
                      <button
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-[#24162d] text-white shadow-[0_12px_28px_rgba(36,22,45,0.22)] transition disabled:cursor-not-allowed disabled:bg-[#24162d]/35"
                        disabled={
                          isRecording ||
                          (!messageInput.trim() && selectedFiles.length === 0) ||
                          sendMessageMutation.isPending
                        }
                        type="submit"
                      >
                        {sendMessageMutation.isPending ? (
                          <span className="text-xs font-semibold uppercase tracking-[0.08em]">
                            ...
                          </span>
                        ) : (
                          <span aria-hidden="true" className="text-lg">↑</span>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </form>
            </div>
            ) : (
              <div className="flex min-h-[18rem] flex-1 items-center justify-center text-center">
                <p className="max-w-md text-base leading-7 text-[#65556c]">
                  Once you have a mutual like, the conversation will appear here automatically.
                </p>
              </div>
            )}
          </section>
      </div>

      {reportTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#24162d]/70 px-4 py-8">
          <div className="w-full max-w-xl rounded-[32px] border border-white/15 bg-[#fff7ee] p-6 shadow-[0_28px_90px_rgba(36,22,45,0.32)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className={labelClass}>Report profile</p>
                <h3 className="font-serif text-[clamp(1.5rem,3vw,2.2rem)] text-[#24162d]">
                  Report {reportTarget.userName}
                </h3>
                <p className="mt-2 text-sm leading-6 text-[#65556c]">
                  Pick the best reason and add any context that would help review the report.
                </p>
              </div>
              <button
                className="rounded-full border border-[#24162d]/10 bg-white/60 px-4 py-2 text-sm font-semibold text-[#24162d]"
                onClick={() => setReportTarget(null)}
                type="button"
              >
                Cancel
              </button>
            </div>

            <form
              className="mt-6 grid gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                reportMutation.mutate();
              }}
            >
              <label className="grid gap-2 text-sm text-[#65556c]">
                <span>Reason</span>
                <select
                  className="rounded-2xl border border-[#24162d]/10 bg-white/70 px-4 py-3 text-[#24162d] outline-none focus:border-[#db5b43] focus:ring-2 focus:ring-[#db5b43]/15"
                  onChange={(event) => setReportReason(event.target.value as ReportReason)}
                  value={reportReason}
                >
                  <option value="spam">Spam</option>
                  <option value="harassment">Harassment</option>
                  <option value="fake_profile">Fake profile</option>
                  <option value="inappropriate_content">Inappropriate content</option>
                  <option value="other">Other</option>
                </select>
              </label>

              <label className="grid gap-2 text-sm text-[#65556c]">
                <span>Details</span>
                <textarea
                  className="min-h-32 rounded-3xl border border-[#24162d]/10 bg-white/70 px-4 py-3 text-[#24162d] outline-none transition placeholder:text-[#65556c]/70 focus:border-[#db5b43] focus:ring-2 focus:ring-[#db5b43]/15"
                  onChange={(event) => setReportDetails(event.target.value)}
                  placeholder="Add any useful context here."
                  value={reportDetails}
                />
              </label>

              {reportMutation.error instanceof ApiError ? (
                <p className="text-sm text-[#b53c27]">{reportMutation.error.message}</p>
              ) : null}

              <div className="flex flex-wrap gap-3">
                <button
                  className="inline-flex items-center justify-center rounded-full border border-[#24162d]/10 bg-white/60 px-5 py-3 text-sm font-semibold text-[#24162d]"
                  onClick={() => setReportTarget(null)}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="inline-flex items-center justify-center rounded-full border border-[#24162d] bg-[#24162d] px-5 py-3 text-sm font-semibold text-white shadow-[0_28px_70px_rgba(87,49,31,0.18)] transition hover:-translate-y-0.5"
                  type="submit"
                >
                  {reportMutation.isPending ? "Submitting..." : "Submit report"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}
