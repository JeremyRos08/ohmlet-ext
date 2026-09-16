#include <Arduino.h>
#include <SPI.h>
#include <Wire.h>

// Ohmlet lab example: ESP32-S3 DevKitC-1 + EastRising RA8875 5in.
// Target board: ESP32S3 Dev Module (FQBN: esp32:esp32:esp32s3).
// The AVR core (arduino:avr) is not enough for this sketch. Install the
// Espressif core first; the exact CLI commands are in examples/README.md.
// Compile for ESP32-S3, then import the generated .ino.bin in ESP1
// Properties. The layout uses the same pins as this sketch.
static constexpr int TFT_CS = 10;
static constexpr int TFT_RST = 9;
static constexpr int TFT_WAIT = 8;
static constexpr int TFT_INT = 7;
static constexpr int TFT_LITE = 6;
static constexpr int TOUCH_SDA = 4;
static constexpr int TOUCH_SCL = 5;

void setup() {
  Serial.begin(115200);
  pinMode(TFT_CS, OUTPUT); digitalWrite(TFT_CS, HIGH);
  pinMode(TFT_RST, OUTPUT); digitalWrite(TFT_RST, LOW); delay(20); digitalWrite(TFT_RST, HIGH);
  pinMode(TFT_WAIT, INPUT);
  pinMode(TFT_INT, INPUT_PULLUP);
  pinMode(TFT_LITE, OUTPUT); ledcAttach(TFT_LITE, 12000, 8); ledcWrite(TFT_LITE, 220);
  Wire.begin(TOUCH_SDA, TOUCH_SCL, 400000);
  SPI.begin(12, 13, 11, TFT_CS);
  Serial.println("Ohmlet ESP32-S3 / RA8875 5in ready");
}

void loop() {
  // The RA8875 runtime consumes the SPI traffic and exposes its framebuffer
  // in the 3D screen. This heartbeat also makes the serial monitor useful.
  static uint32_t last;
  if (millis() - last >= 1000) { last = millis(); Serial.println("TFT heartbeat"); }
  delay(1);
}

