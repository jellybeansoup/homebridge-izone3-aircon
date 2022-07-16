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
					this.log.debug('System refreshed.');
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

		return this.axios
			.get('http://' + this.ip + '/SystemSettings')
			.then( response => {
				_system = System.fromJSON(response.data);
				return this.getZones(_system.numberOfZones);
			})
			.then( zones => {
				_system.zones = zones;
				return _system;
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

	public enableSystem(): Promise<System> {
		return this.sendCommand('SystemON', 'on')
			.then( () => {
				return this.getSystem();
			});
	}

	public disableSystem(): Promise<System> {
		return this.sendCommand('SystemON', 'off')
			.then( () => {
				return this.getSystem();
			});
	}

	public setSystemMode(
		mode: SystemMode,
	): Promise<System> {
		return this.sendCommand('SystemMODE', mode.toString())
			.then( () => {
				return this.getSystem();
			});
	}

	public setFanSpeed(
		fanSpeed: FanSpeed,
	): Promise<System> {
		return this.sendCommand('SystemFAN', fanSpeed.toString())
			.then( () => {
				return this.getSystem();
			});
	}

	public setTargetTemp(
		targetTemp: number,
	): Promise<System> {
		return this.sendCommand('UnitSetpoint', targetTemp.toString())
			.then( () => {
				return this.getSystem();
			});
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

	private zoneCommand(
		zoneIndex: number,
		command: string,
	): Promise<Zone> {
		const system = this.system;

		if (!system) {
			return Promise.reject('Invalid system.');
		}

		return this.sendCommand('ZoneCommand', {
			'ZoneNo': (zoneIndex + 1).toString(),
			'Command': command,
		})
			.then( response => {
				return this.getZones(system.numberOfZones);
			})
			.then( zones => {
				return zones[zoneIndex];
			});
	}

	public openZone(
		zoneIndex: number,
	): Promise<void> {
		return this.zoneCommand(zoneIndex, 'open')
			.then( zone => {
				this.log.info(zone.name + ' opened.');
			});
	}

	public closeZone(
		zoneIndex: number,
	): Promise<void> {
		return this.zoneCommand(zoneIndex, 'close')
			.then( zone => {
				this.log.info(zone.name + ' closed.');
			});
	}

	public setTargetTempForZone(
		targetTemp: number,
		zoneIndex: number,
	): Promise<void> {
		return this.zoneCommand(zoneIndex, targetTemp.toString())
			.then( zone => {
				this.log.info(`${zone.name} set to ${zone.targetTemp} (${targetTemp})°.`);
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
