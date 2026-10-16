export type ImageTransform={zoom:number;x:number;y:number};
export const MIN_IMAGE_ZOOM=.25,MAX_IMAGE_ZOOM=8;
export function fitImage(width:number,height:number,containerWidth:number,containerHeight:number){return Math.min(1,Math.max(.01,Math.min((containerWidth-48)/width,(containerHeight-48)/height)));}
export function zoomImageAt(current:ImageTransform,nextZoom:number,x:number,y:number):ImageTransform{
  const zoom=Math.max(MIN_IMAGE_ZOOM,Math.min(MAX_IMAGE_ZOOM,nextZoom)),ratio=zoom/current.zoom;
  return {zoom,x:x-(x-current.x)*ratio,y:y-(y-current.y)*ratio};
}
export function clampImagePan(view:ImageTransform,width:number,height:number,containerWidth:number,containerHeight:number){
  const maxX=Math.max(0,(width*view.zoom-containerWidth)/2+24),maxY=Math.max(0,(height*view.zoom-containerHeight)/2+24);
  return {...view,x:maxX?Math.min(maxX,Math.max(-maxX,view.x)):0,y:maxY?Math.min(maxY,Math.max(-maxY,view.y)):0};
}
