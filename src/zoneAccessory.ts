import { PlatformAccessory, CharacteristicValue } from 'homebridge';
import { System, SystemMode, Zone, ZoneType, ZoneMode } from './izone';
import { AirConditionerPlatform } from './platform';

export class ZoneAccessory {

	constructor(
		public system: System,
		public zone: Zone,
		private readonly platform: AirConditionerPlatform,
		private readonly accessory: PlatformAccessory,
	) {
		accessory.getService(this.platform.Service.AccessoryInformation)!
			.setCharacteristic(this.platform.Characteristic.Manufacturer, 'iZone')
			.setCharacteristic(this.platform.Characteristic.SerialNumber, zone.deviceUID)
			.setCharacteristic(this.platform.Characteristic.Model, 'Unknown');

		if (zone.type === ZoneType.openClose) {
			const service = accessory.getService(this.platform.Service.Fan) ||
				accessory.addService(this.platform.Service.Fan);

			service.getCharacteristic(this.platform.Characteristic.On)
				.onGet(this.getOn.bind(this))
				.onSet(this.setOn.bind(this));
		} else if (zone.type === ZoneType.auto) {
			const service = accessory.getService(this.platform.Service.Thermostat) ||
				accessory.addService(this.platform.Service.Thermostat);

			service.getCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState)
				.onGet(this.getCurrentHeatingCoolingState.bind(this));

			service.getCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState)
				.setProps({
					maxValue: 3,
					minValue: 0,
					validValues: [0, 3],
				})
				.onGet(this.getTargetHeatingCoolingState.bind(this))
				.onSet(this.setTargetHeatingCoolingState.bind(this));

			service.getCharacteristic(this.platform.Characteristic.TargetTemperature)
				.setProps({
					maxValue: this.system.economyLock ? this.system.economyMaximumTemp : 30,
					minValue: this.system.economyLock ? this.system.economyMinimumTemp : 15,
					minStep: 0.5,
					unit: 'celsius',
				})
				.onGet(this.getTargetTemperature.bind(this))
				.onSet(this.setTargetTemperature.bind(this));
		}

		this.update();
	}

	public update() {
		if (this.zone.type === ZoneType.openClose) {
			const service = this.accessory.getService(this.platform.Service.Fan);

			if (service) {
				service.getCharacteristic(this.platform.Characteristic.Name)
					.updateValue(this.zone.name);
			}
		} else if (this.zone.type === ZoneType.auto) {
			const service = this.accessory.getService(this.platform.Service.Thermostat);

			if (service) {
				service.getCharacteristic(this.platform.Characteristic.Name)
					.updateValue(this.zone.name);

				service.getCharacteristic(this.platform.Characteristic.TargetTemperature)
					.setProps({
						maxValue: this.system.economyLock ? this.system.economyMaximumTemp : 30,
						minValue: this.system.economyLock ? this.system.economyMinimumTemp : 15,
					});

				service.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
					.updateValue(this.zone.actualTemp);

				service.getCharacteristic(this.platform.Characteristic.TemperatureDisplayUnits)
					.updateValue(0);
			}
		}
	}

	private getOn(): CharacteristicValue {
		if (!this.system.isOn || this.zone.mode === ZoneMode.close) {
			return false;
		} else {
			return true;
		}
	}

	private setOn(value: CharacteristicValue) {
		if (value) {
			this.platform.izone.setModeForZone(ZoneMode.open, this.zone.index)
				.catch( error => {
					this.platform.log.error(`Unable to open '${this.zone.name}' zone: ${error}`);
				});
		} else {
			this.platform.izone.setModeForZone(ZoneMode.close, this.zone.index)
				.catch( error => {
					this.platform.log.error(`Unable to close '${this.zone.name}' zone: ${error}`);
				});
		}
	}

	private getCurrentHeatingCoolingState(): CharacteristicValue {
		if (!this.system.isOn || this.zone.mode === ZoneMode.close) {
			return this.platform.Characteristic.CurrentHeatingCoolingState.OFF;
		} else {
			switch (this.system.mode) {
			case SystemMode.cool: {
				return this.platform.Characteristic.CurrentHeatingCoolingState.COOL;
			}
			case SystemMode.heat: {
				return this.platform.Characteristic.CurrentHeatingCoolingState.HEAT;
			}
			case SystemMode.vent: {
				return this.platform.Characteristic.CurrentHeatingCoolingState.COOL;
			}
			case SystemMode.dry: {
				return this.platform.Characteristic.CurrentHeatingCoolingState.COOL;
			}
			case SystemMode.auto: {
				if (this.system.targetTemp >= this.system.actualTemp) {
					return this.platform.Characteristic.CurrentHeatingCoolingState.HEAT;
				} else {
					return this.platform.Characteristic.CurrentHeatingCoolingState.COOL;
				}
			}
			case undefined: {
				return this.platform.Characteristic.CurrentHeatingCoolingState.OFF;
			}
			}
		}
	}

	private getTargetHeatingCoolingState(): CharacteristicValue {
		if (this.zone.mode === ZoneMode.close) {
			return this.platform.Characteristic.TargetHeatingCoolingState.OFF;
		} else {
			return this.platform.Characteristic.TargetHeatingCoolingState.AUTO;
		}
	}

	private setTargetHeatingCoolingState(value: CharacteristicValue) {
		if (value === this.platform.Characteristic.TargetHeatingCoolingState.OFF) {
			this.platform.izone.setModeForZone(ZoneMode.close, this.zone.index)
				.catch( error => {
					this.platform.log.error(`Unable to close '${this.zone.name}' zone: ${error}`);
				});
		} else {
			this.platform.izone.setModeForZone(ZoneMode.auto, this.zone.index)
				.catch( error => {
					this.platform.log.error(`Unable to set '${this.zone.name}' zone to climate control: ${error}`);
				});
		}
	}

	private getTargetTemperature(): CharacteristicValue {
		if (this.zone.mode === ZoneMode.close) {
			return this.zone.actualTemp;
		} else if (this.zone.mode === ZoneMode.open) {
			return this.system.targetTemp;
		} else {
			return this.zone.targetTemp;
		}
	}


	private setTargetTemperature(value: CharacteristicValue) {
		const targetTemp = parseFloat(value.toString());

		this.platform.izone.setTargetTempForZone(targetTemp, this.zone.index)
			.catch( error => {
				this.platform.log.error(`Unable to set target temperature (${targetTemp}°) for '${this.zone.name}' zone: ${error}`);
			});
	}

}