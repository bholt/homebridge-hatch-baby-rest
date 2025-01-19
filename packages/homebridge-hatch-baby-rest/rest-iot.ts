import {
  IotDeviceInfo,
  Product,
  RestIotRoutine,
  RestIotState,
  AudioTrack,
  audioTracks,
} from '../shared/hatch-sleep-types'
import { distinctUntilChanged, map } from 'rxjs/operators'
import { BaseDevice } from '../shared/base-accessory'
import { IotDevice, convertToPercentage, MAX_IOT_VALUE, convertFromPercentage } from './iot-device'
import { BehaviorSubject } from 'rxjs'
import { thingShadow as AwsIotDevice } from 'aws-iot-device-sdk'
import { apiPath, RestClient } from './rest-client'
import { LightAndSoundMachine } from '../shared/light-and-sound-machine'
import { HsbColor, hsbToRgb, rgbToHsb } from '../shared/colors'

export class RestIot extends IotDevice<RestIotState> implements BaseDevice, LightAndSoundMachine {
  readonly model =
    this.info.product === Product.restoreIot
      ? 'Restore IoT'
      : Product.riotPlus
        ? 'Rest+ 2nd Gen'
        : 'Rest 2nd Gen'

  constructor(
    public readonly info: IotDeviceInfo,
    public readonly onIotClient: BehaviorSubject<AwsIotDevice>,
    public readonly restClient: RestClient,
  ) {
    super(info, onIotClient)
  }

  audioTracks = audioTracks

  onSomeContentPlaying = this.onState.pipe(
    map((state) => state.current.playing !== 'none'),
    distinctUntilChanged(),
  )

  onFirmwareVersion = this.onState.pipe(map((state) => state.deviceInfo.f))

  onVolume = this.onState.pipe(
    map((state) => convertToPercentage(state.current.sound.v)),
    distinctUntilChanged(),
  )

  onAudioTrack = this.onState.pipe(
    map((state) => state.current.sound.id),
    distinctUntilChanged(),
  )

  onAudioPlaying = this.onAudioTrack.pipe(
    map((track) => track !== AudioTrack.None),
    distinctUntilChanged(),
  )

  onIsPowered = this.onState.pipe(
    map((state) => state.current.playing != 'none'),
    distinctUntilChanged(),
  )

  onBrightness = this.onState.pipe(
    map((state) => {
      let c = state.current.color
      if (c.r === 0 && c.g === 0 && c.b === 0 && !c.r && !c.w) {
        // when "no" color is selected in Rest app, i (intensity) doesn't get set to 0, but everything else does
        return 0
      }
      return convertToPercentage(c.i)
    }),
    distinctUntilChanged(),
  )

  onHsb = this.onState.pipe(map((state) => rgbToHsb(state.current.color, MAX_IOT_VALUE)))

  onHue = this.onHsb.pipe(
    map(({ h }) => h),
    distinctUntilChanged(),
  )

  onSaturation = this.onHsb.pipe(
    map(({ s }) => s),
    distinctUntilChanged(),
  )

  onBatteryLevel = this.onState.pipe(
    map((state) => state.deviceInfo.fR),
    distinctUntilChanged(),
  )

  private setCurrent(
    playing: RestIotState['current']['playing'],
    step: number,
    srId: number,
  ) {
    this.update({
      current: {
        playing,
        step,
        srId,
      },
    })
  }

  setPower(on: boolean) {
    if (on) {
      this.turnOnRoutine()
    } else {
      this.turnOff()
    }
  }

  setHsb({ h, s, b }: HsbColor) {
    // NOTE: lights assume 100% brightness in color calculations
    const rgb = hsbToRgb({ h, s, b: 100 }, MAX_IOT_VALUE)

    this.update({
      current: {
        color: {
          ...rgb,
          i: convertFromPercentage(b),
        }
      }
    })
  }

  setVolume(percentage: number) {
    // unimplemented
  }

  setAudioTrack(audioTrack: AudioTrack) {
    // unimplemented
  }

  setAudioPlaying(playing: boolean) {
    if (!playing) {
      return this.setAudioTrack(AudioTrack.None)
    }
    // do nothing for other audio tracks.  They will be handed to `setAudioTrack` directly
  }

  async turnOnRoutine() {
    const routines = await this.fetchRoutines()
    this.setCurrent('routine', 1, routines[0].id)
  }

  turnOff() {
    this.setCurrent('none', 0, 0)
  }

  async fetchRoutines() {
    const routinesPath = apiPath(
        `service/app/routine/v2/fetch?macAddress=${encodeURIComponent(
          this.info.macAddress,
        )}`,
      ),
      allRoutines = await this.restClient.request<RestIotRoutine[]>({
        url: routinesPath,
        method: 'GET',
      }),
      sortedRoutines = allRoutines.sort(
        (a, b) => a.displayOrder - b.displayOrder,
      ),
      touchRingRoutines = sortedRoutines.filter((routine) => {
        return (
          routine.type === 'favorite' || // Before upgrade, only favorites were on touch ring
          routine.button0 // After upgrade, many routine types can be on touch ring but will have `button0: true`
        )
      })

    return touchRingRoutines
  }
}
