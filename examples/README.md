# Exemples Arduino Ohmlet

## ESP32-S3 + écran TFT RA8875 5 pouces

`esp32-tft-ra8875.ino` cible une **ESP32-S3 Dev Module**. L’erreur
`Missing FQBN (Fully Qualified Board Name)` apparaît quand Arduino CLI reçoit
un sketch sans carte cible, ou quand seul le cœur AVR est installé.

### Installation du cœur ESP32

```bash
arduino-cli config init
arduino-cli config add board_manager.additional_urls \
  https://espressif.github.io/arduino-esp32/package_esp32_index.json
arduino-cli core update-index
arduino-cli core install esp32:esp32
```

Les bibliothèques `Stepper`, `Servo`, `TFT`, etc. ne remplacent pas le cœur de
la carte : elles ajoutent du code, mais ne fournissent pas le FQBN ESP32.

### Compilation avec Arduino CLI

Depuis la racine du dépôt :

```bash
arduino-cli compile \
  --fqbn esp32:esp32:esp32s3 \
  --output-dir build/esp32-tft \
  examples/esp32-tft-ra8875.ino
```

Le binaire à importer dans Ohmlet est ensuite :

```text
build/esp32-tft/esp32-tft-ra8875.ino.bin
```

Pour vérifier le nom exact de la carte disponible dans l’installation locale :

```bash
arduino-cli board listall "ESP32S3 Dev Module"
```

### Compilation dans Arduino IDE

1. Ajouter l’URL Espressif ci-dessus dans **Préférences → URL de gestionnaire
   de cartes supplémentaires**.
2. Installer **esp32 by Espressif Systems** dans le gestionnaire de cartes.
3. Choisir **ESP32S3 Dev Module** dans **Outils → Type de carte**.
4. Ouvrir `examples/esp32-tft-ra8875.ino`, compiler puis exporter le binaire.

Pour une Arduino Uno classique, le FQBN est différent :
`arduino:avr:uno`. Il ne faut pas utiliser ce FQBN pour l’exemple ESP32-S3.

