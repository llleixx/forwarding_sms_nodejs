# Optional ML307X USB serial workaround

This is an opt-in Linux deployment workaround, not a general driver fix or
vendor-certified ML307X support. Do not install it when a normal AT tty already
works. These files are not installed by the application or Docker build.

## Tested prerequisites

- One CMCC ML307X, firmware ML307X-DC-MBRH1S00, USB VID:PID 2c91:0002.
- Ubuntu kernel 6.8.0-139-generic, with usbserial_generic available.
- USB configuration 1: RNDIS data interface 1 already bound to rndis_host;
  AT interface 3 with bulk endpoints 0x03/0x83.
- systemd, udev and an existing dialout group; root access for installation.

Inspect sysfs and USB descriptors first. Identical product IDs do not guarantee
identical firmware/interface layouts. Multiple matching modules are unsupported.
The dynamic ID matches VID/PID and CDC Data class (0x0a), NOT interface 3 alone:
it can bind unused interfaces 3, 5 and 7. Interface 5 is diagnostic: never scan
or open it. The udev symlink selects interface 03; set serial.autoDetect=false.
The helper waits for rndis_host on interface 1 and does not unbind that driver.
This reduces risk for the tested layout; other layouts require separate review.

## Trial before persistence

Place the checkout at /opt/docker/sms-forwarding (or edit the service path).
Record original USB bindings, network routes and SMS settings. Run
`sudo python3 deploy/bind-serial.py` only after checking the above layout.
Identify the tty through its sysfs USB interface number; test only interface 03
with AT and read-only SIM/registration queries while no other process owns it.
Stop if serial communication is unstable. Do not change USB mode, firmware or
kernel as an automatic fallback.

Only after the trial succeeds:

```sh
sudo install -m 0644 deploy/78-ml307x.rules /etc/udev/rules.d/78-ml307x.rules
sudo install -m 0644 deploy/ml307x-serial.service /etc/systemd/system/ml307x-serial.service
sudo chmod 0755 deploy/bind-serial.py
sudo systemctl daemon-reload
sudo udevadm control --reload-rules
sudo systemctl enable ml307x-serial.service
```

The USB add rule starts the helper asynchronously. The tty rule creates
/dev/ml307x-at and asks ModemManager to ignore this device only. Applying rules
to an already attached device requires a targeted udev change event for its USB
device and tty; verify the symlink resolves to interface 03 before starting SMS.
Boot/replug recovery is intended behavior and still requires real hardware
acceptance testing. Never stop ModemManager globally for this recipe.

## Rollback

Stop the SMS container. Disable the service, remove only the installed files
above, then reload systemd and udev. If reverting runtime bindings, remove the
dynamic ID and unbind only confirmed interfaces belonging to this module after
checking the kernel's sysfs driver controls. Do not unload a shared driver or
detach rndis_host. A USB replug may be needed to restore original enumeration;
do not reboot the whole host. Keep config, data and diagnostic records.
