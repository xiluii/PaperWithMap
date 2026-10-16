import type { HandwrittenNote,NoteAnchor,PaperData,Workspace } from '../types';
import type { SaveAiNote } from '../ai-types';
export type FileReaderProps={paper:PaperData;anchor:NoteAnchor;workspace:Workspace;saveState:'saved'|'saving'|'error';onClose:()=>void;onRead:()=>void;onCreateNote:()=>string;onUpdateNote:(id:string,patch:Partial<HandwrittenNote>)=>void;onBindNote:(id:string)=>void;onUpdate:(patch:Partial<PaperData>)=>void;onSaveAiNote:SaveAiNote};
