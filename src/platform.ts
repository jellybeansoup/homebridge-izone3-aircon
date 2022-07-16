import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
import { iZone, System, Zone, ZoneType } from './izone';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { SystemAccessory } from './systemAccessory';
import { ZoneAccessory } from './zoneAccessory';

export class AirConditionerPlatform implements DynamicPlatformPlugin {
	public readonly Service: typeof Service = this.api.hap.Service;
	public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

	public readonly platformAccessories: Record<string, PlatformAccessory> = {};
	public systemAccessory?: SystemAccessory;
	public readonly zoneAccessories: Record<string, ZoneAccessory> = {};

	public izone: iZone;

	private readonly _unregister = false;

	constructor(
		public readonly log: Logger,
		public readonly config: PlatformConfig,
		public readonly api: API,
	) {
		this.izone = new iZone(this.config.ip, log);
		this.izone.refreshMilliseconds = this.config.updateInterval || 60_000;

		this.api.on('didFinishLaunching', () => {
			log.debug(`Finished initializing. Refresh rate: ${this.izone.refreshMilliseconds / 1_000}s.`);

			this.izone.beginBackgroundRefresh( system => {
				this.updateAccessories(system);
			});
		});

		this.api.on('shutdown', () => {
			this.izone.endBackgroundRefresh();
		});
	}

	configureAccessory(
		accessory: PlatformAccessory,
	) {
		this.log.info(`Found cached zone: ${accessory.displayName}`);
		this.platformAccessories[accessory.UUID] = accessory;
	}

	updateAccessories(
		system: System,
	) {
		this.updateSystemAccessory(system);

		for (const zone of system.zones) {
			this.updateZoneAccessory(zone, system);
		}
	}

	private updateSystemAccessory(
		system: System,
	) {
		const uuid = this.api.hap.uuid.generate(system.deviceUID);
		const existingPlatformAccessory = this.platformAccessories[uuid];
		const existingSystemAccessory = this.systemAccessory;

		if (this._unregister) {
			if (existingPlatformAccessory) {
				this.log.info('Removing system.');
				delete this.zoneAccessories[uuid];
				delete this.platformAccessories[uuid];
				this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingPlatformAccessory]);
			}
		} else if (existingPlatformAccessory) {
			if (existingSystemAccessory) {
				existingSystemAccessory.system = system;
				existingSystemAccessory.update();
			} else {
				this.systemAccessory = new SystemAccessory(system, this, existingPlatformAccessory);
			}
		} else {
			this.log.info('Found system.');
			const accessory = new this.api.platformAccessory(this.config.name || system.tag1, uuid);
			this.systemAccessory = new SystemAccessory(system, this, accessory);
			this.platformAccessories[uuid] = accessory;
			this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
		}
	}

	private updateZoneAccessory(
		zone: Zone,
		system: System,
	) {
		const uuid = this.api.hap.uuid.generate(`${zone.deviceUID}-${zone.index}`);
		const existingPlatformAccessory = this.platformAccessories[uuid];
		const existingZoneAccessory = this.zoneAccessories[uuid];

		if (this._unregister) {
			if (existingPlatformAccessory) {
				this.log.info(`Removing zone: ${zone.name}`);
				delete this.zoneAccessories[uuid];
				delete this.platformAccessories[uuid];
				this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingPlatformAccessory]);
			}
		} else if (existingPlatformAccessory) {
			if (existingZoneAccessory) {
				existingZoneAccessory.system = system;
				existingZoneAccessory.zone = zone;
				existingZoneAccessory.update();
			} else {
				this.zoneAccessories[uuid] = new ZoneAccessory(system, zone, this, existingPlatformAccessory);
			}
		} else if (zone.type !== ZoneType.constant) {
			this.log.info(`Found new zone: ${zone.name}`);
			const accessory = new this.api.platformAccessory(zone.name, uuid);
			this.zoneAccessories[uuid] = new ZoneAccessory(system, zone, this, accessory);
			this.platformAccessories[uuid] = accessory;
			this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
		}
	}

}
