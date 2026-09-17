import { CATALOG, type CatalogEntry } from './catalog'
import '../sim/multimeter-chip'
import '../sim/esp32-chip'
import '../sim/arduino-chip'
import '../sim/input-modules'

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

/** Espressif ESP32-S3-DevKitC-1 v1.0 header order. */
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
  doc: 'EastRising ER-TFTM050A2-3-3661 5-inch 800×480 TFT module with RA8875 controller and capacitive touch controller. The ESP32-S3 runtime emulates the RA8875 framebuffer; set Framebuffer source to the ESP32 component id. The visible header remains wireable for circuit documentation and power/control wiring.',
}

const ARDUINO_UNO_R3: CatalogEntry = {
  type: 'arduino_uno_r3',
  label: 'Arduino Uno R3',
  category: 'ic',
  placement: 'offboard',
  pins: [
    'IOREF', 'RESET', '3V3', '5V', 'GND1', 'GND2', 'VIN',
    'A0', 'A1', 'A2', 'A3', 'A4_SDA', 'A5_SCL',
    'D0_RX', 'D1_TX', 'D2', 'D3_PWM', 'D4', 'D5_PWM', 'D6_PWM', 'D7',
    'D8', 'D9_PWM', 'D10_PWM_SS', 'D11_PWM_MOSI', 'D12_MISO', 'D13_SCK',
    'AREF', 'SDA', 'SCL',
  ],
  params: [
    { key: 'usbPower', label: 'USB power', kind: 'boolean', default: true, runtime: true },
  ],
  internalBridges: [
    ['GND1', 'GND2'],
    ['IOREF', '5V'],
    ['A4_SDA', 'SDA'],
    ['A5_SCL', 'SCL'],
  ],
  sim: { kind: 'chip', model: 'arduino_atmega328p' },
  visual: { shape: 'arduino-uno' },
  doc: 'Arduino Uno R3 with an emulated ATmega328P at 16 MHz. Flash an Arduino .hex file from Properties. Digital GPIO, PWM pin logic, analog inputs, timers and Serial are executed by AVR8js and bridged into the Ohmlet circuit solver.',
}

const NANO_OFFSETS: NonNullable<CatalogEntry['footprintOffsets']> = [
  ...Array.from({ length: 15 }, (_, dCol) => ({ dCol, row: 'b' as const })),
  ...Array.from({ length: 15 }, (_, dCol) => ({ dCol, row: 'i' as const })),
]

const ARDUINO_NANO: CatalogEntry = {
  type: 'arduino_nano',
  label: 'Arduino Nano (ATmega328P)',
  category: 'ic',
  placement: 'footprint',
  pins: [
    'D1_TX', 'D0_RX', 'RESET', 'GND1', 'D2', 'D3_PWM', 'D4', 'D5_PWM', 'D6_PWM', 'D7', 'D8', 'D9_PWM', 'D10_PWM_SS', 'D11_PWM_MOSI', 'D12_MISO',
    'D13_SCK', '3V3', 'AREF', 'A0', 'A1', 'A2', 'A3', 'A4_SDA', 'A5_SCL', 'A6', 'A7', '5V', 'RESET2', 'GND2', 'VIN',
  ],
  footprintOffsets: NANO_OFFSETS,
  bodyFootprint: { dCols: [0, 14], rows: ['b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'] },
  params: [
    { key: 'usbPower', label: 'USB power', kind: 'boolean', default: true, runtime: true },
  ],
  internalBridges: [
    ['GND1', 'GND2'],
    ['RESET', 'RESET2'],
  ],
  sim: { kind: 'chip', model: 'arduino_atmega328p' },
  visual: { shape: 'arduino-nano' },
  doc: 'Breadboard Arduino Nano with emulated ATmega328P at 16 MHz. Flash a compiled Arduino .hex file from Properties. The two 15-pin headers sit in rows b/i, leaving rows a/j accessible for jumper wires. A6/A7 are analog-only, like the real Nano.',
}

const ADAFRUIT_BME280: CatalogEntry = {
  type: 'adafruit_bme280', label: 'Adafruit BME280 (I²C / SPI)', category: 'ic', placement: 'offboard',
  pins: ['VIN', '3V3', 'GND', 'SCK_SCL', 'SDI_SDA', 'SDO', 'CS'], sim: { kind: 'probe' },
  visual: { shape: 'adafruit-module' },
  doc: 'Adafruit BME280 breakout. VIN/3V3/GND and shared I²C (SCL/SDA) or SPI (SCK/SDI/SDO/CS) header. The board is documented and wireable; sensor register behavior is being added to the bus device library.',
}
const ADAFRUIT_SSD1306: CatalogEntry = {
  type: 'adafruit_ssd1306_128x64', label: 'Adafruit OLED SSD1306 128×64', category: 'display', placement: 'offboard',
  pins: ['VIN', '3V3', 'GND', 'SCL_SCK', 'SDA_MOSI', 'RST', 'CS', 'DC'], sim: { kind: 'probe' },
  visual: { shape: 'adafruit-module' },
  doc: 'Adafruit 128×64 OLED breakout with I²C and 4-wire SPI header. Connect VIN/3V3/GND and the selected bus pins. The module is available for layout and wiring; framebuffer peripheral behavior is being added to the bus device library.',
}
const ADAFRUIT_NEOPIXEL: CatalogEntry = {
  type: 'adafruit_neopixel_ring', label: 'Adafruit NeoPixel Ring 12', category: 'display', placement: 'offboard',
  pins: ['V+', 'VCC', 'GND', 'DIN', 'DOUT'], sim: { kind: 'probe' },
  visual: { shape: 'adafruit-module' },
  doc: 'Adafruit NeoPixel Ring 12 breakout. Wire V+ and GND, then DIN from an Arduino or ESP32 GPIO; DOUT chains to the next ring. The module is wireable in the lab and its LED protocol model is planned for the next device pass.',
}

if (!CATALOG.multimeter) CATALOG.multimeter = MULTIMETER
CATALOG.analog_control_module = {
  type: 'analog_control_module', label: 'Commande analogique réglable', category: 'ic', placement: 'offboard',
  pins: ['VCC', 'GND', 'OUT'],
  params: [{ key: 'position', label: 'Position', kind: 'number', default: 0.5, min: 0, max: 1, step: 0.01, runtime: true }],
  sim: { kind: 'chip', model: 'analog_control_module' }, visual: { shape: 'adafruit-module' },
  doc: 'Module générique simulé : OUT varie de GND à VCC selon Position, avec 1 kΩ de résistance de sortie. Alimentation 2,7 à 5,5 V. Le courant consommé par le module n’est pas modélisé.',
}
CATALOG.obstacle_sensor_module = {
  type: 'obstacle_sensor_module', label: 'Détecteur obstacle numérique', category: 'ic', placement: 'offboard',
  pins: ['VCC', 'GND', 'OUT'],
  params: [{ key: 'detected', label: 'Obstacle détecté', kind: 'boolean', default: false, runtime: true }],
  sim: { kind: 'chip', model: 'obstacle_sensor_module' }, visual: { shape: 'adafruit-module' },
  doc: 'Module générique simulé : OUT est bas quand Obstacle détecté est activé, haut sinon. Alimentation 2,7 à 5,5 V. Détection commandée dans les propriétés, sans calcul optique ni modèle de consommation.',
}
if (!CATALOG.esp32_s3_devkit) CATALOG.esp32_s3_devkit = ESP32_S3_DEVKIT
if (!CATALOG.tft_5in) CATALOG.tft_5in = TFT_5IN
if (!CATALOG.arduino_uno_r3) CATALOG.arduino_uno_r3 = ARDUINO_UNO_R3
if (!CATALOG.arduino_nano) CATALOG.arduino_nano = ARDUINO_NANO
if (!CATALOG.adafruit_bme280) CATALOG.adafruit_bme280 = ADAFRUIT_BME280
if (!CATALOG.adafruit_ssd1306_128x64) CATALOG.adafruit_ssd1306_128x64 = ADAFRUIT_SSD1306
if (!CATALOG.adafruit_neopixel_ring) CATALOG.adafruit_neopixel_ring = ADAFRUIT_NEOPIXEL
