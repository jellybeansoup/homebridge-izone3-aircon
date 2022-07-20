import { PlatformAccessory, CharacteristicValue } from 'homebridge';
import { System, SystemMode, FanSpeed } from './izone';
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
				maxValue: 100,
				minValue: 0,
				minStep: 25,
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
		const service = this.accessory.getService(this.platform.Service.HeaterCooler);

		if (service) {
			service.getCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature)
				.setProps({
					maxValue: this.system.economyLock ? this.system.economyMaximumTemp : 30,
					minValue: this.system.economyLock ? this.system.economyMinimumTemp : 15,
				});

			service.getCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature)
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
		if (value) {
			this.platform.izone.enableSystem()
				.catch( error => {
					this.platform.log.error(`Unable to enable system: ${error}`);
				});
		} else if (!value) {
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
		case FanSpeed.low: {
			return 25;
		}
		case FanSpeed.medium: {
			return 50;
		}
		case FanSpeed.high: {
			return 75;
		}
		case FanSpeed.auto: {
			return 100;
		}
		}
	}

	private setRotationSpeed(value: CharacteristicValue) {
		let fanSpeed: FanSpeed;

		if (value >= 87.5) {
			fanSpeed = FanSpeed.auto;
		} else if (value >= 62.5) {
			fanSpeed = FanSpeed.high;
		} else if (value >= 37.5) {
			fanSpeed = FanSpeed.medium;
		} else if (value >= 12.5) {
			fanSpeed = FanSpeed.low;
		} else {
			return;
		}

		this.platform.izone.setFanSpeed(fanSpeed)
			.catch( error => {
				this.platform.log.error(`Unable to change fan speed: ${error}`);
			});
	}

	private getTargetTemperature(): CharacteristicValue {
		return this.system.targetTemp;
	}

	private setTargetTemperature(value: CharacteristicValue) {
		const targetTemp = parseFloat(value.toString());

		this.platform.izone.setTargetTemp(targetTemp)
			.catch( error => {
				this.platform.log.error(`Unable to set target temperature: ${error}`);
			});
	}


}