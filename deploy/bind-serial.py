#!/usr/bin/python3
from pathlib import Path
import subprocess,time
subprocess.run(['modprobe','usbserial'],check=True)
for attempt in range(30):
    devices=[d for d in Path('/sys/bus/usb/devices').iterdir() if (d/'idVendor').exists() and (d/'idVendor').read_text().strip()=='2c91' and (d/'idProduct').read_text().strip()=='0002']
    if not devices: break
    if len(devices)!=1: raise RuntimeError('Expected exactly one ML307X')
    d=devices[0]
    driver=Path(str(d)+':1.1')/'driver'
    if driver.exists() and driver.resolve().name=='rndis_host':
        ids=Path('/sys/bus/usb-serial/drivers/generic/new_id')
        if '2c91 0002 0a' not in ids.read_text(): ids.write_text('2c91 0002 0a\n')
        break
    time.sleep(1)
else: raise RuntimeError('RNDIS not bound; refusing to claim network interface')
