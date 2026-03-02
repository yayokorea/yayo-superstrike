#include "ble.h"
#include "led.h"

#include <zephyr/kernel.h>
#include <zephyr/sys/printk.h>
#include <zephyr/bluetooth/bluetooth.h>
#include <zephyr/bluetooth/uuid.h>
#include <zephyr/bluetooth/gatt.h>
#include <zephyr/bluetooth/conn.h>

/* Custom Service UUID: 2cfd0a83-f013-4fe2-8dbd-fe3a5f4a64ff */
#define BT_UUID_CUSTOM_SERV_VAL \
	BT_UUID_128_ENCODE(0x2cfd0a83, 0xf013, 0x4fe2, 0x8dbd, 0xfe3a5f4a64ff)
#define BT_UUID_CUSTOM_SERV BT_UUID_DECLARE_128(BT_UUID_CUSTOM_SERV_VAL)

/* Custom Characteristic UUID: 2cfd0a84-f013-4fe2-8dbd-fe3a5f4a64ff */
#define BT_UUID_CUSTOM_CHAR_VAL \
	BT_UUID_128_ENCODE(0x2cfd0a84, 0xf013, 0x4fe2, 0x8dbd, 0xfe3a5f4a64ff)
#define BT_UUID_CUSTOM_CHAR BT_UUID_DECLARE_128(BT_UUID_CUSTOM_CHAR_VAL)

/* Custom Characteristic UUID for Temp: 2cfd0a85-f013-4fe2-8dbd-fe3a5f4a64ff */
#define BT_UUID_CUSTOM_CHAR_TEMP_VAL \
	BT_UUID_128_ENCODE(0x2cfd0a85, 0xf013, 0x4fe2, 0x8dbd, 0xfe3a5f4a64ff)
#define BT_UUID_CUSTOM_CHAR_TEMP BT_UUID_DECLARE_128(BT_UUID_CUSTOM_CHAR_TEMP_VAL)

static bool notify_enabled;

static void temp_ccc_cfg_changed(const struct bt_gatt_attr *attr, uint16_t value)
{
	notify_enabled = (value == BT_GATT_CCC_NOTIFY);
	printk("Temperature notifications %s\n", notify_enabled ? "enabled" : "disabled");
}

static ssize_t write_led(struct bt_conn *conn, const struct bt_gatt_attr *attr,
                         const void *buf, uint16_t len, uint16_t offset, uint8_t flags)
{
	uint8_t *value = (uint8_t *)buf;

	if (len >= 1) {
		if (value[0] == 1 || value[0] == '1') {
			led_set(true);
			printk("LED 명령 수신: 켜기(ON)\n");
		} else if (value[0] == 0 || value[0] == '0') {
			led_set(false);
			printk("LED 명령 수신: 끄기(OFF)\n");
		}
	}
	return len;
}

static ssize_t read_led(struct bt_conn *conn, const struct bt_gatt_attr *attr,
                        void *buf, uint16_t len, uint16_t offset)
{
	uint8_t value = led_get() ? 1 : 0;
	return bt_gatt_attr_read(conn, attr, buf, len, offset, &value, sizeof(value));
}

BT_GATT_SERVICE_DEFINE(custom_srv,
	BT_GATT_PRIMARY_SERVICE(BT_UUID_CUSTOM_SERV),
	BT_GATT_CHARACTERISTIC(BT_UUID_CUSTOM_CHAR,
			       BT_GATT_CHRC_READ | BT_GATT_CHRC_WRITE,
			       BT_GATT_PERM_READ | BT_GATT_PERM_WRITE,
			       read_led, write_led, NULL),
	BT_GATT_CHARACTERISTIC(BT_UUID_CUSTOM_CHAR_TEMP,
			       BT_GATT_CHRC_NOTIFY,
			       BT_GATT_PERM_NONE,
			       NULL, NULL, NULL),
	BT_GATT_CCC(temp_ccc_cfg_changed,
		    BT_GATT_PERM_READ | BT_GATT_PERM_WRITE),
);

int ble_notify_temperature(int32_t temperature)
{
	if (!notify_enabled) {
		return 0;
	}

	return bt_gatt_notify(NULL, &custom_srv.attrs[4], &temperature, sizeof(temperature));
}

#define DEVICE_NAME CONFIG_BT_DEVICE_NAME
#define DEVICE_NAME_LEN (sizeof(DEVICE_NAME) - 1)

static const struct bt_data ad[] = {
	BT_DATA_BYTES(BT_DATA_FLAGS, (BT_LE_AD_GENERAL | BT_LE_AD_NO_BREDR)),
	BT_DATA_BYTES(BT_DATA_UUID16_ALL,
		      BT_UUID_16_ENCODE(BT_UUID_GATT_VAL)),
	BT_DATA_BYTES(BT_DATA_UUID128_ALL, BT_UUID_CUSTOM_SERV_VAL),
};

static const struct bt_data sd[] = {
	BT_DATA(BT_DATA_NAME_COMPLETE, DEVICE_NAME, DEVICE_NAME_LEN),
};

static void connected(struct bt_conn *conn, uint8_t err)
{
	if (err) {
		printk("Connection failed (err 0x%02x)\n", err);
	} else {
		printk("Connected\n");
	}
}

static void disconnected(struct bt_conn *conn, uint8_t reason)
{
	printk("Disconnected (reason 0x%02x)\n", reason);
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

	struct bt_le_adv_param adv_param = {
		.id = BT_ID_DEFAULT,
		.sid = 0,
		.secondary_max_skip = 0,
		.options = BT_LE_ADV_OPT_CONN, 
		.interval_min = BT_GAP_ADV_FAST_INT_MIN_2,
		.interval_max = BT_GAP_ADV_FAST_INT_MAX_2,
		.peer = NULL,
	};

	err = bt_le_adv_start(&adv_param, ad, ARRAY_SIZE(ad), sd, ARRAY_SIZE(sd));

	if (err) {
		printk("Advertising failed to start (err %d)\n", err);
		return;
	}

	printk("Advertising successfully started\n");
}

int ble_init(void)
{
	int err = bt_enable(bt_ready);
	if (err) {
		printk("Bluetooth init failed (err %d)\n", err);
		return err;
	}
	return 0;
}
