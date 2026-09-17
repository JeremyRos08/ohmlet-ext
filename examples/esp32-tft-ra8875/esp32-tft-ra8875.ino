#include <Arduino.h>
#include <SPI.h>

// ESP32S3 Dev Module: esp32:esp32:esp32s3. No extra library required.
// Example layout: SCK=12, MISO=13, MOSI=11, CS=10, RST=9, LITE=6.
// LCD1's Framebuffer source must be ESP1 in Ohmlet.
static constexpr int TFT_CS = 10, TFT_RST = 9, TFT_LITE = 6;

// Send prefix and payload in one SPI transaction so both the real controller
// and the emulator receive complete RA8875 command/data packets.
static void packet(uint8_t prefix, uint8_t value) {
  uint8_t bytes[] = {prefix, value};
  SPI.beginTransaction(SPISettings(1000000, MSBFIRST, SPI_MODE0));
  digitalWrite(TFT_CS, LOW);
  SPI.writeBytes(bytes, sizeof(bytes));
  digitalWrite(TFT_CS, HIGH);
  SPI.endTransaction();
}
static void reg(uint8_t address, uint8_t value) {
  packet(0x80, address);
  packet(0x00, value);
}
static void writeReg16(uint8_t address, uint16_t value) {
  reg(address, value & 255);
  reg(address + 1, value >> 8);
}
static void rect(uint16_t x0, uint16_t y0, uint16_t x1, uint16_t y1, uint16_t color) {
  reg(0x63, (color >> 11) & 31);
  reg(0x64, (color >> 5) & 63);
  reg(0x65, color & 31);
  writeReg16(0x91, x0); writeReg16(0x93, y0);
  writeReg16(0x95, x1); writeReg16(0x97, y1);
  reg(0x90, 0xB0); // Start filled rectangle.
  delay(20); // Conservative drawing delay for this low-rate diagnostic.
}
static void initDisplay() {
  reg(0x88, 0x0B); delay(1); // PLL, 800x480 timing (10 MHz crystal).
  reg(0x89, 0x02); delay(1);
  reg(0x10, 0x0C); // RGB565, 8-bit MCU interface.
  reg(0x04, 0x81); delay(1);
  reg(0x14, 99); reg(0x15, 0); reg(0x16, 3);
  reg(0x17, 3); reg(0x18, 11);
  writeReg16(0x19, 479); writeReg16(0x1B, 31); writeReg16(0x1D, 22); reg(0x1F, 1);
  writeReg16(0x30, 0); writeReg16(0x32, 799);
  writeReg16(0x34, 0); writeReg16(0x36, 479);
  reg(0x40, 0); // Graphics mode, not the controller's text ROM.
  reg(0x01, 0x80); // Display on.
  reg(0xC7, 1); // GPIOX panel enable.
  reg(0x8A, 0x8A); reg(0x8B, 255); // Backlight PWM1.
}
void setup() {
  Serial.begin(115200);
  Serial0.begin(115200); // UART0 remains visible even when USB CDC is enabled.
  Serial0.println("Ohmlet: starting RA8875 color-bar demo");
  pinMode(TFT_CS, OUTPUT); digitalWrite(TFT_CS, HIGH);
  pinMode(TFT_LITE, OUTPUT); digitalWrite(TFT_LITE, HIGH);
  pinMode(TFT_RST, OUTPUT); digitalWrite(TFT_RST, LOW); delay(20);
  digitalWrite(TFT_RST, HIGH); delay(100);
  SPI.begin(12, 13, 11, TFT_CS);
  initDisplay();
  rect(0, 0, 799, 479, 0x0841);
  const uint16_t colors[] = {0xF800, 0x07E0, 0x001F, 0xFFE0, 0x07FF, 0xF81F, 0xFFFF};
  for (int i = 0; i < 7; ++i) rect(40 + i * 104, 70, 135 + i * 104, 350, colors[i]);
  Serial0.println("Ohmlet: color bars sent over SPI; animation starting");
}
void loop() {
  static unsigned step = 0;
  rect(40, 400, 759, 439, 0x0841);
  rect(40, 400, 40 + (step % 12) * 65, 439, 0x07E0);
  ++step;
  Serial0.println("RA8875 frame updated");
  delay(500);
}
