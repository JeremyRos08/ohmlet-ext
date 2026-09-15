import { CATALOG, type CatalogEntry } from './catalog'
import '../sim/multimeter-chip'
import '../sim/esp32-chip'

/** Ohmlet-ext catalog additions, loaded once at app boot. */
const MULTIMETER: CatalogEntry = {
  type: 'multimeter',
  label: 'Digital multimeter',
  category: 'instrument',
  placement: 'offboard',
  pins: ['VΩ', 'COM'],
  params: [
    { key: 'mode', label: 'Mode', kind: 'select', default: 'DC V', options: ['DC V', 'AC V', 'Ω', 'Continuity', 'mA', 'A'] },
    { key: 'resistance', label: 'Voltage input impedance', kind: 'number', default: 10_000_000, min: 100_000, max: 1_000_000_000, step: 100_000, unit: 'Ω' },
  ],
  sim: { kind: 'chip', model: 'multimeter' },
  visual: { shape: 'multimeter' },
  doc: 'Digital multimeter with selectable DC volts, AC true-RMS estimate, resistance, continuity, mA and A modes. Connect VΩ (red) and COM (black) across a voltage/resistance measurement; for current modes insert the meter in series.',
}

/**
 * Espressif ESP32-S3-DevKitC-1 v1.0 header order. Headers sit in b/i so the
 * electrically-equivalent outer a/j holes stay exposed for jumper wires.
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
    { dCol: 0, row: 'b' }, { dCol: 1, row: 'b' }, { dCol: 2, row: 'b' }, { dCol: 3, row: 'b' },
    { dCol: 4, row: 'b' }, { dCol: 5, row: 'b' }, { dCol: 6, row: 'b' }, { dCol: 7, row: 'b' },
    { dCol: 8, row: 'b' }, { dCol: 9, row: 'b' }, { dCol: 10, row: 'b' }, { dCol: 11, row: 'b' },
    { dCol: 12, row: 'b' }, { dCol: 13, row: 'b' }, { dCol: 14, row: 'b' }, { dCol: 15, row: 'b' },
    { dCol: 16, row: 'b' }, { dCol: 17, row: 'b' }, { dCol: 18, row: 'b' }, { dCol: 19, row: 'b' },
    { dCol: 20, row: 'b' }, { dCol: 21, row: 'b' },
    { dCol: 0, row: 'i' }, { dCol: 1, row: 'i' }, { dCol: 2, row: 'i' }, { dCol: 3, row: 'i' },
    { dCol: 4, row: 'i' }, { dCol: 5, row: 'i' }, { dCol: 6, row: 'i' }, { dCol: 7, row: 'i' },
    { dCol: 8, row: 'i' }, { dCol: 9, row: 'i' }, { dCol: 10, row: 'i' }, { dCol: 11, row: 'i' },
    { dCol: 12, row: 'i' }, { dCol: 13, row: 'i' }, { dCol: 14, row: 'i' }, { dCol: 15, row: 'i' },
    { dCol: 16, row: 'i' }, { dCol: 17, row: 'i' }, { dCol: 18, row: 'i' }, { dCol: 19, row: 'i' },
    { dCol: 20, row: 'i' }, { dCol: 21, row: 'i' },
  ],
  bodyFootprint: { dCols: [0, 21], rows: ['b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'] },
  // The two 3V3 headers and every GND header are physically common on the DevKit.
  internalBridges: [
    ['3V3_1', '3V3_2'],
    ['GND_J1', 'GND_J3_1'],
    ['GND_J3_1', 'GND_J3_2'],
    ['GND_J3_2', 'GND_J3_3'],
  ],
  sim: { kind: 'chip', model: 'esp32_s3' },
  visual: { shape: 'esp32s3' },
  doc: 'ESP32-S3-DevKitC-1 with official 2×22 pinout, browser firmware execution and mixed-signal GPIO. Firmware output pins drive the solved circuit at 3.3 V through a finite output impedance; breadboard voltages are fed back to firmware GPIO inputs. Headers occupy rows b/i and leave rows a/j open for jumper access.',
}

/**
 * Breadboard-friendly target for the 5-inch display: EastRising
 * ER-TFTM050A2-3-3661, 800×480, RA8875 controller and capacitive touch.
 * We expose the functional serial/SPI + touch signals used with an ESP32-S3,
 * not the module's optional wide parallel bus.
 */
const TFT_5IN: CatalogEntry = {
  type: 'tft_5in',
  label: 'EastRising 5" RA8875 Touch 800×480',
  category: 'display',
  placement: 'offboard',
  pins: ['5V', 'GND', 'SCK', 'MISO', 'MOSI', 'CS', 'RST', 'WAIT', 'INT', 'LITE', 'TP_SDA', 'TP_SCL', 'TP_INT', 'TP_RST'],
  params: [
    { key: 'sourceEsp', label: 'Framebuffer source', kind: 'text', default: 'U1' },
  ],
  sim: { kind: 'probe' },
  visual: { shape: 'tft5-ra8875' },
  doc: 'EastRising ER-TFTM050A2-3-3661 5-inch 800×480 TFT module with RA8875 display controller and capacitive touch controller. Use 5V/GND plus 4-wire SPI (SCK, MISO, MOSI, CS), RST/WAIT/INT, LITE for backlight PWM, and TP_SDA/TP_SCL/TP_INT/TP_RST for touch. The optional framebuffer source names the ESP32 component whose emulated display frames should be mirrored when available.',
}

if (!CATALOG.multimeter) CATALOG.multimeter = MULTIMETER
if (!CATALOG.esp32_s3_devkit) CATALOG.esp32_s3_devkit = ESP32_S3_DEVKIT
if (!CATALOG.tft_5in) CATALOG.tft_5in = TFT_5IN
