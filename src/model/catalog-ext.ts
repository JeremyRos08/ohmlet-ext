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
      // Structural on purpose: changing range rebuilds the engine so the
      // behavioral meter model starts cleanly in its new electrical mode.
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
 */
const ESP32_S3_DEVKIT: CatalogEntry = {
  type: 'esp32_s3_devkit',
  label: 'ESP32-S3 DevKitC-1',
  category: 'ic',
  placement: 'footprint',
  pins: [
    // J1, pins 1..22
    '3V3_1', '3V3_2', 'RST', 'GPIO4', 'GPIO5', 'GPIO6', 'GPIO7', 'GPIO15', 'GPIO16', 'GPIO17', 'GPIO18',
    'GPIO8', 'GPIO3', 'GPIO46', 'GPIO9', 'GPIO10', 'GPIO11', 'GPIO12', 'GPIO13', 'GPIO14', '5V', 'GND_J1',
    // J3, pins 1..22
    'GND_J3_1', 'TX_GPIO43', 'RX_GPIO44', 'GPIO1', 'GPIO2', 'GPIO42', 'GPIO41', 'GPIO40', 'GPIO39', 'GPIO38',
    'GPIO37', 'GPIO36', 'GPIO35', 'GPIO0', 'GPIO45', 'GPIO48', 'GPIO47', 'GPIO21', 'GPIO20_USB_D+',
    'GPIO19_USB_D-', 'GND_J3_2', 'GND_J3_3',
  ],
  footprintOffsets: [
    // J1 header along row a
    { dCol: 0, row: 'a' }, { dCol: 1, row: 'a' }, { dCol: 2, row: 'a' }, { dCol: 3, row: 'a' },
    { dCol: 4, row: 'a' }, { dCol: 5, row: 'a' }, { dCol: 6, row: 'a' }, { dCol: 7, row: 'a' },
    { dCol: 8, row: 'a' }, { dCol: 9, row: 'a' }, { dCol: 10, row: 'a' }, { dCol: 11, row: 'a' },
    { dCol: 12, row: 'a' }, { dCol: 13, row: 'a' }, { dCol: 14, row: 'a' }, { dCol: 15, row: 'a' },
    { dCol: 16, row: 'a' }, { dCol: 17, row: 'a' }, { dCol: 18, row: 'a' }, { dCol: 19, row: 'a' },
    { dCol: 20, row: 'a' }, { dCol: 21, row: 'a' },
    // J3 header along row j
    { dCol: 0, row: 'j' }, { dCol: 1, row: 'j' }, { dCol: 2, row: 'j' }, { dCol: 3, row: 'j' },
    { dCol: 4, row: 'j' }, { dCol: 5, row: 'j' }, { dCol: 6, row: 'j' }, { dCol: 7, row: 'j' },
    { dCol: 8, row: 'j' }, { dCol: 9, row: 'j' }, { dCol: 10, row: 'j' }, { dCol: 11, row: 'j' },
    { dCol: 12, row: 'j' }, { dCol: 13, row: 'j' }, { dCol: 14, row: 'j' }, { dCol: 15, row: 'j' },
    { dCol: 16, row: 'j' }, { dCol: 17, row: 'j' }, { dCol: 18, row: 'j' }, { dCol: 19, row: 'j' },
    { dCol: 20, row: 'j' }, { dCol: 21, row: 'j' },
  ],
  bodyFootprint: { dCols: [0, 21], rows: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'] },
  // First increment: real board/pinout and high-impedance electrical pins.
  // Firmware execution / GPIO drive behavior will be layered on separately.
  sim: { kind: 'probe' },
  visual: { shape: 'esp32s3' },
  doc: 'ESP32-S3-DevKitC-1 development board with the official 2×22 Espressif header pinout. Mount it across the breadboard using pin 1 (3V3_1) as the anchor in row a. The current simulator model exposes all pins as high-impedance connection points; firmware/GPIO execution is not emulated yet.',
}

const TFT_5IN: CatalogEntry = {
  type: 'tft_5in',
  label: '5-inch TFT 800×480',
  category: 'display',
  placement: 'offboard',
  pins: ['5V', 'GND', 'SCK', 'MOSI', 'MISO', 'CS', 'DC', 'RST', 'BL', 'SDA', 'SCL', 'INT'],
  sim: { kind: 'probe' },
  visual: { shape: 'tft5' },
  doc: 'Generic 5-inch 800×480 TFT module. Display-side interface is modeled as 5V/GND plus SPI (SCK, MOSI, MISO, CS, DC, RST, BL) and an I²C capacitive-touch header (SDA, SCL, INT). This is intentionally generic until an exact display model is selected; pixel/controller behavior is not emulated yet.',
}

if (!CATALOG.multimeter) CATALOG.multimeter = MULTIMETER
if (!CATALOG.esp32_s3_devkit) CATALOG.esp32_s3_devkit = ESP32_S3_DEVKIT
if (!CATALOG.tft_5in) CATALOG.tft_5in = TFT_5IN
