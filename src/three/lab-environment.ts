import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/** Decorative furniture only: never participates in circuit picking or routing. */
export function buildLabEnvironment() {
  const group = new THREE.Group()
  group.name = 'lab-environment'
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>()
  const materials: THREE.Material[] = []
  const material = (color: number, metalness = 0, roughness = .7) => {
    const m = new THREE.MeshStandardMaterial({ color, metalness, roughness })
    materials.push(m); return m
  }
  const frame = material(0x303c46, .6, .4)
  const wood = material(0x977753)
  const wall = material(0xadb7bb)
  const floor = material(0x404950)
  const white = material(0xd4d9d6)
  const dark = material(0x18242d)
  const teal = material(0x276c76)
  const amber = material(0xba7a3b)
  const rubber = material(0x24454b, 0, .95)
  const lamp = new THREE.MeshStandardMaterial({ color: 0xfff2d5, emissive: 0xffdca0, emissiveIntensity: 1.5 })
  materials.push(lamp)
  function add(g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rx = 0) {
    g.rotateX(rx); g.translate(x,y,z)
    const list = batches.get(m) ?? []; list.push(g); batches.set(m,list)
  }
  function box(x:number,y:number,z:number,w:number,h:number,d:number,m:THREE.Material) {
    add(new THREE.BoxGeometry(w,h,d),m,x,y,z)
  }
  // A finite tabletop with a thick edge and steel legs makes the work height clear.
  box(0,-3.4,0,220,4,136,wood)
  box(0,-7,0,208,4,124,frame)
  for(const x of [-98,98]) for(const z of [-55,55]) {
    box(x,-36,z,5,58,5,frame); box(x,-66,z,6,2,6,dark)
  }
  box(0,-52,-55,198,3,3,frame)
  box(0,-68,0,500,2,440,floor)
  // Back wall and shelving remain behind the working area; open sides allow orbiting.
  box(0,24,-81,300,184,3,wall)
  for(const x of [-91,91])box(x,38,-77,2,84,2,frame)
  for(const y of [23,53,77]) {
    box(0,y,-67,196,2.5,25,wood)
    for(const x of [-91,91])box(x,y-3,-67,2,4,24,frame)
    box(0,y-1.5,-56,172,.6,1.2,lamp)
  }
  // Open-front parts bins, with label holders, instead of generic solid cubes.
  for(let row=0;row<2;row++)for(let i=0;i<9;i++) {
    const x=-78+i*19, y=24.5+row*30, z=-65, m=i%3===0?amber:teal
    box(x,y,z,15,1,16,m);box(x,y+5,z-7.5,15,10,1,m)
    for(const side of [-1,1])box(x+side*7,y+5,z,1,10,16,m)
    box(x,y+2,z+7.5,15,4,1,m);box(x,y+2,z+8.1,7,1.8,.18,white)
  }
  // Cable/solder reels and manuals on the upper shelf.
  for(let i=0;i<5;i++) {
    const x=-68+i*20
    add(new THREE.CylinderGeometry(5,5,7,24),i%2?amber:teal,x,83,-66,Math.PI/2)
    for(const z of [-70,-62])add(new THREE.CylinderGeometry(6,6,.8,24),dark,x,83,z,Math.PI/2)
  }
  for(let i=0;i<6;i++)box(46+i*4,86,-67,3,15+(i%3),14,i%2?white:teal)
  // Rear service strip and an ESD work mat below the editable electronics.
  box(0,1,-61,150,4,3,white)
  for(let i=0;i<10;i++) {
    box(-63+i*14,1,-59.4,5,2,.2,dark)
  }
  box(0,-1.26,0,164,.06,85,rubber)
  // The lamp is emissive geometry, avoiding additional shadow-map costs.
  box(94,20,-42,2,42,2,frame)
  box(80,40,-42,30,2,8,frame)
  box(80,38.9,-42,27,.3,6,lamp)
  for(const [mat,geos] of batches) {
    const geometry = mergeGeometries(geos)
    geos.forEach(g=>g.dispose())
    if(!geometry)continue
    const mesh=new THREE.Mesh(geometry,mat)
    mesh.receiveShadow=true
    // Room furniture must not throw broad shadows over the circuit.
    mesh.castShadow=false
    group.add(mesh)
  }
  return { group, dispose() {
    group.children.forEach(o=>(o as THREE.Mesh).geometry.dispose())
    materials.forEach(m=>m.dispose())
  } }
}
