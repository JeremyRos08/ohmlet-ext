import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
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
    const g=cachedGeometry(`detail-box:${w}:${h}:${d}`,()=>new RoundedBoxGeometry(w,h,d,2,Math.min(w,h,d)*.12))
    const m=new THREE.Mesh(g,mat);m.position.set(x,y,z);this.pieces.push(m); return m
  }
  label(text:string,x:number,y:number,z:number,w:number,h=.4,fg='#dce8dc') {
    const m=topLabel(text,w,h,{w:512,h:96,fg});if(m){m.position.set(x,y,z);this.root.add(m)}
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
    // Folded metal shell: chamfered USB-B / Mini-B profile and real cavity.
    const shell=cachedGeometry(`usb-profile:${w}:${h}:${d}`,()=>{
      const profile=(width:number,height:number)=>{
        const path=new THREE.Shape(), bevel=Math.min(width*.16,height*.24)
        path.moveTo(-width/2,-height/2);path.lineTo(width/2,-height/2)
        path.lineTo(width/2,height/2-bevel);path.lineTo(width/2-bevel,height/2)
        path.lineTo(-width/2+bevel,height/2);path.lineTo(-width/2,height/2-bevel);path.closePath();return path
      }
      const shape=profile(d,h), inner=profile(d-2*wall,h-2*wall)
      shape.holes.push(new THREE.Path(inner.getPoints().reverse()))
      const g=new THREE.ExtrudeGeometry(shape,{depth:w,bevelEnabled:true,bevelThickness:.025,bevelSize:.025,bevelSegments:1})
      g.translate(0,0,-w/2);g.rotateY(Math.PI/2);return g
    })
    const skin=new THREE.Mesh(shell,m);skin.position.set(x,y,z);this.pieces.push(skin)
    // Retention windows, folds and board anchor tabs.
    for(const side of [-1,1]) {
      this.box(x,y+h/2+.026,z+side*d*.23,w*.27,.014,d*.12,plastic(0x303539,.7))
      this.box(x-sign*w*.28,y-h/2,z+side*d*.52,w*.3,.09,.22,m)
    }
    this.box(x-sign*w*.38,y,z,.10,h*.70,d*.75,plastic(0x16191b,.65))
    this.box(x+sign*w*.1,y-h*.15,z,w*.6,.10,d*.62,plastic(0x303338,.65))
    const contacts=h>1?4:5
    for(let i=0;i<contacts;i++)this.box(x+sign*w*.2,y-h*.15+.055,z+(i-(contacts-1)/2)*d*.10,w*.3,.025,.055,metal(0xc5a246,.3))
    const connector = new THREE.Group(); connector.name = 'usb-connector'
    connector.add(...mergeStatic(this.pieces.splice(start))); this.root.add(connector); return connector
  }
  /** Annular solder fillets also remain visible from below the module. */
  pad(x:number,y:number,z:number,r=.23) {
    const g=cachedGeometry(`solder-pad:${r}`,()=>new THREE.TorusGeometry(r,.055,6,16))
    const m=new THREE.Mesh(g,metal(0xb7bbaf,.48));m.rotation.x=-Math.PI/2;m.position.set(x,y,z);this.pieces.push(m)
  }
  tactile(x:number,y:number,z:number) {
    this.box(x,y+.12,z,.85,.24,.72,plastic(0x25272a,.65))
    this.box(x,y+.26,z,.78,.055,.65,metal(0xb5b9ba,.45))
    const m=new THREE.Mesh(cachedGeometry('tactile-actuator',()=>new THREE.CylinderGeometry(.20,.22,.18,16)),plastic(0x17191b,.6))
    m.position.set(x,y+.37,z);this.pieces.push(m)
    for(const a of [-1,1])for(const b of [-1,1])this.box(x+a*.44,y+.07,z+b*.24,.18,.10,.12,metal(0xb5b9ba,.45))
  }
  isp(x:number,y:number,z:number) {
    this.box(x,y+.12,z,1.55,.24,1.0,plastic(0x17191b,.6))
    for(let i=0;i<3;i++)for(const side of [-1,1]) {
      this.box(x+(i-1)*.5,y+.55,z+side*.25,.13,.9,.13,metal(0xc9ac63,.35))
      this.pad(x+(i-1)*.5,y-.02,z+side*.25,.14)
    }
  }
  barrel(x:number,y:number,z:number) {
    // Recessed cylindrical opening inside the molded rectangular housing.
    const shape=new THREE.Shape();shape.moveTo(-.85,-.8);shape.lineTo(.85,-.8);shape.lineTo(.85,.8);shape.lineTo(-.85,.8);shape.closePath()
    const hole=new THREE.Path();hole.absarc(0,.05,.58,0,Math.PI*2,true);shape.holes.push(hole)
    const g=cachedGeometry('dc-jack-hollow',()=>{const g=new THREE.ExtrudeGeometry(shape,{depth:2.3,bevelEnabled:true,bevelSize:.04,bevelThickness:.04,bevelSegments:2});g.rotateY(Math.PI/2);return g})
    const m=new THREE.Mesh(g,plastic(0x111418,.48));m.position.set(x,y,z);this.pieces.push(m)
    this.box(x+2.25,y,z,.10,1.5,1.6,plastic(0x111418,.48))
    const pin=new THREE.Mesh(cachedGeometry('dc-jack-center',()=>new THREE.CylinderGeometry(.12,.12,1.5,12)),metal(0xbfc1c4,.28))
    pin.rotation.z=Math.PI/2;pin.position.set(x+1.4,y+.05,z);this.pieces.push(pin)
  }
  finish() { const group=new THREE.Group();group.name='board-surface-details';group.add(...mergeStatic(this.pieces));this.root.add(group) }
}
