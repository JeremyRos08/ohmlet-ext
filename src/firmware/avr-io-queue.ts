/** Preserve worker samples until the circuit has solved each one in order.
 * Reading only the newest message loses SPI clocks whenever rendering stalls.
 */
export class AvrIoQueue<T> {
  private pending: T[] = []
  private head = 0
  private current: T
  constructor(initial: T) { this.current = initial }
  push(value: T) {
    if (this.pending.length - this.head >= 4096) throw new Error('Arduino GPIO queue overflow: stop and restart the firmware')
    this.pending.push(value)
  }
  next(): T {
    if (this.head < this.pending.length) this.current = this.pending[this.head++]
    if (this.head === this.pending.length) { this.pending = []; this.head = 0 }
    return this.current
  }
}
