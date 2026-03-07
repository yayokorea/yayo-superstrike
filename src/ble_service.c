#include "ble_service.h"

#include "led.h"
#include "motor.h"
#include "sensor.h"

#include <stdbool.h>
#include <zephyr/bluetooth/conn.h>
#include <zephyr/bluetooth/gatt.h>
#include <zephyr/bluetooth/uuid.h>
#include <zephyr/sys/printk.h>

/* Custom Service UUID: 2cfd0a83-f013-4fe2-8dbd-fe3a5f4a64ff */
#define BT_UUID_CUSTOM_SERV_VAL \
    BT_UUID_128_ENCODE(0x2cfd0a83, 0xf013, 0x4fe2, 0x8dbd, 0xfe3a5f4a64ff)
#define BT_UUID_CUSTOM_SERV BT_UUID_DECLARE_128(BT_UUID_CUSTOM_SERV_VAL)

/* Custom Characteristic UUID: 2cfd0a84-f013-4fe2-8dbd-fe3a5f4a64ff */
#define BT_UUID_CUSTOM_CHAR_LED_VAL \
    BT_UUID_128_ENCODE(0x2cfd0a84, 0xf013, 0x4fe2, 0x8dbd, 0xfe3a5f4a64ff)
#define BT_UUID_CUSTOM_CHAR_LED BT_UUID_DECLARE_128(BT_UUID_CUSTOM_CHAR_LED_VAL)

/* Custom Characteristic UUID for Temp: 2cfd0a85-f013-4fe2-8dbd-fe3a5f4a64ff */
#define BT_UUID_CUSTOM_CHAR_TEMP_VAL \
    BT_UUID_128_ENCODE(0x2cfd0a85, 0xf013, 0x4fe2, 0x8dbd, 0xfe3a5f4a64ff)
#define BT_UUID_CUSTOM_CHAR_TEMP BT_UUID_DECLARE_128(BT_UUID_CUSTOM_CHAR_TEMP_VAL)

/* Custom Characteristic UUID for Motor: 2cfd0a86-f013-4fe2-8dbd-fe3a5f4a64ff */
#define BT_UUID_CUSTOM_CHAR_MOTOR_VAL \
    BT_UUID_128_ENCODE(0x2cfd0a86, 0xf013, 0x4fe2, 0x8dbd, 0xfe3a5f4a64ff)
#define BT_UUID_CUSTOM_CHAR_MOTOR BT_UUID_DECLARE_128(BT_UUID_CUSTOM_CHAR_MOTOR_VAL)

/* Custom Characteristic UUID for Hall1: 2cfd0a87-f013-4fe2-8dbd-fe3a5f4a64ff */
#define BT_UUID_CUSTOM_CHAR_HALL1_VAL \
    BT_UUID_128_ENCODE(0x2cfd0a87, 0xf013, 0x4fe2, 0x8dbd, 0xfe3a5f4a64ff)
#define BT_UUID_CUSTOM_CHAR_HALL1 BT_UUID_DECLARE_128(BT_UUID_CUSTOM_CHAR_HALL1_VAL)

/* Custom Characteristic UUID for Hall2: 2cfd0a88-f013-4fe2-8dbd-fe3a5f4a64ff */
#define BT_UUID_CUSTOM_CHAR_HALL2_VAL \
    BT_UUID_128_ENCODE(0x2cfd0a88, 0xf013, 0x4fe2, 0x8dbd, 0xfe3a5f4a64ff)
#define BT_UUID_CUSTOM_CHAR_HALL2 BT_UUID_DECLARE_128(BT_UUID_CUSTOM_CHAR_HALL2_VAL)

/* Custom Characteristic UUID for Mouse Switch: 2cfd0a89-f013-4fe2-8dbd-fe3a5f4a64ff */
#define BT_UUID_CUSTOM_CHAR_SWITCH_VAL \
    BT_UUID_128_ENCODE(0x2cfd0a89, 0xf013, 0x4fe2, 0x8dbd, 0xfe3a5f4a64ff)
#define BT_UUID_CUSTOM_CHAR_SWITCH BT_UUID_DECLARE_128(BT_UUID_CUSTOM_CHAR_SWITCH_VAL)

/* Custom Characteristic UUID for Calibration Status: 2cfd0a8a-f013-4fe2-8dbd-fe3a5f4a64ff */
#define BT_UUID_CUSTOM_CHAR_CAL_STATUS_VAL \
    BT_UUID_128_ENCODE(0x2cfd0a8a, 0xf013, 0x4fe2, 0x8dbd, 0xfe3a5f4a64ff)
#define BT_UUID_CUSTOM_CHAR_CAL_STATUS BT_UUID_DECLARE_128(BT_UUID_CUSTOM_CHAR_CAL_STATUS_VAL)

/* Custom Characteristic UUID for Calibration Command: 2cfd0a8b-f013-4fe2-8dbd-fe3a5f4a64ff */
#define BT_UUID_CUSTOM_CHAR_CAL_COMMAND_VAL \
    BT_UUID_128_ENCODE(0x2cfd0a8b, 0xf013, 0x4fe2, 0x8dbd, 0xfe3a5f4a64ff)
#define BT_UUID_CUSTOM_CHAR_CAL_COMMAND BT_UUID_DECLARE_128(BT_UUID_CUSTOM_CHAR_CAL_COMMAND_VAL)

enum {
    TEMP_NOTIFY_ATTR_INDEX = 4,
    HALL1_NOTIFY_ATTR_INDEX = 9,
    HALL2_NOTIFY_ATTR_INDEX = 12,
};

static bool temp_notify_enabled;
static bool hall1_notify_enabled;
static bool hall2_notify_enabled;

static void temp_ccc_cfg_changed(const struct bt_gatt_attr *attr, uint16_t value)
{
    ARG_UNUSED(attr);
    temp_notify_enabled = (value == BT_GATT_CCC_NOTIFY);
    printk("Temperature notifications %s\n",
           temp_notify_enabled ? "enabled" : "disabled");
}

static void hall1_ccc_cfg_changed(const struct bt_gatt_attr *attr, uint16_t value)
{
    ARG_UNUSED(attr);
    hall1_notify_enabled = (value == BT_GATT_CCC_NOTIFY);
}

static void hall2_ccc_cfg_changed(const struct bt_gatt_attr *attr, uint16_t value)
{
    ARG_UNUSED(attr);
    hall2_notify_enabled = (value == BT_GATT_CCC_NOTIFY);
}

static ssize_t write_motor(struct bt_conn *conn, const struct bt_gatt_attr *attr,
                           const void *buf, uint16_t len, uint16_t offset, uint8_t flags)
{
    ARG_UNUSED(conn);
    ARG_UNUSED(attr);
    ARG_UNUSED(offset);
    ARG_UNUSED(flags);

    const uint8_t *value = buf;

    if (len >= 1U) {
        motor_set_vibration(value[0]);
        printk("Motor command: %u\n", value[0]);
    }

    return len;
}

static ssize_t write_led(struct bt_conn *conn, const struct bt_gatt_attr *attr,
                         const void *buf, uint16_t len, uint16_t offset, uint8_t flags)
{
    ARG_UNUSED(conn);
    ARG_UNUSED(attr);
    ARG_UNUSED(offset);
    ARG_UNUSED(flags);

    const uint8_t *value = buf;

    if (len >= 1U) {
        if (value[0] == 1U || value[0] == '1') {
            led_set(true);
            printk("LED command received: ON\n");
        } else if (value[0] == 0U || value[0] == '0') {
            led_set(false);
            printk("LED command received: OFF\n");
        }
    }

    return len;
}

static ssize_t read_led(struct bt_conn *conn, const struct bt_gatt_attr *attr,
                        void *buf, uint16_t len, uint16_t offset)
{
    uint8_t value = led_get() ? 1U : 0U;
    return bt_gatt_attr_read(conn, attr, buf, len, offset, &value, sizeof(value));
}

static ssize_t write_switch(struct bt_conn *conn, const struct bt_gatt_attr *attr,
                            const void *buf, uint16_t len, uint16_t offset, uint8_t flags)
{
    ARG_UNUSED(conn);
    ARG_UNUSED(attr);
    ARG_UNUSED(offset);
    ARG_UNUSED(flags);

    const uint8_t *value = buf;

    if (len >= 1U) {
        mouse_right_switch_set(value[0] == 1U);
    }

    return len;
}

static ssize_t read_calibration_status(struct bt_conn *conn, const struct bt_gatt_attr *attr,
                                       void *buf, uint16_t len, uint16_t offset)
{
    struct sensor_calibration_status status;

    ARG_UNUSED(attr);
    sensor_get_calibration_status(&status);

    return bt_gatt_attr_read(conn, attr, buf, len, offset, &status, sizeof(status));
}

static ssize_t write_calibration_command(struct bt_conn *conn, const struct bt_gatt_attr *attr,
                                         const void *buf, uint16_t len, uint16_t offset,
                                         uint8_t flags)
{
    ARG_UNUSED(conn);
    ARG_UNUSED(attr);
    ARG_UNUSED(offset);
    ARG_UNUSED(flags);

    const uint8_t *value = buf;

    if ((len < 1U) || (sensor_start_calibration(value[0]) != 0)) {
        return BT_GATT_ERR(BT_ATT_ERR_VALUE_NOT_ALLOWED);
    }

    printk("Calibration command: %u\n", value[0]);
    return len;
}

BT_GATT_SERVICE_DEFINE(custom_srv,
    BT_GATT_PRIMARY_SERVICE(BT_UUID_CUSTOM_SERV),
    BT_GATT_CHARACTERISTIC(BT_UUID_CUSTOM_CHAR_LED,
                           BT_GATT_CHRC_READ | BT_GATT_CHRC_WRITE,
                           BT_GATT_PERM_READ | BT_GATT_PERM_WRITE,
                           read_led, write_led, NULL),
    BT_GATT_CHARACTERISTIC(BT_UUID_CUSTOM_CHAR_TEMP,
                           BT_GATT_CHRC_NOTIFY,
                           BT_GATT_PERM_NONE,
                           NULL, NULL, NULL),
    BT_GATT_CCC(temp_ccc_cfg_changed,
                BT_GATT_PERM_READ | BT_GATT_PERM_WRITE),
    BT_GATT_CHARACTERISTIC(BT_UUID_CUSTOM_CHAR_MOTOR,
                           BT_GATT_CHRC_WRITE,
                           BT_GATT_PERM_WRITE,
                           NULL, write_motor, NULL),
    BT_GATT_CHARACTERISTIC(BT_UUID_CUSTOM_CHAR_HALL1,
                           BT_GATT_CHRC_NOTIFY,
                           BT_GATT_PERM_NONE,
                           NULL, NULL, NULL),
    BT_GATT_CCC(hall1_ccc_cfg_changed,
                BT_GATT_PERM_READ | BT_GATT_PERM_WRITE),
    BT_GATT_CHARACTERISTIC(BT_UUID_CUSTOM_CHAR_HALL2,
                           BT_GATT_CHRC_NOTIFY,
                           BT_GATT_PERM_NONE,
                           NULL, NULL, NULL),
    BT_GATT_CCC(hall2_ccc_cfg_changed,
                BT_GATT_PERM_READ | BT_GATT_PERM_WRITE),
    BT_GATT_CHARACTERISTIC(BT_UUID_CUSTOM_CHAR_SWITCH,
                           BT_GATT_CHRC_WRITE,
                           BT_GATT_PERM_WRITE,
                           NULL, write_switch, NULL),
    BT_GATT_CHARACTERISTIC(BT_UUID_CUSTOM_CHAR_CAL_STATUS,
                           BT_GATT_CHRC_READ,
                           BT_GATT_PERM_READ,
                           read_calibration_status, NULL, NULL),
    BT_GATT_CHARACTERISTIC(BT_UUID_CUSTOM_CHAR_CAL_COMMAND,
                           BT_GATT_CHRC_WRITE,
                           BT_GATT_PERM_WRITE,
                           NULL, write_calibration_command, NULL),
);

int ble_service_notify_hall_sensors(int32_t hall1, int32_t hall2)
{
    int err = 0;

    if (hall1_notify_enabled) {
        err = bt_gatt_notify(NULL, &custom_srv.attrs[HALL1_NOTIFY_ATTR_INDEX],
                             &hall1, sizeof(hall1));
    }

    if (hall2_notify_enabled) {
        err = bt_gatt_notify(NULL, &custom_srv.attrs[HALL2_NOTIFY_ATTR_INDEX],
                             &hall2, sizeof(hall2));
    }

    return err;
}

int ble_service_notify_temperature(int32_t temperature)
{
    if (!temp_notify_enabled) {
        return 0;
    }

    return bt_gatt_notify(NULL, &custom_srv.attrs[TEMP_NOTIFY_ATTR_INDEX],
                          &temperature, sizeof(temperature));
}
