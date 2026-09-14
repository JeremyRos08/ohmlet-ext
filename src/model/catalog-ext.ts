import { CATALOG, type CatalogEntry } from './catalog'
import '../sim/multimeter-chip'

/**
 * Ohmlet-ext catalog additions.
 *
 * Kept separate from upstream's catalog so the fork can add parts without
 * making future upstream syncs unnecessarily noisy. Import once at app boot.
 */
const MULTIMETER: CatalogEntry = {
  type: 'multimeter',
  label: 'Digital multimeter',
  category: 'instrument',
  placement: 'offboard',
  pins: ['VΩ', 'COM'],
  params: [
    {
      key: 'mode',
      label: 'Mode',
      kind: 'select',
      default: 'DC V',
      options: ['DC V', 'AC V', 'Ω', 'Continuity', 'mA', 'A'],
    },
    {
      key: 'resistance',
      label: 'Voltage input impedance',
      kind: 'number',
      default: 10_000_000,
      min: 100_000,
      max: 1_000_000_000,
      step: 100_000,
      unit: 'Ω',
    },
  ],
  sim: { kind: 'chip', model: 'multimeter' },
  visual: { shape: 'multimeter' },
  doc: 'Digital multimeter with selectable DC volts, AC true-RMS estimate, resistance, continuity, mA and A modes. Connect VΩ (red) and COM (black) across a voltage/resistance measurement; for current modes insert the meter in series. Voltage mode is approximately 10 MΩ input impedance; mA/A modes use low-value simulated shunts.',
}

/**
 * Espressif ESP32-S3-DevKitC-1 v1.0 header order.
 * J1 pins 1..22 are followed by J3 pins 1..22. Duplicate power/ground names
 * are suffixed only so telemetry keys stay unambiguous in Ohmlet.
 *
 * The headers intentionally sit in rows b/i instead of the outer a/j rows.
 * Those exposed outer rows are electrically the same breadboard strips, so a
 * jumper can be plugged beside every ESP pin without fighting the board mesh.
 */
const ESP32_S3_DEVKIT: CatalogEntry = {
  type: 'esp32_s3_devkit',
  label: 'ESP32-S3 DevKitC-1',
  category: 'ic',
  placement: 'footprint',
  pins: [
    '3V3_1', '3V3_2', 'RST', 'GPIO4', 'GPIO5', 'GPIO6', 'GPIO7', 'GPIO15', 'GPIO16', 'GPIO17', 'GPIO18',
    'GPIO8', 'GPIO3', 'GPIO46', 'GPIO9', 'GPIO10', 'GPIO11', 'GPIO12', 'GPIO13', 'GPIO14', '5V', 'GND_J1',
    'GND_J3_1', 'TX_GPIO43', 'RX_GPIO44', 'GPIO1', 'GPIO2', 'GPIO42', 'GPIO41', 'GPIO40', 'GPIO39', 'GPIO38',
    'GPIO37', 'GPIO36', 'GPIO35', 'GPIO0', 'GPIO45', 'GPIO48', 'GPIO47', 'GPIO21', 'GPIO20_USB_D+',
    'GPIO19_USB_D-', 'GND_J3_2', 'GND_J3_3',
  ],
  footprintOffsets: [
    // J1 header one row in from the top edge: row a remains free for jumpers.
    { dCol: 0, row: 'b' }, { dCol: 1, row: 'b' }, { dCol: 2, row: 'b' }, { dCol: 3, row: 'b' },
    { dCol: 4, row: 'b' }, { dCol: 5, row: 'b' }, { dCol: 6, row: 'b' }, { dCol: 7, row: 'b' },
    { dCol: 8, row: 'b' }, { dCol: 9, row: 'b' }, { dCol: 10, row: 'b' }, { dCol: 11, row: 'b' },
    { dCol: 12, row: 'b' }, { dCol: 13, row: 'b' }, { dCol: 14, row: 'b' }, { dCol: 15, row: 'b' },
    { dCol: 16, row: 'b' }, { dCol: 17, row: 'b' }, { dCol: 18, row: 'b' }, { dCol: 19, row: 'b' },
    { dCol: 20, row: 'b' }, { dCol: 21, row: 'b' },
    // J3 header one row in from the bottom edge: row j remains free for jumpers.
    { dCol: 0, row: 'i' }, { dCol: 1, row: 'i' }, { dCol: 2, row: 'i' }, { dCol: 3, row: 'i' },
    { dCol: 4, row: 'i' }, { dCol: 5, row: 'i' }, { dCol: 6, row: 'i' }, { dCol: 7, row: 'i' },
    { dCol: 8, row: 'i' }, { dCol: 9, row: 'i' }, { dCol: 10, row: 'i' }, { dCol: 11, row: 'i' },
    { dCol: 12, row: 'i' }, { dCol: 13, row: 'i' }, { dCol: 14, row: 'i' }, { dCol: 15, row: 'i' },
    { dCol: 16, row: 'i' }, { dCol: 17, row: 'i' }, { dCol: 18, row: 'i' }, { dCol: 19, row: 'i' },
    { dCol: 20, row: 'i' }, { dCol: 21, row: 'i' },
  ],
  // Do not occlude the exposed a/j jumper rows.
  bodyFootprint: { dCols: [0, 21], rows: ['b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'] },
  sim: { kind: 'probe' },
  visual: { shape: 'esp32s3' },
  doc: 'ESP32-S3-DevKitC-1 with the official 2×22 header pinout. Mount pin 1 at a breadboard column; its headers occupy rows b and i so rows a and j stay exposed as electrically-equivalent jumper points beside every pin. Firmware can be flashed and executed in the browser from the component inspector.',
}

const TFT_5IN: CatalogEntry = {
  type: 'tft_5in',
  label: '5-inch TFT 800×480',
  category: 'display',
  placement: 'offboard',
  pins: ['5V', 'GND', 'SCK', 'MOSI', 'MISO', 'CS', 'DC', 'RST', 'BL', 'SDA', 'SCL', 'INT'],
  sim: { kind: 'probe' },
  visual: { shape: 'tft5' },
  doc: 'Generic 5-inch 800×480 TFT module. Display-side interface is modeled as 5V/GND plus SPI (SCK, MOSI, MISO, CS, DC, RST, BL) and an I²C capacitive-touch header (SDA, SCL, INT). This is intentionally generic until an exact display model is selected.',
}

if (!CATALOG.multimeter) CATALOG.multimeter = MULTIMETER
if (!CATALOG.esp32_s3_devkit) CATALOG.esp32_s3_devkit = ESP32_S3_DEVKIT
if (!CATALOG.tft_5in) CATALOG.tft_5in = TFT_5IN
