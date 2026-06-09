export interface User {
  uid: number;
  name: string;
  email: string;
  avatarUpdatedAt?: number;
  isAdmin?: boolean;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface LoginResponse {
  server_id: string;
  token: string;
  refresh_token: string;
  expired_in: number;
  user: UserInfo;
}

export interface Group {
  gid: number;
  name: string;
  description?: string;
  icon?: string;
  member_count?: number;
}

export type FileFilterType = 'Doc' | 'PDF' | 'Image' | 'Audio' | 'Video';

export interface VoceChatFile {
  mid: number;
  from_uid: number;
  gid: number;
  ext: string;
  content_type: string;
  content: string;
  thumbnail?: string;
  properties: string;
  created_at: number;
  expired: boolean;
}

export interface GetFilesQuery {
  uid?: number;
  gid?: number;
  file_type?: FileFilterType;
  creation_time_type?: 'Day1' | 'Day7' | 'Day30' | 'Day90' | 'Day180';
  page?: number;
  page_size?: number;
}

export type MessageTarget =
  | { gid: number }
  | { uid: number };

export type ChatMessageProperties = Record<string, unknown> & {
  local_id?: number;
  content_type?: string;
  name?: string;
  size?: number;
};

interface MessageBaseDetail {
  content_type: string;
  content: string;
  properties?: ChatMessageProperties;
}

export interface MessageNormalDetail extends MessageBaseDetail {
  type: 'normal';
  mid?: number;
  expires_in?: number;
}

export interface MessageReplyDetail extends MessageBaseDetail {
  type: 'reply';
  mid: number;
}

export interface MessageReactionEditDetail extends MessageBaseDetail {
  type: 'edit';
}

export interface MessageReactionLikeDetail {
  type: 'like';
  action: string;
}

export interface MessageReactionDeleteDetail {
  type: 'delete';
}

export interface MessageReactionDetail {
  type: 'reaction';
  mid: number;
  detail: MessageReactionEditDetail | MessageReactionLikeDetail | MessageReactionDeleteDetail;
}

export interface MessageCommandDetail extends Record<string, unknown> {
  type: 'command';
}

export type VoceChatMessageDetail =
  | MessageNormalDetail
  | MessageReplyDetail
  | MessageReactionDetail
  | MessageCommandDetail;

export interface VoceChatHistoryMessage {
  mid: number;
  from_uid: number;
  created_at: number;
  target: MessageTarget;
  detail: VoceChatMessageDetail;
}

export interface SSEChatEvent extends VoceChatHistoryMessage {
  type: 'chat';
}

export interface ChatMessage {
  mid: number;
  from_uid: number;
  created_at: number;
  target: MessageTarget;
  content: string;
  content_type: string;
  properties?: ChatMessageProperties;
  reply_mid?: number;
  detail_type?: VoceChatMessageDetail['type'];
}

export interface UserInfo {
  uid: number;
  email?: string;
  name: string;
  gender: number;
  language: string;
  is_admin: boolean;
  is_bot: boolean;
  avatar_updated_at: number;
  create_by: string;
  msg_smtp_notify_enable: boolean;
  birthday?: number;
}

export type { Theme } from '@/config/themes';

export interface CalendarEvent {
  id: string;
  title: string;
  date: Date;
  color?: string;
}

export type EventRsvpStatus = 'coming' | 'maybe' | 'cannot';

export type CommunityEventStatus = 'draft' | 'published';
export type CommunityEventEditMode = 'open' | 'locked';
export type CommunityEventTimeMode = 'fixed' | 'proposed';
export type CommunityEventTodoMode = 'open' | 'assigned' | 'claimable';

export interface CommunityEventPerson {
  uid: number;
  name: string;
  avatarUpdatedAt?: number;
}

export interface CommunityEventTimeProposal {
  id: string;
  label: string;
  startsAt: string;
  endsAt?: string;
  votes: number[];
}

export interface CommunityEventPollOption {
  id: string;
  label: string;
  votes: number[];
}

export interface CommunityEventPoll {
  id: string;
  question: string;
  allowMultiple: boolean;
  options: CommunityEventPollOption[];
  createdAt: number;
  createdBy: CommunityEventPerson;
}

export interface CommunityEventComment {
  id: string;
  author: CommunityEventPerson;
  text?: string;
  createdAt: number;
  poll?: CommunityEventPoll;
}

export interface CommunityEventTodo {
  id: string;
  title: string;
  mode: CommunityEventTodoMode;
  assignee?: CommunityEventPerson;
  claimedBy?: CommunityEventPerson;
  completedAt?: number;
  createdAt: number;
}

export interface EventResponse {
  uid: number;
  name: string;
  status: EventRsvpStatus;
  respondedAt: number;
}

export interface CommunityEvent {
  id: string;
  title: string;
  startsAt: string;
  endsAt?: string;
  location?: string;
  description?: string;
  createdAt: number;
  createdBy: CommunityEventPerson;
  responses: EventResponse[];
  status?: CommunityEventStatus;
  updatedAt?: number;
  publishedAt?: number;
  imageUrl?: string;
  eventType?: string;
  customEventType?: string;
  timeMode?: CommunityEventTimeMode;
  timeProposals?: CommunityEventTimeProposal[];
  timeProposalEditingEnabled?: boolean;
  editMode?: CommunityEventEditMode;
  coOrganizers?: CommunityEventPerson[];
  comments?: CommunityEventComment[];
  todos?: CommunityEventTodo[];
  todoEditingEnabled?: boolean;
}

export interface CommunityEventInput {
  title: string;
  startsAt?: string;
  endsAt?: string;
  location?: string;
  description?: string;
  imageUrl?: string;
  eventType?: string;
  customEventType?: string;
  timeMode?: CommunityEventTimeMode;
  timeProposals?: CommunityEventTimeProposal[];
  timeProposalEditingEnabled?: boolean;
  editMode?: CommunityEventEditMode;
  coOrganizers?: CommunityEventPerson[];
  comments?: CommunityEventComment[];
  todos?: CommunityEventTodo[];
  todoEditingEnabled?: boolean;
  responses?: EventResponse[];
  status?: CommunityEventStatus;
  id?: string;
}

export interface OverheardQuote {
  id: string;
  text: string;
  author: string;
  createdAt?: number;
  createdBy?: Pick<User, 'uid' | 'name'>;
}

export interface OverheardQuoteInput {
  text: string;
  author: string;
}

// ─── Feed ─────────────────────────────────────────────────────────────────────

export interface FeedReaction {
  emoji: string;
  uid: number;
  actorName: string;
}

export interface FeedItemBase {
  id: string;
  type: string;
  source: 'internal' | 'github' | string;
  createdAt: number;
  actorUid?: number;
  actorName?: string;
  reactions?: FeedReaction[];
}

export interface EventCreatedFeedItem extends FeedItemBase {
  type: 'community_event_created';
  source: 'internal';
  payload: CommunityEvent;
}

export interface OverheardAddedFeedItem extends FeedItemBase {
  type: 'overheard_added';
  source: 'internal';
  payload: OverheardQuote;
}

export interface GitHubIssuePayload {
  repo: string;
  number: number;
  title: string;
  url: string;
  user: string;
  userAvatarUrl?: string;
  body?: string;
  action: 'opened' | 'closed' | 'reopened';
}

export interface GitHubPRPayload {
  repo: string;
  number: number;
  title: string;
  url: string;
  user: string;
  userAvatarUrl?: string;
  body?: string;
  action: 'opened' | 'closed' | 'reopened';
  merged: boolean;
}

export interface GitHubIssueFeedItem extends FeedItemBase {
  type: 'github_issue_opened' | 'github_issue_closed' | 'github_issue_reopened';
  source: 'github';
  payload: GitHubIssuePayload;
}

export interface GitHubPRFeedItem extends FeedItemBase {
  type: 'github_pr_opened' | 'github_pr_merged' | 'github_pr_closed' | 'github_pr_reopened';
  source: 'github';
  payload: GitHubPRPayload;
}

export interface StatusrapportFeedItem extends FeedItemBase {
  type: 'statusrapport_created';
  source: 'internal';
  payload: {
    text: string;
    imageId?: string;
    actorAvatarUpdatedAt?: number;
  };
}

export interface LampToggledFeedItem extends FeedItemBase {
  type: 'lamp_toggled';
  source: 'internal';
  payload: { isOn: boolean };
}

export interface WheelSpinResultFeedItem extends FeedItemBase {
  type: 'wheel_spin_result';
  source: 'internal';
  payload: { winner: string; totalOptions: number };
}

export interface PigsRoundScoreFeedItem extends FeedItemBase {
  type: 'pigs_round_score';
  source: 'internal';
  payload: { score: number };
}

export type KnownFeedItem =
  | EventCreatedFeedItem
  | OverheardAddedFeedItem
  | GitHubIssueFeedItem
  | GitHubPRFeedItem
  | PigsRoundScoreFeedItem
  | WheelSpinResultFeedItem
  | LampToggledFeedItem
  | StatusrapportFeedItem;

/**
 * Broad type for any item in the feed — used in the store, panel, and SSE hook
 * where the specific shape doesn't matter. All known item types are assignable to this.
 *
 * Use KnownFeedItem (a proper discriminated union) when you need to narrow on `type`
 * and access a typed `payload`, e.g. inside card components.
 */
export type AnyFeedItem = FeedItemBase & { type: string; payload: unknown };

export interface FeedPage {
  items: AnyFeedItem[];
  hasMore: boolean;
}

// ── GitHub Dev types ─────────────────────────────────────────────────────────

export interface GitHubLabel {
  id: number;
  name: string;
  color: string;
  description?: string;
}

export interface GitHubActor {
  login: string;
  avatar_url: string;
  html_url: string;
}

export interface GitHubIssue {
  number: number;
  title: string;
  body?: string;
  state: 'open' | 'closed';
  html_url: string;
  labels: GitHubLabel[];
  assignees: GitHubActor[];
  user: GitHubActor;
  created_at: string;
  updated_at: string;
  comments: number;
  node_id?: string;
}

export interface GitHubPR {
  number: number;
  title: string;
  state: 'open' | 'closed';
  html_url: string;
  user: GitHubActor;
  head: { ref: string };
  base: { ref: string };
  draft: boolean;
  created_at: string;
  updated_at: string;
}

export interface GitHubRelease {
  id: number;
  tag_name: string;
  name?: string;
  body?: string;
  published_at: string;
  html_url: string;
  prerelease: boolean;
}

export interface GitHubWorkflowRun {
  id: number;
  name: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: 'success' | 'failure' | 'cancelled' | 'skipped' | null;
  html_url: string;
  created_at: string;
  updated_at: string;
  head_branch: string;
  head_commit: { message: string };
}

export interface GitHubComment {
  id: number;
  body: string;
  user: GitHubActor;
  created_at: string;
  updated_at: string;
  html_url: string;
}

export interface IssueDetail {
  issue: GitHubIssue;
  comments: GitHubComment[];
  assignableUsers: GitHubActor[];
}

export interface ProjectStatusOption {
  id: string;
  name: string;
}

export interface ProjectItem {
  id: string;
  status: string | null;
  statusOptionId: string | null;
  issue: GitHubIssue;
}

export interface GitHubProject {
  id: string;
  title: string;
  statusField: { id: string; options: ProjectStatusOption[] } | null;
  items: ProjectItem[];
}

export interface DevData {
  project: GitHubProject | null;
  pullRequests: GitHubPR[];
  releases: GitHubRelease[];
  workflowRuns: GitHubWorkflowRun[];
  labels: GitHubLabel[];
}
