#include <Arduino.h>
// Intentionally slow software SPI for Ohmlet's sampled GPIO bridge.
const uint8_t CLK=13, DATA=11, CS=10, DC=8, RESET_PIN=9;
void sendOLED(uint8_t value, bool data) {
  digitalWrite(CLK, LOW); digitalWrite(DC, data); digitalWrite(CS, LOW); delay(100);
  for (int bit=7; bit>=0; --bit) {
    digitalWrite(DATA, (value >> bit) & 1); delay(100);
    digitalWrite(CLK, HIGH); delay(100);
    digitalWrite(CLK, LOW); delay(100);
  }
  digitalWrite(CS, HIGH); delay(100);
}
void setup() {
  pinMode(CLK, OUTPUT); pinMode(DATA, OUTPUT); pinMode(CS, OUTPUT);
  pinMode(DC, OUTPUT); pinMode(RESET_PIN, OUTPUT);
  digitalWrite(CS, HIGH); digitalWrite(CLK, LOW);
  digitalWrite(RESET_PIN, LOW); delay(500); digitalWrite(RESET_PIN, HIGH); delay(500);
  sendOLED(0xAF, false); // Display on
  sendOLED(0xA5, false); // All pixels on: visible confirmation within a few seconds
  delay(2000);
  sendOLED(0xA4, false); // RAM display
  sendOLED(0xB3, false); // Page 3
  sendOLED(0x06, false); sendOLED(0x13, false); // Column 54
  // A small smile, sent a column at a time (initial RAM is clear in the simulator).
  const uint8_t smile[] = {0x3c,0x42,0xa5,0x81,0xa5,0x99,0x42,0x3c};
  for (uint8_t v : smile) sendOLED(v, true);
}
void loop() {
  sendOLED(0xA7, false); delay(2000);
  sendOLED(0xA6, false); delay(2000);
}
