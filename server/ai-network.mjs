import { EnvHttpProxyAgent } from 'undici';

// Scope proxy support to OpenAI traffic; local storage and Office calls stay local.
export function createOpenAIFetch(environment = process.env) {
  const httpProxy = environment.http_proxy ?? environment.HTTP_PROXY ?? '';
  const httpsProxy = environment.https_proxy ?? environment.HTTPS_PROXY ?? '';
  const noProxy = [environment.no_proxy ?? environment.NO_PROXY ?? '', '127.0.0.1', 'localhost', '::1', '[::1]'].filter(Boolean).join(',');
  const dispatcher = httpProxy || httpsProxy ? new EnvHttpProxyAgent({ httpProxy, httpsProxy, noProxy }) : null;
  const request = (input, init) => fetch(input, dispatcher ? { ...init, dispatcher } : init);
  request.close = async () => { await dispatcher?.close(); };
  return request;
}

export const openaiFetch = createOpenAIFetch();
