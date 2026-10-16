export type AiPreferences = {model:string;efforts:Record<string,string>};
const key='paperly-ai-preferences-v1';

export function readAiPreferences():AiPreferences{
  try{
    const saved=JSON.parse(localStorage.getItem(key)||'null');
    return {model:typeof saved?.model==='string'?saved.model:'',efforts:saved?.efforts&&typeof saved.efforts==='object'?Object.fromEntries(Object.entries(saved.efforts).filter(([,value])=>typeof value==='string')) as Record<string,string>:{}};
  }catch{return {model:'',efforts:{}};}
}
export function writeAiPreferences(value:AiPreferences){
  try{localStorage.setItem(key,JSON.stringify(value));}catch{/* Chat remains usable when browser storage is unavailable. */}
}
export function effortLabel(effort:string){
  const names:Record<string,string>={none:'关闭',minimal:'最低',low:'低',medium:'中',high:'高',xhigh:'很高',max:'最高',ultra:'超高'};
  return names[effort]||effort;
}
