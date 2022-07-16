import { Service, PlatformAccessory, Characteristic, CharacteristicValue } from 'homebridge';
import { iZone, System, SystemMode, FanSpeed, Zone, ZoneType, ZoneMode } from './izone';
import { AirConditionerPlatform } from './platform';

export class SystemAccessory {

	constructor(
		public system: System,
		private readonly platform: AirConditionerPlatform,
		private readonly accessory: PlatformAccessory,
	) {
		accessory.getService(this.platform.Service.AccessoryInformation)!
			.setCharacteristic(this.platform.Characteristic.Manufacturer, 'iZone')
			.setCharacteristic(this.platform.Characteristic.SerialNumber, system.deviceUID)
			.setCharacteristic(this.platform.Characteristic.Model, system.unitType);

		this.platform.log.debug('', system);

		const service = accessory.getService(this.platform.Service.HeaterCooler) ||
			accessory.addService(this.platform.Service.HeaterCooler);

		service.getCharacteristic(this.platform.Characteristic.Active)
			.onGet(this.getActive.bind(this))
			.onSet(this.setActive.bind(this));

		service.getCharacteristic(this.platform.Characteristic.CurrentHeaterCoolerState)
			.onGet(this.getCurrentHeaterCoolerState.bind(this));

		service.getCharacteristic(this.platform.Characteristic.TargetHeaterCoolerState)
			.onGet(this.getTargetHeaterCoolerState.bind(this))
			.onSet(this.setTargetHeaterCoolerState.bind(this));

		service.getCharacteristic(this.platform.Characteristic.RotationSpeed)
			.setProps({
				maxValue: 3,
				minValue: 0,
				minStep: 1,
			})
			.onGet(this.getRotationSpeed.bind(this))
			.onSet(this.setRotationSpeed.bind(this));

		service.getCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature)
			.setProps({
				maxValue: system.economyLock ? system.economyMaximumTemp : 30,
				minValue: system.economyLock ? system.economyMinimumTemp : 15,
				minStep: 0.5,
				unit: 'celsius',
			})
			.onGet(this.getTargetTemperature.bind(this))
			.onSet(this.setTargetTemperature.bind(this));

		service.getCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature)
			.setProps({
				maxValue: system.economyLock ? system.economyMaximumTemp : 30,
				minValue: system.economyLock ? system.economyMinimumTemp : 15,
				minStep: 0.5,
				unit: 'celsius',
			})
			.onGet(this.getTargetTemperature.bind(this))
			.onSet(this.setTargetTemperature.bind(this));

		this.update();
	}

	public update() {
		const service = this.accessory.getService(this.platform.Service.Thermostat);

		if (service) {
			service.getCharacteristic(this.platform.Characteristic.TargetTemperature)
				.setProps({
					maxValue: this.system.economyLock ? this.system.economyMaximumTemp : 30,
					minValue: this.system.economyLock ? this.system.economyMinimumTemp : 15,
				});

			service.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
				.updateValue(this.system.actualTemp);
		}
	}

	private getActive(): CharacteristicValue {
		return this.system.isOn;
	}

	private setActive(value: CharacteristicValue) {
		if (value && !this.system.isOn) {
			this.platform.izone.enableSystem()
				.catch( error => {
					this.platform.log.error(`Unable to enable system: ${error}`);
				});
		} else if (!value && this.system.isOn) {
			this.platform.izone.disableSystem()
				.catch( error => {
					this.platform.log.error(`Unable to disable system: ${error}`);
				});
		}
	}

	private getCurrentHeaterCoolerState(): CharacteristicValue {
		if (!this.system.isOn) {
			return this.platform.Characteristic.CurrentHeaterCoolerState.INACTIVE;
		} else {
			switch (this.system.mode) {
			case SystemMode.cool, SystemMode.vent, SystemMode.dry: {
				return this.platform.Characteristic.CurrentHeaterCoolerState.COOLING;
			}
			case SystemMode.heat: {
				return this.platform.Characteristic.CurrentHeaterCoolerState.HEATING;
			}
			case SystemMode.auto: {
				if (this.system.supplyTemp > this.system.targetTemp) {
					return this.platform.Characteristic.CurrentHeaterCoolerState.HEATING;
				} else if (this.system.supplyTemp < this.system.targetTemp) {
					return this.platform.Characteristic.CurrentHeaterCoolerState.COOLING;
				}
			}
			}

			return this.platform.Characteristic.CurrentHeaterCoolerState.IDLE;
		}
	}

	private getTargetHeaterCoolerState(): CharacteristicValue {
		switch (this.system.mode) {
		case SystemMode.cool, SystemMode.vent, SystemMode.dry: {
			return this.platform.Characteristic.TargetHeaterCoolerState.COOL;
		}
		case SystemMode.heat: {
			return this.platform.Characteristic.TargetHeaterCoolerState.HEAT;
		}
		case SystemMode.auto: {
			return this.platform.Characteristic.TargetHeaterCoolerState.AUTO;
		}
		}

		return this.platform.Characteristic.TargetHeaterCoolerState.AUTO;
	}

	private setTargetHeaterCoolerState(value: CharacteristicValue) {
		const promises: Promise<any>[] = [];

		switch (value) {
		case this.platform.Characteristic.TargetHeaterCoolerState.COOL: {
			promises.push(this.platform.izone.setSystemMode(SystemMode.cool));
			break;
		}
		case this.platform.Characteristic.TargetHeaterCoolerState.HEAT: {
			promises.push(this.platform.izone.setSystemMode(SystemMode.heat));
			break;
		}
		case this.platform.Characteristic.TargetHeaterCoolerState.AUTO: {
			promises.push(this.platform.izone.setSystemMode(SystemMode.auto));
			break;
		}
		}

		Promise.all(promises)
			.catch( error => {
				this.platform.log.error(`Unable to change system mode: ${error}`);
			});
	}

	private getRotationSpeed(): CharacteristicValue {
		switch (this.system.fanSpeed) {
		case FanSpeed.auto: {
			return 0;
		}
		case FanSpeed.low: {
			return 1;
		}
		case FanSpeed.medium: {
			return 2;
		}
		case FanSpeed.high: {
			return 3;
		}
		}
	}

	private setRotationSpeed(value: CharacteristicValue) {
		let promise: Promise<any>;

		switch (value) {
		case 0: {
			promise = this.platform.izone.setFanSpeed(FanSpeed.auto);
			break;
		}
		case 1: {
			promise = this.platform.izone.setFanSpeed(FanSpeed.low);
			break;
		}
		case 2: {
			promise = this.platform.izone.setFanSpeed(FanSpeed.medium);
			break;
		}
		case 3: {
			promise = this.platform.izone.setFanSpeed(FanSpeed.high);
			break;
		}
		default: {
			return;
		}
		}

		promise
			.catch( error => {
				this.platform.log.error(`Unable to change fan speed: ${error}`);
			});
	}

	private getTargetTemperature(): CharacteristicValue {
		return this.system.targetTemp;
	}

	private setTargetTemperature(value: CharacteristicValue) {
		const targetTemp = parseFloat(value.toString());
		const promises: Promise<any>[] = [];

		if (this.system.usesSystemSetpoint) {
			promises.push(this.platform.izone.setTargetTemp(targetTemp));
		} else {
			for (const zone of this.system.zones) {
				promises.push(this.platform.izone.setTargetTempForZone(targetTemp, zone.index));
			}
		}

		return promises.reduce((p, promise) => {
			return p.then(() => {
				return promise;
			});
		}, Promise.resolve());
	}


}