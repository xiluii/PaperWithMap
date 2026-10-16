export function pdfPageScale(width:number,available:number,zoom:number){return Math.min(1.65,Math.max(.2,(available-48)/width))*zoom;}
// Measure tops once per layout; scrolling then only needs a binary search.
export function pageIndexAtOffset(tops:number[],offset:number){
  if(!tops.length)return 0;let low=0,high=tops.length-1;
  while(low<high){const middle=Math.ceil((low+high)/2);if(tops[middle]<=offset)low=middle;else high=middle-1;}return low;
}
export function anchoredScrollTop(previous:{tops:number[];heights:number[];scrollTop:number},tops:number[],heights:number[]){
  if(!previous.tops.length||!tops.length||previous.scrollTop<=0)return 0;
  const index=Math.min(pageIndexAtOffset(previous.tops,previous.scrollTop),tops.length-1);
  const fraction=(previous.scrollTop-previous.tops[index])/Math.max(1,previous.heights[index]);
  return Math.max(0,tops[index]+fraction*heights[index]);
}
