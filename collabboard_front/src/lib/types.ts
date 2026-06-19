export type BoardRole = 'owner' | 'editor' | 'viewer';

export type User = {
  id: string;
  username: string;
  email: string;
  avatarColor: string;
  isActive: boolean;
};

export type AuthResponse = { access_token: string; user: User };

export type BoardMember = {
  id?: string;
  userId: string;
  role: BoardRole;
  username?: string;
  email?: string;
  avatarColor?: string;
};

export type Board = {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  isArchived: boolean;
  memberCount?: number;
  lastActivity?: string | null;
  members?: BoardMember[];
};

export type Note = {
  id: string;
  boardId: string;
  createdBy: string;
  title?: string;
  content?: string;
  color?: string;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  zIndex: number;
  version: number;
  isPinned: boolean;
  deletedAt?: string | null;
};

export type NoteHistory = {
  id: string;
  noteId: string;
  boardId: string;
  changedBy: string;
  operation: string;
  versionBefore?: number;
  versionAfter?: number;
  beforeSnapshot?: Record<string, unknown>;
  afterSnapshot?: Record<string, unknown>;
  changedFields?: string[];
};

export type ActiveUser = {
  userId: string;
  username: string;
  avatarColor: string;
  cursorX?: number;
  cursorY?: number;
  isTyping?: boolean;
  currentNoteId?: string | null;
  role?: BoardRole;
};

export type BoardState = { notes: Note[]; members: BoardMember[]; activeUsers: ActiveUser[] };
export type ConflictPayload = { noteId: string; currentVersion: number; currentNote: Note };
