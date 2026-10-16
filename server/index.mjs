import http from 'node:http';
import { promises as fs, createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import open from 'open';
import { ApiError, LocalStore } from './storage.mjs';
import { officeCapabilities } from './office-converter.mjs';
import { FILE_TYPES } from './file-types.mjs';
import { AiService } from './ai-service.mjs';
import { DictionaryService } from './dictionary-service.mjs';

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const json = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
async function body(req, limit) {
  const chunks = []; let length = 0;
  for await (const chunk of req) { length += chunk.length; if (length > limit) throw new ApiError(413, '数据过大'); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
async function jsonBody(req) { if (!req.headers['content-type']?.startsWith('application/json')) throw new ApiError(415, '请使用 JSON 请求'); try { return JSON.parse((await body(req, 64 * 1024 * 1024)).toString()); } catch (e) { if (e instanceof ApiError) throw e; throw new ApiError(400, 'JSON 格式无效'); } }
async function sendFile(req, res, file, type = 'application/pdf', name) {
  const stat = await fs.stat(file), range = req.headers.range;
  const headers = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  if (name) headers['Content-Disposition'] = `inline; filename*=UTF-8''${encodeURIComponent(name)}`;
  let start = 0, end = stat.size - 1, status = 200;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) throw new ApiError(416, '无效的文件读取范围');
    if (!match[1]) start = Math.max(0, stat.size - Number(match[2])); else { start = Number(match[1]); if (match[2]) end = Math.min(end, Number(match[2])); }
    if (start > end || start >= stat.size) { res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }); res.end(); return; }
    status = 206; headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
  }
  headers['Content-Length'] = end - start + 1; res.writeHead(status, headers);
  if (req.method === 'HEAD') return res.end();
  createReadStream(file, { start, end }).on('error', () => res.destroy()).pipe(res);
}
export async function createLocalServer({ directory = process.env.PAPERLY_DATA_DIR || path.join(projectDir, 'data'), openFile = target => open(target), aiOptions = {}, dictionaryOptions = {} } = {}) {
  const store = new LocalStore(directory); await store.init();
  const ai = new AiService(store, { openBrowser: openFile, ...aiOptions }); await ai.init();
  const dictionary = new DictionaryService(dictionaryOptions);
  const server = http.createServer(async (req, res) => {
    try {
      const host = req.headers.host || '';
      if (!/^(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(host)) throw new ApiError(403, '只接受本机访问');
      const origin = req.headers.origin;
      if (origin && !/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(origin)) throw new ApiError(403, '不允许来自外部网页的请求');
      const url = new URL(req.url, 'http://' + host), p = url.pathname, method = req.method;
      if (p === '/api/dictionary/lookup' && method === 'POST') {
        if (!req.headers['content-type']?.startsWith('application/json')) throw new ApiError(415, '请使用 JSON 请求');
        let input;
        try { input = JSON.parse((await body(req, 2048)).toString()); } catch (error) { if (error instanceof ApiError) throw error; throw new ApiError(400, 'JSON 格式无效'); }
        const controller = new AbortController(), cancel = () => controller.abort();
        res.once('close', cancel);
        try { const result = await dictionary.lookup(input?.text, { signal: controller.signal }); if (!res.destroyed) json(res, 200, result); }
        finally { res.off('close', cancel); }
        return;
      }
      if (await ai.handle(req, res, url, jsonBody, json)) return;
      if (p === '/api/health' && method === 'GET') {const office=await officeCapabilities();return json(res, 200, { ok: true, dataDirectory: store.directory,capabilities:{wordEditor:true,legacyWord:office.word,presentationPreview:office.presentation,conversionEngine:office.engine} });}
      if (p === '/api/workspace' && method === 'GET') return json(res, 200, await store.workspace());
      if (p === '/api/workspace' && method === 'PUT') { await store.saveWorkspace(await jsonBody(req)); return json(res, 200, { ok: true }); }
      if (p === '/api/storage/open' && method === 'POST') { await jsonBody(req); await openFile(store.directory); return json(res, 200, { ok: true }); }
      const match = /^\/api\/files\/([a-zA-Z0-9_-]{1,100})(?:\/(content|original|base|info|annotations|open|thumbnail|preview|document))?$/.exec(p);
      if (match) {
        const [, id, action] = match;
        if (!action && method === 'PUT') {const info=await store.uploadFile(id,await body(req,100*1024*1024),url.searchParams.get('name'),req.headers['content-type']);return json(res,info.previewStatus==='queued'?202:200,info);}
        if (['content', 'original'].includes(action) && ['GET', 'HEAD'].includes(method)) {
          const info=await store.info(id),original=action==='original';
          const type=original||info.kind==='image'?info.mimeType:info.kind==='word'?FILE_TYPES.docx.mimeType:'application/pdf';
          const name=original||info.kind==='image'?info.name:info.name.replace(/\.[^.]+$/,info.kind==='word'?'.docx':'.pdf');
          return await sendFile(req,res,await store.filePath(id,original),type,name);
        }
        if(action==='thumbnail'&&['GET','HEAD'].includes(method))return await sendFile(req,res,path.join(store.fileDir(id),'thumbnail.webp'),'image/webp');
        if(action==='base'&&['GET','HEAD'].includes(method))return await sendFile(req,res,await store.pdfBasePath(id),'application/pdf',(await store.info(id)).name.replace(/\.[^.]+$/,'.pdf'));
        if(action==='preview'&&method==='POST'){await jsonBody(req);return json(res,202,await store.requestPreview(id));}
        if(action==='document'&&method==='PUT'){
          if(!req.headers['content-type']?.startsWith(FILE_TYPES.docx.mimeType))throw new ApiError(415,'请保存 DOCX 文档');
          return json(res,200,await store.saveWord(id,await body(req,100*1024*1024),req.headers['if-match']?.replace(/^"|"$/g,'')));
        }
        if (action === 'info' && method === 'GET') return json(res, 200, await store.refreshExternalWord(id));
        if (action === 'annotations' && method === 'GET') return json(res, 200, await store.annotations(id));
        if (action === 'annotations' && method === 'PUT') return json(res, 200, await store.saveAnnotations(id, await jsonBody(req)));
        if (action === 'open' && method === 'POST') { await jsonBody(req); const info=await store.info(id);await openFile(await store.filePath(id,info.kind==='presentation'||info.kind==='word'&&info.previewStatus!=='ready')); return json(res, 200, { ok: true }); }
      }
      if (!p.startsWith('/api/') && ['GET', 'HEAD'].includes(method)) {
        const relative = decodeURIComponent(p).replace(/^\/+/, ''), root = path.join(projectDir, 'dist'), requested = path.resolve(root, relative);
        if (!requested.startsWith(root + path.sep) && requested !== root) throw new ApiError(403, '无效路径');
        const file = relative && !relative.endsWith('/') ? requested : path.join(root, 'index.html');
        const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' };
        try { return await sendFile(req, res, file, types[path.extname(file)] || 'application/octet-stream'); } catch (e) { if (e.code !== 'ENOENT') throw e; if (!path.extname(relative)) return await sendFile(req, res, path.join(root, 'index.html'), types['.html']); }
      }
      throw new ApiError(404, '接口或文件不存在');
    } catch (error) { if (res.headersSent) return res.destroy(); json(res, error.status || 500, { error: error.status ? error.message : '本地文件读写失败，请检查文件夹权限和磁盘空间' }); if (!error.status) console.error(error); }
  });
  server.on('close', () => ai.close());
  return { server, store, ai };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { server, store } = await createLocalServer();
  const port = Number(process.env.PORT || 4317);
  server.listen(port, '127.0.0.1', () => console.log(`Paperly local server: http://127.0.0.1:${port}\nData: ${store.directory}`));
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
}
