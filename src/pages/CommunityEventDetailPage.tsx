import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { nb } from 'date-fns/locale/nb';
import { AppLayout } from '@/components/layout/AppLayout';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import {
  loadCommunityEvent,
  respondToCommunityEvent,
  saveCommunityEvent,
} from '@/services/communityEvents';
import { loadAppUsers } from '@/services/users';
import { albumDownloadUrl, albumMediaFileUrl, createAlbum, loadAlbum, loadAlbumForEvent, uploadAlbumMediaFiles, type AlbumUploadProgress } from '@/services/albums';
import { MediaLightbox, type MediaLightboxItem } from '@/components/ui/MediaLightbox';
import { UploadProgress } from '@/components/album/UploadProgress';
import { hasBlockingObligation } from '@/store/photoObligationStore';
import { vocechatService } from '@/services/vocechat';
import { formatCommunityEventTimeRange } from '@/utils/communityEventTime';
import { prepareImageForUpload } from '@/utils/imageResize';
import type {
  AlbumMedia,
  AlbumSummary,
  CommunityEvent,
  CommunityEventComment,
  CommunityEventCommentReply,
  CommunityEventPerson,
  CommunityEventPoll,
  CommunityEventReactions,
  CommunityEventTodo,
  EventRsvpStatus,
  CommunityEventTimeProposal,
} from '@/types';
import styles from './CommunityEventDetailPage.module.css';

const RSVP_OPTIONS: Array<{ value: EventRsvpStatus; label: string }> = [
  { value: 'coming', label: 'Kommer' },
  { value: 'maybe', label: 'Kanskje' },
  { value: 'cannot', label: 'Kan ikke' },
];

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🎉'];

const EVENT_TYPES: Record<string, string> = {
  Sosialt: 'Sosialt',
  Fylla: 'Fylla',
  Gaming: 'Gaming',
  Skole: 'Skole',
  Egendefinert: 'Egendefinert',
};

/* ── Icons ─────────────────────────────────────────────────────────────────── */

interface IconProps {
  size?: number;
}

function Svg({ size = 16, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

function ClockIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15 14" />
    </Svg>
  );
}

function PinIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" />
      <circle cx="12" cy="10" r="3" />
    </Svg>
  );
}

function UserIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </Svg>
  );
}

function PollIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <line x1="6" y1="20" x2="6" y2="12" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="18" y1="20" x2="18" y2="15" />
    </Svg>
  );
}

function PhotoIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </Svg>
  );
}

function CalendarIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <line x1="8" y1="3" x2="8" y2="7" />
      <line x1="16" y1="3" x2="16" y2="7" />
    </Svg>
  );
}

function SmileIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
      <line x1="9" y1="9" x2="9.01" y2="9" />
      <line x1="15" y1="9" x2="15.01" y2="9" />
    </Svg>
  );
}

function CloseIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </Svg>
  );
}

function PlayIcon(props: IconProps) {
  return (
    <svg width={props.size ?? 14} height={props.size ?? 14} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function generateId() {
  return globalThis.crypto?.randomUUID?.() ?? `evt_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}

function getEventTitle(event: CommunityEvent) {
  return event.title.trim() || 'Uten tittel';
}

function getEventTypeLabel(event: CommunityEvent) {
  const type = event.eventType?.trim() || 'Sosialt';
  if (type === 'Egendefinert') {
    return event.customEventType?.trim() || 'Egendefinert';
  }
  return EVENT_TYPES[type] ?? type;
}

function getEventStatusLabel(event: CommunityEvent) {
  return event.status === 'draft' ? 'Kladd' : 'Publisert';
}

function getPersonAvatar(person: CommunityEventPerson) {
  return person.avatarUpdatedAt !== undefined
    ? vocechatService.avatarUrl(person.uid, person.avatarUpdatedAt)
    : vocechatService.avatarUrl(person.uid);
}

function formatDateTimeRange(startValue: string, endValue?: string) {
  return formatCommunityEventTimeRange(startValue, endValue, {
    locale: nb,
    startFormat: 'd. MMMM yyyy HH:mm',
  });
}

function getDefaultDateTimeLocal(offsetHours = 1) {
  const date = new Date();
  date.setHours(date.getHours() + offsetHours, 0, 0, 0);
  return format(date, "yyyy-MM-dd'T'HH:mm", { locale: nb });
}

function normalizeAssignee(users: CommunityEventPerson[], uid: number) {
  return users.find((user) => user.uid === uid) ?? null;
}

function cloneVotes(votes: number[], uid: number, allowMultiple: boolean) {
  if (allowMultiple) {
    const hasVote = votes.includes(uid);
    return hasVote ? votes.filter((vote) => vote !== uid) : [...votes, uid];
  }

  const currentlyVoted = votes.includes(uid);
  if (currentlyVoted) {
    return [];
  }

  return [uid];
}

function canEditEvent(event: CommunityEvent | null, user?: { uid: number; isAdmin?: boolean } | null) {
  if (!event || !user) return false;
  if (user.isAdmin) return true;

  const isOwner = event.createdBy.uid === user.uid;
  const isCoOrganizer = (event.coOrganizers ?? []).some((person) => person.uid === user.uid);

  if (event.status === 'draft') {
    return isOwner || isCoOrganizer;
  }

  if (event.editMode === 'open') {
    return true;
  }

  return isOwner || isCoOrganizer;
}

function resolvePerson(person: CommunityEventPerson, usersByUid: Map<number, CommunityEventPerson>) {
  return usersByUid.get(person.uid) ?? person;
}

/** Relative "for 5 min siden"-style stamp, with a fallback to a date for older posts. */
function formatPostTime(createdAt: number) {
  const diffMinutes = Math.round((Date.now() - createdAt) / 60000);

  if (diffMinutes < 1) return 'nå nettopp';
  if (diffMinutes < 60) return `${diffMinutes} min siden`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} t siden`;

  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 7) return `${diffDays} d siden`;

  return format(new Date(createdAt), 'd. MMM HH:mm', { locale: nb });
}

/** Toggles a uid in one emoji bucket, dropping buckets that end up empty. */
function toggleReaction(
  reactions: CommunityEventReactions | undefined,
  emoji: string,
  uid: number
): CommunityEventReactions {
  const current = reactions ?? {};
  const bucket = current[emoji] ?? [];
  const next = bucket.includes(uid) ? bucket.filter((value) => value !== uid) : [...bucket, uid];
  const result: CommunityEventReactions = { ...current, [emoji]: next };

  if (next.length === 0) {
    delete result[emoji];
  }

  return result;
}

/** Total votes cast in a poll — the denominator for the result bars. */
function countPollVotes(poll: CommunityEventPoll) {
  return poll.options.reduce((total, option) => total + option.votes.length, 0);
}

function EventPersonChip({
  person,
  usersByUid,
}: {
  person: CommunityEventPerson;
  usersByUid: Map<number, CommunityEventPerson>;
}) {
  const resolved = resolvePerson(person, usersByUid);

  return (
    <span className={styles.personChip} title={resolved.name}>
      <Avatar
        src={getPersonAvatar(resolved)}
        name={resolved.name}
        size="sm"
        className={styles.personAvatar}
      />
      <span>{resolved.name}</span>
    </span>
  );
}

export function CommunityEventDetailPage() {
  const { eventId = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [event, setEvent] = useState<CommunityEvent | null>(null);
  const [users, setUsers] = useState<CommunityEventPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');
  const [commentImage, setCommentImage] = useState('');
  const [composerOpen, setComposerOpen] = useState(false);
  const [pollOpen, setPollOpen] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [pollOptionImages, setPollOptionImages] = useState(['', '']);
  const [pollAllowMultiple, setPollAllowMultiple] = useState(false);
  const [timeModalOpen, setTimeModalOpen] = useState(false);
  const [postImageSrc, setPostImageSrc] = useState<string | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [openVoters, setOpenVoters] = useState<Record<string, boolean>>({});
  const [openPicker, setOpenPicker] = useState<string | null>(null);
  const [todoTitle, setTodoTitle] = useState('');
  const [todoMode, setTodoMode] = useState<CommunityEventTodo['mode']>('open');
  const [todoAssigneeUid, setTodoAssigneeUid] = useState('');
  const [todoComposerOpen, setTodoComposerOpen] = useState(false);
  const [album, setAlbum] = useState<AlbumSummary | null>(null);
  const [albumMedia, setAlbumMedia] = useState<AlbumMedia[]>([]);
  const [albumBusy, setAlbumBusy] = useState(false);
  const [albumProgress, setAlbumProgress] = useState<AlbumUploadProgress | null>(null);
  const [albumError, setAlbumError] = useState('');
  const [historyView, setHistoryView] = useState(true);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [slideshow, setSlideshow] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const rsvpCardRef = useRef<HTMLElement>(null);
  const pollNoticeRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const found = await loadAlbumForEvent(eventId);
        if (!cancelled) setAlbum(found);
      } catch {
        // Album backend may be unavailable — the rest of the page still works.
      }
    })();
    return () => { cancelled = true; };
  }, [eventId]);

  // Load the album's media so finished events can show photos inline.
  useEffect(() => {
    let cancelled = false;
    if (!album) {
      setAlbumMedia([]);
      return;
    }
    void (async () => {
      try {
        const full = await loadAlbum(album.id);
        if (!cancelled) setAlbumMedia(full.media);
      } catch {
        if (!cancelled) setAlbumMedia([]);
      }
    })();
    return () => { cancelled = true; };
  }, [album]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError('');

      try {
        const [loadedEvent, loadedUsers] = await Promise.all([
          loadCommunityEvent(eventId),
          loadAppUsers(),
        ]);

        if (!cancelled) {
          setEvent(loadedEvent);
          setUsers(loadedUsers);
        }
      } catch {
        if (!cancelled) {
          setError('Fant ikke arrangementet.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [eventId]);

  const usersByUid = useMemo(
    () => new Map(users.map((person) => [person.uid, person] as const)),
    [users]
  );

  const currentUserPerson = useMemo<CommunityEventPerson | null>(() => {
    if (!user) return null;
    return {
      uid: user.uid,
      name: user.name,
      ...(user.avatarUpdatedAt !== undefined ? { avatarUpdatedAt: user.avatarUpdatedAt } : {}),
    };
  }, [user]);

  const canEdit = canEditEvent(event, user);
  const isDraft = event?.status === 'draft';
  const finishMs = event ? Date.parse(event.endsAt || event.startsAt) : NaN;
  const isFinished =
    event?.status === 'published' &&
    event?.timeMode === 'fixed' &&
    Number.isFinite(finishMs) &&
    Date.now() >= finishMs;
  // Finished events default to the "Historikk" view; the toggle only appears then.
  const showHistory = isFinished && historyView;

  const albumLightboxItems = useMemo<MediaLightboxItem[]>(
    () => albumMedia.map((media) => ({
      key: media.id,
      type: media.type,
      src: albumMediaFileUrl(media.id),
      alt: 'Bilde fra arrangementet',
      downloadUrl: albumMediaFileUrl(media.id, { download: true }),
    })),
    [albumMedia],
  );
  const responseCounts = useMemo(() => {
    if (!event) {
      return { coming: 0, maybe: 0, cannot: 0 };
    }

    return {
      coming: event.responses.filter((response) => response.status === 'coming').length,
      maybe: event.responses.filter((response) => response.status === 'maybe').length,
      cannot: event.responses.filter((response) => response.status === 'cannot').length,
    };
  }, [event]);

  const nonResponders = useMemo(() => {
    if (!event) return [];
    const responded = new Set(event.responses.map((response) => response.uid));
    return users.filter((candidate) => !responded.has(candidate.uid));
  }, [event, users]);

  const timeProposals = event?.timeProposals ?? [];
  const comments = event?.comments ?? [];
  const todos = event?.todos ?? [];
  const todoAccessOpen = event?.todoEditingEnabled === true;
  const timeProposalEditingEnabled = event?.timeProposalEditingEnabled === true;
  const canAddTodos = Boolean(user) && (todoAccessOpen || canEdit);
  const canManageTodos = canEdit;
  const canAddTimeProposals = Boolean(user) && (canEdit || timeProposalEditingEnabled);
  const participantResponses = event?.responses ?? [];
  const myResponse = participantResponses.find((response) => response.uid === user?.uid) ?? null;
  const timeSummary = event?.timeMode === 'proposed'
    ? timeProposals.length > 0
      ? `Tid foreslås · ${timeProposals.length} forslag`
      : 'Tid foreslås'
    : event
      ? formatDateTimeRange(event.startsAt, event.endsAt)
      : '';

  const [proposalDraftStartsAt, setProposalDraftStartsAt] = useState(() => getDefaultDateTimeLocal());
  const [proposalDraftEndsAt, setProposalDraftEndsAt] = useState(() => getDefaultDateTimeLocal(2));

  const participantsByStatus = useMemo(() => {
    const groups = {
      coming: [] as CommunityEventPerson[],
      maybe: [] as CommunityEventPerson[],
      cannot: [] as CommunityEventPerson[],
    };

    if (!event) {
      return groups;
    }

    for (const response of event.responses) {
      const person = usersByUid.get(response.uid) ?? { uid: response.uid, name: response.name };
      groups[response.status].push(person);
    }

    return groups;
  }, [event, usersByUid]);

  function getVoters(votes: number[]) {
    return votes
      .map((uid) => usersByUid.get(uid) ?? { uid, name: `Ukjent (${uid})` })
      .filter((person, index, list) => list.findIndex((candidate) => candidate.uid === person.uid) === index);
  }

  function getProposalVoters(proposal: CommunityEventTimeProposal) {
    return getVoters(proposal.votes);
  }

  async function persistEvent(patch: Partial<CommunityEvent>) {
    if (!event) return null;
    setBusyAction('save');
    setError('');
    try {
      const updated = await saveCommunityEvent(event.id, patch);
      setEvent(updated);
      return updated;
    } catch {
      setError('Kunne ikke lagre endringen.');
      return null;
    } finally {
      setBusyAction(null);
    }
  }

  async function handleRespond(status: EventRsvpStatus) {
    if (!event || !user) return;
    if (hasBlockingObligation()) {
      setError('Du må laste opp bilder fra et tidligere arrangement før du kan svare. Se gjøremålet øverst.');
      return;
    }
    setBusyAction(`respond:${status}`);
    setError('');
    try {
      const updated = await respondToCommunityEvent(event.id, status);
      setEvent(updated);
    } catch {
      setError('Kunne ikke oppdatere svaret.');
    } finally {
      setBusyAction(null);
    }
  }

  async function handlePublish() {
    if (!event) return;
    await persistEvent({ status: 'published' });
  }

  async function handleAddPhotosClick() {
    if (!event) return;
    setAlbumError('');
    // Lazily create the album if the event was made without one.
    if (!album) {
      setAlbumBusy(true);
      try {
        const created = await createAlbum({ title: getEventTitle(event), eventId: event.id });
        setAlbum(created);
      } catch {
        setAlbumError('Kunne ikke opprette album.');
        setAlbumBusy(false);
        return;
      }
      setAlbumBusy(false);
    }
    photoInputRef.current?.click();
  }

  async function handleCreateAlbum() {
    if (!event || album) return;
    setAlbumBusy(true);
    setAlbumError('');
    try {
      const created = await createAlbum({ title: getEventTitle(event), eventId: event.id });
      setAlbum(created);
    } catch {
      setAlbumError('Kunne ikke opprette album.');
    } finally {
      setAlbumBusy(false);
    }
  }

  async function handlePhotoFiles(files: FileList | null) {
    if (!album || !files || files.length === 0) return;
    setAlbumBusy(true);
    setAlbumError('');
    setAlbumProgress({ done: 0, total: files.length, currentFraction: 0 });
    try {
      await uploadAlbumMediaFiles(album.id, Array.from(files), setAlbumProgress);
      const [refreshed, full] = await Promise.all([
        loadAlbumForEvent(album.eventId ?? eventId),
        loadAlbum(album.id),
      ]);
      if (refreshed) setAlbum(refreshed);
      setAlbumMedia(full.media);
    } catch (err) {
      setAlbumError(err instanceof Error ? err.message : 'Kunne ikke laste opp bildene.');
    } finally {
      setAlbumBusy(false);
      setAlbumProgress(null);
    }
  }

  async function handleSetFinalTime(proposal: CommunityEventTimeProposal) {
    if (!event) return;
    await persistEvent({
      timeMode: 'fixed',
      startsAt: proposal.startsAt,
      endsAt: proposal.endsAt,
    });
  }

  async function handleAddTimeProposal() {
    if (!event || !canAddTimeProposals || !user) return;

    const startsAt = new Date(proposalDraftStartsAt);
    const endsAt = new Date(proposalDraftEndsAt);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      setError('Velg et gyldig start- og sluttidspunkt.');
      return;
    }

    const nextProposal: CommunityEventTimeProposal = {
      id: generateId(),
      label: formatDateTimeRange(startsAt.toISOString(), endsAt.toISOString()),
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      votes: [],
    };

    await persistEvent({ timeProposals: [...timeProposals, nextProposal] });
    setProposalDraftStartsAt(getDefaultDateTimeLocal());
    setProposalDraftEndsAt(getDefaultDateTimeLocal(2));
  }

  async function handleVoteProposal(proposalId: string) {
    if (!event || !user) return;
    const nextProposals = timeProposals.map((proposal) => {
      if (proposal.id !== proposalId) {
        return proposal;
      }

      const votes = proposal.votes.includes(user.uid)
        ? proposal.votes.filter((vote) => vote !== user.uid)
        : [...proposal.votes, user.uid];

      return { ...proposal, votes };
    });

    await persistEvent({ timeProposals: nextProposals });
  }

  async function handleVotePoll(commentId: string, optionId: string) {
    if (!event || !user) return;

    const nextComments = comments.map((comment) => {
      const poll = comment.poll;
      if (comment.id !== commentId || !poll) {
        return comment;
      }

      const nextOptions = poll.options.map((option) => {
        if (option.id !== optionId) {
          if (!poll.allowMultiple) {
            return {
              ...option,
              votes: option.votes.filter((vote) => vote !== user.uid),
            };
          }
          return option;
        }

        const nextVotes = cloneVotes(option.votes, user.uid, Boolean(poll.allowMultiple));
        return {
          ...option,
          votes: nextVotes,
        };
      });

      return {
        ...comment,
        poll: {
          ...poll,
          options: nextOptions,
        },
      };
    });

    await persistEvent({ comments: nextComments });
  }

  function resetComposer() {
    setCommentText('');
    setCommentImage('');
    setComposerOpen(false);
    setPollOpen(false);
    setPollQuestion('');
    setPollOptions(['', '']);
    setPollOptionImages(['', '']);
    setPollAllowMultiple(false);
  }

  async function handleComposerImage(file: File | null) {
    if (!file) return;
    setError('');
    try {
      setCommentImage(await prepareImageForUpload(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunne ikke laste bildet.');
    }
  }

  async function handlePollOptionImage(index: number, file: File | null) {
    if (!file) return;

    setError('');
    try {
      const prepared = await prepareImageForUpload(file, 640, 0.8);
      setPollOptionImages((current) => current.map((value, i) => (i === index ? prepared : value)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunne ikke laste bildet.');
    }
  }

  function addPollOption() {
    setPollOptions((current) => [...current, '']);
    setPollOptionImages((current) => [...current, '']);
  }

  function removePollOption(index: number) {
    setPollOptions((current) => current.filter((_, i) => i !== index));
    setPollOptionImages((current) => current.filter((_, i) => i !== index));
  }

  async function handleAddComment() {
    if (!event || !user) return;

    const text = commentText.trim();
    const question = pollOpen ? pollQuestion.trim() : '';
    // An option counts when it has a label, a picture, or both.
    const options = pollOptions
      .map((label, index) => ({ label: label.trim(), imageUrl: pollOptionImages[index] ?? '' }))
      .filter((option) => option.label || option.imageUrl);

    if (!text && !commentImage && !question) {
      setError('Skriv noe, legg ved et bilde eller lag en avstemning.');
      return;
    }

    const author = currentUserPerson ?? { uid: user.uid, name: user.name };
    const newComment: CommunityEventComment = {
      id: generateId(),
      author,
      createdAt: Date.now(),
      ...(text ? { text } : {}),
      ...(commentImage ? { imageUrl: commentImage } : {}),
    };

    if (question) {
      if (options.length < 2) {
        setError('En avstemning må ha minst to alternativer.');
        return;
      }

      newComment.poll = {
        id: generateId(),
        question,
        allowMultiple: pollAllowMultiple,
        options: options.map((option) => ({
          id: generateId(),
          label: option.label,
          ...(option.imageUrl ? { imageUrl: option.imageUrl } : {}),
          votes: [],
        })),
        createdAt: Date.now(),
        createdBy: author,
      };
    }

    const updated = await persistEvent({
      comments: [...comments, newComment],
    });

    if (updated) {
      resetComposer();
    }
  }

  async function handleAddReply(commentId: string) {
    if (!event || !user) return;

    const text = (replyDrafts[commentId] ?? '').trim();
    if (!text) return;

    const author = currentUserPerson ?? { uid: user.uid, name: user.name };
    const reply: CommunityEventCommentReply = {
      id: generateId(),
      author,
      text,
      createdAt: Date.now(),
    };

    const nextComments = comments.map((comment) =>
      comment.id === commentId
        ? { ...comment, replies: [...(comment.replies ?? []), reply] }
        : comment
    );

    const updated = await persistEvent({ comments: nextComments });
    if (updated) {
      setReplyDrafts((current) => ({ ...current, [commentId]: '' }));
    }
  }

  async function handleReactToComment(commentId: string, emoji: string) {
    if (!event || !user) return;
    setOpenPicker(null);

    const nextComments = comments.map((comment) =>
      comment.id === commentId
        ? { ...comment, reactions: toggleReaction(comment.reactions, emoji, user.uid) }
        : comment
    );

    await persistEvent({ comments: nextComments });
  }

  async function handleReactToReply(commentId: string, replyId: string, emoji: string) {
    if (!event || !user) return;
    setOpenPicker(null);

    const nextComments = comments.map((comment) =>
      comment.id === commentId
        ? {
            ...comment,
            replies: (comment.replies ?? []).map((reply) =>
              reply.id === replyId
                ? { ...reply, reactions: toggleReaction(reply.reactions, emoji, user.uid) }
                : reply
            ),
          }
        : comment
    );

    await persistEvent({ comments: nextComments });
  }

  async function handleDeleteReply(commentId: string, replyId: string) {
    if (!event) return;

    const nextComments = comments.map((comment) =>
      comment.id === commentId
        ? { ...comment, replies: (comment.replies ?? []).filter((reply) => reply.id !== replyId) }
        : comment
    );

    await persistEvent({ comments: nextComments });
  }

  async function handleDeleteComment(commentId: string) {
    if (!event) return;
    await persistEvent({ comments: comments.filter((comment) => comment.id !== commentId) });
  }

  async function handleAddTodo() {
    if (!event || !canAddTodos || !currentUserPerson) return;

    const title = todoTitle.trim();
    if (!title) {
      setError('Skriv en oppgave.');
      return;
    }

    const assignee =
      todoMode === 'assigned' && todoAssigneeUid
        ? normalizeAssignee(users, Number(todoAssigneeUid))
        : null;

    if (todoMode === 'assigned' && !assignee) {
      setError('Velg en person for den tildelte oppgaven.');
      return;
    }

    const nextTodo: CommunityEventTodo = {
      id: generateId(),
      title,
      mode: todoMode,
      ...(assignee ? { assignee } : {}),
      createdAt: Date.now(),
    };

    await persistEvent({ todos: [...todos, nextTodo] });
    setTodoTitle('');
    setTodoMode('open');
    setTodoAssigneeUid('');
  }

  async function handleClaimTodo(todoId: string) {
    if (!event || !currentUserPerson) return;

    const nextTodos = todos.map((todo) => {
      if (todo.id !== todoId || todo.mode !== 'claimable' || todo.claimedBy) {
        return todo;
      }

      return {
        ...todo,
        claimedBy: currentUserPerson,
      };
    });

    await persistEvent({ todos: nextTodos });
  }

  async function handleRemoveTodo(todoId: string) {
    if (!event || !canAddTodos || !currentUserPerson) return;
    await persistEvent({ todos: todos.filter((todo) => todo.id !== todoId) });
  }

  async function handleToggleTodoEditing() {
    if (!event) return;
    await persistEvent({ todoEditingEnabled: !todoAccessOpen });
  }

  if (loading) {
    return (
      <AppLayout>
        <div className={styles.page}>
          <div className={styles.loadingState}>Laster arrangement ...</div>
        </div>
      </AppLayout>
    );
  }

  if (!event) {
    return (
      <AppLayout>
        <div className={styles.page}>
          <div className={styles.errorState}>
            <p className={styles.errorTitle}>Fant ikke arrangementet</p>
            <p className={styles.errorText}>{error || 'Det kan ha blitt slettet eller du mangler tilgang.'}</p>
            <Link to="/calendar" className={styles.backLink}>Tilbake til kalender</Link>
          </div>
        </div>
      </AppLayout>
    );
  }

  const feedComments = [...comments].sort((a, b) => b.createdAt - a.createdAt);
  const myUid = user?.uid ?? -1;

  // Things still waiting for this user's answer, surfaced as notices above the fold.
  const needsRsvp = Boolean(user) && !myResponse && event.status === 'published' && !showHistory;
  const needsTimeVote =
    Boolean(user) &&
    !showHistory &&
    event.timeMode !== 'fixed' &&
    timeProposals.length > 0 &&
    !timeProposals.some((proposal) => proposal.votes.includes(myUid));
  const unansweredPolls = user && !showHistory
    ? feedComments.filter(
        (comment) => comment.poll && !comment.poll.options.some((option) => option.votes.includes(myUid))
      )
    : [];
  const firstUnansweredPollId = unansweredPolls[0]?.id ?? null;
  const canPost = Boolean(user) && event.status === 'published' && !showHistory;
  const composerAvatar = currentUserPerson ? getPersonAvatar(currentUserPerson) : undefined;

  function renderPoll(comment: CommunityEventComment) {
    const poll = comment.poll;
    if (!poll) return null;

    const totalVotes = countPollVotes(poll);
    const hasImages = poll.options.some((option) => option.imageUrl);

    return (
      <div className={styles.pollBox}>
        <div className={styles.pollHeader}>
          <strong>{poll.question}</strong>
          <span>{poll.allowMultiple ? 'Flervalg' : 'Ett valg'} · {totalVotes} stemmer</span>
        </div>
        <div className={[styles.pollOptions, hasImages ? styles.pollOptionsGrid : ''].filter(Boolean).join(' ')}>
          {poll.options.map((option) => {
            const myVote = option.votes.includes(user?.uid ?? -1);
            const share = totalVotes > 0 ? Math.round((option.votes.length / totalVotes) * 100) : 0;

            const voters = getVoters(option.votes);
            const votersOpen = Boolean(openVoters[option.id]);

            return (
              <div
                key={option.id}
                className={[
                  styles.pollOption,
                  myVote ? styles.pollOptionActive : '',
                  option.imageUrl ? styles.pollOptionWithImage : '',
                ].filter(Boolean).join(' ')}
              >
                <button
                  type="button"
                  className={styles.pollOptionVote}
                  onClick={() => void handleVotePoll(comment.id, option.id)}
                  disabled={!user || busyAction === 'save'}
                  aria-pressed={myVote}
                >
                  {option.imageUrl && (
                    <img className={styles.pollOptionThumb} src={option.imageUrl} alt="" loading="lazy" />
                  )}
                  <span className={styles.pollOptionBody}>
                    <span className={styles.pollOptionFill} style={{ width: `${share}%` }} aria-hidden="true" />
                    <span className={styles.pollOptionLabel}>{option.label || 'Uten tekst'}</span>
                  </span>
                </button>

                <div className={styles.pollOptionMeta}>
                  {voters.length > 0 && (
                    <button
                      type="button"
                      className={styles.pollVotersToggle}
                      onClick={() =>
                        setOpenVoters((current) => ({ ...current, [option.id]: !current[option.id] }))
                      }
                      aria-expanded={votersOpen}
                    >
                      {votersOpen ? 'Skjul' : 'Vis hvem'}
                    </button>
                  )}
                  <strong className={styles.pollOptionCount}>{option.votes.length}</strong>
                </div>

                {votersOpen && voters.length > 0 && (
                  <div className={styles.pollVoters}>
                    {voters.map((person) => (
                      <EventPersonChip key={person.uid} person={person} usersByUid={usersByUid} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {totalVotes === 0 && <p className={styles.emptyTiny}>Ingen har stemt enda.</p>}
      </div>
    );
  }

  function renderReactionBar(
    key: string,
    reactions: CommunityEventReactions | undefined,
    onReact: (emoji: string) => void,
    compact = false
  ) {
    const entries = Object.entries(reactions ?? {}).filter(([, uids]) => uids.length > 0);
    const pickerOpen = openPicker === key;

    return (
      <div className={[styles.reactionBar, compact ? styles.reactionBarCompact : ''].filter(Boolean).join(' ')}>
        {entries.map(([emoji, uids]) => {
          const mine = uids.includes(myUid);
          const names = getVoters(uids).map((person) => person.name).join(', ');

          return (
            <button
              key={emoji}
              type="button"
              className={[styles.reactionChip, mine ? styles.reactionChipMine : ''].filter(Boolean).join(' ')}
              onClick={() => onReact(emoji)}
              disabled={!user || busyAction === 'save'}
              title={names}
            >
              <span className={styles.reactionEmoji}>{emoji}</span>
              <span>{uids.length}</span>
            </button>
          );
        })}

        {user && (
          <div className={styles.reactionPickerWrap}>
            <button
              type="button"
              className={styles.reactionAdd}
              onClick={() => setOpenPicker((current) => (current === key ? null : key))}
              aria-expanded={pickerOpen}
              aria-label="Reager"
            >
              <SmileIcon size={compact ? 14 : 16} />
              {!compact && <span>Reager</span>}
            </button>

            {pickerOpen && (
              <div className={styles.reactionPicker}>
                {REACTION_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className={styles.reactionPickerBtn}
                    onClick={() => onReact(emoji)}
                    disabled={busyAction === 'save'}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  const timeProposalList = (
    <>
      {canAddTimeProposals && (
        <div className={styles.proposalComposer}>
          <p className={styles.proposalComposerHint}>
            Legg inn et forslag med start og slutt. Flere forslag kan stå samtidig til noen fastsetter ett av dem.
          </p>
          <div className={styles.proposalComposerRow}>
            <label className={styles.field}>
              <span>Starttidspunkt</span>
              <input
                className={styles.input}
                type="datetime-local"
                value={proposalDraftStartsAt}
                onChange={(changeEvent) => setProposalDraftStartsAt(changeEvent.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span>Sluttidspunkt</span>
              <input
                className={styles.input}
                type="datetime-local"
                value={proposalDraftEndsAt}
                onChange={(changeEvent) => setProposalDraftEndsAt(changeEvent.target.value)}
              />
            </label>
          </div>
          <div className={styles.timeActions}>
            <Button type="button" size="sm" onClick={() => void handleAddTimeProposal()} disabled={busyAction === 'save'}>
              Legg til forslag
            </Button>
          </div>
        </div>
      )}

      {timeProposals.length === 0 ? (
        <p className={styles.emptyText}>Det er ikke lagt inn tidspunktsforslag enda.</p>
      ) : (
        <div className={styles.proposalList}>
          {timeProposals.map((proposal) => {
            const myVote = proposal.votes.includes(user?.uid ?? -1);
            return (
              <div key={proposal.id} className={styles.proposalRow}>
                <div className={styles.proposalInfo}>
                  <strong>{formatDateTimeRange(proposal.startsAt, proposal.endsAt)}</strong>
                  <span>{proposal.votes.length} kan</span>
                  {proposal.votes.length > 0 && (
                    <div className={styles.proposalVoterChips}>
                      {getProposalVoters(proposal).map((person) => (
                        <EventPersonChip key={person.uid} person={person} usersByUid={usersByUid} />
                      ))}
                    </div>
                  )}
                </div>
                <div className={styles.proposalActions}>
                  <button
                    type="button"
                    className={[styles.smallBtn, myVote ? styles.smallBtnActive : ''].filter(Boolean).join(' ')}
                    onClick={() => void handleVoteProposal(proposal.id)}
                    disabled={!user || busyAction === 'save'}
                  >
                    {myVote ? 'Stemt' : 'Stem'}
                  </button>
                  {canEdit && (
                    <button
                      type="button"
                      className={styles.smallBtn}
                      onClick={() => void handleSetFinalTime(proposal)}
                      disabled={busyAction === 'save'}
                    >
                      Fastsett
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );

  return (
    <AppLayout>
      <div className={styles.page}>
        <article className={styles.shell}>
          <header className={styles.hero}>
            {event.imageUrl ? (
              <img className={styles.heroImage} src={event.imageUrl} alt="" />
            ) : (
              <div className={styles.heroFallback}>
                <span>{getEventTypeLabel(event)}</span>
              </div>
            )}
            <div className={styles.heroOverlay} />
            <div className={styles.heroContent}>
              <div className={styles.heroTopRow}>
                <div className={styles.heroBadges}>
                  <span className={styles.typeBadge}>{getEventTypeLabel(event)}</span>
                  {isDraft && <span className={styles.statusBadgeDraft}>{getEventStatusLabel(event)}</span>}
                  {event.timeMode === 'proposed' && <span className={styles.statusBadgeMuted}>Tid foreslås</span>}
                </div>

                {canEdit && (
                  <div className={styles.headerActions}>
                    <Button size="sm" variant="secondary" onClick={() => navigate(`/arrangementer/${event.id}/rediger`)}>
                      Rediger
                    </Button>
                    {isDraft && (
                      <Button size="sm" onClick={() => void handlePublish()} loading={busyAction === 'save'}>
                        Publiser
                      </Button>
                    )}
                  </div>
                )}
              </div>

              <h1 className={styles.title}>{getEventTitle(event)}</h1>
              <div className={styles.subtitleRow}>
                <span>{timeSummary}</span>
                {event.location && <span>{event.location}</span>}
                <span>{participantResponses.length} svar</span>
              </div>
            </div>
          </header>

          {(needsRsvp || needsTimeVote || unansweredPolls.length > 0) && (
            <div className={styles.noticeStack}>
              {needsRsvp && (
                <div className={styles.noticeBar}>
                  <span>Du har ikke svart på dette arrangementet.</span>
                  <button
                    type="button"
                    className={styles.noticeBarAction}
                    onClick={() => rsvpCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                  >
                    Svar nå
                  </button>
                </div>
              )}

              {needsTimeVote && (
                <div className={styles.noticeBar}>
                  <span>Du har ikke stemt på tidspunkt ({timeProposals.length} forslag).</span>
                  <button
                    type="button"
                    className={styles.noticeBarAction}
                    onClick={() => setTimeModalOpen(true)}
                  >
                    Se forslag
                  </button>
                </div>
              )}

              {unansweredPolls.length > 0 && (
                <div className={styles.noticeBar}>
                  <span>
                    {unansweredPolls.length === 1
                      ? 'Du har ikke svart på en avstemning.'
                      : `Du har ikke svart på ${unansweredPolls.length} avstemninger.`}
                  </span>
                  <button
                    type="button"
                    className={styles.noticeBarAction}
                    onClick={() => pollNoticeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                  >
                    Gå til avstemning
                  </button>
                </div>
              )}
            </div>
          )}

          {isFinished && (
            <div className={styles.actionBar}>
              <div className={styles.viewToggle}>
                <button
                  type="button"
                  className={[styles.viewToggleBtn, !historyView ? styles.viewToggleBtnActive : ''].filter(Boolean).join(' ')}
                  onClick={() => setHistoryView(false)}
                  aria-pressed={!historyView}
                >
                  Planlegging
                </button>
                <button
                  type="button"
                  className={[styles.viewToggleBtn, historyView ? styles.viewToggleBtnActive : ''].filter(Boolean).join(' ')}
                  onClick={() => setHistoryView(true)}
                  aria-pressed={historyView}
                >
                  Historikk
                </button>
              </div>
            </div>
          )}

          <input
            ref={photoInputRef}
            type="file"
            accept="image/*,video/*,.heic,.heif"
            multiple
            style={{ display: 'none' }}
            onChange={(changeEvent) => { void handlePhotoFiles(changeEvent.target.files); changeEvent.target.value = ''; }}
          />

          <div className={styles.content}>
            <section className={styles.mainColumn}>
              <section className={styles.card}>
                <div className={styles.cardBody}>
                  {event.description ? (
                    <p className={styles.description}>{event.description}</p>
                  ) : (
                    <p className={styles.emptyText}>Ingen beskrivelse er lagt inn enda.</p>
                  )}

                  <div className={styles.metaChips}>
                    <span className={styles.metaChip}><ClockIcon /> {timeSummary}</span>
                    {event.location && <span className={styles.metaChip}><PinIcon /> {event.location}</span>}
                    <span className={styles.metaChip}><UserIcon /> {resolvePerson(event.createdBy, usersByUid).name}</span>
                  </div>

                  {event.timeMode !== 'fixed' && (
                    <button type="button" className={styles.timeTrigger} onClick={() => setTimeModalOpen(true)}>
                      <span className={styles.timeTriggerLabel}><CalendarIcon /> Foreslå tidspunkt</span>
                      <span className={styles.timeTriggerCount}>
                        {timeProposals.length > 0 ? `${timeProposals.length} forslag` : 'Ingen forslag'}
                      </span>
                    </button>
                  )}
                </div>
              </section>

              {showHistory && (
                <section className={styles.card}>
                  <div className={styles.cardHeader}>
                    <h2 className={styles.cardTitle}>Bilder fra arrangementet</h2>
                    {album && (
                      <Link className={styles.cardLink} to={`/galleri/album/${album.id}`}>
                        Se album{album.mediaCount ? ` (${album.mediaCount})` : ''}
                      </Link>
                    )}
                  </div>
                  <div className={styles.cardBody}>
                    {!album && (
                      <div className={styles.albumEmpty}>
                        <p className={styles.emptyText}>Det er ikke laget noe album for dette arrangementet enda.</p>
                        <Button size="sm" onClick={() => void handleCreateAlbum()} loading={albumBusy}>
                          Opprett album
                        </Button>
                      </div>
                    )}

                    {album && albumMedia.length > 0 && (
                      <>
                        <div className={styles.albumActions}>
                          <Button size="sm" variant="secondary" onClick={() => { setSlideshow(true); setLightboxIndex(0); }}>
                            Lysbildefremvisning
                          </Button>
                          <a className={styles.downloadBtn} href={albumDownloadUrl(album.id)} download>
                            Last ned album
                          </a>
                        </div>

                        <div className={styles.photoGrid}>
                          {albumMedia.map((media, i) => (
                            <button
                              key={media.id}
                              type="button"
                              className={styles.photoItem}
                              onClick={() => setLightboxIndex(i)}
                              aria-label="Åpne bilde"
                            >
                              <img
                                className={styles.photoThumb}
                                src={albumMediaFileUrl(media.id, { thumbnail: true })}
                                alt=""
                                loading="lazy"
                              />
                              {media.type === 'video' && <span className={styles.playBadge}><PlayIcon /></span>}
                            </button>
                          ))}
                        </div>
                      </>
                    )}

                    {album && albumMedia.length === 0 && (
                      <p className={styles.emptyText}>Ingen bilder er lagt inn enda. Vær den første!</p>
                    )}

                    <div className={styles.albumFooter}>
                      <Button size="sm" onClick={() => void handleAddPhotosClick()} loading={albumBusy}>
                        <PhotoIcon /> Legg til bilder
                      </Button>
                    </div>
                    {albumProgress && <UploadProgress progress={albumProgress} />}
                    {albumError && <p className={styles.emptyText}>{albumError}</p>}
                  </div>
                </section>
              )}

              {canPost && (
                <section className={styles.composerCard}>
                  {composerOpen ? (
                    <div className={styles.composerOpen}>
                      <div className={styles.composerTop}>
                        {currentUserPerson && (
                          <Avatar src={composerAvatar} name={currentUserPerson.name} size="md" />
                        )}
                        <textarea
                          ref={composerRef}
                          className={styles.composerInput}
                          rows={3}
                          value={commentText}
                          onChange={(changeEvent) => setCommentText(changeEvent.target.value)}
                          placeholder="Skriv noe til gjengen ..."
                        />
                      </div>

                      {commentImage && (
                        <div className={styles.composerImage}>
                          <img src={commentImage} alt="" />
                          <button
                            type="button"
                            className={styles.composerImageRemove}
                            onClick={() => setCommentImage('')}
                            aria-label="Fjern bildet"
                          >
                            <CloseIcon size={14} />
                          </button>
                        </div>
                      )}

                      {pollOpen && (
                        <div className={styles.pollComposer}>
                          <input
                            className={styles.input}
                            value={pollQuestion}
                            onChange={(changeEvent) => setPollQuestion(changeEvent.target.value)}
                            placeholder="Hva skal dere stemme over?"
                          />

                          <div className={styles.pollOptionEditor}>
                            {pollOptions.map((value, index) => (
                              <div key={index} className={styles.pollOptionRow}>
                                {pollOptionImages[index] ? (
                                  <div className={styles.pollOptionPreview}>
                                    <img src={pollOptionImages[index]} alt="" />
                                    <button
                                      type="button"
                                      className={styles.pollOptionPreviewRemove}
                                      onClick={() =>
                                        setPollOptionImages((current) =>
                                          current.map((image, i) => (i === index ? '' : image))
                                        )
                                      }
                                      aria-label="Fjern bildet"
                                    >
                                      <CloseIcon size={14} />
                                    </button>
                                  </div>
                                ) : (
                                  <label
                                    className={styles.pollOptionImageBtn}
                                    title={`Legg til bilde på alternativ ${index + 1}`}
                                  >
                                    <PhotoIcon />
                                    <input
                                      type="file"
                                      accept="image/*"
                                      className={styles.fileInput}
                                      onChange={(changeEvent) => {
                                        const file = changeEvent.target.files?.[0] ?? null;
                                        changeEvent.target.value = '';
                                        void handlePollOptionImage(index, file);
                                      }}
                                    />
                                  </label>
                                )}
                                <input
                                  className={styles.input}
                                  value={value}
                                  onChange={(changeEvent) => {
                                    const next = [...pollOptions];
                                    next[index] = changeEvent.target.value;
                                    setPollOptions(next);
                                  }}
                                  placeholder={`Alternativ ${index + 1}`}
                                />
                                {pollOptions.length > 2 && (
                                  <button
                                    type="button"
                                    className={styles.pollOptionRemove}
                                    onClick={() => removePollOption(index)}
                                    aria-label={`Fjern alternativ ${index + 1}`}
                                  >
                                    <CloseIcon size={14} />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>

                          <div className={styles.pollComposerFooter}>
                            <button type="button" className={styles.smallBtn} onClick={addPollOption}>
                              + Alternativ
                            </button>
                            <label className={styles.checkboxRow}>
                              <input
                                type="checkbox"
                                checked={pollAllowMultiple}
                                onChange={(changeEvent) => setPollAllowMultiple(changeEvent.target.checked)}
                              />
                              <span>Flervalg</span>
                            </label>
                          </div>
                        </div>
                      )}

                      <div className={styles.composerActions}>
                        <div className={styles.composerTools}>
                          <label className={styles.composerTool}>
                            <PhotoIcon /> Bilde
                            <input
                              type="file"
                              accept="image/*"
                              className={styles.fileInput}
                              onChange={(changeEvent) => {
                                const file = changeEvent.target.files?.[0] ?? null;
                                changeEvent.target.value = '';
                                void handleComposerImage(file);
                              }}
                            />
                          </label>
                          <button
                            type="button"
                            className={[styles.composerTool, pollOpen ? styles.composerToolActive : ''].filter(Boolean).join(' ')}
                            onClick={() => setPollOpen((open) => !open)}
                            aria-pressed={pollOpen}
                          >
                            <PollIcon /> Avstemning
                          </button>
                        </div>
                        <div className={styles.composerSubmit}>
                          <Button type="button" size="sm" variant="secondary" onClick={resetComposer} disabled={busyAction === 'save'}>
                            Avbryt
                          </Button>
                          <Button type="button" size="sm" onClick={() => void handleAddComment()} loading={busyAction === 'save'}>
                            Publiser
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className={styles.composerTrigger}
                      onClick={() => {
                        setComposerOpen(true);
                        window.setTimeout(() => composerRef.current?.focus(), 0);
                      }}
                    >
                      {currentUserPerson && (
                        <Avatar src={composerAvatar} name={currentUserPerson.name} size="md" />
                      )}
                      <span className={styles.composerPlaceholder}>Skriv noe til gjengen ...</span>
                      <span className={styles.composerTriggerIcons}>
                        <PhotoIcon size={18} />
                        <PollIcon size={18} />
                      </span>
                    </button>
                  )}

                </section>
              )}

              {feedComments.length === 0 ? (
                <section className={styles.card}>
                  <div className={styles.cardBody}>
                    <p className={styles.emptyText}>Ingen innlegg enda. Start praten!</p>
                  </div>
                </section>
              ) : (
                <div className={styles.feed}>
                  {feedComments.map((comment) => {
                    const resolvedAuthor = resolvePerson(comment.author, usersByUid);
                    const canDelete = canEdit || comment.author.uid === user?.uid;

                    return (
                      <article
                        key={comment.id}
                        className={styles.post}
                        ref={comment.id === firstUnansweredPollId ? pollNoticeRef : undefined}
                      >
                        <header className={styles.postHeader}>
                          <Avatar
                            src={getPersonAvatar(resolvedAuthor)}
                            name={resolvedAuthor.name}
                            size="md"
                            className={styles.postAvatar}
                          />
                          <div className={styles.postAuthor}>
                            <strong>{resolvedAuthor.name}</strong>
                            <span>{formatPostTime(comment.createdAt)}</span>
                          </div>
                          {canDelete && (
                            <button
                              type="button"
                              className={styles.postDelete}
                              onClick={() => void handleDeleteComment(comment.id)}
                              disabled={busyAction === 'save'}
                              aria-label="Slett innlegget"
                            >
                              <CloseIcon size={14} />
                            </button>
                          )}
                        </header>

                        {comment.text && <p className={styles.postText}>{comment.text}</p>}

                        {comment.imageUrl && (
                          <button
                            type="button"
                            className={styles.postImageBtn}
                            onClick={() => setPostImageSrc(comment.imageUrl ?? null)}
                            aria-label="Åpne bilde"
                          >
                            <img className={styles.postImage} src={comment.imageUrl} alt="" loading="lazy" />
                          </button>
                        )}

                        {renderPoll(comment)}

                        {renderReactionBar(`comment:${comment.id}`, comment.reactions, (emoji) =>
                          void handleReactToComment(comment.id, emoji)
                        )}

                        {(comment.replies ?? []).length > 0 && (
                          <div className={styles.replyList}>
                            {(comment.replies ?? []).map((reply) => {
                              const replyAuthor = resolvePerson(reply.author, usersByUid);
                              const canDeleteReply = canEdit || reply.author.uid === user?.uid;

                              return (
                                <div key={reply.id} className={styles.reply}>
                                  <Avatar
                                    src={getPersonAvatar(replyAuthor)}
                                    name={replyAuthor.name}
                                    size="sm"
                                    className={styles.replyAvatar}
                                  />
                                  <div className={styles.replyBubble}>
                                    <div className={styles.replyHeader}>
                                      <strong>{replyAuthor.name}</strong>
                                      <span>{formatPostTime(reply.createdAt)}</span>
                                    </div>
                                    <p className={styles.replyText}>{reply.text}</p>
                                    {renderReactionBar(
                                      `reply:${reply.id}`,
                                      reply.reactions,
                                      (emoji) => void handleReactToReply(comment.id, reply.id, emoji),
                                      true
                                    )}
                                  </div>
                                  {canDeleteReply && (
                                    <button
                                      type="button"
                                      className={styles.replyDelete}
                                      onClick={() => void handleDeleteReply(comment.id, reply.id)}
                                      disabled={busyAction === 'save'}
                                      aria-label="Slett kommentaren"
                                    >
                                      <CloseIcon size={13} />
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {canPost && (
                          <div className={styles.replyComposer}>
                            {currentUserPerson && (
                              <Avatar
                                src={composerAvatar}
                                name={currentUserPerson.name}
                                size="sm"
                                className={styles.replyAvatar}
                              />
                            )}
                            <input
                              className={styles.replyInput}
                              value={replyDrafts[comment.id] ?? ''}
                              onChange={(changeEvent) =>
                                setReplyDrafts((current) => ({ ...current, [comment.id]: changeEvent.target.value }))
                              }
                              onKeyDown={(keyEvent) => {
                                if (keyEvent.key === 'Enter' && !keyEvent.shiftKey) {
                                  keyEvent.preventDefault();
                                  void handleAddReply(comment.id);
                                }
                              }}
                              placeholder="Skriv en kommentar ..."
                            />
                            <button
                              type="button"
                              className={styles.replySend}
                              onClick={() => void handleAddReply(comment.id)}
                              disabled={busyAction === 'save' || !(replyDrafts[comment.id] ?? '').trim()}
                            >
                              Send
                            </button>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            <aside className={styles.sidebar}>
              {!showHistory && (
                <section className={styles.sideCard}>
                  <div className={styles.sideCardHeader}>
                    <h2 className={styles.sideTitle}>To-dos</h2>
                    <span className={styles.cardHint}>{todos.length}</span>
                  </div>
                  <div className={styles.sideCardBody}>
                    {todos.length === 0 ? (
                      <p className={styles.emptyText}>Ingen oppgaver er lagt til ennå.</p>
                    ) : (
                      <div className={styles.todoList}>
                        {todos.map((todo) => {
                          const claimedBy = todo.claimedBy ? resolvePerson(todo.claimedBy, usersByUid) : null;
                          const assignee = todo.assignee ? resolvePerson(todo.assignee, usersByUid) : null;
                          const badgeLabel =
                            todo.mode === 'open'
                              ? 'Alle'
                              : todo.mode === 'assigned'
                                ? 'Tildelt'
                                : claimedBy
                                  ? `${claimedBy.name} fikser!`
                                  : 'Hvem fikser?';
                          const badgeClass =
                            todo.mode === 'open'
                              ? styles.todoBadgeOpen
                              : todo.mode === 'assigned'
                                ? styles.todoBadgeAssigned
                                : claimedBy
                                  ? styles.todoBadgeSuccess
                                  : styles.todoBadgeWarning;

                          return (
                            <div key={todo.id} className={styles.todoRow}>
                              <div className={styles.todoMain}>
                                <div className={styles.todoTitleRow}>
                                  <span className={styles.todoTitle}>{todo.title}</span>
                                  <span className={[styles.todoBadge, badgeClass].filter(Boolean).join(' ')}>
                                    {badgeLabel}
                                  </span>
                                </div>
                                {todo.mode === 'assigned' && assignee && (
                                  <div className={styles.todoMeta}>Tildelt {assignee.name}</div>
                                )}
                              </div>
                              <div className={styles.todoActions}>
                                {todo.mode === 'claimable' && !todo.claimedBy && (
                                  <button
                                    type="button"
                                    className={styles.smallBtn}
                                    onClick={() => void handleClaimTodo(todo.id)}
                                    disabled={!user || busyAction === 'save'}
                                  >
                                    Ta oppgaven
                                  </button>
                                )}
                                {canManageTodos && (
                                  <button
                                    type="button"
                                    className={styles.smallBtnDanger}
                                    onClick={() => void handleRemoveTodo(todo.id)}
                                    disabled={busyAction === 'save'}
                                  >
                                    Slett
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {canEdit && !todoAccessOpen && (
                      <p className={styles.todoLockedNote}>Oppgaver er låst. Arrangøren kan åpne dem for alle.</p>
                    )}

                    {canAddTodos && !todoComposerOpen && (
                      <Button type="button" size="sm" variant="secondary" onClick={() => setTodoComposerOpen(true)}>
                        Legg til oppgave
                      </Button>
                    )}

                    {canAddTodos && todoComposerOpen && (
                      <div className={styles.todoComposer}>
                        <input
                          className={styles.input}
                          value={todoTitle}
                          onChange={(changeEvent) => setTodoTitle(changeEvent.target.value)}
                          placeholder="Skriv en oppgave"
                        />
                        <select
                          className={styles.select}
                          value={todoMode}
                          onChange={(changeEvent) => setTodoMode(changeEvent.target.value as CommunityEventTodo['mode'])}
                        >
                          <option value="open">Alle</option>
                          <option value="assigned">Tildelt</option>
                          <option value="claimable">Hvem fikser?</option>
                        </select>

                        {todoMode === 'assigned' && (
                          <select
                            className={styles.select}
                            value={todoAssigneeUid}
                            onChange={(changeEvent) => setTodoAssigneeUid(changeEvent.target.value)}
                          >
                            <option value="">Velg person</option>
                            {users.map((candidate) => (
                              <option key={candidate.uid} value={candidate.uid}>
                                {candidate.name}
                              </option>
                            ))}
                          </select>
                        )}

                        <div className={styles.todoComposerActions}>
                          <Button type="button" size="sm" onClick={() => void handleAddTodo()} loading={busyAction === 'save'}>
                            Legg til
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => setTodoComposerOpen(false)}
                            disabled={busyAction === 'save'}
                          >
                            Skjul
                          </Button>
                        </div>
                      </div>
                    )}

                    {canEdit && (
                      <button
                        type="button"
                        className={styles.todoAccessToggle}
                        onClick={() => void handleToggleTodoEditing()}
                        disabled={busyAction === 'save'}
                        aria-pressed={todoAccessOpen}
                      >
                        {todoAccessOpen ? 'To-dos: åpne for alle' : 'To-dos: låst'}
                      </button>
                    )}
                  </div>
                </section>
              )}

              <section className={styles.sideCard} ref={rsvpCardRef}>
                <div className={styles.sideCardHeader}>
                  <h2 className={styles.sideTitle}>{showHistory ? 'Deltatt' : 'Påmelding'}</h2>
                </div>
                <div className={styles.sideCardBody}>
                  {!showHistory && (
                    <div className={styles.responseButtons}>
                      {RSVP_OPTIONS.map((option) => {
                        const active = myResponse?.status === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            className={[styles.rsvpAction, active ? styles.rsvpActionActive : ''].filter(Boolean).join(' ')}
                            onClick={() => void handleRespond(option.value)}
                            disabled={!user || busyAction === `respond:${option.value}`}
                          >
                            <span>{option.label}</span>
                            <span className={styles.rsvpActionCount}>{responseCounts[option.value]}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <div className={styles.participantGroups}>
                    {(showHistory ? RSVP_OPTIONS.filter((option) => option.value !== 'cannot') : RSVP_OPTIONS).map((option) => (
                      <div key={option.value} className={styles.participantGroup}>
                        <div className={styles.participantGroupTitle}>
                          {showHistory && option.value === 'coming' ? 'Deltok' : option.label}{' '}
                          <span>({participantsByStatus[option.value].length})</span>
                        </div>
                        <div className={styles.participantList}>
                          {participantsByStatus[option.value].length === 0 ? (
                            <span className={styles.emptyTiny}>Ingen</span>
                          ) : (
                            participantsByStatus[option.value].map((person) => (
                              <EventPersonChip key={person.uid} person={person} usersByUid={usersByUid} />
                            ))
                          )}
                        </div>
                      </div>
                    ))}
                    {!showHistory && (
                      <div className={styles.participantGroup}>
                        <div className={styles.participantGroupTitle}>
                          Ikke svart <span>({nonResponders.length})</span>
                        </div>
                        <div className={styles.participantList}>
                          {nonResponders.length === 0 ? (
                            <span className={styles.emptyTiny}>Alle har svart</span>
                          ) : (
                            nonResponders.map((person) => (
                              <EventPersonChip key={person.uid} person={person} usersByUid={usersByUid} />
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </section>

              {!showHistory && (
                <section className={styles.sideCard}>
                  <div className={styles.sideCardHeader}>
                    <h2 className={styles.sideTitle}>Bilder</h2>
                    {album && (
                      <Link className={styles.cardLink} to={`/galleri/album/${album.id}`}>
                        Album{album.mediaCount ? ` (${album.mediaCount})` : ''}
                      </Link>
                    )}
                  </div>
                  <div className={styles.sideCardBody}>
                    <p className={styles.cardHint}>Bilder og video havner i albumet og i galleriet.</p>
                    <Button size="sm" onClick={() => void handleAddPhotosClick()} loading={albumBusy}>
                      <PhotoIcon /> Legg til bilder
                    </Button>
                    {albumProgress && <UploadProgress progress={albumProgress} />}
                    {albumError && <p className={styles.emptyText}>{albumError}</p>}
                  </div>
                </section>
              )}

              <section className={styles.sideCard}>
                <div className={styles.sideCardHeader}>
                  <h2 className={styles.sideTitle}>Detaljer</h2>
                </div>
                <div className={styles.sideCardBody}>
                  <div className={styles.infoLine}>
                    <span>Dato</span>
                    <strong>{timeSummary}</strong>
                  </div>
                  {event.location && (
                    <div className={styles.infoLine}>
                      <span>Sted</span>
                      <strong>{event.location}</strong>
                    </div>
                  )}
                  <div className={styles.infoLine}>
                    <span>Status</span>
                    <strong>{getEventStatusLabel(event)}</strong>
                  </div>
                  <div className={styles.infoLine}>
                    <span>Redigering</span>
                    <strong>{event.editMode === 'open' ? 'Åpen' : 'Låst'}</strong>
                  </div>

                  {event.timeMode !== 'fixed' && (
                    <button type="button" className={styles.timeTrigger} onClick={() => setTimeModalOpen(true)}>
                      <span className={styles.timeTriggerLabel}><CalendarIcon /> Tidsforslag</span>
                      <span className={styles.timeTriggerCount}>{timeProposals.length}</span>
                    </button>
                  )}

                  <div className={styles.sideDivider} />
                  <div className={styles.organizerRow}>
                    <EventPersonChip person={event.createdBy} usersByUid={usersByUid} />
                    {(event.coOrganizers ?? []).map((person) => (
                      <EventPersonChip key={person.uid} person={person} usersByUid={usersByUid} />
                    ))}
                  </div>
                </div>
              </section>
            </aside>
          </div>

          {error && <div className={styles.errorBanner}>{error}</div>}
        </article>

        {lightboxIndex !== null && albumLightboxItems[lightboxIndex] && (
          <MediaLightbox
            items={albumLightboxItems}
            index={lightboxIndex}
            onIndexChange={setLightboxIndex}
            onClose={() => { setLightboxIndex(null); setSlideshow(false); }}
            startSlideshow={slideshow}
          />
        )}

        {postImageSrc && (
          <MediaLightbox
            items={[{ key: 'post', type: 'image', src: postImageSrc, alt: 'Bilde fra innlegg' }]}
            index={0}
            onIndexChange={() => {}}
            onClose={() => setPostImageSrc(null)}
          />
        )}

        {timeModalOpen && createPortal(
          <div
            className={styles.modalOverlay}
            role="presentation"
            onClick={(clickEvent) => {
              if (clickEvent.target === clickEvent.currentTarget) setTimeModalOpen(false);
            }}
          >
            <div className={styles.modal} role="dialog" aria-modal="true" aria-label="Tidspunkter">
              <div className={styles.modalHeader}>
                <h2 className={styles.modalTitle}>Tidspunkter</h2>
                <button
                  type="button"
                  className={styles.modalClose}
                  onClick={() => setTimeModalOpen(false)}
                  aria-label="Lukk"
                >
                  <CloseIcon size={15} />
                </button>
              </div>
              <div className={styles.modalBody}>
                <p className={styles.cardHint}>
                  Foreslått tidspunkt brukes når dere vil stemme fram et tidspunkt før arrangøren låser det.
                </p>
                {timeProposalList}
              </div>
            </div>
          </div>,
          document.body,
        )}
      </div>
    </AppLayout>
  );
}
