cmake_minimum_required(VERSION 3.20.0)
find_package(Zephyr REQUIRED HINTS $ENV{ZEPHYR_BASE})

project(firmware)

target_sources(app PRIVATE
    src/main.c
    src/led.c
    src/ble.c
    src/ble_service.c
    src/usb_console.c
    src/temperature.c
    src/console_commands.c
    src/dfu.c
    src/motor.c
    src/sensor.c
)
