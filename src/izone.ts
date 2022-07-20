import { Logger } from 'homebridge';

export class iZone {

	public system?: System;

	public refreshMilliseconds = 60_000;

	private axios = require('axios');

	private backgroundRefreshTimer;

	private refreshHandler: (system: System) => void = () => {};

	constructor(
		public readonly ip: string,
		public readonly log: Logger,
	) { }

	public beginBackgroundRefresh(
		handler: (system: System) => void,
	) {
		this.refreshHandler = handler;
		this.refresh();
	}

	public refresh() {
		this.endBackgroundRefresh();

		const updateSystem = () => {
			this.getSystem()
				.then( system => {
					this.system = system;
					this.refreshHandler(system);
				})
				.catch( error => {
					this.log.error(`Unable to refresh system: ${error}`);
				});

			this.backgroundRefreshTimer = setTimeout(updateSystem, this.refreshMilliseconds);
		};

		updateSystem();
	}

	public endBackgroundRefresh() {
		clearTimeout(this.backgroundRefreshTimer);
	}

	public getSystem(): Promise<System> {
		let _system: System;

		return this.getSystemOnly()
			.then( system => {
				_system = system;
				return this.getZones(_system.numberOfZones);
			})
			.then( zones => {
				_system.zones = zones;
				return _system;
			});
	}

	public getSystemOnly(): Promise<System> {
		return this.axios
			.get('http://' + this.ip + '/SystemSettings')
			.then( response => {
				const json = response.data;
				const system = System.fromJSON(json);
				return system;
			});
	}

	private sendCommand(
		command: string,
		payload: any,
	): Promise<any> {
		const record = {};
		record[command] = payload;
		const json = JSON.stringify(record);
		const url = `http://${this.ip}/${command}`;

		this.log.debug('Sending command:', json);

		return this.axios
			.post(url, json, {
				'Content-Type': 'application/json',
			});
	}

	public enableSystem(): Promise<void> {
		return this.getSystemOnly()
			.then( system => {
				if (system.isOn) {
					this.log.debug('System is already on; ignoring request.');
					return Promise.resolve();
				}

				return this.sendCommand('SystemON', 'on')
					.then(this.getSystemOnly.bind(this))
					.then( system => {
						if (system.isOn) {
							Promise.reject('UNKNOWN');
						}

						this.log.info('System has been turned on.');
					});
			});
	}

	public disableSystem(): Promise<void> {
		return this.getSystemOnly()
			.then( system => {
				if (!system.isOn) {
					this.log.debug('System is already off; ignoring request.');
					return Promise.resolve();
				}

				return this.sendCommand('SystemON', 'off')
					.then(this.getSystemOnly.bind(this))
					.then( system => {
						if (system.isOn) {
							Promise.reject('UNKNOWN');
						}

						this.log.info('System has been turned off.');
					});
			});
	}

	public setSystemMode(
		mode: SystemMode,
	): Promise<void> {
		return this.getSystemOnly()
			.then( system => {
				if (system.mode === mode) {
					this.log.debug(`System is already set to ${system.mode}; ignoring request.`);
					return Promise.resolve();
				}

				return this.sendCommand('SystemMODE', mode.toString())
					.then(this.getSystemOnly.bind(this))
					.then( system => {
						if (system.mode !== mode) {
							Promise.reject('UNKNOWN');
						}

						this.log.info(`System set to ${system.mode}.`);
					});
			});
	}

	public setFanSpeed(
		fanSpeed: FanSpeed,
	): Promise<void> {
		return this.getSystemOnly()
			.then( system => {
				if (system.fanSpeed === fanSpeed) {
					this.log.debug(`Fan speed is already ${system.fanSpeed} for system; ignoring request.`);
					return Promise.resolve();
				}

				return this.sendCommand('SystemFAN', fanSpeed.toString())
					.then(this.getSystemOnly.bind(this))
					.then( system => {
						if (system.fanSpeed !== fanSpeed) {
							Promise.reject('UNKNOWN');
						}

						this.log.info(`Fan speed set to ${system.fanSpeed} for system.`);
					});
			});
	}

	public setTargetTemp(
		targetTemp: number,
	): Promise<void> {
		const system = this.system;

		if (!system) {
			return Promise.reject('Invalid system');
		}

		if (system.usesSystemSetpoint) {
			return this.getSystemOnly()
				.then( system => {
					if (system.targetTemp === targetTemp) {
						this.log.debug(`Target temperature is already ${system.targetTemp}° for system; ignoring request.`);
						return Promise.resolve();
					}

					return this.sendCommand('UnitSetpoint', targetTemp.toString())
						.then(this.getSystemOnly.bind(this))
						.then( system => {
							if (system.targetTemp !== targetTemp) {
								Promise.reject('UNKNOWN');
							}

							this.log.info(`Target temperature set to ${system.targetTemp} for system.`);
						});
				});
		} else {
			return this.getZones(system.numberOfZones)
				.then( zones => {
					const promises: Promise<any>[] = [];
					const indices: Set<number> = new Set();

					for (const zone of zones) {
						if (zone.targetTemp === targetTemp) {
							continue;
						}

						promises.push(this.zoneCommand(zone.index, targetTemp.toString()));
						indices.add(zone.index);
					}

					return promises.reduce((p, promise) => {
						return p.then(() => {
							return promise;
						});
					}, Promise.resolve())
						.then( () => {
							return this.getZones(system.numberOfZones);
						})
						.then( zones => {
							for (const zone of zones) {
								if (!indices.has(zone.index)) {
									continue;
								} else if (zone.targetTemp === targetTemp) {
									this.log.info(`'${zone.name}' zone set to ${zone.targetTemp}°.`);
								} else {
									this.log.error(`'${zone.name}' zone was not set to ${targetTemp}° for unknown reasons.`);
								}
							}
						});
				});
		}
	}

	public getZones(
		maximum: number,
	): Promise<Zone[]> {
		const promises: Promise<object>[] = [];
		if (maximum > 0) {
			promises.push(this.axios.get('http://' + this.ip + '/Zones1_4'));
		}
		if (maximum > 4) {
			promises.push(this.axios.get('http://' + this.ip + '/Zones5_8'));
		}
		if (maximum > 8) {
			promises.push(this.axios.get('http://' + this.ip + '/Zones9_12'));
		}

		return Promise.all(promises)
			.then(results => {
				return results
					.flatMap( response => {
						return response['data'];
					})
					.slice(0, Math.min(12, maximum))
					.map( json => {
						return Zone.fromJSON(json);
					});
			});
	}

	public getZone(
		zoneIndex: number,
	): Promise<Zone> {
		let promise: Promise<object>;
		if (zoneIndex >= 8) {
			promise = this.axios.get('http://' + this.ip + '/Zones9_12');
		} else if (zoneIndex >= 4) {
			promise = this.axios.get('http://' + this.ip + '/Zones5_8');
		} else if (zoneIndex >= 0) {
			promise = this.axios.get('http://' + this.ip + '/Zones1_4');
		} else {
			return Promise.reject('Invalid zone index.');
		}

		return promise
			.then(results => {
				const json = results['data'][zoneIndex % 4];
				const zone = Zone.fromJSON(json);
				return zone;
			});
	}

	private zoneCommand(
		zoneIndex: number,
		command: string,
	): Promise<Zone> {
		const payload = {
			'ZoneNo': (zoneIndex + 1).toString(),
			'Command': command,
		};

		return this.sendCommand('ZoneCommand', payload)
			.then( () => {
				return this.getZone(zoneIndex);
			});
	}

	public setModeForZone(
		zoneMode: ZoneMode,
		zoneIndex: number,
	): Promise<void> {
		return this.getZone(zoneIndex)
			.then( zone => {
				if (zone.mode === zoneMode) {
					this.log.debug(`'${zone.name}' zone is already ${zone.mode}; ignoring request.`);
					return Promise.resolve();
				}

				return this.zoneCommand(zoneIndex, zoneMode)
					.then( zone => {
						if (zone.mode !== zoneMode) {
							Promise.reject('UNKNOWN');
						}

						this.log.info(`'${zone.name}' zone set to ${zone.mode}.`);
					});
			});
	}

	public setTargetTempForZone(
		targetTemp: number,
		zoneIndex: number,
	): Promise<void> {
		return this.getZone(zoneIndex)
			.then( zone => {
				if (zone.targetTemp === targetTemp) {
					this.log.debug(`'${zone.name}' zone is already ${zone.targetTemp}°; ignoring request.`);
					return Promise.resolve();
				}

				return this.zoneCommand(zoneIndex, targetTemp.toString())
					.then( zone => {
						if (zone.targetTemp !== targetTemp) {
							Promise.reject('UNKNOWN');
						}

						this.log.info(`'${zone.name}' zone set to ${zone.targetTemp}°.`);
					});
			});
	}

}

export enum SystemMode {
	cool = 'cool',
	heat = 'heat',
	vent = 'vent',
	dry = 'dry',
	auto = 'auto',
}

export enum FanSpeed {
	low = 'low',
	medium = 'med',
	high = 'high',
	auto = 'auto',
}

export enum SystemControl {
	central = 'RAS',
	main = 'master',
	zones = 'zones',
}

export class System {

	public zones: Zone[] = [];

	public usesSystemSetpoint: boolean;

	constructor(
		public readonly deviceUID: string,
		public readonly unitType: string,
		public readonly tag1: string,
		public readonly tag2: string,
		public readonly isOn: boolean,
		public readonly mode: SystemMode,
		public readonly fanSpeed: FanSpeed,
		public readonly supplyTemp: number,
		public readonly targetTemp: number,
		public readonly actualTemp: number,
		public readonly control: SystemControl,
		public readonly controlZone: number,
		public readonly economyLock: boolean,
		public readonly economyMinimumTemp: number,
		public readonly economyMaximumTemp: number,
		public readonly numberOfConstants: number,
		public readonly numberOfZones: number,
	) {
		this.usesSystemSetpoint = (control === SystemControl.central || (control === SystemControl.main && controlZone >= 12));
	}

	static fromJSON(
		json: object,
	): System {
		return new System(
			json['AirStreamDeviceUId'],
			json['UnitType'],
			json['Tag1'],
			json['Tag2'],
			json['SysOn'] === 'on',
			json['SysMode'],
			json['SysFan'],
			parseFloat(json['Supply']),
			parseFloat(json['Setpoint']),
			parseFloat(json['Temp']),
			json['RAS'],
			parseInt(json['CtrlZone']),
			json['EcoLock'] === 'true',
			parseFloat(json['EcoMin']),
			parseFloat(json['EcoMax']),
			parseInt(json['NoOfConst']),
			parseInt(json['NoOfZones']),
		);
	}

}

export enum ZoneType {
	openClose = 'opcl',
	auto = 'auto',
	constant = 'const',
}

export enum ZoneMode {
	open = 'open',
	close = 'close',
	auto = 'auto',
}

export class Zone {

	constructor(
		public readonly deviceUID: string,
		public readonly index: number,
		public readonly name: string,
		public readonly type: ZoneType,
		public readonly mode: ZoneMode,
		public readonly targetTemp: number,
		public readonly actualTemp: number,
		public readonly minimumAir: number,
		public readonly maximumAir: number,
		public readonly constant: number,
		public readonly constantIsActive: boolean,
	) {

	}

	static fromJSON(
		json: object,
	): Zone {
		return new Zone(
			json['AirStreamDeviceUId'],
			json['Index'],
			json['Name'],
			json['Type'],
			json['Mode'],
			parseFloat(json['SetPoint']),
			parseFloat(json['Temp']),
			parseInt(json['MinAir']),
			parseInt(json['MaxAir']),
			parseInt(json['Const']),
			json['ConstA'] === 'true',
		);
	}

}
