import { useEffect, useState } from 'react';
import { ExternalLink, LoaderCircle, LogOut, Monitor, RefreshCw } from 'lucide-react';
import { useAi } from '../AiProvider';
import { aiJson, aiModels, aiRequest } from '../ai-backend';
import type { AiModel } from '../ai-types';

export default function CodexAccountControls({ onModels }: { onModels: (models: AiModel[]) => void }) {
  const { auth, refreshAuth, busy } = useAi();
  const [working, setWorking] = useState(false), [error, setError] = useState('');
  const account = auth?.accounts.find(item => item.id === auth.activeId), connected = !!account?.connected;
  const models = async () => { try { onModels((await aiModels()).models); setError(''); } catch (error) { onModels([]); setError((error as Error).message); } };
  useEffect(() => { onModels([]); if (connected && !auth?.pending) void models(); }, [connected, account?.email, auth?.pending]);
  useEffect(() => {
    if (!auth?.pending) return;
    const timer = setInterval(() => void refreshAuth().catch(error => setError(error.message)), 1500);
    return () => clearInterval(timer);
  }, [auth?.pending, refreshAuth]);
  const action = async (route: string, value: unknown = {}) => {
    setWorking(true); setError('');
    try { await aiRequest(route, aiJson(value)); await refreshAuth(); }
    catch (error) { setError((error as Error).message); }
    finally { setWorking(false); }
  };
  const disabled = working || busy.size > 0;
  return <div className={`ai-account codex-account ${connected ? 'is-connected' : ''}`}>
    {connected ? <details className="ai-account-menu"><summary><Monitor size={15} aria-hidden="true"/><span><b>本机 Codex</b><small><span className="ai-account-dot"/>已连接</small></span><span aria-hidden="true">⌄</span></summary><div className="ai-account-options">
      <div className="ai-account-identity"><small>当前登录账号</small><b>{account?.email || '本机 Codex'}</b>{account?.plan&&<span>Codex 套餐 · {account.plan}</span>}</div>
      <p className="codex-account-description">使用本机 Codex 当前登录。切换登录会同步影响共用该登录的本地 Codex。</p>
      <button disabled={disabled} onClick={() => void action('/auth/refresh')}><RefreshCw size={13}/>检测本机登录</button>
      <button disabled={disabled} onClick={() => void models()}><RefreshCw size={13}/>刷新可用模型</button>
      <button disabled={disabled} onClick={() => void action('/auth/start', { force: true })}><Monitor size={13}/>通过浏览器重新登录</button>
      <button disabled={disabled} onClick={() => void action('/auth/start', { method: 'device', force: true })}><Monitor size={13}/>设备码登录</button>
      <button disabled={disabled} onClick={() => void action('/auth/logout')}><LogOut size={13}/>断开平台连接</button>
      <a href="https://chatgpt.com/settings/usage" target="_blank" rel="noopener noreferrer"><ExternalLink size={13}/>管理 Codex 用量</a>
    </div></details> : <div className="ai-connect-card"><b>通过本机 Codex 连接 ChatGPT</b><p>使用账号获准的 Codex 额度；已有本机登录可直接连接。文献库继续免登录。</p><button className="ai-connect-button" disabled={working || auth?.pending} onClick={() => void action('/auth/start')}>{working || auth?.pending ? <LoaderCircle size={16} className="spin"/> : <Monitor size={16}/>}连接本机 Codex</button><button className="plain-button" disabled={working || auth?.pending} onClick={() => void action('/auth/start', { method: 'device' })}>改用设备码登录</button></div>}
    {auth?.pending && <div className="codex-login-progress" role="status">{auth.login?.method === 'device' ? <><b>在官方页面输入设备码</b><code aria-label="Codex 设备码">{auth.login.userCode}</code><a className="secondary-button" href={auth.login.verificationUrl} target="_blank" rel="noopener noreferrer">打开官方验证页面<ExternalLink size={12}/></a><small>设备码仅用于本次登录。首次使用可能需要在 ChatGPT 安全设置中启用设备码登录。</small></> : <p><LoaderCircle size={14} className="spin"/>请在系统浏览器完成 Codex 登录</p>}<button className="plain-button" disabled={working} onClick={() => void action('/auth/cancel')}>取消本次连接</button></div>}
    {(error || auth?.error) && <p className="ai-inline-error" role="alert">{error || auth?.error}</p>}
  </div>;
}
