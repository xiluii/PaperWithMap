/** Distinguish a right click from a pan across browser contextmenu event orders. */
export class CanvasRightPanGesture {
  private down=true;
  private moved=false;
  private contextReceived=false;
  private opened=false;

  constructor(private readonly x:number,private readonly y:number){}

  move(x:number,y:number){
    if(this.down&&Math.hypot(x-this.x,y-this.y)>3)this.moved=true;
  }

  release(x:number,y:number){
    this.move(x,y);
    this.down=false;
    return this.consumeMenu();
  }

  contextMenu(){
    this.contextReceived=true;
    return this.consumeMenu();
  }

  private consumeMenu(){
    if(this.down||this.moved||!this.contextReceived||this.opened)return false;
    this.opened=true;
    return true;
  }
}
