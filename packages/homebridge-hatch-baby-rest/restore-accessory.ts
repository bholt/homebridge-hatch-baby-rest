import { hap } from '../shared/hap'
import { PlatformAccessory } from 'homebridge'
import { BaseAccessory } from '../shared/base-accessory'
import { RestIot } from './rest-iot'
import { Restore } from './restore'
import { logInfo } from '../shared/util'
import { HsbColor } from '../shared/colors'
import { Observable, Subject } from 'rxjs'
import { debounceTime, map, startWith } from 'rxjs/operators'

export class RestoreAccessory extends BaseAccessory {
  constructor(restore: RestIot, accessory: PlatformAccessory) {
    super(restore, accessory)

    const { Service, Characteristic } = hap,
      onOffService = this.getService(Service.Switch),
      lightService = this.getService(Service.Lightbulb, 'Light'),
      context = accessory.context as HsbColor,
      onHsbSet = new Subject(),
      stepName = restore instanceof RestIot ? 'routine' : 'bedtime step',
      onBrightness = restore.onBrightness.pipe(startWith(context.b || 0))

    this.registerCharacteristic(
      onOffService.getCharacteristic(Characteristic.On),
      restore.onSomeContentPlaying,
      (on) => {
        logInfo(
          `Turning ${on ? `on first ${stepName} for` : 'off'} ${restore.name}`,
        )
        if (on) {
          restore.turnOnRoutine()
        } else {
          restore.turnOff()
        }
      },
    )

    onOffService.setPrimaryService(true)

    // add light controls
    this.registerCharacteristic(
      lightService.getCharacteristic(Characteristic.Hue),
      restore.onHue,
      (hue) => {
        context.h = hue
        onHsbSet.next(null)
      },
    )
    this.registerCharacteristic(
      lightService.getCharacteristic(Characteristic.Saturation),
      restore.onSaturation,
      (saturation) => {
        context.s = saturation
        onHsbSet.next(null)
      },
    )
    this.registerCharacteristic(
      lightService.getCharacteristic(Characteristic.Brightness),
      onBrightness,
      (brightness) => {
        context.b = brightness
        onHsbSet.next(null)
      },
    )
  }
}
