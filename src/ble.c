#include "ble.h"

#include "ble_service.h"

#include <zephyr/bluetooth/bluetooth.h>
#include <zephyr/bluetooth/conn.h>
#include <zephyr/bluetooth/uuid.h>
#include <zephyr/kernel.h>
#include <zephyr/sys/printk.h>

/* Custom Service UUID: 2cfd0a83-f013-4fe2-8dbd-fe3a5f4a64ff */
#define BT_UUID_CUSTOM_SERV_VAL \
    BT_UUID_128_ENCODE(0x2cfd0a83, 0xf013, 0x4fe2, 0x8dbd, 0xfe3a5f4a64ff)

#define DEVICE_NAME CONFIG_BT_DEVICE_NAME
#define DEVICE_NAME_LEN (sizeof(DEVICE_NAME) - 1)

static const struct bt_data ad[] = {
    BT_DATA_BYTES(BT_DATA_FLAGS, (BT_LE_AD_GENERAL | BT_LE_AD_NO_BREDR)),
    BT_DATA_BYTES(BT_DATA_UUID16_ALL, BT_UUID_16_ENCODE(BT_UUID_GATT_VAL)),
    BT_DATA_BYTES(BT_DATA_UUID128_ALL, BT_UUID_CUSTOM_SERV_VAL),
};

static const struct bt_data sd[] = {
    BT_DATA(BT_DATA_NAME_COMPLETE, DEVICE_NAME, DEVICE_NAME_LEN),
};

static struct k_work adv_work;

static void start_advertising(void)
{
    struct bt_le_adv_param adv_param = {
        .id = BT_ID_DEFAULT,
        .sid = 0,
        .secondary_max_skip = 0,
        .options = BT_LE_ADV_OPT_CONN,
        .interval_min = 1600,
        .interval_max = 1632,
        .peer = NULL,
    };

    int err = bt_le_adv_start(&adv_param, ad, ARRAY_SIZE(ad), sd, ARRAY_SIZE(sd));

    if (err) {
        printk("Advertising failed to start (err %d)\n", err);
    } else {
        printk("Advertising successfully started\n");
    }
}

static void adv_work_handler(struct k_work *work)
{
    ARG_UNUSED(work);
    start_advertising();
}

static void connected(struct bt_conn *conn, uint8_t err)
{
    ARG_UNUSED(conn);

    if (err) {
        printk("Connection failed (err 0x%02x)\n", err);
    } else {
        printk("Connected\n");
    }
}

static void disconnected(struct bt_conn *conn, uint8_t reason)
{
    ARG_UNUSED(conn);
    printk("Disconnected (reason 0x%02x)\n", reason);
    k_work_submit(&adv_work);
}

BT_CONN_CB_DEFINE(conn_callbacks) = {
    .connected = connected,
    .disconnected = disconnected,
};

static void bt_ready(int err)
{
    if (err) {
        printk("Bluetooth init failed (err %d)\n", err);
        return;
    }

    printk("Bluetooth initialized\n");
    start_advertising();
}

int ble_notify_hall_sensors(int32_t hall1, int32_t hall2)
{
    return ble_service_notify_hall_sensors(hall1, hall2);
}

int ble_notify_temperature(int32_t temperature)
{
    return ble_service_notify_temperature(temperature);
}

int ble_init(void)
{
    k_work_init(&adv_work, adv_work_handler);

    int err = bt_enable(bt_ready);
    if (err) {
        printk("Bluetooth init failed (err %d)\n", err);
        return err;
    }

    return 0;
}
