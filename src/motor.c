#include "motor.h"
#include <zephyr/kernel.h>
#include <zephyr/device.h>
#include <zephyr/drivers/pwm.h>
#include <zephyr/drivers/gpio.h>
#include <zephyr/sys/printk.h> // printk 추가

#define STBY_NODE DT_NODELABEL(gpio0)
#define STBY_PIN 17
#define MOUSE_SWITCH_NODE DT_NODELABEL(gpio1)
#define MOUSE_SWITCH_PIN 11

static const struct device *gpio0_dev;
static const struct device *gpio1_dev;
static const struct device *pwm_dev;

void motor_init(void)
{
    gpio0_dev = DEVICE_DT_GET(STBY_NODE);
    if (!device_is_ready(gpio0_dev)) {
        printk("GPIO device (gpio0) not ready!\n");
    } else {
        gpio_pin_configure(gpio0_dev, STBY_PIN, GPIO_OUTPUT_INACTIVE);
        printk("GPIO STBY initialized on P0.17\n");
    }

    gpio1_dev = DEVICE_DT_GET(MOUSE_SWITCH_NODE);
    if (!device_is_ready(gpio1_dev)) {
        printk("GPIO device (gpio1) not ready!\n");
    } else {
        gpio_pin_configure(gpio1_dev, MOUSE_SWITCH_PIN, GPIO_OUTPUT_INACTIVE);
        printk("Mouse switch initialized on P1.11\n");
    }

    pwm_dev = DEVICE_DT_GET(DT_NODELABEL(pwm0));
    if (!device_is_ready(pwm_dev)) {
        printk("PWM device not ready!\n");
    } else {
        printk("PWM device initialized successfully\n");
    }
}

void motor_set_vibration(int intensity)
{
    if (!gpio0_dev || !pwm_dev || !device_is_ready(gpio0_dev) || !device_is_ready(pwm_dev)) {
        printk("Motor control failed: Device not ready\n");
        return;
    }

    if (intensity > 0) {
        gpio_pin_set(gpio0_dev, STBY_PIN, 1);
        
        // 탭틱 엔진(LRA)은 공진 주파수(약 170Hz)가 중요합니다.
        // 170Hz -> period 약 5,882,353ns
        uint32_t period_ns = 5882353;
        
        // 교류 전압(AC) 밸런스를 맞추기 위해 LRA는 50% 듀티에서 최대 공진(초고강도)이 발생합니다.
        // 255일 때 정확히 50%(반반)가 되도록 계산합니다.
        uint32_t pulse_ns = (period_ns * intensity) / 510; 
        
        // AIN1은 정상 위상(정방향) 펄스
        int err = pwm_set(pwm_dev, 0, period_ns, pulse_ns, 0); // P0.06
        // AIN2는 반전 위상(역방향) 펄스를 주어 전류 방향이 교차되도록 만듭니다!
        int err2 = pwm_set(pwm_dev, 1, period_ns, pulse_ns, PWM_POLARITY_INVERTED); // P0.08
        
        if (err || err2) {
            printk("PWM set failed: err=%d, err2=%d\n", err, err2);
        }
    } else {
        pwm_set(pwm_dev, 0, 1000000, 0, 0);
        pwm_set(pwm_dev, 1, 1000000, 0, 0);
        gpio_pin_set(gpio0_dev, STBY_PIN, 0);
    }
}

void mouse_switch_set(bool state)
{
    if (!gpio1_dev || !device_is_ready(gpio1_dev)) {
        return;
    }
    gpio_pin_set(gpio1_dev, MOUSE_SWITCH_PIN, state ? 1 : 0);
    printk("Mouse switch (P1.11) %s\n", state ? "ON" : "OFF");
}
