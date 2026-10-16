import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { PDFDocument, rgb } from 'pdf-lib';
import { getStroke } from 'perfect-freehand';
import { identifyFile, FILE_TYPES } from './file-types.mjs';
import { processImage } from './images.mjs';
import { convertOffice } from './office-converter.mjs';

export class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }
const assert = (condition, message) => { if (!condition) throw new ApiError(400, message); };
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
export function validId(id) { assert(typeof id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(id), '无效的文件标识'); return id; }
async function atomicJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = file + '.' + crypto.randomUUID() + '.tmp';
  try { await fs.writeFile(temporary, JSON.stringify(value, null, 2)); await fs.rename(temporary, file); }
  finally { await fs.rm(temporary, { force: true }).catch(() => {}); }
}
async function readJson(file, fallback) { try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return fallback; throw e; } }
export function validateWorkspace(w) {
  assert(w?.version === 1 && typeof w.activeBoardId === 'string' && Array.isArray(w.boards) && w.boards.length > 0, '工作区格式无效');
  assert(w.boards.length <= 1000 && w.boards.every(b => b && typeof b.id === 'string' && typeof b.title === 'string' && Array.isArray(b.nodes) && Array.isArray(b.edges)), '白板格式无效');
  assert(w.boards.some(b => b.id === w.activeBoardId), '当前白板不存在');
  assert(Array.isArray(w.handwrittenNotes) && w.handwrittenNotes.length <= 10000, '笔记格式无效');
  const ids = new Set();
  for (const note of w.handwrittenNotes) {
    validId(note.id); assert(!ids.has(note.id), '笔记标识重复'); ids.add(note.id);
    assert(typeof note.title === 'string' && ['light', 'dark', 'green'].includes(note.theme) && Array.isArray(note.strokes), '手写笔记格式无效');
    validateStrokes(note.strokes);
  }
  return w;
}
function validateStrokes(strokes) {
  assert(strokes.length <= 20000, '笔画数量过多');
  let total = 0;
  for (const s of strokes) {
    assert(s && typeof s.id === 'string' && /^#[0-9a-f]{6}$/i.test(s.color) && Number.isFinite(s.width) && s.width > 0 && s.width <= 200, '笔画样式无效');
    assert(['pen', 'highlighter'].includes(s.tool) && typeof s.pressure === 'boolean' && typeof s.simulatePressure === 'boolean', '笔画工具无效');
    assert(Array.isArray(s.points) && s.points.length > 0 && s.points.length <= 200000, '笔画坐标无效');
    total += s.points.length; assert(total <= 2000000, '笔迹数据过大，请拆分笔记');
    assert(s.points.every(p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && Math.abs(p.x) < 1e7 && Math.abs(p.y) < 1e7 && Number.isFinite(p.pressure) && p.pressure >= 0 && p.pressure <= 1), '笔画坐标无效');
  }
}
export function validateAnnotations(value, doc) {
  assert(value?.version === 1 && value.pages && typeof value.pages === 'object' && !Array.isArray(value.pages), 'PDF 批注格式无效');
  assert(Object.keys(value.pages).length <= doc.getPageCount(), 'PDF 页码无效');
  for (const [key, page] of Object.entries(value.pages)) {
    const index = Number(key) - 1;
    assert(/^\d+$/.test(key) && Number.isInteger(index) && index >= 0 && index < doc.getPageCount(), 'PDF 页码无效');
    assert(page && Number.isFinite(page.width) && Number.isFinite(page.height) && page.width > 0 && page.height > 0 && page.width < 30000 && page.height < 30000, 'PDF 页面尺寸无效');
    const t = page.transform;
    assert(Array.isArray(t) && t.length === 6 && t.every(Number.isFinite), 'PDF 坐标变换无效');
    const determinant = t[0] * t[3] - t[1] * t[2];
    assert(Math.abs(determinant) > 1e-6 && Math.abs(determinant) < 1e6, 'PDF 坐标变换无效');
    // The four viewport corners must map to this page's crop box, including rotation.
    const box = doc.getPage(index).getCropBox();
    const corners = [[0, 0], [page.width, 0], [0, page.height], [page.width, page.height]].map(([x, y]) => inversePoint(t, x, y));
    const xs = corners.map(p => p[0]), ys = corners.map(p => p[1]);
    assert(Math.abs(Math.min(...xs) - box.x) < 1 && Math.abs(Math.max(...xs) - box.x - box.width) < 1 && Math.abs(Math.min(...ys) - box.y) < 1 && Math.abs(Math.max(...ys) - box.y - box.height) < 1, 'PDF 页面坐标与原件不匹配，请重新打开文件');
    assert(Array.isArray(page.strokes), 'PDF 笔迹无效'); validateStrokes(page.strokes);
  }
  return value;
}
export function inversePoint(t, x, y) {
  const [a, b, c, d, e, f] = t, det = a * d - b * c;
  return [(d * (x - e) - c * (y - f)) / det, (-b * (x - e) + a * (y - f)) / det];
}
function outlinePath(points) {
  let result = `M ${points[0][0]} ${points[0][1]} Q`;
  for (let i = 0; i < points.length; i++) { const p = points[i], n = points[(i + 1) % points.length]; result += ` ${p[0]} ${p[1]} ${(p[0] + n[0]) / 2} ${(p[1] + n[1]) / 2}`; }
  return result + ' Z';
}
export async function embedAnnotations(original, annotations) {
  const doc = await PDFDocument.load(original); validateAnnotations(annotations, doc);
  for (const [key, data] of Object.entries(annotations.pages)) {
    const page = doc.getPage(Number(key) - 1);
    for (const stroke of data.strokes) {
      const outline = getStroke(stroke.points, { size: stroke.width, thinning: stroke.pressure ? .6 : 0, smoothing: .65, streamline: .22, simulatePressure: stroke.simulatePressure, last: true });
      if (!outline.length) continue;
      const points = outline.map(([x, y]) => { const p = inversePoint(data.transform, x, y); return [p[0], -p[1]]; });
      const color = stroke.color.slice(1);
      page.drawSvgPath(outlinePath(points), { x: 0, y: 0, color: rgb(parseInt(color.slice(0, 2), 16) / 255, parseInt(color.slice(2, 4), 16) / 255, parseInt(color.slice(4, 6), 16) / 255), opacity: stroke.tool === 'highlighter' ? .3 : 1 });
    }
  }
  return doc.save();
}
export class LocalStore {
  constructor(directory) { this.directory = path.resolve(directory); this.queue = Promise.resolve(); this.conversions=Promise.resolve(); this.jobs=new Set(); }
  serialize(fn) { const next = this.queue.then(fn); this.queue = next.catch(() => {}); return next; }
  fileDir(id) { return path.join(this.directory, 'papers', validId(id)); }
  async init() {
    await fs.mkdir(this.directory, { recursive: true });
    for(const entry of await fs.readdir(path.join(this.directory,'papers'),{withFileTypes:true}).catch(()=>[])){
      if(!entry.isDirectory()||!/^[a-zA-Z0-9_-]{1,100}$/.test(entry.name))continue;
      const metadata=await readJson(path.join(this.fileDir(entry.name),'metadata.json'),null);
      if(metadata&&['queued','converting'].includes(metadata.previewStatus))this.queuePreview(entry.name);
    }
  }
  async workspace() { return readJson(path.join(this.directory, 'workspace.json'), null); }
  async saveWorkspace(w) {
    validateWorkspace(w);
    return this.serialize(async () => {
      const previous = await this.workspace();
      for (const note of w.handwrittenNotes) await atomicJson(path.join(this.directory, 'notes', validId(note.id) + '.json'), note);
      if (previous) await atomicJson(path.join(this.directory, 'workspace.previous.json'), previous);
      await atomicJson(path.join(this.directory, 'workspace.json'), w);
    });
  }
  async info(id) { const info = await readJson(path.join(this.fileDir(id), 'metadata.json'), null); if (!info) throw new ApiError(404, '文件不存在，请重新导入'); return {kind:'pdf',extension:'pdf',mimeType:'application/pdf',previewStatus:'ready',...info}; }
  async filePath(id, original = false) {
    const info = await this.info(id),dir=this.fileDir(id);
    if(info.kind==='pdf')return original?path.join(dir,'original.pdf'):path.join(dir,'revisions',info.revision,'document.pdf');
    const source=path.join(dir,'source','original.'+info.extension);
    if(original||info.kind==='image')return source;
    if(info.previewStatus!=='ready')throw new ApiError(info.previewStatus==='failed'?422:409,info.previewError||'文档正在准备，请稍候');
    return path.join(dir,'revisions',info.revision,info.kind==='word'?'document.docx':'document.pdf');
  }
  async pdfBasePath(id){
    const info=await this.info(id);
    if(info.kind==='pdf')return this.filePath(id,true);
    if(info.kind!=='presentation')throw new ApiError(415,'此文件不使用 PDF 基础页面');
    await this.filePath(id);
    return path.join(this.fileDir(id),'previews',info.previewBaseHash,'base.pdf');
  }
  async uploadFile(id,bytes,name,mime){
    const descriptor=await identifyFile(bytes,name,mime);
    if(descriptor.kind==='pdf')return this.upload(id,bytes,name);
    const image=descriptor.kind==='image'?await processImage(bytes):null;
    const result=await this.serialize(async()=>{
      const existing=await readJson(path.join(this.fileDir(id),'metadata.json'),null);
      if(existing){assert(existing.originalHash===hash(bytes),'文件标识已被使用');return this.info(id);}
      const dir=this.fileDir(id),revision=crypto.randomUUID(),ready=descriptor.kind==='image'||descriptor.extension==='docx';
      await fs.mkdir(path.join(dir,'source'),{recursive:true});
      await fs.writeFile(path.join(dir,'source','original.'+descriptor.extension),bytes);
      if(image)await fs.writeFile(path.join(dir,'thumbnail.webp'),image.thumbnail);
      if(descriptor.extension==='docx'){
        await fs.mkdir(path.join(dir,'revisions',revision),{recursive:true});
        await fs.writeFile(path.join(dir,'revisions',revision,'document.docx'),bytes);
      }
      const info={schemaVersion:2,id,...descriptor,name:String(name).replace(/[\\/\x00-\x1f]/g,'_').slice(0,240),revision,
        previewStatus:ready?'ready':'queued',originalHash:hash(bytes),currentHash:ready?hash(bytes):undefined,
        ...(image?{width:image.width,height:image.height}:{}),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
      await atomicJson(path.join(dir,'metadata.json'),info);return info;
    });
    if(result.previewStatus==='queued')this.queuePreview(id);
    return result;
  }
  queuePreview(id){
    if(this.jobs.has(id))return;
    this.jobs.add(id);
    this.conversions=this.conversions.catch(()=>{}).then(()=>this.prepareOffice(id)).catch(async error=>{
      await this.serialize(async()=>{const info=await this.info(id);await atomicJson(path.join(this.fileDir(id),'metadata.json'),{...info,previewStatus:'failed',previewError:error.status?error.message:'本地文档转换失败，请使用默认软件检查文件后重试'});});
    }).finally(()=>this.jobs.delete(id));
  }
  async requestPreview(id){
    const info=await this.info(id);if(!['word','presentation'].includes(info.kind)||info.extension==='docx')throw new ApiError(415,'此文件不需要转换');
    if(this.jobs.has(id))return info;
    await this.serialize(()=>atomicJson(path.join(this.fileDir(id),'metadata.json'),{...info,previewStatus:'queued',previewError:undefined}));
    this.queuePreview(id);return {...info,previewStatus:'queued'};
  }
  async prepareOffice(id){
    const initial=await this.info(id),dir=this.fileDir(id);
    await this.serialize(()=>atomicJson(path.join(dir,'metadata.json'),{...initial,previewStatus:'converting',previewError:undefined}));
    const source=await fs.readFile(await this.filePath(id,true)),sourceHash=hash(source),job=crypto.randomUUID();
    const jobDir=path.join(dir,'jobs',job),input=path.join(jobDir,'input.'+initial.extension);
    await fs.mkdir(jobDir,{recursive:true});await fs.writeFile(input,source);
    const output=await convertOffice(input,path.join(jobDir,'output'),initial.kind);
    let pages;
    if(initial.kind==='word')await identifyFile(output,'document.docx',FILE_TYPES.docx.mimeType);
    else{const pdf=await PDFDocument.load(output);pages=pdf.getPageCount();assert(pages>0,'演示文稿没有可预览页面');}
    await this.serialize(async()=>{
      const info=await this.info(id),revision=crypto.randomUUID(),revisionDir=path.join(dir,'revisions',revision);
      await fs.mkdir(revisionDir,{recursive:true});
      const extension=info.kind==='word'?'docx':'pdf';await fs.writeFile(path.join(revisionDir,'document.'+extension),output);
      const baseDir=path.join(dir,'previews',sourceHash);await fs.mkdir(baseDir,{recursive:true});await fs.writeFile(path.join(baseDir,'base.'+extension),output);
      if(info.kind==='presentation')await atomicJson(path.join(revisionDir,'annotations.json'),{version:1,pages:{}});
      await atomicJson(path.join(dir,'metadata.json'),{...info,revision,previousRevision:info.currentHash?info.revision:undefined,
        previewBaseHash:sourceHash,currentHash:hash(output),previewStatus:'ready',previewError:undefined,pages,updatedAt:new Date().toISOString()});
    });
  }
  async saveWord(id,bytes,expectedRevision){
    await identifyFile(bytes,'document.docx',FILE_TYPES.docx.mimeType);
    return this.serialize(async()=>{
      const info=await this.info(id);if(info.kind!=='word'||info.previewStatus!=='ready')throw new ApiError(415,'此文件当前无法编辑');
      if(expectedRevision!==info.revision)throw new ApiError(409,'Word 文件已更新，请先下载当前编辑稿，再重新打开以免覆盖');
      if(hash(await fs.readFile(await this.filePath(id)))!==info.currentHash)throw new ApiError(409,'Word 文件已被外部软件修改，请先下载当前编辑稿，再重新打开');
      const revision=crypto.randomUUID(),dir=path.join(this.fileDir(id),'revisions',revision);await fs.mkdir(dir,{recursive:true});
      await fs.writeFile(path.join(dir,'document.docx'),bytes);
      const result={...info,revision,previousRevision:info.revision,currentHash:hash(bytes),updatedAt:new Date().toISOString()};
      await atomicJson(path.join(this.fileDir(id),'metadata.json'),result);return result;
    });
  }
  async refreshExternalWord(id){
    return this.serialize(async()=>{
      const info=await this.info(id);if(info.kind!=='word'||info.previewStatus!=='ready')return info;
      const bytes=await fs.readFile(await this.filePath(id));if(hash(bytes)===info.currentHash)return info;
      await identifyFile(bytes,'document.docx',FILE_TYPES.docx.mimeType);
      const revision=crypto.randomUUID(),dir=path.join(this.fileDir(id),'revisions',revision);await fs.mkdir(dir,{recursive:true});
      await fs.writeFile(path.join(dir,'document.docx'),bytes);
      const result={...info,revision,previousRevision:info.revision,currentHash:hash(bytes),updatedAt:new Date().toISOString()};
      await atomicJson(path.join(this.fileDir(id),'metadata.json'),result);return result;
    });
  }
  async upload(id, bytes, name) {
    assert(bytes.length > 4 && bytes.length <= 100 * 1024 * 1024, 'PDF 文件大小必须在 100 MB 内');
    try { const doc = await PDFDocument.load(bytes); assert(doc.getPageCount() > 0, 'PDF 没有页面'); } catch (e) { if (e instanceof ApiError) throw e; throw new ApiError(400, '无法读取 PDF，文件可能损坏或已加密'); }
    return this.serialize(async () => {
      const existing = await readJson(path.join(this.fileDir(id), 'metadata.json'), null);
      if (existing) { assert(existing.originalHash === hash(bytes), '文件标识已被使用'); return existing; }
      const dir = this.fileDir(id), revision = crypto.randomUUID();
      await fs.mkdir(path.join(dir, 'revisions', revision), { recursive: true });
      await fs.writeFile(path.join(dir, 'original.pdf'), bytes);
      await fs.writeFile(path.join(dir, 'revisions', revision, 'document.pdf'), bytes);
      await atomicJson(path.join(dir, 'revisions', revision, 'annotations.json'), { version: 1, pages: {} });
      const info = { id, name: String(name || 'paper.pdf').replace(/[\\/\x00-\x1f]/g, '_').slice(0, 240), revision, originalHash: hash(bytes), currentHash: hash(bytes), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      await atomicJson(path.join(dir, 'metadata.json'), info); return info;
    });
  }
  async annotations(id) { const info = await this.info(id); if(!['pdf','presentation'].includes(info.kind))throw new ApiError(415,'此文件使用独立手写笔记');await this.filePath(id);return { ...await readJson(path.join(this.fileDir(id), 'revisions', info.revision, 'annotations.json'), { version: 1, pages: {} }), revision: info.revision }; }
  async saveAnnotations(id, value) {
    return this.serialize(async () => {
      const info = await this.info(id);
      if(!['pdf','presentation'].includes(info.kind))throw new ApiError(415,'此文件不支持 PDF 墨迹');
      if (value.revision !== info.revision) throw new ApiError(409, 'PDF 已在另一窗口更新，请重新打开后再编辑');
      const current = await fs.readFile(await this.filePath(id));
      if (hash(current) !== info.currentHash) throw new ApiError(409, 'PDF 已被其他软件修改。请先重新导入该版本，以保留外部修改');
      const original = await fs.readFile(info.kind==='presentation'?path.join(this.fileDir(id),'previews',info.previewBaseHash,'base.pdf'):await this.filePath(id, true));
      const annotations = { version: 1, pages: value.pages };
      const output = await embedAnnotations(original, annotations);
      const revision = crypto.randomUUID(), dir = path.join(this.fileDir(id), 'revisions', revision);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, 'document.pdf'), output); await atomicJson(path.join(dir, 'annotations.json'), annotations);
      await atomicJson(path.join(this.fileDir(id), 'metadata.json'), { ...info, revision, previousRevision: info.revision, currentHash: hash(output), updatedAt: new Date().toISOString() });
      // Keep original, current and previous revisions. A file open in a reader may be locked on Windows.
      const revisionRoot = path.resolve(path.dirname(dir));
      for (const entry of await fs.readdir(revisionRoot)) if (entry !== revision && entry !== info.revision) {
        const target = path.resolve(revisionRoot, entry);
        if (target.startsWith(revisionRoot + path.sep)) await fs.rm(target, { recursive: true, force: true }).catch(() => {});
      }
      return { ...annotations, revision };
    });
  }
}
