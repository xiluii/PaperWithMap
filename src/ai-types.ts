import type { AssetKind, NoteAnchor } from './types';

export type ReadingContext = {kind:'document'|'selection'|'page'|'image';text:string;page?:number;pages?:number;image?:string;hasImage?:boolean};
export type ChatSource = {fileId:string;title:string;fileName:string;kind:AssetKind;anchor:NoteAnchor};
export type ChatMessage = {id:string;role:'user'|'assistant';text:string;createdAt:string;status:'streaming'|'completed'|'interrupted'|'failed';model?:string;effort?:string;error?:string;context?:ReadingContext;contextLabel?:{kind:ReadingContext['kind'];page?:number;pages?:number;characters:number};noteAnchor?:NoteAnchor};
export type Conversation = {version:1;id:string;title:string;source:ChatSource;messages:ChatMessage[];createdAt:string;updatedAt:string;hasDocumentContext?:boolean};
export type ConversationSummary = Omit<Conversation,'messages'|'version'> & {messageCount:number;excerpt:string;status?:ChatMessage['status']};
export type ConversationPage = {items:ConversationSummary[];total:number;page:number;pageSize:number};
export type AiAccount = {id:string;label:string;email:string;connected:boolean;planEnabled:boolean;plan?:string};
export type AiStatus = {activeId:string|null;accounts:AiAccount[];pending:boolean;provider?:'codex'|'siwc';available?:boolean;phase?:'idle'|'browser'|'verifying'|'device';login?:{method:'device';userCode:string;verificationUrl:string};error:string};
export type AiModel = {id:string;name:string;defaultReasoningEffort?:string;supportedReasoningEfforts?:{reasoningEffort:string;description:string}[]};
export type SaveAiNote = (conversation:Conversation,message:ChatMessage)=>Promise<NoteAnchor>;
