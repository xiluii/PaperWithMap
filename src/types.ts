import type { Node, Edge } from '@xyflow/react';

export type ReadStatus = 'unread' | 'reading' | 'read';
export type LayoutMode = 'canvas' | 'timeline' | 'graph';
export type ViewMode = 'board' | 'library' | 'favorites' | 'recent' | 'handwriting' | 'conversations';
export type CardField = 'authors' | 'year' | 'tags' | 'preview' | 'venue' | 'status' | 'abstract' | 'content' | 'remark' | 'dimensions';
export type CardAppearance = { fields?:Partial<Record<CardField,boolean>>; scale?:number };
export type AssetKind = 'pdf' | 'word' | 'presentation' | 'image';
export type AssetDescriptor = {kind:AssetKind;extension:string;mimeType:string;size:number;previewStatus:'queued'|'converting'|'ready'|'failed';width?:number;height?:number};
export type FileInfo = AssetDescriptor & {id:string;name:string;revision:string;previewError?:string;pages?:number};
export type PaperData = {
  title: string; authors: string; year?: number; venue: string;
  tags: string[]; status: ReadStatus; starred: boolean; abstract: string;
  addedAt: string; readAt?: string; fileId?: string; fileName?: string;
  thumbnail?: string; pages?: number; accent: string; doi?: string; url?: string;
  sample?: boolean; appearance?:CardAppearance;
  asset?:AssetDescriptor;remark?:string;
};
export type TextData = { title: string; html: string; color: 'yellow' | 'green' | 'pink' | 'white'; createdAt: string; appearance?:CardAppearance;sourceFileId?:string;aiSource?:{conversationId:string;messageId:string} };
export type SectionData = { title: string; subtitle: string };
export type PaperNode = Node<PaperData, 'paper'>;
export type TextNode = Node<TextData, 'text'>;
export type SectionNode = Node<SectionData, 'section'>;
export type AppNode = PaperNode | TextNode | SectionNode;
export type AppEdge = Edge<{ relation: string; directed: boolean }>;
export type Board = {
  id: string; title: string; description: string; color: string;
  nodes: AppNode[]; edges: AppEdge[]; mode: LayoutMode;
  freePositions?: Record<string, {x: number; y: number}>;
  timelineBy?: 'year' | 'read'; updatedAt: string;
  cardDefaults?:CardAppearance;
};
export type InkTheme = 'light' | 'dark' | 'green';
export type InkPoint = { x: number; y: number; pressure: number };
export type InkStroke = { id: string; points: InkPoint[]; color: string; width: number; tool: 'pen' | 'highlighter'; pressure: boolean; simulatePressure: boolean };
export type NoteAnchor = { boardId: string; nodeId: string };
export type HandwrittenNote = {
  id: string; title: string; theme: InkTheme; strokes: InkStroke[];
  anchor: NoteAnchor | null; fileId?: string; createdAt: string; updatedAt: string; deletedAt?: string;
};
export type PdfPageInk = { width:number; height:number; transform:number[]; strokes:InkStroke[] };
export type PdfAnnotations = { version:1; revision:string; pages:Record<string,PdfPageInk> };
export type Workspace = { version: 1; activeBoardId: string; boards: Board[]; handwrittenNotes: HandwrittenNote[] };
export type BoardSnapshot = { board: Board; anchors: Record<string, NoteAnchor | null> };
export const STATUS_LABELS: Record<ReadStatus, string> = {unread:'待读',reading:'阅读中',read:'已读'};
