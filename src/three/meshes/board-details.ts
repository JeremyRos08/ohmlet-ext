import * as THREE from 'three'
import { cachedGeometry, metal, plastic, mergeStatic, topLabel, type BuildResult } from './shared'

/** Build a module in its header frame, so its USB and radio rotate with its pins. */
export function inHeaderFrame(pins: THREE.Vector3[], build: (local: THREE.Vector3[]) => BuildResult): BuildResult {
  const origin = pins[0]
  const axis = pins[1].clone().sub(origin).normalize()
  const local = pins.map(p => new THREE.Vector3((p.x-origin.x)*axis.x+(p.z-origin.z)*axis.z, p.y, -(p.x-origin.x)*axis.z+(p.z-origin.z)*axis.x))
  const result = build(local)
  const root = new THREE.Group()
  root.position.set(origin.x,0,origin.z)
  root.rotation.y = Math.atan2(-axis.z,axis.x)
  root.add(result.object); root.updateMatrixWorld(true)
  return { ...result, object:root, pinWorld:result.pinWorld?.map(p=>root.localToWorld(p.clone())) }
}

export function pcbGeometry(w: number, d: number, thickness: number, holes: boolean): THREE.BufferGeometry {
  return cachedGeometry(`detailed-pcb:${w}:${d}:${thickness}:${holes}`, () => {
    const s = new THREE.Shape(), r = .35, x=w/2, z=d/2
    s.moveTo(-x+r,-z); s.lineTo(x-r,-z); s.quadraticCurveTo(x,-z,x,-z+r)
    s.lineTo(x,z-r); s.quadraticCurveTo(x,z,x-r,z); s.lineTo(-x+r,z)
    s.quadraticCurveTo(-x,z,-x,z-r); s.lineTo(-x,-z+r); s.quadraticCurveTo(-x,-z,-x+r,-z)
    if (holes) for (const a of [-1,1]) for (const b of [-1,1]) {
      const h=new THREE.Path(); h.absarc(a*(x-.65),b*(z-.65),.23,0,Math.PI*2,true); s.holes.push(h)
    }
    const g=new THREE.ExtrudeGeometry(s,{depth:thickness,bevelEnabled:false,curveSegments:10})
    g.translate(0,0,-thickness/2); g.rotateX(-Math.PI/2); return g
  })
}

/** Small static details share materials and are merged to keep draw calls bounded. */
export class BoardDetails {
  private pieces: THREE.Object3D[]=[]
  constructor(private root: THREE.Group) {}
  box(x:number,y:number,z:number,w:number,h:number,d:number,mat:THREE.Material) {
    const g=cachedGeometry(`detail-box:${w}:${h}:${d}`,()=>new THREE.BoxGeometry(w,h,d))
    const m=new THREE.Mesh(g,mat);m.position.set(x,y,z);this.pieces.push(m); return m
  }
  label(text:string,x:number,y:number,z:number,w:number,h=.4) {
    const m=topLabel(text,w,h,{w:512,h:96,fg:'#dce8dc'});if(m){m.position.set(x,y,z);this.root.add(m)}
  }
  smd(x:number,y:number,z:number,capacitor=false) {
    this.box(x,y,z,.48,.16,.24,plastic(capacitor?0xae8760:0x24272a,.75))
    for(const side of [-1,1])this.box(x+side*.23,y,z,.10,.17,.27,metal(0xc5c8c9,.48))
  }
  chip(x:number,y:number,z:number,size=1.5) {
    this.box(x,y+.13,z,size,.26,size,plastic(0x14171b,.65))
    for(let i=0;i<8;i++)for(const sign of [-1,1]) {
      const t=(i-3.5)*size/9
      this.box(x+t,y+.03,z+sign*(size/2+.14),.09,.09,.35,metal(0xaeb4b5,.45))
      this.box(x+sign*(size/2+.14),y+.03,z+t,.35,.09,.09,metal(0xaeb4b5,.45))
    }
  }
  usb(x:number,y:number,z:number,w:number,h:number,d:number,sign=1) {
    const start = this.pieces.length
    const m=metal(0xc5cbd0,.3), wall=.12
    // Open connector mouth, instead of a solid silver cube.
    for(const a of [-1,1]) {
      this.box(x,y+a*(h-wall)/2,z,w,wall,d,m)
      this.box(x,y,z+a*(d-wall)/2,w,h-2*wall,wall,m)
    }
    this.box(x-sign*w*.38,y,z,.10,h*.70,d*.75,plastic(0x16191b,.65))
    this.box(x+sign*w*.1,y-h*.15,z,w*.6,.10,d*.62,plastic(0x303338,.65))
    for(let i=0;i<5;i++)this.box(x+sign*w*.2,y-h*.15+.055,z+(i-2)*d*.10,w*.3,.025,.055,metal(0xc5a246,.3))
    const connector = new THREE.Group(); connector.name = 'usb-connector'
    connector.add(...mergeStatic(this.pieces.splice(start))); this.root.add(connector); return connector
  }
  finish() { const group=new THREE.Group();group.name='board-surface-details';group.add(...mergeStatic(this.pieces));this.root.add(group) }
}
