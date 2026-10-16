type MarkdownNode={type:string;value?:string;children?:MarkdownNode[];position?:{start:{offset?:number};end:{offset?:number}}};

// CommonMark leaves **中文标点：**后文 literal. Repair only unparsed CJK
// text, using source offsets to preserve explicit escapes, code and math.
export function remarkCjkEmphasis(){
  return (tree:MarkdownNode,file:{value:unknown})=>{
    const source=String(file.value);
    function visit(parent:MarkdownNode){
      if(!parent.children)return;
      parent.children=parent.children.flatMap(node=>{
        if(node.type!=='text'){visit(node);return [node];}
        const text=node.value||'',start=node.position?.start.offset,end=node.position?.end.offset;
        if(start===undefined||end===undefined||source.slice(start,end)!==text)return [node];
        const parts:MarkdownNode[]=[];let offset=0;
        for(const match of text.matchAll(/\*\*(?!\s)([^*\n]+?)(?<!\s)\*\*/g)){
          if(!/[\u3400-\u9fff]/u.test(match[1]))continue;
          if(match.index>offset)parts.push({type:'text',value:text.slice(offset,match.index)});
          parts.push({type:'strong',children:[{type:'text',value:match[1]}]});offset=match.index+match[0].length;
        }
        if(!parts.length)return [node];
        if(offset<text.length)parts.push({type:'text',value:text.slice(offset)});
        return parts;
      });
    }
    visit(tree);
  };
}
