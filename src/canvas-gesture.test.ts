import {describe,expect,it} from 'vitest';
import {CanvasRightPanGesture} from './canvas-gesture';

describe('canvas right-click and pan gestures',()=>{
  it('waits for release when the native menu event arrives while holding right click',()=>{
    const gesture=new CanvasRightPanGesture(100,100);
    expect(gesture.contextMenu()).toBe(false);
    expect(gesture.release(100,100)).toBe(true);
  });
  it('waits for the native menu event when it arrives after release',()=>{
    const gesture=new CanvasRightPanGesture(100,100);
    expect(gesture.release(100,100)).toBe(false);
    expect(gesture.contextMenu()).toBe(true);
  });
  it.each(['before','after'])('suppresses the menu after a pan with the menu event %s release',order=>{
    const gesture=new CanvasRightPanGesture(100,100);
    gesture.move(150,125);
    if(order==='before')expect(gesture.contextMenu()).toBe(false);
    expect(gesture.release(150,125)).toBe(false);
    expect(gesture.contextMenu()).toBe(false);
  });
  it('still treats dragging back to the starting point as a pan',()=>{
    const gesture=new CanvasRightPanGesture(100,100);
    gesture.move(200,100);gesture.move(100,100);
    gesture.release(100,100);
    expect(gesture.contextMenu()).toBe(false);
  });
  it('tolerates a small amount of mouse jitter during a stationary click',()=>{
    const gesture=new CanvasRightPanGesture(100,100);
    gesture.move(101,101);gesture.contextMenu();
    expect(gesture.release(102,101)).toBe(true);
  });
  it('checks the release point even if the last move event is missing',()=>{
    const gesture=new CanvasRightPanGesture(100,100);
    gesture.contextMenu();
    expect(gesture.release(120,100)).toBe(false);
  });
  it('opens the menu once even when the browser repeats release or contextmenu events',()=>{
    const gesture=new CanvasRightPanGesture(100,100);
    gesture.release(100,100);
    expect(gesture.contextMenu()).toBe(true);
    expect(gesture.contextMenu()).toBe(false);
    expect(gesture.release(100,100)).toBe(false);
  });
});
