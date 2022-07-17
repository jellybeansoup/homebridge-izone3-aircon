# Homebridge iZone 3 Air Conditioner

A plugin for [Homebridge](https://homebridge.io) which allows you to control your iZone air conditioner system with HomeKit (Note that in some areas, iZone is known as MyZone).

This plugin uses v1.0 of the iZone 3 API (what are versions), and should support most (if not all) air conditioners which use that system. It doesn't currently support any systems that use any of the v2 endpoints.

## Installation

1. Install homebridge using: `npm install -g homebridge`
2. Install this plugin using: `npm install -g homebridge-izone3-aircon`
3. Update your `config.json` file using the example snippet below as a guide.

## Configuration

Configuration sample (edit `~/homebridge/config.json`):

```json
{
	"platforms": [
		{
			"platform": "iZone3AirConditioner",
			"name": "Air Conditioner",
			"ip": "XXX.XXX.XXX.XXX",
			"updateInterval": 60000
		}
	]
}
```

Only the `"platform"` and `"ip"` fields are required. You will need to use a static IP address for your iZone bridge; check the documentation for your router on how to configure this in its DHCP settings.

Providing the `"name"` property will override the name of the main system accessory.

You can also configure the `"updateInterval"` to get Homebridge to update with the latest values more often; by default this is 60,000 milliseconds.

## Accessories

The plugin registers a "Heater Cooler" accessory for the main system, and either a "Switch" or a "Thermostat" for all configured zones (depending on whether they have individual temperature controls).

## System

The system accessory allows you to enable and disable the entire system, select between "Heat", "Cool" and "Auto" modes ("Vent" and "Dry" are not available due to a limitation in Homekit), adjust the fan speed, and set the overall temperature. If the central heating/cooling unit is controlled by the zones (and the standard controller doesn't allow adjusting it directly), changing the temperature using this accessory will open and apply the selected temperature to all zones.

# Constant Zones

Constant zones are not currently supported.

# Open/Close Zones

For any zones that provide the ability to open and close them, an accessory with a toggle switch is registered. As expected, this allows the individual zone to be opened and closed.

# Climate Control Zones

For zones with thermostats, a temperature control is registered. This may be used to set the temperature for the selected zone, as well as toggle between the closed and climate control state. Setting the zone to the "open" state is not currently supported.
