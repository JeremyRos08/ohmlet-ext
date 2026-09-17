import { registerChip } from './chip-api'

for (const model of ['analog_control_module', 'obstacle_sensor_module']) {
  registerChip(model, comp => ({
    comp,
    step(ctx) {
      const ground = ctx.readPin('GND')
      const supply = ctx.readPin('VCC') - ground
      if (!Number.isFinite(supply) || supply < 2.7 || supply > 5.5) {
        ctx.drivePin('OUT', null)
        return
      }
      const raw = Number(comp.params?.position ?? 0.5)
      const fraction = model === 'analog_control_module'
        ? Math.max(0, Math.min(1, Number.isFinite(raw) ? raw : 0.5))
        : comp.params?.detected === true ? 0 : 1
      ctx.drivePin('OUT', { v: ground + fraction * supply, rout: model === 'analog_control_module' ? 1000 : 100 })
    },
  }))
}
