import { Platform, Dimensions } from "react-native";
import Constants from "expo-constants";
import Device from "expo-device"
import { Buffer } from "buffer";
import AsyncStorage from "@react-native-async-storage/async-storage";

const { width, height } = Dimensions.get("window");

const MIXPANEL_API_URL = "https://api.mixpanel.com";
const ASYNC_STORAGE_KEY = "mixpanel:super:props";
const isIosPlatform = Platform.OS === "ios";

interface MixpanelAnalyticsMethods {
  register(props: any): void;
  track(name: string, props?: any): void;
  identify(userId?: string): void;
  reset(): void;
  people_set(props: any): void;
  people_set_once(props: any): void;
  people_unset(props: any): void;
  people_increment(props: any): void;
  people_append(props: any): void;
  people_union(props: any): void;
  people_delete_user(): void;
}

export class ExpoMixpanelAnalytics implements MixpanelAnalyticsMethods {
  ready = false;
  token: string;
  userId?: string | null;
  clientId?: string;
  userAgent?: string | null;
  appName?: string;
  appId?: string;
  appVersion?: string;
  screenSize?: string;
  deviceName?: string;
  platform?: string;
  model?: string | null;
  osVersion: string | number;
  queue: any[];
  superProps: any = {};

  constructor(token: string) {
    this.ready = false;
    this.queue = [];

    this.token = token;
    this.userId = null;
    this.clientId = Constants.deviceId;
    this.osVersion = Platform.Version;
    this.superProps;

    Constants.getWebViewUserAgentAsync().then(userAgent => {
      this.userAgent = userAgent;
      this.appName = Constants.expoConfig?.name;
      this.appId = Constants.expoConfig?.slug;
      this.appVersion = Constants.expoConfig?.version;
      this.screenSize = `${width}x${height}`;
      this.deviceName = Constants.deviceName;
      if (isIosPlatform && Constants.platform && Constants.platform.ios) {
        this.platform = Device.modelId;
        this.model = Device.modelName;
      } else {
        this.platform = "android";
      }

      AsyncStorage.getItem(ASYNC_STORAGE_KEY, (_, result) => {
        if (result) {
          try {
            this.superProps = JSON.parse(result) || {};
          } catch {}
        }

        this.ready = true;
        this.identify(this.clientId);
        this._flush();
      }).then();
    });
  }

   register(props: any) {
    this.superProps = props;
    try {
       AsyncStorage.setItem(ASYNC_STORAGE_KEY, JSON.stringify(props)).then();
    } catch {}
  }

  track(name: string, props?: any) {
    this.queue.push({
      name,
      props
    });
    this._flush();
  }

  identify(userId?: string) {
    this.userId = userId;
  }

   reset() {
    this.identify(this.clientId);
    try {
      AsyncStorage.setItem(ASYNC_STORAGE_KEY, JSON.stringify({})).then();
    } catch {}
  }

  people_set(props: any): any {
    this._people("set", props);
  }

  people_set_once(props: any) {
    this._people("set_once", props);
  }

  people_unset(props: any) {
    this._people("unset", props);
  }

  people_increment(props: any) {
    this._people("add", props);
  }

  people_append(props: any) {
    this._people("append", props);
  }

  people_union(props: any) {
    this._people("union", props);
  }

  people_delete_user() {
    this._people("delete", "");
  }

  // ===========================================================================================

  _flush() {
    if (this.ready) {
      while (this.queue.length) {
        const event = this.queue.pop();
        this._pushEvent(event).then(() => (event.sent = true));
      }
    }
  }

  _people(operation: string, props: any) {
    if (this.userId) {
      const data: Record<string, string> = {
        $token: this.token,
        $distinct_id: this.userId
      };
      data[`$${operation}`] = props;

      this._pushProfile(data);
    }
  }

  _pushEvent(event: any) {
    let data = {
      event: event.name,
      properties: {
        ...(event.props || {}),
        ...this.superProps
      }
    };
    if (this.userId) {
      data.properties.distinct_id = this.userId;
    }
    data.properties.token = this.token;
    data.properties.user_agent = this.userAgent;
    data.properties.app_name = this.appName;
    data.properties.app_id = this.appId;
    data.properties.app_version = this.appVersion;
    data.properties.screen_size = this.screenSize;
    data.properties.client_id = this.clientId;
    data.properties.device_name = this.deviceName;
    if (this.platform) {
      data.properties.platform = this.platform;
    }
    if (this.model) {
      data.properties.model = this.model;
    }
    if (this.osVersion) {
      data.properties.os_version = this.osVersion;
    }

    const buffer = new Buffer(JSON.stringify(data)).toString("base64");

    return fetch(`${MIXPANEL_API_URL}/track/?data=${buffer}`);
  }

  _pushProfile(data: Record<string, any>) {
    const buffer = new Buffer(JSON.stringify(data)).toString("base64");
    return fetch(`${MIXPANEL_API_URL}/engage/?data=${buffer}`);
  }
}

export default ExpoMixpanelAnalytics;
