import type { Board, PaperData, Workspace } from './types';
import { makeEdge } from './model';

const date = '2026-10-15T08:00:00.000Z';
const base: PaperData={title:'',authors:'',year:2020,venue:'',tags:[],status:'unread',starred:false,abstract:'',addedAt:date,accent:'sage',sample:true};
export function initialWorkspace(): Workspace {
  const board: Board={
    id:'llm-research',title:'大语言模型研究',description:'从一篇论文出发，连接下一次灵感。',color:'green',mode:'canvas',updatedAt:date,
    nodes:[
      {id:'foundation',type:'section',position:{x:0,y:-5},data:{title:'01',subtitle:'一切，从注意力开始'},selectable:false,draggable:false},
      {id:'evolution',type:'section',position:{x:355,y:-5},data:{title:'02',subtitle:'预训练与规模的力量'},selectable:false,draggable:false},
      {id:'application',type:'section',position:{x:710,y:-5},data:{title:'03',subtitle:'让模型走向真实世界'},selectable:false,draggable:false},
      {id:'attention',type:'paper',position:{x:0,y:55},data:{...base,title:'Attention Is All You Need',authors:'Ashish Vaswani et al.',year:2017,venue:'NeurIPS 2017',tags:['Transformer','注意力机制'],status:'read',starred:true,accent:'sage',url:'https://arxiv.org/abs/1706.03762',abstract:'提出完全基于注意力机制的 Transformer 架构，使用自注意力建模序列中的全局依赖，为后续大规模语言模型奠定基础。',readAt:'2026-10-10T08:00:00Z',pages:15}},
      {id:'bert',type:'paper',position:{x:355,y:55},data:{...base,title:'BERT: Pre-training of Deep Bidirectional Transformers',authors:'Jacob Devlin et al.',year:2018,venue:'arXiv · 2018',tags:['预训练','语言理解'],status:'read',accent:'blue',url:'https://arxiv.org/abs/1810.04805',abstract:'通过掩码语言模型进行深度双向预训练，再对下游任务微调。思考：双向语境对表征学习的收益，与自回归生成的差异是什么？',readAt:'2026-10-12T08:00:00Z',pages:16}},
      {id:'instruct',type:'paper',position:{x:710,y:55},data:{...base,title:'Training language models to follow instructions with human feedback',authors:'Long Ouyang et al.',year:2022,venue:'NeurIPS 2022',tags:['RLHF','指令微调'],status:'reading',starred:true,accent:'rose',url:'https://arxiv.org/abs/2203.02155',abstract:'结合人类偏好数据与强化学习，让语言模型更好地遵循用户意图。值得关注监督微调、奖励模型与策略优化之间的联系。',pages:68}},
      {id:'idea-1',type:'text',position:{x:0,y:435},data:{title:'一个值得追问的问题',html:'<p>模型的能力，究竟来自<strong>规模</strong>，还是更好的<strong>知识组织方式</strong>？</p><p>试着把 RAG 与参数化记忆放在一起思考。</p><p><em>→ 下次组会讨论</em></p>',color:'yellow',createdAt:date}},
      {id:'gpt3',type:'paper',position:{x:355,y:440},data:{...base,title:'Language Models are Few-Shot Learners',authors:'Tom B. Brown et al.',year:2020,venue:'NeurIPS 2020',tags:['GPT-3','上下文学习'],status:'reading',accent:'sand',url:'https://arxiv.org/abs/2005.14165',abstract:'探索扩大语言模型规模如何带来少样本学习能力。无需梯度更新，仅用自然语言示例与任务描述，即可完成多种任务。',pages:75}},
      {id:'rag',type:'paper',position:{x:710,y:440},data:{...base,title:'Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks',authors:'Patrick Lewis et al.',year:2020,venue:'NeurIPS 2020',tags:['RAG','知识检索'],status:'unread',accent:'lavender',url:'https://arxiv.org/abs/2005.11401',abstract:'将参数化记忆与外部检索结合，用检索到的文档为生成过程提供知识支撑。关注知识更新、来源追踪以及检索与生成的协同。',pages:19}},
    ],
    edges:[makeEdge('attention','bert','架构基础'),makeEdge('bert','instruct','对齐与微调'),{...makeEdge('attention','gpt3','规模化'),sourceHandle:'bottom',targetHandle:'left'},makeEdge('gpt3','rag','知识增强'),{...makeEdge('rag','instruct','互补思路',false),sourceHandle:'top',targetHandle:'bottom',style:{stroke:'#a6aaa0',strokeWidth:1.4,strokeDasharray:'5 4'}}]
  };
  return {version:1,activeBoardId:board.id,handwrittenNotes:[],boards:[board,{id:'multimodal',title:'多模态学习',description:'在文字、图像与世界之间，建立新的连接。',color:'purple',nodes:[],edges:[],mode:'canvas',updatedAt:date}]};
}
